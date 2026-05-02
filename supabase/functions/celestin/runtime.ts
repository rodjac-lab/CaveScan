import { buildContextBlock } from "./context-builder.ts"
import { buildContextPlan, type ContextPlan } from "./context-plan.ts"
import { computeNextState, INITIAL_STATE, type ConversationState } from "./conversation-state.ts"
import { celestinWithFallback, type CelestinProviderTrace } from "./llm-providers.ts"
import { resolveActiveMemoryFocus } from "./memory-focus.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"
import { applyResponsePolicy } from "./response-policy.ts"
import { interpretTurnWithRouting } from "./turn-interpreter.ts"
import { persistCelestinTurnObservability } from "./observability.ts"
import { buildUserPrompt } from "./user-prompt.ts"
import type { AuthContext } from "./auth.ts"
import type { CelestinResponse, ConversationTurn, RequestBody } from "./types.ts"

export interface CelestinTurnRuntimeResult {
  response: CelestinResponse
  nextState: ConversationState
  debugTrace: Record<string, unknown>
  provider: string
  turnId: string
}

function resolveRequestSource(body: RequestBody): string {
  if (typeof body.requestSource === 'string' && body.requestSource.trim()) {
    return body.requestSource.trim()
  }

  if (body.message === '__prefetch__') return 'prefetch'
  if (body.provider && body.debugTrace) return 'debug_or_eval'
  return 'chat'
}

function uiActionKind(response: CelestinResponse): string {
  return response.ui_action?.kind ?? 'none'
}

function buildProviderHistory(body: RequestBody, contextPlan?: ContextPlan): ConversationTurn[] {
  if (contextPlan?.history !== 'pivot') return body.history

  // A pivot such as "Et si je veux plutôt un italien ?" must not let the model
  // continue the previous dish/cards. Routing already used the full history.
  return body.history.slice(0, -2)
}

function buildDebugTrace(input: {
  body: RequestBody
  conversationState: ConversationState
  nextState: ConversationState
  contextBlock: string
  systemPrompt: string
  userPrompt: string
  provider: string
  activeMemoryFocus: string | null
  rawResponse: CelestinResponse
  response: CelestinResponse
  routingResult: ReturnType<typeof interpretTurnWithRouting>
  providerErrors: string[]
  providerTrace: CelestinProviderTrace
  contextPlan: ContextPlan
}) {
  const { body, conversationState, nextState, rawResponse, response, routingResult } = input

  return {
    turnType: routingResult.interpretation.turnType,
    cognitiveMode: routingResult.interpretation.cognitiveMode,
    provider: input.provider,
    providerErrors: input.providerErrors,
    providerTrace: input.providerTrace,
    compiledProfile: !!body.compiledProfileMarkdown?.trim(),
    memoryEvidenceMode: body.memoryEvidenceMode ?? null,
    memoryFocus: input.activeMemoryFocus,
    conversationalIntent: (typeof body.conversationalIntent === 'string' ? body.conversationalIntent : null),
    routing: routingResult.routing,
    contextPlan: input.contextPlan,
    state: {
      beforePhase: conversationState.phase,
      beforeTask: conversationState.taskType ?? null,
      beforeMemoryFocus: conversationState.memoryFocus ?? null,
      afterPhase: nextState.phase,
      afterTask: nextState.taskType ?? null,
      afterMemoryFocus: nextState.memoryFocus ?? null,
    },
    prompt: {
      systemChars: input.systemPrompt.length,
      userChars: input.userPrompt.length,
      contextChars: input.contextBlock.length,
      historyTurns: body.history.length,
      providerHistoryTurns: buildProviderHistory(body, input.contextPlan).length,
      caveCount: body.cave.length,
      hasImage: !!body.image,
    },
    memory: body.memoryTrace ?? null,
    policy: {
      rawUiActionKind: uiActionKind(rawResponse),
      finalUiActionKind: uiActionKind(response),
      strippedUiAction: uiActionKind(rawResponse) !== uiActionKind(response),
    },
  }
}

