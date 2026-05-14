import type { SupabaseServiceClient } from "./auth.ts"

export type CelestinToolName = 'query_cellar' | 'query_tastings' | 'query_memory' | 'search_cellar_candidates'

export interface ToolContext {
  userId: string
  supabase: SupabaseServiceClient
}

export type ToolInput = Record<string, unknown>

const MAX_LIMIT = 12
const MAX_SCAN_ROWS = 500
const DEFAULT_RECOMMENDATION_LIMIT = 6
type TastingAggregate = 'list' | 'count' | 'first' | 'last' | 'best' | 'worst'

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : undefined
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function limit(value: unknown): number {
  const n = integer(value)
  if (!n) return 8
  return Math.min(MAX_LIMIT, Math.max(1, n))
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const raw = text(value)
  if (!raw) return undefined
  return allowed.includes(raw as T) ? raw as T : undefined
}

function recommendationLimit(value: unknown): number {
  const n = integer(value)
  if (!n) return DEFAULT_RECOMMENDATION_LIMIT
  return Math.min(8, Math.max(1, n))
}

function compactBottle(row: Record<string, unknown>) {
  return {
    id: typeof row.id === 'string' ? row.id.slice(0, 8) : null,
    domaine: row.domaine ?? null,
    cuvee: row.cuvee ?? null,
    appellation: row.appellation ?? null,
    millesime: row.millesime ?? null,
    couleur: row.couleur ?? null,
    country: row.country ?? null,
    region: row.region ?? null,
    quantity: row.quantity ?? null,
    status: row.status ?? null,
    shelf: row.shelf ?? null,
    rating: row.rating ?? null,
    drunk_at: row.drunk_at ?? null,
    tasting_note: typeof row.tasting_note === 'string' ? row.tasting_note.slice(0, 500) : null,
  }
}

function compactCandidateBottle(row: Record<string, unknown> & { local_score?: number }) {
  const pairings = Array.isArray(row.food_pairings)
    ? row.food_pairings.filter((item): item is string => typeof item === 'string').slice(0, 3)
    : []
  const character = typeof row.character === 'string' ? row.character.slice(0, 160) : null
  return {
    id: typeof row.id === 'string' ? row.id.slice(0, 8) : null,
    domaine: row.domaine ?? null,
    cuvee: row.cuvee ?? null,
    appellation: row.appellation ?? null,
    millesime: row.millesime ?? null,
    couleur: row.couleur ?? null,
    country: row.country ?? null,
    region: row.region ?? null,
    grape_varieties: Array.isArray(row.grape_varieties) ? row.grape_varieties.slice(0, 3) : null,
    food_pairings: pairings.length > 0 ? pairings : null,
    character,
    quantity: row.quantity ?? null,
    status: row.status ?? null,
    why_candidate: whyCandidate(row, character, pairings),
  }
}

function buildToolResult(input: {
  source: 'cellar' | 'tastings'
  aggregate: TastingAggregate
  totalRows: number
  rows: Array<ReturnType<typeof compactBottle>>
  totalQuantity?: number
  rowLimit: number
}) {
  if (input.aggregate === 'count') {
    return {
      source: input.source,
      aggregate: 'count',
      totalRows: input.totalRows,
      totalQuantity: input.totalQuantity,
      countIsAuthoritative: true,
      examples: input.rows.slice(0, 3),
      instruction: 'Pour repondre a une question de nombre, utilise totalRows comme chiffre exact. Les exemples ne sont pas une liste complete. Reponds avec le chiffre exact d abord, puis une phrase courte et naturelle si les exemples aident.',
    }
  }

  if (input.aggregate === 'first' || input.aggregate === 'last' || input.aggregate === 'best' || input.aggregate === 'worst') {
    return {
      source: input.source,
      aggregate: input.aggregate,
      totalRows: input.totalRows,
      matchingRows: input.totalRows,
      listedRows: input.rows.length,
      row: input.rows[0] ?? null,
      countIsAuthoritative: false,
      instruction: 'Reponds uniquement a partir de row pour identifier l extreme demande. N utilise pas totalRows comme un nombre exact de degustations; il indique seulement combien de lignes correspondent aux filtres apres recherche. Si row est null, dis que tu ne retrouves pas de donnee fiable.',
    }
  }

  return {
    source: input.source,
    aggregate: 'list',
    totalRows: input.totalRows,
    listedRows: input.rows.length,
    totalQuantity: input.totalQuantity,
    rows: input.rows,
    note: input.totalRows > input.rowLimit ? `Resultat tronque a ${input.rowLimit} lignes.` : undefined,
  }
}

