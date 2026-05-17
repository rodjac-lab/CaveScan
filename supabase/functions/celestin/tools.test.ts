import { describe, expect, it } from 'vitest'
import { executeCelestinTool, scoreCelestinToolFreeQueryForTest } from './tools'

describe('Celestin tool free query matching', () => {
  it('matches a full natural-language location question against the distinctive place token', () => {
    const note = 'Au verre, resto La Barchetta, Rome. J ai pris des pates a la tomate.'

    expect(scoreCelestinToolFreeQueryForTest(note, "J'ai deja ete a Rome ?")).toBeGreaterThan(0)
  })

  it('matches restaurant names embedded in tasting notes', () => {
    const note = 'Decouverte. Au resto Premnord, du domaine Prieure Roch.'

    expect(scoreCelestinToolFreeQueryForTest(note, "Et le Premnord, j'y suis deja alle ?")).toBeGreaterThan(0)
  })

  it('does not match when only weak question words are present', () => {
    const note = 'Robe grenat, nez sur le fruit rouge, bouche acidulee.'

    expect(scoreCelestinToolFreeQueryForTest(note, 'Dans quel restaurant ?')).toBe(0)
  })
})

describe('search_cellar_candidates', () => {
  it('returns in-cellar recommendation candidates with backend-safe card material', async () => {
    const rows = [
      {
        id: 'red123456789',
        domaine: 'Domaine Rouge',
        cuvee: 'Gamay Libre',
        appellation: 'Morgon',
        millesime: 2021,
        couleur: 'rouge',
        country: 'France',
        region: 'Beaujolais',
        grape_varieties: ['Gamay'],
        food_pairings: ['saucisson', 'charcuterie'],
        character: 'Rouge frais, gouleyant, peu tannique.',
        quantity: 2,
        status: 'in_stock',
      },
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
    const supabase = {
      from: () => query,
    }

    const result = JSON.parse(await executeCelestinTool(
      'search_cellar_candidates',
      { query: 'rouge gouleyant pour saucisson', color: 'rouge', limit: 3 },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result.source).toBe('cellar_candidates')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      id: 'red12345',
      couleur: 'rouge',
      character: 'Rouge frais, gouleyant, peu tannique.',
      food_pairings: ['saucisson', 'charcuterie'],
      why_candidate: 'Rouge frais, gouleyant, peu tannique.',
    })
    expect(result.rows[0].local_score).toBeUndefined()
  })
})

describe('query_cellar', () => {
  it('counts in-stock bottles across pages instead of only the first scan page', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `first${index}`,
      domaine: `Domaine ${index}`,
      cuvee: null,
      appellation: 'Bourgogne',
      millesime: 2020,
      couleur: 'rouge',
      country: 'France',
      region: 'Bourgogne',
      quantity: 1,
      status: 'in_stock',
      shelf: null,
    }))
    const secondPage = [
      {
        id: 'second123456',
        domaine: 'Domaine 501',
        cuvee: null,
        appellation: 'Bourgogne',
        millesime: 2021,
        couleur: 'rouge',
        country: 'France',
        region: 'Bourgogne',
        quantity: 2,
        status: 'in_stock',
        shelf: null,
      },
    ]
    const calls: string[] = []
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: async (from: number, to: number) => {
        calls.push(`range:${from}:${to}`)
        return { data: from === 0 ? firstPage : secondPage, error: null }
      },
      limit: async () => ({ data: firstPage, error: null }),
    }
    const supabase = {
      from: () => query,
    }

    const result = JSON.parse(await executeCelestinTool(
      'query_cellar',
      { aggregate: 'count', query: 'Bourgogne' },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result.totalRows).toBe(501)
    expect(result.totalQuantity).toBe(502)
    expect(result.countIsAuthoritative).toBe(true)
    expect(calls).toEqual(['range:0:499', 'range:500:999'])
  })
})

