import type { Bottle } from '@/lib/types'
import type { ExactMemoryFilters } from '@/lib/tastingMemoryTypes'
import {
  buildFilterLabels,
  canonicalizeCountry,
  hasAnyExactFilter,
  normalizeForMatch,
} from '@/lib/tastingMemoryFilters'
import type { ClassifiedIntent, ClassifiedFilters, FactualIntent, InventoryScope } from '@/lib/celestinIntentClassifier'

export type { FactualIntent, InventoryScope } from '@/lib/celestinIntentClassifier'

export interface SqlRetrievalBlock {
  intent: FactualIntent
  label: string
  resultCount: number
  formattedText: string
}

export interface SqlRetrievalTrace {
  detectedIntents: FactualIntent[]
  matchedFilters: string[]
  blocks: Array<Pick<SqlRetrievalBlock, 'intent' | 'label' | 'resultCount'>>
}

export interface SqlRetrievalResult {
  blocks: SqlRetrievalBlock[]
  serialized: string
  trace: SqlRetrievalTrace
}

const INVENTORY_INLINE_THRESHOLD = 5
const MAX_LIST_ROWS = 50

const IDENTITY_FIELDS = [
  ['countries', 'country'],
  ['regions', 'region'],
  ['appellations', 'appellation'],
  ['domaines', 'domaine'],
  ['cuvees', 'cuvee'],
] as const satisfies ReadonlyArray<readonly [keyof ExactMemoryFilters, keyof Bottle]>

interface DateRange {
  start: Date
  end: Date
  label: string
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

function bottleDrunkInRange(bottle: Bottle, range: DateRange): boolean {
  if (!bottle.drunk_at) return false
  const date = new Date(bottle.drunk_at)
  if (Number.isNaN(date.getTime())) return false
  const day = startOfDay(date).getTime()
  return day >= range.start.getTime() && day <= range.end.getTime()
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
  const qty = bottle.quantity ?? 1
  return qty > 1 ? `- ${header} — ${qty} exemplaires` : `- ${header}`
}

function renderListLines(matches: Bottle[], formatter: (bottle: Bottle) => string): string[] {
  if (matches.length === 0) return ['(aucun)']
  return matches.slice(0, MAX_LIST_ROWS).map(formatter)
}

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

function applyIdentityFilters(bottles: Bottle[], filters: ExactMemoryFilters): Bottle[] {
  if (!hasAnyExactFilter(filters)) return bottles

  const normalizedFields = IDENTITY_FIELDS.map(([filterKey, bottleKey]) => {
    const values = filters[filterKey] as string[]
    // Country comparisons are alias-aware ("USA" ≡ "États-Unis" ≡ "americain");
    // other identity fields use the standard diacritic-strip match.
    const normalize = bottleKey === 'country' ? canonicalizeCountry : normalizeForMatch
    return { bottleKey, normalize, normalizedValues: values.map(normalize) }
  }).filter((entry) => entry.normalizedValues.length > 0)

  return bottles.filter((bottle) => {
    for (const { bottleKey, normalize, normalizedValues } of normalizedFields) {
      const raw = bottle[bottleKey] as string | null | undefined
      if (!raw) return false
      const norm = normalize(raw)
      if (!normalizedValues.includes(norm)) return false
    }
    if (filters.millesimes.length > 0) {
      if (bottle.millesime == null || !filters.millesimes.includes(bottle.millesime)) return false
    }
    return true
  })
}

function applyClassifiedFilters(bottles: Bottle[], classified: ClassifiedIntent): Bottle[] {
  const filtered = applyIdentityFilters(bottles, toExactFilters(classified.filters))
  const pattern = classified.filters.appellationPattern
  if (!pattern) return filtered
  const normPattern = normalizeForMatch(pattern)
  return filtered.filter((bottle) => bottle.appellation != null && normalizeForMatch(bottle.appellation).includes(normPattern))
}

function classifiedFilterLabels(classified: ClassifiedIntent): string[] {
  const labels = buildFilterLabels(toExactFilters(classified.filters))
  if (classified.filters.appellationPattern) labels.push(`appellation~${classified.filters.appellationPattern}`)
  if (classified.filters.freeLocation) labels.push(`lieu=${classified.filters.freeLocation}`)
  return labels
}

function matchesFreeLocation(bottle: Bottle, normLoc: string): boolean {
  const haystack = [
    bottle.tasting_note,
    bottle.notes,
    bottle.tasting_tags?.occasion,
    ...(bottle.tasting_tags?.plats ?? []),
    ...(bottle.tasting_tags?.keywords ?? []),
  ].filter(Boolean).join(' ')
  return normalizeForMatch(haystack).includes(normLoc)
}

function filterByFreeLocation(bottles: Bottle[], freeLocation: string): Bottle[] {
  const normLoc = normalizeForMatch(freeLocation)
  if (!normLoc) return []
  return bottles.filter((bottle) => matchesFreeLocation(bottle, normLoc))
}

function effectiveScope(classified: ClassifiedIntent, fallback: InventoryScope): InventoryScope {
  return classified.scope ?? fallback
}

function inventoryDisplayHint(count: number): string {
  if (count <= INVENTORY_INLINE_THRESHOLD) {
    return `Enumere les ${count} vin(s) ci-dessous dans ta reponse.`
  }
  return `L inventaire compte ${count} fiches — TROP pour lister dans une reponse conversationnelle. Donne le chiffre total + 2-3 exemples emblematiques, puis invite l utilisateur a ouvrir la page Cave pour la liste exhaustive (barre de recherche disponible). N invente jamais de vin hors de ce bloc.`
}

function buildTemporalBlock(classified: ClassifiedIntent, drunk: Bottle[]): SqlRetrievalBlock | null {
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
  const withIdentity = applyClassifiedFilters(drunk.filter((b) => bottleDrunkInRange(b, dateRange)), classified)
  const identityLabels = classifiedFilterLabels(classified)
  const lines = [
    `[TEMPOREL — ${dateRange.label}${identityLabels.length > 0 ? ` | filtres: ${identityLabels.join(', ')}` : ''}]`,
    `${withIdentity.length} vin(s) bu(s) correspondant :`,
    ...renderListLines(withIdentity, formatDrunkLine),
  ]
  return { intent: 'temporal', label: dateRange.label, resultCount: withIdentity.length, formattedText: lines.join('\n') }
}

function buildGeographicBlock(classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]): SqlRetrievalBlock | null {
  const { country, region, appellation, appellationPattern, freeLocation: rawFreeLocation } = classified.filters
  const hasGeoFilter = !!(country || region || appellation || appellationPattern)
  const freeLocation = rawFreeLocation?.trim()
  if (!hasGeoFilter && !freeLocation) return null

  const scope = effectiveScope(classified, 'drunk')
  const corpus = scope === 'cave' ? cave : scope === 'drunk' ? drunk : [...drunk, ...cave]

  const matches = hasGeoFilter
    ? applyClassifiedFilters(corpus, classified)
    : filterByFreeLocation(corpus, freeLocation!)
  const label = hasGeoFilter ? classifiedFilterLabels(classified).join(', ') : `lieu libre: ${freeLocation}`
  const scopeLabel = scope === 'cave' ? 'en cave' : scope === 'drunk' ? 'bus' : 'cave + bus'
  const formatter = scope === 'cave' ? formatCaveLine : formatDrunkLine
  const lines = [
    `[GEOGRAPHIQUE — ${label} | scope: ${scopeLabel}]`,
    `${matches.length} vin(s) correspondant :`,
    ...renderListLines(matches, formatter),
  ]
  return { intent: 'geographic', label, resultCount: matches.length, formattedText: lines.join('\n') }
}

