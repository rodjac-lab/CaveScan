import { supabase } from '@/lib/supabase'
import type {
  Bottle,
  ComputedTasteProfile,
  TasteProfile,
  TastingTags,
  TagFrequency,
  AppellationStat,
  DomaineStat,
  ColorDistribution,
  PriceRange,
  QPRDistribution,
  RecentTasting,
  SeasonalPattern,
  WineColor,
} from '@/lib/types'

// Pure computation

export function computeTasteProfile(
  inStockBottles: Bottle[],
  drunkBottles: Bottle[]
): ComputedTasteProfile {
  const allBottles = [...inStockBottles, ...drunkBottles]

  const totalInCave = inStockBottles.reduce((sum, b) => sum + (b.quantity ?? 1), 0)
  const totalTasted = drunkBottles.length

  const ratedBottles = drunkBottles.filter((b) => b.rating != null)
  const avgRating =
    ratedBottles.length > 0
      ? Math.round((ratedBottles.reduce((sum, b) => sum + b.rating!, 0) / ratedBottles.length) * 10) / 10
      : null

  const rebuyEligible = drunkBottles.filter((b) => b.rebuy != null)
  const rebuyRate =
    rebuyEligible.length > 0
      ? Math.round((rebuyEligible.filter((b) => b.rebuy === true).length / rebuyEligible.length) * 100)
      : null

  const topAppellations = computeTopGrouped(allBottles, (b) => b.appellation, 5)
  const topDomaines = computeTopGrouped(allBottles, (b) => b.domaine, 5)
  const colorDistribution = computeColorDistribution(allBottles)
  const priceRange = computePriceRange(allBottles)
  const qprDistribution = computeQPRDistribution(drunkBottles)

  const likedBottles = drunkBottles.filter((b) => b.rating != null && b.rating >= 4)
  const topAromas = computeTopStrings(
    likedBottles.flatMap((b) => b.typical_aromas ?? []),
    8
  )
  const topFoodPairings = computeTopStrings(
    likedBottles.flatMap((b) => b.food_pairings ?? []),
    6
  )

  const recentTastings = computeRecentTastings(drunkBottles, 5)
  const seasonalPattern = computeSeasonalPattern(drunkBottles)

  // Aggregate tasting tags from lived experiences
  const { livedPairings, userDescriptors, typicalOccasions } = aggregateTastingTags(drunkBottles)

  return {
    totalInCave,
    totalTasted,
    avgRating,
    rebuyRate,
    topAppellations,
    topDomaines,
    colorDistribution,
    priceRange,
    qprDistribution,
    topAromas,
    topFoodPairings,
    recentTastings,
    seasonalPattern,
    dataPoints: allBottles.length,
    livedPairings,
    userDescriptors,
    typicalOccasions,
  }
}

