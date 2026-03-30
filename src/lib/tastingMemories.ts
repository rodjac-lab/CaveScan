import { supabase } from '@/lib/supabase'
import type { Bottle, TastingTags } from '@/lib/types'
import { searchSemanticMemories } from '@/lib/semanticMemory'

type Mode = 'generic' | 'food' | 'wine' | 'surprise'

export interface MemorySearchMessage {
  role: 'user' | 'celestin'
  text: string
}

export type MemoryEvidenceMode = 'exact' | 'synthesis' | 'semantic'

export interface MemoryEvidenceBundle {
  mode: MemoryEvidenceMode
  planningQuery: string
  usedConversationContext: boolean
  matchedFilters: string[]
  memories: Bottle[]
  serialized: string
}

function buildBottleContext(bottle: Bottle): string {
  return [bottle.domaine, bottle.appellation, bottle.millesime, bottle.couleur]
    .filter(Boolean)
    .join(', ')
}

export function extractAndSaveTags(bottle: Bottle): void {
  const note = bottle.tasting_note
  if (!note || note.trim().length === 0) return

  ;(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('extract-tasting-tags', {
        body: {
          tasting_note: note,
          bottle_context: buildBottleContext(bottle),
        },
      })

      if (error) {
        console.warn('[tastingMemories] Edge function error:', error)
        return
      }

      const tags = data as TastingTags
      if (!tags || (!tags.plats?.length && !tags.descripteurs?.length && !tags.sentiment)) {
        console.log('[tastingMemories] No meaningful tags extracted, skipping save')
        return
      }

      const { error: updateError } = await supabase
        .from('bottles')
        .update({ tasting_tags: tags })
        .eq('id', bottle.id)

      if (updateError) {
        console.warn('[tastingMemories] Failed to save tags:', updateError)
      } else {
        console.log('[tastingMemories] Tags saved for bottle', bottle.id)
      }
    } catch (err) {
      console.warn('[tastingMemories] Unexpected error:', err)
    }
  })()
}

interface ScoredMemory {
  bottle: Bottle
  score: number
  relevanceScore: number
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s'-]/g, '') // strip punctuation (keep apostrophes and hyphens)
    .trim()
}

const STOP_WORDS = new Set([
  'je', "j'ai", 'tu', 'il', 'on', 'nous', 'vous', 'ils',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'ce', 'ca', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'et', 'ou', 'mais', 'donc', 'que', 'qui', 'quoi',
  'dans', 'sur', 'avec', 'pour', 'par', 'pas', 'plus', 'bien', 'tres', 'trop',
  'est', 'sont', 'fait', 'ete', 'deja', 'encore', 'jamais', 'toujours',
  'oui', 'non', 'merci', 'aussi', 'comme', 'tout', 'tous',
  'est-ce', 'estce', 'ai', 'bu', 'goute', 'ouvert', 'ouvre', "j'en", 'jen', 'aije',
])

const CONTEXTLESS_TERMS = new Set([
  'deja', 'bu', 'goute', 'ouvert', 'ouvre', "j'en", 'jen', 'aije', 'est-ce', 'estce',
  'aime', 'aimes', 'aimer', 'pense', 'penses',
])

const FOLLOW_UP_PATTERNS = [
  /\bj'en\b/,
  /\ben ai[- ]?je\b/,
  /\bce vin\b/,
  /\bce style\b/,
  /\bcela\b/,
  /\bca\b/,
  /^et\b/,
]

