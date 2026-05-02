import type { ContextPlan } from './context-plan.ts'
import type { AuthContext } from './auth.ts'
import { normalizeExactQueryText, parseTastingCountQuery, parseTastingRatingQuery } from '../../../shared/celestin/exact-query.ts'
import type { CaveBottle, RequestBody } from './types.ts'

export type SourceRequirementKind =
  | 'profile'
  | 'cave'
  | 'zones'
  | 'memories'
  | 'tastings'
  | 'tools'
  | 'sql_retrieval'

export interface SourceRequirement {
  kind: SourceRequirementKind
  level: string
  reason: string
}

export interface ResolvedProfileSource {
  level: ContextPlan['profile']
  compiledMarkdown?: string
  legacyProfile?: string
}

export interface ResolvedMemoriesSource {
  level: ContextPlan['memories']
  text: string
  evidenceMode?: RequestBody['memoryEvidenceMode']
  selectedCount?: number
  source?: 'request' | 'backend_tastings'
}

export interface ResolvedSqlSource {
  text: string
}

export interface ResolvedCaveSource {
  level: ContextPlan['cave']
  totalBottles: number
  referenceCount: number
  bottles: CaveBottle[]
}

export interface ResolvedTastingsSource {
  kind: 'count' | 'rating'
  totalRows: number
  query?: string
  queryLabel?: string
  rows?: Array<{
    domaine: string | null
    cuvee: string | null
    appellation: string | null
    millesime: number | null
    couleur: string | null
    rating: number | null
    drunk_at: string | null
    tasting_note?: string | null
  }>
}

export interface ResolvedContextSources {
  requirements: SourceRequirement[]
  profile?: ResolvedProfileSource
  memories?: ResolvedMemoriesSource
  sqlRetrieval?: ResolvedSqlSource
  tastings?: ResolvedTastingsSource
  cave: ResolvedCaveSource
  zones: string[]
}

type SourceResolverAuth = Pick<AuthContext, 'userId' | 'supabase'> | undefined

export function buildSourceRequirements(contextPlan: ContextPlan): SourceRequirement[] {
  const requirements: SourceRequirement[] = []

  if (contextPlan.profile !== 'none') {
    requirements.push({
      kind: 'profile',
      level: contextPlan.profile,
      reason: contextPlan.profile === 'recommendation'
        ? 'recommendation needs taste profile signals'
        : 'turn may benefit from lightweight user profile',
    })
  }

  if (contextPlan.cave !== 'none') {
    requirements.push({
      kind: 'cave',
      level: contextPlan.cave,
      reason: contextPlan.cave === 'tool_only'
        ? 'exact cellar facts must be fetched deterministically'
        : 'route needs bounded cellar context',
    })
  }

  if (contextPlan.zones !== 'none') {
    requirements.push({
      kind: 'zones',
      level: contextPlan.zones,
      reason: 'cellar actions and recommendations can mention available storage zones',
    })
  }

  if (contextPlan.memories !== 'none') {
    requirements.push({
      kind: 'memories',
      level: contextPlan.memories,
      reason: contextPlan.memories === 'exact'
        ? 'memory lookup must use exact tasting evidence'
        : 'recommendation can use targeted tasting texture',
    })
  }

  if (contextPlan.tools !== 'none') {
    requirements.push({
      kind: 'tools',
      level: contextPlan.tools,
      reason: 'route allows deterministic backend tool retrieval',
    })
  }

  if (contextPlan.tools === 'force_tastings') {
    requirements.push({
      kind: 'tastings',
      level: 'exact',
      reason: 'route needs exact tasting facts from backend source',
    })
  }

  if (contextPlan.truthPolicy === 'exact_only' || contextPlan.truthPolicy === 'memory_only') {
    requirements.push({
      kind: 'sql_retrieval',
      level: contextPlan.truthPolicy,
      reason: 'answer must prefer exact retrieved facts over generated knowledge',
    })
  }

  return requirements
}

function summarizeCave(cave: CaveBottle[]): Pick<ResolvedCaveSource, 'totalBottles' | 'referenceCount'> {
  return {
    referenceCount: cave.length,
    totalBottles: cave.reduce((sum, bottle) => sum + Math.max(1, bottle.quantity ?? 1), 0),
  }
}

function resolveProfile(body: RequestBody, contextPlan: ContextPlan): ResolvedProfileSource | undefined {
  if (contextPlan.profile === 'none') return undefined

  const compiledMarkdown = body.compiledProfileMarkdown?.trim()
  if (compiledMarkdown) {
    return {
      level: contextPlan.profile,
      compiledMarkdown,
    }
  }

  const legacyProfile = body.profile?.trim()
  if (!legacyProfile) return undefined

  return {
    level: contextPlan.profile,
    legacyProfile,
  }
}

