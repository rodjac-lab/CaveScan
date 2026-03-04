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

export function resolveBottleIds<T extends { bottle_id?: string }>(
  cards: T[],
  bottles: { id: string }[],
): T[] {
  return cards.map((card) => {
    if (!card.bottle_id) return card
    const match = bottles.find((b) => b.id.startsWith(card.bottle_id!))
    return match ? { ...card, bottle_id: match.id } : card
  })
}
