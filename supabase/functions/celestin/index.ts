import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"

// === CONFIG ===
const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const MISTRAL_MODEL = 'mistral-small-latest'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const OPENAI_MODEL = 'gpt-4.1-mini'
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
  image?: string // base64 image from that turn
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
  questionnaireProfile?: string
  memories?: string
  previousSession?: string
  provider?: string // "claude" | "gemini" | "mistral" — force a specific provider (for eval)
  image?: string // base64-encoded image (JPEG or PNG)
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

function detectMediaType(base64: string): 'image/jpeg' | 'image/png' {
  return base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
}

// === SYSTEM PROMPT ===

function buildSystemPrompt(): string {
  return buildCelestinSystemPrompt()
}

// === CONTEXT BLOCK (appended to system prompt, semi-static per session) ===

function buildContextBlock(body: RequestBody): string {
  const parts: string[] = []

  // Profile
  if (body.profile) {
    parts.push(`Profil de gout :\n${body.profile}`)
  }

  // Questionnaire profile (FWI + sensory preferences)
  if (body.questionnaireProfile) {
    parts.push(body.questionnaireProfile)
  }

  // Memories
  if (body.memories) {
    parts.push(`Souvenirs de degustation :\n${body.memories}`)
    parts.push('Cite des souvenirs specifiques quand pertinent.')
  }

  // Previous sessions (cross-session memory)
  if (body.previousSession) {
    parts.push(body.previousSession)
    parts.push('Tu peux faire reference a ces conversations precedentes si c\'est pertinent, mais ne force pas. Les plus recentes sont les plus importantes.')
  }

  // Storage zones
  const zones = (body as Record<string, unknown>).zones as string[] | undefined
  if (zones && zones.length > 0) {
    parts.push(`Zones de stockage disponibles : ${zones.join(', ')}`)
  }

  // Cave
  if (body.cave.length > 0) {
    parts.push(`Bouteilles en cave (${body.cave.length}) :`)
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
    parts.push('Cave vide — propose uniquement des decouvertes.')
  }

  return parts.join('\n\n')
}

// === INTENT CLASSIFIER (code-side, no LLM call) ===

type MessageIntent = 'greeting' | 'prefetch' | 'conversation' | 'recommendation' | 'unknown'

function classifyIntent(message: string, hasImage: boolean): MessageIntent {
  if (message === '__greeting__') return 'greeting'
  if (message === '__prefetch__') return 'prefetch'

  const lower = message.toLowerCase().trim()

  // Explicit recommendation triggers (checked first — strongest signal)
  const RECOMMENDATION_PATTERNS = [
    /\b(que? boire|recommande|propose|ce soir|pour accompagner|ouvre[- ]moi|quel vin|avec (ce|le|du|des|mon|ma|mes|un|une)|accord|accords mets)/i,
    /\b(pour aller avec|pour manger|pour diner|pour le repas)/i,
    /\b(en blanc|en rouge|en ros[ée]|en bulles|un blanc|un rouge|une bulle|autre chose|une autre|plutot un|sinon)\b/i, // Refinements of a previous recommendation
  ]

  // Short acknowledgments / thanks / refusals — clearly conversational
  const CONVERSATION_PATTERNS = [
    /^(merci|super|ok|d'accord|parfait|g[eé]nial|cool|top|nice|bien|bonne id[eé]e|ah ok|je vois|compris|entendu|c'est bon|non merci|pas pour moi|[cç]a ira|bof|mouais|haha|mdr|lol)[.! ]*$/i,
    /^(oui|non|pourquoi|comment|quoi|c'est quoi|qu'est-ce que?|est-ce que|tu (aimes?|connais|pref[eè]res|penses|sais|crois)|parle[- ]moi|explique|raconte|dis[- ]moi)/i,
  ]

  if (hasImage) return 'unknown' // Let the LLM decide for images

  for (const pattern of RECOMMENDATION_PATTERNS) {
    if (pattern.test(lower)) return 'recommendation'
  }

  for (const pattern of CONVERSATION_PATTERNS) {
    if (pattern.test(lower)) return 'conversation'
  }

  // Short messages (< 20 chars) without recommendation keywords are likely conversational
  if (lower.length < 20) return 'conversation'

  return 'unknown'
}

// === USER PROMPT (lightweight: current message + minimal dynamic context) ===

