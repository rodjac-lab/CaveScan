import type { ContextPlan } from "./context-plan.ts"

export function buildContextPlanInstructions(contextPlan: ContextPlan): string {
  const parts: string[] = []

  if (contextPlan.truthPolicy === 'exact_only') {
    parts.push('[VERITE EXACTE — Reponds uniquement depuis les faits deterministes fournis ou les outils autorises. Si le fait exact manque, dis-le clairement.]')
  } else if (contextPlan.truthPolicy === 'memory_only') {
    parts.push('[VERITE MEMOIRE — Reponds uniquement depuis les degustations, souvenirs ou faits memoire fournis/recuperes. Ne transforme pas un profil vague en souvenir vecu.]')
    parts.push('[STYLE FACTUEL — Donne le fait exact en premiere phrase, puis ajoute au maximum une phrase naturelle d ami sommelier.]')
  }

  if (contextPlan.cave === 'tool_only') {
    parts.push('[CAVE OUTIL — Pour les questions de cave, utilise les faits exacts ou query_cellar. Compte les quantites de bouteilles, pas seulement les references.]')
  }

  if (contextPlan.tools === 'force_tastings') {
    parts.push('[DEGUSTATIONS OUTIL — Pour une question de nombre, liste, verification "ai-je / je n ai pas", note, millesime ou domaine deja bu, utilise query_tastings ou les degustations resolues.]')
  } else if (contextPlan.tools === 'force_memory') {
    parts.push('[MEMOIRE OUTIL — Pour un fait personnel precis, utilise query_memory ou les faits memoire resolus.]')
  }

  if (contextPlan.memories === 'targeted') {
    parts.push('[SOUVENIRS CIBLES — Cite un souvenir seulement s il aide directement le choix ou la conversation. Ne l utilise jamais comme decoration.]')
  }

  return parts.join('\n')
}
