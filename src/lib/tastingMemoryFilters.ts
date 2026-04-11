import type { Bottle } from '@/lib/types'
import type {
  ExactMemoryFilters,
  MemoryEvidenceMode,
  MemorySearchMessage,
} from '@/lib/tastingMemoryTypes'

const STOP_WORDS = new Set([
  'je', "j'ai", 'tu', 'il', 'on', 'nous', 'vous', 'ils',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'ce', 'ca', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'et', 'ou', 'mais', 'donc', 'que', 'qui', 'quoi',
  'dans', 'sur', 'avec', 'pour', 'par', 'pas', 'plus', 'bien', 'tres', 'trop',
  'est', 'sont', 'fait', 'ete', 'deja', 'encore', 'jamais', 'toujours',
  'oui', 'non', 'merci', 'aussi', 'comme', 'tout', 'tous',
  'est-ce', 'estce', 'ai', 'bu', 'goute', 'ouvert', 'ouvre', "j'en", 'jen', 'aije',
  'vin', 'vins',
])

const CONTEXTLESS_TERMS = new Set([
  'deja', 'bu', 'goute', 'ouvert', 'ouvre', "j'en", 'jen', 'aije', 'est-ce', 'estce',
  'aime', 'aimes', 'aimer', 'pense', 'penses',
  'note', 'notes', 'degustation', 'retrouve', 'retrouver',
])

const FOLLOW_UP_PATTERNS = [
  /\bj'en\b/,
  /\ben ai[- ]?je\b/,
  /\bce vin\b/,
  /\bce flacon\b/,
  /\bcette bouteille\b/,
  /\bce style\b/,
  /\bcela\b/,
  /\bca\b/,
  /^et\b/,
]

const EXACT_MEMORY_PATTERNS = [
  /\bdeja\b.*\b(bu|goute|ouvert|deguste)\b/,
  /\b(ai[- ]?je|jai|j'en|jen)\b.*\b(bu|goute|ouvert|deguste)\b/,
  /\b(quels|lesquels|combien|liste|inventaire)\b.*\b(jai|j'en|jen|deja|bu|goute|ouvert|deguste)\b/,
  /\bdeja\b.*\b(note|notes|notee|noté|notée|degustation)\b/,
  /\b(note|notes|etoiles?|rating)\b.*\b(degustation|deguste|bu|goute|mis)\b/,
  /\b(retrouve|retrouver|retrouverais|retrouvera?is|retrouveras)\b.*\b(note|notes|degustation|souvenir)\b/,
  /\bje l[' ]?ai\b.*\b(note|notee|noté|notée|deguste|goute|bu)\b/,
  /\bpas de\b/,
]

const COUNTRY_ALIASES: Record<string, string[]> = {
  italie: ['italie', 'italien', 'italiens', 'italienne', 'italiennes'],
  france: ['france', 'francais', 'francaises', 'francaise', 'francais'],
  espagne: ['espagne', 'espagnol', 'espagnols', 'espagnole', 'espagnoles'],
  portugal: ['portugal', 'portugais', 'portugaise', 'portugaises'],
  allemagne: ['allemagne', 'allemand', 'allemands', 'allemande', 'allemandes'],
  autriche: ['autriche', 'autrichien', 'autrichiens', 'autrichienne', 'autrichiennes'],
  argentine: ['argentine', 'argentin', 'argentins', 'argentine', 'argentines'],
  chili: ['chili', 'chilien', 'chiliens', 'chilienne', 'chiliennes'],
  usa: ['usa', 'etatsunis', 'etatsunis', 'amerique', 'americain', 'americains', 'americaine', 'americaines'],
  australie: ['australie', 'australien', 'australiens', 'australienne', 'australiennes'],
  'afrique du sud': ['afriquedusud', 'sudafricain', 'sudafricains', 'sudafricaine', 'sudafricaines'],
  'nouvelle zelande': ['nouvellezelande', 'neozelandais', 'neozelandaise', 'neozelandaises'],
  japon: ['japon', 'japonais', 'japonaise', 'japonaises'],
}

const FRENCH_MONTHS: Record<string, string> = {
  janvier: '01',
  fevrier: '02',
  février: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  aout: '08',
  août: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  decembre: '12',
  décembre: '12',
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim()
}

export function extractQueryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map(normalizeForMatch)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function isOneEditAway(left: string, right: string): boolean {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1) return false

  let i = 0
  let j = 0
  let edits = 0

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1
      j += 1
      continue
    }

    edits += 1
    if (edits > 1) return false

    if (left.length > right.length) i += 1
    else if (right.length > left.length) j += 1
    else {
      i += 1
      j += 1
    }
  }

  if (i < left.length || j < right.length) edits += 1
  return edits <= 1
}