describe('query_tastings', () => {
  it('returns top tasting regions with deduped identity examples', async () => {
    const rows = [
      {
        id: 'rully123456',
        domaine: 'Domaine Dureuil-Janthial',
        cuvee: null,
        appellation: 'Rully',
        millesime: 2023,
        couleur: 'blanc',
        country: 'France',
        region: 'Bourgogne',
        rating: 3.5,
        drunk_at: '2026-05-08T11:54:48Z',
        tasting_note: 'Grenouilles.',
        tasting_tags: null,
        status: 'drunk',
      },
      {
        id: 'chablis123456',
        domaine: 'Droin',
        cuvee: 'Montmains',
        appellation: 'Chablis Premier Cru',
        millesime: 2020,
        couleur: 'blanc',
        country: 'France',
        region: 'Bourgogne',
        rating: 4.5,
        drunk_at: '2026-04-20T00:00:00Z',
        tasting_note: '',
        tasting_tags: null,
        status: 'drunk',
      },
      {
        id: 'selosse123456',
        domaine: 'Jacques Selosse',
        cuvee: 'Blanc de Blancs V.O. Extra Brut',
        appellation: 'Champagne',
        millesime: null,
        couleur: 'bulles',
        country: 'France',
        region: 'Champagne',
        rating: 5,
        drunk_at: '2026-02-26T19:18:42Z',
        tasting_note: '',
        tasting_tags: null,
        status: 'drunk',
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      range: async () => ({ data: rows, error: null }),
    }
    const supabase = { from: () => query }

    const result = JSON.parse(await executeCelestinTool(
      'query_tastings',
      { aggregate: 'top_region' },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result).toMatchObject({
      source: 'tastings',
      aggregate: 'top_region',
      totalRows: 3,
      countIsAuthoritative: true,
      topRows: [
        {
          name: 'Bourgogne',
          count: 2,
          examples: [
            { domaine: 'Domaine Dureuil-Janthial', appellation: 'Rully' },
            { domaine: 'Droin', cuvee: 'Montmains' },
          ],
        },
        {
          name: 'Champagne',
          count: 1,
          examples: [
            { domaine: 'Jacques Selosse', appellation: 'Champagne' },
          ],
        },
      ],
    })
    expect(result.topRows[0].examples[0].identity.label).toBe('Domaine Dureuil-Janthial · Rully · 2023')
  })

  it('returns the oldest tasting as a single authoritative row', async () => {
    const calls: string[] = []
    const firstPage = [
      {
        id: 'oldest123456',
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
        tasting_tags: null,
        status: 'drunk',
      },
      {
        id: 'second123456',
        domaine: 'Second Domaine',
        cuvee: null,
        appellation: 'Bourgogne',
        millesime: 2010,
        couleur: 'rouge',
        country: 'France',
        region: 'Bourgogne',
        rating: null,
        drunk_at: '2026-02-02T09:05:27Z',
        tasting_note: 'Deuxieme souvenir.',
        tasting_tags: null,
        status: 'drunk',
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
        return { data: from === 0 ? firstPage : [], error: null }
      },
    }
    const supabase = {
      from: () => query,
    }

    const result = JSON.parse(await executeCelestinTool(
      'query_tastings',
      { aggregate: 'first' },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result).toMatchObject({
      source: 'tastings',
      aggregate: 'first',
      totalRows: 2,
      matchingRows: 2,
      listedRows: 1,
      countIsAuthoritative: false,
      row: {
        id: 'oldest12',
        domaine: 'Grange des Peres',
        appellation: 'VDP du Languedoc',
        millesime: 2009,
        drunk_at: '2026-02-01T09:05:27Z',
      },
    })
    expect(calls).toEqual([
      'not:drunk_at:is:null',
      'order:drunk_at:true',
      'range:0:499',
    ])
  })

  it('supports explicit sort order for tasting lists', async () => {
    const rows = [
      {
        id: 'low123456789',
        domaine: 'Low Domaine',
        cuvee: null,
        appellation: 'A',
        millesime: 2020,
        couleur: 'rouge',
        country: 'France',
        region: 'A',
        rating: 2,
        drunk_at: '2026-01-01T00:00:00Z',
        tasting_note: '',
        tasting_tags: null,
        status: 'drunk',
      },
      {
        id: 'high12345678',
        domaine: 'High Domaine',
        cuvee: null,
        appellation: 'B',
        millesime: 2021,
        couleur: 'rouge',
        country: 'France',
        region: 'B',
        rating: 5,
        drunk_at: '2026-01-02T00:00:00Z',
        tasting_note: '',
        tasting_tags: null,
        status: 'drunk',
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      limit: async () => ({ data: rows, error: null }),
    }
    const supabase = {
      from: () => query,
    }

    const result = JSON.parse(await executeCelestinTool(
      'query_tastings',
      { sortBy: 'rating', sortOrder: 'desc', limit: 2 },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result.rows.map((row: { domaine: string }) => row.domaine)).toEqual([
      'High Domaine',
      'Low Domaine',
    ])
  })

  it('preserves free-query relevance for tasting lists without explicit sort', async () => {
    const rows = [
      {
        id: 'recentweak123',
        domaine: 'Recent Weak',
        cuvee: null,
        appellation: 'Bourgogne',
        millesime: 2022,
        couleur: 'blanc',
        country: 'France',
        region: 'Bourgogne',
        rating: null,
        drunk_at: '2026-05-01T00:00:00Z',
        tasting_note: 'Yquem mention rapide.',
        tasting_tags: null,
        status: 'drunk',
      },
      {
        id: 'olderstrong12',
        domaine: 'Chateau Yquem',
        cuvee: null,
        appellation: 'Sauternes',
        millesime: 2001,
        couleur: 'blanc',
        country: 'France',
        region: 'Bordeaux',
        rating: null,
        drunk_at: '2026-01-01T00:00:00Z',
        tasting_note: 'Yquem Sauternes grand souvenir.',
        tasting_tags: null,
        status: 'drunk',
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      range: async () => ({ data: rows, error: null }),
      limit: async () => ({ data: rows, error: null }),
    }
    const supabase = {
      from: () => query,
    }

    const result = JSON.parse(await executeCelestinTool(
      'query_tastings',
      { query: 'Yquem Sauternes', limit: 1 },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result.rows.map((row: { domaine: string }) => row.domaine)).toEqual([
      'Chateau Yquem',
    ])
  })

  it('counts filtered tastings across pages instead of only the first scan page', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `first${index}`,
      domaine: `Champagne Domaine ${index}`,
      cuvee: null,
      appellation: 'Champagne',
      millesime: 2020,
      couleur: 'bulles',
      country: 'France',
      region: 'Champagne',
      rating: null,
      drunk_at: '2026-01-01T00:00:00Z',
      tasting_note: '',
      tasting_tags: null,
      status: 'drunk',
    }))
    const secondPage = [
      {
        id: 'second123456',
        domaine: 'Champagne Domaine 501',
        cuvee: null,
        appellation: 'Champagne',
        millesime: 2021,
        couleur: 'bulles',
        country: 'France',
        region: 'Champagne',
        rating: null,
        drunk_at: '2026-01-02T00:00:00Z',
        tasting_note: '',
        tasting_tags: null,
        status: 'drunk',
      },
    ]
    const calls: string[] = []
    const query = {
      select: () => query,
      eq: () => query,
      range: async (from: number, to: number) => {
        calls.push(`range:${from}:${to}`)
        return { data: from === 0 ? firstPage : secondPage, error: null }
      },
      limit: async () => ({ data: firstPage, error: null }),
    }
    const supabase = {
      from: () => query,
    }

    const result = JSON.parse(await executeCelestinTool(
      'query_tastings',
      { aggregate: 'count', query: 'Champagne' },
      { userId: 'user-1', supabase: supabase as never },
    ))

    expect(result.totalRows).toBe(501)
    expect(calls).toEqual(['range:0:499', 'range:500:999'])
  })
})
