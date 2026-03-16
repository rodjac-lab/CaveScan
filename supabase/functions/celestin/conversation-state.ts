// Conversation State Machine — tracks WHERE we are in the dialogue

export type ConversationPhase =
  | 'idle_smalltalk'      // Discussion légère, questions vin, pas de tâche active
  | 'active_task'          // Reco cave, reco restaurant, encavage, dégustation en cours
  | 'post_task_ack'        // Tâche rendue, on attend acquittement ou relance
  | 'collecting_info'      // Collecte d'infos pour encavage (domaine → prix → zone)
  | 'disambiguation'       // Besoin de clarification
  | 'context_switch'       // Changement de sujet (transient → reverts to idle)

export type TaskType = 'recommendation' | 'encavage' | 'tasting' | null

export interface ConversationState {
  phase: ConversationPhase
  taskType: TaskType
  lastUiActionKind: string | null
  turnsSinceLastAction: number
}

export const INITIAL_STATE: ConversationState = {
  phase: 'idle_smalltalk',
  taskType: null,
  lastUiActionKind: null,
  turnsSinceLastAction: 0,
}

function inferTaskType(uiActionKind?: string | null): TaskType {
  if (!uiActionKind) return null
  if (uiActionKind === 'show_recommendations') return 'recommendation'
  if (uiActionKind === 'prepare_add_wine' || uiActionKind === 'prepare_add_wines') return 'encavage'
  if (uiActionKind === 'prepare_log_tasting') return 'tasting'
  return null
}

export function computeNextState(
  current: ConversationState,
  turnType: string,
  responseHasUiAction: boolean,
  uiActionKind?: string | null,
  inferredTaskType?: TaskType,
): ConversationState {
  // Auto-reset: 3+ turns without ui_action → idle
  if (current.turnsSinceLastAction >= 3 && current.phase !== 'idle_smalltalk') {
    console.log('[state] Auto-reset to idle after 3 turns without action')
    return { ...INITIAL_STATE }
  }

  // Greeting/prefetch always reset
  if (turnType === 'greeting' || turnType === 'prefetch') {
    return { ...INITIAL_STATE }
  }

  // Task cancel always resets
  if (turnType === 'task_cancel') {
    return { ...INITIAL_STATE }
  }

  const resolveTask = (): TaskType =>
    inferTaskType(uiActionKind) ?? inferredTaskType ?? current.taskType

  const bump = current.turnsSinceLastAction + 1

  switch (current.phase) {
    case 'idle_smalltalk': {
      if (turnType === 'task_request' || turnType === 'unknown') {
        if (responseHasUiAction) {
          return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
        }
        return { phase: 'collecting_info', taskType: resolveTask(), lastUiActionKind: null, turnsSinceLastAction: 0 }
      }
      return { ...current, turnsSinceLastAction: bump }
    }

    case 'active_task': {
      if (responseHasUiAction) {
        return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
      }
      if (turnType === 'context_switch' || turnType === 'social_ack') {
        return { ...INITIAL_STATE }
      }
      return { ...current, turnsSinceLastAction: bump }
    }

    case 'post_task_ack': {
      if (turnType === 'social_ack') {
        return { ...INITIAL_STATE }
      }
      if (turnType === 'task_continue') {
        if (responseHasUiAction) {
          return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
        }
        return { phase: 'active_task', taskType: current.taskType, lastUiActionKind: current.lastUiActionKind, turnsSinceLastAction: 0 }
      }
      if (turnType === 'task_request') {
        if (responseHasUiAction) {
          return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
        }
        return { phase: 'collecting_info', taskType: resolveTask(), lastUiActionKind: null, turnsSinceLastAction: 0 }
      }
      // context_switch, smalltalk, or anything else → idle
      return { ...INITIAL_STATE }
    }

    case 'collecting_info': {
      if (responseHasUiAction) {
        return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
      }
      if (turnType === 'context_switch') {
        return { ...INITIAL_STATE }
      }
      // Stay collecting for task_continue, disambiguation_answer, unknown
      return { ...current, turnsSinceLastAction: bump }
    }

    case 'disambiguation': {
      if (turnType === 'disambiguation_answer' || turnType === 'task_continue') {
        if (responseHasUiAction) {
          return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
        }
        return { phase: 'active_task', taskType: current.taskType, lastUiActionKind: null, turnsSinceLastAction: 0 }
      }
      return { ...INITIAL_STATE }
    }

    case 'context_switch': {
      // Transient — always resolves
      if (turnType === 'task_request' && responseHasUiAction) {
        return { phase: 'post_task_ack', taskType: resolveTask(), lastUiActionKind: uiActionKind ?? null, turnsSinceLastAction: 0 }
      }
      return { ...INITIAL_STATE }
    }

    default:
      return { ...INITIAL_STATE }
  }
}