const EXACT_MEMORY_PATTERNS = [
  /\bdeja\b.*\b(bu|goute|ouvert|deguste)\b/,
  /\b(ai[- ]?je|jai|j'en|jen)\b.*\b(bu|goute|ouvert|deguste)\b/,
  /\b(quels|lesquels|combien|liste|inventaire)\b.*\b(jai|j'en|jen|deja|bu|goute|ouvert|deguste)\b/,
  /\bpas de\b/,
]

const SYNTHESIS_MEMORY_PATTERNS = [
  /\b(aime|aimes|aimer|aimais)\b/,
  /\b(pense|penses|avis)\b/,
  /\b(prefere|preferee|preferee|meilleur|meilleure|lequel|laquelle)\b/,
  /\b(occasion|occasions|quand|avec quoi|sur quoi)\b/,
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

interface ExactMemoryFilters {
  countries: string[]
  regions: string[]
  appellations: string[]
  domaines: string[]
  cuvees: string[]
}

function extractQueryTerms(query: string): string[] {
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

    if (left.length > right.length) {
      i += 1
    } else if (right.length > left.length) {
      j += 1
    } else {
      i += 1
      j += 1
    }
  }

  if (i < left.length || j < right.length) edits += 1
  return edits <= 1
}

function termMatchesIdentity(term: string, field: string): boolean {
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

function hasSpecificIdentityMatch(query: string, bottle: Bottle): boolean {
  const queryTerms = extractQueryTerms(query)
  if (queryTerms.length === 0) return false

  const identityFields = [bottle.domaine, bottle.appellation, bottle.cuvee].filter(Boolean) as string[]
  return queryTerms.some((term) => identityFields.some((field) => termMatchesIdentity(term, field)))
}

function mergeUniqueMemories(primary: Bottle[], secondary: Bottle[], limit: number): Bottle[] {
  const merged = new Map<string, Bottle>()

  for (const bottle of [...primary, ...secondary]) {
    if (!merged.has(bottle.id)) {
      merged.set(bottle.id, bottle)
    }
    if (merged.size >= limit) break
  }

  return Array.from(merged.values()).slice(0, limit)
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

  if (!needsContext) return trimmed

  const priorUserTurns = recentMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean)
    .filter((text) => normalizeForMatch(text) !== normalized)

  if (priorUserTurns.length === 0) return trimmed

  return [...priorUserTurns.slice(-2), trimmed].join(' | ')
}

function emptyExactFilters(): ExactMemoryFilters {
  return { countries: [], regions: [], appellations: [], domaines: [], cuvees: [] }
}

function addUnique(values: string[], value: string | null | undefined): void {
  if (!value) return
  if (!values.includes(value)) {
    values.push(value)
  }
}

function hasAnyExactFilter(filters: ExactMemoryFilters): boolean {
  return filters.countries.length > 0
    || filters.regions.length > 0
    || filters.appellations.length > 0
    || filters.domaines.length > 0
    || filters.cuvees.length > 0
}

function hasNarrowExactFilter(filters: ExactMemoryFilters): boolean {
  return filters.appellations.length > 0
    || filters.domaines.length > 0
    || filters.cuvees.length > 0
}

function isBroadExactFilter(filters: ExactMemoryFilters): boolean {
  return hasAnyExactFilter(filters) && !hasNarrowExactFilter(filters)
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
    if (!unique.has(key)) {
      unique.set(key, value)
    }
  }

  return Array.from(unique.values())
}

function extractExactFiltersFromQuery(query: string, drunkBottles: Bottle[]): ExactMemoryFilters {
  const filters = emptyExactFilters()
  const normalizedQuery = normalizeForMatch(query)
  const queryTerms = extractQueryTerms(query)

  for (const country of collectUniqueFieldValues(drunkBottles, (bottle) => bottle.country)) {
    if (queryMentionsCountry(normalizedQuery, country)) {
      addUnique(filters.countries, country)
    }
  }

  const fieldSets: Array<{ values: string[]; target: keyof ExactMemoryFilters }> = [
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.region), target: 'regions' },
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.appellation), target: 'appellations' },
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.domaine), target: 'domaines' },
    { values: collectUniqueFieldValues(drunkBottles, (bottle) => bottle.cuvee), target: 'cuvees' },
  ]

  for (const { values, target } of fieldSets) {
    for (const value of values) {
      if (termMatchesIdentity(normalizedQuery, value)) {
        addUnique(filters[target], value)
        continue
      }

      if (queryTerms.some((term) => termMatchesIdentity(term, value))) {
        addUnique(filters[target], value)
      }
    }
  }

  return filters
}

