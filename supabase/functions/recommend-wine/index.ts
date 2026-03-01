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

interface CaveBottle {
  id: string
  domaine: string | null
  appellation: string | null
  millesime: number | null
  couleur: string | null
  character: string | null
  cuvee: string | null
  local_score?: number
}

interface RequestBody {
  mode: 'generic' | 'food' | 'wine' | 'surprise'
  query?: string
  profile: string
  cave: CaveBottle[]
  memories?: string
  context?: {
    dayOfWeek: string
    season: string
    recentDrunk?: string[]
  }
}

interface RecommendationCard {
  bottle_id?: string
  name: string
  appellation: string
  badge: string
  reason: string
  color: 'rouge' | 'blanc' | 'rose' | 'bulles'
}

interface ProviderResult {
  provider: string
  cards: RecommendationCard[]
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

function parseAndValidate(text: string): RecommendationCard[] {
  const jsonText = stripMarkdownCodeBlock(text)
  const data = JSON.parse(jsonText) as { cards: RecommendationCard[] }
  if (!data.cards || !Array.isArray(data.cards)) {
    throw new Error('Invalid response structure: missing cards array')
  }
  return data.cards
}

// === PROMPT BUILDERS ===

function buildSystemPrompt(): string {
  return `${WINE_CODEX}

# Instructions

Tu es le sommelier personnel de l'utilisateur. Tu as du caractère, des opinions tranchées, et tu ne fais JAMAIS de recommandations génériques.

## Personnalité
- Tu tutoies l'utilisateur
- Tu es passionné, parfois enthousiaste, jamais condescendant
- Tu as des opinions fortes mais tu sais les justifier
- Tu fais des références culturelles (cinéma, musique, saisons) pour rendre tes pitchs vivants
- Chaque recommandation a un "pitch" personnel en 1-2 phrases, comme une mini-critique Netflix

## Règles ABSOLUES d'accords (ne JAMAIS enfreindre)
- JAMAIS de rouge tannique ou puissant avec du poisson. C'est rédhibitoire. Les tanins rendent le poisson métallique.
- JAMAIS de rouge corsé avec des fruits de mer, sushi, crustacés.
- Poisson = blanc sec, rosé, ou rouge TRÈS léger (Pinot Noir léger, Beaujolais) uniquement.
- Respecte TOUJOURS la logique du Wine Codex ci-dessus pour les accords mets-vins.

## Règles de recommandation
- Propose 3 à 5 vins maximum
- La liste des bouteilles de cave est déjà triée par scoring local (champ local_score): respecte cette priorité.
- N'invente jamais une autre bouteille "de la cave" hors shortlist transmise.
- PRIORITÉ aux vins DE LA CAVE de l'utilisateur (bottle_id renseigné)
- Mais ne propose un vin de la cave QUE s'il fait un bon accord avec le plat demandé. Un grand vin mal accordé est une mauvaise recommandation.
- Si la cave ne contient pas de match parfait, propose des découvertes (sans bottle_id)
- Utilise le profil de goût pour personnaliser : si l'utilisateur préfère le rouge, ne lui propose pas que du blanc
- Explore les "territoires adjacents" : si l'utilisateur aime le Bourgogne, ose un Jura ou un Oregon Pinot
- Varie les badges entre les cartes : "De ta cave", "Découverte", "Accord parfait", "Audacieux"
- Si l'utilisateur a bu récemment certains vins, évite de les re-proposer

## Souvenirs de dégustation
- Si des souvenirs de dégustation sont fournis, cite-les naturellement dans tes pitchs (1-2 max)
- Ex: "Tu avais adoré ce Chianti sur des spaghetti à Rome — ce Sangiovese va dans la même veine"
- Fais le lien entre le souvenir et la recommandation actuelle
- Ne force pas : cite un souvenir seulement quand c'est pertinent avec la demande
- IMPORTANT : si un souvenir est très pertinent avec la demande (même plat, même style), propose le vin du souvenir en Découverte même s'il n'est pas en cave. Le souvenir prouve que l'utilisateur a aimé ce vin dans ce contexte — c'est une recommandation forte.

## Format de sortie
Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après :
{
  "cards": [
    {
      "bottle_id": "abc12345",
      "name": "Domaine X Cuvée Y",
      "appellation": "Appellation",
      "badge": "De ta cave",
      "reason": "Pitch personnalisé en 1-2 phrases",
      "color": "rouge"
    }
  ]
}

Valeurs possibles pour badge : "De ta cave", "Découverte", "Accord parfait", "Audacieux"
Valeurs possibles pour color : "rouge", "blanc", "rose", "bulles"
Le champ bottle_id est l'ID tronqué d'une bouteille de la cave (8 caractères). Ne le mets QUE pour les vins qui sont dans la cave.`
}

function buildUserPrompt(body: RequestBody): string {
  const parts: string[] = []

  if (body.mode === 'generic') {
    parts.push(`Mode : "Ce soir (générique)"`)
    parts.push(`Aucune contrainte explicite de plat ou de style. Propose des suggestions personnalisées pour ce soir en tenant compte du contexte (jour/saison), du profil et de la cave.`)
    parts.push(`Dans ce mode, n'applique pas d'accord mets-vins strict absent d'entrée: priorise la pertinence contextuelle et la diversité contrôlée.`)
  } else if (body.mode === 'food') {
    parts.push(`Mode : "Ce soir je mange..."`)
    if (body.query) {
      parts.push(`Plat/ingrédient : ${body.query}`)
    } else {
      parts.push(`Pas de plat spécifié — propose des suggestions personnalisées pour ce soir.`)
    }
  } else if (body.mode === 'wine') {
    parts.push(`Mode : "Ce soir je bois..."`)
    if (body.query) {
      parts.push(`Style/type demandé : ${body.query}`)
    } else {
      parts.push(`Pas de style spécifié — propose des suggestions personnalisées pour ce soir.`)
    }
  } else {
    parts.push(`Mode : Surprise ! Propose quelque chose d'inattendu et personnalisé.`)
  }

  if (body.context) {
    const ctx = body.context
    parts.push(`\nContexte : ${ctx.dayOfWeek}, ${ctx.season}.`)
    if (ctx.recentDrunk?.length) {
      parts.push(`Vins bus récemment (à éviter) : ${ctx.recentDrunk.join(', ')}`)
    }
  }

  if (body.profile) {
    parts.push(`\nProfil de goût :\n${body.profile}`)
  }

  if (body.memories) {
    parts.push(`\nSouvenirs de dégustation de l'utilisateur :\n${body.memories}`)
    parts.push(`Cite des souvenirs spécifiques quand c'est pertinent.`)
  }

  if (body.cave.length > 0) {
    parts.push(`\nBouteilles en cave (${body.cave.length}) :`)
    for (const b of body.cave) {
      const label = [b.domaine, b.cuvee, b.appellation, b.millesime, b.couleur]
        .filter(Boolean)
        .join(' · ')
      const extra = b.character ? ` — ${b.character}` : ''
      const localScore = typeof b.local_score === 'number' ? ` | score_local=${b.local_score}` : ''
      parts.push(`- [${b.id}] ${label}${extra}${localScore}`)
    }
  } else {
    parts.push(`\nCave vide — propose uniquement des découvertes.`)
  }

  return parts.join('\n')
}

// === PROVIDERS ===

async function callGemini(systemPrompt: string, userPrompt: string): Promise<ProviderResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`Gemini 2.0 Flash (${response.status}): ${message}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  const cards = parseAndValidate(text)
  return { provider: 'gemini/2.0-flash', cards }
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<ProviderResult> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${message}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  const cards = parseAndValidate(textContent.text)
  return { provider: `claude/${CLAUDE_MODEL}`, cards }
}

// === FALLBACK ===

async function recommendWithFallback(systemPrompt: string, userPrompt: string): Promise<ProviderResult> {
  // Gemini primary, Claude fallback
  const providers: Array<{ name: string; call: () => Promise<ProviderResult> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(systemPrompt, userPrompt) })

  if (providers.length === 0) {
    throw new Error('No API keys configured. Set GEMINI_API_KEY and/or ANTHROPIC_API_KEY.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[recommend-wine] Trying ${provider.name}...`)
      const result = await provider.call()
      console.log(`[recommend-wine] ${provider.name} succeeded: ${result.cards.length} cards`)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[recommend-wine] ${provider.name} failed: ${message}`)
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
    console.log(`[recommend-wine] mode=${body.mode} query="${body.query ?? ''}" cave=${body.cave.length} bottles`)

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(body)

    const { provider, cards } = await recommendWithFallback(systemPrompt, userPrompt)
    console.log(`[recommend-wine] Done by ${provider}`)

    return new Response(JSON.stringify({ cards }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[recommend-wine] Error:', message)

    const userMessage = message.includes('Unexpected token') || message.includes('JSON')
      ? 'Le sommelier est momentanément indisponible.'
      : message

    return new Response(
      JSON.stringify({ error: userMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