async function resolveProfileFromBackend(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth: SourceResolverAuth,
): Promise<ResolvedProfileSource | undefined> {
  const local = resolveProfile(body, contextPlan)
  if (local || contextPlan.profile === 'none' || !auth?.userId || !auth.supabase) return local

  const { data, error } = await auth.supabase
    .from('user_profiles')
    .select('compiled_markdown')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (error) {
    console.warn('[celestin:source-resolver] profile lookup failed:', error.message)
    return undefined
  }

  const compiledMarkdown = typeof data?.compiled_markdown === 'string' ? data.compiled_markdown.trim() : ''
  if (!compiledMarkdown) return undefined

  return {
    level: contextPlan.profile,
    compiledMarkdown,
  }
}

function resolveMemories(body: RequestBody, contextPlan: ContextPlan): ResolvedMemoriesSource | undefined {
  if (contextPlan.memories === 'none') return undefined

  const text = body.memories?.trim()
  if (!text) return undefined

  return {
    level: contextPlan.memories,
    text,
    evidenceMode: body.memoryEvidenceMode,
    source: 'request',
  }
}

const MEMORY_STOP_WORDS = new Set([
  'avec',
  'avoir',
  'avais',
  'boire',
  'bouteille',
  'bouteilles',
  'cave',
  'cela',
  'cette',
  'dans',
  'degustation',
  'degustations',
  'donne',
  'envie',
  'faire',
  'fait',
  'faut',
  'j avais',
  'mais',
  'manger',
  'pour',
  'quel',
  'quelle',
  'quoi',
  'rappelle',
  'recommande',
  'recommandation',
  'souvenir',
  'souviens',
  'super',
  'trouve',
  'veux',
  'vin',
  'vins',
])

function memoryTokens(message: string): string[] {
  return [...new Set(
    normalizeExactQueryText(message)
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !MEMORY_STOP_WORDS.has(token)),
  )]
}

function rowText(row: Record<string, unknown>): string {
  return [
    tastingIdentityText(row),
    row.tasting_note,
    row.tasting_tags && typeof row.tasting_tags === 'object' ? JSON.stringify(row.tasting_tags) : '',
  ].filter(Boolean).join(' ')
}

function scoreMemoryRow(row: Record<string, unknown>, tokens: string[]): number {
  if (tokens.length === 0) return 0

  const identity = normalizeExactQueryText(tastingIdentityText(row))
  const fullText = normalizeExactQueryText(rowText(row))
  let score = 0

  for (const token of tokens) {
    if (identity.includes(token)) score += 3
    else if (fullText.includes(token)) score += 2
  }

  if (score === 0) return 0

  const rating = typeof row.rating === 'number' ? row.rating : null
  if (rating && rating >= 4) score += 0.5
  if (typeof row.tasting_note === 'string' && row.tasting_note.trim().length > 0) score += 0.5

  return score
}

function tastingLabel(row: Record<string, unknown>): string {
  return [
    row.domaine,
    row.cuvee,
    row.appellation,
    row.millesime,
  ].filter(Boolean).join(' ')
}

function serializeTargetedMemories(input: {
  message: string
  level: ContextPlan['memories']
  rows: Record<string, unknown>[]
}): string {
  const lines: string[] = []
  const exact = input.level === 'exact'

  lines.push(exact ? 'Souvenirs exacts de degustation retrouves en base.' : 'Souvenirs de degustation cibles retrouves en base.')
  lines.push(`Question actuelle : ${input.message.trim()}`)
  lines.push(exact
    ? 'N affirme rien hors de ces degustations. Si le souvenir demande n apparait pas ici, dis-le franchement.'
    : 'Utilise ces souvenirs pour la texture personnelle seulement s ils aident directement la reponse.')
  lines.push(`Degustations fournies : ${input.rows.length}.`)

  for (const row of input.rows) {
    const label = tastingLabel(row) || 'Degustation'
    const rating = typeof row.rating === 'number' ? ` | note=${row.rating}/5` : ''
    const date = typeof row.drunk_at === 'string' ? ` | bu le ${row.drunk_at.slice(0, 10)}` : ''
    const note = typeof row.tasting_note === 'string' && row.tasting_note.trim()
      ? `\n  Note : ${row.tasting_note.trim().slice(0, 500)}`
      : ''
    lines.push(`- ${label}${rating}${date}${note}`)
  }

  return lines.join('\n')
}

