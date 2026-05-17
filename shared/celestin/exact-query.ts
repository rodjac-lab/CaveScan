export interface GenericCellarBottleCountQuery {
  kind: 'generic_cellar_bottle_count'
}

export type CellarBottleCountFilter = 'rouge' | 'blanc' | 'rose' | 'bulles'

export interface FilteredCellarBottleCountQuery {
  kind: 'filtered_cellar_bottle_count'
  filter: CellarBottleCountFilter
  label: string
}

export type CellarVolumeFilter = 'magnum' | 'demi'

export interface VolumeCellarBottleCountQuery {
  kind: 'volume_cellar_bottle_count'
  filter: CellarVolumeFilter
  label: string
}

export type CellarOriginPolarity = 'has' | 'has_not'

export interface CellarOriginLookupQuery {
  kind: 'cellar_origin_lookup'
  needle: string
  label: string
  polarity: CellarOriginPolarity
}

export interface TastingCountQuery {
  kind: 'tasting_count'
  query?: string
}

export interface TastingRatingQuery {
  kind: 'tasting_rating'
  query: string
}

export type TastingExtreme = 'oldest' | 'newest' | 'best' | 'worst'

export interface TastingExtremeQuery {
  kind: 'tasting_extreme'
  extreme: TastingExtreme
  query?: string
}

export interface TastingRelationshipSpanQuery {
  kind: 'tasting_relationship_span'
}

export type TastingTopDimension = 'region' | 'appellation' | 'domaine'

export interface TastingTopQuery {
  kind: 'tasting_top'
  dimension: TastingTopDimension
}

export type ExactQuery =
  | GenericCellarBottleCountQuery
  | FilteredCellarBottleCountQuery
  | VolumeCellarBottleCountQuery
  | CellarOriginLookupQuery
  | TastingCountQuery
  | TastingRatingQuery
  | TastingExtremeQuery
  | TastingRelationshipSpanQuery
  | TastingTopQuery

export function normalizeExactQueryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[-‐‑‒–—]/g, ' ')
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

export function parseFilteredCellarBottleCount(message: string): FilteredCellarBottleCountQuery | null {
  const text = normalizeExactQueryText(message)
  if (!/\b(combien|nombre)\b/.test(text)) return null

  const mentionsCellarScope =
    /\b(j ai|ai je|ma cave|en cave)\b/.test(text)
    || /\bcombien de\b/.test(text)
  if (!mentionsCellarScope) return null

  if (/\b(rouges?|vins? rouges?|bouteilles? rouges?)\b/.test(text)) {
    return { kind: 'filtered_cellar_bottle_count', filter: 'rouge', label: 'rouges' }
  }

  if (/\b(blancs?|vins? blancs?|bouteilles? blancs?)\b/.test(text)) {
    return { kind: 'filtered_cellar_bottle_count', filter: 'blanc', label: 'blancs' }
  }

  if (/\b(roses?|vins? roses?|bouteilles? roses?)\b/.test(text)) {
    return { kind: 'filtered_cellar_bottle_count', filter: 'rose', label: 'roses' }
  }

  if (/\b(champagnes?|bulles?|petillants?|vins? petillants?|bouteilles? de champagne)\b/.test(text)) {
    return { kind: 'filtered_cellar_bottle_count', filter: 'bulles', label: 'champagnes et bulles' }
  }

  return null
}

export function parseVolumeCellarBottleCount(message: string): VolumeCellarBottleCountQuery | null {
  const text = normalizeExactQueryText(message)
  if (!/\b(combien|nombre)\b/.test(text)) return null

  const mentionsCellarScope =
    /\b(j ai|ai je|ma cave|en cave)\b/.test(text)
    || /\bcombien de\b/.test(text)
  if (!mentionsCellarScope) return null

  if (/\bmagnums?\b/.test(text)) {
    return { kind: 'volume_cellar_bottle_count', filter: 'magnum', label: 'magnums' }
  }
  if (/\b(demi[- ]bouteilles?|demis?|demi[- ]btl)\b/.test(text)) {
    return { kind: 'volume_cellar_bottle_count', filter: 'demi', label: 'demi-bouteilles' }
  }
  return null
}

