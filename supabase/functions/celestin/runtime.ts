import { buildContextBlock } from "./context-builder.ts"
import { computeNextState, INITIAL_STATE, type ConversationState } from "./conversation-state.ts"
import { celestinWithFallback } from "./llm-providers.ts"
import { resolveActiveMemoryFocus } from "./memory-focus.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"
import { applyResponsePolicy } from "./response-policy.ts"
import { interpretTurnWithRouting } from "./turn-interpreter.ts"
import { buildUserPrompt } from "./user-prompt.ts"
import type { CelestinResponse, RequestBody } from "./types.ts"

export interface CelestinTurnRuntimeResult {
  response: CelestinResponse
  nextState: ConversationState
  debugTrace: Record<string, unknown>
  provider: string
}

function uiActionKind(response: CelestinResponse): string {
  return response.ui_action?.kind ?? 'none'
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
}) {
  const { body, conversationState, nextState, rawResponse, response, routingResult } = input

  return {
    turnType: routingResult.interpretation.turnType,
    cognitiveMode: routingResult.interpretation.cognitiveMode,
    provider: input.provider,
    compiledProfile: !!body.compiledProfileMarkdown?.trim(),
    memoryEvidenceMode: body.memoryEvidenceMode ?? null,
    memoryFocus: input.activeMemoryFocus,
    routing: routingResult.routing,
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

export async function runCelestinTurn(body: RequestBody): Promise<CelestinTurnRuntimeResult> {
  const conversationState: ConversationState = body.conversationState ?? { ...INITIAL_STATE }
  const lastAssistantTurn = [...body.history].reverse().find((turn) => turn.role === 'assistant')
  const lastAssistantText = lastAssistantTurn?.text
  const routingResult = interpretTurnWithRouting(body.message, !!body.image, conversationState, lastAssistantText)
  const { interpretation, routing } = routingResult

  console.log(`[celestin] message="${body.message.slice(0, 80)}" turn=${interpretation.turnType} mode=${interpretation.cognitiveMode} route=${routing.winner} state=${conversationState.phase} history=${body.history.length} cave=${body.cave.length} image=${body.image ? 'yes' : 'no'}`)

  const contextBlock = buildContextBlock(body, interpretation.cognitiveMode)
  const systemPrompt = buildCelestinSystemPrompt(interpretation.cognitiveMode)
    + '\n\n--- CONTEXTE UTILISATEUR ---\n\n'
    + contextBlock

  const activeMemoryFocus = resolveActiveMemoryFocus(body, interpretation, conversationState, lastAssistantText)
  const userPrompt = buildUserPrompt(
    body,
    interpretation,
    { ...conversationState, memoryFocus: activeMemoryFocus },
    lastAssistantText,
  )

  const { provider, response: rawResponse } = await celestinWithFallback(
    systemPrompt,
    userPrompt,
    body.history,
    body.provider,
    body.image,
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
  })

  if (body.debugTrace) {
    console.log('[celestin:trace]', JSON.stringify({
      route: routing.winner,
      turnType: interpretation.turnType,
      mode: interpretation.cognitiveMode,
      memoryDecision: (body.memoryTrace as { decision?: unknown } | undefined)?.decision ?? null,
      uiAction: uiActionKind(response),
      provider,
    }))
  }

  console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'} nextState=${nextState.phase} focus=${nextState.memoryFocus ?? 'none'} msg="${response.message.slice(0, 120)}" compiled=${body.compiledProfileMarkdown?.trim() ? 'yes' : 'no'}`)

  return {
    response,
    nextState,
    debugTrace,
    provider,
  }
}