function choosePlanningQuery(
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
  if (hasAnyExactFilter(contextualFilters)) {
    return { planningQuery: contextualQuery, filters: contextualFilters, usedConversationContext: true }
  }

  return { planningQuery: contextualQuery, filters: contextualFilters, usedConversationContext: true }
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

function bottleMatchesExactFilters(bottle: Bottle, filters: ExactMemoryFilters): boolean {
  const countryMatch = matchesValueList(
    bottle.country,
    filters.countries,
    (value, accepted) => canonicalizeCountry(value) === canonicalizeCountry(accepted),
  )
  const regionMatch = matchesValueList(
    bottle.region,
    filters.regions,
    (value, accepted) => normalizeForMatch(value) === normalizeForMatch(accepted),
  )
  const appellationMatch = matchesValueList(
    bottle.appellation,
    filters.appellations,
    (value, accepted) => normalizeForMatch(value) === normalizeForMatch(accepted),
  )
  const domaineMatch = matchesValueList(
    bottle.domaine,
    filters.domaines,
    (value, accepted) => normalizeForMatch(value) === normalizeForMatch(accepted),
  )
  const cuveeMatch = matchesValueList(
    bottle.cuvee,
    filters.cuvees,
    (value, accepted) => normalizeForMatch(value) === normalizeForMatch(accepted),
  )

  return countryMatch && regionMatch && appellationMatch && domaineMatch && cuveeMatch
}

function sortMemoriesForEvidence(memories: Bottle[], mode: MemoryEvidenceMode): Bottle[] {
  return [...memories].sort((left, right) => {
    const leftDays = daysSince(left.drunk_at)
    const rightDays = daysSince(right.drunk_at)
    const leftHasNote = left.tasting_note && left.tasting_note.trim().length > 0 ? 1 : 0
    const rightHasNote = right.tasting_note && right.tasting_note.trim().length > 0 ? 1 : 0

    if (mode === 'synthesis' && leftHasNote !== rightHasNote) {
      return rightHasNote - leftHasNote
    }

    if (leftDays !== rightDays) {
      return leftDays - rightDays
    }

    const leftRating = left.rating ?? 0
    const rightRating = right.rating ?? 0
    if (leftRating !== rightRating) {
      return rightRating - leftRating
    }

    return ([left.domaine, left.cuvee, left.appellation].filter(Boolean).join(' '))
      .localeCompare([right.domaine, right.cuvee, right.appellation].filter(Boolean).join(' '))
  })
}

function buildFilterLabels(filters: ExactMemoryFilters): string[] {
  return [
    ...filters.countries.map((value) => `pays=${value}`),
    ...filters.regions.map((value) => `region=${value}`),
    ...filters.appellations.map((value) => `appellation=${value}`),
    ...filters.domaines.map((value) => `domaine=${value}`),
    ...filters.cuvees.map((value) => `cuvee=${value}`),
  ]
}

function classifyMemoryEvidenceMode(query: string, hasFilters: boolean): MemoryEvidenceMode {
  const normalized = normalizeForMatch(query)

  if (EXACT_MEMORY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'exact'
  }

  if (SYNTHESIS_MEMORY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'synthesis'
  }

  if (/\bautres?\b/.test(normalized) && hasFilters) {
    return 'exact'
  }

  return 'semantic'
}

function findPreviousNarrowFilters(
  currentQuery: string,
  recentMessages: MemorySearchMessage[],
  drunkBottles: Bottle[],
): ExactMemoryFilters | null {
  const normalizedCurrent = normalizeForMatch(currentQuery)

  const priorUserTurns = recentMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean)
    .filter((text) => normalizeForMatch(text) !== normalizedCurrent)
    .reverse()

  for (const turn of priorUserTurns) {
    const filters = extractExactFiltersFromQuery(turn, drunkBottles)
    if (hasNarrowExactFilter(filters)) {
      return filters
    }
  }

  return null
}

