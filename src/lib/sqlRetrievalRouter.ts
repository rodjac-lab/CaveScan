import type { Bottle } from '@/lib/types'
import type { MemorySearchMessage, ExactMemoryFilters } from '@/lib/tastingMemoryTypes'
import {
  buildFilterLabels,
  extractExactFiltersFromQuery,
  hasAnyExactFilter,
  normalizeForMatch,
} from '@/lib/tastingMemoryFilters'
import type { ClassifiedIntent, ClassifiedFilters } from '@/lib/celestinIntentClassifier'

export type FactualIntent = 'temporal' | 'geographic' | 'quantitative' | 'ranking' | 'inventory'
export type InventoryScope = 'drunk' | 'cave' | 'both'

export interface SqlRetrievalBlock {
  intent: FactualIntent
  label: string
  resultCount: number
  formattedText: string
}

export interface SqlRetrievalTrace {
  query: string
  normalizedQuery: string
  detectedIntents: FactualIntent[]
  matchedFilters: string[]
  blocks: Array<Pick<SqlRetrievalBlock, 'intent' | 'label' | 'resultCount'>>
}

export interface SqlRetrievalResult {
  blocks: SqlRetrievalBlock[]
  serialized: string
  trace: SqlRetrievalTrace
}

export interface RouteFactualQueryInput {
  query: string
  drunkBottles: Bottle[]
  caveBottles: Bottle[]
  recentMessages?: MemorySearchMessage[]
  now?: Date
}

const FRENCH_MONTHS_ORDER = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
] as const

const TEMPORAL_PATTERNS: RegExp[] = [
  /\ble\s+\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/,
  /\bhier\b/,
  /\bavant[-\s]?hier\b/,
  /\b(ce\s+)?week[-\s]?end(\s+dernier)?\b/,
  /\b(cette\s+semaine|la\s+semaine\s+derniere|semaine\s+derniere)\b/,
  /\b(ce\s+mois(\s*-?\s*ci)?|le\s+mois\s+dernier|mois\s+dernier)\b/,
  /\ben\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/,
  /\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/,
]