function computeTopGrouped(
  bottles: Bottle[],
  keyFn: (b: Bottle) => string | null,
  limit: number
): (AppellationStat | DomaineStat)[] {
  const groups = new Map<string, { count: number; ratingSum: number; ratedCount: number }>()

  for (const b of bottles) {
    const key = keyFn(b)
    if (!key) continue
    const entry = groups.get(key) ?? { count: 0, ratingSum: 0, ratedCount: 0 }
    entry.count++
    if (b.rating != null) {
      entry.ratingSum += b.rating
      entry.ratedCount++
    }
    groups.set(key, entry)
  }

  return Array.from(groups.entries())
    .map(([name, { count, ratingSum, ratedCount }]) => {
      const avgRating = ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null
      const score = count + (avgRating ?? 0) * 0.5
      return { name, count, avgRating, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function computeColorDistribution(bottles: Bottle[]): ColorDistribution {
  const dist: ColorDistribution = { rouge: 0, blanc: 0, rose: 0, bulles: 0 }
  if (bottles.length === 0) return dist

  const counts: Record<WineColor, number> = { rouge: 0, blanc: 0, rose: 0, bulles: 0 }
  let withColor = 0

  for (const b of bottles) {
    if (b.couleur && b.couleur in counts) {
      const qty = b.quantity ?? 1
      counts[b.couleur] += qty
      withColor += qty
    }
  }

  if (withColor > 0) {
    dist.rouge = Math.round((counts.rouge / withColor) * 100)
    dist.blanc = Math.round((counts.blanc / withColor) * 100)
    dist.rose = Math.round((counts.rose / withColor) * 100)
    dist.bulles = Math.round((counts.bulles / withColor) * 100)
  }

  return dist
}

function computePriceRange(bottles: Bottle[]): PriceRange {
  const prices = bottles.map((b) => b.purchase_price).filter((p): p is number => p != null)
  if (prices.length === 0) return { min: null, max: null, avg: null }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100,
  }
}

function computeQPRDistribution(drunkBottles: Bottle[]): QPRDistribution {
  const dist: QPRDistribution = { cher: 0, correct: 0, pepite: 0 }

  for (const b of drunkBottles) {
    if (b.qpr === 1) dist.cher++
    else if (b.qpr === 2) dist.correct++
    else if (b.qpr === 3) dist.pepite++
  }

  return dist
}

function computeTopStrings(values: string[], limit: number): string[] {
  const counts = new Map<string, number>()

  for (const v of values) {
    const normalized = v.trim().toLowerCase()
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

function aggregateTastingTags(drunkBottles: Bottle[]): {
  livedPairings: TagFrequency[]
  userDescriptors: TagFrequency[]
  typicalOccasions: TagFrequency[]
} {
  const platCounts = new Map<string, number>()
  const descCounts = new Map<string, number>()
  const occasionCounts = new Map<string, number>()

  for (const b of drunkBottles) {
    const tags = b.tasting_tags as TastingTags | null
    if (!tags) continue

    for (const plat of tags.plats ?? []) {
      const key = plat.trim().toLowerCase()
      if (key) platCounts.set(key, (platCounts.get(key) ?? 0) + 1)
    }

    for (const desc of tags.descripteurs ?? []) {
      const key = desc.trim().toLowerCase()
      if (key) descCounts.set(key, (descCounts.get(key) ?? 0) + 1)
    }

    if (tags.occasion) {
      const key = tags.occasion.trim().toLowerCase()
      if (key) occasionCounts.set(key, (occasionCounts.get(key) ?? 0) + 1)
    }
  }

  const toSorted = (map: Map<string, number>, limit: number): TagFrequency[] =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }))

  return {
    livedPairings: toSorted(platCounts, 8),
    userDescriptors: toSorted(descCounts, 8),
    typicalOccasions: toSorted(occasionCounts, 5),
  }
}

function computeRecentTastings(drunkBottles: Bottle[], limit: number): RecentTasting[] {
  return drunkBottles
    .filter((b) => b.drunk_at != null)
    .sort((a, b) => new Date(b.drunk_at!).getTime() - new Date(a.drunk_at!).getTime())
    .slice(0, limit)
    .map((b) => ({
      bottleId: b.id,
      domaine: b.domaine,
      appellation: b.appellation,
      millesime: b.millesime,
      rating: b.rating,
      drunkAt: b.drunk_at!,
    }))
}

function computeSeasonalPattern(drunkBottles: Bottle[]): SeasonalPattern {
  const pattern: SeasonalPattern = { spring: 0, summer: 0, autumn: 0, winter: 0 }

  for (const b of drunkBottles) {
    if (!b.drunk_at) continue
    const month = new Date(b.drunk_at).getMonth()
    if (month >= 2 && month <= 4) pattern.spring++
    else if (month >= 5 && month <= 7) pattern.summer++
    else if (month >= 8 && month <= 10) pattern.autumn++
    else pattern.winter++
  }

  return pattern
}

// Fire-and-forget trigger

export async function triggerProfileRecompute(): Promise<void> {
  try {
    const [inStockRes, drunkRes] = await Promise.all([
      supabase
        .from('bottles')
        .select('*')
        .eq('status', 'in_stock'),
      supabase
        .from('bottles')
        .select('*')
        .eq('status', 'drunk'),
    ])

    const inStock = (inStockRes.data ?? []) as Bottle[]
    const drunk = (drunkRes.data ?? []) as Bottle[]

    const computed = computeTasteProfile(inStock, drunk)
    const now = new Date().toISOString()

    await supabase
      .from('user_taste_profiles')
      .upsert(
        {
          computed_profile: computed,
          computed_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )
  } catch (err) {
    console.error('[taste-profile] recompute failed:', err)
  }
}

// Serializer for AI prompts

export function serializeProfileForPrompt(profile: TasteProfile): string {
  const c = profile.computed
  const lines: string[] = []

  lines.push(`Cave: ${c.totalInCave} bouteilles en stock, ${c.totalTasted} degustees.`)

  if (c.avgRating != null) lines.push(`Note moyenne: ${c.avgRating}/5.`)
  if (c.rebuyRate != null) lines.push(`Taux de rachat: ${c.rebuyRate}%.`)

  if (c.topAppellations.length > 0) {
    lines.push(`Appellations preferees: ${c.topAppellations.map((a) => `${a.name} (${a.count})`).join(', ')}.`)
  }
  if (c.topDomaines.length > 0) {
    lines.push(`Domaines preferes: ${c.topDomaines.map((d) => `${d.name} (${d.count})`).join(', ')}.`)
  }

  const colors = Object.entries(c.colorDistribution)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([color, pct]) => `${color} ${pct}%`)
  if (colors.length > 0) lines.push(`Repartition couleurs: ${colors.join(', ')}.`)

  if (c.priceRange.min != null && c.priceRange.max != null) {
    lines.push(`Budget: ${c.priceRange.min}-${c.priceRange.max}EUR (moy. ${c.priceRange.avg}EUR).`)
  }

  const qprTotal = c.qprDistribution.cher + c.qprDistribution.correct + c.qprDistribution.pepite
  if (qprTotal > 0) {
    lines.push(`QPR: ${c.qprDistribution.pepite} pepites, ${c.qprDistribution.correct} corrects, ${c.qprDistribution.cher} chers.`)
  }

  if (c.recentTastings.length > 0) {
    const recent = c.recentTastings
      .map((t) => {
        const parts = [t.domaine, t.appellation, t.millesime].filter(Boolean).join(' ')
        return t.rating ? `${parts} (${t.rating}/5)` : parts
      })
      .join('; ')
    lines.push(`Dernieres degustations: ${recent}.`)
  }

  const seasons = Object.entries(c.seasonalPattern)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
  if (seasons.length > 0) {
    lines.push(`Saisons de degustation: ${seasons.map(([s, n]) => `${s} (${n})`).join(', ')}.`)
  }

  // Aggregated tasting tags — lived experiences
  if (c.livedPairings?.length > 0) {
    lines.push(`Plats associes a tes vins (vecu) : ${c.livedPairings.map(p => `${p.name} (x${p.count})`).join(', ')}.`)
  }
  if (c.userDescriptors?.length > 0) {
    lines.push(`Tes descripteurs recurrents : ${c.userDescriptors.map(d => `${d.name} (x${d.count})`).join(', ')}.`)
  }
  if (c.typicalOccasions?.length > 0) {
    lines.push(`Occasions typiques : ${c.typicalOccasions.map(o => `${o.name} (x${o.count})`).join(', ')}.`)
  }

  const e = profile.explicit
  if (e.lovedRegions?.length) lines.push(`Regions aimees: ${e.lovedRegions.join(', ')}.`)
  if (e.avoidedRegions?.length) lines.push(`Regions evitees: ${e.avoidedRegions.join(', ')}.`)
  if (e.customPairings?.length) lines.push(`Accords custom: ${e.customPairings.join(', ')}.`)
  if (e.freeNotes) lines.push(`Notes: ${e.freeNotes}`)

  return lines.join('\n')
}