function maybeExcludePreviousFocus(
  query: string,
  exactMatches: Bottle[],
  currentFilters: ExactMemoryFilters,
  recentMessages: MemorySearchMessage[],
  drunkBottles: Bottle[],
): Bottle[] {
  const normalized = normalizeForMatch(query)
  if (!/\bautres?\b/.test(normalized) || !isBroadExactFilter(currentFilters)) {
    return exactMatches
  }

  const previousFilters = findPreviousNarrowFilters(query, recentMessages, drunkBottles)
  if (!previousFilters) return exactMatches

  const filtered = exactMatches.filter((bottle) => !bottleMatchesExactFilters(bottle, previousFilters))
  return filtered.length > 0 ? filtered : exactMatches
}

function serializeEvidenceBundle(
  mode: MemoryEvidenceMode,
  query: string,
  matchedFilters: string[],
  usedConversationContext: boolean,
  memories: Bottle[],
): string {
  const noteCount = memories.filter((bottle) => bottle.tasting_note && bottle.tasting_note.trim().length > 0).length
  const lines: string[] = []

  if (mode === 'exact') {
    lines.push('Inventaire exact de degustation.')
    lines.push('N ajoute aucun autre vin que ceux fournis ci-dessous.')
  } else if (mode === 'synthesis') {
    lines.push('Base exacte de synthese sur degustations passees.')
    lines.push('Ne generalise pas au dela des vins fournis ci-dessous.')
  } else {
    lines.push('Souvenirs de degustation pertinents.')
    lines.push('Utilise ces souvenirs comme points d appui, sans les forcer.')
  }

  lines.push(`Question actuelle : ${query.trim()}`)
  if (matchedFilters.length > 0) {
    lines.push(`Filtres reconnus : ${matchedFilters.join(', ')}`)
  }
  if (usedConversationContext) {
    lines.push('Le sujet a ete complete avec le contexte recent de la conversation.')
  }
  lines.push(`Degustations fournies : ${memories.length}${mode === 'synthesis' ? ` (${noteCount} avec note exploitable)` : ''}.`)

  if (memories.length === 0) {
    lines.push('Aucun resultat exact trouve parmi les bouteilles marquees comme bues.')
    return lines.join('\n')
  }

  return `${lines.join('\n')}\n\n${serializeMemoriesForPrompt(memories)}`
}

