// Turn interpreter: decides what Celestin should do and how much cave context it needs.

import type { ConversationState, TaskType } from './conversation-state.ts'
import { candidate, collectRoutingCandidates } from './turn-candidates.ts'
import { buildRoutingSignals, detectCognitiveMode, type RoutingSignals } from './turn-signals.ts'
import type {
  CognitiveMode,
  RoutingCandidate,
  RoutingIntent,
  RoutingTrace,
  TurnInterpretation,
  TurnRoutingResult,
} from './turn-types.ts'

export type {
  CognitiveMode,
  RoutingCandidate,
  RoutingIntent,
  RoutingTrace,
  TurnInterpretation,
  TurnRoutingResult,
} from './turn-types.ts'

function taskTypeToMode(taskType: TaskType): CognitiveMode {
  if (taskType === 'tasting') return 'tasting_memory'
  return 'cellar_assistant'
}

function routed(
  interpretation: TurnInterpretation,
  scope: RoutingTrace['scope'],
  winner: RoutingIntent,
  candidates: RoutingCandidate[],
): TurnRoutingResult {
  const winningCandidate = candidates.find((entry) => entry.intent === winner)
  return {
    interpretation,
    routing: {
      scope,
      winner,
      reasons: winningCandidate?.reasons ?? [],
      candidates,
    },
  }
}

function socialAck(): TurnInterpretation {
  return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
}

function cancelTask(): TurnInterpretation {
  return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
}

function memoryContextSwitch(): TurnInterpretation {
  return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
}