async function resolveMemoriesFromBackend(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth: SourceResolverAuth,
): Promise<ResolvedMemoriesSource | undefined> {
  const local = resolveMemories(body, contextPlan)
  if (local || contextPlan.memories === 'none' || !auth?.userId || !auth.supabase) return local
  if (
    contextPlan.tools === 'force_tastings'
    && (parseTastingCountQuery(body.message) || parseTastingRatingQuery(body.message))
  ) return undefined

  const tokens = memoryTokens(body.message)
  if (tokens.length === 0) return undefined

  const { data, error } = await auth.supabase
    .from('bottles')
    .select('domaine,cuvee,appellation,millesime,couleur,country,region,rating,drunk_at,tasting_note,tasting_tags')
    .eq('user_id', auth.userId)
    .eq('status', 'drunk')
    .order('drunk_at', { ascending: false, nullsFirst: false })
    .limit(120)

  if (error) {
    console.warn('[celestin:source-resolver] tasting memory lookup failed:', error.message)
    return undefined
  }

  const ranked = (data ?? [])
    .map((row: Record<string, unknown>) => ({ row, score: scoreMemoryRow(row, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, contextPlan.memories === 'exact' ? 8 : 5)
    .map((candidate) => candidate.row)

  if (ranked.length === 0) return undefined

  return {
    level: contextPlan.memories,
    text: serializeTargetedMemories({
      message: body.message,
      level: contextPlan.memories,
      rows: ranked,
    }),
    evidenceMode: contextPlan.memories === 'exact' ? 'exact' : 'synthesis',
    selectedCount: ranked.length,
    source: 'backend_tastings',
  }
}

function resolveSqlRetrieval(body: RequestBody, contextPlan: ContextPlan): ResolvedSqlSource | undefined {
  const text = body.sqlRetrieval?.trim()
  if (!text) return undefined

  const shouldUseSql =
    contextPlan.tools !== 'none'
    || contextPlan.truthPolicy === 'exact_only'
    || contextPlan.truthPolicy === 'memory_only'

  if (!shouldUseSql) return undefined
  return { text }
}

function resolveZones(body: RequestBody, contextPlan: ContextPlan): string[] {
  if (contextPlan.zones === 'none') return []

  const zones = (body as Record<string, unknown>).zones
  if (!Array.isArray(zones)) return []

  return zones.filter((zone): zone is string => typeof zone === 'string' && zone.trim().length > 0)
}

async function resolveZonesFromBackend(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth: SourceResolverAuth,
): Promise<string[]> {
  const local = resolveZones(body, contextPlan)
  if (local.length > 0 || contextPlan.zones === 'none' || !auth?.userId || !auth.supabase) return local

  const { data, error } = await auth.supabase
    .from('zones')
    .select('name')
    .eq('user_id', auth.userId)
    .order('position', { ascending: true })

  if (error) {
    console.warn('[celestin:source-resolver] zones lookup failed:', error.message)
    return []
  }

  return (data ?? [])
    .map((row: Record<string, unknown>) => row.name)
    .filter((zone): zone is string => typeof zone === 'string' && zone.trim().length > 0)
}

function resolveCave(body: RequestBody, contextPlan: ContextPlan): ResolvedCaveSource {
  const counts = summarizeCave(body.cave)
  const shouldIncludeBottles = contextPlan.cave === 'shortlist' || contextPlan.cave === 'full_debug'

  return {
    level: contextPlan.cave,
    ...counts,
    bottles: shouldIncludeBottles ? body.cave : [],
  }
}

function compactCaveBottle(row: Record<string, unknown>): CaveBottle {
  const rawVolume = row.volume_l ?? row.volume
  return {
    id: typeof row.id === 'string' ? row.id.slice(0, 8) : '',
    domaine: typeof row.domaine === 'string' ? row.domaine : null,
    cuvee: typeof row.cuvee === 'string' ? row.cuvee : null,
    appellation: typeof row.appellation === 'string' ? row.appellation : null,
    millesime: typeof row.millesime === 'number' ? row.millesime : null,
    couleur: typeof row.couleur === 'string' ? row.couleur : null,
    character: typeof row.character === 'string' ? row.character : null,
    quantity: typeof row.quantity === 'number' ? row.quantity : 1,
    volume: typeof rawVolume === 'number' ? String(rawVolume) : typeof rawVolume === 'string' ? rawVolume : undefined,
  }
}

async function resolveCaveFromBackend(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth: SourceResolverAuth,
): Promise<ResolvedCaveSource> {
  const local = resolveCave(body, contextPlan)
  if (body.cave.length > 0 || contextPlan.cave === 'none' || !auth?.userId || !auth.supabase) return local

  if (contextPlan.cave === 'shortlist' || contextPlan.cave === 'full_debug') {
    const maxRows = contextPlan.cave === 'full_debug' ? 80 : 40
    const { data, error } = await auth.supabase
      .from('bottles')
      .select('id,domaine,cuvee,appellation,millesime,couleur,character,quantity,volume_l')
      .eq('user_id', auth.userId)
      .eq('status', 'in_stock')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(maxRows)

    if (error) {
      console.warn('[celestin:source-resolver] cellar shortlist lookup failed:', error.message)
      return local
    }

    const bottles = (data ?? []).map((row: Record<string, unknown>) => compactCaveBottle(row))
    return {
      level: contextPlan.cave,
      referenceCount: bottles.length,
      totalBottles: bottles.reduce((sum, bottle) => sum + Math.max(1, bottle.quantity ?? 1), 0),
      bottles,
    }
  }

  const { data, error } = await auth.supabase
    .from('bottles')
    .select('quantity')
    .eq('user_id', auth.userId)
    .eq('status', 'in_stock')

  if (error) {
    console.warn('[celestin:source-resolver] cellar count lookup failed:', error.message)
    return local
  }

  const rows = data ?? []
  return {
    level: contextPlan.cave,
    referenceCount: rows.length,
    totalBottles: rows.reduce((sum: number, row: Record<string, unknown>) => {
      const quantity = typeof row.quantity === 'number' ? row.quantity : 1
      return sum + Math.max(1, quantity)
    }, 0),
    bottles: [],
  }
}

function tastingIdentityText(row: Record<string, unknown>): string {
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

function compactTasting(row: Record<string, unknown>): NonNullable<ResolvedTastingsSource['rows']>[number] {
  return {
    domaine: typeof row.domaine === 'string' ? row.domaine : null,
    cuvee: typeof row.cuvee === 'string' ? row.cuvee : null,
    appellation: typeof row.appellation === 'string' ? row.appellation : null,
    millesime: typeof row.millesime === 'number' ? row.millesime : null,
    couleur: typeof row.couleur === 'string' ? row.couleur : null,
    rating: typeof row.rating === 'number' ? row.rating : null,
    drunk_at: typeof row.drunk_at === 'string' ? row.drunk_at : null,
    tasting_note: typeof row.tasting_note === 'string' ? row.tasting_note.slice(0, 500) : null,
  }
}

function matchesTastingQuery(row: Record<string, unknown>, query: string | undefined): boolean {
  if (!query) return true
  return normalizeExactQueryText(tastingIdentityText(row)).includes(normalizeExactQueryText(query))
}

async function resolveTastingsFromBackend(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth: SourceResolverAuth,
): Promise<ResolvedTastingsSource | undefined> {
  if (contextPlan.tools !== 'force_tastings' || !auth?.userId || !auth.supabase) return undefined

  const countQuery = parseTastingCountQuery(body.message)
  const ratingQuery = parseTastingRatingQuery(body.message)
  if (!countQuery && !ratingQuery) return undefined

  const { data, error } = await auth.supabase
    .from('bottles')
    .select('domaine,cuvee,appellation,millesime,couleur,country,region,rating,drunk_at,tasting_note')
    .eq('user_id', auth.userId)
    .eq('status', 'drunk')

  if (error) {
    console.warn('[celestin:source-resolver] tasting count lookup failed:', error.message)
    return undefined
  }

  const query = countQuery?.query ?? ratingQuery?.query
  const rows = (data ?? []).filter((row: Record<string, unknown>) => matchesTastingQuery(row, query))
  if (ratingQuery) {
    return {
      kind: 'rating',
      totalRows: rows.length,
      query: ratingQuery.query,
      queryLabel: ratingQuery.query,
      rows: rows.map((row: Record<string, unknown>) => compactTasting(row)),
    }
  }

  return {
    kind: 'count',
    totalRows: rows.length,
    query: countQuery?.query,
    queryLabel: countQuery?.query,
  }
}

export async function resolveContextSourcesForRequest(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth?: SourceResolverAuth,
): Promise<ResolvedContextSources> {
  const [profile, cave, zones, memories, tastings] = await Promise.all([
    resolveProfileFromBackend(body, contextPlan, auth),
    resolveCaveFromBackend(body, contextPlan, auth),
    resolveZonesFromBackend(body, contextPlan, auth),
    resolveMemoriesFromBackend(body, contextPlan, auth),
    resolveTastingsFromBackend(body, contextPlan, auth),
  ])

  return {
    requirements: buildSourceRequirements(contextPlan),
    profile,
    memories,
    sqlRetrieval: resolveSqlRetrieval(body, contextPlan),
    tastings,
    cave,
    zones,
  }
}
