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
