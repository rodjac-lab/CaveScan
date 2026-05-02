import { describe, expect, it } from 'vitest'
import { buildSourceRequirements, resolveContextSources, resolveContextSourcesForRequest } from './source-resolver'
import type { ContextPlan } from './context-plan'
import type { RequestBody } from './types'

function body(overrides: Partial<RequestBody> = {}): RequestBody {
  return {
    message: 'test',
    history: [],
    profile: 'Profil legacy',
    compiledProfileMarkdown: '## Profil compile',
    memories: 'Souvenir exact',
    memoryEvidenceMode: 'exact',
    sqlRetrieval: '[SQL exact]',
    cave: [
      {
        id: 'b1',
        domaine: 'Domaine A',
        cuvee: null,
        appellation: 'Chassagne-Montrachet',
        millesime: 2020,
        couleur: 'blanc',
        character: 'tendu',
        quantity: 2,
      },
    ],
    ...overrides,
  }
}

function plan(overrides: Partial<ContextPlan>): ContextPlan {
  return {
    profile: 'none',
    cave: 'none',
    zones: 'none',
    memories: 'none',
    tools: 'none',
    history: 'compact',
    truthPolicy: 'standard',
    reasons: ['test'],
    ...overrides,
  }
}

describe('resolveContextSources', () => {
  it('derives an empty source contract for pure wine questions', () => {
    const requirements = buildSourceRequirements(plan({
      profile: 'none',
      cave: 'none',
      memories: 'none',
      tools: 'none',
      truthPolicy: 'prudent_factual',
    }))

    expect(requirements).toEqual([])
  })

  it('derives exact cellar source contract for cellar lookups', () => {
    const requirements = buildSourceRequirements(plan({
      profile: 'none',
      cave: 'tool_only',
      zones: 'names',
      tools: 'force_cellar',
      truthPolicy: 'exact_only',
    }))

    expect(requirements.map((requirement) => `${requirement.kind}:${requirement.level}`)).toEqual([
      'cave:tool_only',
      'zones:names',
      'tools:force_cellar',
      'sql_retrieval:exact_only',
    ])
  })

  it('derives recommendation source contract without exact-only retrieval', () => {
    const requirements = buildSourceRequirements(plan({
      profile: 'recommendation',
      cave: 'shortlist',
      zones: 'names',
      memories: 'targeted',
      tools: 'auto',
      history: 'normal',
    }))

    expect(requirements.map((requirement) => `${requirement.kind}:${requirement.level}`)).toEqual([
      'profile:recommendation',
      'cave:shortlist',
      'zones:names',
      'memories:targeted',
      'tools:auto',
    ])
  })

  it('resolves no personal sources for wine questions', () => {
    const sources = resolveContextSources(body(), plan({
      profile: 'none',
      cave: 'none',
      memories: 'none',
      tools: 'none',
      truthPolicy: 'prudent_factual',
    }))

    expect(sources.profile).toBeUndefined()
    expect(sources.memories).toBeUndefined()
    expect(sources.sqlRetrieval).toBeUndefined()
    expect(sources.requirements).toEqual([])
    expect(sources.cave).toMatchObject({ level: 'none', totalBottles: 2, referenceCount: 1, bottles: [] })
  })

  it('keeps cellar lookup exact and tool-oriented', () => {
    const request = body()
    ;(request as Record<string, unknown>).zones = ['Paris', 'Bourgogne']

    const sources = resolveContextSources(request, plan({
      profile: 'none',
      cave: 'tool_only',
      zones: 'names',
      tools: 'force_cellar',
      truthPolicy: 'exact_only',
    }))

    expect(sources.profile).toBeUndefined()
    expect(sources.memories).toBeUndefined()
    expect(sources.sqlRetrieval?.text).toBe('[SQL exact]')
    expect(sources.zones).toEqual(['Paris', 'Bourgogne'])
    expect(sources.cave).toMatchObject({ level: 'tool_only', totalBottles: 2, referenceCount: 1, bottles: [] })
  })

  it('keeps shortlist bottles only for recommendation sources', () => {
    const sources = resolveContextSources(body(), plan({
      profile: 'recommendation',
      cave: 'shortlist',
      memories: 'targeted',
      tools: 'auto',
      history: 'normal',
    }))

    expect(sources.profile?.compiledMarkdown).toBe('## Profil compile')
    expect(sources.memories).toMatchObject({ level: 'targeted', text: 'Souvenir exact' })
    expect(sources.cave.bottles).toHaveLength(1)
  })

  it('falls back to legacy profile only when compiled profile is absent', () => {
    const sources = resolveContextSources(
      body({ compiledProfileMarkdown: undefined }),
      plan({ profile: 'minimal' }),
    )

    expect(sources.profile?.legacyProfile).toBe('Profil legacy')
    expect(sources.profile?.compiledMarkdown).toBeUndefined()
  })

  it('resolves profile, zones, and cellar counts from backend when legacy body is minimal', async () => {
    const calls: string[] = []
    const supabase = {
      from(table: string) {
        calls.push(table)
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { compiled_markdown: '## Profil backend\n- aime les blancs tendus' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'bottles') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [{ quantity: 2 }, { quantity: 1 }],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ name: 'Paris' }, { name: 'Bourgogne' }],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        profile: undefined,
        compiledProfileMarkdown: undefined,
        cave: [],
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'tool_only',
        zones: 'names',
        tools: 'force_cellar',
        truthPolicy: 'exact_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(calls).toEqual(['user_profiles', 'bottles', 'zones'])
    expect(sources.profile?.compiledMarkdown).toContain('Profil backend')
    expect(sources.cave).toMatchObject({ level: 'tool_only', totalBottles: 3, referenceCount: 2, bottles: [] })
    expect(sources.zones).toEqual(['Paris', 'Bourgogne'])
  })

  it('does not query backend for pure wine questions', async () => {
    const supabase = {
      from() {
        throw new Error('backend should not be queried')
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({ cave: [] }),
      plan({
        profile: 'none',
        cave: 'none',
        zones: 'none',
        memories: 'none',
        tools: 'none',
        truthPolicy: 'prudent_factual',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.profile).toBeUndefined()
    expect(sources.cave).toMatchObject({ level: 'none', totalBottles: 0, referenceCount: 0, bottles: [] })
    expect(sources.zones).toEqual([])
  })
})
