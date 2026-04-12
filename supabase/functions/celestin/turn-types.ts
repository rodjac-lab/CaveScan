import type { ConversationState, TaskType } from './conversation-state.ts'

export type CognitiveMode =
  | 'wine_conversation'
  | 'cellar_assistant'
  | 'restaurant_assistant'
  | 'tasting_memory'

export type TurnType =
  | 'greeting'
  | 'prefetch'
  | 'social_ack'
  | 'smalltalk'
  | 'task_request'
  | 'task_continue'
  | 'task_cancel'
  | 'disambiguation_answer'
  | 'context_switch'
  | 'unknown'

export interface TurnInterpretation {
  turnType: TurnType
  cognitiveMode: CognitiveMode | 'greeting' | 'social'
  shouldAllowUiAction: boolean
  inferredTaskType?: TaskType
}

export type RoutingIntent =
  | 'greeting'
  | 'prefetch'
  | 'task_cancel'
  | 'social_ack'
  | 'recommendation_request'
  | 'recommendation_refinement'
  | 'memory_guided_recommendation'
  | 'exploratory_reco_pivot'
  | 'encavage_request'
  | 'tasting_log'
  | 'memory_lookup'
  | 'cellar_lookup'
  | 'wine_question'
  | 'restaurant_image'
  | 'image_cellar_action'
  | 'unknown'

export interface RoutingCandidate {
  intent: RoutingIntent
  confidence: number
  reasons: string[]
}

export interface RoutingTrace {
  scope: ConversationState['phase'] | 'image' | 'system'
  winner: RoutingIntent
  reasons: string[]
  candidates: RoutingCandidate[]
}

export interface TurnRoutingResult {
  interpretation: TurnInterpretation
  routing: RoutingTrace
}