export async function buildMemoryEvidenceBundle(input: {
  query: string
  recentMessages: MemorySearchMessage[]
  drunkBottles: Bottle[]
  limit?: number
}): Promise<MemoryEvidenceBundle | null> {
  const { query, recentMessages, drunkBottles, limit = 7 } = input
  if (!query.trim() || drunkBottles.length === 0) return null

  const planning = choosePlanningQuery(query, recentMessages, drunkBottles)
  const mode = classifyMemoryEvidenceMode(query, hasAnyExactFilter(planning.filters))

  if (mode === 'exact') {
    const baseMatches = hasAnyExactFilter(planning.filters)
      ? drunkBottles.filter((bottle) => bottleMatchesExactFilters(bottle, planning.filters))
      : drunkBottles
    const exactMatches = maybeExcludePreviousFocus(query, baseMatches, planning.filters, recentMessages, drunkBottles)
    const sorted = sortMemoriesForEvidence(exactMatches, mode)

    return {
      mode,
      planningQuery: planning.planningQuery,
      usedConversationContext: planning.usedConversationContext,
      matchedFilters: buildFilterLabels(planning.filters),
      memories: sorted,
      serialized: serializeEvidenceBundle(mode, query, buildFilterLabels(planning.filters), planning.usedConversationContext, sorted),
    }
  }

  if (mode === 'synthesis' && hasAnyExactFilter(planning.filters)) {
    const exactMatches = sortMemoriesForEvidence(
      drunkBottles.filter((bottle) => bottleMatchesExactFilters(bottle, planning.filters)),
      mode,
    )

    return {
      mode,
      planningQuery: planning.planningQuery,
      usedConversationContext: planning.usedConversationContext,
      matchedFilters: buildFilterLabels(planning.filters),
      memories: exactMatches,
      serialized: serializeEvidenceBundle(mode, query, buildFilterLabels(planning.filters), planning.usedConversationContext, exactMatches),
    }
  }

  const semanticMatches = await selectRelevantMemoriesAsync('generic', planning.planningQuery, drunkBottles, limit)
  const sorted = sortMemoriesForEvidence(semanticMatches, 'semantic')

  return {
    mode: 'semantic',
    planningQuery: planning.planningQuery,
    usedConversationContext: planning.usedConversationContext,
    matchedFilters: buildFilterLabels(planning.filters),
    memories: sorted,
    serialized: serializeEvidenceBundle('semantic', query, buildFilterLabels(planning.filters), planning.usedConversationContext, sorted),
  }
}

function countTermMatches(normalizedQuery: string, terms: string[]): number {
  let matches = 0
  for (const term of terms) {
    if (normalizedQuery.includes(normalizeForMatch(term))) {
      matches++
    }
  }
  return matches
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, diff / (1000 * 60 * 60 * 24))
}

export function selectRelevantMemories(
  mode: Mode,
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
): Bottle[] {
  const withNotes = drunkBottles.filter((b) => b.tasting_note && b.tasting_note.trim().length > 0)
  if (withNotes.length === 0) return []

  const hasQuery = query != null && query.trim().length > 0
  const normalizedQuery = hasQuery ? normalizeForMatch(query) : ''
  const fallbackWords = hasQuery ? extractQueryTerms(query) : []

  const scored: ScoredMemory[] = withNotes.map((bottle) => {
    let score = 0
    let relevanceScore = 0
    const tags = bottle.tasting_tags as TastingTags | null

    if (hasQuery) {
      // Search in bottle identity fields (domaine, appellation, cuvee) — strongest signal
      const identityFields = [bottle.domaine, bottle.appellation, bottle.cuvee].filter(Boolean) as string[]
      for (const word of fallbackWords) {
        for (const field of identityFields) {
          if (termMatchesIdentity(word, field)) {
            relevanceScore += 5
          }
        }
      }

      // Search in tasting tags
      if (tags) {
        if (mode === 'food') {
          relevanceScore += countTermMatches(normalizedQuery, tags.plats) * 4
          relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
        } else if (mode === 'wine') {
          relevanceScore += countTermMatches(normalizedQuery, tags.descripteurs) * 4
          relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
        } else {
          relevanceScore += countTermMatches(normalizedQuery, tags.plats) * 3
          relevanceScore += countTermMatches(normalizedQuery, tags.descripteurs) * 3
          relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
        }
      }

      // Search in tasting note text (cumulative, not just fallback)
      if (bottle.tasting_note) {
        const normalizedNote = normalizeForMatch(bottle.tasting_note)
        for (const word of fallbackWords) {
          if (normalizedNote.includes(word)) {
            relevanceScore += 2
          }
        }
      }
    }

    score += relevanceScore

    if (tags?.sentiment === 'excellent') score += 3
    else if (tags?.sentiment === 'bon') score += 1

    if (bottle.rating != null) {
      if (bottle.rating >= 4) score += 1.5
      if (bottle.rating === 5) score += 1.0
    }

    const days = daysSince(bottle.drunk_at)
    if (days < 30) score += 1.5
    else if (days < 90) score += 0.8
    else if (days < 180) score += 0.3

    return { bottle, score, relevanceScore }
  })

  // If query matched specific tags, prefer those
  const relevantOnly = hasQuery
    ? scored.filter((entry) => entry.relevanceScore > 0)
    : []

  if (relevantOnly.length > 0) {
    relevantOnly.sort((a, b) => b.score - a.score)
    return relevantOnly.slice(0, limit).map(s => s.bottle)
  }

  // Proactive mode: no textual match (or no query) → return top-scored memories
  // (best-rated, most recent, strongest sentiment)
  // This lets Celestin spontaneously cite great experiences
  scored.sort((a, b) => b.score - a.score)
  const proactive = scored.filter(s => s.score > 0).slice(0, limit)
  return proactive.map(s => s.bottle)
}

