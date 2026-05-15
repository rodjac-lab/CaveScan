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
    retrieval: {
      decision: string | null
      planningQuery: string | null
      selectionProfile: string | null
      matchedFilters: string[]
      sourceBottleCount: number | null
      sourceNoteCount: number | null
      candidateCount: number | null
      selectedCount: number | null
      selectedMemories: Array<{
        id?: string
        domaine?: string | null
        cuvee?: string | null
        appellation?: string | null
        millesime?: number | null
        rating?: number | null
        drunk_at?: string | null
        has_note?: boolean
      }>
    } | null
  }
  response?: {
    messagePreview: string
    uiActionKind: string
    provider: string | null
    turnType: string | null
    cognitiveMode: string | null
    capability: string | null
    confidence: number | null
    actionContract: string | null
    responseMode: string | null
    orchestrationVersion: string | null
    memoryFocus: string | null
    routing: CelestinRoutingTrace | null
    state: {
      beforePhase: string | null
      beforeTask: string | null
      afterPhase: string | null
      afterTask: string | null
      afterMemoryFocus: string | null
    } | null
    prompt: {
      systemChars: number | null
      userChars: number | null
      contextChars: number | null
      historyTurns: number | null
      providerHistoryTurns: number | null
    } | null
    policy: {
      rawUiActionKind: string
      finalUiActionKind: string
      strippedUiAction: boolean
    } | null
    providerErrors: string[]
    providerTrace: {
      providerPath: string | null
      attempts: Array<{
        provider: string | null
        status: string | null
        durationMs: number | null
        error: string | null
      }>
      toolCalls: Array<{
        name: string | null
        input: Record<string, unknown> | null
        durationMs: number | null
        source: string | null
        totalRows: number | null
        listedRows: number | null
        totalQuantity: number | null
        error: string | null
      }>
      claudeCache: {
        creationInputTokens: number | null
        readInputTokens: number | null
      } | null
    } | null
  }
  error?: string
}

type CelestinTraceBody = {
  history?: unknown[]
  cave?: unknown[]
  memories?: string
  memoryEvidenceMode?: string
  memoryTrace?: unknown
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
    state?: unknown
    prompt?: unknown
    policy?: unknown
    providerErrors?: unknown
    providerTrace?: unknown
    capability?: unknown
    confidence?: unknown
    actionContract?: { kind?: unknown } | unknown
    responseMode?: unknown
    orchestrationVersion?: unknown
  } | null
}

type CelestinStoredResponseTrace = NonNullable<CelestinRealTraceEntry['response']>

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

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeRetrievalTrace(value: unknown): CelestinRealTraceEntry['request']['retrieval'] {
  if (!value || typeof value !== 'object') return null
  const trace = value as Record<string, unknown>
  const selectedMemories = Array.isArray(trace.selectedMemories)
    ? trace.selectedMemories
        .filter((memory): memory is Record<string, unknown> => !!memory && typeof memory === 'object')
        .map((memory) => ({
          id: asString(memory.id) ?? undefined,
          domaine: asString(memory.domaine),
          cuvee: asString(memory.cuvee),
          appellation: asString(memory.appellation),
          millesime: asNumber(memory.millesime),
          rating: asNumber(memory.rating),
          drunk_at: asString(memory.drunk_at),
          has_note: typeof memory.has_note === 'boolean' ? memory.has_note : undefined,
        }))
    : []

  return {
    decision: asString(trace.decision),
    planningQuery: asString(trace.planningQuery),
    selectionProfile: asString(trace.selectionProfile),
    matchedFilters: asStringArray(trace.matchedFilters) ?? [],
    sourceBottleCount: asNumber(trace.sourceBottleCount),
    sourceNoteCount: asNumber(trace.sourceNoteCount),
    candidateCount: asNumber(trace.candidateCount),
    selectedCount: asNumber(trace.selectedCount),
    selectedMemories,
  }
}

function normalizeStateTrace(value: unknown): CelestinStoredResponseTrace['state'] {
  if (!value || typeof value !== 'object') return null
  const state = value as Record<string, unknown>
  return {
    beforePhase: asString(state.beforePhase),
    beforeTask: asString(state.beforeTask),
    afterPhase: asString(state.afterPhase),
    afterTask: asString(state.afterTask),
    afterMemoryFocus: asString(state.afterMemoryFocus),
  }
}