export async function runCelestinTurn(body: RequestBody, auth?: AuthContext): Promise<CelestinTurnRuntimeResult> {
  const startedAt = performance.now()
  const turnId = crypto.randomUUID()
  const conversationState: ConversationState = body.conversationState ?? { ...INITIAL_STATE }
  const requestSource = resolveRequestSource(body)

  try {
    const lastAssistantTurn = [...body.history].reverse().find((turn) => turn.role === 'assistant')
    const lastAssistantText = lastAssistantTurn?.text
    const conversationalIntent = typeof body.conversationalIntent === 'string' ? body.conversationalIntent : null
    const routingResult = interpretTurnWithRouting(body.message, !!body.image, conversationState, lastAssistantText, conversationalIntent)
    const { interpretation, routing } = routingResult
    const contextPlan = buildContextPlan(routingResult)

    console.log(`[celestin] source=${requestSource} message="${body.message.slice(0, 80)}" turn=${interpretation.turnType} mode=${interpretation.cognitiveMode} route=${routing.winner} profile=${contextPlan.profile} cavePlan=${contextPlan.cave} tools=${contextPlan.tools} truth=${contextPlan.truthPolicy} state=${conversationState.phase} convIntent=${conversationalIntent ?? 'null'} history=${body.history.length} cave=${body.cave.length} image=${body.image ? 'yes' : 'no'}`)

    const contextBlock = buildContextBlock(body, interpretation.cognitiveMode, contextPlan)
    const systemPrompt = buildCelestinSystemPrompt(interpretation.cognitiveMode)
      + '\n\n--- CONTEXTE UTILISATEUR ---\n\n'
      + contextBlock

    const activeMemoryFocus = resolveActiveMemoryFocus(body, interpretation, conversationState, lastAssistantText)
    const userPrompt = buildUserPrompt(
      body,
      interpretation,
      { ...conversationState, memoryFocus: activeMemoryFocus },
      lastAssistantText,
      routing.winner,
    )
    const providerHistory = buildProviderHistory(body, contextPlan)

    const { provider, response: rawResponse, providerErrors, trace: providerTrace } = await celestinWithFallback(
      systemPrompt,
      userPrompt,
      providerHistory,
      body.provider,
      body.image,
      {
        auth,
        requestSource,
        usageContext: {
          turnId,
          route: routing.winner,
          turnType: interpretation.turnType,
          mode: interpretation.cognitiveMode,
        },
      },
    )

    const response = applyResponsePolicy(rawResponse, interpretation)

    const nextState = computeNextState(
      conversationState,
      interpretation.turnType,
      !!response.ui_action,
      response.ui_action?.kind,
      interpretation.inferredTaskType,
      activeMemoryFocus,
    )

    const debugTrace = buildDebugTrace({
      body,
      conversationState,
      nextState,
      contextBlock,
      systemPrompt,
      userPrompt,
      provider,
      activeMemoryFocus,
      rawResponse,
      response,
      routingResult,
      providerErrors,
      providerTrace,
      contextPlan,
    })

    await persistCelestinTurnObservability({
      supabase: auth?.supabase ?? null,
      turnId,
      userId: auth?.userId ?? null,
      body,
      startedAt,
      success: true,
      route: routing.winner,
      turnType: interpretation.turnType,
      mode: interpretation.cognitiveMode,
      stateBefore: conversationState,
      stateAfter: nextState,
      activeMemoryFocus,
      prompt: {
        systemChars: systemPrompt.length,
        userChars: userPrompt.length,
        contextChars: contextBlock.length,
        providerHistoryTurns: providerHistory.length,
      },
      response,
      provider,
      providerErrors,
      providerTrace,
      contextPlan,
    })

    if (body.debugTrace) {
      console.log('[celestin:trace]', JSON.stringify({
        route: routing.winner,
        source: requestSource,
        turnType: interpretation.turnType,
        mode: interpretation.cognitiveMode,
        memoryDecision: (body.memoryTrace as { decision?: unknown } | undefined)?.decision ?? null,
        uiAction: uiActionKind(response),
        provider,
        providerPath: providerTrace.providerPath,
        contextPlan,
        toolCalls: providerTrace.toolCalls.map((tool) => ({ name: tool.name, totalRows: tool.totalRows, durationMs: tool.durationMs })),
      }))
    }

    console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'} nextState=${nextState.phase} focus=${nextState.memoryFocus ?? 'none'} msg="${response.message.slice(0, 120)}" compiled=${body.compiledProfileMarkdown?.trim() ? 'yes' : 'no'}`)

    return {
      response,
      nextState,
      debugTrace,
      provider,
      turnId,
    }
  } catch (error) {
    await persistCelestinTurnObservability({
      supabase: auth?.supabase ?? null,
      turnId,
      userId: auth?.userId ?? null,
      body,
      startedAt,
      success: false,
      error,
      stateBefore: conversationState,
    })
    throw error
  }
}