const QUANTITATIVE_PATTERNS: RegExp[] = [
  /\bcombien\b/,
  /\bnombre\s+(de|d['\s])/,
  /\bquantite\s+de\b/,
  /\ba-t-on\s+combien\b/,
]

const RANKING_PATTERNS: RegExp[] = [
  /\b(meilleurs?|meilleures?)\b/,
  /\b(pires?)\b/,
  /\btop\s*\d*\b/,
  /\bplus\s+(mauvais|mauvaise|bon|bonne|mauvaises|mauvais)\b/,
  /\bmoins\s+(bon|bonne|bien|bons|bonnes)\b/,
  /\b\d+\s+(meilleurs?|meilleures?|pires?)\b/,
  /\b(les?\s+)?mieux\s+notes?\b/,
  /\b(les?\s+)?moins\s+bien\s+notes?\b/,
]

const INVENTORY_PATTERNS: RegExp[] = [
  /\bai[-\s]?je\b/,
  /\bj'?ai\s+deja\b/,
  /\bj'?en\s+ai\b/,
  /\best[-\s]ce\s+que\s+j'?ai\b/,
  /\bliste\s+(de\s+)?(mes|les)\b/,
  /\b(donne|montre)[-\s]moi\s+(mes|la\s+liste)\b/,
  /\bmes\s+\w+/,
  /\bj'?ai\s+(du|de\s+la|des)\b/,
]

const DRUNK_VERB_PATTERNS: RegExp[] = [
  /\bbu\b/,
  /\bgoute\b/,
  /\bdeguste\b/,
  /\bouvert\b/,
]

const CAVE_VERB_PATTERNS: RegExp[] = [
  /\ben\s+cave\b/,
  /\bdans\s+ma\s+cave\b/,
  /\bstock\b/,
  /\bstocke\b/,
  /\ba\s+boire\b/,
  /\bil\s+me\s+reste\b/,
]

const NON_FACTUAL_PATTERNS: RegExp[] = [
  /\baccord\b/,
  /\baccompagn/,
  /\bavec\s+(quel|quelle|quoi)\b/,
  /\bque\s+boire\b/,
  /\bque\s+j['’]?ouvre\b/,
  /\bj['’]?ouvre\b/,
  /\bpour\s+(un|une|ce|cette|le|la)\b/,
  /\bquel(le)?\s+vin\b/,
  /\brecommand/,
  /\bconseill/,
  /\bsugger/,
  /\bpropose/,
]

const FREE_LOCATION_PATTERN = /(?:^|\s)(?:à|a|au|aux|chez|avec)\s+((?:l['’]|la |le |les |mon |ma |mes |des |du |de la |de l['’]|d['’])?[A-Za-zÀ-ÿ][-\wÀ-ÿ'’]*(?:\s+[A-Za-zÀ-ÿ][-\wÀ-ÿ'’]*){0,3})/gi

const FREE_LOCATION_STOP_TERMS = new Set([
  'verre', 'table', 'vin', 'vins', 'bouteille', 'bouteilles',
  'ami', 'amis', 'amie', 'amies', 'famille',
  'maison', 'moi', 'toi', 'lui', 'elle', 'soi',
  'celestin', 'assistant',
])

const FREE_LOCATION_STRIP_LEADING = [
  'l\'', 'l’', 'la ', 'le ', 'les ', 'mon ', 'ma ', 'mes ',
  'des ', 'du ', 'de la ', 'de l\'', 'de l’', 'd\'', 'd’',
]

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function detectIntents(rawQuery: string, normalizedQuery: string, filters: ExactMemoryFilters): Set<FactualIntent> {
  const intents = new Set<FactualIntent>()
  if (matchesAny(TEMPORAL_PATTERNS, normalizedQuery) || filters.dates.length > 0) intents.add('temporal')
  if (matchesAny(QUANTITATIVE_PATTERNS, normalizedQuery)) intents.add('quantitative')
  if (matchesAny(RANKING_PATTERNS, normalizedQuery)) intents.add('ranking')
  if (matchesAny(INVENTORY_PATTERNS, normalizedQuery)) intents.add('inventory')
  const hasGeoFilter = filters.countries.length > 0 || filters.regions.length > 0 || filters.appellations.length > 0
  if (hasGeoFilter || extractFreeLocations(rawQuery).length > 0) intents.add('geographic')
  return intents
}

function stripLeadingArticle(token: string): string {
  const lowered = token.toLowerCase()
  for (const prefix of FREE_LOCATION_STRIP_LEADING) {
    if (lowered.startsWith(prefix)) return token.slice(prefix.length)
  }
  return token
}

function extractFreeLocations(rawQuery: string): string[] {
  const matches = Array.from(rawQuery.matchAll(FREE_LOCATION_PATTERN))
  const out: string[] = []
  for (const match of matches) {
    const raw = match[1]?.trim()
    if (!raw) continue
    const stripped = stripLeadingArticle(raw).trim()
    if (!stripped) continue
    const normalized = normalizeForMatch(stripped)
    if (normalized.length < 4) continue
    if (FREE_LOCATION_STOP_TERMS.has(normalized.split(/\s+/)[0])) continue
    out.push(stripped)
  }
  return out
}

function detectScope(normalizedQuery: string): InventoryScope {
  const hasDrunk = matchesAny(DRUNK_VERB_PATTERNS, normalizedQuery)
  const hasCave = matchesAny(CAVE_VERB_PATTERNS, normalizedQuery)
  if (hasDrunk && !hasCave) return 'drunk'
  if (hasCave && !hasDrunk) return 'cave'
  return 'both'
}

function extractRankingLimit(normalizedQuery: string): number {
  const match = normalizedQuery.match(/\b(\d+)\s+(meilleurs?|meilleures?|pires?)\b/)
  if (match) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n > 0 && n <= 20) return n
  }
  return 5
}

function rankingDirection(normalizedQuery: string): 'desc' | 'asc' {
  if (/\b(pires?|plus\s+mauvais|moins\s+bon|moins\s+bien|plus\s+mauvaise)\b/.test(normalizedQuery)) return 'asc'
  return 'desc'
}

function formatBottleHeader(bottle: Bottle): string {
  const parts = [bottle.domaine, bottle.cuvee, bottle.appellation].filter(Boolean)
  const identity = parts.length > 0 ? parts.join(' | ') : 'Vin sans identite'
  const tokens = [identity]
  if (bottle.millesime) tokens.push(String(bottle.millesime))
  if (bottle.region && !parts.includes(bottle.region)) tokens.push(bottle.region)
  if (bottle.country && bottle.country !== bottle.region) tokens.push(bottle.country)
  return tokens.join(' | ')
}

function formatDrunkLine(bottle: Bottle): string {
  const header = formatBottleHeader(bottle)
  const meta: string[] = []
  if (bottle.drunk_at) {
    const date = new Date(bottle.drunk_at)
    if (!Number.isNaN(date.getTime())) {
      meta.push(`bu le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    }
  }
  if (bottle.rating != null) meta.push(`note ${bottle.rating}/5`)
  if (bottle.tasting_tags?.occasion) meta.push(`occasion: ${bottle.tasting_tags.occasion}`)
  return meta.length > 0 ? `- ${header} — ${meta.join(', ')}` : `- ${header}`
}

function formatCaveLine(bottle: Bottle): string {
  const header = formatBottleHeader(bottle)
  const meta: string[] = []
  const qty = bottle.quantity ?? 1
  if (qty > 1) meta.push(`${qty} exemplaires`)
  return meta.length > 0 ? `- ${header} — ${meta.join(', ')}` : `- ${header}`
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function isoDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface DateRange {
  start: Date
  end: Date
  label: string
}

function mostRecentWeekendRange(today: Date): { start: Date; end: Date } {
  const day = today.getDay()
  const copy = new Date(today)
  if (day === 6) {
    const end = new Date(copy); end.setDate(copy.getDate() + 1)
    return { start: copy, end }
  }
  if (day === 0) {
    const start = new Date(copy); start.setDate(copy.getDate() - 1)
    return { start, end: copy }
  }
  const start = new Date(copy); start.setDate(copy.getDate() - (day + 1))
  const end = new Date(start); end.setDate(start.getDate() + 1)
  return { start, end }
}

function previousWeekendRange(today: Date): { start: Date; end: Date } {
  const day = today.getDay()
  if (day === 0 || day === 6) {
    const current = mostRecentWeekendRange(today)
    const start = new Date(current.start); start.setDate(current.start.getDate() - 7)
    const end = new Date(start); end.setDate(start.getDate() + 1)
    return { start, end }
  }
  return mostRecentWeekendRange(today)
}

function resolveTemporalRange(normalizedQuery: string, now: Date): DateRange | null {
  const today = startOfDay(now)

  if (/\bavant[-\s]?hier\b/.test(normalizedQuery)) {
    const d = new Date(today); d.setDate(d.getDate() - 2)
    return { start: d, end: d, label: `avant-hier (${isoDay(d)})` }
  }
  if (/\bhier\b/.test(normalizedQuery)) {
    const d = new Date(today); d.setDate(d.getDate() - 1)
    return { start: d, end: d, label: `hier (${isoDay(d)})` }
  }
  if (/\ble\s+week[-\s]?end\s+dernier\b/.test(normalizedQuery) || /\bweek[-\s]?end\s+dernier\b/.test(normalizedQuery)) {
    const { start, end } = previousWeekendRange(today)
    return { start, end, label: `week-end dernier (${isoDay(start)} au ${isoDay(end)})` }
  }
  if (/\bce\s+week[-\s]?end\b/.test(normalizedQuery) || /\bweek[-\s]?end\b/.test(normalizedQuery)) {
    const { start, end } = mostRecentWeekendRange(today)
    return { start, end, label: `ce week-end (${isoDay(start)} au ${isoDay(end)})` }
  }
  if (/\b(la\s+)?semaine\s+derniere\b/.test(normalizedQuery)) {
    const end = new Date(today); end.setDate(today.getDate() - today.getDay() - (today.getDay() === 0 ? 7 : 0))
    const start = new Date(end); start.setDate(end.getDate() - 6)
    return { start, end, label: 'semaine derniere' }
  }
  if (/\bcette\s+semaine\b/.test(normalizedQuery)) {
    const day = today.getDay() || 7
    const start = new Date(today); start.setDate(today.getDate() - (day - 1))
    return { start, end: today, label: 'cette semaine' }
  }
  if (/\ble\s+mois\s+dernier\b|\bmois\s+dernier\b/.test(normalizedQuery)) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth(), 0)
    return { start, end, label: `mois dernier (${start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})` }
  }
  if (/\bce\s+mois(\s*-?\s*ci)?\b/.test(normalizedQuery)) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start, end: today, label: `ce mois (${start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})` }
  }
  const enMonthMatch = normalizedQuery.match(/\ben\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/)
  if (enMonthMatch) {
    const monthIndex = FRENCH_MONTHS_ORDER.indexOf(enMonthMatch[1] as typeof FRENCH_MONTHS_ORDER[number])
    if (monthIndex >= 0) {
      const year = monthIndex > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear()
      const start = new Date(year, monthIndex, 1)
      const end = new Date(year, monthIndex + 1, 0)
      return { start, end, label: `en ${enMonthMatch[1]} ${year}` }
    }
  }
  return null
}

function bottleDrunkInRange(bottle: Bottle, range: DateRange): boolean {
  if (!bottle.drunk_at) return false
  const date = new Date(bottle.drunk_at)
  if (Number.isNaN(date.getTime())) return false
  const day = startOfDay(date).getTime()
  return day >= range.start.getTime() && day <= range.end.getTime()
}

function applyIdentityFilters(bottles: Bottle[], filters: ExactMemoryFilters): Bottle[] {
  if (!hasAnyExactFilter(filters) && filters.millesimes.length === 0) return bottles
  return bottles.filter((bottle) => {
    if (filters.countries.length > 0 && bottle.country) {
      const normCountry = normalizeForMatch(bottle.country)
      if (!filters.countries.some((c) => normalizeForMatch(c) === normCountry)) return false
    } else if (filters.countries.length > 0) {
      return false
    }
    if (filters.regions.length > 0 && bottle.region) {
      const normRegion = normalizeForMatch(bottle.region)
      if (!filters.regions.some((c) => normalizeForMatch(c) === normRegion)) return false
    } else if (filters.regions.length > 0) {
      return false
    }
    if (filters.appellations.length > 0 && bottle.appellation) {
      const normApp = normalizeForMatch(bottle.appellation)
      if (!filters.appellations.some((c) => normalizeForMatch(c) === normApp)) return false
    } else if (filters.appellations.length > 0) {
      return false
    }
    if (filters.domaines.length > 0 && bottle.domaine) {
      const normDom = normalizeForMatch(bottle.domaine)
      if (!filters.domaines.some((c) => normalizeForMatch(c) === normDom)) return false
    } else if (filters.domaines.length > 0) {
      return false
    }
    if (filters.cuvees.length > 0 && bottle.cuvee) {
      const normCuv = normalizeForMatch(bottle.cuvee)
      if (!filters.cuvees.some((c) => normalizeForMatch(c) === normCuv)) return false
    } else if (filters.cuvees.length > 0) {
      return false
    }
    if (filters.millesimes.length > 0) {
      if (bottle.millesime == null || !filters.millesimes.includes(bottle.millesime)) return false
    }
    return true
  })
}

function buildTemporalBlock(
  normalizedQuery: string,
  drunk: Bottle[],
  filters: ExactMemoryFilters,
  now: Date,
): SqlRetrievalBlock | null {
  let matches: Bottle[] = []
  let label: string | null = null

  if (filters.dates.length > 0) {
    matches = drunk.filter((bottle) => {
      if (!bottle.drunk_at) return false
      const date = new Date(bottle.drunk_at)
      return filters.dates.includes(isoDay(date))
    })
    label = `date(s) exacte(s): ${filters.dates.join(', ')}`
  } else {
    const range = resolveTemporalRange(normalizedQuery, now)
    if (!range) return null
    matches = drunk.filter((bottle) => bottleDrunkInRange(bottle, range))
    label = range.label
  }

  const withIdentity = applyIdentityFilters(matches, filters)

  const lines = [
    `[TEMPOREL — ${label}${hasAnyExactFilter(filters) && filters.dates.length === 0 ? ` | filtres: ${buildFilterLabels(filters).join(', ')}` : ''}]`,
    `${withIdentity.length} vin(s) bu(s) correspondant :`,
    ...(withIdentity.length > 0 ? withIdentity.slice(0, 50).map(formatDrunkLine) : ['(aucun)']),
  ]

  return {
    intent: 'temporal',
    label: label ?? 'periode',
    resultCount: withIdentity.length,
    formattedText: lines.join('\n'),
  }
}

function buildGeographicBlock(
  rawQuery: string,
  normalizedQuery: string,
  drunk: Bottle[],
  cave: Bottle[],
  filters: ExactMemoryFilters,
): SqlRetrievalBlock | null {
  const hasGeoFilter = filters.countries.length > 0 || filters.regions.length > 0 || filters.appellations.length > 0
  const freeLocations = extractFreeLocations(rawQuery)

  if (!hasGeoFilter && freeLocations.length === 0) return null

  const scope = detectScope(normalizedQuery)
  const corpus = scope === 'cave' ? cave : scope === 'drunk' ? drunk : [...drunk, ...cave]

  let matches: Bottle[] = []
  let label = ''

  if (hasGeoFilter) {
    matches = applyIdentityFilters(corpus, filters)
    const geoLabels = [
      ...filters.countries.map((c) => `pays=${c}`),
      ...filters.regions.map((r) => `region=${r}`),
      ...filters.appellations.map((a) => `appellation=${a}`),
    ]
    label = geoLabels.join(', ')
  } else {
    const loc = freeLocations[0]
    const normLoc = normalizeForMatch(loc)
    matches = corpus.filter((bottle) => {
      const haystack = [
        bottle.tasting_note,
        bottle.notes,
        bottle.tasting_tags?.occasion,
        ...(bottle.tasting_tags?.plats ?? []),
        ...(bottle.tasting_tags?.keywords ?? []),
      ].filter(Boolean).join(' ')
      return normalizeForMatch(haystack).includes(normLoc)
    })
    label = `lieu libre: ${loc}`
  }

  const scopeLabel = scope === 'cave' ? 'en cave' : scope === 'drunk' ? 'bus' : 'cave + bus'
  const lines = [
    `[GEOGRAPHIQUE — ${label} | scope: ${scopeLabel}]`,
    `${matches.length} vin(s) correspondant :`,
    ...(matches.length > 0 ? matches.slice(0, 50).map(scope === 'cave' ? formatCaveLine : formatDrunkLine) : ['(aucun)']),
  ]

  return {
    intent: 'geographic',
    label,
    resultCount: matches.length,
    formattedText: lines.join('\n'),
  }
}

function buildQuantitativeBlock(
  normalizedQuery: string,
  drunk: Bottle[],
  cave: Bottle[],
  filters: ExactMemoryFilters,
): SqlRetrievalBlock | null {
  if (!matchesAny(QUANTITATIVE_PATTERNS, normalizedQuery)) return null
  const scope = detectScope(normalizedQuery)

  const drunkCount = applyIdentityFilters(drunk, filters).length
  const caveCount = applyIdentityFilters(cave, filters).reduce((acc, bottle) => acc + (bottle.quantity ?? 1), 0)
  const caveDistinct = applyIdentityFilters(cave, filters).length

  const filterLabel = buildFilterLabels(filters).join(', ') || '(sans filtre)'
  const lines: string[] = [`[QUANTITATIF — filtres: ${filterLabel}]`]
  if (scope === 'drunk') {
    lines.push(`Bouteilles bues correspondant : ${drunkCount}.`)
  } else if (scope === 'cave') {
    lines.push(`Bouteilles en cave correspondant : ${caveCount} exemplaires (${caveDistinct} fiche(s)).`)
  } else {
    lines.push(`Bouteilles bues : ${drunkCount}.`)
    lines.push(`Bouteilles en cave : ${caveCount} exemplaires (${caveDistinct} fiche(s)).`)
  }

  return {
    intent: 'quantitative',
    label: filterLabel,
    resultCount: scope === 'cave' ? caveCount : drunkCount,
    formattedText: lines.join('\n'),
  }
}

function buildRankingBlock(
  normalizedQuery: string,
  drunk: Bottle[],
  filters: ExactMemoryFilters,
): SqlRetrievalBlock | null {
  if (!matchesAny(RANKING_PATTERNS, normalizedQuery)) return null

  const filtered = applyIdentityFilters(drunk, filters).filter((bottle) => bottle.rating != null)
  if (filtered.length === 0) {
    return {
      intent: 'ranking',
      label: 'classement',
      resultCount: 0,
      formattedText: `[CLASSEMENT — filtres: ${buildFilterLabels(filters).join(', ') || '(sans filtre)'}]\n(aucun vin note correspondant)`,
    }
  }

  const direction = rankingDirection(normalizedQuery)
  const limit = extractRankingLimit(normalizedQuery)
  const sorted = [...filtered].sort((a, b) => {
    const ra = a.rating ?? 0
    const rb = b.rating ?? 0
    return direction === 'desc' ? rb - ra : ra - rb
  }).slice(0, limit)

  const filterLabel = buildFilterLabels(filters).join(', ') || '(sans filtre)'
  const lines = [
    `[CLASSEMENT — top ${limit} par note ${direction === 'desc' ? 'descendante' : 'ascendante'} | filtres: ${filterLabel}]`,
    ...sorted.map(formatDrunkLine),
  ]

  return {
    intent: 'ranking',
    label: `top ${limit} ${direction}`,
    resultCount: sorted.length,
    formattedText: lines.join('\n'),
  }
}

const INVENTORY_INLINE_THRESHOLD = 5

function inventoryDisplayHint(count: number): string {
  if (count <= INVENTORY_INLINE_THRESHOLD) {
    return `Enumere les ${count} vin(s) ci-dessous dans ta reponse.`
  }
  return `L inventaire compte ${count} fiches — TROP pour lister dans une reponse conversationnelle. Donne le chiffre total + 2-3 exemples emblematiques, puis invite l utilisateur a ouvrir la page Cave pour la liste exhaustive (barre de recherche disponible). N invente jamais de vin hors de ce bloc.`
}

function buildInventoryBlock(
  normalizedQuery: string,
  drunk: Bottle[],
  cave: Bottle[],
  filters: ExactMemoryFilters,
): SqlRetrievalBlock | null {
  if (!matchesAny(INVENTORY_PATTERNS, normalizedQuery)) return null
  if (!hasAnyExactFilter(filters)) return null

  const scope = detectScope(normalizedQuery)
  const filterLabel = buildFilterLabels(filters).join(', ')

  if (scope === 'drunk') {
    const matches = applyIdentityFilters(drunk, filters)
    return {
      intent: 'inventory',
      label: `scope=drunk | ${filterLabel}`,
      resultCount: matches.length,
      formattedText: [
        `[INVENTAIRE — bouteilles deja bues | filtres: ${filterLabel}]`,
        `${matches.length} vin(s) trouve(s). ${inventoryDisplayHint(matches.length)}`,
        ...(matches.length > 0 ? matches.slice(0, 50).map(formatDrunkLine) : ['(aucun)']),
      ].join('\n'),
    }
  }
  if (scope === 'cave') {
    const matches = applyIdentityFilters(cave, filters)
    const totalQty = matches.reduce((acc, b) => acc + (b.quantity ?? 1), 0)
    return {
      intent: 'inventory',
      label: `scope=cave | ${filterLabel}`,
      resultCount: matches.length,
      formattedText: [
        `[INVENTAIRE — bouteilles en cave | filtres: ${filterLabel}]`,
        `${totalQty} exemplaire(s), ${matches.length} fiche(s). ${inventoryDisplayHint(matches.length)}`,
        ...(matches.length > 0 ? matches.slice(0, 50).map(formatCaveLine) : ['(aucun)']),
      ].join('\n'),
    }
  }
  const drunkMatches = applyIdentityFilters(drunk, filters)
  const caveMatches = applyIdentityFilters(cave, filters)
  const caveQty = caveMatches.reduce((acc, b) => acc + (b.quantity ?? 1), 0)
  const combinedCount = drunkMatches.length + caveMatches.length
  return {
    intent: 'inventory',
    label: `scope=both | ${filterLabel}`,
    resultCount: combinedCount,
    formattedText: [
      `[INVENTAIRE — bues + en cave | filtres: ${filterLabel}]`,
      `Bues : ${drunkMatches.length}. En cave : ${caveQty} exemplaire(s) (${caveMatches.length} fiche(s)). ${inventoryDisplayHint(combinedCount)}`,
      `Bues :`,
      ...(drunkMatches.length > 0 ? drunkMatches.slice(0, 50).map(formatDrunkLine) : ['(aucune)']),
      `En cave :`,
      ...(caveMatches.length > 0 ? caveMatches.slice(0, 50).map(formatCaveLine) : ['(aucune)']),
    ].join('\n'),
  }
}

export function routeFactualQuery(input: RouteFactualQueryInput): SqlRetrievalResult | null {
  const rawQuery = input.query?.trim() ?? ''
  if (!rawQuery) return null

  const normalizedQuery = normalizeForMatch(rawQuery)
  if (matchesAny(NON_FACTUAL_PATTERNS, normalizedQuery)) return null

  const filterSource = [...input.drunkBottles, ...input.caveBottles]
  const filters = extractExactFiltersFromQuery(rawQuery, filterSource)
  const intents = detectIntents(rawQuery, normalizedQuery, filters)
  if (intents.size === 0) return null

  const now = input.now ?? new Date()
  const blocks: SqlRetrievalBlock[] = []

  if (intents.has('temporal')) {
    const block = buildTemporalBlock(normalizedQuery, input.drunkBottles, filters, now)
    if (block) blocks.push(block)
  }
  if (intents.has('geographic')) {
    const block = buildGeographicBlock(rawQuery, normalizedQuery, input.drunkBottles, input.caveBottles, filters)
    if (block) blocks.push(block)
  }
  if (intents.has('quantitative')) {
    const block = buildQuantitativeBlock(normalizedQuery, input.drunkBottles, input.caveBottles, filters)
    if (block) blocks.push(block)
  }
  if (intents.has('ranking')) {
    const block = buildRankingBlock(normalizedQuery, input.drunkBottles, filters)
    if (block) blocks.push(block)
  }
  if (intents.has('inventory')) {
    const block = buildInventoryBlock(normalizedQuery, input.drunkBottles, input.caveBottles, filters)
    if (block) blocks.push(block)
  }

  if (blocks.length === 0) return null

  const serialized = [
    'Recuperation factuelle deterministe sur la cave et les degustations. Chaque bloc est un resultat exact, pas une inference.',
    ...blocks.map((block) => block.formattedText),
  ].join('\n\n')

  const trace: SqlRetrievalTrace = {
    query: rawQuery,
    normalizedQuery,
    detectedIntents: Array.from(intents),
    matchedFilters: buildFilterLabels(filters),
    blocks: blocks.map(({ intent, label, resultCount }) => ({ intent, label, resultCount })),
  }

  return { blocks, serialized, trace }
}

export const _internal = {
  detectIntents,
  extractFreeLocations,
  detectScope,
  resolveTemporalRange,
  applyIdentityFilters,
}

// === CLASSIFIER-DRIVEN PATH ===

function toExactFilters(filters: ClassifiedFilters): ExactMemoryFilters {
  return {
    dates: [],
    countries: filters.country ? [filters.country] : [],
    regions: filters.region ? [filters.region] : [],
    appellations: filters.appellation ? [filters.appellation] : [],
    domaines: filters.domaine ? [filters.domaine] : [],
    cuvees: filters.cuvee ? [filters.cuvee] : [],
    millesimes: filters.millesime != null ? [filters.millesime] : [],
  }
}

function applyClassifiedFilters(bottles: Bottle[], classified: ClassifiedIntent): Bottle[] {
  const exact = toExactFilters(classified.filters)
  let filtered = applyIdentityFilters(bottles, exact)
  const pattern = classified.filters.appellationPattern
  if (pattern) {
    const normPattern = normalizeForMatch(pattern)
    filtered = filtered.filter((bottle) => {
      if (!bottle.appellation) return false
      return normalizeForMatch(bottle.appellation).includes(normPattern)
    })
  }
  return filtered
}

function classifiedFilterLabels(classified: ClassifiedIntent): string[] {
  const labels = buildFilterLabels(toExactFilters(classified.filters))
  if (classified.filters.appellationPattern) {
    labels.push(`appellation~${classified.filters.appellationPattern}`)
  }
  if (classified.filters.freeLocation) {
    labels.push(`lieu=${classified.filters.freeLocation}`)
  }
  return labels
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateLabel(start: Date, end: Date): string {
  if (start.getTime() === end.getTime()) return isoDay(start)
  return `${isoDay(start)} au ${isoDay(end)}`
}

function buildTemporalBlockFromClassification(classified: ClassifiedIntent, drunk: Bottle[]): SqlRetrievalBlock | null {
  const range = classified.filters.dateRange
  if (!range) return null
  const startDate = parseIsoDate(range.start)
  const endDate = parseIsoDate(range.end)
  if (!startDate || !endDate) return null
  const dateRange: DateRange = {
    start: startOfDay(startDate),
    end: startOfDay(endDate),
    label: formatDateLabel(startDate, endDate),
  }
  const matches = drunk.filter((bottle) => bottleDrunkInRange(bottle, dateRange))
  const withIdentity = applyClassifiedFilters(matches, classified)
  const identityLabels = classifiedFilterLabels(classified)
  const label = dateRange.label
  const lines = [
    `[TEMPOREL — ${label}${identityLabels.length > 0 ? ` | filtres: ${identityLabels.join(', ')}` : ''}]`,
    `${withIdentity.length} vin(s) bu(s) correspondant :`,
    ...(withIdentity.length > 0 ? withIdentity.slice(0, 50).map(formatDrunkLine) : ['(aucun)']),
  ]
  return { intent: 'temporal', label, resultCount: withIdentity.length, formattedText: lines.join('\n') }
}

function matchesFreeLocation(bottle: Bottle, freeLocation: string): boolean {
  const normLoc = normalizeForMatch(freeLocation)
  if (!normLoc) return false
  const haystack = [
    bottle.tasting_note,
    bottle.notes,
    bottle.tasting_tags?.occasion,
    ...(bottle.tasting_tags?.plats ?? []),
    ...(bottle.tasting_tags?.keywords ?? []),
  ].filter(Boolean).join(' ')
  return normalizeForMatch(haystack).includes(normLoc)
}

function effectiveScope(classified: ClassifiedIntent, fallback: InventoryScope): InventoryScope {
  return classified.scope ?? fallback
}

function buildGeographicBlockFromClassification(classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]): SqlRetrievalBlock | null {
  const hasGeoFilter =
    !!classified.filters.country ||
    !!classified.filters.region ||
    !!classified.filters.appellation ||
    !!classified.filters.appellationPattern
  const freeLocation = classified.filters.freeLocation?.trim()
  if (!hasGeoFilter && !freeLocation) return null

  const scope = effectiveScope(classified, 'drunk')
  const corpus = scope === 'cave' ? cave : scope === 'drunk' ? drunk : [...drunk, ...cave]

  let matches: Bottle[] = []
  let label = ''
  if (hasGeoFilter) {
    matches = applyClassifiedFilters(corpus, classified)
    label = classifiedFilterLabels(classified).join(', ')
  } else if (freeLocation) {
    matches = corpus.filter((bottle) => matchesFreeLocation(bottle, freeLocation))
    label = `lieu libre: ${freeLocation}`
  }

  const scopeLabel = scope === 'cave' ? 'en cave' : scope === 'drunk' ? 'bus' : 'cave + bus'
  const lines = [
    `[GEOGRAPHIQUE — ${label} | scope: ${scopeLabel}]`,
    `${matches.length} vin(s) correspondant :`,
    ...(matches.length > 0 ? matches.slice(0, 50).map(scope === 'cave' ? formatCaveLine : formatDrunkLine) : ['(aucun)']),
  ]
  return { intent: 'geographic', label, resultCount: matches.length, formattedText: lines.join('\n') }
}

function buildQuantitativeBlockFromClassification(classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]): SqlRetrievalBlock | null {
  const scope = effectiveScope(classified, 'both')
  const drunkMatches = applyClassifiedFilters(drunk, classified)
  const caveMatches = applyClassifiedFilters(cave, classified)
  const caveQty = caveMatches.reduce((acc, bottle) => acc + (bottle.quantity ?? 1), 0)
  const filterLabel = classifiedFilterLabels(classified).join(', ') || '(sans filtre)'
  const lines: string[] = [`[QUANTITATIF — filtres: ${filterLabel}]`]
  if (scope === 'drunk') {
    lines.push(`Bouteilles bues correspondant : ${drunkMatches.length}.`)
  } else if (scope === 'cave') {
    lines.push(`Bouteilles en cave correspondant : ${caveQty} exemplaires (${caveMatches.length} fiche(s)).`)
  } else {
    lines.push(`Bouteilles bues : ${drunkMatches.length}.`)
    lines.push(`Bouteilles en cave : ${caveQty} exemplaires (${caveMatches.length} fiche(s)).`)
  }
  return {
    intent: 'quantitative',
    label: filterLabel,
    resultCount: scope === 'cave' ? caveQty : drunkMatches.length,
    formattedText: lines.join('\n'),
  }
}

function buildRankingBlockFromClassification(classified: ClassifiedIntent, drunk: Bottle[]): SqlRetrievalBlock | null {
  const rated = applyClassifiedFilters(drunk, classified).filter((bottle) => bottle.rating != null)
  const filterLabel = classifiedFilterLabels(classified).join(', ') || '(sans filtre)'
  if (rated.length === 0) {
    return {
      intent: 'ranking',
      label: 'classement',
      resultCount: 0,
      formattedText: `[CLASSEMENT — filtres: ${filterLabel}]\n(aucun vin note correspondant)`,
    }
  }
  const direction = classified.rankingDirection ?? 'desc'
  const limit = classified.rankingLimit ?? 5
  const sorted = [...rated].sort((a, b) => {
    const ra = a.rating ?? 0
    const rb = b.rating ?? 0
    return direction === 'desc' ? rb - ra : ra - rb
  }).slice(0, limit)
  const lines = [
    `[CLASSEMENT — top ${limit} par note ${direction === 'desc' ? 'descendante' : 'ascendante'} | filtres: ${filterLabel}]`,
    ...sorted.map(formatDrunkLine),
  ]
  return { intent: 'ranking', label: `top ${limit} ${direction}`, resultCount: sorted.length, formattedText: lines.join('\n') }
}

function buildInventoryBlockFromClassification(classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]): SqlRetrievalBlock | null {
  const scope = effectiveScope(classified, 'both')
  const filterLabel = classifiedFilterLabels(classified).join(', ') || '(sans filtre)'
  const freeLocation = classified.filters.freeLocation?.trim()

  const applyAll = (list: Bottle[]): Bottle[] => {
    let out = applyClassifiedFilters(list, classified)
    if (freeLocation) out = out.filter((bottle) => matchesFreeLocation(bottle, freeLocation))
    return out
  }

  if (scope === 'drunk') {
    const matches = applyAll(drunk)
    return {
      intent: 'inventory',
      label: `scope=drunk | ${filterLabel}`,
      resultCount: matches.length,
      formattedText: [
        `[INVENTAIRE — bouteilles deja bues | filtres: ${filterLabel}]`,
        `${matches.length} vin(s) trouve(s). ${inventoryDisplayHint(matches.length)}`,
        ...(matches.length > 0 ? matches.slice(0, 50).map(formatDrunkLine) : ['(aucun)']),
      ].join('\n'),
    }
  }
  if (scope === 'cave') {
    const matches = applyAll(cave)
    const totalQty = matches.reduce((acc, b) => acc + (b.quantity ?? 1), 0)
    return {
      intent: 'inventory',
      label: `scope=cave | ${filterLabel}`,
      resultCount: matches.length,
      formattedText: [
        `[INVENTAIRE — bouteilles en cave | filtres: ${filterLabel}]`,
        `${totalQty} exemplaire(s), ${matches.length} fiche(s). ${inventoryDisplayHint(matches.length)}`,
        ...(matches.length > 0 ? matches.slice(0, 50).map(formatCaveLine) : ['(aucun)']),
      ].join('\n'),
    }
  }
  const drunkMatches = applyAll(drunk)
  const caveMatches = applyAll(cave)
  const caveQty = caveMatches.reduce((acc, b) => acc + (b.quantity ?? 1), 0)
  const combined = drunkMatches.length + caveMatches.length
  return {
    intent: 'inventory',
    label: `scope=both | ${filterLabel}`,
    resultCount: combined,
    formattedText: [
      `[INVENTAIRE — bues + en cave | filtres: ${filterLabel}]`,
      `Bues : ${drunkMatches.length}. En cave : ${caveQty} exemplaire(s) (${caveMatches.length} fiche(s)). ${inventoryDisplayHint(combined)}`,
      `Bues :`,
      ...(drunkMatches.length > 0 ? drunkMatches.slice(0, 50).map(formatDrunkLine) : ['(aucune)']),
      `En cave :`,
      ...(caveMatches.length > 0 ? caveMatches.slice(0, 50).map(formatCaveLine) : ['(aucune)']),
    ].join('\n'),
  }
}

export function routeFactualQueryFromClassification(
  classified: ClassifiedIntent | null,
  drunk: Bottle[],
  cave: Bottle[],
): SqlRetrievalResult | null {
  if (!classified || !classified.isFactual || !classified.intent) return null

  let block: SqlRetrievalBlock | null = null
  switch (classified.intent) {
    case 'temporal':
      block = buildTemporalBlockFromClassification(classified, drunk)
      break
    case 'geographic':
      block = buildGeographicBlockFromClassification(classified, drunk, cave)
      break
    case 'quantitative':
      block = buildQuantitativeBlockFromClassification(classified, drunk, cave)
      break
    case 'ranking':
      block = buildRankingBlockFromClassification(classified, drunk)
      break
    case 'inventory':
      block = buildInventoryBlockFromClassification(classified, drunk, cave)
      break
  }

  if (!block) return null

  const serialized = [
    'Recuperation factuelle deterministe sur la cave et les degustations. Chaque bloc est un resultat exact, pas une inference.',
    block.formattedText,
  ].join('\n\n')

  const trace: SqlRetrievalTrace = {
    query: '',
    normalizedQuery: '',
    detectedIntents: [classified.intent],
    matchedFilters: classifiedFilterLabels(classified),
    blocks: [{ intent: block.intent, label: block.label, resultCount: block.resultCount }],
  }

  return { blocks: [block], serialized, trace }
}
