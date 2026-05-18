import { describe, expect, it } from 'vitest'
import { executeCelestinProviderToolCall, executeCelestinProviderToolCalls } from './tool-runtime'

describe('Celestin provider tool runtime', () => {
  it('executes recommendation candidate tools and keeps backend materialization rows in the trace', async () => {
    const rows = [
      {
        id: 'white12345678',
        domaine: 'Domaine Blanc',
        cuvee: 'Riesling',
        appellation: 'Alsace',
        millesime: 2020,
        couleur: 'blanc',
        country: 'France',
        region: 'Alsace',
        grape_varieties: ['Riesling'],
        food_pairings: ['sushi'],
        character: 'Blanc tendu.',
        quantity: 1,
        status: 'in_stock',
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      limit: async () => ({ data: rows, error: null }),
    }
    const supabase = { from: () => query }

    const result = await executeCelestinProviderToolCall(
      {
        id: 'toolu_1',
        name: 'search_cellar_candidates',
        input: { query: 'blanc tendu pour sushi', limit: 3 },
      },
      { userId: 'user-1', supabase: supabase as never },
    )

    expect(result).toMatchObject({
      id: 'toolu_1',
      name: 'search_cellar_candidates',
      isError: false,
      trace: {
        name: 'search_cellar_candidates',
        source: 'cellar_candidates',
        totalRows: 1,
        listedRows: 1,
      },
    })
    expect(result.trace.rows?.[0]).toMatchObject({
      id: 'white123',
      domaine: 'Domaine Blanc',
      cuvee: 'Riesling',
      why_candidate: 'Blanc tendu.',
    })
  })

  it('returns tool errors as provider-ready results instead of throwing', async () => {
    const result = await executeCelestinProviderToolCall(
      { id: 'toolu_unknown', name: 'unknown_tool', input: { query: 'test' } },
      { userId: 'user-1', supabase: {} as never },
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('Unknown tool')
    expect(result.trace).toMatchObject({
      name: 'unknown_tool',
      input: { query: 'test' },
      error: 'Unknown tool: unknown_tool',
    })
  })

  it('keeps the existing maximum of three tool executions per provider turn', async () => {
    const results = await executeCelestinProviderToolCalls(
      [
        { id: 'toolu_1', name: 'unknown_tool_1', input: {} },
        { id: 'toolu_2', name: 'unknown_tool_2', input: {} },
        { id: 'toolu_3', name: 'unknown_tool_3', input: {} },
        { id: 'toolu_4', name: 'unknown_tool_4', input: {} },
      ],
      { userId: 'user-1', supabase: {} as never },
    )

    expect(results.map((result) => result.id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3'])
  })
})
