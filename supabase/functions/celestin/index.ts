import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"
import { interpretTurn, type TurnInterpretation, type CognitiveMode } from "./turn-interpreter.ts"
import { computeNextState, INITIAL_STATE, type ConversationState } from "./conversation-state.ts"

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
  memories?: string
  memoryEvidenceMode?: 'exact' | 'synthesis'
  provider?: string // "claude" | "gemini" | "mistral" — force a specific provider (for eval)
  image?: string // base64-encoded image (JPEG or PNG)
  conversationState?: ConversationState // sent by frontend, tracks dialogue phase
  compiledProfileMarkdown?: string
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

type GeminiTextPart = { text: string }
type GeminiInlineDataPart = { inline_data: { mime_type: string; data: string } }
type GeminiPart = GeminiTextPart | GeminiInlineDataPart
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

type ClaudeTextContent = { type: 'text'; text: string }
type ClaudeImageContent = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
type ClaudeContent = string | Array<ClaudeTextContent | ClaudeImageContent>
type ClaudeMessage = { role: 'user' | 'assistant'; content: ClaudeContent }

type OpenAITextContent = { type: 'text'; text: string }
type OpenAIImageContent = { type: 'image_url'; image_url: { url: string } }
type OpenAIMessage = { role: 'system' | 'user' | 'assistant'; content: string | Array<OpenAITextContent | OpenAIImageContent> }

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

