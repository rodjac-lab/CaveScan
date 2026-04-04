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

function isCellarFollowUp(text: string, lastAssistantText?: string): boolean {
  if (!lastAssistantText) return false

  const assistantWasTalkingAboutCellar =
    /\b(cave|bouteilles?|enregistre|enregistree|enregistres|tu n'as|tu as)\b/i.test(lastAssistantText)

  if (!assistantWasTalkingAboutCellar) return false

  return /\b(c'est pas du|c'en est pas|tu en as pas)\b/i.test(text)
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

  const lower = message.toLowerCase().trim()
  const hadRecentReco = lastAssistantText?.includes('[Vins proposes')
  const isInventoryQuestion = matchesAny(lower, CELLAR_LOOKUP) || isCellarFollowUp(lower, lastAssistantText)

  if (hasImage) {
    if (/\b(carte|resto|restaurant|menu|ardoise)\b/i.test(lower)) {
      return { turnType: 'task_request', cognitiveMode: 'restaurant_assistant', shouldAllowUiAction: true }
    }
    if (matchesAny(lower, ENCAVAGE)) {
      return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'encavage' }
    }
    if (matchesAny(lower, RECOMMENDATION)) {
      return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
    }
    if (matchesAny(lower, QUESTION) || matchesAny(lower, WINE_CULTURE) || /\b(penses|avis|tu connais|c'est bien|c'est bon)\b/i.test(lower)) {
      return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
    }
    return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  if (state.phase === 'post_task_ack') {
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    if (lower.length < 30 && matchesAny(lower, SOCIAL_ACK)) {
      return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    if (matchesAny(lower, REFINEMENT)) {
      return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
    }

    if (matchesAny(lower, RECOMMENDATION)) {
      return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
    }
    if (matchesAny(lower, ENCAVAGE)) {
      return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'encavage' }
    }
    if (matchesAny(lower, TASTING)) {
      return { turnType: 'task_request', cognitiveMode: 'tasting_memory', shouldAllowUiAction: true, inferredTaskType: 'tasting' }
    }

    if (matchesAny(lower, MEMORY)) {
      return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
    }

    if (isInventoryQuestion) {
      return { turnType: 'context_switch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: false }
    }

    if (matchesAny(lower, WINE_CULTURE) || matchesAny(lower, QUESTION)) {
      return { turnType: 'context_switch', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
    }

    if (lower.length < 20) {
      return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    const detectedMode = detectCognitiveMode(lower)
    return {
      turnType: 'context_switch',
      cognitiveMode: detectedMode,
      shouldAllowUiAction: detectedMode === 'cellar_assistant',
    }
  }

  if (state.phase === 'collecting_info') {
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    if (matchesAny(lower, MEMORY) || matchesAny(lower, TASTING)) {
      return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
    }

    if (isInventoryQuestion) {
      return { turnType: 'context_switch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: false }
    }

    return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  if (state.phase === 'disambiguation') {
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }
    return { turnType: 'disambiguation_answer', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  if (state.phase === 'active_task') {
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }
    if (matchesAny(lower, SOCIAL_ACK)) {
      return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
    }
    if (isInventoryQuestion) {
      return { turnType: 'context_switch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: false }
    }
    return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  if (matchesAny(lower, SOCIAL_ACK)) {
    return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
  }

  if (hadRecentReco && matchesAny(lower, REFINEMENT)) {
    return { turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  if (matchesAny(lower, RECOMMENDATION)) {
    return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
  }

  if (matchesAny(lower, ENCAVAGE)) {
    return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'encavage' }
  }

  if (matchesAny(lower, TASTING)) {
    return { turnType: 'task_request', cognitiveMode: 'tasting_memory', shouldAllowUiAction: true, inferredTaskType: 'tasting' }
  }

  if (matchesAny(lower, MEMORY)) {
    return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
  }

  if (isInventoryQuestion) {
    return { turnType: 'context_switch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: false }
  }

  if (matchesAny(lower, WINE_CULTURE)) {
    return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
  }

  if (matchesAny(lower, QUESTION)) {
    return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
  }

  if (hadRecentReco && lower.length < 20) {
    return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
  }

  if (lower.length < 20) {
    return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
  }

  return { turnType: 'unknown', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
}
