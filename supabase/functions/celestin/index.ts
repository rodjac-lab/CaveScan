import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { WINE_CODEX } from "./wine-codex.ts"

// === CONFIG ===
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const API_TIMEOUT_MS = 15_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

interface CaveBottle {
  id: string
  domaine: string | null
  appellation: string | null
  millesime: number | null
  couleur: string | null
  character: string | null
  cuvee: string | null
  quantity?: number
  volume?: string
  local_score?: number
}

interface RequestBody {
  message: string
  history: ConversationTurn[]
  cave: CaveBottle[]
  profile?: string
  memories?: string
  context?: {
    dayOfWeek: string
    season: string
    recentDrunk?: string[]
  }
}

type ResponseType = 'recommend' | 'add_wine' | 'log_tasting' | 'question' | 'conversation'

interface WineExtraction {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: 'rouge' | 'blanc' | 'rose' | 'bulles' | null
  region: string | null
  quantity: number
  volume: '0.375' | '0.75' | '1.5'
  grape_varieties?: string[] | null
  serving_temperature?: string | null
  typical_aromas?: string[] | null
  food_pairings?: string[] | null
  character?: string | null
}

interface RecommendationCard {
  bottle_id?: string
  name: string
  appellation: string
  badge: string
  reason: string
  color: 'rouge' | 'blanc' | 'rose' | 'bulles'
}

interface CelestinResponse {
  type: ResponseType
  text: string
  cards?: RecommendationCard[] | null
  extraction?: WineExtraction | null
  intent_hint?: 'add' | 'log' | null
}

// === UTILS ===

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

function parseAndValidate(raw: string): CelestinResponse {
  const jsonText = stripMarkdownCodeBlock(raw).replace(/[\r\n]/g, ' ')
  const data = JSON.parse(jsonText) as CelestinResponse
  if (!data.type || !data.text) {
    throw new Error('Invalid response: missing "type" or "text" field')
  }
  const validTypes: ResponseType[] = ['recommend', 'add_wine', 'log_tasting', 'question', 'conversation']
  if (!validTypes.includes(data.type)) {
    throw new Error(`Invalid response type: ${data.type}`)
  }
  return data
}

// === SYSTEM PROMPT ===