function normalizeForRouting(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// === RESPONSE POLICY (post-generation guard) ===

function stripFillerOpener(message: string): string {
  const cleaned = message.replace(/^(Ah[,! ] *|Oh[,! ] *|Tiens[,! ] *|Absolument[,! ] *|Excellente question[,! ] *)/i, '')
  if (cleaned !== message) {
    console.log(`[celestin] Policy: stripped filler opener`)
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
  return message
}

function neutralizeUnknownCategoryValidation(message: string): string {
  return message
    .replace(/\bcette appellation\b/gi, 'ce nom')
    .replace(/\bce domaine\b/gi, 'ce nom')
    .replace(/\bce cepage\b/gi, 'ce nom')
    .replace(/\bce cépage\b/gi, 'ce nom')
    .replace(/\bce terroir\b/gi, 'ce nom')
}

function extractPreviousRecommendationAnchor(history: RequestBody['history']): string | null {
  const previousUserTurn = [...history].reverse().find((turn) => turn.role === 'user')
  const text = previousUserTurn?.text?.trim()
  if (!text) return null

  const patterns = [
    /^(?:ce soir c['’]?est|ce soir c est)\s+(.+)$/i,
    /^(?:pour|avec)\s+(.+)$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }

  return null
}

function stripPreviousAnchor(message: string, anchor: string): string {
  if (!anchor) return message

  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`\\bavec\\s+(?:le|la|les|l['’])?\\s*${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\bpour\\s+(?:le|la|les|l['’])?\\s*${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\bdu\\s+${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\bde\\s+${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\b${escapedAnchor}\\b`, 'gi'),
  ]

  let cleaned = message
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  cleaned = cleaned
    .replace(/\s+,/g, ',')
    .replace(/\s+!/g, '!')
    .replace(/\s+\?/g, '?')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ', ')
    .replace(/^,\s*/g, '')
    .trim()

  if (!cleaned) return message
  return cleaned
}

function applyResponsePolicy(
  response: CelestinResponse,
  body: RequestBody,
  state: ConversationState,
  interpretation: TurnInterpretation,
  lastAssistantText?: string,
  messageLength?: number,
): CelestinResponse {
  const result = { ...response }

  // Strip filler words at start of message (model-agnostic cleanup, always applied)
  if (result.message) {
    result.message = stripFillerOpener(result.message)
  }

  if (
    result.message
    && interpretation.cognitiveMode === 'wine_conversation'
    && /(appellation|domaine|cepage|cépage|terroir)/i.test(body.message)
    && /\bje ne (?:connais|reconnais) pas\b/i.test(result.message)
  ) {
    result.message = neutralizeUnknownCategoryValidation(result.message)
  }

  if (
    result.message
    && interpretation.turnType === 'context_switch'
    && interpretation.cognitiveMode === 'wine_conversation'
    && state.taskType === 'recommendation'
  ) {
    const previousAnchor = extractPreviousRecommendationAnchor(body.history)
    if (previousAnchor && !body.message.toLowerCase().includes(previousAnchor.toLowerCase())) {
      result.message = stripPreviousAnchor(result.message, previousAnchor)
      if (result.ui_action?.kind === 'show_recommendations') {
        result.ui_action.payload.cards = (result.ui_action.payload.cards ?? []).map((card) => ({
          ...card,
          reason: card.reason ? stripPreviousAnchor(card.reason, previousAnchor) : card.reason,
        }))
      }
    }
  }

  // Primary: Turn Interpreter decision
  if (!interpretation.shouldAllowUiAction && result.ui_action) {
    console.log(`[celestin] Policy: stripped ui_action (${result.ui_action.kind}) — turnType=${interpretation.turnType}, mode=${interpretation.cognitiveMode}`)
    result.ui_action = undefined
  }
  // Fallback safety net: prevent re-reco on very short messages after a reco
  const hadRecentReco = lastAssistantText?.includes('[Vins proposés')
  if (hadRecentReco && (messageLength ?? 0) < 15 && result.ui_action?.kind === 'show_recommendations') {
    console.log('[celestin] Policy: fallback — stripped re-reco on very short post-reco message')
    result.ui_action = undefined
  }
  // Strip premature prepare_add_wine with incomplete extraction (no domaine AND no appellation)
  if (result.ui_action?.kind === 'prepare_add_wine' || result.ui_action?.kind === 'prepare_log_tasting') {
    const ext = result.ui_action.payload.extraction
    if (!ext?.domaine && !ext?.appellation) {
      console.log(`[celestin] Policy: stripped ${result.ui_action.kind} — extraction too incomplete (no domaine, no appellation)`)
      result.ui_action = undefined
    }
  }

  return result
}

// === CONTEXT BLOCK (driven by cognitive mode) ===

function buildMemoriesSection(body: RequestBody): string[] {
  if (!body.memories) return []

  const parts = [`Souvenirs de degustation :\n${body.memories}`]

  if (body.memoryEvidenceMode === 'exact') {
    parts.push('Le bloc ci-dessus est un inventaire exact deja filtre. N ajoute aucun autre vin.')
  } else if (body.memoryEvidenceMode === 'synthesis') {
    parts.push('Le bloc ci-dessus est la base exacte de synthese. N affirme rien hors de ces degustations.')
  } else {
    parts.push('Cite des souvenirs specifiques quand pertinent.')
  }

  return parts
}

function summarizeCaveCounts(body: RequestBody): { totalBottles: number; referenceCount: number } {
  const referenceCount = body.cave.length
  const totalBottles = body.cave.reduce((sum, bottle) => sum + Math.max(1, bottle.quantity ?? 1), 0)
  return { totalBottles, referenceCount }
}

function buildContextBlock(
  body: RequestBody,
  cognitiveMode: CognitiveMode | 'greeting' | 'social',
): string {
  const parts: string[] = []
  const caveCounts = summarizeCaveCounts(body)

  if (body.compiledProfileMarkdown?.trim()) {
    parts.push(`Profil utilisateur compile :\n${body.compiledProfileMarkdown}`)
  } else if (cognitiveMode !== 'tasting_memory' && body.profile) {
    parts.push(`Profil de gout :\n${body.profile}`)
  }

  const shouldIncludeTastingMemories =
    !!body.memories
    && cognitiveMode !== 'greeting'
    && cognitiveMode !== 'social'
    && cognitiveMode !== 'restaurant_assistant'

  if (shouldIncludeTastingMemories) {
    parts.push(buildMemoriesSection(body).join('\n\n'))
  }

  // --- greeting / social: profile + cave count only ---
  if (cognitiveMode === 'greeting' || cognitiveMode === 'social') {
    if (body.cave.length > 0) {
      parts.push(`Cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references).`)
    }
    return parts.join('\n\n')
  }

  // --- restaurant_assistant: profile + questionnaire only ---
  if (cognitiveMode === 'restaurant_assistant') {
    return parts.join('\n\n')
  }

  // --- wine_conversation ---
  if (cognitiveMode === 'wine_conversation') {
    return parts.join('\n\n')
  }

  // --- tasting_memory: profile + memories + sessions (no full cave) ---
  if (cognitiveMode === 'tasting_memory') {
    if (body.cave.length > 0) {
      parts.push(`Cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references, detail non inclus).`)
    }
    return parts.join('\n\n')
  }

  const zones = (body as Record<string, unknown>).zones as string[] | undefined
  if (zones && zones.length > 0) {
    parts.push(`Zones de stockage disponibles : ${zones.join(', ')}`)
  }

  if (body.cave.length > 0) {
    parts.push(`Bouteilles en cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references).`)
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

// === USER PROMPT (driven by Turn Interpreter) ===

function inferMemoryFocus(body: RequestBody, message: string, lastAssistantText?: string): string | null {
  const normalizedMessage = normalizeForRouting(message)
  const isEllipticMemoryFollowUp =
    /\b(combien d'etoiles|combien etoiles|quelle note|quel millesime|quelle impression)\b/i.test(normalizedMessage)
    || /^(et|et le|et la|et les|et lui|et elle)\b/i.test(normalizedMessage)

  if (!isEllipticMemoryFollowUp) return null

  const previousUserTurn = [...body.history].reverse().find((turn) => turn.role === 'user')?.text ?? null
  const sourceTexts = [previousUserTurn, lastAssistantText].filter(Boolean) as string[]

  for (const source of sourceTexts) {
    const matches = source.match(/\b([A-Z][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]{2,}){0,3})\b/g)
    if (!matches || matches.length === 0) continue

    const candidate = matches[matches.length - 1]
    if (/^(Le|La|Les|Un|Une|Et)$/i.test(candidate)) continue
    return candidate
  }

  return null
}

function resolveActiveMemoryFocus(
  body: RequestBody,
  interpretation: TurnInterpretation,
  state: ConversationState,
  lastAssistantText?: string,
): string | null {
  const normalizedMessage = normalizeForRouting(body.message)
  const existingFocus = state.memoryFocus ?? null

  if (interpretation.cognitiveMode !== 'tasting_memory') {
    return null
  }

  const directPatterns = [
    /\bet\s+(?:le|la|les|l')\s*([a-zà-ÿ0-9'’-]{3,})/i,
    /\bdu\s+([a-zà-ÿ0-9'’-]{3,})\b/i,
    /\bde\s+([a-zà-ÿ0-9'’-]{3,})\b/i,
  ]

  for (const pattern of directPatterns) {
    const match = body.message.match(pattern)
    const candidate = match?.[1]?.trim()
    if (candidate) {
      return candidate
    }
  }

  if (/\b(rayas|gangloff|brunello|selosse|leflaive|dugat|dugat-py|grange des peres|grange des p[eè]res)\b/i.test(body.message)) {
    const explicit = body.message.match(/\b(rayas|gangloff|brunello|selosse|leflaive|dugat-py|dugat|grange des peres|grange des p[eè]res)\b/i)
    if (explicit?.[1]) return explicit[1]
  }

  const isEllipticFollowUp =
    /\b(combien d'etoiles|combien etoiles|quelle note|quel millesime|quelle impression)\b/i.test(normalizedMessage)
    || /^(et|et le|et la|et les|et lui|et elle)\b/i.test(normalizedMessage)
    || /^c'est tout[?! ]*$/i.test(normalizedMessage)

  if (isEllipticFollowUp && existingFocus) {
    return existingFocus
  }

  return inferMemoryFocus(body, body.message, lastAssistantText) ?? existingFocus
}

function buildUserPrompt(
  body: RequestBody,
  interpretation: TurnInterpretation,
  state: ConversationState,
  lastAssistantText?: string,
): string {
  const parts: string[] = []
  const { turnType, cognitiveMode } = interpretation
  const memoryFocus = resolveActiveMemoryFocus(body, interpretation, state, lastAssistantText)

  // Greeting
  if (turnType === 'greeting') {
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
  }

  // Prefetch
  if (turnType === 'prefetch') {
    parts.push('Demande : suggestions personnalisees pour ce soir, pas de contrainte de plat.')
    parts.push('Pas d\'accord mets-vins a appliquer : priorise la pertinence contextuelle et la diversite.')
  }

  // Social ack — post-task or generic
  else if (turnType === 'social_ack') {
    if (state.phase === 'post_task_ack') {
      parts.push(`[ACQUITTEMENT — L'utilisateur acquiesce apres ta derniere action. 1 phrase COURTE. Ne propose PAS d'autres vins, ne fais PAS de suggestion. Cloture chaleureuse + action_chips pour changer de sujet.]`)
    } else {
      parts.push(`[CONVERSATION — PAS de ui_action. Reponds BRIEVEMENT (1-2 phrases max) + action_chips.]`)
    }
    parts.push(body.message)
  }

  // Task cancel
  else if (turnType === 'task_cancel') {
    parts.push(`[L'utilisateur decline ou veut arreter. Reponds brievement, pas de ui_action. Propose des action_chips pour changer de sujet.]`)
    parts.push(body.message)
  }

  // Smalltalk / wine culture
  else if (turnType === 'smalltalk' || (turnType === 'context_switch' && cognitiveMode === 'wine_conversation')) {
    parts.push(`[QUESTION VIN — Reponds avec tes connaissances. PAS de ui_action. Sois concis et opinione. action_chips : questions pour approfondir (cepage, region, domaine), PAS de suggestions de reco cave.]`)
    parts.push(`[GARDE-FOU — Pour une question de culture vin, ne ramene PAS la reponse a l'utilisateur, a sa cave, a ses souvenirs ou a ses preferences, sauf si la question porte explicitement dessus.]`)
    parts.push(`[SOBRIETE MEMOIRE — Pas d'analogie forcee avec une bouteille precise du passe. Si un souvenir personnel n'apporte pas une vraie precision utile, ne le dis pas.]`)
    parts.push(`[HONNETETE SUR TERME INCONNU — Si un nom te semble inconnu ou douteux, ne valide JAMAIS la categorie implicite. Dis "je ne connais pas ce nom" ou "je ne reconnais pas ce nom", pas "cette appellation", "ce domaine", "ce cepage" ou "ce terroir".]`)
    if (turnType === 'context_switch' && state.taskType === 'recommendation') {
      parts.push(`[PIVOT DE RECOMMANDATION — L'utilisateur explore une autre direction. Reponds sobrement a cette nouvelle piste sans recycler automatiquement le plat precedent, les cartes precedentes ou un souvenir marquant.]`)
    }
    parts.push(body.message)
  }

  // Context switch to tasting memory
  else if (turnType === 'context_switch' && cognitiveMode === 'tasting_memory') {
    parts.push(`[SOUVENIR — L'utilisateur fait reference a une degustation passee. Utilise uniquement les souvenirs explicitement fournis. Si un vin n'apparait pas dans ces souvenirs, dis-le franchement. PAS de ui_action sauf si l'utilisateur demande explicitement de noter.]`)
    if (memoryFocus) {
      parts.push(`[FOCUS MEMOIRE — La relance courte porte probablement sur : ${memoryFocus}. Si l'utilisateur demande "combien d'etoiles", "quelle note" ou "quel millesime", reste focalise sur ce vin precis.]`)
    }
    parts.push(body.message)
  }

  // Unknown — conversational fallback, no cave actions
  else if (turnType === 'context_switch' && cognitiveMode === 'cellar_assistant') {
    parts.push(`[QUESTION CAVE - Reponds uniquement a partir de la cave transmise. Pas de ui_action. Pour les questions de quantite, compte les bouteilles a partir des quantites, pas seulement les references.]`)
    parts.push(body.message)
  }

  else if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state.phase === 'collecting_info'
    && state.taskType === 'recommendation'
  ) {
    parts.push(`[RECOMMANDATION IMMEDIATE — L'utilisateur vient d'apporter la precision manquante pour une recommandation. Si tu as assez de contexte pour proposer des vins, utilise MAINTENANT show_recommendations. Ne reste pas en conversation generale. Une seule exception : si le message reste vraiment trop vague, pose une derniere question tres courte.]`)
    parts.push(`[GARDE-FOU — En recommendation, base-toi d'abord sur la demande courante. N'introduis JAMAIS un autre plat, un autre pays ou un souvenir non mentionne. Un souvenir est autorise seulement s'il justifie directement le choix.]`)
    parts.push(body.message)
  }

  else if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state.phase === 'collecting_info'
    && state.taskType === 'encavage'
  ) {
    parts.push(`[ENCAVAGE — L'utilisateur complete la fiche d'un vin a encaver. Si le vin est maintenant suffisamment identifie (domaine/appellation/millesime ou equivalent), envoie prepare_add_wine IMMEDIATEMENT. Ne demande PAS "tu veux que je l'ajoute ?" et ne cherche PAS une confirmation supplementaire.]`)
    parts.push(`[STYLE — Reponse tres courte. Pas de commentaire de degustation, pas d'avis sur le domaine. Juste l'accuse de reception et l'action.]`)
    parts.push(body.message)
  }

  else if (turnType === 'unknown') {
    parts.push(`[CONVERSATION — Reponds naturellement. PAS de ui_action. action_chips : questions pour approfondir le sujet, PAS de suggestions de reco cave.]`)
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  // Task request, task continue, disambiguation answer — just the message
  else {
    if (
      cognitiveMode === 'cellar_assistant'
      && (interpretation.inferredTaskType === 'recommendation' || state.taskType === 'recommendation')
    ) {
      parts.push(`[RECOMMANDATION — Reponds d'abord a la demande actuelle. N'invente PAS un autre plat ou contexte. N'utilise pas un souvenir pour faire joli. Si tu cites un souvenir, il doit etre directement utile pour expliquer le choix. N'insiste jamais deux tours de suite sur le meme souvenir saillant.]`)
      parts.push(`[SOBRIETE MEMOIRE — Sur une relance de type pays, couleur, style ou "plutot...", continue la recommandation sans recycler automatiquement le plat precedent ni un souvenir marquant. Ne rappelle un plat ou un souvenir que si l'utilisateur le remet lui-meme au centre ou si cela change concretement le choix.]`)
    }
    if (cognitiveMode === 'tasting_memory' && memoryFocus) {
      parts.push(`[FOCUS MEMOIRE — La relance courte porte probablement sur : ${memoryFocus}. Reste focalise sur ce vin precis.]`)
    }
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  // Dynamic context — only recentDrunk (day/season already in greeting, no need to repeat)
  if (body.context) {
    const ctx = body.context
    if (ctx.recentDrunk?.length) {
      parts.push(`\nVins bus recemment (a eviter) : ${ctx.recentDrunk.join(', ')}`)
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

function buildGeminiContents(history: ConversationTurn[], message: string, image?: string): GeminiContent[] {
  const contents: GeminiContent[] = history.map((turn) => {
    const parts: GeminiPart[] = []
    if (turn.image && turn.role === 'user') {
      parts.push({ inline_data: { mime_type: detectMediaType(turn.image), data: turn.image } })
    }
    parts.push({ text: turn.text })
    return { role: turn.role === 'user' ? 'user' : 'model', parts }
  })
  const userParts: GeminiPart[] = []
  if (image) {
    userParts.push({ inline_data: { mime_type: detectMediaType(image), data: image } })
  }
  userParts.push({ text: message })
  contents.push({ role: 'user', parts: userParts })
  return contents
}

function buildClaudeMessages(history: ConversationTurn[], message: string, image?: string): ClaudeMessage[] {
  const messages: ClaudeMessage[] = history.map((turn) => {
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

  const messages: OpenAIMessage[] = [
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

  // Provider chain: Gemini Flash (primary) → GPT-4.1 mini (fallback)
  // Claude and Mistral kept in code but not in chain (available via forcedProvider for eval)
  const providers: Array<{ name: string; call: () => Promise<CelestinResponse> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) })
  if (OPENAI_API_KEY) providers.push({ name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) })

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

    // Conversation state from frontend (defaults to idle if absent)
    const conversationState: ConversationState = body.conversationState ?? { ...INITIAL_STATE }

    // Extract last assistant text for context-aware interpretation
    const lastAssistantTurn = [...body.history].reverse().find(t => t.role === 'assistant')
    const lastAssistantText = lastAssistantTurn?.text

    // Turn Interpreter: replaces classifyIntent — state-aware, produces turnType + cognitiveMode
    const interpretation = interpretTurn(body.message, !!body.image, conversationState, lastAssistantText)
    console.log(`[celestin] message="${body.message.slice(0, 80)}" turn=${interpretation.turnType} mode=${interpretation.cognitiveMode} state=${conversationState.phase} history=${body.history.length} cave=${body.cave.length} image=${body.image ? 'yes' : 'no'}`)

    // Build prompt and context driven by cognitive mode
    const contextBlock = buildContextBlock(body, interpretation.cognitiveMode)
    const systemPrompt = buildCelestinSystemPrompt(interpretation.cognitiveMode) + '\n\n--- CONTEXTE UTILISATEUR ---\n\n' + contextBlock
    const activeMemoryFocus = resolveActiveMemoryFocus(body, interpretation, conversationState, lastAssistantText)
    const userPrompt = buildUserPrompt(body, interpretation, { ...conversationState, memoryFocus: activeMemoryFocus }, lastAssistantText)

    const { provider, response: rawResponse } = await celestinWithFallback(systemPrompt, userPrompt, body.history, body.provider, body.image)

    // Apply post-generation policy (strip inappropriate ui_actions)
    const response = applyResponsePolicy(rawResponse, body, conversationState, interpretation, lastAssistantText, body.message.length)

    // Compute next conversation state
    const nextState = computeNextState(
      conversationState,
      interpretation.turnType,
      !!response.ui_action,
      response.ui_action?.kind,
      interpretation.inferredTaskType,
      activeMemoryFocus,
    )
    console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'} nextState=${nextState.phase} focus=${nextState.memoryFocus ?? 'none'} msg="${response.message.slice(0, 120)}" compiled=${body.compiledProfileMarkdown?.trim() ? 'yes' : 'no'}`)

    return new Response(JSON.stringify({ ...response, _nextState: nextState, _debug: { turnType: interpretation.turnType, cognitiveMode: interpretation.cognitiveMode, provider, compiledProfile: !!body.compiledProfileMarkdown?.trim(), memoryEvidenceMode: body.memoryEvidenceMode ?? null, memoryFocus: activeMemoryFocus } }), {
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