function normalizePromptTrace(value: unknown): CelestinStoredResponseTrace['prompt'] {
  if (!value || typeof value !== 'object') return null
  const prompt = value as Record<string, unknown>
  return {
    systemChars: asNumber(prompt.systemChars),
    userChars: asNumber(prompt.userChars),
    contextChars: asNumber(prompt.contextChars),
    historyTurns: asNumber(prompt.historyTurns),
    providerHistoryTurns: asNumber(prompt.providerHistoryTurns),
  }
}

function normalizePolicyTrace(value: unknown): CelestinStoredResponseTrace['policy'] {
  if (!value || typeof value !== 'object') return null
  const policy = value as Record<string, unknown>
  return {
    rawUiActionKind: asString(policy.rawUiActionKind) ?? 'none',
    finalUiActionKind: asString(policy.finalUiActionKind) ?? 'none',
    strippedUiAction: typeof policy.strippedUiAction === 'boolean' ? policy.strippedUiAction : false,
  }
}

function normalizeProviderTrace(value: unknown): CelestinStoredResponseTrace['providerTrace'] {
  if (!value || typeof value !== 'object') return null
  const trace = value as Record<string, unknown>
  const attempts = Array.isArray(trace.attempts)
    ? trace.attempts
        .filter((attempt): attempt is Record<string, unknown> => !!attempt && typeof attempt === 'object')
        .map((attempt) => ({
          provider: asString(attempt.provider),
          status: asString(attempt.status),
          durationMs: asNumber(attempt.durationMs),
          error: asString(attempt.error),
        }))
    : []
  const toolCalls = Array.isArray(trace.toolCalls)
    ? trace.toolCalls
        .filter((tool): tool is Record<string, unknown> => !!tool && typeof tool === 'object')
        .map((tool) => ({
          name: asString(tool.name),
          input: tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input)
            ? tool.input as Record<string, unknown>
            : null,
          durationMs: asNumber(tool.durationMs),
          source: asString(tool.source),
          totalRows: asNumber(tool.totalRows),
          listedRows: asNumber(tool.listedRows),
          totalQuantity: asNumber(tool.totalQuantity),
          error: asString(tool.error),
        }))
    : []
  const cache = trace.claudeCache && typeof trace.claudeCache === 'object'
    ? trace.claudeCache as Record<string, unknown>
    : null

  return {
    providerPath: asString(trace.providerPath),
    attempts,
    toolCalls,
    claudeCache: cache ? {
      creationInputTokens: asNumber(cache.creationInputTokens),
      readInputTokens: asNumber(cache.readInputTokens),
    } : null,
  }
}

function createTraceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function isCelestinTraceEnabled(): boolean {
  const storage = getStorage()
  if (!storage) return false
  return storage.getItem(TRACE_ENABLED_KEY) !== 'false'
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
  pushTraceToDevSink(entry)
}

function pushTraceToDevSink(entry: CelestinRealTraceEntry): void {
  if (!import.meta.env.DEV) return
  if (typeof fetch === 'undefined') return
  fetch('/__debug/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {
    // Best-effort: dev sink might be down or we're running tests; don't block
    // the user-facing pipeline on its availability.
  })
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
      retrieval: normalizeRetrievalTrace(body.memoryTrace),
    },
    ...(response ? {
      response: {
        messagePreview: typeof response.message === 'string' ? response.message.slice(0, 700) : '',
        uiActionKind: asString(response.ui_action?.kind) ?? 'none',
        provider: asString(debug?.provider),
        turnType: asString(debug?.turnType),
        cognitiveMode: asString(debug?.cognitiveMode),
        capability: asString(debug?.capability),
        confidence: asNumber(debug?.confidence),
        actionContract: debug?.actionContract && typeof debug.actionContract === 'object'
          ? asString((debug.actionContract as Record<string, unknown>).kind)
          : asString(debug?.actionContract),
        responseMode: asString(debug?.responseMode),
        orchestrationVersion: asString(debug?.orchestrationVersion),
        memoryFocus: asString(debug?.memoryFocus),
        routing,
        state: normalizeStateTrace(debug?.state),
        prompt: normalizePromptTrace(debug?.prompt),
        policy: normalizePolicyTrace(debug?.policy),
        providerErrors: asStringArray(debug?.providerErrors) ?? [],
        providerTrace: normalizeProviderTrace(debug?.providerTrace),
      },
    } : {}),
    ...(input.error ? {
      error: input.error instanceof Error ? input.error.message : String(input.error),
    } : {}),
  }
}