function buildSystemPrompt(): string {
  return `${WINE_CODEX}

# Tu es Celestin

Sommelier personnel et assistant cave. Tu tutoies l'utilisateur. Tu es chaleureux, passionne, enthousiaste mais concis. Tu as des opinions fortes et tu les justifies. Chaque recommandation a un "pitch" personnel en 1-2 phrases.

## Ce que tu sais faire

1. **RECOMMANDER** des vins (accord mets, style, surprise, "ce soir") → type "recommend"
2. **ENCAVER** (ajouter en cave) quand l'user dit qu'il a achete/recu/commande → type "add_wine"
3. **ENREGISTRER** une degustation quand l'user dit qu'il a bu/ouvert/deguste → type "log_tasting"
4. **REPONDRE** a des questions sur le vin (cepage, conservation, temperature...) → type "conversation"
5. **DEMANDER** des precisions si info manquante pour extraction → type "question"

## Regle d'or du routage — CRITIQUE

- En cas de DOUTE sur l'intention → TOUJOURS type "recommend"
- "Champagne" seul = l'user veut une recommandation, PAS encaver
- "J'ai achete du champagne" = encaver (verbe d'action "achete")
- "Recommande-moi du champagne" = recommander, meme si on etait en mode encaver avant
- Le VERBE D'ACTION determine l'intent, pas le nom du vin
- Si l'utilisateur change de sujet mid-conversation, SUIS LE NOUVEAU SUJET
- Ne reste JAMAIS coince dans un mode precedent

### Mots-cles encaver (type "add_wine")
achete, recu, commande, encaver, ajouter (en cave), arrive, livre, ramene, stocker, rentrer (du vin)

### Mots-cles degustation (type "log_tasting")
deguste, bu, ouvert, goute, "hier soir on a bu", "j'ai ouvert"

### Si aucun mot-cle d'action → type "recommend" ou "conversation"

## Regles ABSOLUES d'accords (ne JAMAIS enfreindre)
- JAMAIS de rouge tannique ou puissant avec du poisson. Les tanins rendent le poisson metallique.
- JAMAIS de rouge corse avec des fruits de mer, sushi, crustaces.
- Poisson = blanc sec, rose, ou rouge TRES leger (Pinot Noir leger, Beaujolais) uniquement.

## Regles de recommandation (type "recommend")
- Propose 3 a 5 vins maximum dans "cards"
- La liste cave est triee par scoring local (champ local_score): respecte cette priorite
- N'invente jamais une bouteille "de la cave" hors shortlist transmise
- PRIORITE aux vins DE LA CAVE (bottle_id renseigne)
- Mais ne propose un vin de la cave QUE s'il fait un bon accord. Un grand vin mal accorde est une mauvaise reco.
- Si pas de match en cave, propose des decouvertes (sans bottle_id)
- Utilise le profil de gout pour personnaliser
- Explore les "territoires adjacents" : si l'user aime le Bourgogne, ose un Jura
- Varie les badges : "De ta cave", "Decouverte", "Accord parfait", "Audacieux"
- Evite les vins bus recemment
- Cite des souvenirs de degustation quand pertinent (1-2 max)

## Regles d'extraction (types "add_wine" et "log_tasting")

### Vocabulaire volume
- "demi-bouteille", "demi", "37.5cl", "375ml" = "0.375"
- "bouteille", "btl", "75cl" (ou rien) = "0.75"
- "magnum", "mag", "1.5L" = "1.5"

### Couleur ABSOLUE
- Champagne, Cremant, Cava, Prosecco, methode traditionnelle, mousseux, petillant = TOUJOURS "bulles"
- Rose, clairet = "rose"
- Ne confonds JAMAIS effervescent avec blanc

### Infos critiques (demander si absentes → type "question")
- Le nom du vin ou du domaine (minimum domaine OU appellation)
- Quantite : si pas mentionnee, suppose 1
- Volume : si pas mentionne, suppose "0.75"

### Enrichissement automatique
- grape_varieties : cepages typiques
- serving_temperature : temperature conseillee
- typical_aromas : 3-5 aromes typiques
- food_pairings : 3-4 accords mets
- character : 1 phrase sur le style

## Format de sortie

Reponds UNIQUEMENT avec un JSON valide, sans texte avant ou apres.

Le champ "text" est TOUJOURS present :
- Court (1 phrase) quand des cards ou extraction suivent
- Plus developpe (2-4 phrases) pour conversation ou question

### Type "recommend" (recommandation)
{
  "type": "recommend",
  "text": "Pour du poulet roti, voici mes suggestions :",
  "cards": [
    { "bottle_id": "abc12345", "name": "Domaine X", "appellation": "App", "badge": "De ta cave", "reason": "Pitch 1-2 phrases", "color": "rouge" }
  ]
}

### Type "add_wine" (encaver)
{
  "type": "add_wine",
  "text": "6 bouteilles de Chateau Margaux 2018, bel achat !",
  "extraction": { "domaine": "Chateau Margaux", "cuvee": null, "appellation": "Margaux", "millesime": 2018, "couleur": "rouge", "region": "Bordeaux", "quantity": 6, "volume": "0.75", "grape_varieties": ["Cabernet Sauvignon", "Merlot"], "serving_temperature": "17-18°C", "typical_aromas": ["cassis", "cedre", "vanille"], "food_pairings": ["agneau", "fromages affines"], "character": "Grand vin puissant et elegant" }
}

### Type "log_tasting" (degustation)
{
  "type": "log_tasting",
  "text": "Belle degustation !",
  "extraction": { "domaine": "...", "cuvee": null, "appellation": "...", "millesime": null, "couleur": "rouge", "region": null, "quantity": 1, "volume": "0.75" }
}

### Type "question" (besoin de precisions)
{
  "type": "question",
  "text": "Quel vin as-tu achete ?",
  "intent_hint": "add"
}

### Type "conversation" (question/reponse vin, salutation, hors-sujet)
{
  "type": "conversation",
  "text": "Un cepage, c'est la variete de raisin..."
}

Valeurs badge : "De ta cave", "Decouverte", "Accord parfait", "Audacieux"
Valeurs color : "rouge", "blanc", "rose", "bulles"
Le champ bottle_id = ID tronque (8 char) d'une bouteille en cave. QUE pour les vins de la cave.
Le champ intent_hint = "add" ou "log", UNIQUEMENT pour type "question".`
}

// === USER PROMPT ===

function buildUserPrompt(body: RequestBody): string {
  const parts: string[] = []

  // Conversation history
  if (body.history.length > 0) {
    parts.push('Historique de conversation :')
    for (const turn of body.history) {
      parts.push(`${turn.role === 'user' ? 'Utilisateur' : 'Celestin'} : ${turn.text}`)
    }
    parts.push('')
  }

  // Current message
  if (body.message === '__prefetch__') {
    parts.push('Demande : suggestions personnalisees pour ce soir, pas de contrainte de plat.')
    parts.push('Pas d\'accord mets-vins a appliquer : priorise la pertinence contextuelle et la diversite.')
  } else {
    parts.push(`Message de l'utilisateur : ${body.message}`)
  }

  // Context
  if (body.context) {
    const ctx = body.context
    parts.push(`\nContexte : ${ctx.dayOfWeek}, ${ctx.season}.`)
    if (ctx.recentDrunk?.length) {
      parts.push(`Vins bus recemment (a eviter) : ${ctx.recentDrunk.join(', ')}`)
    }
  }

  // Profile
  if (body.profile) {
    parts.push(`\nProfil de gout :\n${body.profile}`)
  }

  // Memories
  if (body.memories) {
    parts.push(`\nSouvenirs de degustation :\n${body.memories}`)
    parts.push('Cite des souvenirs specifiques quand pertinent.')
  }

  // Cave
  if (body.cave.length > 0) {
    parts.push(`\nBouteilles en cave (${body.cave.length}) :`)
    for (const b of body.cave) {
      const label = [b.domaine, b.cuvee, b.appellation, b.millesime, b.couleur]
        .filter(Boolean)
        .join(' · ')
      const qty = b.quantity ?? 1
      const vol = b.volume === '0.375' ? 'demi' : b.volume === '1.5' ? 'magnum' : 'btl'
      const qtyStr = `${qty}× ${vol}`
      const extra = b.character ? ` — ${b.character}` : ''
      const localScore = typeof b.local_score === 'number' ? ` | score_local=${b.local_score}` : ''
      parts.push(`- [${b.id}] ${label} | ${qtyStr}${extra}${localScore}`)
    }
  } else {
    parts.push('\nCave vide — propose uniquement des decouvertes.')
  }

  return parts.join('\n')
}

