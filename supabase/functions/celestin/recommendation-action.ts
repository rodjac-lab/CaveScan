import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"
import type { CaveBottle, CelestinResponse, RecommendationCard } from "./types.ts"

const RECOMMENDATION_ROUTES: ReadonlySet<RoutingIntent> = new Set([
  'recommendation_request',
  'recommendation_refinement',
  'memory_guided_recommendation',
])

const BADGES = ['Accord parfait', 'De ta cave', 'Découverte'] as const
const MIN_MENTION_SCORE = 8

function normalize(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return phrase.length > 0 && new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(haystack)
}

function sentenceForBottle(message: string, bottle: CaveBottle): string | null {
  const needles = [
    normalize(bottle.domaine),
    normalize(bottle.cuvee),
    normalize(bottle.appellation),
  ].filter((needle) => needle.length >= 4)

  const sentences = message
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  const match = sentences.find((sentence) => {
    const normalized = normalize(sentence)
    return needles.some((needle) => containsPhrase(normalized, needle))
  })

  if (!match) return null
  return match.length > 180 ? `${match.slice(0, 177).trim()}...` : match
}

function mentionScore(message: string, bottle: CaveBottle): { score: number; firstIndex: number } {
  const normalizedMessage = normalize(message)
  const fields = [
    { value: bottle.domaine, weight: 6 },
    { value: bottle.cuvee, weight: 6 },
    { value: bottle.appellation, weight: 3 },
    { value: bottle.millesime, weight: 2 },
  ]

  let score = 0
  let firstIndex = Number.MAX_SAFE_INTEGER
  for (const field of fields) {
    const normalizedField = normalize(field.value)
    if (!containsPhrase(normalizedMessage, normalizedField)) continue
    score += field.weight
    const index = normalizedMessage.indexOf(normalizedField)
    if (index >= 0) firstIndex = Math.min(firstIndex, index)
  }

  return { score, firstIndex }
}

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

function cardReason(bottle: CaveBottle, message: string): string {
  return sentenceForBottle(message, bottle)
    ?? bottle.character
    ?? 'Bouteille citee par Celestin pour cette demande.'
}

function bottleKey(bottle: CaveBottle): string {
  return [
    normalize(bottle.domaine),
    normalize(bottle.cuvee),
    normalize(bottle.appellation),
    normalize(bottle.millesime),
  ].join('|')
}

function buildRecommendationCards(message: string, bottles: CaveBottle[]): RecommendationCard[] {
  const seen = new Set<string>()
  return bottles
    .filter((bottle) => bottle.id && (bottle.domaine || bottle.cuvee || bottle.appellation))
    .map((bottle) => ({ bottle, ...mentionScore(message, bottle) }))
    .filter((candidate) => candidate.score >= MIN_MENTION_SCORE)
    .sort((a, b) => a.firstIndex - b.firstIndex || b.score - a.score)
    .filter(({ bottle }) => {
      const key = bottleKey(bottle)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
    .map(({ bottle }, index) => ({
      bottle_id: bottle.id,
      name: cardName(bottle),
      appellation: cardAppellation(bottle),
      millesime: bottle.millesime,
      badge: BADGES[index] ?? 'De ta cave',
      reason: cardReason(bottle, message),
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

  const cards = buildRecommendationCards(response.message, resolvedSources.cave.bottles)
  if (cards.length === 0) return response

  return {
    ...response,
    ui_action: {
      kind: 'show_recommendations',
      payload: { cards },
    },
  }
}