function buildUserPrompt(body: RequestBody): string {
  const parts: string[] = []
  const intent = classifyIntent(body.message, !!body.image)

  // Current message
  if (intent === 'greeting') {
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
  } else if (intent === 'prefetch') {
    parts.push('Demande : suggestions personnalisees pour ce soir, pas de contrainte de plat.')
    parts.push('Pas d\'accord mets-vins a appliquer : priorise la pertinence contextuelle et la diversite.')
  } else if (intent === 'conversation') {
    // Strong hint: this is NOT a recommendation request
    parts.push(`[CONVERSATION — PAS de ui_action. Reponds BRIEVEMENT (1-2 phrases max) + action_chips. Ne recommande aucun vin.]`)
    parts.push(body.message)
  } else {
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  // Dynamic context (changes between turns)
  if (body.context) {
    const ctx = body.context
    parts.push(`\nContexte : ${ctx.dayOfWeek}, ${ctx.season}.`)
    if (ctx.recentDrunk?.length) {
      parts.push(`Vins bus recemment (a eviter) : ${ctx.recentDrunk.join(', ')}`)
    }
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
                zone_name: { type: 'STRING', nullable: true, description: 'Nom de la zone de stockage choisie par l utilisateur' },
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

// deno-lint-ignore no-explicit-any
function buildGeminiContents(history: ConversationTurn[], message: string, image?: string): Array<{ role: string; parts: any[] }> {
  // deno-lint-ignore no-explicit-any
  const contents: Array<{ role: string; parts: any[] }> = history.map((turn) => {
    // deno-lint-ignore no-explicit-any
    const parts: any[] = []
    if (turn.image && turn.role === 'user') {
      parts.push({ inline_data: { mime_type: detectMediaType(turn.image), data: turn.image } })
    }
    parts.push({ text: turn.text })
    return { role: turn.role === 'user' ? 'user' : 'model', parts }
  })
  // deno-lint-ignore no-explicit-any
  const userParts: any[] = []
  if (image) {
    userParts.push({ inline_data: { mime_type: detectMediaType(image), data: image } })
  }
  userParts.push({ text: message })
  contents.push({ role: 'user', parts: userParts })
  return contents
}

// deno-lint-ignore no-explicit-any
function buildClaudeMessages(history: ConversationTurn[], message: string, image?: string): Array<{ role: string; content: any }> {
  // deno-lint-ignore no-explicit-any
  const messages: Array<{ role: string; content: any }> = history.map((turn) => {
    if (turn.image && turn.role === 'user') {
      return {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(turn.image), data: turn.image } },
          { type: 'text', text: turn.text },
        ],
      }
    }
    return { role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text }
  })
  if (image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: detectMediaType(image), data: image } },
        { type: 'text', text: message },
      ],
    })
  } else {
    messages.push({ role: 'user', content: message })
  }
  return messages
}

async function callGemini(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  // For multi-turn, use history. For single-turn (prefetch), just send user prompt.
  const contents = history.length > 0
    ? buildGeminiContents(history, userPrompt, image)
    : image
      ? [{ role: 'user', parts: [{ inline_data: { mime_type: detectMediaType(image), data: image } }, { text: userPrompt }] }]
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
        thinkingConfig: { thinkingBudget: image ? 1024 : 0 },
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

async function callMistral(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY not configured')

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const turn of history) {
    messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text })
  }
  // Mistral has no vision — add a note if image was provided
  const finalPrompt = image
    ? userPrompt + "\n\n(L'utilisateur a envoye une photo mais je ne peux pas la voir. Reponds en te basant uniquement sur le texte.)"
    : userPrompt
  messages.push({ role: 'user', content: finalPrompt })

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

async function callClaude(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages = history.length > 0
    ? buildClaudeMessages(history, userPrompt, image)
    : image
      ? [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(image), data: image } },
          { type: 'text', text: userPrompt },
        ] }]
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

