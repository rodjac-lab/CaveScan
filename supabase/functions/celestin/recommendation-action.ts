import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"
import type { CaveBottle, CelestinResponse, RecommendationCard, RecommendationSelection } from "./types.ts"

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

function disallowedColorsForRequest(message: string | undefined): Set<RecommendationCard['color']> {
  const normalized = normalize(message)
  const isRawFishPairing = /\b(sushi|sashimi|poisson cru)\b/.test(normalized)
  const explicitlyRequestsRed = /\b(rouge|rouges)\b/.test(normalized)
    || /\b(plutot|plutot un|envie de|propose moi|cherche)\s+(un\s+)?rouge\b/.test(normalized)
    || /\b(marre|assez)\s+des\s+blancs\b/.test(normalized)
    || /\bpas\s+de\s+blancs?\b/.test(normalized)

  if (isRawFishPairing && !explicitlyRequestsRed) return new Set(['rouge'])
  return new Set()
}

function filterCardsForRequest(cards: RecommendationCard[], userMessage?: string): RecommendationCard[] {
  const disallowed = disallowedColorsForRequest(userMessage)
  if (disallowed.size === 0) return cards
  return cards.filter((card) => !disallowed.has(card.color))
}

function cardBadge(value: string | null | undefined, fallbackIndex: number): string {
  const normalized = normalize(value)
  if (normalized === 'accord parfait') return 'Accord parfait'
  if (normalized === 'de ta cave') return 'De ta cave'
  if (normalized === 'decouverte') return 'Découverte'
  if (normalized === 'audacieux') return 'Audacieux'
  return BADGES[fallbackIndex] ?? 'De ta cave'
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

function backendCardReason(bottle: CaveBottle): string {
  if (bottle.character?.trim()) return bottle.character.trim()
  if (bottle.food_pairings?.length) {
    return `Accords reperes dans ta cave : ${bottle.food_pairings.slice(0, 3).join(', ')}.`
  }
  return 'Bouteille selectionnee dans ta cave.'
}

function selectionReason(selection: RecommendationSelection, bottle: CaveBottle): string {
  return selection.reason?.trim()
    || backendCardReason(bottle)
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
      reason: backendCardReason(bottle),
      color: cardColor(bottle.couleur),
    }))
}

function findBottleForSelection(selection: RecommendationSelection, bottles: CaveBottle[]): CaveBottle | null {
  const selectionId = selection.bottle_id?.trim()
  if (selectionId) {
    const match = bottles.find((bottle) => bottle.id.startsWith(selectionId) || selectionId.startsWith(bottle.id))
    if (match) return match
  }

  const selectionText = normalize(selection.name)
  if (!selectionText) return null

  const candidates = bottles
    .map((bottle) => ({
      bottle,
      score: mentionScore(selectionText, bottle).score,
    }))
    .filter((candidate) => candidate.score >= MIN_MENTION_SCORE)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.bottle ?? null
}

function buildCardsFromSelection(
  selection: RecommendationSelection[] | null | undefined,
  bottles: CaveBottle[],
): RecommendationCard[] | null {
  if (!selection) return null

  const seen = new Set<string>()
  const cards: RecommendationCard[] = []
  for (const item of selection) {
    const bottle = findBottleForSelection(item, bottles)
    if (!bottle) continue

    const key = bottleKey(bottle)
    if (seen.has(key)) continue
    seen.add(key)

    cards.push({
      bottle_id: bottle.id,
      name: cardName(bottle),
      appellation: cardAppellation(bottle),
      millesime: bottle.millesime,
      badge: cardBadge(item.badge, cards.length),
      reason: selectionReason(item, bottle),
      color: cardColor(bottle.couleur),
    })
  }

  return cards.length > 0 ? cards.slice(0, 3) : null
}