function buildQuantitativeBlock(classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]): SqlRetrievalBlock | null {
  const scope = effectiveScope(classified, 'both')
  const drunkMatches = applyClassifiedFilters(drunk, classified)
  const caveMatches = applyClassifiedFilters(cave, classified)
  const caveQty = caveMatches.reduce((acc, b) => acc + (b.quantity ?? 1), 0)
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

function buildRankingBlock(classified: ClassifiedIntent, drunk: Bottle[]): SqlRetrievalBlock | null {
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
    const diff = (b.rating ?? 0) - (a.rating ?? 0)
    return direction === 'desc' ? diff : -diff
  }).slice(0, limit)
  const lines = [
    `[CLASSEMENT — top ${limit} par note ${direction === 'desc' ? 'descendante' : 'ascendante'} | filtres: ${filterLabel}]`,
    ...sorted.map(formatDrunkLine),
  ]
  return { intent: 'ranking', label: `top ${limit} ${direction}`, resultCount: sorted.length, formattedText: lines.join('\n') }
}

function buildInventoryBlock(classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]): SqlRetrievalBlock | null {
  const scope = effectiveScope(classified, 'both')
  const filterLabel = classifiedFilterLabels(classified).join(', ') || '(sans filtre)'
  const freeLocation = classified.filters.freeLocation?.trim()
  const normLoc = freeLocation ? normalizeForMatch(freeLocation) : ''

  const applyAll = (list: Bottle[]): Bottle[] => {
    const filtered = applyClassifiedFilters(list, classified)
    return normLoc ? filtered.filter((b) => matchesFreeLocation(b, normLoc)) : filtered
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
        ...renderListLines(matches, formatDrunkLine),
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
        ...renderListLines(matches, formatCaveLine),
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
      ...renderListLines(drunkMatches, formatDrunkLine),
      `En cave :`,
      ...renderListLines(caveMatches, formatCaveLine),
    ].join('\n'),
  }
}

const INTENT_BUILDERS: Record<FactualIntent, (classified: ClassifiedIntent, drunk: Bottle[], cave: Bottle[]) => SqlRetrievalBlock | null> = {
  temporal: (c, drunk) => buildTemporalBlock(c, drunk),
  geographic: buildGeographicBlock,
  quantitative: buildQuantitativeBlock,
  ranking: (c, drunk) => buildRankingBlock(c, drunk),
  inventory: buildInventoryBlock,
}

export function routeFactualQueryFromClassification(
  classified: ClassifiedIntent | null,
  drunk: Bottle[],
  cave: Bottle[],
): SqlRetrievalResult | null {
  if (!classified || !classified.isFactual || !classified.intent) return null

  const block = INTENT_BUILDERS[classified.intent](classified, drunk, cave)
  if (!block) return null

  const serialized = [
    'Recuperation factuelle deterministe sur la cave et les degustations. Chaque bloc est un resultat exact, pas une inference.',
    block.formattedText,
  ].join('\n\n')

  const trace: SqlRetrievalTrace = {
    detectedIntents: [classified.intent],
    matchedFilters: classifiedFilterLabels(classified),
    blocks: [{ intent: block.intent, label: block.label, resultCount: block.resultCount }],
  }

  return { blocks: [block], serialized, trace }
}
