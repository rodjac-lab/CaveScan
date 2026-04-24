import { describe, expect, it } from 'vitest'
import { routeFactualQueryFromClassification } from '@/lib/sqlRetrievalRouter'
import type { ClassifiedIntent } from '@/lib/celestinIntentClassifier'
import type { Bottle } from '@/lib/types'

function bottle(overrides: Partial<Bottle>): Bottle {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2, 10),
    domaine: null,
    cuvee: null,
    appellation: null,
    millesime: null,
    couleur: null,
    country: null,
    region: null,
    raw_extraction: null,
    zone_id: null,
    shelf: null,
    photo_url: null,
    photo_url_back: null,
    status: 'drunk',
    added_at: '2026-01-01T00:00:00.000Z',
    drunk_at: '2026-04-10T20:00:00.000Z',
    updated_at: '2026-04-10T20:00:00.000Z',
    tasting_note: null,
    purchase_price: null,
    market_value: null,
    drink_from: null,
    drink_until: null,
    notes: null,
    tasting_photos: null,
    rating: null,
    rebuy: null,
    qpr: null,
    grape_varieties: null,
    serving_temperature: null,
    typical_aromas: null,
    food_pairings: null,
    character: null,
    quantity: 1,
    volume_l: 0.75,
    tasting_tags: null,
    ...overrides,
  }
}

function classified(overrides: Partial<ClassifiedIntent> & { intent: ClassifiedIntent['intent'] }): ClassifiedIntent {
  return {
    isFactual: true,
    intent: overrides.intent,
    filters: overrides.filters ?? {},
    scope: overrides.scope ?? null,
    rankingDirection: overrides.rankingDirection ?? null,
    rankingLimit: overrides.rankingLimit ?? null,
    conversationalIntent: overrides.conversationalIntent ?? null,
    confidence: overrides.confidence ?? 0.9,
  }
}

describe('routeFactualQueryFromClassification — dispatcher guards', () => {
  it('returns null when classification is null', () => {
    expect(routeFactualQueryFromClassification(null, [], [])).toBeNull()
  })

  it('returns null when isFactual is false', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'temporal', isFactual: false }),
      [],
      [],
    )
    expect(result).toBeNull()
  })

  it('returns null when intent is null', () => {
    const result = routeFactualQueryFromClassification(
      { isFactual: true, intent: null, filters: {}, scope: null, rankingDirection: null, rankingLimit: null, conversationalIntent: null, confidence: 0.5 },
      [],
      [],
    )
    expect(result).toBeNull()
  })
})

describe('routeFactualQueryFromClassification — temporal', () => {
  it('filters drunk bottles to the provided dateRange', () => {
    const target = bottle({ id: 't', domaine: 'Target', drunk_at: '2026-03-15T19:00:00.000Z' })
    const before = bottle({ id: 'b', domaine: 'Before', drunk_at: '2026-02-10T19:00:00.000Z' })
    const after = bottle({ id: 'a', domaine: 'After', drunk_at: '2026-04-05T19:00:00.000Z' })

    const result = routeFactualQueryFromClassification(
      classified({
        intent: 'temporal',
        filters: { dateRange: { start: '2026-03-01', end: '2026-03-31' } },
      }),
      [target, before, after],
      [],
    )
    expect(result).not.toBeNull()
    const block = result!.blocks[0]
    expect(block.intent).toBe('temporal')
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Target')
    expect(block.formattedText).not.toContain('Before')
    expect(block.formattedText).not.toContain('After')
  })

  it('supports a single-day dateRange (start==end)', () => {
    const t = bottle({ id: 't', domaine: 'Target', drunk_at: '2026-04-20T19:00:00.000Z' })
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'temporal', filters: { dateRange: { start: '2026-04-20', end: '2026-04-20' } } }),
      [t],
      [],
    )
    expect(result!.blocks[0].resultCount).toBe(1)
    expect(result!.blocks[0].label).toBe('2026-04-20')
  })

  it('returns null when dateRange is missing', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'temporal', filters: {} }),
      [bottle({ domaine: 'X' })],
      [],
    )
    expect(result).toBeNull()
  })

  it('applies identity filter on top of dateRange', () => {
    const match = bottle({ id: '1', domaine: 'Dom A', millesime: 2015, drunk_at: '2026-03-10T19:00:00.000Z' })
    const off = bottle({ id: '2', domaine: 'Dom B', millesime: 2016, drunk_at: '2026-03-11T19:00:00.000Z' })

    const result = routeFactualQueryFromClassification(
      classified({
        intent: 'temporal',
        filters: { dateRange: { start: '2026-03-01', end: '2026-03-31' }, millesime: 2015 },
      }),
      [match, off],
      [],
    )
    expect(result!.blocks[0].resultCount).toBe(1)
    expect(result!.blocks[0].formattedText).toContain('Dom A')
  })
})

