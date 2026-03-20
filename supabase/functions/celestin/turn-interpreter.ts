// Turn Interpreter — replaces classifyIntent with state-aware, context-aware routing
// Produces 2 decisions: turnType (WHAT to do) + cognitiveMode (HOW to think)

import type { ConversationState, TaskType } from './conversation-state.ts'

export type CognitiveMode =
  | 'wine_conversation'      // culture vin, cépages, terroirs
  | 'cellar_assistant'       // reco cave, encavage, lookup
  | 'restaurant_assistant'   // photo carte, conseil resto
  | 'tasting_memory'         // souvenirs, logger dégustation

export type TurnType =
  | 'greeting'
  | 'prefetch'
  | 'social_ack'         // merci, super, ok, top
  | 'smalltalk'          // ça va, question générale
  | 'task_request'       // demande explicite de reco/encavage/dégustation
  | 'task_continue'      // raffinement dans la même tâche ("plutôt un rouge")
  | 'task_cancel'        // "non merci", "laisse tomber"
  | 'disambiguation_answer' // réponse à une question de clarification
  | 'context_switch'     // changement de sujet, rappel mémoire
  | 'unknown'            // le LLM décidera

export interface TurnInterpretation {
  turnType: TurnType
  cognitiveMode: CognitiveMode | 'greeting' | 'social'
  shouldAllowUiAction: boolean
  inferredTaskType?: TaskType
}

// === Pattern banks ===

const SOCIAL_ACK = [
  /^(merci|super|ok|d'accord|parfait|g[eé]nial|cool|top|nice|bien|bonne id[eé]e|ah ok|je vois|compris|entendu|c'est bon|haha|mdr|lol)[.! ]*$/i,
]

const CANCEL = [
  /^(non merci|pas pour moi|[cç]a ira|laisse tomber|tant pis|on oublie|rien|non c'est bon|non rien)[.! ]*$/i,
]

const RECOMMENDATION = [
  /\b(que? boire|recommande|propose|ce soir|pour accompagner|ouvre[- ]moi|quel vin|avec (ce|le|du|des|mon|ma|mes|un|une)|accord|accords mets)/i,
  /\b(pour aller avec|pour manger|pour d[iî]ner|pour le repas)/i,
  /\b(qu.est-ce que j.ouvr|je pourrais ouvrir|quelque chose [àa] ouvrir|qu.est-ce qu.on ouvre|on ouvre quoi|quoi ouvrir)/i,
]

const REFINEMENT = [
  /\b(en blanc|en rouge|en ros[ée]|en bulles|un blanc|un rouge|une bulle|autre chose|une autre|plutot un|sinon)\b/i,
  /\b(tu en as|t.en as|d.autres?|en as[- ]tu)\b/i,
]

const ENCAVAGE = [
  /\b(achet[eé]|re[cç]u|command[eé]|encave[rz]?|ajoute[rz]?|arriv[eé]|livr[eé]|ramen[eé]|stocke[rz]?|j'ai pris|j'ai achet[eé])\b/i,
]

const TASTING = [
  /\b(d[eé]gust[eé]|bu |ouvert |go[uû]t[eé]|hier soir|on a bu|note [cç]a|d[ée]gustation)\b/i,
]

const MEMORY = [
  /\b(tu te souviens|la derni[eè]re fois|chez \w+|on avait bu|rappelle|souvenir)\b/i,
]

const WINE_CULTURE = [
  /\b(c'est quoi|qu'est-ce qu|diff[eé]rence entre|les terroirs|parle[- ]moi|explique|raconte|dis[- ]moi)\b/i,
  /^(le |la |les |un |une |du )?(pinot|chardonnay|merlot|cabernet|syrah|grenache|gamay|chenin|riesling|sauvignon|malbec|nebbiolo|sangiovese|tempranillo)\b/i,
]

const QUESTION = [
  /^(pourquoi|comment|quoi|c'est quoi|qu'est-ce qu|est-ce que|tu (aimes?|connais|pref[eè]res|penses|sais|crois))/i,
]

// === Helpers ===

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text))
}

function taskTypeToMode(taskType: TaskType): CognitiveMode {
  if (taskType === 'tasting') return 'tasting_memory'
  return 'cellar_assistant'
}

function detectCognitiveMode(lower: string): CognitiveMode {
  if (matchesAny(lower, MEMORY) || matchesAny(lower, TASTING)) return 'tasting_memory'
  if (matchesAny(lower, RECOMMENDATION) || matchesAny(lower, ENCAVAGE)) return 'cellar_assistant'
  return 'wine_conversation'
}

// === Main interpreter ===

