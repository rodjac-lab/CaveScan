import { describe, expect, it } from 'vitest'
import { routeFactualQuery, _internal } from '@/lib/sqlRetrievalRouter'
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

const FIXED_NOW = new Date('2026-04-21T12:00:00.000Z')

describe('routeFactualQuery — detection', () => {
  it('returns null when no factual intent is detected', () => {
    const result = routeFactualQuery({
      query: 'Salut, qu\'est-ce que je pourrais ouvrir ce soir ?',
      drunkBottles: [],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).toBeNull()
  })

  it('detects temporal intent from "hier"', () => {
    const result = routeFactualQuery({
      query: 'Qu\'ai-je bu hier ?',
      drunkBottles: [bottle({ drunk_at: '2026-04-20T19:00:00.000Z', domaine: 'Dom X' })],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.detectedIntents).toContain('temporal')
    expect(result!.blocks[0].intent).toBe('temporal')
    expect(result!.blocks[0].resultCount).toBe(1)
  })

  it('detects ranking intent from "mes meilleurs"', () => {
    const result = routeFactualQuery({
      query: 'Mes 3 meilleurs vins ?',
      drunkBottles: [
        bottle({ domaine: 'A', rating: 4.5 }),
        bottle({ domaine: 'B', rating: 3 }),
        bottle({ domaine: 'C', rating: 5 }),
        bottle({ domaine: 'D', rating: 2 }),
      ],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.detectedIntents).toContain('ranking')
    expect(result!.blocks[0].resultCount).toBe(3)
    expect(result!.blocks[0].formattedText).toContain('top 3')
  })

  it('detects quantitative intent from "combien de"', () => {
    const result = routeFactualQuery({
      query: 'Combien de Brunello ai-je bus ?',
      drunkBottles: [
        bottle({ appellation: 'Brunello di Montalcino' }),
        bottle({ appellation: 'Brunello di Montalcino' }),
        bottle({ appellation: 'Barolo' }),
      ],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.detectedIntents).toContain('quantitative')
    const block = result!.blocks.find((b) => b.intent === 'quantitative')!
    expect(block.formattedText).toMatch(/Bouteilles bues.*: 2/)
  })

  it('detects inventory intent for "ai-je déjà bu du Barolo"', () => {
    const result = routeFactualQuery({
      query: 'Ai-je déjà bu du Barolo ?',
      drunkBottles: [
        bottle({ appellation: 'Barolo', domaine: 'Producer A', rating: 4 }),
      ],
      caveBottles: [bottle({ appellation: 'Barolo', domaine: 'Producer B', status: 'in_stock' })],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.detectedIntents).toContain('inventory')
    const inventoryBlock = result!.blocks.find((b) => b.intent === 'inventory')!
    expect(inventoryBlock.formattedText).toContain('scope=drunk' in inventoryBlock ? 'scope=drunk' : 'INVENTAIRE')
  })

  it('detects geographic intent from country name', () => {
    const result = routeFactualQuery({
      query: 'Mes vins italiens ?',
      drunkBottles: [
        bottle({ country: 'Italie', domaine: 'Producteur Italien' }),
        bottle({ country: 'France', domaine: 'Producteur Francais' }),
      ],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.detectedIntents).toContain('geographic')
  })
})

describe('routeFactualQuery — temporal builder', () => {
  it('filters drunk bottles by "hier" = fixed date', () => {
    const yesterday = bottle({ id: 'y', domaine: 'Y', drunk_at: '2026-04-20T19:00:00.000Z' })
    const other = bottle({ id: 'o', domaine: 'O', drunk_at: '2026-04-15T19:00:00.000Z' })
    const result = routeFactualQuery({
      query: 'qu\'ai-je bu hier ?',
      drunkBottles: [yesterday, other],
      caveBottles: [],
      now: FIXED_NOW,
    })
    const temporalBlock = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(temporalBlock.resultCount).toBe(1)
    expect(temporalBlock.formattedText).toContain('Y')
    expect(temporalBlock.formattedText).not.toContain('Dom O ')
  })

  it('filters by "en mars" on previous year when month is after today', () => {
    const marchCurrent = bottle({ id: 'mc', domaine: 'MarchCurrent', drunk_at: '2026-03-10T19:00:00.000Z' })
    const marchPrev = bottle({ id: 'mp', domaine: 'MarchPrev', drunk_at: '2025-03-10T19:00:00.000Z' })
    const april = bottle({ id: 'a', domaine: 'April', drunk_at: '2026-04-05T19:00:00.000Z' })
    const result = routeFactualQuery({
      query: 'qu\'ai-je bu en mars ?',
      drunkBottles: [marchCurrent, marchPrev, april],
      caveBottles: [],
      now: FIXED_NOW,
    })
    const temporalBlock = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(temporalBlock.resultCount).toBe(1)
    expect(temporalBlock.formattedText).toContain('MarchCurrent')
  })

  it('honours explicit date filter when provided', () => {
    const target = bottle({ id: 't', domaine: 'Target', drunk_at: '2026-02-26T19:00:00.000Z' })
    const other = bottle({ id: 'o', domaine: 'Other', drunk_at: '2026-02-25T19:00:00.000Z' })
    const result = routeFactualQuery({
      query: 'Les vins du 26 février 2026',
      drunkBottles: [target, other],
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Target')
  })
})

describe('routeFactualQuery — ranking builder', () => {
  it('returns top N bottles sorted by rating desc', () => {
    const bottles = [
      bottle({ id: 'a', domaine: 'AlphaWine', rating: 3 }),
      bottle({ id: 'b', domaine: 'BetaWine', rating: 5 }),
      bottle({ id: 'c', domaine: 'GammaWine', rating: 4 }),
    ]
    const result = routeFactualQuery({
      query: 'Mes 2 meilleurs vins',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'ranking')!
    expect(block.resultCount).toBe(2)
    const text = block.formattedText
    expect(text.indexOf('BetaWine')).toBeLessThan(text.indexOf('GammaWine'))
    expect(text).not.toContain('AlphaWine')
  })

  it('switches direction to asc on "pires"', () => {
    const bottles = [
      bottle({ id: 'a', domaine: 'Awesome', rating: 4.5 }),
      bottle({ id: 'b', domaine: 'Bad', rating: 1 }),
    ]
    const result = routeFactualQuery({
      query: 'Mes 3 pires vins',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'ranking')!
    expect(block.formattedText).toMatch(/Bad/)
    expect(block.formattedText.indexOf('Bad')).toBeLessThan(block.formattedText.indexOf('Awesome'))
  })

  it('respects appellation filter in ranking', () => {
    const bottles = [
      bottle({ id: '1', domaine: 'Top Brunello', appellation: 'Brunello di Montalcino', rating: 4.5 }),
      bottle({ id: '2', domaine: 'High Barolo', appellation: 'Barolo', rating: 5 }),
      bottle({ id: '3', domaine: 'Mid Brunello', appellation: 'Brunello di Montalcino', rating: 3 }),
    ]
    const result = routeFactualQuery({
      query: 'Mes meilleurs Brunello di Montalcino',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'ranking')!
    expect(block.resultCount).toBe(2)
    expect(block.formattedText).toContain('Top Brunello')
    expect(block.formattedText).not.toContain('High Barolo')
  })
})

describe('routeFactualQuery — quantitative + inventory', () => {
  it('counts distinct drunk bottles for appellation', () => {
    const bottles = [
      bottle({ appellation: 'Brunello di Montalcino' }),
      bottle({ appellation: 'Brunello di Montalcino' }),
      bottle({ appellation: 'Brunello di Montalcino' }),
      bottle({ appellation: 'Chianti Classico' }),
    ]
    const result = routeFactualQuery({
      query: 'Combien de Brunello di Montalcino ai-je bus ?',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'quantitative')!
    expect(block.formattedText).toContain('3')
  })

  it('counts cave exemplaires via quantity when scope=cave', () => {
    const cave = [
      bottle({ appellation: 'Barolo', quantity: 3, status: 'in_stock' }),
      bottle({ appellation: 'Barolo', quantity: 2, status: 'in_stock' }),
    ]
    const result = routeFactualQuery({
      query: 'Combien de Barolo en cave ?',
      drunkBottles: [],
      caveBottles: cave,
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'quantitative')!
    expect(block.formattedText).toMatch(/5 exemplaires/)
  })

  it('inventory returns cave matches when scope=cave', () => {
    const cave = [bottle({ appellation: 'Chianti Classico', status: 'in_stock', domaine: 'D1' })]
    const result = routeFactualQuery({
      query: 'Ai-je du Chianti Classico en cave ?',
      drunkBottles: [],
      caveBottles: cave,
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'inventory')!
    expect(block.formattedText).toContain('D1')
    expect(block.label).toContain('scope=cave')
  })
})

describe('routeFactualQuery — millesime filtering', () => {
  it('filters by millesime when year matches an existing drunk vintage', () => {
    const bottles = [
      bottle({ id: '1', domaine: 'Dom 2015', millesime: 2015, rating: 4 }),
      bottle({ id: '2', domaine: 'Dom 2016', millesime: 2016, rating: 5 }),
    ]
    const result = routeFactualQuery({
      query: 'Mes meilleurs 2015',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'ranking')!
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Dom 2015')
  })
})

describe('routeFactualQuery — geographic builder', () => {
  it('filters by country (Italie alias "italiens")', () => {
    const bottles = [
      bottle({ country: 'Italie', domaine: 'It1' }),
      bottle({ country: 'France', domaine: 'Fr1' }),
    ]
    const result = routeFactualQuery({
      query: 'Mes vins italiens',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'geographic')!
    expect(block.formattedText).toContain('It1')
    expect(block.formattedText).not.toContain('Fr1')
  })

  it('matches free location in tasting notes when no structured geo filter', () => {
    const bottles = [
      bottle({ id: '1', domaine: 'Dom Roma', tasting_note: 'Superbe soirée à Rome', rating: 5 }),
      bottle({ id: '2', domaine: 'Dom Other', tasting_note: 'Bu à Lyon', rating: 4 }),
    ]
    const result = routeFactualQuery({
      query: 'Les vins bus à Rome',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'geographic')!
    expect(block.formattedText).toContain('Dom Roma')
    expect(block.formattedText).not.toContain('Dom Other')
  })

  it('matches multi-word free location like "Saint Genis Laval"', () => {
    const bottles = [
      bottle({
        id: '1', domaine: 'Target',
        tasting_tags: { plats: [], descripteurs: [], occasion: 'restaurant à Saint Genis Laval', sentiment: null, maturite: null, keywords: [] },
      }),
      bottle({ id: '2', domaine: 'Off' }),
    ]
    const result = routeFactualQuery({
      query: 'Les vins bus à Saint Genis Laval',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'geographic')!
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Target')
  })

  it('matches lowercase free context "au séminaire"', () => {
    const bottles = [
      bottle({
        id: '1', domaine: 'Target',
        tasting_tags: { plats: [], descripteurs: [], occasion: 'séminaire au vert avec collègues', sentiment: null, maturite: null, keywords: [] },
      }),
      bottle({ id: '2', domaine: 'Off', tasting_tags: null }),
    ]
    const result = routeFactualQuery({
      query: 'Qu\'ai-je bu au séminaire ?',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'geographic')!
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Target')
  })

  it('matches "avec Médéric" as free context', () => {
    const bottles = [
      bottle({
        id: '1', domaine: 'Dandelion',
        tasting_tags: { plats: [], descripteurs: [], occasion: 'discussion avec Médéric et le chef de salle', sentiment: null, maturite: null, keywords: [] },
      }),
      bottle({ id: '2', domaine: 'Other', tasting_tags: null }),
    ]
    const result = routeFactualQuery({
      query: 'Qu\'ai-je bu avec Médéric ?',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    const block = result!.blocks.find((b) => b.intent === 'geographic')!
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('Dandelion')
  })
})

describe('routeFactualQuery — scope detection via verb', () => {
  it('picks drunk scope when verb is "bu"', () => {
    expect(_internal.detectScope('ai-je bu du barolo')).toBe('drunk')
  })
  it('picks cave scope when "en cave" present', () => {
    expect(_internal.detectScope('combien de barolo en cave')).toBe('cave')
  })
  it('picks both when ambiguous', () => {
    expect(_internal.detectScope('j\'ai du barolo')).toBe('both')
  })
})

describe('routeFactualQuery — non-factual guards', () => {
  it('returns null for "accord pour un poulet rôti" (would spuriously match Côte Rôtie)', () => {
    const bottles = [
      bottle({ id: '1', appellation: 'Côte Rôtie', domaine: 'Guigal' }),
    ]
    const result = routeFactualQuery({
      query: 'Accord pour un poulet rôti ?',
      drunkBottles: [],
      caveBottles: bottles,
      now: FIXED_NOW,
    })
    expect(result).toBeNull()
  })

  it('returns null for "que boire ce soir"', () => {
    const result = routeFactualQuery({
      query: 'Que boire ce soir ?',
      drunkBottles: [bottle({ millesime: 2015, rating: 4 })],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).toBeNull()
  })

  it('returns null for "qu\'est-ce que j\'ouvre ce soir"', () => {
    const result = routeFactualQuery({
      query: "Qu'est-ce que j'ouvre ce soir ?",
      drunkBottles: [bottle({ millesime: 2015, rating: 4 })],
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).toBeNull()
  })
})

describe('routeFactualQuery — weekend range resolution', () => {
  const TUESDAY = new Date('2026-04-21T12:00:00.000Z')  // Tuesday
  const SATURDAY = new Date('2026-04-18T12:00:00.000Z') // Saturday
  const SUNDAY = new Date('2026-04-19T12:00:00.000Z')   // Sunday

  it('"ce week-end" on Tuesday returns the most recent past Saturday+Sunday', () => {
    const sat = bottle({ id: 'sat', domaine: 'Sat', drunk_at: '2026-04-18T19:00:00.000Z' })
    const sun = bottle({ id: 'sun', domaine: 'Sun', drunk_at: '2026-04-19T19:00:00.000Z' })
    const fri = bottle({ id: 'fri', domaine: 'Fri', drunk_at: '2026-04-17T19:00:00.000Z' })
    const mon = bottle({ id: 'mon', domaine: 'Mon', drunk_at: '2026-04-20T19:00:00.000Z' })

    const result = routeFactualQuery({
      query: 'Qu\'ai-je bu ce week-end ?',
      drunkBottles: [sat, sun, fri, mon],
      caveBottles: [],
      now: TUESDAY,
    })
    const block = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(block.resultCount).toBe(2)
    expect(block.formattedText).toContain('Sat')
    expect(block.formattedText).toContain('Sun')
    expect(block.formattedText).not.toContain('Fri')
    expect(block.formattedText).not.toContain('Mon')
  })

  it('"le week-end dernier" on Tuesday returns same range as ce week-end (most recent Sat-Sun)', () => {
    const sat = bottle({ id: 'sat', drunk_at: '2026-04-18T19:00:00.000Z', domaine: 'Sat' })
    const result = routeFactualQuery({
      query: 'Les vins du week-end dernier',
      drunkBottles: [sat],
      caveBottles: [],
      now: TUESDAY,
    })
    const block = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(block.resultCount).toBe(1)
  })

  it('"ce week-end" on Saturday includes today and tomorrow (Sunday)', () => {
    const today = bottle({ id: 't', drunk_at: '2026-04-18T19:00:00.000Z', domaine: 'Today' })
    const result = routeFactualQuery({
      query: 'Mes vins ce week-end',
      drunkBottles: [today],
      caveBottles: [],
      now: SATURDAY,
    })
    const block = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(block.resultCount).toBe(1)
  })

  it('"le week-end dernier" on Sunday returns the weekend BEFORE today', () => {
    const thisSun = bottle({ id: 't', drunk_at: '2026-04-19T19:00:00.000Z', domaine: 'ThisSun' })
    const lastWeek = bottle({ id: 'l', drunk_at: '2026-04-12T19:00:00.000Z', domaine: 'LastWeek' })
    const result = routeFactualQuery({
      query: 'Le week-end dernier',
      drunkBottles: [thisSun, lastWeek],
      caveBottles: [],
      now: SUNDAY,
    })
    const block = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(block.resultCount).toBe(1)
    expect(block.formattedText).toContain('LastWeek')
    expect(block.formattedText).not.toContain('ThisSun')
  })
})

describe('routeFactualQuery — regression: toponym words must not leak as identity filters', () => {
  it('"Saint Genis Laval" does not leak as Saint-* appellation filters', () => {
    const bottles = [
      bottle({ id: '1', appellation: 'Saint-Estèphe', domaine: 'Cos' }),
      bottle({ id: '2', appellation: 'Nuits-Saint-Georges', domaine: 'Liger-Belair' }),
      bottle({
        id: '3', domaine: 'Céline Perrin',
        tasting_tags: { plats: [], descripteurs: [], occasion: "restaurant L'étape Dorée à Saint Genis Laval", sentiment: null, maturite: null, keywords: [] },
      }),
    ]
    const result = routeFactualQuery({
      query: "qu'ai-je bu à Saint Genis Laval ?",
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.matchedFilters.filter((f) => f.startsWith('appellation='))).toEqual([])
    const geoBlock = result!.blocks.find((b) => b.intent === 'geographic')!
    expect(geoBlock.resultCount).toBe(1)
    expect(geoBlock.formattedText).toContain('Céline Perrin')
  })

  it('"laval" does not leak as region "Val de Loire" via term.includes(token)', () => {
    const bottles = [
      bottle({ id: '1', region: 'Val de Loire', domaine: 'Producteur Loire' }),
    ]
    const result = routeFactualQuery({
      query: "bu à Saint Genis Laval",
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result!.trace.matchedFilters).not.toContain('region=Val de Loire')
  })
})

describe('routeFactualQuery — regression: month word must not match appellation', () => {
  it('"en mars" does not leak as appellation "Marsannay" filter', () => {
    const bottles = [
      bottle({ id: '1', appellation: 'Marsannay', domaine: 'Mortet', drunk_at: '2025-10-01T19:00:00.000Z' }),
      bottle({ id: '2', appellation: 'Chablis', domaine: 'Raveneau', drunk_at: '2026-03-05T19:00:00.000Z' }),
      bottle({ id: '3', appellation: 'Chianti', domaine: 'Isole', drunk_at: '2026-03-20T19:00:00.000Z' }),
    ]
    const result = routeFactualQuery({
      query: 'les vins bus en mars',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.trace.matchedFilters).not.toContain('appellation=Marsannay')
    const temporalBlock = result!.blocks.find((b) => b.intent === 'temporal')!
    expect(temporalBlock.resultCount).toBe(2)
  })
})

describe('routeFactualQuery — combined intents', () => {
  it('returns multiple blocks for multi-intent queries', () => {
    const bottles = [
      bottle({ id: '1', domaine: 'Target', appellation: 'Brunello di Montalcino', rating: 4.5, drunk_at: '2026-04-20T19:00:00.000Z' }),
      bottle({ id: '2', domaine: 'Off', appellation: 'Barolo', rating: 3, drunk_at: '2026-04-20T19:00:00.000Z' }),
    ]
    const result = routeFactualQuery({
      query: 'Mes meilleurs Brunello di Montalcino bus hier',
      drunkBottles: bottles,
      caveBottles: [],
      now: FIXED_NOW,
    })
    expect(result!.blocks.length).toBeGreaterThanOrEqual(2)
    const intents = result!.blocks.map((b) => b.intent)
    expect(intents).toContain('temporal')
    expect(intents).toContain('ranking')
  })
})