export function termMatchesIdentity(term: string, field: string): boolean {
  const normalizedField = normalizeForMatch(field)
  if (!normalizedField) return false
  if (normalizedField.includes(term)) return true

  const fieldTokens = normalizedField.split(/\s+/).filter((token) => token.length > 2)
  return fieldTokens.some((token) =>
    token.includes(term)
    || term.includes(token)
    || (term.length >= 6 && token.length >= 6 && isOneEditAway(term, token))
  )
}

export function hasSpecificIdentityMatch(query: string, bottle: Bottle): boolean {
  const queryTerms = extractQueryTerms(query)
  if (queryTerms.length === 0) return false

  const identityFields = [bottle.domaine, bottle.appellation, bottle.cuvee].filter(Boolean) as string[]
  return queryTerms.some((term) => identityFields.some((field) => termMatchesIdentity(term, field)))
}

export function buildContextualMemoryQuery(
  query: string | null,
  recentMessages: MemorySearchMessage[],
): string | null {
  if (!query || query.trim().length === 0) return query

  const trimmed = query.trim()
  const normalized = normalizeForMatch(trimmed)
  const terms = extractQueryTerms(trimmed)
  const needsContext =
    FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized))
    || terms.length === 0
    || terms.every((term) => CONTEXTLESS_TERMS.has(term))
    || EXACT_MEMORY_PATTERNS.some((pattern) => pattern.test(normalized))

  if (!needsContext) return trimmed

  const priorContextTurns = recentMessages
    .slice(-6)
    .map((message) => message.text.trim())
    .filter(Boolean)
    .filter((text) => normalizeForMatch(text) !== normalized)

  if (priorContextTurns.length === 0) return trimmed
  return [...priorContextTurns, trimmed].join(' | ')
}

function emptyExactFilters(): ExactMemoryFilters {
  return { dates: [], countries: [], regions: [], appellations: [], domaines: [], cuvees: [] }
}

function addUnique(values: string[], value: string | null | undefined): void {
  if (!value) return
  if (!values.includes(value)) values.push(value)
}

export function hasAnyExactFilter(filters: ExactMemoryFilters): boolean {
  return filters.dates.length > 0
    || filters.countries.length > 0
    || filters.regions.length > 0
    || filters.appellations.length > 0
    || filters.domaines.length > 0
    || filters.cuvees.length > 0
}

function canonicalizeCountry(value: string): string {
  const normalized = normalizeForMatch(value).replace(/\s+/g, '')
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    const normalizedCanonical = canonical.replace(/\s+/g, '')
    if (normalized === normalizedCanonical || aliases.includes(normalized)) {
      return canonical
    }
  }
  return normalizeForMatch(value)
}

function queryMentionsCountry(normalizedQuery: string, country: string): boolean {
  const compactQuery = normalizedQuery.replace(/\s+/g, '')
  const canonical = canonicalizeCountry(country)
  const aliases = COUNTRY_ALIASES[canonical] ?? [canonical.replace(/\s+/g, '')]
  return aliases.some((alias) => compactQuery.includes(alias))
}

function collectUniqueFieldValues(
  drunkBottles: Bottle[],
  pick: (bottle: Bottle) => string | null,
): string[] {
  const unique = new Map<string, string>()
  for (const bottle of drunkBottles) {
    const value = pick(bottle)?.trim()
    if (!value) continue
    const key = normalizeForMatch(value)
    if (!unique.has(key)) unique.set(key, value)
  }
  return Array.from(unique.values())
}

function extractBottleDateKeys(bottle: Bottle): { iso: string; dayMonth: string } | null {
  if (!bottle.drunk_at) return null
  const date = new Date(bottle.drunk_at)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return {
    iso: `${year}-${month}-${day}`,
    dayMonth: `${day}-${month}`,
  }
}

function collectMatchingDates(
  drunkBottles: Bottle[],
  day: string,
  month: string,
  year?: string,
): Set<string> {
  const results = new Set<string>()

  for (const bottle of drunkBottles) {
    const keys = extractBottleDateKeys(bottle)
    if (!keys) continue
    if (year && keys.iso === `${year}-${month}-${day}`) results.add(keys.iso)
    else if (keys.dayMonth === `${day}-${month}`) results.add(keys.iso)
  }

  return results
}

