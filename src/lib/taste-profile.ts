import { supabase } from '@/lib/supabase'
import type {
  Bottle,
  ComputedTasteProfile,
  TasteProfile,
  AppellationStat,
  DomaineStat,
  ColorDistribution,
  PriceRange,
  QPRDistribution,
  RecentTasting,
  SeasonalPattern,
  WineColor,
} from '@/lib/types'

// ── Pure computation ──

export function computeTasteProfile(
  inStockBottles: Bottle[],
  drunkBottles: Bottle[]
): ComputedTasteProfile {
  const allBottles = [...inStockBottles, ...drunkBottles]

  // 1. Stats globales
  const totalInCave = inStockBottles.length
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

  // 2. Top appellations (top 5)
  const topAppellations = computeTopGrouped(
    allBottles,
    (b) => b.appellation,
    5
  )

  // 3. Top domaines (top 5)
  const topDomaines = computeTopGrouped(
    allBottles,
    (b) => b.domaine,
    5
  )

  // 4. Distribution couleurs
  const colorDistribution = computeColorDistribution(allBottles)

  // 5. Fourchette prix
  const priceRange = computePriceRange(allBottles)

  // 6. QPR distribution
  const qprDistribution = computeQPRDistribution(drunkBottles)

  // 7. Arômes et accords (only from bottles rated >= 4)
  const likedBottles = drunkBottles.filter((b) => b.rating != null && b.rating >= 4)
  const topAromas = computeTopStrings(
    likedBottles.flatMap((b) => b.typical_aromas ?? []),
    8
  )
  const topFoodPairings = computeTopStrings(
    likedBottles.flatMap((b) => b.food_pairings ?? []),
    6
  )

  // 8. Dernières dégustations (5 dernières notées)
  const recentTastings = computeRecentTastings(drunkBottles, 5)

  // 9. Pattern saisonnier
  const seasonalPattern = computeSeasonalPattern(drunkBottles)

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
  }
}

// ── Helpers ──

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
      // Score = count weighted + avgRating bonus (rating contributes less than volume)
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
      counts[b.couleur]++
      withColor++
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
    const month = new Date(b.drunk_at).getMonth() // 0-11
    if (month >= 2 && month <= 4) pattern.spring++
    else if (month >= 5 && month <= 7) pattern.summer++
    else if (month >= 8 && month <= 10) pattern.autumn++
    else pattern.winter++
  }

  return pattern
}

// ── Fire-and-forget trigger ──

export async function triggerProfileRecompute(): Promise<void> {
  try {
    // Fetch all user bottles in parallel
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
    // Fire-and-forget: log but never throw
    console.error('[taste-profile] recompute failed:', err)
  }
}

// ── Serializer for AI prompts ──

export function serializeProfileForPrompt(profile: TasteProfile): string {
  const c = profile.computed
  const lines: string[] = []

  lines.push(`Cave: ${c.totalInCave} bouteilles en stock, ${c.totalTasted} dégustées.`)

  if (c.avgRating != null) lines.push(`Note moyenne: ${c.avgRating}/5.`)
  if (c.rebuyRate != null) lines.push(`Taux de rachat: ${c.rebuyRate}%.`)

  if (c.topAppellations.length > 0) {
    lines.push(`Appellations préférées: ${c.topAppellations.map((a) => `${a.name} (${a.count})`).join(', ')}.`)
  }
  if (c.topDomaines.length > 0) {
    lines.push(`Domaines préférés: ${c.topDomaines.map((d) => `${d.name} (${d.count})`).join(', ')}.`)
  }

  const colors = Object.entries(c.colorDistribution)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([color, pct]) => `${color} ${pct}%`)
  if (colors.length > 0) lines.push(`Répartition couleurs: ${colors.join(', ')}.`)

  if (c.priceRange.min != null && c.priceRange.max != null) {
    lines.push(`Budget: ${c.priceRange.min}-${c.priceRange.max}€ (moy. ${c.priceRange.avg}€).`)
  }

  const qprTotal = c.qprDistribution.cher + c.qprDistribution.correct + c.qprDistribution.pepite
  if (qprTotal > 0) {
    lines.push(`QPR: ${c.qprDistribution.pepite} pépites, ${c.qprDistribution.correct} corrects, ${c.qprDistribution.cher} chers.`)
  }

  if (c.topAromas.length > 0) lines.push(`Arômes appréciés: ${c.topAromas.join(', ')}.`)
  if (c.topFoodPairings.length > 0) lines.push(`Accords aimés: ${c.topFoodPairings.join(', ')}.`)

  if (c.recentTastings.length > 0) {
    const recent = c.recentTastings
      .map((t) => {
        const parts = [t.domaine, t.appellation, t.millesime].filter(Boolean).join(' ')
        return t.rating ? `${parts} (${t.rating}/5)` : parts
      })
      .join('; ')
    lines.push(`Dernières dégustations: ${recent}.`)
  }

  const seasons = Object.entries(c.seasonalPattern)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
  if (seasons.length > 0) {
    lines.push(`Saisons de dégustation: ${seasons.map(([s, n]) => `${s} (${n})`).join(', ')}.`)
  }

  // Explicit preferences
  const e = profile.explicit
  if (e.lovedRegions?.length) lines.push(`Régions aimées: ${e.lovedRegions.join(', ')}.`)
  if (e.avoidedRegions?.length) lines.push(`Régions évitées: ${e.avoidedRegions.join(', ')}.`)
  if (e.customPairings?.length) lines.push(`Accords custom: ${e.customPairings.join(', ')}.`)
  if (e.freeNotes) lines.push(`Notes: ${e.freeNotes}`)

  return lines.join('\n')
}
