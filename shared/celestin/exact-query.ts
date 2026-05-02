export interface GenericCellarBottleCountQuery {
  kind: 'generic_cellar_bottle_count'
}

export interface TastingCountQuery {
  kind: 'tasting_count'
  query?: string
}

export interface TastingRatingQuery {
  kind: 'tasting_rating'
  query: string
}

export function normalizeExactQueryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseGenericCellarBottleCount(message: string): GenericCellarBottleCountQuery | null {
  const text = normalizeExactQueryText(message)
  if (!/\b(combien|nombre)\b/.test(text)) return null
  if (!/\bbouteilles?\b/.test(text)) return null

  const mentionsCellarScope =
    /\b(j ai|ai je|ma cave|en cave)\b/.test(text)
    || /\bcombien de bouteilles\b/.test(text)
  if (!mentionsCellarScope) return null

  // Anything after "bouteilles de X" is a filtered lookup, not a generic total.
  if (/\bbouteilles?\s+(de|d )\s+\w+/.test(text)) return null

  return { kind: 'generic_cellar_bottle_count' }
}

export function parseTastingCountQuery(message: string): TastingCountQuery | null {
  const text = normalizeExactQueryText(message)
  if (!/\b(combien|nombre)\b/.test(text)) return null
  if (!/\bdegustations?\b/.test(text)) return null

  const scoped = text.match(/\bdegustations?\s+(?:de|d )\s+(.+?)(?:\b(j ai|ai je|fait|faites|deja|deja fait|deja faites|j avais|avais je)\b|$)/)
  const query = scoped?.[1]?.trim().replace(/\s+/g, ' ')

  return query
    ? { kind: 'tasting_count', query }
    : { kind: 'tasting_count' }
}

export function parseTastingRatingQuery(message: string): TastingRatingQuery | null {
  const text = normalizeExactQueryText(message)
  const asksRating =
    /\b(combien)\b.*\b(etoiles?|note)\b/.test(text)
    || /\b(quelle|quelle etait|c etait quoi)\b.*\b(note)\b/.test(text)
    || /\bj avais mis\b.*\b(note|etoiles?)\b/.test(text)
  if (!asksRating) return null

  const scoped = text.match(/\b(?:au|a la|a l|a|sur le|sur la|sur l|pour le|pour la|pour l)\s+(.+)$/)
  const query = scoped?.[1]?.trim().replace(/\s+/g, ' ')
  if (!query) return null

  return { kind: 'tasting_rating', query }
}