/**
 * Async version of selectRelevantMemories that tries semantic search first,
 * then falls back to keyword matching.
 */
export async function selectRelevantMemoriesAsync(
  mode: Mode,
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
): Promise<Bottle[]> {
  // If no query or too short, skip semantic search
  if (!query || query.trim().length < 3) {
    return selectRelevantMemories(mode, query, drunkBottles, limit)
  }

  const keywordMatches = selectRelevantMemories(mode, query, drunkBottles, limit)
  const exactIdentityMatch = keywordMatches.some((bottle) => hasSpecificIdentityMatch(query, bottle))

  // Exact or near-exact identity matches should beat weak semantic neighbors.
  if (exactIdentityMatch) {
    return keywordMatches
  }

  try {
    const results = await searchSemanticMemories(query, limit)
    if (results.length > 0) {
      console.log(`[tastingMemories] Semantic search returned ${results.length} results`)
      if (keywordMatches.length > 0) {
        return mergeUniqueMemories(results, keywordMatches, limit)
      }
      return results
    }
  } catch (err) {
    console.warn('[tastingMemories] Semantic search failed, falling back to keyword matching:', err)
  }

  return keywordMatches
}

function ratingStars(rating: number | null): string {
  if (!rating) return ''
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5 ? 1 : 0
  const empty = 5 - full - half
  return '\u2605'.repeat(full) + (half ? '\u2BEA' : '') + '\u2606'.repeat(empty)
}

export function serializeMemoriesForPrompt(memories: Bottle[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map((bottle) => {
    const tags = bottle.tasting_tags as TastingTags | null
    const identity = [bottle.domaine, bottle.cuvee, bottle.appellation].filter(Boolean).join(' | ') || 'Vin'
    const headerParts: string[] = [identity]

    if (bottle.millesime) headerParts.push(String(bottle.millesime))
    if (bottle.drunk_at) {
      const date = new Date(bottle.drunk_at)
      headerParts.push(`deguste le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    }
    if (bottle.rating) headerParts.push(`note ${bottle.rating}/5 ${ratingStars(bottle.rating)}`)
    if (tags?.sentiment) headerParts.push(`sentiment ${tags.sentiment}`)
    if (tags?.maturite) headerParts.push(`maturite ${tags.maturite}`)

    const contextParts: string[] = []
    if (tags?.plats?.length) {
      const occasion = tags.occasion ? ` (${tags.occasion})` : ''
      contextParts.push(`accord vecu: ${tags.plats.join(', ')}${occasion}`)
    } else if (tags?.occasion) {
      contextParts.push(`occasion: ${tags.occasion}`)
    }

    if (tags?.descripteurs?.length) {
      contextParts.push(`descripteurs: ${tags.descripteurs.join(', ')}`)
    }

    const noteText = bottle.tasting_note?.replace(/\s+/g, ' ').trim()
    if (noteText) {
      contextParts.push(`verbatim utilisateur: "${noteText}"`)
    }

    return [`- ${headerParts.join(' | ')}`, ...contextParts].join('\n')
  })

  return lines.join('\n\n')
}
