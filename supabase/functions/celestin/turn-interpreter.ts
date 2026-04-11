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
  const hadRecentReco = lastAssistantText ? normalizeForRouting(lastAssistantText).includes('[vins proposes') : false

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
    isWineCulture: matchesAny(lower, WINE_CULTURE),
    isQuestion: matchesAny(lower, QUESTION),
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

function routeCellarRequest(lower: string): TurnInterpretation | null {
  if (matchesAny(lower, RECOMMENDATION)) return recommendationRequest()
  if (matchesAny(lower, ENCAVAGE)) return encavageRequest()
  return null
}

function routeMemoryIntent(signals: RoutingSignals, tastingCreatesTask: boolean): TurnInterpretation | null {
  if (matchesAny(signals.lower, MEMORY) || signals.isTastingMemoryFollowUp) return memoryContextSwitch()
  if (matchesAny(signals.lower, TASTING)) return tastingCreatesTask ? tastingRequest() : memoryContextSwitch()
  return null
}

function routeImageTurn(signals: RoutingSignals): TurnInterpretation {
  if (/\b(carte|resto|restaurant|menu|ardoise)\b/i.test(signals.lower)) {
    return { turnType: 'task_request', cognitiveMode: 'restaurant_assistant', shouldAllowUiAction: true }
  }
  if (matchesAny(signals.lower, ENCAVAGE)) {
    return encavageRequest()
  }
  if (matchesAny(signals.lower, RECOMMENDATION)) {
    return recommendationRequest()
  }
  if (signals.isQuestion || signals.isWineCulture || /\b(penses|avis|tu connais|c'est bien|c'est bon)\b/i.test(signals.lower)) {
    return wineSmalltalk()
  }
  return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
}

function routePostTaskAck(state: ConversationState, signals: RoutingSignals): TurnInterpretation {
  if (signals.isCancel) {
    return cancelTask()
  }

  if (signals.lower.length < 30 && signals.isSocialAck) {
    return socialAck()
  }

  if (state.taskType === 'recommendation' && signals.isExploratoryRecoPivot) {
    return wineContextSwitch()
  }

  if (signals.isRefinement) {
    return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  if (state.taskType === 'recommendation' && signals.isMemoryGuidedRecommendation) {
    return { turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  const cellarRequest = routeCellarRequest(signals.lower)
  if (cellarRequest) return cellarRequest

  const memoryIntent = routeMemoryIntent(signals, true)
  if (memoryIntent) return memoryIntent

  if (signals.isInventoryQuestion) {
    return cellarContextSwitch()
  }

  if (signals.isWineCulture || signals.isQuestion) {
    return wineContextSwitch()
  }

  if (signals.lower.length < 20) {
    return socialAck()
  }

  const detectedMode = detectCognitiveMode(signals.lower)
  return {
    turnType: 'context_switch',
    cognitiveMode: detectedMode,
    shouldAllowUiAction: detectedMode === 'cellar_assistant',
  }
}

function routeCollectingInfo(state: ConversationState, signals: RoutingSignals): TurnInterpretation {
  if (signals.isCancel) {
    return cancelTask()
  }

  const memoryIntent = routeMemoryIntent(signals, false)
  if (memoryIntent) return memoryIntent

  if (signals.isInventoryQuestion) {
    return cellarContextSwitch()
  }

  return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
}

function routeDisambiguation(state: ConversationState, signals: RoutingSignals): TurnInterpretation {
  if (signals.isCancel) {
    return cancelTask()
  }
  return { turnType: 'disambiguation_answer', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
}

function routeActiveTask(state: ConversationState, signals: RoutingSignals): TurnInterpretation {
  if (signals.isCancel) {
    return cancelTask()
  }
  if (signals.isSocialAck) {
    return socialAck()
  }
  if (signals.isInventoryQuestion) {
    return cellarContextSwitch()
  }
  return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
}

function routeIdle(signals: RoutingSignals): TurnInterpretation {
  if (signals.isSocialAck) {
    return socialAck()
  }

  if (signals.hadRecentReco && signals.isRefinement) {
    return { turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  if (signals.hadRecentReco && signals.isMemoryGuidedRecommendation) {
    return { turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  const cellarRequest = routeCellarRequest(signals.lower)
  if (cellarRequest) return cellarRequest

  const memoryIntent = routeMemoryIntent(signals, true)
  if (memoryIntent) return memoryIntent

  if (signals.isInventoryQuestion) {
    return cellarContextSwitch()
  }

  if (signals.isWineCulture) {
    return wineSmalltalk()
  }

  if (signals.isQuestion) {
    return wineSmalltalk()
  }

  if (signals.hadRecentReco && signals.lower.length < 20) {
    return socialAck()
  }

  if (signals.lower.length < 20) {
    return wineSmalltalk()
  }

  return { turnType: 'unknown', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
}

export function interpretTurn(
  message: string,
  hasImage: boolean,
  state: ConversationState,
  lastAssistantText?: string,
): TurnInterpretation {
  if (message === '__greeting__') {
    return { turnType: 'greeting', cognitiveMode: 'greeting', shouldAllowUiAction: false }
  }

  if (message === '__prefetch__') {
    return {
      turnType: 'prefetch',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
      inferredTaskType: 'recommendation',
    }
  }

  const signals = buildRoutingSignals(message, lastAssistantText)

  if (hasImage) {
    return routeImageTurn(signals)
  }

  if (state.phase === 'post_task_ack') {
    return routePostTaskAck(state, signals)
  }

  if (state.phase === 'collecting_info') {
    return routeCollectingInfo(state, signals)
  }

  if (state.phase === 'disambiguation') {
    return routeDisambiguation(state, signals)
  }

  if (state.phase === 'active_task') {
    return routeActiveTask(state, signals)
  }

  return routeIdle(signals)
}