function normalize(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, ' ')
    .trim()
}

function includesText(value: unknown, needle: string | undefined): boolean {
  if (!needle) return true
  return normalize(value).includes(normalize(needle))
}

const FREE_QUERY_STOPWORDS = new Set([
  'avec',
  'dans',
  'deja',
  'des',
  'est',
  'ete',
  'etre',
  'j ai',
  'les',
  'mes',
  'pour',
  'que',
  'quel',
  'quelle',
  'quelles',
  'quels',
  'suis',
  'une',
  'vin',
  'vins',
])

function freeQueryTokens(query: string): string[] {
  return normalize(query)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !FREE_QUERY_STOPWORDS.has(token))
}

function freeQueryScore(value: unknown, rawQuery: string | undefined): number {
  if (!rawQuery) return 1

  const haystack = normalize(value)
  const normalizedQuery = normalize(rawQuery)
  if (!haystack) return 0
  if (normalizedQuery && haystack.includes(normalizedQuery)) return 100

  const tokens = freeQueryTokens(rawQuery)
  if (tokens.length === 0) return 0
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

export function scoreCelestinToolFreeQueryForTest(value: unknown, rawQuery: string | undefined): number {
  return freeQueryScore(value, rawQuery)
}

function identityText(row: Record<string, unknown>): string {
  return [
    row.domaine,
    row.cuvee,
    row.appellation,
    row.millesime,
    row.couleur,
    row.country,
    row.region,
  ].filter(Boolean).join(' ')
}

function candidateText(row: Record<string, unknown>): string {
  return [
    identityText(row),
    Array.isArray(row.grape_varieties) ? row.grape_varieties.join(' ') : '',
    Array.isArray(row.food_pairings) ? row.food_pairings.join(' ') : '',
    row.character,
  ].filter(Boolean).join(' ')
}

function whyCandidate(row: Record<string, unknown>, character: string | null, pairings: string[]): string {
  if (character) return character
  if (pairings.length > 0) return `Accords reperes : ${pairings.join(', ')}.`
  const color = typeof row.couleur === 'string' ? row.couleur : 'vin'
  return `Candidat ${color} disponible en cave.`
}

function tagsText(row: Record<string, unknown>): string {
  const tags = row.tasting_tags
  if (!tags || typeof tags !== 'object') return ''
  return JSON.stringify(tags)
}

function matchesWineFilters(row: Record<string, unknown>, input: ToolInput): boolean {
  const identity = identityText(row)

  const domaine = text(input.domaine)
  const cuvee = text(input.cuvee)
  const appellation = text(input.appellation)
  const country = text(input.country)
  const region = text(input.region)
  const color = text(input.color)
  const vintage = integer(input.vintage)
  const freeQuery = text(input.query)

  if (domaine && !includesText(row.domaine, domaine)) return false
  if (cuvee && !includesText(row.cuvee, cuvee)) return false
  // For broad regions/appellations such as "Champagne", accept identity-level
  // matches. Some imported rows carry producer/cuvee text richer than the
  // appellation column.
  if (appellation && !includesText(identity, appellation)) return false
  if (country && !includesText(identity, country)) return false
  if (region && !includesText(identity, region)) return false
  if (color && normalize(row.couleur) !== normalize(color)) return false
  if (vintage && row.millesime !== vintage) return false
  if (freeQuery && freeQueryScore([identity, row.tasting_note, tagsText(row)].join(' '), freeQuery) <= 0) return false
  return true
}

function rankByFreeQuery<T extends Record<string, unknown>>(rows: T[], input: ToolInput): T[] {
  const freeQuery = text(input.query)
  if (!freeQuery) return rows

  return [...rows].sort((a, b) => {
    const bScore = freeQueryScore([identityText(b), b.tasting_note, tagsText(b)].join(' '), freeQuery)
    const aScore = freeQueryScore([identityText(a), a.tasting_note, tagsText(a)].join(' '), freeQuery)
    return bScore - aScore
  })
}

export function requestedColor(input: ToolInput): string | undefined {
  const explicit = text(input.color)
  if (explicit) return normalize(explicit)
  const query = normalize(text(input.query))
  if (/\b(rouge|rouges)\b/.test(query)) return 'rouge'
  if (/\b(blanc|blancs)\b/.test(query)) return 'blanc'
  if (/\b(rose|roses|rosé|rosés)\b/.test(query)) return 'rose'
  if (/\b(champagne|bulles|petillant|pétillant|effervescent)\b/.test(query)) return 'bulles'
  return undefined
}

function styleScore(row: Record<string, unknown>, rawStyle: string | undefined): number {
  if (!rawStyle) return 0
  return freeQueryScore(candidateText(row), rawStyle) * 2
}

function rankRecommendationCandidates(rows: Array<Record<string, unknown>>, input: ToolInput) {
  const query = text(input.query)
  const style = text(input.style)
  const color = requestedColor(input)

  return rows
    .map((row) => {
      const queryScore = freeQueryScore(candidateText(row), query)
      const colorScore = color && normalize(row.couleur) === color ? 6 : 0
      const inStockScore = typeof row.quantity === 'number' && row.quantity > 0 ? 2 : 0
      return {
        row,
        score: queryScore * 3 + styleScore(row, style) + colorScore + inStockScore,
      }
    })
    .filter((entry) => {
      if (color && normalize(entry.row.couleur) !== color) return false
      return entry.score > 0 || !query
    })
    .sort((a, b) => b.score - a.score)
    .map(({ row, score }) => ({ ...row, local_score: score }))
}

export const CELESTIN_TOOLS = [
  {
    name: 'query_cellar',
    description: [
      'Recherche exacte dans la cave actuelle de l utilisateur.',
      'Utilise cet outil pour les questions factuelles sur le stock, les quantites, les millesimes, regions, appellations, producteurs ou bouteilles encore en cave.',
      'Ne l utilise pas pour une recommandation subjective si le contexte cave deja fourni suffit.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        domaine: { type: 'string', description: 'Producteur ou domaine mentionne.' },
        cuvee: { type: 'string' },
        appellation: { type: 'string' },
        country: { type: 'string' },
        region: { type: 'string' },
        color: { type: 'string', enum: ['rouge', 'blanc', 'rose', 'bulles'] },
        vintage: { type: 'number', description: 'Millesime.' },
        query: { type: 'string', description: 'Terme libre a chercher dans l identite du vin.' },
        aggregate: { type: 'string', enum: ['list', 'count'], description: 'count pour une question de nombre, list sinon.' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'query_tastings',
    description: [
      'Recherche exacte dans les degustations passees de l utilisateur.',
      'Utilise cet outil pour retrouver une note, une bouteille bue, une date de degustation, une note chiffree, un souvenir lie a un vin ou un millesime deja bu.',
      'Utilise aussi cet outil quand l utilisateur cherche un lieu, restaurant, ville, repas, contexte ou detail present dans ses notes de degustation.',
      'Utilise aussi cet outil pour toute question de nombre, liste ou verification sur les degustations passees : combien de degustations de Champagne, quels autres vins bus, ai-je deja deguste X, je n ai pas de degustation de X.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        domaine: { type: 'string' },
        cuvee: { type: 'string' },
        appellation: { type: 'string' },
        country: { type: 'string' },
        region: { type: 'string' },
        color: { type: 'string', enum: ['rouge', 'blanc', 'rose', 'bulles'] },
        vintage: { type: 'number' },
        minRating: { type: 'number' },
        maxRating: { type: 'number' },
        dateFrom: { type: 'string', description: 'Date ISO YYYY-MM-DD.' },
        dateTo: { type: 'string', description: 'Date ISO YYYY-MM-DD.' },
        query: { type: 'string', description: 'Terme libre a chercher dans l identite du vin, les notes et les tags.' },
        aggregate: { type: 'string', enum: ['list', 'count', 'first', 'last', 'best', 'worst'] },
        sortBy: { type: 'string', enum: ['drunk_at', 'rating', 'vintage'] },
        sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'query_memory',
    description: [
      'Recherche dans les faits de memoire conversationnelle compiles/extraits.',
      'Utilise cet outil quand l utilisateur demande ce que Celestin sait de lui, d une preference, d une envie, d un contexte personnel ou d une conversation passee.',
      'Le profil compile est deja dans le contexte : n appelle cet outil que si tu dois verifier un fait precis ou retrouver une source.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string', enum: ['preference', 'aversion', 'context', 'life_event', 'wine_knowledge', 'social', 'cellar_intent'] },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_cellar_candidates',
    description: [
      'Recherche des bouteilles candidates dans la cave actuelle pour une recommandation subjective.',
      'Utilise cet outil quand l utilisateur demande quoi boire, un accord mets-vin, une couleur ou un style de vin a choisir dans sa cave.',
      'L outil retourne une liste compacte de candidats avec bottle_id court, couleur, caractere court et why_candidate. Choisis ensuite 1 a 3 bouteilles dans recommendation_selection avec ces ids.',
      'Ne construis pas de cartes UI : le backend les materialise depuis recommendation_selection.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Demande naturelle complete : plat, occasion, contrainte couleur, style.' },
        color: { type: 'string', enum: ['rouge', 'blanc', 'rose', 'bulles'] },
        style: { type: 'string', description: 'Style recherche : gouleyant, tendu, ample, frais, gastronomique, etc.' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
]

export async function executeCelestinTool(name: string, input: ToolInput, ctx: ToolContext): Promise<string> {
  if (name === 'query_cellar') return queryCellar(input, ctx)
  if (name === 'query_tastings') return queryTastings(input, ctx)
  if (name === 'query_memory') return queryMemory(input, ctx)
  if (name === 'search_cellar_candidates') return searchCellarCandidates(input, ctx)
  return JSON.stringify({ error: `Unknown tool: ${name}` })
}

async function queryCellar(input: ToolInput, ctx: ToolContext): Promise<string> {
  const rowLimit = limit(input.limit)
  const aggregate = text(input.aggregate) === 'count' ? 'count' : 'list'
  const { data, error } = await fetchPagedCellarRows(input, ctx)
  if (error) return JSON.stringify({ error: error.message })

  const filtered = rankByFreeQuery(
    (data ?? []).filter((row: Record<string, unknown>) => matchesWineFilters(row, input)),
    input,
  )
  const rows = filtered.slice(0, rowLimit).map((row: Record<string, unknown>) => compactBottle(row))
  const totalQuantity = filtered.reduce((sum, row) => {
    const qty = typeof row.quantity === 'number' ? row.quantity : 1
    return sum + qty
  }, 0)
  return JSON.stringify(buildToolResult({
    source: 'cellar',
    aggregate,
    totalRows: filtered.length,
    totalQuantity,
    rows,
    rowLimit,
  }))
}

async function fetchPagedCellarRows(
  input: ToolInput,
  ctx: ToolContext,
): Promise<{ data: Array<Record<string, unknown>>; error: { message: string } | null }> {
  const allRows: Array<Record<string, unknown>> = []
  let offset = 0
  const needsVolume = text(input.query)?.toLowerCase().includes('demi') || text(input.query)?.toLowerCase().includes('magnum')

  while (true) {
    let query = ctx.supabase
      .from('bottles')
      .select(needsVolume
        ? 'id,domaine,cuvee,appellation,millesime,couleur,country,region,quantity,status,shelf,volume_l'
        : 'id,domaine,cuvee,appellation,millesime,couleur,country,region,quantity,status,shelf', { count: 'exact' })
      .eq('user_id', ctx.userId)
      .eq('status', 'in_stock')

    if (typeof query.order === 'function') {
      query = query.order('millesime', { ascending: true, nullsFirst: false })
    }

    const canPage = typeof query.range === 'function'
    const request = canPage
      ? query.range(offset, offset + MAX_SCAN_ROWS - 1)
      : query.limit(MAX_SCAN_ROWS)
    const { data, error } = await request
    if (error) return { data: [], error }

    const rows = (data ?? []) as Array<Record<string, unknown>>
    allRows.push(...rows)
    if (!canPage || rows.length < MAX_SCAN_ROWS) return { data: allRows, error: null }
    offset += MAX_SCAN_ROWS
  }
}

async function queryTastings(input: ToolInput, ctx: ToolContext): Promise<string> {
  const aggregate = oneOf(input.aggregate, ['list', 'count', 'first', 'last', 'best', 'worst'] as const) ?? 'list'
  const rowLimit = aggregate === 'first' || aggregate === 'last' || aggregate === 'best' || aggregate === 'worst'
    ? 1
    : limit(input.limit)
  if (isTastingExtremeAggregate(aggregate)) {
    const result = await queryTastingExtreme(input, ctx, aggregate)
    if ('error' in result) return JSON.stringify(result)

    return JSON.stringify(buildToolResult({
      source: 'tastings',
      aggregate,
      totalRows: result.matchingRows,
      rows: result.rows.map((row: Record<string, unknown>) => compactBottle(row)),
      rowLimit,
    }))
  }

  const { data, error } = await fetchPagedToolTastingRows(input, ctx)
  if (error) return JSON.stringify({ error: error.message })

  const filtered = rankByFreeQuery(
    (data ?? []).filter((row: Record<string, unknown>) => matchesWineFilters(row, input)),
    input,
  )
  const sorted = shouldPreserveFreeQueryRelevance(input)
    ? filtered
    : sortTastingRows(filtered, input, aggregate)
  const rows = sorted.slice(0, rowLimit).map((row: Record<string, unknown>) => compactBottle(row))
  return JSON.stringify(buildToolResult({
    source: 'tastings',
    aggregate,
    totalRows: sorted.length,
    rows: aggregate === 'count' ? rows.slice(0, 3) : rows,
    rowLimit,
  }))
}

function shouldPreserveFreeQueryRelevance(input: ToolInput): boolean {
  return !!text(input.query) && !text(input.sortBy) && !text(input.sortOrder)
}

async function fetchPagedToolTastingRows(
  input: ToolInput,
  ctx: ToolContext,
): Promise<{ data: Array<Record<string, unknown>>; error: { message: string } | null }> {
  const allRows: Array<Record<string, unknown>> = []
  let offset = 0
  const sortBy = oneOf(input.sortBy, ['drunk_at', 'rating', 'vintage'] as const)
  const sortOrder = oneOf(input.sortOrder, ['asc', 'desc'] as const)

  while (true) {
    let query = buildBaseTastingQuery(input, ctx)
    if (sortBy && typeof query.order === 'function') {
      const column = sortBy === 'vintage' ? 'millesime' : sortBy
      query = query.order(column, { ascending: sortOrder !== 'desc', nullsFirst: false })
    }

    const canPage = typeof query.range === 'function'
    const request = canPage
      ? query.range(offset, offset + MAX_SCAN_ROWS - 1)
      : query.limit(MAX_SCAN_ROWS)
    const { data, error } = await request
    if (error) return { data: [], error }

    const rows = (data ?? []) as Array<Record<string, unknown>>
    allRows.push(...rows)
    if (!canPage || rows.length < MAX_SCAN_ROWS) return { data: allRows, error: null }
    offset += MAX_SCAN_ROWS
  }
}

function buildBaseTastingQuery(input: ToolInput, ctx: ToolContext) {
  let query = ctx.supabase
    .from('bottles')
    .select('id,domaine,cuvee,appellation,millesime,couleur,country,region,rating,drunk_at,tasting_note,tasting_tags,status', { count: 'exact' })
    .eq('user_id', ctx.userId)
    .eq('status', 'drunk')

  const minRating = numberValue(input.minRating)
  const maxRating = numberValue(input.maxRating)
  const dateFrom = text(input.dateFrom)
  const dateTo = text(input.dateTo)
  if (minRating) query = query.gte('rating', minRating)
  if (maxRating) query = query.lte('rating', maxRating)
  if (dateFrom) query = query.gte('drunk_at', dateFrom)
  if (dateTo) query = query.lte('drunk_at', `${dateTo}T23:59:59.999Z`)
  return query
}

function isTastingExtremeAggregate(aggregate: TastingAggregate): aggregate is 'first' | 'last' | 'best' | 'worst' {
  return aggregate === 'first' || aggregate === 'last' || aggregate === 'best' || aggregate === 'worst'
}

function tastingExtremeOrder(aggregate: 'first' | 'last' | 'best' | 'worst') {
  if (aggregate === 'best') return { column: 'rating', ascending: false }
  if (aggregate === 'worst') return { column: 'rating', ascending: true }
  return { column: 'drunk_at', ascending: aggregate === 'first' }
}

async function queryTastingExtreme(
  input: ToolInput,
  ctx: ToolContext,
  aggregate: 'first' | 'last' | 'best' | 'worst',
): Promise<{ rows: Array<Record<string, unknown>>; matchingRows: number } | { error: string }> {
  const order = tastingExtremeOrder(aggregate)
  let offset = 0
  let matchingRows = 0
  let firstMatch: Record<string, unknown> | null = null

  while (true) {
    let query = buildBaseTastingQuery(input, ctx)
      .not(order.column, 'is', null)
      .order(order.column, { ascending: order.ascending, nullsFirst: false })

    if (typeof query.range === 'function') {
      query = query.range(offset, offset + MAX_SCAN_ROWS - 1)
    } else {
      query = query.limit(MAX_SCAN_ROWS)
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    const rows = (data ?? []) as Array<Record<string, unknown>>
    const matches = rows.filter((row) => matchesWineFilters(row, input))
    matchingRows += matches.length
    if (!firstMatch && matches.length > 0) firstMatch = matches[0]
    if (rows.length < MAX_SCAN_ROWS || typeof query.range !== 'function') {
      return { rows: firstMatch ? [firstMatch] : [], matchingRows }
    }
    offset += MAX_SCAN_ROWS
  }
}

function sortTastingRows<T extends Record<string, unknown>>(
  rows: T[],
  input: ToolInput,
  aggregate: TastingAggregate,
): T[] {
  const explicitSortBy = oneOf(input.sortBy, ['drunk_at', 'rating', 'vintage'] as const)
  const explicitSortOrder = oneOf(input.sortOrder, ['asc', 'desc'] as const)
  const sortBy = explicitSortBy
    ?? (aggregate === 'best' || aggregate === 'worst' ? 'rating' : 'drunk_at')
  const sortOrder = explicitSortOrder
    ?? (aggregate === 'first' || aggregate === 'worst' ? 'asc' : 'desc')

  return [...rows].sort((a, b) => {
    const left = sortableTastingValue(a, sortBy)
    const right = sortableTastingValue(b, sortBy)
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    return sortOrder === 'asc' ? left - right : right - left
  })
}

function sortableTastingValue(row: Record<string, unknown>, sortBy: 'drunk_at' | 'rating' | 'vintage'): number | null {
  if (sortBy === 'drunk_at') {
    if (typeof row.drunk_at !== 'string') return null
    const time = Date.parse(row.drunk_at)
    return Number.isNaN(time) ? null : time
  }
  if (sortBy === 'rating') {
    return typeof row.rating === 'number' ? row.rating : null
  }
  return typeof row.millesime === 'number' ? row.millesime : null
}

async function queryMemory(input: ToolInput, ctx: ToolContext): Promise<string> {
  const rowLimit = limit(input.limit)
  const rawQuery = text(input.query)
  if (!rawQuery) return JSON.stringify({ source: 'memory', rows: [] })
  const category = text(input.category)

  let query = ctx.supabase
    .from('user_memory_facts')
    .select('category,fact,confidence,source_quote,is_temporary,expires_at,created_at')
    .eq('user_id', ctx.userId)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(MAX_SCAN_ROWS)

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return JSON.stringify({ error: error.message })

  const matches = (data ?? [])
    .map((row: Record<string, unknown>) => ({
      row,
      score: freeQueryScore([row.fact, row.source_quote].join(' '), rawQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  const rows = matches.slice(0, rowLimit)

  return JSON.stringify({
    source: 'memory',
    query: rawQuery,
    totalRows: matches.length,
    rows: rows.map(({ row }) => ({
      category: row.category,
      fact: row.fact,
      confidence: row.confidence,
      source_quote: typeof row.source_quote === 'string' ? row.source_quote.slice(0, 300) : null,
      is_temporary: row.is_temporary,
      expires_at: row.expires_at,
      created_at: row.created_at,
    })),
  })
}

export async function searchCellarCandidates(input: ToolInput, ctx: ToolContext): Promise<string> {
  const rowLimit = recommendationLimit(input.limit)
  const rawQuery = text(input.query)

  const { data, error } = await ctx.supabase
    .from('bottles')
    .select('id,domaine,cuvee,appellation,millesime,couleur,country,region,grape_varieties,food_pairings,character,quantity,status')
    .eq('user_id', ctx.userId)
    .eq('status', 'in_stock')
    .limit(MAX_SCAN_ROWS)

  if (error) return JSON.stringify({ error: error.message })

  const ranked = rankRecommendationCandidates((data ?? []) as Array<Record<string, unknown>>, input)
  const rows = ranked.slice(0, rowLimit).map((row) => compactCandidateBottle(row))

  return JSON.stringify({
    source: 'cellar_candidates',
    query: rawQuery ?? null,
    totalRows: ranked.length,
    listedRows: rows.length,
    rows,
    instruction: 'Selectionne uniquement des bottle_id presents dans rows. Mets 1 a 3 ids dans recommendation_selection. Reponse chat courte; les cartes seront construites par le backend avec why_candidate/fiche bouteille.',
  })
}
