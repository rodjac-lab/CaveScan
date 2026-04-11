import type { ConversationState } from "./conversation-state.ts"
import { resolveActiveMemoryFocus } from "./memory-focus.ts"
import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"

export function buildUserPrompt(
  body: RequestBody,
  interpretation: TurnInterpretation,
  state: ConversationState,
  lastAssistantText?: string,
): string {
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
    if ((body as Record<string, unknown>).greetingContext) {
      const gc = (body as Record<string, unknown>).greetingContext as Record<string, unknown>
      parts.push(`\nContexte : ${gc.hour}h, ${gc.season ?? ''}, cave de ${gc.caveSize} bouteilles.`)
      if (gc.lastActivity) parts.push(`${gc.lastActivity}`)
    }
    return parts.join('\n')
  }

  if (turnType === 'prefetch') {
    parts.push('Demande : suggestions personnalisees pour ce soir, pas de contrainte de plat.')
    parts.push('Pas d\'accord mets-vins a appliquer : priorise la pertinence contextuelle et la diversite.')
  }

  else if (turnType === 'social_ack') {
    if (state.phase === 'post_task_ack') {
      parts.push(`[ACQUITTEMENT — L'utilisateur acquiesce apres ta derniere action. 1 phrase COURTE. Ne propose PAS d'autres vins, ne fais PAS de suggestion. Cloture chaleureuse + action_chips pour changer de sujet.]`)
    } else {
      parts.push(`[CONVERSATION — PAS de ui_action. Reponds BRIEVEMENT (1-2 phrases max) + action_chips.]`)
    }
    parts.push(body.message)
  }

  else if (turnType === 'task_cancel') {
    parts.push(`[L'utilisateur decline ou veut arreter. Reponds brievement, pas de ui_action. Propose des action_chips pour changer de sujet.]`)
    parts.push(body.message)
  }

  else if (turnType === 'smalltalk' || (turnType === 'context_switch' && cognitiveMode === 'wine_conversation')) {
    parts.push(`[QUESTION VIN — Reponds avec tes connaissances. PAS de ui_action. Sois concis et direct. N'utilise cave, memoire ou preferences que si la question le demande explicitement. Si un nom est inconnu, dis-le sans valider sa categorie implicite.]`)
    if (turnType === 'context_switch' && state.taskType === 'recommendation') {
      parts.push(`[PIVOT DE RECOMMANDATION — L'utilisateur explore une autre direction. Reponds sobrement a cette nouvelle piste sans recycler automatiquement le plat precedent, les cartes precedentes ou un souvenir marquant.]`)
    }
    parts.push(body.message)
  }

  else if (turnType === 'context_switch' && cognitiveMode === 'tasting_memory') {
    parts.push(`[SOUVENIR — L'utilisateur fait reference a une degustation passee. Utilise uniquement les souvenirs explicitement fournis. Si un vin n'apparait pas dans ces souvenirs, dis-le franchement. PAS de ui_action sauf si l'utilisateur demande explicitement de noter.]`)
    if (memoryFocus) {
      parts.push(`[FOCUS MEMOIRE — La relance courte porte probablement sur : ${memoryFocus}. Si l'utilisateur demande "combien d'etoiles", "quelle note" ou "quel millesime", reste focalise sur ce vin precis.]`)
    }
    parts.push(body.message)
  }

  else if (turnType === 'context_switch' && cognitiveMode === 'cellar_assistant') {
    parts.push(`[QUESTION CAVE - Reponds uniquement a partir de la cave transmise. Pas de ui_action. Pour les questions de quantite, compte les bouteilles a partir des quantites, pas seulement les references.]`)
    parts.push(body.message)
  }

  else if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state.phase === 'collecting_info'
    && state.taskType === 'recommendation'
  ) {
    parts.push(`[RECOMMANDATION IMMEDIATE — L'utilisateur vient d'apporter la precision manquante. Si le contexte suffit, utilise MAINTENANT show_recommendations. Base-toi sur la demande courante; n'introduis pas un autre plat, pays ou souvenir non mentionne.]`)
    parts.push(body.message)
  }

  else if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state.phase === 'collecting_info'
    && state.taskType === 'encavage'
  ) {
    parts.push(`[ENCAVAGE — L'utilisateur complete la fiche d'un vin a encaver. Si le vin est maintenant suffisamment identifie (domaine/appellation/millesime ou equivalent), envoie prepare_add_wine IMMEDIATEMENT. Ne demande PAS "tu veux que je l'ajoute ?" et ne cherche PAS une confirmation supplementaire.]`)
    parts.push(`[STYLE — Reponse tres courte. Pas de commentaire de degustation, pas d'avis sur le domaine. Juste l'accuse de reception et l'action.]`)
    parts.push(body.message)
  }

  else if (turnType === 'unknown') {
    parts.push(`[CONVERSATION — Reponds naturellement. PAS de ui_action. action_chips : questions pour approfondir le sujet, PAS de suggestions de reco cave.]`)
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  else {
    if (
      cognitiveMode === 'cellar_assistant'
      && (interpretation.inferredTaskType === 'recommendation' || state.taskType === 'recommendation')
    ) {
      parts.push(`[RECOMMANDATION — Reponds d'abord a la demande actuelle. N'invente pas un autre contexte. Ne cite un souvenir que s'il aide directement le choix, jamais pour decorer.]`)
    }
    if (cognitiveMode === 'tasting_memory' && memoryFocus) {
      parts.push(`[FOCUS MEMOIRE — La relance courte porte probablement sur : ${memoryFocus}. Reste focalise sur ce vin precis.]`)
    }
    parts.push(body.message)
    if (body.image) {
      parts.push("L'utilisateur a joint une photo. Analyse-la et reponds en fonction de ce que tu vois.")
    }
  }

  if (body.context?.recentDrunk?.length) {
    parts.push(`\nVins bus recemment (a eviter) : ${body.context.recentDrunk.join(', ')}`)
  }

  return parts.join('\n')
}