function cellarContextSwitch(): TurnInterpretation {
  return { turnType: 'context_switch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: false }
}

function wineContextSwitch(): TurnInterpretation {
  return { turnType: 'context_switch', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
}

function wineSmalltalk(): TurnInterpretation {
  return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
}

function recommendationRequest(): TurnInterpretation {
  return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
}

function encavageRequest(): TurnInterpretation {
  return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'encavage' }
}

function tastingRequest(): TurnInterpretation {
  return { turnType: 'task_request', cognitiveMode: 'tasting_memory', shouldAllowUiAction: true, inferredTaskType: 'tasting' }
}

interface IntentRoute {
  interpretation: TurnInterpretation
  winner: RoutingIntent
}

function routeCellarRequest(signals: RoutingSignals): IntentRoute | null {
  if (signals.isRecommendationRequest) {
    return { interpretation: recommendationRequest(), winner: 'recommendation_request' }
  }
  if (signals.isEncavageRequest) {
    return { interpretation: encavageRequest(), winner: 'encavage_request' }
  }
  return null
}

function routeMemoryIntent(signals: RoutingSignals, tastingCreatesTask: boolean): IntentRoute | null {
  if (signals.isMemoryReference || signals.isTastingMemoryFollowUp) {
    return { interpretation: memoryContextSwitch(), winner: 'memory_lookup' }
  }
  if (signals.isTastingReference) {
    return {
      interpretation: tastingCreatesTask ? tastingRequest() : memoryContextSwitch(),
      winner: 'tasting_log',
    }
  }
  return null
}

function routeImageTurn(signals: RoutingSignals, candidates: RoutingCandidate[]): TurnRoutingResult {
  if (signals.isRestaurantImage) {
    return routed({ turnType: 'task_request', cognitiveMode: 'restaurant_assistant', shouldAllowUiAction: true }, 'image', 'restaurant_image', candidates)
  }
  if (signals.isEncavageRequest) {
    return routed(encavageRequest(), 'image', 'encavage_request', candidates)
  }
  if (signals.isRecommendationRequest) {
    return routed(recommendationRequest(), 'image', 'recommendation_request', candidates)
  }
  if (signals.isImageWineQuestion) {
    return routed(wineSmalltalk(), 'image', 'wine_question', candidates)
  }
  return routed({ turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }, 'image', 'image_cellar_action', candidates)
}

function routePostTaskAck(state: ConversationState, signals: RoutingSignals, candidates: RoutingCandidate[]): TurnRoutingResult {
  if (signals.isCancel) {
    return routed(cancelTask(), state.phase, 'task_cancel', candidates)
  }

  if (signals.lower.length < 30 && signals.isSocialAck) {
    return routed(socialAck(), state.phase, 'social_ack', candidates)
  }

  if (state.taskType === 'recommendation' && signals.isExploratoryRecoPivot) {
    return routed(wineContextSwitch(), state.phase, 'exploratory_reco_pivot', candidates)
  }

  if (signals.isRefinement) {
    return routed({ turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }, state.phase, 'recommendation_refinement', candidates)
  }

  if (state.taskType === 'recommendation' && signals.isMemoryGuidedRecommendation) {
    return routed({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }, state.phase, 'memory_guided_recommendation', candidates)
  }

  const cellarRequest = routeCellarRequest(signals)
  if (cellarRequest) return routed(cellarRequest.interpretation, state.phase, cellarRequest.winner, candidates)

  const memoryIntent = routeMemoryIntent(signals, true)
  if (memoryIntent) return routed(memoryIntent.interpretation, state.phase, memoryIntent.winner, candidates)

  if (signals.isInventoryQuestion) {
    return routed(cellarContextSwitch(), state.phase, 'cellar_lookup', candidates)
  }

  if (signals.isWineCulture || signals.isQuestion) {
    return routed(wineContextSwitch(), state.phase, 'wine_question', candidates)
  }

  if (signals.lower.length < 20) {
    return routed(socialAck(), state.phase, 'social_ack', candidates)
  }

  const detectedMode = detectCognitiveMode(signals.lower)
  return routed({
    turnType: 'context_switch',
    cognitiveMode: detectedMode,
    shouldAllowUiAction: detectedMode === 'cellar_assistant',
  }, state.phase, 'unknown', candidates)
}

function routeCollectingInfo(state: ConversationState, signals: RoutingSignals, candidates: RoutingCandidate[]): TurnRoutingResult {
  if (signals.isCancel) {
    return routed(cancelTask(), state.phase, 'task_cancel', candidates)
  }

  const memoryIntent = routeMemoryIntent(signals, false)
  if (memoryIntent) return routed(memoryIntent.interpretation, state.phase, memoryIntent.winner, candidates)

  if (signals.isInventoryQuestion) {
    return routed(cellarContextSwitch(), state.phase, 'cellar_lookup', candidates)
  }

  return routed({ turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }, state.phase, 'unknown', candidates)
}

function routeDisambiguation(state: ConversationState, signals: RoutingSignals, candidates: RoutingCandidate[]): TurnRoutingResult {
  if (signals.isCancel) {
    return routed(cancelTask(), state.phase, 'task_cancel', candidates)
  }
  return routed({ turnType: 'disambiguation_answer', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }, state.phase, 'unknown', candidates)
}

function routeActiveTask(state: ConversationState, signals: RoutingSignals, candidates: RoutingCandidate[]): TurnRoutingResult {
  if (signals.isCancel) {
    return routed(cancelTask(), state.phase, 'task_cancel', candidates)
  }
  if (signals.isSocialAck) {
    return routed(socialAck(), state.phase, 'social_ack', candidates)
  }
  if (signals.isInventoryQuestion) {
    return routed(cellarContextSwitch(), state.phase, 'cellar_lookup', candidates)
  }
  return routed({ turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }, state.phase, 'unknown', candidates)
}

function routeIdle(signals: RoutingSignals, candidates: RoutingCandidate[]): TurnRoutingResult {
  if (signals.isSocialAck) {
    return routed(socialAck(), 'idle_smalltalk', 'social_ack', candidates)
  }

  if (signals.hadRecentReco && signals.isRefinement) {
    return routed({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }, 'idle_smalltalk', 'recommendation_refinement', candidates)
  }

  if (signals.hadRecentReco && signals.isMemoryGuidedRecommendation) {
    return routed({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }, 'idle_smalltalk', 'memory_guided_recommendation', candidates)
  }

  const cellarRequest = routeCellarRequest(signals)
  if (cellarRequest) return routed(cellarRequest.interpretation, 'idle_smalltalk', cellarRequest.winner, candidates)

  const memoryIntent = routeMemoryIntent(signals, true)
  if (memoryIntent) return routed(memoryIntent.interpretation, 'idle_smalltalk', memoryIntent.winner, candidates)

  if (signals.isInventoryQuestion) {
    return routed(cellarContextSwitch(), 'idle_smalltalk', 'cellar_lookup', candidates)
  }

  if (signals.isWineCulture) {
    return routed(wineSmalltalk(), 'idle_smalltalk', 'wine_question', candidates)
  }

  if (signals.isQuestion) {
    return routed(wineSmalltalk(), 'idle_smalltalk', 'wine_question', candidates)
  }

  if (signals.hadRecentReco && signals.lower.length < 20) {
    return routed(socialAck(), 'idle_smalltalk', 'social_ack', candidates)
  }

  if (signals.lower.length < 20) {
    return routed(wineSmalltalk(), 'idle_smalltalk', 'wine_question', candidates)
  }

  return routed({ turnType: 'unknown', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }, 'idle_smalltalk', 'unknown', candidates)
}

export function interpretTurnWithRouting(
  message: string,
  hasImage: boolean,
  state: ConversationState,
  lastAssistantText?: string,
  conversationalIntent?: string | null,
): TurnRoutingResult {
  if (message === '__greeting__') {
    const candidates = [candidate('greeting', 100, ['system_greeting'])]
    return routed({ turnType: 'greeting', cognitiveMode: 'greeting', shouldAllowUiAction: false }, 'system', 'greeting', candidates)
  }

  if (message === '__prefetch__') {
    const candidates = [candidate('prefetch', 100, ['system_prefetch'])]
    return routed({
      turnType: 'prefetch',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
      inferredTaskType: 'recommendation',
    }, 'system', 'prefetch', candidates)
  }

  const signals = buildRoutingSignals(message, lastAssistantText, conversationalIntent)
  const candidates = collectRoutingCandidates(signals, state, hasImage)

  if (hasImage) {
    return routeImageTurn(signals, candidates)
  }

  if (state.phase === 'post_task_ack') {
    return routePostTaskAck(state, signals, candidates)
  }

  if (state.phase === 'collecting_info') {
    return routeCollectingInfo(state, signals, candidates)
  }

  if (state.phase === 'disambiguation') {
    return routeDisambiguation(state, signals, candidates)
  }

  if (state.phase === 'active_task') {
    return routeActiveTask(state, signals, candidates)
  }

  return routeIdle(signals, candidates)
}

export function interpretTurn(
  message: string,
  hasImage: boolean,
  state: ConversationState,
  lastAssistantText?: string,
  conversationalIntent?: string | null,
): TurnInterpretation {
  return interpretTurnWithRouting(message, hasImage, state, lastAssistantText, conversationalIntent).interpretation
}
