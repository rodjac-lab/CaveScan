import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"

// === CONFIG ===
const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const MISTRAL_MODEL = 'mistral-small-latest'
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
  previousSession?: string
  context?: {
    dayOfWeek: string
    season: string
    recentDrunk?: string[]
  }
}

type UiActionKind = 'show_recommendations' | 'prepare_add_wine' | 'prepare_add_wines' | 'prepare_log_tasting'

interface WineExtraction {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: 'rouge' | 'blanc' | 'rose' | 'bulles' | null
  country: string | null
  region: string | null
  quantity: number
  volume: '0.375' | '0.75' | '1.5'
  grape_varieties?: string[] | null
  serving_temperature?: string | null
  typical_aromas?: string[] | null
  food_pairings?: string[] | null
  character?: string | null
  purchase_price?: number | null
}

interface RecommendationCard {
  bottle_id?: string
  name: string
  appellation: string
  millesime?: number | null
  badge: string
  reason: string
  color: 'rouge' | 'blanc' | 'rose' | 'bulles'
}

type CelestinUiAction =
  | { kind: 'show_recommendations'; payload: { cards: RecommendationCard[] } }
  | { kind: 'prepare_add_wine'; payload: { extraction: WineExtraction } }
  | { kind: 'prepare_add_wines'; payload: { extractions: WineExtraction[] } }
  | { kind: 'prepare_log_tasting'; payload: { extraction: WineExtraction } }

interface CelestinResponse {
  message: string
  ui_action?: CelestinUiAction | null
  action_chips?: string[] | null
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
  if (!data.message) {
    throw new Error('Invalid response: missing "message" field')
  }
  const validUiActions: UiActionKind[] = ['show_recommendations', 'prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting']
  if (data.ui_action) {
    if (!validUiActions.includes(data.ui_action.kind)) {
      throw new Error(`Invalid ui_action kind: ${data.ui_action.kind}`)
    }
    if (data.ui_action.kind === 'show_recommendations' && (!data.ui_action.payload?.cards || data.ui_action.payload.cards.length === 0)) {
      throw new Error('Invalid ui_action: show_recommendations requires cards')
    }
    if ((data.ui_action.kind === 'prepare_add_wine' || data.ui_action.kind === 'prepare_log_tasting') && !data.ui_action.payload?.extraction) {
      throw new Error(`Invalid ui_action: ${data.ui_action.kind} requires extraction`)
    }
    if (data.ui_action.kind === 'prepare_add_wines' && (!data.ui_action.payload?.extractions || data.ui_action.payload.extractions.length === 0)) {
      throw new Error('Invalid ui_action: prepare_add_wines requires extractions array')
    }
  }
  // Pass through action_chips (optional, no validation needed)
  if (data.action_chips && !Array.isArray(data.action_chips)) {
    data.action_chips = null
  }
  return data
}

// === SYSTEM PROMPT ===

function buildSystemPrompt(): string {
  return buildCelestinSystemPrompt()
}

// === USER PROMPT ===