// OpenAI Structured Outputs schema (JSON Schema format)
const OPENAI_RESPONSE_SCHEMA = {
  name: 'celestin_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Reponse conversationnelle, toujours presente' },
      ui_action: {
        type: ['object', 'null'],
        properties: {
          kind: {
            type: 'string',
            enum: ['show_recommendations', 'prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
          },
          payload: {
            type: 'object',
            properties: {
              cards: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    bottle_id: { type: ['string', 'null'] },
                    name: { type: 'string' },
                    appellation: { type: 'string' },
                    millesime: { type: ['integer', 'null'] },
                    badge: { type: 'string' },
                    reason: { type: 'string' },
                    color: { type: 'string' },
                  },
                  required: ['name', 'appellation', 'badge', 'reason', 'color', 'bottle_id', 'millesime'],
                  additionalProperties: false,
                },
              },
              extraction: {
                type: ['object', 'null'],
                properties: {
                  domaine: { type: ['string', 'null'] },
                  cuvee: { type: ['string', 'null'] },
                  appellation: { type: ['string', 'null'] },
                  millesime: { type: ['integer', 'null'] },
                  couleur: { type: ['string', 'null'] },
                  region: { type: ['string', 'null'] },
                  quantity: { type: 'integer' },
                  volume: { type: 'string' },
                },
                required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
                additionalProperties: false,
              },
              extractions: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    domaine: { type: ['string', 'null'] },
                    cuvee: { type: ['string', 'null'] },
                    appellation: { type: ['string', 'null'] },
                    millesime: { type: ['integer', 'null'] },
                    couleur: { type: ['string', 'null'] },
                    region: { type: ['string', 'null'] },
                    quantity: { type: 'integer' },
                    volume: { type: 'string' },
                  },
                  required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
                  additionalProperties: false,
                },
              },
            },
            required: ['cards', 'extraction', 'extractions'],
            additionalProperties: false,
          },
        },
        required: ['kind', 'payload'],
        additionalProperties: false,
      },
      action_chips: {
        type: ['array', 'null'],
        items: { type: 'string' },
      },
    },
    required: ['message', 'ui_action', 'action_chips'],
    additionalProperties: false,
  },
}

async function callOpenAI(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  // deno-lint-ignore no-explicit-any
  const messages: Array<{ role: string; content: any }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const turn of history) {
    if (turn.image && turn.role === 'user') {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${detectMediaType(turn.image)};base64,${turn.image}` } },
          { type: 'text', text: turn.text },
        ],
      })
    } else {
      messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text })
    }
  }
  if (image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${detectMediaType(image)};base64,${image}` } },
        { type: 'text', text: userPrompt },
      ],
    })
  } else {
    messages.push({ role: 'user', content: userPrompt })
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 4096,
      temperature: 0.5,
      response_format: { type: 'json_schema', json_schema: OPENAI_RESPONSE_SCHEMA },
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI ${OPENAI_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error('No text response from OpenAI')

  return parseAndValidate(text)
}

// === FALLBACK ===

async function celestinWithFallback(systemPrompt: string, userPrompt: string, history: ConversationTurn[], forcedProvider?: string, image?: string): Promise<{ provider: string; response: CelestinResponse }> {
  // If a specific provider is forced (eval mode), call only that one
  if (forcedProvider) {
    const providerMap: Record<string, { name: string; call: () => Promise<CelestinResponse> }> = {
      claude: { name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history, image) },
      gemini: { name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) },
      mistral: { name: 'Mistral', call: () => callMistral(systemPrompt, userPrompt, history, image) },
      openai: { name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) },
    }
    const selected = providerMap[forcedProvider.toLowerCase()]
    if (!selected) throw new Error(`Unknown provider: ${forcedProvider}`)
    console.log(`[celestin] Forced provider: ${selected.name}`)
    const response = await selected.call()
    return { provider: selected.name, response }
  }

  const providers: Array<{ name: string; call: () => Promise<CelestinResponse> }> = []

  if (OPENAI_API_KEY) providers.push({ name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history, image) })
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) })

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

  let forcedProvider: string | undefined
  try {
    const body: RequestBody = await req.json()
    forcedProvider = body.provider
    const intent = classifyIntent(body.message, !!body.image)
    console.log(`[celestin] message="${body.message.slice(0, 80)}" intent=${intent} history=${body.history.length} cave=${body.cave.length} image=${body.image ? `${body.image.length} chars` : 'none'}`)

    const contextBlock = buildContextBlock(body)
    const systemPrompt = buildSystemPrompt() + '\n\n--- CONTEXTE UTILISATEUR ---\n\n' + contextBlock
    const userPrompt = buildUserPrompt(body)

    const { provider, response } = await celestinWithFallback(systemPrompt, userPrompt, body.history, body.provider, body.image)
    console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'} msg="${response.message.slice(0, 200)}"`)


    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[celestin] Error:', message)

    // In eval mode (forced provider), return the actual error for debugging
    const errorMessage = forcedProvider
      ? `[${forcedProvider}] ${message}`
      : "Desole, je suis momentanement indisponible. Reessaie dans quelques instants !"

    return new Response(
      JSON.stringify({
        message: errorMessage,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
