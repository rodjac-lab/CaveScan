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
    expect(sources.sqlRetrieval).toBeUndefined()
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
    expect(sources.sqlRetrieval?.text).toBe('[SQL exact]')
    expect(sources.zones).toEqual(['Paris', 'Bourgogne'])
    expect(sources.cave).toMatchObject({ level: 'tool_only', totalBottles: 2, referenceCount: 1, bottles: [] })
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
        profile: 'minimal',
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
        profile: 'minimal',
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
