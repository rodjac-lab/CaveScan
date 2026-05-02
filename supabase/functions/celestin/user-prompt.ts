import type { ConversationState } from "./conversation-state.ts"
import { resolveActiveMemoryFocus } from "./memory-focus.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"

export function buildUserPrompt(
  body: RequestBody,
  interpretation: TurnInterpretation,
  state: ConversationState,
  lastAssistantText?: string,
  routingIntent?: RoutingIntent,
): string {
  void routingIntent
  const parts: string[] = []
  const { turnType, cognitiveMode } = interpretation
  const memoryFocus = resolveActiveMemoryFocus(body, interpretation, state, lastAssistantText)

  if (turnType === 'greeting') {
    parts.push('DEMANDE SPECIALE : message d\'accueil a l\'ouverture de l\'app.')
    parts.push('1 phrase. Pas de ui_action. Inclus 2-3 action_chips.')
    parts.push('')
    parts.push('Le ton : comme un ami sommelier qui t\'accueille. Subtil, jamais vendeur.')
    parts.push('Inspire-toi du moment (heure, saison) et glisse une touche personnelle.')
    parts.push('Ne cite JAMAIS un vin par son nom. Ne dis pas "Salut l\'ami".')
    parts.push('')
    parts.push('Exemples du ton juste :')
    parts.push('- (8h, printemps) "Le printemps s\'installe, c\'est la saison ou les blancs reprennent du service."')
    parts.push('- (12h) "Tu as prevu quelque chose de bon ce midi ?"')
    parts.push('- (18h, vendredi) "Vendredi soir, la cave t\'attend."')
    parts.push('- (20h, hiver) "Soiree d\'hiver, il fait bon ouvrir quelque chose de reconfortant."')
    parts.push('- (apres longue absence) "Ca faisait un moment ! Ta cave n\'a pas bouge."')
    return parts.join('\n')
  }

  if (turnType === 'prefetch') {
    parts.push('Demande : suggestions personnalisees pour ce soir, pas de contrainte de plat.')
    parts.push('Pas d\'accord mets-vins a appliquer : priorise la pertinence contextuelle et la diversite.')
  }

  else if (turnType === 'social_ack') {
    if (state.phase === 'post_task_ack') {
      parts.push(`[ACQUITTEMENT — L'utilisateur acquiesce apres ta derniere action. 1 phrase COURTE. Cloture chaleureuse + action_chips pour changer de sujet. Ne lance PAS un nouveau vin, domaine, region ou souvenir non demande.]`)
    } else {
      parts.push(`[CONVERSATION — Reponds BRIEVEMENT (1-2 phrases max) + action_chips. Reste sur le sujet actif; ne pivote pas vers un autre vin ou une autre region sans demande explicite.]`)
    }
    parts.push(body.message)
  }

  else if (turnType === 'task_cancel') {
    parts.push(`[L'utilisateur decline ou veut arreter. Reponds brievement. Propose des action_chips pour changer de sujet.]`)
    parts.push(body.message)
  }

  else if (turnType === 'smalltalk' || (turnType === 'context_switch' && cognitiveMode === 'wine_conversation')) {
    parts.push(body.message)
  }

  else if (turnType === 'context_switch' && cognitiveMode === 'tasting_memory') {
    if (memoryFocus) {
      parts.push(`[FOCUS MEMOIRE — La relance courte porte probablement sur : ${memoryFocus}. Si l'utilisateur demande "combien d'etoiles", "quelle note" ou "quel millesime", reste focalise sur ce vin precis.]`)
    }
    parts.push(body.message)
  }

  else if (turnType === 'context_switch' && cognitiveMode === 'cellar_assistant') {
    parts.push(body.message)
  }

  else if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state.phase === 'collecting_info'
    && state.taskType === 'recommendation'
  ) {
    parts.push(body.message)
  }

  else if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state.phase === 'collecting_info'
    && state.taskType === 'encavage'
  ) {
    parts.push(body.message)
  }

  else if (turnType === 'unknown') {
    parts.push(`[CONVERSATION — Reponds naturellement. action_chips : questions pour approfondir le sujet, PAS de suggestions de reco cave.]`)
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  else {
    if (cognitiveMode === 'tasting_memory' && memoryFocus) {
      parts.push(`[FOCUS MEMOIRE — La relance courte porte probablement sur : ${memoryFocus}. Reste focalise sur ce vin precis.]`)
    }
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  const shouldAppendRecentDrunk =
    body.context?.recentDrunk?.length
    && cognitiveMode === 'cellar_assistant'
    && (
      interpretation.inferredTaskType === 'recommendation'
      || state.taskType === 'recommendation'
      || turnType === 'prefetch'
    )

  if (shouldAppendRecentDrunk) {
    parts.push(`\nVins bus recemment (a eviter) : ${body.context.recentDrunk.join(', ')}`)
  }

  return parts.join('\n')
}
