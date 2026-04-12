const TRACE_ENABLED_KEY = 'celestin.real_trace_enabled'
const TRACE_LOG_KEY = 'celestin.real_trace_log'
const TRACE_LIMIT = 30

export type CelestinRoutingCandidateTrace = {
  intent?: string
  confidence?: number
  reasons?: string[]
}

export type CelestinRoutingTrace = {
  winner?: string
  scope?: string
  reasons?: string[]
  candidates?: CelestinRoutingCandidateTrace[]
}

export type CelestinRealTraceEntry = {
  id: string
  createdAt: string
  userMessage: string
  hasImage: boolean
  request: {
    historyTurns: number
    caveCount: number
    memoriesChars: number
    memoriesPreview: string | null
    memoryEvidenceMode: string | null
    conversationPhase: string | null
    taskType: string | null
    memoryFocus: string | null
    provider: string | null
    compiledProfile: boolean
  }
  response?: {
    messagePreview: string
    uiActionKind: string
    provider: string | null
    turnType: string | null
    cognitiveMode: string | null
    memoryFocus: string | null
    routing: CelestinRoutingTrace | null
  }
  error?: string
}

type CelestinTraceBody = {
  history?: unknown[]
  cave?: unknown[]
  memories?: string
  memoryEvidenceMode?: string
  provider?: string
  image?: string
  compiledProfileMarkdown?: string
  conversationState?: {
    phase?: unknown
    taskType?: unknown
    memoryFocus?: unknown
  } | null
}

type CelestinTraceResponse = {
  message?: unknown
  ui_action?: { kind?: unknown } | null
  _debug?: {
    provider?: unknown
    turnType?: unknown
    cognitiveMode?: unknown
    memoryFocus?: unknown
    routing?: unknown
  } | null
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined
}

function normalizeRouting(value: unknown): CelestinRoutingTrace | null {
  if (!value || typeof value !== 'object') return null
  const routing = value as Record<string, unknown>
  const candidates = Array.isArray(routing.candidates)
    ? routing.candidates
        .filter((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate === 'object')
        .map((candidate) => ({
          intent: asString(candidate.intent) ?? undefined,
          confidence: typeof candidate.confidence === 'number' ? candidate.confidence : undefined,
          reasons: asStringArray(candidate.reasons),
        }))
    : undefined

  return {
    winner: asString(routing.winner) ?? undefined,
    scope: asString(routing.scope) ?? undefined,
    reasons: asStringArray(routing.reasons),
    candidates,
  }
}

function createTraceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function isCelestinTraceEnabled(): boolean {
  return getStorage()?.getItem(TRACE_ENABLED_KEY) === 'true'
}

export function setCelestinTraceEnabled(enabled: boolean): void {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(TRACE_ENABLED_KEY, enabled ? 'true' : 'false')
}

export function loadCelestinRealTraces(): CelestinRealTraceEntry[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(TRACE_LOG_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed as CelestinRealTraceEntry[] : []
  } catch {
    return []
  }
}

export function clearCelestinRealTraces(): void {
  getStorage()?.removeItem(TRACE_LOG_KEY)
}

export function appendCelestinRealTrace(entry: CelestinRealTraceEntry): void {
  const storage = getStorage()
  if (!storage) return
  const next = [entry, ...loadCelestinRealTraces()].slice(0, TRACE_LIMIT)
  storage.setItem(TRACE_LOG_KEY, JSON.stringify(next))
  console.info('[celestin:trace]', entry)
}

export function buildCelestinRealTraceEntry(input: {
  userMessage: string
  body: CelestinTraceBody
  response?: CelestinTraceResponse
  error?: unknown
}): CelestinRealTraceEntry {
  const body = input.body
  const response = input.response
  const debug = response?._debug ?? null
  const conversationState = body.conversationState ?? null
  const memories = body.memories ?? ''
  const routing = normalizeRouting(debug?.routing)

  return {
    id: createTraceId(),
    createdAt: new Date().toISOString(),
    userMessage: input.userMessage,
    hasImage: !!body.image,
    request: {
      historyTurns: body.history?.length ?? 0,
      caveCount: body.cave?.length ?? 0,
      memoriesChars: memories.length,
      memoriesPreview: memories ? memories.slice(0, 600) : null,
      memoryEvidenceMode: body.memoryEvidenceMode ?? null,
      conversationPhase: asString(conversationState?.phase),
      taskType: asString(conversationState?.taskType),
      memoryFocus: asString(conversationState?.memoryFocus),
      provider: body.provider ?? null,
      compiledProfile: !!body.compiledProfileMarkdown?.trim(),
    },
    ...(response ? {
      response: {
        messagePreview: typeof response.message === 'string' ? response.message.slice(0, 700) : '',
        uiActionKind: asString(response.ui_action?.kind) ?? 'none',
        provider: asString(debug?.provider),
        turnType: asString(debug?.turnType),
        cognitiveMode: asString(debug?.cognitiveMode),
        memoryFocus: asString(debug?.memoryFocus),
        routing,
      },
    } : {}),
    ...(input.error ? {
      error: input.error instanceof Error ? input.error.message : String(input.error),
    } : {}),
  }
}
