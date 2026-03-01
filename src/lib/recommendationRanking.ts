import type { Bottle, TasteProfile, WineColor } from '@/lib/types'
import type { RecommendationCard } from '@/lib/recommendationStore'

type Mode = 'generic' | 'food' | 'wine' | 'surprise'

export interface RankedBottle {
  bottle: Bottle
  score: number
}

const BADGES: RecommendationCard['badge'][] = ['De ta cave', 'Accord parfait', 'Audacieux']

const FOOD_RULES: Array<{
  terms: string[]
  prefer: WineColor[]
  avoid?: WineColor[]
}> = [
  { terms: ['poisson', 'sushi', 'fruit de mer', 'fruits de mer', 'huitre', 'huitres'], prefer: ['blanc', 'rose', 'bulles'], avoid: ['rouge'] },
  { terms: ['viande rouge', 'boeuf', 'agneau', 'gibier', 'canard'], prefer: ['rouge'] },
  { terms: ['charcuterie', 'pate', 'pates', 'pizza'], prefer: ['rouge', 'rose'] },
  { terms: ['fromage'], prefer: ['rouge', 'blanc', 'bulles'] },
  { terms: ['dessert', 'chocolat'], prefer: ['bulles', 'rose'] },
]

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function tokenize(value: string | null): string[] {
  if (!value) return []
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3)
}

function buildBottleLabel(bottle: Bottle): string {
  return [bottle.domaine, bottle.cuvee, bottle.appellation, bottle.millesime]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function inferColorWeights(mode: Mode, query: string | null): Map<WineColor, number> {
  const weights = new Map<WineColor, number>([
    ['rouge', 0],
    ['blanc', 0],
    ['rose', 0],
    ['bulles', 0],
  ])

  if (mode === 'generic' || !query) return weights
  const normalized = normalizeText(query)

  if (mode === 'wine') {
    if (normalized.includes('rouge')) weights.set('rouge', 3)
    if (normalized.includes('blanc')) weights.set('blanc', 3)
    if (normalized.includes('rose')) weights.set('rose', 3)
    if (normalized.includes('bulle') || normalized.includes('champagne')) weights.set('bulles', 3)
    return weights
  }

  for (const rule of FOOD_RULES) {
    if (!rule.terms.some((term) => normalized.includes(term))) continue
    for (const color of rule.prefer) {
      weights.set(color, (weights.get(color) ?? 0) + 2)
    }
    for (const color of rule.avoid ?? []) {
      weights.set(color, (weights.get(color) ?? 0) - 2)
    }
  }

  return weights
}

function scoreProfileAffinity(bottle: Bottle, profile: TasteProfile | null): number {
  if (!profile) return 0
  let score = 0

  const topAppellationIndex = profile.computed.topAppellations
    .slice(0, 10)
    .findIndex((a) => a.name.toLowerCase() === (bottle.appellation ?? '').toLowerCase())
  if (topAppellationIndex >= 0) score += 2 - topAppellationIndex * 0.15

  const topDomaineIndex = profile.computed.topDomaines
    .slice(0, 10)
    .findIndex((d) => d.name.toLowerCase() === (bottle.domaine ?? '').toLowerCase())
  if (topDomaineIndex >= 0) score += 2 - topDomaineIndex * 0.15

  const dist = profile.computed.colorDistribution
  const total = dist.rouge + dist.blanc + dist.rose + dist.bulles
  if (bottle.couleur && total > 0) {
    score += (dist[bottle.couleur] / total) * 2
  }

  return score
}

function scoreRecencyPenalty(bottle: Bottle, drunkBottles: Bottle[]): number {
  const recent = drunkBottles.slice(0, 8)
  for (const drunk of recent) {
    if (drunk.id === bottle.id) return -4
    const sameDomaine = !!drunk.domaine && drunk.domaine === bottle.domaine
    const sameAppellation = !!drunk.appellation && drunk.appellation === bottle.appellation
    if (sameDomaine && sameAppellation) return -2.5
  }
  return 0
}

function scoreQueryMatch(bottle: Bottle, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0
  const haystack = normalizeText(
    [bottle.domaine, bottle.cuvee, bottle.appellation, bottle.character, bottle.notes]
      .filter(Boolean)
      .join(' ')
  )
  let score = 0
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 0.8
  }
  return Math.min(score, 2.5)
}

export function rankCaveBottles(
  mode: Mode,
  query: string | null,
  caveBottles: Bottle[],
  drunkBottles: Bottle[],
  profile: TasteProfile | null,
  limit = 24,
): RankedBottle[] {
  const colorWeights = inferColorWeights(mode, query)
  const queryTokens = tokenize(query)

  const ranked = caveBottles.map((bottle) => {
    let score = 0

    if (bottle.couleur) {
      score += colorWeights.get(bottle.couleur) ?? 0
    }

    score += scoreProfileAffinity(bottle, profile)
    score += scoreRecencyPenalty(bottle, drunkBottles)
    score += scoreQueryMatch(bottle, queryTokens)

    return { bottle, score }
  })

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.bottle.id.localeCompare(b.bottle.id)
  })

  return ranked.slice(0, Math.max(1, limit))
}

export function buildLocalRecommendationCards(
  ranked: RankedBottle[],
  query: string | null,
): RecommendationCard[] {
  if (ranked.length === 0) return []

  return ranked.slice(0, 3).map(({ bottle, score }, index) => {
    const name = buildBottleLabel(bottle) || bottle.appellation || 'Selection de la cave'
    const reasonBase = query
      ? `Bon match pour "${query}" selon ton profil.`
      : 'Selection rapide basee sur tes habitudes recentes.'
    const reason = score >= 3
      ? `${reasonBase} Option tres pertinente pour ce soir.`
      : `${reasonBase} Si tu veux, je peux affiner ensuite.`

    return {
      bottle_id: bottle.id,
      name,
      appellation: bottle.appellation || 'Ta cave',
      badge: BADGES[index % BADGES.length],
      reason,
      color: bottle.couleur ?? 'rouge',
    }
  })
}
