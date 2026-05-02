import type { SupabaseServiceClient } from "./auth.ts"
import type { ContextPlan } from "./context-plan.ts"
import type { ConversationState } from "./conversation-state.ts"
import type { CelestinProviderTrace } from "./llm-providers.ts"
import { buildSourceRequirements } from "./source-resolver.ts"
import type { ResolvedContextSources } from "./source-resolver.ts"
import type { CelestinResponse, RequestBody } from "./types.ts"

type PromptMetrics = {
  systemChars: number
  userChars: number
  contextChars: number
  providerHistoryTurns: number
}

export type CelestinTurnObservabilityInput = {
  supabase: SupabaseServiceClient | null
  turnId: string
  userId: string | null
  body: RequestBody
  startedAt: number
  success: boolean
  error?: unknown
  route?: string | null
  turnType?: string | null
  mode?: string | null
  stateBefore?: ConversationState | null
  stateAfter?: ConversationState | null
  activeMemoryFocus?: string | null
  prompt?: PromptMetrics | null
  response?: CelestinResponse | null
  provider?: string | null
  providerErrors?: string[]
  providerTrace?: CelestinProviderTrace | null
  contextPlan?: ContextPlan | null
  resolvedSources?: ResolvedContextSources | null
}

export type CelestinEdgeFunctionTimingInput = {
  supabase: SupabaseServiceClient | null
  turnId: string
  functionStartedAt: number
  parseMs: number
  authMs: number
  runtimeMs: number
  isolateAgeMs: number
  invocationIndex: number
  coldStart: boolean
  region?: string | null
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

function errorKind(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.name || 'Error'
  return typeof error
}

function errorMessage(error: unknown): string | null {
  if (!error) return null
  return truncate(error instanceof Error ? error.message : String(error), 800)
}

function uiActionKind(response: CelestinResponse | null | undefined): string {
  return response?.ui_action?.kind ?? 'none'
}

function llmDurationMs(providerTrace: CelestinProviderTrace | null | undefined): number | null {
  if (!providerTrace?.attempts.length) return null
  return providerTrace.attempts.reduce((sum, attempt) => sum + Math.max(0, attempt.durationMs), 0)
}

function toolNames(providerTrace: CelestinProviderTrace | null | undefined): string[] {
  if (!providerTrace) return []
  return [...new Set(providerTrace.toolCalls.map((tool) => tool.name).filter(Boolean))]
}

function toolDurationMs(providerTrace: CelestinProviderTrace | null | undefined): number {
  if (!providerTrace) return 0
  return providerTrace.toolCalls.reduce((sum, tool) => sum + Math.max(0, tool.durationMs), 0)
}

export function summarizeResolvedSources(sources: ResolvedContextSources | null | undefined) {
  if (!sources) return null

  return {
    profile: sources.profile
      ? {
          level: sources.profile.level,
          compiled: !!sources.profile.compiledMarkdown,
          legacy: !!sources.profile.legacyProfile,
        }
      : null,
    memories: sources.memories
      ? {
          level: sources.memories.level,
          evidenceMode: sources.memories.evidenceMode ?? null,
          source: sources.memories.source ?? null,
          selectedCount: sources.memories.selectedCount ?? null,
          selectedTastingMemories: sources.memories.selectedTastingMemories ?? [],
          chars: sources.memories.text.length,
        }
      : null,
    sqlRetrieval: sources.sqlRetrieval
      ? { chars: sources.sqlRetrieval.text.length }
      : null,
    cave: {
      level: sources.cave.level,
      totalBottles: sources.cave.totalBottles,
      referenceCount: sources.cave.referenceCount,
      injectedBottles: sources.cave.bottles.length,
    },
    zones: {
      count: sources.zones.length,
    },
    tastings: sources.tastings
      ? {
          kind: sources.tastings.kind,
          totalRows: sources.tastings.totalRows,
          rowCount: sources.tastings.rows?.length ?? 0,
          query: sources.tastings.query ?? null,
        }
      : null,
  }
}

export async function persistCelestinTurnObservability(input: CelestinTurnObservabilityInput): Promise<void> {
  if (!input.supabase) return

  const trace = input.providerTrace
  const edgeMs = Math.round(performance.now() - input.startedAt)

  try {
    const { error } = await input.supabase
      .from('celestin_turn_observability')
      .upsert({
        turn_id: input.turnId,
        user_id: input.userId,
        session_id: input.body.sessionId ?? null,
        request_source: input.body.requestSource ?? null,
        message_preview: truncate(input.body.message, 160),
        has_image: !!input.body.image,
        success: input.success,
        error_kind: input.success ? null : errorKind(input.error),
        error_message: input.success ? null : errorMessage(input.error),
        route: input.route ?? null,
        turn_type: input.turnType ?? null,
        mode: input.mode ?? null,
        conversational_intent: typeof input.body.conversationalIntent === 'string' ? input.body.conversationalIntent : null,
        state_before_phase: input.stateBefore?.phase ?? null,
        state_after_phase: input.stateAfter?.phase ?? null,
        ui_action_kind: input.response ? uiActionKind(input.response) : null,
        provider: input.provider ?? null,
        provider_path: trace?.providerPath ?? null,
        provider_errors: input.providerErrors ?? [],
        provider_attempts: trace?.attempts ?? [],
        edge_ms: edgeMs,
        llm_ms: llmDurationMs(trace),
        tool_calls_count: trace?.toolCalls.length ?? 0,
        tool_duration_ms: toolDurationMs(trace),
        tool_names: toolNames(trace),
        prompt_system_chars: input.prompt?.systemChars ?? null,
        prompt_user_chars: input.prompt?.userChars ?? null,
        prompt_context_chars: input.prompt?.contextChars ?? null,
        history_turns: input.body.history.length,
        provider_history_turns: input.prompt?.providerHistoryTurns ?? null,
        cave_count: input.resolvedSources?.cave.referenceCount ?? input.body.cave?.length ?? 0,
        memory_evidence_mode: input.body.memoryEvidenceMode ?? null,
        memory_focus: input.activeMemoryFocus ?? null,
        compiled_profile: !!input.resolvedSources?.profile?.compiledMarkdown || !!input.body.compiledProfileMarkdown?.trim(),
        cache_creation_input_tokens: trace?.usage.cacheCreationInputTokens ?? trace?.claudeCache.creationInputTokens ?? 0,
        cache_read_input_tokens: trace?.usage.cacheReadInputTokens ?? trace?.claudeCache.readInputTokens ?? 0,
        input_tokens: trace?.usage.inputTokens ?? 0,
        output_tokens: trace?.usage.outputTokens ?? 0,
        metadata: {
          promptCacheCreateTokens: trace?.claudeCache.creationInputTokens ?? 0,
          promptCacheReadTokens: trace?.claudeCache.readInputTokens ?? 0,
          contextPlan: input.contextPlan ?? null,
          sourceRequirements: input.contextPlan ? buildSourceRequirements(input.contextPlan) : [],
          resolvedSources: summarizeResolvedSources(input.resolvedSources),
        },
      }, { onConflict: 'turn_id' })

    if (error) console.warn('[celestin:observability-db] upsert failed:', error.message)
  } catch (err) {
    console.warn('[celestin:observability-db] upsert failed:', err instanceof Error ? err.message : String(err))
  }
}

export async function updateCelestinEdgeFunctionTimings(input: CelestinEdgeFunctionTimingInput): Promise<void> {
  if (!input.supabase) return

  try {
    const { error } = await input.supabase
      .from('celestin_turn_observability')
      .update({
        edge_function_ms: Math.round(performance.now() - input.functionStartedAt),
        edge_request_parse_ms: input.parseMs,
        edge_auth_ms: input.authMs,
        edge_runtime_ms: input.runtimeMs,
        edge_isolate_age_ms: input.isolateAgeMs,
        edge_invocation_index: input.invocationIndex,
        edge_cold_start: input.coldStart,
        edge_function_region: input.region ?? null,
      })
      .eq('turn_id', input.turnId)

    if (error) console.warn('[celestin:edge-timing-db] update failed:', error.message)
  } catch (err) {
    console.warn('[celestin:edge-timing-db] update failed:', err instanceof Error ? err.message : String(err))
  }
}
