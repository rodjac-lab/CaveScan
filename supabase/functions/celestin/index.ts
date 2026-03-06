import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"

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
  return buildCelestinSystemPrompt()
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