// === GEMINI RESPONSE SCHEMA ===

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: {
      type: 'STRING',
      enum: ['recommend', 'add_wine', 'log_tasting', 'question', 'conversation'],
    },
    text: { type: 'STRING', description: 'Reponse conversationnelle, toujours present' },
    cards: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          bottle_id: { type: 'STRING', nullable: true },
          name: { type: 'STRING' },
          appellation: { type: 'STRING' },
          badge: { type: 'STRING' },
          reason: { type: 'STRING' },
          color: { type: 'STRING' },
        },
        required: ['name', 'appellation', 'badge', 'reason', 'color'],
      },
    },
    extraction: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        domaine: { type: 'STRING', nullable: true },
        cuvee: { type: 'STRING', nullable: true },
        appellation: { type: 'STRING', nullable: true },
        millesime: { type: 'INTEGER', nullable: true },
        couleur: { type: 'STRING', nullable: true },
        region: { type: 'STRING', nullable: true },
        quantity: { type: 'INTEGER' },
        volume: { type: 'STRING' },
        grape_varieties: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
        serving_temperature: { type: 'STRING', nullable: true },
        typical_aromas: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
        food_pairings: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
        character: { type: 'STRING', nullable: true },
      },
      required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
    },
    intent_hint: { type: 'STRING', nullable: true, enum: ['add', 'log'] },
  },
  required: ['type', 'text'],
}

// === PROVIDERS ===

function extractErrorMessage(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText)
    return parsed.error?.message || errorText
  } catch {
    return errorText
  }
}

function buildGeminiContents(history: ConversationTurn[], message: string): Array<{ role: string; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = history.map((turn) => ({
    role: turn.role === 'user' ? 'user' : 'model',
    parts: [{ text: turn.text }],
  }))
  contents.push({ role: 'user', parts: [{ text: message }] })
  return contents
}

function buildClaudeMessages(history: ConversationTurn[], message: string): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = history.map((turn) => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: turn.text,
  }))
  messages.push({ role: 'user', content: message })
  return messages
}

async function callGemini(systemPrompt: string, userPrompt: string, history: ConversationTurn[]): Promise<CelestinResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  // For multi-turn, use history. For single-turn (prefetch), just send user prompt.
  const contents = history.length > 0
    ? buildGeminiContents(history, userPrompt)
    : [{ role: 'user', parts: [{ text: userPrompt }] }]

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini 2.5 Flash (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  return parseAndValidate(text)
}

async function callClaude(systemPrompt: string, userPrompt: string, history: ConversationTurn[]): Promise<CelestinResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages = history.length > 0
    ? buildClaudeMessages(history, userPrompt)
    : [{ role: 'user', content: userPrompt }]

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  return parseAndValidate(textContent.text)
}

// === FALLBACK ===

async function celestinWithFallback(systemPrompt: string, userPrompt: string, history: ConversationTurn[]): Promise<{ provider: string; response: CelestinResponse }> {
  const providers: Array<{ name: string; call: () => Promise<CelestinResponse> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[celestin] Trying ${provider.name}...`)
      const response = await provider.call()
      console.log(`[celestin] ${provider.name} succeeded: type=${response.type}`)
      return { provider: provider.name, response }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[celestin] ${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}

// === MAIN HANDLER ===

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body: RequestBody = await req.json()
    console.log(`[celestin] message="${body.message.slice(0, 80)}" history=${body.history.length} cave=${body.cave.length}`)

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(body)

    const { provider, response } = await celestinWithFallback(systemPrompt, userPrompt, body.history)
    console.log(`[celestin] Done by ${provider}: type=${response.type}`)

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[celestin] Error:', message)

    return new Response(
      JSON.stringify({
        type: 'conversation',
        text: "Desole, je suis momentanement indisponible. Reessaie dans quelques instants !",
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
