import type { ContextPlan } from "./context-plan.ts"
import type { ConversationState } from "./conversation-state.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"

export function buildContextPlanInstructions(
  contextPlan: ContextPlan,
  options: {
    interpretation?: TurnInterpretation
    state?: ConversationState
    routingIntent?: RoutingIntent
  } = {},
): string {
  const parts: string[] = []
  const { interpretation, state, routingIntent } = options
  const turnType = interpretation?.turnType
  const cognitiveMode = interpretation?.cognitiveMode

  if (contextPlan.truthPolicy === 'exact_only') {
    parts.push('[VERITE EXACTE — Reponds uniquement depuis les faits deterministes fournis ou les outils autorises. Si le fait exact manque, dis-le clairement.]')
  } else if (contextPlan.truthPolicy === 'memory_only') {
    parts.push('[VERITE MEMOIRE — Reponds uniquement depuis les degustations, souvenirs ou faits memoire fournis/recuperes. Ne transforme pas un profil vague en souvenir vecu.]')
    parts.push('[STYLE FACTUEL — Donne le fait exact en premiere phrase, puis ajoute au maximum une phrase naturelle d ami sommelier.]')
  }

  if (contextPlan.cave === 'tool_only') {
    parts.push('[CAVE OUTIL — Pour les questions de cave, utilise les faits exacts ou query_cellar. Compte les quantites de bouteilles, pas seulement les references.]')
  }

  if (contextPlan.cellarCandidates === 'preempted') {
    parts.push('[CANDIDATS CAVE — Les bouteilles disponibles te sont fournies dans le contexte. Choisis 1 a 3 bottle_id parmi cette liste pour recommendation_selection. N invente pas un bottle_id, ne propose pas une bouteille hors liste.]')
  }

  if (contextPlan.tools === 'force_tastings') {
    parts.push('[DEGUSTATIONS OUTIL — Pour une question de nombre, liste, verification "ai-je / je n ai pas", note, millesime ou domaine deja bu, utilise query_tastings ou les degustations resolues.]')
  } else if (contextPlan.tools === 'force_personal') {
    parts.push('[FAITS PERSONNELS OUTIL — Pour une affirmation sur ce que l utilisateur a bu, aime, note, mentionne ou vecu, utilise une source active : query_tastings, query_memory, profil compile fourni, ou historique recent explicite. N affirme pas un nom personnel absent des sources.]')
  } else if (contextPlan.tools === 'force_memory') {
    parts.push('[MEMOIRE OUTIL — Pour un fait personnel precis, utilise query_memory ou les faits memoire resolus.]')
  } else if (contextPlan.tools === 'auto') {
    parts.push('[OUTILS AUTO — Pour une question personnelle sur la cave, une degustation passee, un restaurant, un lieu, une note ou un souvenir precis, utilise l outil adapte. Pour une question generale de culture vin, reponds sans outil.]')
  }

  if (contextPlan.memories === 'targeted') {
    parts.push('[SOUVENIRS CIBLES — Cite un souvenir seulement s il aide directement le choix ou la conversation. Ne l utilise jamais comme decoration.]')
  }

  if (cognitiveMode === 'wine_conversation') {
    parts.push('[QUESTION VIN — Reponds avec tes connaissances. Sois concis et direct. N utilise cave, memoire ou preferences que si la question le demande explicitement. Si un nom est inconnu, dis-le sans valider sa categorie implicite.]')
  }

  if (cognitiveMode === 'tasting_memory') {
    parts.push('[SOUVENIR — L utilisateur fait reference a une degustation passee. Utilise uniquement les souvenirs explicitement fournis ou les degustations recuperees. Si un vin n apparait pas dans ces sources, dis-le franchement.]')
  }

  if (routingIntent === 'exploratory_reco_pivot') {
    parts.push('[PIVOT EXPLORATOIRE — L utilisateur change d angle apres une recommandation. Reponds a la nouvelle piste comme une question autonome. Ne mentionne pas le plat precedent, ne reprends pas les cartes precedentes et ne donne pas de shortlist.]')
  } else if (turnType === 'context_switch' && state?.taskType === 'recommendation' && cognitiveMode === 'wine_conversation') {
    parts.push('[PIVOT DE RECOMMANDATION — L utilisateur explore une autre direction. Reponds sobrement a cette nouvelle piste sans recycler automatiquement le plat precedent, les cartes precedentes ou un souvenir marquant.]')
  }

  if (
    cognitiveMode === 'cellar_assistant'
    && (interpretation?.inferredTaskType === 'recommendation' || state?.taskType === 'recommendation')
  ) {
    if (turnType === 'task_request' || (turnType === 'task_continue' && state?.phase === 'collecting_info')) {
      parts.push('[RECOMMANDATION IMMEDIATE — Si la demande actuelle suffit, choisis 2-3 bouteilles de la cave dans recommendation_selection. Base-toi sur la demande courante ; n introduis pas un autre plat, pays ou souvenir non mentionne.]')
    } else if (routingIntent === 'recommendation_refinement') {
      parts.push('[NOUVELLE SELECTION — L utilisateur demande d autres bouteilles ou une variante. Fournis une nouvelle recommendation_selection, en respectant la nouvelle contrainte.]')
    } else {
      parts.push('[RECOMMANDATION — Reponds d abord a la demande actuelle. N invente pas un autre contexte. Ne cite un souvenir que s il aide directement le choix.]')
    }
  }

  if (
    turnType === 'task_continue'
    && cognitiveMode === 'cellar_assistant'
    && state?.phase === 'collecting_info'
    && state.taskType === 'encavage'
  ) {
    parts.push('[ENCAVAGE — Si le vin est maintenant suffisamment identifie, envoie prepare_add_wine immediatement. Ne demande pas une confirmation supplementaire. Reponse tres courte, sans commentaire de degustation ni avis sur le domaine.]')
  }

  return parts.join('\n')
}