const ORIGIN_HINT_TERMS: Array<{ pattern: RegExp; needles: string[]; label: string }> = [
  { pattern: /\b(italiens?|italiennes?|italie|italy)\b/, needles: ['italie', 'italy'], label: 'vins italiens' },
  { pattern: /\b(francais(es)?|france)\b/, needles: ['france'], label: 'vins francais' },
  { pattern: /\b(espagnols?|espagnoles?|espagne|spain)\b/, needles: ['espagne', 'spain'], label: 'vins espagnols' },
  { pattern: /\b(portugais(es)?|portugal)\b/, needles: ['portugal'], label: 'vins portugais' },
  { pattern: /\b(allemands?|allemandes?|allemagne|germany)\b/, needles: ['allemagne', 'germany'], label: 'vins allemands' },
  { pattern: /\b(americains?|americaines?|usa|etats[- ]unis|united states)\b/, needles: ['usa', 'etats-unis', 'united states'], label: 'vins americains' },
  { pattern: /\b(croates?|croatie|croatia)\b/, needles: ['croatie', 'croatia'], label: 'vins croates' },
  { pattern: /\b(hongrois(es)?|hongrie|hungary)\b/, needles: ['hongrie', 'hungary'], label: 'vins hongrois' },
  { pattern: /\b(roumains?|roumaines?|roumanie|romania)\b/, needles: ['roumanie', 'romania'], label: 'vins roumains' },
  { pattern: /\b(autrichiens?|autrichiennes?|autriche|austria)\b/, needles: ['autriche', 'austria'], label: 'vins autrichiens' },
  { pattern: /\b(suisses?|suisse)\b/, needles: ['suisse'], label: 'vins suisses' },
  { pattern: /\b(grecs?|grecques?|grece|greece)\b/, needles: ['grece', 'greece'], label: 'vins grecs' },
]

export function parseCellarOriginLookup(message: string): CellarOriginLookupQuery | null {
  const text = normalizeExactQueryText(message)

  const hint = ORIGIN_HINT_TERMS.find((entry) => entry.pattern.test(text))
  if (!hint) return null

  const cellarScope =
    /\b(ma cave|en cave|dans (ma )?cave|j ai|ai je)\b/.test(text)
    || /\bil (n )?y ?a (pas )?(des|du|de la|de l)?\b/.test(text)
  if (!cellarScope) return null

  const negated =
    /\b(pas de|aucun(e)?|aucuns?|jamais|n ai pas|n y a pas|n y en a pas)\b/.test(text)

  return {
    kind: 'cellar_origin_lookup',
    needle: hint.needles[0],
    label: hint.label,
    polarity: negated ? 'has_not' : 'has',
  }
}

export function originAliasNeedles(needle: string): string[] {
  const entry = ORIGIN_HINT_TERMS.find((item) => item.needles.includes(needle))
  return entry ? entry.needles : [needle]
}