describe('routeFactualQueryFromClassification — ranking', () => {
  const bottles = [
    bottle({ id: 'a', domaine: 'AlphaWine', rating: 3 }),
    bottle({ id: 'b', domaine: 'BetaWine', rating: 5 }),
    bottle({ id: 'c', domaine: 'GammaWine', rating: 4 }),
  ]

  it('returns top N sorted by rating desc', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'ranking', rankingDirection: 'desc', rankingLimit: 2 }),
      bottles,
      [],
    )
    const block = result!.blocks[0]
    expect(block.resultCount).toBe(2)
    const text = block.formattedText
    expect(text.indexOf('BetaWine')).toBeLessThan(text.indexOf('GammaWine'))
    expect(text).not.toContain('AlphaWine')
  })

  it('supports asc direction (pires)', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'ranking', rankingDirection: 'asc', rankingLimit: 2 }),
      bottles,
      [],
    )
    const block = result!.blocks[0]
    const text = block.formattedText
    expect(text.indexOf('AlphaWine')).toBeLessThan(text.indexOf('GammaWine'))
  })

  it('defaults to desc/limit=5 when classifier omits them', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'ranking' }),
      bottles,
      [],
    )
    expect(result!.blocks[0].label).toContain('desc')
    expect(result!.blocks[0].resultCount).toBe(3)
  })

  it('honours appellation filter in ranking', () => {
    const rich = [
      bottle({ id: '1', domaine: 'Top Brunello', appellation: 'Brunello di Montalcino', rating: 4.5 }),
      bottle({ id: '2', domaine: 'High Barolo', appellation: 'Barolo', rating: 5 }),
      bottle({ id: '3', domaine: 'Mid Brunello', appellation: 'Brunello di Montalcino', rating: 3 }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'ranking', filters: { appellation: 'Brunello di Montalcino' }, rankingLimit: 5 }),
      rich,
      [],
    )
    const block = result!.blocks[0]
    expect(block.resultCount).toBe(2)
    expect(block.formattedText).toContain('Top Brunello')
    expect(block.formattedText).not.toContain('High Barolo')
  })

  it('filters by millesime', () => {
    const rich = [
      bottle({ id: '1', domaine: 'Dom 2015', millesime: 2015, rating: 4 }),
      bottle({ id: '2', domaine: 'Dom 2016', millesime: 2016, rating: 5 }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'ranking', filters: { millesime: 2015 } }),
      rich,
      [],
    )
    const block = result!.blocks[0]
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Dom 2015')
  })

  it('returns a zero-result block when no rated bottle matches', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'ranking', filters: { millesime: 1999 } }),
      bottles,
      [],
    )
    expect(result!.blocks[0].resultCount).toBe(0)
    expect(result!.blocks[0].formattedText).toContain('(aucun vin note correspondant)')
  })
})

describe('routeFactualQueryFromClassification — quantitative', () => {
  it('counts distinct drunk bottles when scope=drunk', () => {
    const drunk = [
      bottle({ appellation: 'Brunello di Montalcino' }),
      bottle({ appellation: 'Brunello di Montalcino' }),
      bottle({ appellation: 'Brunello di Montalcino' }),
      bottle({ appellation: 'Chianti Classico' }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'quantitative', scope: 'drunk', filters: { appellation: 'Brunello di Montalcino' } }),
      drunk,
      [],
    )
    const block = result!.blocks[0]
    expect(block.formattedText).toContain('Bouteilles bues correspondant : 3')
  })

  it('counts cave exemplaires via quantity when scope=cave', () => {
    const cave = [
      bottle({ appellation: 'Barolo', quantity: 3, status: 'in_stock' }),
      bottle({ appellation: 'Barolo', quantity: 2, status: 'in_stock' }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'quantitative', scope: 'cave', filters: { appellation: 'Barolo' } }),
      [],
      cave,
    )
    const block = result!.blocks[0]
    expect(block.formattedText).toMatch(/5 exemplaires/)
  })

  it('reports both scopes when scope is null (defaults to both)', () => {
    const drunk = [bottle({ appellation: 'Barolo' })]
    const cave = [bottle({ appellation: 'Barolo', quantity: 2, status: 'in_stock' })]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'quantitative', filters: { appellation: 'Barolo' } }),
      drunk,
      cave,
    )
    const text = result!.blocks[0].formattedText
    expect(text).toContain('Bouteilles bues : 1')
    expect(text).toContain('Bouteilles en cave : 2 exemplaires')
  })
})

