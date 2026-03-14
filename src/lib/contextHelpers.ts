/**
 * Shared helpers for building context sent to the Celestin edge function.
 * Used by both CeSoirModule (live chat) and useRecommendations (prefetch).
 */

export function getSeason(): string {
  const month = new Date().getMonth()
  if (month >= 2 && month <= 4) return 'printemps'
  if (month >= 5 && month <= 7) return 'été'
  if (month >= 8 && month <= 10) return 'automne'
  return 'hiver'
}

export function getDayOfWeek(): string {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long' })
}

export function formatDrunkSummary(b: { domaine: string | null; appellation: string | null; millesime: number | null }): string {
  return [b.domaine, b.appellation, b.millesime].filter(Boolean).join(' ')
}

function buildResolvedCardFields(bottle: {
  domaine?: string | null
  cuvee?: string | null
  appellation?: string | null
  millesime?: number | null
}) {
  const name = [bottle.domaine, bottle.cuvee].filter(Boolean).join(' — ')
  const appellation = [bottle.appellation, bottle.millesime].filter(Boolean).join(' ')
  return {
    name: name || bottle.appellation || 'Selection de la cave',
    appellation: appellation || bottle.appellation || '',
  }
}

export interface GreetingContext {
  hour: number
  dayOfWeek: string
  season: string
  caveSize: number
  readyToDrink: string[]
  notOpenedInAWhile: string[]
  recentDrunk: string[]
  lastActivity: string | null
}

export function buildGreetingContext(
  caveBottles: Array<{ domaine: string | null; appellation: string | null; millesime: number | null; drink_from: number | null; drink_until: number | null; added_at: string }>,
  drunkBottles: Array<{ domaine: string | null; appellation: string | null; millesime: number | null; drunk_at: string | null }>,
): GreetingContext {
  const now = new Date()
  const currentYear = now.getFullYear()

  // Bottles entering their maturity window
  const readyToDrink = caveBottles
    .filter(b => b.drink_from && b.drink_from <= currentYear && (!b.drink_until || b.drink_until >= currentYear))
    .slice(0, 5)
    .map(b => [b.domaine, b.appellation, b.millesime].filter(Boolean).join(' '))

  // Bottles added more than 3 months ago and never mentioned in recent drinks
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const notOpenedInAWhile = caveBottles
    .filter(b => b.added_at < threeMonthsAgo)
    .slice(0, 3)
    .map(b => [b.domaine, b.appellation, b.millesime].filter(Boolean).join(' '))

  // Recent drinks
  const recentDrunk = drunkBottles.slice(0, 3).map(formatDrunkSummary)

  // Last activity
  const lastDrunk = drunkBottles[0]?.drunk_at ?? null
  const lastAdded = caveBottles[0]?.added_at ?? null
  const lastActivity = lastDrunk && lastAdded
    ? (lastDrunk > lastAdded ? `Dernière dégustation: ${lastDrunk.slice(0, 10)}` : `Dernier ajout: ${lastAdded.slice(0, 10)}`)
    : lastDrunk ? `Dernière dégustation: ${lastDrunk.slice(0, 10)}`
    : lastAdded ? `Dernier ajout: ${lastAdded.slice(0, 10)}`
    : null

  return {
    hour: now.getHours(),
    dayOfWeek: getDayOfWeek(),
    season: getSeason(),
    caveSize: caveBottles.length,
    readyToDrink,
    notOpenedInAWhile,
    recentDrunk,
    lastActivity,
  }
}

export function resolveBottleIds<T extends { bottle_id?: string; name?: string; appellation?: string }>(
  cards: T[],
  bottles: Array<{ id: string; domaine?: string | null; cuvee?: string | null; appellation?: string | null; millesime?: number | null }>,
): T[] {
  return cards.map((card) => {
    if (!card.bottle_id) return card
    const match = bottles.find((b) => b.id.startsWith(card.bottle_id!))
    if (!match) return card
    const resolved = buildResolvedCardFields(match)
    return {
      ...card,
      bottle_id: match.id,
      name: resolved.name,
      appellation: resolved.appellation,
    }
  })
}