function extractDateFiltersFromQuery(query: string, drunkBottles: Bottle[]): string[] {
  const normalizedQuery = normalizeForMatch(query)
  const results = new Set<string>()

  const explicitNumeric = normalizedQuery.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/)
  if (explicitNumeric) {
    const day = explicitNumeric[1].padStart(2, '0')
    const month = explicitNumeric[2].padStart(2, '0')
    const year = explicitNumeric[3]?.length === 2 ? `20${explicitNumeric[3]}` : explicitNumeric[3]
    for (const value of collectMatchingDates(drunkBottles, day, month, year)) results.add(value)
  }

  const explicitFrench = normalizedQuery.match(/\b(\d{1,2})\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)(?:\s+(\d{4}))?\b/)
  if (explicitFrench) {
    const day = explicitFrench[1].padStart(2, '0')
    const month = FRENCH_MONTHS[explicitFrench[2]]
    const year = explicitFrench[3]
    for (const value of collectMatchingDates(drunkBottles, day, month, year)) results.add(value)
  }

  return Array.from(results)
}

export function extractExactFiltersFromQuery(query: string, drunkBottles: Bottle[]): ExactMemoryFilters {
  const filters = emptyExactFilters()
  const normalizedQuery = normalizeForMatch(query)
  const queryTerms = extractQueryTerms(query)

  for (const isoDate of extractDateFiltersFromQuery(query, drunkBottles)) {
    addUnique(filters.dates, isoDate)
  }

  for (const country of collectUniqueFieldValues(drunkBottles, (bottle) => bottle.country)) {
    if (queryMentionsCountry(normalizedQuery, country)) addUnique(filters.countries, country)
  }

  const fieldSets: Array<{ values: string[]; target: keyof ExactMemoryFilters }> = [
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.region), target: 'regions' },
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.appellation), target: 'appellations' },
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.domaine), target: 'domaines' },
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.cuvee), target: 'cuvees' },
  ]

  for (const { values, target } of fieldSets) {
    for (const value of values) {
      if (termMatchesIdentity(normalizedQuery, value) || queryTerms.some((term) => termMatchesIdentity(term, value))) {
        addUnique(filters[target], value)
      }
    }
  }

  return filters
}

export function choosePlanningQuery(
  query: string,
  recentMessages: MemorySearchMessage[],
  drunkBottles: Bottle[],
): { planningQuery: string; filters: ExactMemoryFilters; usedConversationContext: boolean } {
  const currentFilters = extractExactFiltersFromQuery(query, drunkBottles)
  if (hasAnyExactFilter(currentFilters)) {
    return { planningQuery: query, filters: currentFilters, usedConversationContext: false }
  }

  const contextualQuery = buildContextualMemoryQuery(query, recentMessages)
  if (!contextualQuery || contextualQuery === query) {
    return { planningQuery: query, filters: currentFilters, usedConversationContext: false }
  }

  const contextualFilters = extractExactFiltersFromQuery(contextualQuery, drunkBottles)
  return {
    planningQuery: contextualQuery,
    filters: contextualFilters,
    usedConversationContext: true,
  }
}

function matchesValueList(
  value: string | null | undefined,
  acceptedValues: string[],
  matcher: (value: string, accepted: string) => boolean,
): boolean {
  if (acceptedValues.length === 0) return true
  if (!value) return false
  return acceptedValues.some((accepted) => matcher(value, accepted))
}

function matchesNormalizedValue(value: string, accepted: string): boolean {
  return normalizeForMatch(value) === normalizeForMatch(accepted)
}

export function bottleMatchesExactFilters(bottle: Bottle, filters: ExactMemoryFilters): boolean {
  const dateKeys = extractBottleDateKeys(bottle)
  const fieldChecks = [
    matchesValueList(
      bottle.country,
      filters.countries,
      (value, accepted) => canonicalizeCountry(value) === canonicalizeCountry(accepted),
    ),
    matchesValueList(bottle.region, filters.regions, matchesNormalizedValue),
    matchesValueList(bottle.appellation, filters.appellations, matchesNormalizedValue),
    matchesValueList(bottle.domaine, filters.domaines, matchesNormalizedValue),
    matchesValueList(bottle.cuvee, filters.cuvees, matchesNormalizedValue),
  ]

  return (filters.dates.length === 0 || Boolean(dateKeys && filters.dates.includes(dateKeys.iso)))
    && fieldChecks.every(Boolean)
}

export function buildFilterLabels(filters: ExactMemoryFilters): string[] {
  return ([
    ['date', filters.dates],
    ['pays', filters.countries],
    ['region', filters.regions],
    ['appellation', filters.appellations],
    ['domaine', filters.domaines],
    ['cuvee', filters.cuvees],
  ] as const).flatMap(([label, values]) => values.map((value) => `${label}=${value}`))
}

export function classifyMemoryEvidenceMode(query: string, hasFilters: boolean): MemoryEvidenceMode {
  const normalized = normalizeForMatch(query)
  if (EXACT_MEMORY_PATTERNS.some((pattern) => pattern.test(normalized))) return 'exact'
  if (hasFilters && /\b(souviens|souvenir|rappelle|rappel|soiree|soirée)\b/.test(normalized)) return 'synthesis'
  return 'synthesis'
}
