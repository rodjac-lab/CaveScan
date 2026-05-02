import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"
import type { CaveBottle, CelestinResponse, RecommendationCard } from "./types.ts"

const RECOMMENDATION_ROUTES: ReadonlySet<RoutingIntent> = new Set([
  'recommendation_request',
  'recommendation_refinement',
  'memory_guided_recommendation',
])

const BADGES = ['Accord parfait', 'De ta cave', 'Découverte'] as const

function cardColor(value: string | null): RecommendationCard['color'] {
  if (value === 'rouge' || value === 'blanc' || value === 'rose' || value === 'bulles') return value
  return 'rouge'
}

function cardName(bottle: CaveBottle): string {
  return [
    bottle.domaine,
    bottle.cuvee,
  ].filter(Boolean).join(' ').trim()
    || bottle.appellation
    || 'Bouteille de ta cave'
}

function cardAppellation(bottle: CaveBottle): string {
  return bottle.appellation || bottle.character || 'Dans ta cave'
}

function cardReason(bottle: CaveBottle): string {
  const pairings = bottle.food_pairings?.filter(Boolean).slice(0, 2) ?? []
  if (pairings.length > 0) {
    return `Accord repere dans ta cave : ${pairings.join(', ')}.`
  }
  if (bottle.character) {
    return bottle.character
  }
  return 'Selection prioritaire dans ta cave pour cette demande.'
}

function buildRecommendationCards(bottles: CaveBottle[]): RecommendationCard[] {
  return bottles
    .filter((bottle) => bottle.id && (bottle.domaine || bottle.cuvee || bottle.appellation))
    .slice(0, 3)
    .map((bottle, index) => ({
      bottle_id: bottle.id,
      name: cardName(bottle),
      appellation: cardAppellation(bottle),
      millesime: bottle.millesime,
      badge: BADGES[index] ?? 'De ta cave',
      reason: cardReason(bottle),
      color: cardColor(bottle.couleur),
    }))
}

export function ensureRecommendationUiAction(input: {
  response: CelestinResponse
  interpretation: TurnInterpretation
  routingIntent: RoutingIntent
  resolvedSources: ResolvedContextSources
}): CelestinResponse {
  const { response, interpretation, routingIntent, resolvedSources } = input
  if (response.ui_action) return response
  if (!interpretation.shouldAllowUiAction) return response
  if (!RECOMMENDATION_ROUTES.has(routingIntent)) return response
  if (resolvedSources.cave.level !== 'shortlist' && resolvedSources.cave.level !== 'full_debug') return response

  const cards = buildRecommendationCards(resolvedSources.cave.bottles)
  if (cards.length === 0) return response

  return {
    ...response,
    ui_action: {
      kind: 'show_recommendations',
      payload: { cards },
    },
  }
}
