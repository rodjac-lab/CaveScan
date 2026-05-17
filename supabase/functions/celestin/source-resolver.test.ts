import { describe, expect, it } from 'vitest'
import { buildSourceRequirements, resolveContextSourcesForRequest } from './source-resolver'
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
    cellarCandidates: 'none',
    reasons: ['test'],
    ...overrides,
  }
}

function tastingSupabase(rows: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: null,
              }),
            }),
          }),
        }
      }
      expect(table).toBe('bottles')
      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: rows,
              error: null,
            }),
          }),
        }),
      }
    },
  }
}

describe('resolveContextSourcesForRequest', () => {
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

  it('resolves no personal sources for wine questions', async () => {
    const sources = await resolveContextSourcesForRequest(body(), plan({
      profile: 'none',
      cave: 'none',
      memories: 'none',
      tools: 'none',
      truthPolicy: 'prudent_factual',
    }))

    expect(sources.profile).toBeUndefined()
    expect(sources.memories).toBeUndefined()
    expect(sources.requirements).toEqual([])
    expect(sources.cave).toMatchObject({ level: 'none', totalBottles: 2, referenceCount: 1, bottles: [] })
  })

  it('keeps cellar lookup exact and tool-oriented', async () => {
    const request = body()
    ;(request as Record<string, unknown>).zones = ['Paris', 'Bourgogne']

    const sources = await resolveContextSourcesForRequest(request, plan({
      profile: 'none',
      cave: 'tool_only',
      zones: 'names',
      tools: 'force_cellar',
      truthPolicy: 'exact_only',
    }))

    expect(sources.profile).toBeUndefined()
    expect(sources.memories).toBeUndefined()
    expect(sources.zones).toEqual(['Paris', 'Bourgogne'])
    expect(sources.cave).toMatchObject({ level: 'tool_only', totalBottles: 2, referenceCount: 1, bottles: [] })
  })

  it('resolves filtered cellar counts from request cave when available', async () => {
    const sources = await resolveContextSourcesForRequest(
      body({
        message: "J'ai combien de rouges en cave ?",
        cave: [
          {
            id: 'red-1',
            domaine: 'Domaine Rouge',
            cuvee: null,
            appellation: 'Morgon',
            millesime: 2020,
            couleur: 'rouge',
            quantity: 2,
          },
          {
            id: 'white-1',
            domaine: 'Domaine Blanc',
            cuvee: null,
            appellation: 'Chablis',
            millesime: 2021,
            couleur: 'blanc',
            quantity: 4,
          },
        ],
      }),
      plan({
        profile: 'none',
        cave: 'tool_only',
        zones: 'none',
        tools: 'force_cellar',
        truthPolicy: 'exact_only',
      }),
    )

    expect(sources.cave).toMatchObject({
      level: 'tool_only',
      totalBottles: 2,
      referenceCount: 1,
      countFilter: { kind: 'color', filter: 'rouge', label: 'rouges' },
    })
  })

  it('keeps shortlist bottles only for recommendation sources', async () => {
    const sources = await resolveContextSourcesForRequest(body(), plan({
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

  it('falls back to legacy profile only when compiled profile is absent', async () => {
    const sources = await resolveContextSourcesForRequest(
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
                  data: [{ quantity: 2, couleur: 'rouge' }, { quantity: 1, couleur: 'blanc' }],
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

  it('resolves filtered cellar counts from backend when request cave is minimal', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'bottles') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    { quantity: 2, couleur: 'rouge' },
                    { quantity: 1, couleur: 'blanc' },
                    { quantity: 3, couleur: 'rouge' },
                  ],
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
                data: [],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "J'ai combien de rouges en cave ?",
        profile: undefined,
        compiledProfileMarkdown: undefined,
        cave: [],
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'tool_only',
        zones: 'names',
        tools: 'force_cellar',
        truthPolicy: 'exact_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.cave).toMatchObject({
      level: 'tool_only',
      totalBottles: 5,
      referenceCount: 2,
      countFilter: { kind: 'color', filter: 'rouge', label: 'rouges' },
    })
  })

  it('resolves cellar shortlist from backend when recommendation body is minimal', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { compiled_markdown: '## Profil backend' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'zones') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ name: 'Paris' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: (columns: string) => {
            const rows = columns.includes('tasting_note')
              ? []
              : [
                  {
                    id: '12345678-aaaa-bbbb-cccc-123456789abc',
                    domaine: 'Domaine A',
                    cuvee: 'Vieilles Vignes',
                    appellation: 'Chablis',
                    millesime: 2020,
                    couleur: 'blanc',
                    character: 'tendu',
                    quantity: 2,
                    volume_l: 0.75,
                  },
                  {
                    id: 'abcdef12-aaaa-bbbb-cccc-123456789abc',
                    domaine: 'Domaine B',
                    cuvee: null,
                    appellation: 'Saumur',
                    millesime: 2019,
                    couleur: 'rouge',
                    character: null,
                    quantity: 1,
                    volume_l: 1.5,
                  },
                ]
            return {
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: rows,
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          },
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Que boire ce soir ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.profile?.compiledMarkdown).toBe('## Profil backend')
    expect(sources.zones).toEqual(['Paris'])
    expect(sources.cave).toMatchObject({
      level: 'shortlist',
      totalBottles: 3,
      referenceCount: 2,
    })
    expect(sources.cave.bottles).toHaveLength(2)
    expect(sources.cave.bottles[0]).toMatchObject({
      id: '12345678',
      domaine: 'Domaine A',
      cuvee: 'Vieilles Vignes',
      appellation: 'Chablis',
      millesime: 2020,
      couleur: 'blanc',
      character: 'tendu',
      quantity: 2,
      volume: '0.75',
    })
  })

  it('ranks backend cellar shortlist with current turn and recent user context', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'zones') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: 'red-pizza',
                        domaine: 'Felsina',
                        cuvee: 'Rancia',
                        appellation: 'Chianti Classico',
                        millesime: 2019,
                        couleur: 'rouge',
                        character: 'italien acidule pour pizza',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                      {
                        id: 'white-pizza',
                        domaine: 'Domaine A',
                        cuvee: null,
                        appellation: 'Chablis',
                        millesime: 2020,
                        couleur: 'blanc',
                        character: 'tendu',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                      {
                        id: 'red-heavy',
                        domaine: 'Domaine B',
                        cuvee: null,
                        appellation: 'Cahors',
                        millesime: 2018,
                        couleur: 'rouge',
                        character: 'tannique',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Et en blanc ?',
        history: [{ role: 'user', text: 'Un italien pour une pizza maison' }],
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.cave.bottles.map((bottle) => bottle.id)).toEqual([
      'white-pi',
      'red-pizz',
      'red-heav',
    ])
    expect(sources.cave.bottles[0]).toMatchObject({
      couleur: 'blanc',
      local_score: expect.any(Number),
    })
    expect((sources.cave.bottles[0].local_score ?? 0)).toBeGreaterThan(sources.cave.bottles[1].local_score ?? 0)
  })

  it('uses structured food pairing signals when ranking backend cellar shortlist', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'zones') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: 'cahors-heavy',
                        domaine: 'Domaine B',
                        cuvee: null,
                        appellation: 'Cahors',
                        millesime: 2018,
                        couleur: 'rouge',
                        country: 'France',
                        region: 'Sud-Ouest',
                        grape_varieties: ['Malbec'],
                        food_pairings: ['boeuf', 'gibier'],
                        character: 'tannique',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                      {
                        id: 'chardonnay-chicken',
                        domaine: 'Domaine A',
                        cuvee: null,
                        appellation: 'Bourgogne',
                        millesime: 2021,
                        couleur: 'blanc',
                        country: 'France',
                        region: 'Bourgogne',
                        grape_varieties: ['Chardonnay'],
                        food_pairings: ['poulet roti', 'volaille'],
                        character: 'ample et frais',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                      {
                        id: 'chablis-fish',
                        domaine: 'Domaine C',
                        cuvee: null,
                        appellation: 'Chablis',
                        millesime: 2022,
                        couleur: 'blanc',
                        country: 'France',
                        region: 'Bourgogne',
                        grape_varieties: ['Chardonnay'],
                        food_pairings: ['huitres', 'poisson'],
                        character: 'tendu',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Fais moi une recommandation sur un poulet roti',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.cave.bottles[0]).toMatchObject({
      id: 'chardonn',
      appellation: 'Bourgogne',
      couleur: 'blanc',
      food_pairings: ['poulet roti', 'volaille'],
    })
    expect((sources.cave.bottles[0].local_score ?? 0)).toBeGreaterThan(sources.cave.bottles[1].local_score ?? 0)
  })

  it('layers contextual profile preferences over generic food pairing rules', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { compiled_markdown: '## Profil gustatif\n- Sur le fromage, prefere blanc et bulles.' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'zones') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: 'red-cheese',
                        domaine: 'Domaine Rouge',
                        cuvee: null,
                        appellation: 'Bourgogne',
                        millesime: 2020,
                        couleur: 'rouge',
                        country: 'France',
                        region: 'Bourgogne',
                        grape_varieties: ['Pinot Noir'],
                        food_pairings: ['fromage'],
                        character: 'souple',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                      {
                        id: 'white-cheese',
                        domaine: 'Domaine Blanc',
                        cuvee: null,
                        appellation: 'Jura',
                        millesime: 2021,
                        couleur: 'blanc',
                        country: 'France',
                        region: 'Jura',
                        grape_varieties: ['Chardonnay'],
                        food_pairings: ['fromage'],
                        character: 'salin',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                      {
                        id: 'bubble-cheese',
                        domaine: 'Domaine Bulles',
                        cuvee: null,
                        appellation: 'Champagne',
                        millesime: 2019,
                        couleur: 'bulles',
                        country: 'France',
                        region: 'Champagne',
                        grape_varieties: ['Chardonnay'],
                        food_pairings: ['fromage'],
                        character: 'vif',
                        quantity: 1,
                        volume_l: 0.75,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Que boire avec un plateau de fromages ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.profile?.compiledMarkdown).toContain('prefere blanc et bulles')
    expect(sources.cave.bottles.map((bottle) => bottle.couleur)).toEqual([
      'blanc',
      'bulles',
      'rouge',
    ])
    expect((sources.cave.bottles[0].local_score ?? 0)).toBeGreaterThan(sources.cave.bottles[2].local_score ?? 0)
    expect((sources.cave.bottles[1].local_score ?? 0)).toBeGreaterThan(sources.cave.bottles[2].local_score ?? 0)
  })

  it('resolves targeted tasting memories from backend without frontend memory text', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        domaine: 'Felsina',
                        cuvee: 'Rancia',
                        appellation: 'Chianti Classico',
                        millesime: 2019,
                        couleur: 'rouge',
                        country: 'Italie',
                        region: 'Toscane',
                        rating: 5,
                        drunk_at: '2025-09-12',
                        tasting_note: 'Petit restaurant a Rome avec ma femme, superbe souvenir autour des pates.',
                        tasting_tags: null,
                      },
                      {
                        domaine: 'Domaine A',
                        cuvee: null,
                        appellation: 'Chablis',
                        millesime: 2020,
                        couleur: 'blanc',
                        country: 'France',
                        region: 'Bourgogne',
                        rating: 4,
                        drunk_at: '2025-09-13',
                        tasting_note: 'Tres citronne.',
                        tasting_tags: null,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Un italien qui me rappelle Rome avec ma femme',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        zones: 'none',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.memories).toMatchObject({
      level: 'targeted',
      evidenceMode: 'synthesis',
      source: 'backend_tastings',
      selectedCount: 1,
    })
    expect(sources.memories?.text).toContain('Felsina')
    expect(sources.memories?.text).toContain('Petit restaurant a Rome avec ma femme')
    expect(sources.memories?.text).not.toContain('Chablis')
    expect(sources.memories?.selectedTastingMemories).toEqual([
      expect.objectContaining({
        label: 'Felsina Rancia Chianti Classico 2019',
        rating: 5,
        drunkAt: '2025-09-12',
        matchedTokens: expect.arrayContaining(['rome', 'femme']),
      }),
    ])
  })

  it('resolves simple tasting count source from backend for force_tastings plans', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => {
            const filters: Record<string, unknown> = {}
            return {
              eq(column: string, value: unknown) {
                filters[column] = value
                return {
                  eq(nextColumn: string, nextValue: unknown) {
                    filters[nextColumn] = nextValue
                    expect(filters).toEqual({ user_id: 'user-1', status: 'drunk' })
                    return Promise.resolve({
                      data: [
                        { domaine: 'Laherte', cuvee: null, appellation: 'Champagne', millesime: 2018, couleur: 'bulles' },
                        { domaine: 'Caillez Lemaire', cuvee: null, appellation: 'Champagne', millesime: 2014, couleur: 'bulles' },
                        { domaine: 'Domaine A', cuvee: null, appellation: 'Chablis', millesime: 2020, couleur: 'blanc' },
                      ],
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "Combien de dégustations de Champagne j'ai faites ?",
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toEqual({
      kind: 'count',
      totalRows: 2,
      query: 'champagne',
      queryLabel: 'champagne',
    })
    expect(sources.profile).toBeUndefined()
  })

  it('resolves top tasting region aggregates from backend for personal fact plans', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: async () => ({
            data: [
              { domaine: 'Domaine Dureuil-Janthial', cuvee: null, appellation: 'Rully', millesime: 2023, couleur: 'blanc', country: 'France', region: 'Bourgogne', rating: 3.5, drunk_at: '2026-05-08T11:54:48Z', tasting_note: '' },
              { domaine: 'Droin', cuvee: 'Montmains', appellation: 'Chablis Premier Cru', millesime: 2020, couleur: 'blanc', country: 'France', region: 'Bourgogne', rating: 4.5, drunk_at: '2026-04-20T00:00:00Z', tasting_note: '' },
              { domaine: 'Jacques Selosse', cuvee: 'Blanc de Blancs V.O. Extra Brut', appellation: 'Champagne', millesime: null, couleur: 'bulles', country: 'France', region: 'Champagne', rating: 5, drunk_at: '2026-02-26T19:18:42Z', tasting_note: '' },
            ],
            error: null,
          }),
          range: async () => ({
            data: [
              { domaine: 'Domaine Dureuil-Janthial', cuvee: null, appellation: 'Rully', millesime: 2023, couleur: 'blanc', country: 'France', region: 'Bourgogne', rating: 3.5, drunk_at: '2026-05-08T11:54:48Z', tasting_note: '' },
              { domaine: 'Droin', cuvee: 'Montmains', appellation: 'Chablis Premier Cru', millesime: 2020, couleur: 'blanc', country: 'France', region: 'Bourgogne', rating: 4.5, drunk_at: '2026-04-20T00:00:00Z', tasting_note: '' },
              { domaine: 'Jacques Selosse', cuvee: 'Blanc de Blancs V.O. Extra Brut', appellation: 'Champagne', millesime: null, couleur: 'bulles', country: 'France', region: 'Champagne', rating: 5, drunk_at: '2026-02-26T19:18:42Z', tasting_note: '' },
            ],
            error: null,
          }),
        }
        return query
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "Quelle est la région que j'ai le plus dégusté ?",
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_personal',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'top',
      totalRows: 3,
      topDimension: 'region',
      topRows: [
        { name: 'Bourgogne', count: 2 },
        { name: 'Champagne', count: 1 },
      ],
    })
    expect(sources.tastings?.topRows?.[0].examples.map((row) => row.identity?.label)).toEqual([
      'Domaine Dureuil-Janthial · Rully · 2023',
      'Droin · Montmains · Chablis Premier Cru · 2020',
    ])
  })

  it('resolves exact tasting rating rows from backend for force_tastings plans', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    domaine: 'Chateau Rayas',
                    cuvee: null,
                    appellation: 'Chateauneuf-du-Pape',
                    millesime: 1998,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Rhone',
                    rating: 4,
                    drunk_at: '2026-01-10',
                    tasting_note: 'Grand souvenir.',
                  },
                  {
                    domaine: 'Domaine A',
                    cuvee: null,
                    appellation: 'Chablis',
                    millesime: 2020,
                    couleur: 'blanc',
                    country: 'France',
                    region: 'Bourgogne',
                    rating: 5,
                    drunk_at: '2026-01-11',
                    tasting_note: 'Autre note.',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "J'avais mis combien d'etoiles au Rayas ?",
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'rating',
      totalRows: 1,
      query: 'rayas',
      queryLabel: 'rayas',
      rows: [
        {
          domaine: 'Chateau Rayas',
          appellation: 'Chateauneuf-du-Pape',
          millesime: 1998,
          rating: 4,
        },
      ],
    })
    expect(sources.profile).toBeUndefined()
  })

  it('matches focused tasting subjects across hyphen and spacing variants', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    domaine: 'Gangloff',
                    cuvee: 'Sereine Noire',
                    appellation: 'Côte Rôtie',
                    millesime: 2010,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Rhone',
                    rating: 5,
                    drunk_at: '2026-02-26',
                    tasting_note: 'Syrah noble.',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Ai-je déjà bu des Côte-Rôtie ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'existence',
      totalRows: 1,
      query: 'cote rotie',
      rows: [
        {
          domaine: 'Gangloff',
          cuvee: 'Sereine Noire',
          appellation: 'Côte Rôtie',
          millesime: 2010,
          rating: 5,
        },
      ],
    })
  })

  it('keeps focused vintage facts deterministic only with unique evidence', async () => {
    const supabase = tastingSupabase([
      {
        domaine: 'Domaine Jamet',
        cuvee: null,
        appellation: 'Cote Rotie',
        millesime: 2010,
        couleur: 'rouge',
        country: 'France',
        region: 'Rhone',
        rating: 5,
        drunk_at: '2026-02-26',
        tasting_note: 'Premier Jamet.',
      },
      {
        domaine: 'Domaine Jamet',
        cuvee: null,
        appellation: 'Cote Rotie',
        millesime: 2016,
        couleur: 'rouge',
        country: 'France',
        region: 'Rhone',
        rating: 4,
        drunk_at: '2026-03-10',
        tasting_note: 'Autre Jamet.',
      },
    ])

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "C'était quoi comme millésime déjà ?",
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
      { activeMemoryFocus: 'Jamet' },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'vintage',
      totalRows: 2,
      query: 'Jamet',
      factReadiness: {
        directAnswerAllowed: false,
        answerPath: 'llm_fact_with_tools',
        reason: 'insufficient_unique_evidence',
      },
    })
  })

  it('allows deterministic focused vintage facts with one unique vintage', async () => {
    const supabase = tastingSupabase([
      {
        domaine: 'Domaine Jamet',
        cuvee: null,
        appellation: 'Cote Rotie',
        millesime: 2010,
        couleur: 'rouge',
        country: 'France',
        region: 'Rhone',
        rating: 5,
        drunk_at: '2026-02-26',
        tasting_note: 'Unique Jamet.',
      },
    ])

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "C'était quoi comme millésime déjà ?",
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
      { activeMemoryFocus: 'Jamet' },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'vintage',
      totalRows: 1,
      query: 'Jamet',
      factReadiness: {
        directAnswerAllowed: true,
        answerPath: 'direct_fact',
        reason: 'typed_tasting_focus',
      },
    })
  })

  it('uses a previous turn date constraint to make focused vintage evidence unique', async () => {
    const supabase = tastingSupabase([
      {
        domaine: 'Domaine de la Grange des Pères',
        cuvee: null,
        appellation: 'Pays d Herault',
        millesime: 2019,
        couleur: 'rouge',
        country: 'France',
        region: 'Languedoc',
        rating: 5,
        drunk_at: '2026-03-08',
        tasting_note: 'Un autre souvenir.',
      },
      {
        domaine: 'Domaine de la Grange des Pères',
        cuvee: null,
        appellation: 'Pays d Herault',
        millesime: 2008,
        couleur: 'rouge',
        country: 'France',
        region: 'Languedoc',
        rating: 5,
        drunk_at: '2026-02-26',
        tasting_note: 'La bouteille du 26 février.',
      },
      {
        domaine: 'Domaine de la Grange des Pères',
        cuvee: null,
        appellation: 'Pays d Herault',
        millesime: 2021,
        couleur: 'rouge',
        country: 'France',
        region: 'Languedoc',
        rating: 4,
        drunk_at: '2026-02-03',
        tasting_note: 'Encore un autre souvenir.',
      },
    ])

    const sources = await resolveContextSourcesForRequest(
      body({
        message: "C'était quoi comme millésime déjà ?",
        history: [
          { role: 'user', text: "Tu te souviens du Grange des Pères qu'on a bu le 26 février ?" },
          { role: 'assistant', text: 'Oui, je vois le souvenir.' },
        ],
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
      { activeMemoryFocus: 'Grange des Pères' },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'vintage',
      totalRows: 1,
      query: 'Grange des Pères',
      factReadiness: {
        directAnswerAllowed: true,
        answerPath: 'direct_fact',
        reason: 'typed_tasting_focus',
      },
      rows: [
        {
          domaine: 'Domaine de la Grange des Pères',
          millesime: 2008,
        },
      ],
    })
  })

  it('resolves oldest tasting evidence from backend for force_tastings plans', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    domaine: 'Recent Domaine',
                    cuvee: null,
                    appellation: 'Saint-Estephe',
                    millesime: 2015,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Bordeaux',
                    rating: 3,
                    drunk_at: '2026-05-10T12:00:00Z',
                    tasting_note: 'Recent.',
                  },
                  {
                    domaine: 'Grange des Peres',
                    cuvee: null,
                    appellation: 'VDP du Languedoc',
                    millesime: 2009,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Languedoc',
                    rating: null,
                    drunk_at: '2026-02-01T09:05:27Z',
                    tasting_note: 'Premier souvenir.',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Quelle est la plus ancienne ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'extreme',
      totalRows: 2,
      queryLabel: 'oldest',
      rows: [
        {
          domaine: 'Grange des Peres',
          appellation: 'VDP du Languedoc',
          millesime: 2009,
          drunk_at: '2026-02-01T09:05:27Z',
        },
      ],
    })
  })

  it('pages deterministic tasting extremes before answering', async () => {
    const calls: string[] = []
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      domaine: `Recent Domaine ${index}`,
      cuvee: null,
      appellation: 'Saint-Estephe',
      millesime: 2015,
      couleur: 'rouge',
      country: 'France',
      region: 'Bordeaux',
      rating: 3,
      drunk_at: `2026-05-${String((index % 20) + 1).padStart(2, '0')}T12:00:00Z`,
      tasting_note: 'Recent.',
    }))
    const secondPage = [
      {
        domaine: 'Grange des Peres',
        cuvee: null,
        appellation: 'VDP du Languedoc',
        millesime: 2009,
        couleur: 'rouge',
        country: 'France',
        region: 'Languedoc',
        rating: null,
        drunk_at: '2026-02-01T09:05:27Z',
        tasting_note: 'Premier souvenir.',
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      not: (column: string, operator: string, value: unknown) => {
        calls.push(`not:${column}:${operator}:${String(value)}`)
        return query
      },
      order: (column: string, options: { ascending: boolean }) => {
        calls.push(`order:${column}:${options.ascending}`)
        return query
      },
      range: async (from: number, to: number) => {
        calls.push(`range:${from}:${to}`)
        return {
          data: from === 0 ? firstPage : secondPage,
          error: null,
        }
      },
    }
    const supabase = { from: () => query }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Quelle est la plus ancienne ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings?.rows?.[0]).toMatchObject({
      domaine: 'Grange des Peres',
      drunk_at: '2026-02-01T09:05:27Z',
    })
    expect(calls).toContain('range:0:499')
    expect(calls).toContain('range:500:999')
  })

  it('preserves scoped filters for best tasting extremes', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    domaine: 'Grand Rouge',
                    cuvee: null,
                    appellation: 'Bordeaux',
                    millesime: 2010,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Bordeaux',
                    rating: 5,
                    drunk_at: '2026-01-01T00:00:00Z',
                    tasting_note: 'Tres bien, mais pas Champagne.',
                  },
                  {
                    domaine: 'Laherte',
                    cuvee: null,
                    appellation: 'Champagne',
                    millesime: 2018,
                    couleur: 'bulles',
                    country: 'France',
                    region: 'Champagne',
                    rating: 4,
                    drunk_at: '2026-01-02T00:00:00Z',
                    tasting_note: 'Champagne note.',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Ma meilleure dégustation de Champagne ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'extreme',
      query: 'champagne',
      rows: [{ domaine: 'Laherte', appellation: 'Champagne', rating: 4 }],
    })
  })

  it('resolves relationship span from dated tasting evidence', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    domaine: 'Recent Domaine',
                    cuvee: null,
                    appellation: 'Saint-Estephe',
                    millesime: 2015,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Bordeaux',
                    rating: 3,
                    drunk_at: '2026-05-10T12:00:00Z',
                    tasting_note: 'Recent.',
                  },
                  {
                    domaine: 'Grange des Peres',
                    cuvee: null,
                    appellation: 'VDP du Languedoc',
                    millesime: 2009,
                    couleur: 'rouge',
                    country: 'France',
                    region: 'Languedoc',
                    rating: null,
                    drunk_at: '2026-02-01T09:05:27Z',
                    tasting_note: 'Premier souvenir.',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Depuis combien de temps on se connait ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'span',
      totalRows: 2,
      firstDrunkAt: '2026-02-01T09:05:27Z',
      lastDrunkAt: '2026-05-10T12:00:00Z',
      rows: [
        {
          domaine: 'Grange des Peres',
          appellation: 'VDP du Languedoc',
          millesime: 2009,
        },
      ],
    })
  })

  it('does not resolve best tasting from unrated rows', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }
        expect(table).toBe('bottles')
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    domaine: 'Domaine Sans Note',
                    cuvee: null,
                    appellation: 'Bourgogne',
                    millesime: 2020,
                    couleur: 'blanc',
                    country: 'France',
                    region: 'Bourgogne',
                    rating: null,
                    drunk_at: '2026-01-01T00:00:00Z',
                    tasting_note: 'Pas de note chiffree.',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'Quelle est ma meilleure dégustation notée ?',
        cave: [],
        profile: undefined,
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'none',
        cave: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.tastings).toMatchObject({
      kind: 'extreme',
      totalRows: 0,
      queryLabel: 'best',
      rows: [],
    })
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

  it('preempts cellar candidates for recommendation routes when authenticated', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'bottles') {
          return {
            select: (cols: string) => {
              if (cols.includes('quantity,couleur') && !cols.includes('domaine')) {
                return {
                  eq: () => ({
                    eq: async () => ({
                      data: [
                        { quantity: 2, couleur: 'rouge' },
                        { quantity: 1, couleur: 'blanc' },
                      ],
                      error: null,
                    }),
                  }),
                }
              }
              return {
                eq: () => ({
                  eq: () => ({
                    limit: async () => ({
                      data: [
                        {
                          id: 'aaaaaaaa11111111',
                          domaine: 'Domaine Gangloff',
                          cuvee: null,
                          appellation: 'Cote-Rotie',
                          millesime: 2018,
                          couleur: 'rouge',
                          country: 'France',
                          region: 'Rhone',
                          grape_varieties: ['syrah'],
                          food_pairings: ['agneau', 'gibier'],
                          character: 'puissant epice',
                          quantity: 2,
                          status: 'in_stock',
                        },
                        {
                          id: 'bbbbbbbb22222222',
                          domaine: 'Domaine Macle',
                          cuvee: 'Cotes du Jura',
                          appellation: 'Cotes du Jura',
                          millesime: 2014,
                          couleur: 'blanc',
                          country: 'France',
                          region: 'Jura',
                          grape_varieties: ['savagnin'],
                          food_pairings: ['fromage', 'volaille'],
                          character: 'oxydatif tendu',
                          quantity: 1,
                          status: 'in_stock',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }
            },
          }
        }
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'un rouge pour ce soir avec un gigot',
        cave: [],
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'count',
        zones: 'names',
        tools: 'none',
        cellarCandidates: 'preempted',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.cave.level).toBe('shortlist')
    expect(sources.cave.origin).toBe('preempted_candidates')
    expect(sources.cave.bottles.length).toBeGreaterThan(0)
    expect(sources.cave.bottles[0].id).toMatch(/^[a-z0-9]+$/)
  })

  it('falls back to non-preempted cave when search returns no candidates', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'bottles') {
          return {
            select: (cols: string) => {
              if (cols.includes('quantity,couleur') && !cols.includes('domaine')) {
                return {
                  eq: () => ({
                    eq: async () => ({ data: [], error: null }),
                  }),
                }
              }
              return {
                eq: () => ({
                  eq: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }
            },
          }
        }
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      },
    }

    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'un rouge pour ce soir',
        cave: [],
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'count',
        zones: 'names',
        tools: 'none',
        cellarCandidates: 'preempted',
        history: 'normal',
      }),
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(sources.cave.level).toBe('count')
    expect(sources.cave.bottles).toHaveLength(0)
    expect(sources.cave.origin).toBeUndefined()
  })

  it('skips preempt when authentication is missing', async () => {
    const sources = await resolveContextSourcesForRequest(
      body({
        message: 'un rouge pour ce soir',
        cave: [
          {
            id: 'b1',
            domaine: 'Domaine A',
            cuvee: null,
            appellation: 'Morgon',
            millesime: 2020,
            couleur: 'rouge',
            character: null,
            quantity: 2,
          },
        ],
        compiledProfileMarkdown: undefined,
        memories: undefined,
      }),
      plan({
        profile: 'recommendation',
        cave: 'count',
        zones: 'names',
        tools: 'none',
        cellarCandidates: 'preempted',
        history: 'normal',
      }),
    )

    expect(sources.cave.origin).toBeUndefined()
  })
})