export function parseTastingCountQuery(message: string): TastingCountQuery | null {
  const text = normalizeExactQueryText(message)
  if (!/\b(combien|nombre)\b/.test(text)) return null
  if (!/\bdegustations?\b/.test(text)) return null

  const scoped = text.match(/\bdegustations?\s+(?:de\s+|d\s+|avec\s+|pour\s+|sur\s+|chez\s+|a\s+|au\s+|aux\s+|en\s+)(.+?)(?:\b(j ai|ai je|fait|faites|deja|deja fait|deja faites|j avais|avais je)\b|$)/)
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

export function parseTastingExtremeQuery(message: string): TastingExtremeQuery | null {
  const text = normalizeExactQueryText(message)
  const tastingScope = /\b(degustations?|goute|bu|bue|bus|ouvert|ouverte|ouverts|note)\b/.test(text)
    || /\bquelle est la plus ancienne\b/.test(text)
    || /\bla plus ancienne\b/.test(text)
    || /\bla plus recente\b/.test(text)
  if (!tastingScope) return null

  const query = extractTastingExtremeScope(text)

  const asksOldest =
    /\bplus ancienne\b/.test(text)
    || /\b(?:premiere|premier|la premiere|le premier)\s+degustation\b/.test(text)
    || /\bdegustation\s+(?:premiere|premier|la premiere|le premier)\b/.test(text)
  if (asksOldest) {
    return query
      ? { kind: 'tasting_extreme', extreme: 'oldest', query }
      : { kind: 'tasting_extreme', extreme: 'oldest' }
  }

  const asksNewest =
    /\bplus recente\b/.test(text)
    || /\b(?:derniere|dernier|la derniere|le dernier)\s+degustation\b/.test(text)
    || /\bdegustation\s+(?:derniere|dernier|la derniere|le dernier)\b/.test(text)
  if (asksNewest) {
    return query
      ? { kind: 'tasting_extreme', extreme: 'newest', query }
      : { kind: 'tasting_extreme', extreme: 'newest' }
  }

  if (/\b(meilleure|meilleur|mieux notee|mieux note|plus haute note|note la plus haute)\b/.test(text)) {
    return query
      ? { kind: 'tasting_extreme', extreme: 'best', query }
      : { kind: 'tasting_extreme', extreme: 'best' }
  }

  if (/\b(pire|moins bonne|moins bon|moins bien notee|moins bien note|plus basse note|note la plus basse)\b/.test(text)) {
    return query
      ? { kind: 'tasting_extreme', extreme: 'worst', query }
      : { kind: 'tasting_extreme', extreme: 'worst' }
  }

  return null
}

function extractTastingExtremeScope(text: string): string | undefined {
  const match = text.match(/\bdegustations?\s+(?:de\s+|d\s+)(.+)$/)
    ?? text.match(/\b(?:meilleure|meilleur|pire|plus ancienne|plus recente|derniere|dernier|premiere|premier)\s+(?:degustation\s+)?(?:de\s+|d\s+)(.+)$/)
  const raw = match?.[1]
    ?.replace(/\b(notee?|notes?|enregistree?|dans l historique)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return raw || undefined
}

export function parseTastingRelationshipSpanQuery(message: string): TastingRelationshipSpanQuery | null {
  const text = normalizeExactQueryText(message)
  if (!/\b(depuis quand|depuis combien de temps|combien de temps)\b/.test(text)) return null
  if (!/\b(on se connait|tu me connais|tu me suis|avec toi|ensemble|nous)\b/.test(text)) return null
  return { kind: 'tasting_relationship_span' }
}

export function parseTastingTopQuery(message: string): TastingTopQuery | null {
  const text = normalizeExactQueryText(message)
  const asksTop =
    /\b(le|la|les)\s+plus\b/.test(text)
    || /\b(top|classement|domin(e|ent|ante|antes)|reviennent? le plus|le plus souvent|majoritaire)\b/.test(text)
  if (!asksTop) return null

  const tastingScope = /\b(degustations?|goute|goutes|bu|bue|bus|bues|deguste|degustee|degustees)\b/.test(text)
  if (!tastingScope) return null

  if (/\b(regions?|region viticole|coin|coins)\b/.test(text)) {
    return { kind: 'tasting_top', dimension: 'region' }
  }
  if (/\b(appellations?|aop|aoc)\b/.test(text)) {
    return { kind: 'tasting_top', dimension: 'appellation' }
  }
  if (/\b(domaines?|producteurs?|vignerons?|maisons?)\b/.test(text)) {
    return { kind: 'tasting_top', dimension: 'domaine' }
  }
  return null
}

export function parseExactQuery(message: string): ExactQuery | null {
  return parseGenericCellarBottleCount(message)
    ?? parseFilteredCellarBottleCount(message)
    ?? parseVolumeCellarBottleCount(message)
    ?? parseCellarOriginLookup(message)
    ?? parseTastingCountQuery(message)
    ?? parseTastingRatingQuery(message)
    ?? parseTastingExtremeQuery(message)
    ?? parseTastingRelationshipSpanQuery(message)
    ?? parseTastingTopQuery(message)
}

export function isExactCellarQuery(query: ExactQuery | null): boolean {
  return query?.kind === 'generic_cellar_bottle_count'
    || query?.kind === 'filtered_cellar_bottle_count'
    || query?.kind === 'volume_cellar_bottle_count'
    || query?.kind === 'cellar_origin_lookup'
}

export function isExactTastingQueryKind(query: ExactQuery | null): boolean {
  return query?.kind === 'tasting_count'
    || query?.kind === 'tasting_rating'
    || query?.kind === 'tasting_extreme'
    || query?.kind === 'tasting_relationship_span'
    || query?.kind === 'tasting_top'
}
