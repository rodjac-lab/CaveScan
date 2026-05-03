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
