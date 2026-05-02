import type { ContextPlan } from './context-plan.ts'
import type { AuthContext } from './auth.ts'
import { normalizeExactQueryText, parseTastingCountQuery } from './exact-query.ts'
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
  totalRows: number
  query?: string
  queryLabel?: string
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

async function resolveCaveFromBackend(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth: SourceResolverAuth,
): Promise<ResolvedCaveSource> {
  const local = resolveCave(body, contextPlan)
  if (body.cave.length > 0 || contextPlan.cave === 'none' || !auth?.userId || !auth.supabase) return local

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

  const exactQuery = parseTastingCountQuery(body.message)
  if (!exactQuery) return undefined

  const { data, error } = await auth.supabase
    .from('bottles')
    .select('domaine,cuvee,appellation,millesime,couleur,country,region')
    .eq('user_id', auth.userId)
    .eq('status', 'drunk')

  if (error) {
    console.warn('[celestin:source-resolver] tasting count lookup failed:', error.message)
    return undefined
  }

  const rows = (data ?? []).filter((row: Record<string, unknown>) => matchesTastingQuery(row, exactQuery.query))
  return {
    totalRows: rows.length,
    query: exactQuery.query,
    queryLabel: exactQuery.query,
  }
}

export function resolveContextSources(body: RequestBody, contextPlan: ContextPlan): ResolvedContextSources {
  return {
    requirements: buildSourceRequirements(contextPlan),
    profile: resolveProfile(body, contextPlan),
    memories: resolveMemories(body, contextPlan),
    sqlRetrieval: resolveSqlRetrieval(body, contextPlan),
    tastings: undefined,
    cave: resolveCave(body, contextPlan),
    zones: resolveZones(body, contextPlan),
  }
}

export async function resolveContextSourcesForRequest(
  body: RequestBody,
  contextPlan: ContextPlan,
  auth?: SourceResolverAuth,
): Promise<ResolvedContextSources> {
  const [profile, cave, zones, tastings] = await Promise.all([
    resolveProfileFromBackend(body, contextPlan, auth),
    resolveCaveFromBackend(body, contextPlan, auth),
    resolveZonesFromBackend(body, contextPlan, auth),
    resolveTastingsFromBackend(body, contextPlan, auth),
  ])

  return {
    requirements: buildSourceRequirements(contextPlan),
    profile,
    memories: resolveMemories(body, contextPlan),
    sqlRetrieval: resolveSqlRetrieval(body, contextPlan),
    tastings,
    cave,
    zones,
  }
}
