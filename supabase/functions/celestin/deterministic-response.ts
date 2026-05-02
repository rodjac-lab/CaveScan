import type { ContextPlan } from "./context-plan.ts"
import { parseGenericCellarBottleCount, parseTastingCountQuery } from "../../../shared/celestin/exact-query.ts"
import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent } from "./turn-interpreter.ts"
import type { CelestinResponse, RequestBody } from "./types.ts"

export function buildDeterministicResponse(input: {
  body: RequestBody
  routingIntent: RoutingIntent
  contextPlan: ContextPlan
  resolvedSources: ResolvedContextSources
}): CelestinResponse | null {
  if (input.body.image) return null

  if (
    input.routingIntent === 'cellar_lookup'
    && input.contextPlan.truthPolicy === 'exact_only'
    && parseGenericCellarBottleCount(input.body.message)
  ) {
    const total = input.resolvedSources.cave.totalBottles
    const references = input.resolvedSources.cave.referenceCount

    if (total === 0) {
      return {
        message: 'Ta cave est vide pour l instant.',
        ui_action: null,
        action_chips: ['Ajouter une bouteille', 'Voir la cave'],
      }
    }

    const referencePart = references === 1 ? '1 reference' : `${references} references`
    const bottlePart = total === 1 ? '1 bouteille' : `${total} bouteilles`

    return {
      message: `Tu as ${bottlePart} en cave, sur ${referencePart}.`,
      ui_action: null,
      action_chips: ['Voir la cave', 'Quels rouges ?', 'Que boire ce soir ?'],
    }
  }

  const tastingQuery = parseTastingCountQuery(input.body.message)
  if (
    tastingQuery
    && (input.routingIntent === 'tasting_log' || input.routingIntent === 'memory_lookup')
    && input.contextPlan.truthPolicy === 'memory_only'
    && input.resolvedSources.tastings
  ) {
    const total = input.resolvedSources.tastings.totalRows
    const scope = input.resolvedSources.tastings.query
      ? ` de ${input.resolvedSources.tastings.queryLabel ?? input.resolvedSources.tastings.query}`
      : ''

    if (total === 0) {
      return {
        message: `Je ne retrouve aucune degustation${scope}.`,
        ui_action: null,
        action_chips: ['Voir les degustations', 'Ajouter une degustation'],
      }
    }

    const count = total === 1 ? '1 degustation' : `${total} degustations`
    return {
      message: `Tu as ${count}${scope}.`,
      ui_action: null,
      action_chips: ['Voir les degustations', 'Retrouver une note'],
    }
  }

  return null
}
