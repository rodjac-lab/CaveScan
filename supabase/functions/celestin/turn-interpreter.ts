// Turn interpreter: decides what Celestin should do and how much cave context it needs.

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

interface RoutingSignals {
  lower: string
  hadRecentReco: boolean
  isInventoryQuestion: boolean
  isTastingMemoryFollowUp: boolean
  isSocialAck: boolean
  isCancel: boolean
  isRefinement: boolean
  isMemoryGuidedRecommendation: boolean
  isExploratoryRecoPivot: boolean
  isWineCulture: boolean
  isQuestion: boolean
  isRecommendationRequest: boolean
  isEncavageRequest: boolean
  isTastingReference: boolean
  isMemoryReference: boolean
  isRestaurantImage: boolean
  isImageWineQuestion: boolean
}

const SOCIAL_ACK = [
  /^(merci|super|ok|d'accord|parfait|genial|cool|top|nice|bien|bonne idee|ah ok|je vois|compris|entendu|c'est bon|haha|mdr|lol)[.! ]*$/i,
]

const CANCEL = [
  /^(non merci|pas pour moi|ca ira|laisse tomber|tant pis|on oublie|rien|non c'est bon|non rien)[.! ]*$/i,
  /\b(laisse tomber|tant pis|on oublie)\b/i,
]

const RECOMMENDATION = [
  /\b(que? boire|recommande|propose|ce soir|pour accompagner|ouvre[- ]moi|quel vin|avec (ce|le|du|des|mon|ma|mes|un|une)|accord|accords mets)\b/i,
  /\b(pour aller avec|pour manger|pour diner|pour le repas)\b/i,
  /\b(qu.est-ce que j.ouvr|je pourrais ouvrir|quelque chose a ouvrir|qu.est-ce qu.on ouvre|on ouvre quoi|quoi ouvrir)\b/i,
]

const REFINEMENT = [
  /\b(en blanc|en rouge|en rose|en bulles|un blanc|un rouge|une bulle|autre chose|une autre|plutot un|sinon)\b/i,
  /\b(tu en as|t.en as|d.autres?|en as[- ]tu)\b/i,
]

const MEMORY_GUIDED_RECOMMENDATION = [
  /\b(dans l[' ]esprit|dans la veine|comme ce qu[' ]on avait aime|comme ce qu[' ]on avait aime|comme ce qu[' ]on avait aimé|dans le style de|quelque chose qui rappelle)\b/i,
  /\b(ce qu[' ]on avait aime avec|ce qu[' ]on avait aimé avec)\b/i,
]

const EXPLORATORY_RECO_PIVOT = [
  /^(et si je veux|et si je cherche|et si je prends)\b/i,
]

const ENCAVAGE = [
  /\b(achete|recu|commande|encave[rz]?|ajoute[rz]?|arrive|livre|ramene|stocke[rz]?|j'ai pris|j'ai achete)(?:\s|$|[.,!?])/i,
]

const TASTING = [
  /\b(deguste|goute)(?:\s|$|[.,!?])/i,
  /\b(bu |ouvert |hier soir|on a bu|note ca|degustation)\b/i,
]

const MEMORY = [
  /\b(tu te souviens|la derniere fois|chez \w+|on avait bu|rappelle|souvenir)\b/i,
  /\b(ai[- ]je deja bu|deja bu|deja goute|deja ouvert)\b/i,
  /\bdeja\b.*\b(note|noté|notee|notée|degustation|dégustation)\b/i,
  /\b(retrouve|retrouver|retrouverais|retrouvera?is|retrouveras)\b.*\b(note|degustation|dégustation|souvenir)\b/i,
  /\bje l[' ]?ai\b.*\b(note|noté|notee|notée|deguste|dégusté|goute|goûté|bu)\b/i,
]

const CELLAR_LOOKUP = [
  /\b(dans|de|en)\s+ma cave\b/i,
  /\ben cave\b/i,
  /\b(parle[- ]moi de ma cave|ma cave)\b/i,
  /\b(est-ce que j'ai|ai[- ]je|j'ai)\s+(du|de la|de l'|des|un|une)\b/i,
  /\b(combien\s+(j'ai|ai[- ]je)?\s*de?\s*bouteilles?)\b/i,
  /\b(quelles?\s+sont\s+les?\s+bouteilles?)\b/i,
  /\b(quels?\s+vins?\s+(j'ai|ai[- ]je|y a-t-il))\b/i,
  /\b(qu'est-ce que j'ai|j'ai quoi)\b/i,
]

const WINE_CULTURE = [
  /\b(c'est quoi|qu'est-ce qu|difference entre|les terroirs|parle[- ]moi|explique|raconte|dis[- ]moi)\b/i,
  /^(le |la |les |un |une |du )?(pinot|chardonnay|merlot|cabernet|syrah|grenache|gamay|chenin|riesling|sauvignon|malbec|nebbiolo|sangiovese|tempranillo)\b/i,
]

const QUESTION = [
  /^(pourquoi|comment|quoi|c'est quoi|qu'est-ce qu|est-ce que|tu (aimes?|connais|preferes|penses|sais|crois))/i,
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function normalizeForRouting(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function buildRoutingSignals(message: string, lastAssistantText?: string): RoutingSignals {
  const lower = normalizeForRouting(message)
  const normalizedAssistant = lastAssistantText ? normalizeForRouting(lastAssistantText) : ''
  const hadRecentReco = normalizedAssistant
    ? normalizedAssistant.includes('[vins proposes')
      || /\b(je te propose|voici .*pistes?|trois pistes?|recommandations?|je partirais sur|shortlist)\b/i.test(normalizedAssistant)
    : false
  const isQuestion = matchesAny(lower, QUESTION)
  const isWineCulture = matchesAny(lower, WINE_CULTURE)

  return {
    lower,
    hadRecentReco,
    isInventoryQuestion: matchesAny(lower, CELLAR_LOOKUP) || isCellarFollowUp(lower, lastAssistantText),
    isTastingMemoryFollowUp: isMemoryFollowUp(lower, lastAssistantText),
    isSocialAck: matchesAny(lower, SOCIAL_ACK),
    isCancel: matchesAny(lower, CANCEL),
    isRefinement: matchesAny(lower, REFINEMENT),
    isMemoryGuidedRecommendation: matchesAny(lower, MEMORY_GUIDED_RECOMMENDATION),
    isExploratoryRecoPivot: matchesAny(lower, EXPLORATORY_RECO_PIVOT),
    isWineCulture,
    isQuestion,
    isRecommendationRequest: matchesAny(lower, RECOMMENDATION),
    isEncavageRequest: matchesAny(lower, ENCAVAGE),
    isTastingReference: matchesAny(lower, TASTING),
    isMemoryReference: matchesAny(lower, MEMORY),
    isRestaurantImage: /\b(carte|resto|restaurant|menu|ardoise)\b/i.test(lower),
    isImageWineQuestion: isQuestion || isWineCulture || /\b(penses|avis|tu connais|c'est bien|c'est bon)\b/i.test(lower),
  }
}

function isCellarFollowUp(text: string, lastAssistantText?: string): boolean {
  if (!lastAssistantText) return false

  const normalizedText = normalizeForRouting(text)
  const normalizedAssistantText = normalizeForRouting(lastAssistantText)

  const assistantWasTalkingAboutCellar =
    /\b(cave|bouteilles?|enregistre|enregistree|enregistres|tu n'as|tu as)\b/i.test(normalizedAssistantText)

  if (!assistantWasTalkingAboutCellar) return false

  return /\b(c'est pas du|c'en est pas|tu en as pas)\b/i.test(normalizedText)
}

function isMemoryFollowUp(text: string, lastAssistantText?: string): boolean {
  if (!lastAssistantText) return false

  const normalizedText = normalizeForRouting(text)
  const normalizedAssistantText = normalizeForRouting(lastAssistantText)

  const assistantWasTalkingAboutMemory =
    /\b(souvenir|on avait|tu avais|tu l'avais|l'avais|avait eu|la derniere fois|ce soir-la|degust|bue?s?\b|ouvert|millesime|etoiles?|notes?)\b/i.test(normalizedAssistantText)

  if (!assistantWasTalkingAboutMemory) return false

  return (
    /^(et|et le|et la|et les|et lui|et elle)\b/i.test(normalizedText)
    || /\b(c'etait comment|c.etait comment|c'etait quoi|c.etait quoi)\b/i.test(normalizedText)
    || /\b(quel millesime|quelle note|combien d'etoiles|combien etoiles|quelle impression)\b/i.test(normalizedText)
    || /\bon avait\b.*\b(note|notes|etoiles?)\b/i.test(normalizedText)
    || /^c'est tout[?! ]*$/i.test(normalizedText)
  )
}

function taskTypeToMode(taskType: TaskType): CognitiveMode {
  if (taskType === 'tasting') return 'tasting_memory'
  return 'cellar_assistant'
}

function detectCognitiveMode(lower: string): CognitiveMode {
  if (matchesAny(lower, MEMORY) || matchesAny(lower, TASTING)) return 'tasting_memory'
  if (matchesAny(lower, CELLAR_LOOKUP) || matchesAny(lower, RECOMMENDATION) || matchesAny(lower, ENCAVAGE)) {
    return 'cellar_assistant'
  }
  return 'wine_conversation'
}

function candidate(intent: RoutingIntent, confidence: number, reasons: string[]): RoutingCandidate {
  return { intent, confidence, reasons }
}

function collectRoutingCandidates(
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

  const signals = buildRoutingSignals(message, lastAssistantText)
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
): TurnInterpretation {
  return interpretTurnWithRouting(message, hasImage, state, lastAssistantText).interpretation
}