export function interpretTurn(
  message: string,
  hasImage: boolean,
  state: ConversationState,
  lastAssistantText?: string,
): TurnInterpretation {
  // Special synthetic messages
  if (message === '__greeting__') {
    return { turnType: 'greeting', cognitiveMode: 'greeting', shouldAllowUiAction: false }
  }
  if (message === '__prefetch__') {
    return { turnType: 'prefetch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
  }

  const lower = message.toLowerCase().trim()
  const hadRecentReco = lastAssistantText?.includes('[Vins proposés')

  // Image: check for restaurant context, otherwise default to cellar_assistant
  if (hasImage) {
    if (/\b(carte|resto|restaurant|menu|ardoise)\b/i.test(lower)) {
      return { turnType: 'task_request', cognitiveMode: 'restaurant_assistant', shouldAllowUiAction: true }
    }
    return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  // === State-aware interpretation ===

  if (state.phase === 'post_task_ack') {
    // After a task was completed — most sensitive state

    // Cancel
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    // Short social ack → done
    if (lower.length < 30 && matchesAny(lower, SOCIAL_ACK)) {
      return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    // Refinement → continue the task (state already tells us we just finished a task)
    if (matchesAny(lower, REFINEMENT)) {
      return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
    }

    // New explicit task
    if (matchesAny(lower, RECOMMENDATION)) {
      return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
    }
    if (matchesAny(lower, ENCAVAGE)) {
      return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'encavage' }
    }
    if (matchesAny(lower, TASTING)) {
      return { turnType: 'task_request', cognitiveMode: 'tasting_memory', shouldAllowUiAction: true, inferredTaskType: 'tasting' }
    }

    // Memory recall → context switch
    if (matchesAny(lower, MEMORY)) {
      return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
    }

    // Wine culture question → context switch
    if (matchesAny(lower, WINE_CULTURE) || matchesAny(lower, QUESTION)) {
      return { turnType: 'context_switch', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
    }

    // Short message → likely social
    if (lower.length < 20) {
      return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    // Longer message → new topic
    return { turnType: 'context_switch', cognitiveMode: detectCognitiveMode(lower), shouldAllowUiAction: true }
  }

  if (state.phase === 'collecting_info') {
    // Multi-turn task in progress (e.g., encavage conversationnel)

    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }

    // Memory recall → context switch out of the collection
    if (matchesAny(lower, MEMORY)) {
      return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
    }

    // Most messages are answers to Celestin's questions → continue
    return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  if (state.phase === 'disambiguation') {
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }
    // Answer to Celestin's clarification question
    return { turnType: 'disambiguation_answer', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  if (state.phase === 'active_task') {
    if (matchesAny(lower, CANCEL)) {
      return { turnType: 'task_cancel', cognitiveMode: 'social', shouldAllowUiAction: false }
    }
    if (matchesAny(lower, SOCIAL_ACK)) {
      return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
    }
    // Continue the task
    return { turnType: 'task_continue', cognitiveMode: taskTypeToMode(state.taskType), shouldAllowUiAction: true }
  }

  // === idle_smalltalk (default) ===
  // Note: also handles backward compat when frontend doesn't send state yet
  // (backend always sees idle_smalltalk, so we use lastAssistantText as fallback)
  // hadRecentReco already declared above (line ~105)

  // Social ack — but if after a recent reco, treat as post-task ack
  if (matchesAny(lower, SOCIAL_ACK)) {
    return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
  }

  // Refinement after a recent reco (fallback for missing state)
  if (hadRecentReco && matchesAny(lower, REFINEMENT)) {
    return { turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
  }

  // Explicit recommendation request
  if (matchesAny(lower, RECOMMENDATION)) {
    return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }
  }

  // Encavage request
  if (matchesAny(lower, ENCAVAGE)) {
    return { turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'encavage' }
  }

  // Tasting request
  if (matchesAny(lower, TASTING)) {
    return { turnType: 'task_request', cognitiveMode: 'tasting_memory', shouldAllowUiAction: true, inferredTaskType: 'tasting' }
  }

  // Memory recall
  if (matchesAny(lower, MEMORY)) {
    return { turnType: 'context_switch', cognitiveMode: 'tasting_memory', shouldAllowUiAction: false }
  }

  // Wine culture question
  if (matchesAny(lower, WINE_CULTURE)) {
    return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
  }

  // General question
  if (matchesAny(lower, QUESTION)) {
    return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
  }

  // Short message after a recent reco → social ack (fallback for missing state)
  if (hadRecentReco && lower.length < 20) {
    return { turnType: 'social_ack', cognitiveMode: 'social', shouldAllowUiAction: false }
  }

  // Short message → likely smalltalk
  if (lower.length < 20) {
    return { turnType: 'smalltalk', cognitiveMode: 'wine_conversation', shouldAllowUiAction: false }
  }

  // Unknown → let LLM decide with full context
  return { turnType: 'unknown', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }
}