function buildUserPrompt(body: RequestBody): string {
  const parts: string[] = []

  // Conversation history
  if (body.history.length > 0) {
    parts.push("Historique conversationnel : il peut contenir des hypotheses, raccourcis ou erreurs de Celestin. Ne l'utilise jamais comme preuve sur la cave, les gouts, les souvenirs ou les accords de l'utilisateur. En cas de conflit, les donnees structurees et les corrections de l'utilisateur priment toujours.")
    parts.push('Historique de conversation :')
    for (const turn of body.history) {
      parts.push(`${turn.role === 'user' ? 'Utilisateur' : 'Celestin'} : ${turn.text}`)
    }
    parts.push('')
  }

  // Current message
  if (body.message === '__greeting__') {
    parts.push('DEMANDE SPECIALE : message d\'accueil a l\'ouverture de l\'app.')
    parts.push('1 phrase. Pas de ui_action. Inclus 2-3 action_chips.')
    parts.push('')
    parts.push('Le ton : comme un ami sommelier qui t\'accueille. Subtil, jamais vendeur.')
    parts.push('Inspire-toi du moment (heure, saison) et glisse une touche personnelle.')
    parts.push('Ne cite JAMAIS un vin par son nom. Ne dis pas "Salut l\'ami".')
    parts.push('')
    parts.push('Exemples du ton juste :')
    parts.push('- (8h, printemps) "Le printemps s\'installe, c\'est la saison ou les blancs reprennent du service."')
    parts.push('- (12h) "Tu as prevu quelque chose de bon ce midi ?"')
    parts.push('- (18h, vendredi) "Vendredi soir, la cave t\'attend."')
    parts.push('- (20h, hiver) "Soiree d\'hiver, il fait bon ouvrir quelque chose de reconfortant."')
    parts.push('- (apres longue absence) "Ca faisait un moment ! Ta cave n\'a pas bouge."')
    if ((body as Record<string, unknown>).greetingContext) {
      const gc = (body as Record<string, unknown>).greetingContext as Record<string, unknown>
      parts.push(`\nContexte : ${gc.hour}h, ${gc.season ?? ''}, cave de ${gc.caveSize} bouteilles.`)
      if (gc.lastActivity) parts.push(`${gc.lastActivity}`)
    }
    return parts.join('\n')
  } else if (body.message === '__prefetch__') {
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

  // Previous sessions (cross-session memory)
  if (body.previousSession) {
    parts.push(`\n${body.previousSession}`)
    parts.push('Tu peux faire reference a ces conversations precedentes si c\'est pertinent, mais ne force pas. Les plus recentes sont les plus importantes.')
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
    message: { type: 'STRING', description: 'Reponse conversationnelle, toujours presente' },
    ui_action: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        kind: {
          type: 'STRING',
          enum: ['show_recommendations', 'prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
        },
        payload: {
          type: 'OBJECT',
          properties: {
            cards: {
              type: 'ARRAY',
              nullable: true,
              items: {
                type: 'OBJECT',
                properties: {
                  bottle_id: { type: 'STRING', nullable: true },
                  name: { type: 'STRING' },
                  appellation: { type: 'STRING' },
                  millesime: { type: 'INTEGER', nullable: true },
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
                purchase_price: { type: 'NUMBER', nullable: true },
                drink_from: { type: 'INTEGER', nullable: true, description: 'Annee a partir de laquelle boire' },
                drink_until: { type: 'INTEGER', nullable: true, description: 'Annee limite pour boire' },
              },
              required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
            },
            extractions: {
              type: 'ARRAY',
              nullable: true,
              description: 'Tableau d\'extractions pour ajout batch (prepare_add_wines)',
              items: {
                type: 'OBJECT',
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
                  purchase_price: { type: 'NUMBER', nullable: true },
                  drink_from: { type: 'INTEGER', nullable: true, description: 'Annee a partir de laquelle boire' },
                  drink_until: { type: 'INTEGER', nullable: true, description: 'Annee limite pour boire' },
                },
                required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
              },
            },
          },
          required: [],
        },
      },
      required: ['kind', 'payload'],
    },
    action_chips: {
      type: 'ARRAY',
      nullable: true,
      description: '2-3 suggestions contextuelles courtes pour relancer la conversation',
      items: { type: 'STRING' },
    },
  },
  required: ['message'],
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

async function callMistral(systemPrompt: string, userPrompt: string, history: ConversationTurn[]): Promise<CelestinResponse> {
  if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY not configured')

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const turn of history) {
    messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text })
  }
  messages.push({ role: 'user', content: userPrompt })

  const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      max_tokens: 4096,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Mistral ${MISTRAL_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error('No text response from Mistral')

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

  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history) })
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history) })
  if (MISTRAL_API_KEY) providers.push({ name: 'Mistral', call: () => callMistral(systemPrompt, userPrompt, history) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[celestin] Trying ${provider.name}...`)
      const response = await provider.call()
      console.log(`[celestin] ${provider.name} succeeded: ui_action=${response.ui_action?.kind ?? 'none'}`)
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
    console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'}`)

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[celestin] Error:', message)

    return new Response(
      JSON.stringify({
        message: "Desole, je suis momentanement indisponible. Reessaie dans quelques instants !",
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