describe('routeFactualQueryFromClassification — inventory', () => {
  it('returns cave matches when scope=cave', () => {
    const cave = [bottle({ appellation: 'Chianti Classico', status: 'in_stock', domaine: 'D1' })]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'inventory', scope: 'cave', filters: { appellation: 'Chianti Classico' } }),
      [],
      cave,
    )
    const block = result!.blocks[0]
    expect(block.formattedText).toContain('D1')
    expect(block.label).toContain('scope=cave')
  })

  it('returns drunk matches when scope=drunk', () => {
    const drunk = [bottle({ appellation: 'Barolo', domaine: 'Prod A', rating: 4 })]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'inventory', scope: 'drunk', filters: { appellation: 'Barolo' } }),
      drunk,
      [],
    )
    const block = result!.blocks[0]
    expect(block.label).toContain('scope=drunk')
    expect(block.formattedText).toContain('Prod A')
  })

  it('returns both sections when scope=both', () => {
    const drunk = [bottle({ appellation: 'Barolo', domaine: 'Bu' })]
    const cave = [bottle({ appellation: 'Barolo', domaine: 'EnCave', status: 'in_stock', quantity: 2 })]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'inventory', scope: 'both', filters: { appellation: 'Barolo' } }),
      drunk,
      cave,
    )
    const block = result!.blocks[0]
    expect(block.label).toContain('scope=both')
    expect(block.formattedText).toContain('Bu')
    expect(block.formattedText).toContain('EnCave')
    expect(block.formattedText).toContain('2 exemplaires')
  })

  it('uses inventory hint when more than 5 fiches', () => {
    const drunk = Array.from({ length: 7 }, (_, i) => bottle({ id: `m-${i}`, millesime: 2015, domaine: `Dom ${i}` }))
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'inventory', scope: 'drunk', filters: { millesime: 2015 } }),
      drunk,
      [],
    )
    expect(result!.blocks[0].formattedText).toContain('TROP pour lister')
  })

  it('narrows inventory results via freeLocation filter', () => {
    const match = bottle({
      id: '1', domaine: 'Target',
      tasting_tags: { plats: [], descripteurs: [], occasion: 'restaurant à Saint Genis Laval', sentiment: null, maturite: null, keywords: [] },
    })
    const off = bottle({ id: '2', domaine: 'Off' })
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'inventory', scope: 'drunk', filters: { freeLocation: 'Saint Genis Laval' } }),
      [match, off],
      [],
    )
    expect(result!.blocks[0].resultCount).toBe(1)
    expect(result!.blocks[0].formattedText).toContain('Target')
  })
})

describe('routeFactualQueryFromClassification — geographic', () => {
  it('filters by country', () => {
    const bottles = [
      bottle({ country: 'Italie', domaine: 'It1' }),
      bottle({ country: 'France', domaine: 'Fr1' }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'geographic', scope: 'drunk', filters: { country: 'Italie' } }),
      bottles,
      [],
    )
    const block = result!.blocks[0]
    expect(block.formattedText).toContain('It1')
    expect(block.formattedText).not.toContain('Fr1')
  })

  it('matches free location in tasting notes when no structured filter', () => {
    const bottles = [
      bottle({ id: '1', domaine: 'Dom Roma', tasting_note: 'Superbe soirée à Rome', rating: 5 }),
      bottle({ id: '2', domaine: 'Dom Other', tasting_note: 'Bu à Lyon', rating: 4 }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'geographic', scope: 'drunk', filters: { freeLocation: 'Rome' } }),
      bottles,
      [],
    )
    const block = result!.blocks[0]
    expect(block.formattedText).toContain('Dom Roma')
    expect(block.formattedText).not.toContain('Dom Other')
  })

  it('matches appellationPattern via substring on appellation', () => {
    const bottles = [
      bottle({ id: '1', appellation: 'Chianti Classico', domaine: 'Isole' }),
      bottle({ id: '2', appellation: 'Chianti Rufina', domaine: 'Selvapiana' }),
      bottle({ id: '3', appellation: 'Barolo', domaine: 'Giacomo' }),
    ]
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'geographic', scope: 'drunk', filters: { appellationPattern: 'Chianti' } }),
      bottles,
      [],
    )
    const block = result!.blocks[0]
    expect(block.resultCount).toBe(2)
    expect(block.formattedText).toContain('Isole')
    expect(block.formattedText).toContain('Selvapiana')
    expect(block.formattedText).not.toContain('Giacomo')
  })

  it('returns null when neither geo filter nor freeLocation is present', () => {
    const result = routeFactualQueryFromClassification(
      classified({ intent: 'geographic', scope: 'drunk', filters: {} }),
      [bottle({ domaine: 'X' })],
      [],
    )
    expect(result).toBeNull()
  })
})
