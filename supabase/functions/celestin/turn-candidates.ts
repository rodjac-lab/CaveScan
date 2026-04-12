import type { ConversationState } from './conversation-state.ts'
import type { RoutingCandidate, RoutingIntent } from './turn-types.ts'
import type { RoutingSignals } from './turn-signals.ts'

export function candidate(intent: RoutingIntent, confidence: number, reasons: string[]): RoutingCandidate {
  return { intent, confidence, reasons }
}

export function collectRoutingCandidates(
  signals: RoutingSignals,
  state: ConversationState,
  hasImage: boolean,
): RoutingCandidate[] {
  const candidates: RoutingCandidate[] = []

  if (signals.isCancel) candidates.push(candidate('task_cancel', 100, ['cancel_phrase']))
  if (signals.isSocialAck) candidates.push(candidate('social_ack', 90, ['social_ack_phrase']))
  if (signals.isEncavageRequest) candidates.push(candidate('encavage_request', 90, ['encavage_terms']))
  if (signals.isMemoryReference || signals.isTastingMemoryFollowUp) {
    candidates.push(candidate('memory_lookup', 88, [
      signals.isMemoryReference ? 'memory_terms' : 'memory_follow_up',
    ]))
  }
  if (signals.isTastingReference) candidates.push(candidate('tasting_log', 72, ['tasting_terms']))
  if (signals.isInventoryQuestion) candidates.push(candidate('cellar_lookup', 76, ['cellar_terms_or_follow_up']))
  if (signals.isRecommendationRequest) candidates.push(candidate('recommendation_request', 78, ['recommendation_terms']))
  if (signals.isRefinement) {
    candidates.push(candidate('recommendation_refinement', state.taskType === 'recommendation' || signals.hadRecentReco ? 86 : 62, [
      'refinement_terms',
      state.taskType === 'recommendation' ? 'state_task_recommendation' : signals.hadRecentReco ? 'recent_recommendation_history' : 'no_reco_context',
    ]))
  }
  if (signals.isMemoryGuidedRecommendation) {
    candidates.push(candidate('memory_guided_recommendation', state.taskType === 'recommendation' || signals.hadRecentReco ? 88 : 68, [
      'memory_guided_reco_terms',
      state.taskType === 'recommendation' ? 'state_task_recommendation' : signals.hadRecentReco ? 'recent_recommendation_history' : 'no_reco_context',
    ]))
  }
  if (state.taskType === 'recommendation' && signals.isExploratoryRecoPivot) {
    candidates.push(candidate('exploratory_reco_pivot', 94, ['exploratory_pivot_after_recommendation']))
  }
  if (signals.isWineCulture || signals.isQuestion) {
    candidates.push(candidate('wine_question', 70, [
      signals.isWineCulture ? 'wine_culture_terms' : 'question_terms',
    ]))
  }
  if (hasImage && signals.isRestaurantImage) candidates.push(candidate('restaurant_image', 94, ['restaurant_image_terms']))
  if (hasImage) candidates.push(candidate('image_cellar_action', signals.isImageWineQuestion ? 45 : 60, ['image_present']))

  return candidates.length > 0 ? candidates.sort((a, b) => b.confidence - a.confidence) : [
    candidate('unknown', 10, ['no_matching_signal']),
  ]
}