function buildCardsFromModelAction(
  response: CelestinResponse,
  bottles: CaveBottle[],
): RecommendationCard[] | null {
  if (response.ui_action?.kind !== 'show_recommendations') return null

  const selections: RecommendationSelection[] = response.ui_action.payload.cards.map((card) => ({
    bottle_id: card.bottle_id ?? null,
    name: card.name,
    reason: null,
    badge: card.badge,
  }))

  return buildCardsFromSelection(selections, bottles)
}

function canUseRecommendationSources(resolvedSources: ResolvedContextSources): boolean {
  return (resolvedSources.cave.level === 'shortlist' || resolvedSources.cave.level === 'full_debug')
    && resolvedSources.cave.bottles.length > 0
}

function hasStructuredBottleIds(selection: RecommendationSelection[] | null | undefined): boolean {
  return !!selection?.some((item) => !!item.bottle_id?.trim())
}

function hasResolvableBottleIds(selection: RecommendationSelection[] | null | undefined): boolean {
  return !!selection?.some((item) => {
    const normalized = item.bottle_id?.trim().replace(/-/g, '') ?? ''
    return normalized.length >= 8 && /^[a-f0-9]+$/i.test(normalized)
  })
}

export function canResolveRecommendationUiAction(input: {
  response: CelestinResponse
  resolvedSources: ResolvedContextSources
  userMessage?: string
  canFetchSelectedBottleIds?: boolean
}): boolean {
  const { response, resolvedSources } = input
  if (response.ui_action?.kind === 'show_recommendations') {
    return filterCardsForRequest(response.ui_action.payload.cards, input.userMessage).length > 0
  }

  const canUseSources = canUseRecommendationSources(resolvedSources)
  const selectionCards = canUseSources
    ? buildCardsFromSelection(response.recommendation_selection, resolvedSources.cave.bottles)
    : null
  if (!selectionCards && hasStructuredBottleIds(response.recommendation_selection)) {
    return !!input.canFetchSelectedBottleIds && hasResolvableBottleIds(response.recommendation_selection)
  }
  if (!canUseSources) return false

  const cards = selectionCards ?? buildRecommendationCards(response.message, resolvedSources.cave.bottles)
  return filterCardsForRequest(cards, input.userMessage).length > 0
}

export function ensureRecommendationUiAction(input: {
  response: CelestinResponse
  interpretation: TurnInterpretation
  routingIntent: RoutingIntent
  resolvedSources: ResolvedContextSources
  userMessage?: string
  requireStructuredSelection?: boolean
}): CelestinResponse {
  const { response, interpretation, routingIntent, resolvedSources } = input
  const hasStructuredSelection = !!response.recommendation_selection?.length
  const canMaterializeRecommendation =
    (interpretation.shouldAllowUiAction && RECOMMENDATION_ROUTES.has(routingIntent))
    || hasStructuredSelection

  if (!canMaterializeRecommendation) return response
  if (response.ui_action && response.ui_action.kind !== 'show_recommendations') return response
  if (!canUseRecommendationSources(resolvedSources)) return response

  const selectionCards = buildCardsFromSelection(
    response.recommendation_selection,
    resolvedSources.cave.bottles,
  )
  if (input.requireStructuredSelection && !selectionCards) {
    if (response.ui_action?.kind !== 'show_recommendations') return response
    return { ...response, ui_action: null }
  }
  const cards = selectionCards
    ?? (response.ui_action?.kind === 'show_recommendations'
      ? buildCardsFromModelAction(response, resolvedSources.cave.bottles) ?? response.ui_action.payload.cards
      : buildRecommendationCards(response.message, resolvedSources.cave.bottles))
  const filteredCards = filterCardsForRequest(cards, input.userMessage)
  if (filteredCards.length === 0) {
    if (response.ui_action?.kind !== 'show_recommendations') return response
    return { ...response, ui_action: null }
  }

  return {
    ...response,
    ui_action: {
      kind: 'show_recommendations',
      payload: { cards: filteredCards },
    },
  }
}
