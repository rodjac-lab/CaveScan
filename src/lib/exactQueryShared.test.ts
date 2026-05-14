import { describe, expect, it } from 'vitest'
import {
  parseCellarOriginLookup,
  parseFilteredCellarBottleCount,
  parseGenericCellarBottleCount,
  parseTastingCountQuery,
  parseTastingExtremeQuery,
  parseTastingRatingQuery,
  parseTastingRelationshipSpanQuery,
  parseVolumeCellarBottleCount,
} from '../../shared/celestin/exact-query'

describe('exact query parsing', () => {
  it('recognizes generic cellar bottle counts', () => {
    expect(parseGenericCellarBottleCount('J ai combien de bouteilles en cave ?')).toEqual({
      kind: 'generic_cellar_bottle_count',
    })
  })

  it('does not treat filtered cellar bottle counts as generic', () => {
    expect(parseGenericCellarBottleCount('Combien de bouteilles de Champagne ai-je ?')).toBeNull()
    expect(parseGenericCellarBottleCount("J'ai combien de rouges en cave ?")).toBeNull()
  })

  it('extracts filtered cellar bottle count colors', () => {
    expect(parseFilteredCellarBottleCount("J'ai combien de rouges en cave ?")).toEqual({
      kind: 'filtered_cellar_bottle_count',
      filter: 'rouge',
      label: 'rouges',
    })
    expect(parseFilteredCellarBottleCount('Combien de bouteilles de Champagne ai-je ?')).toEqual({
      kind: 'filtered_cellar_bottle_count',
      filter: 'bulles',
      label: 'champagnes et bulles',
    })
    expect(parseFilteredCellarBottleCount('Nombre de blancs dans ma cave ?')).toEqual({
      kind: 'filtered_cellar_bottle_count',
      filter: 'blanc',
      label: 'blancs',
    })
  })

  it('does not treat recommendation color preferences as exact count filters', () => {
    expect(parseFilteredCellarBottleCount('Je veux un rouge leger sur des sushis')).toBeNull()
  })

  it('extracts simple tasting count filters', () => {
    expect(parseTastingCountQuery("Combien de dégustations de Champagne j'ai faites ?")).toEqual({
      kind: 'tasting_count',
      query: 'champagne',
    })
  })

  it('supports generic tasting counts', () => {
    expect(parseTastingCountQuery("J'ai combien de dégustations ?")).toEqual({
      kind: 'tasting_count',
    })
  })

  it('does not fuzzy-match typo routing vocabulary yet', () => {
    expect(parseGenericCellarBottleCount('Combien de brouteilles ai-je ?')).toBeNull()
  })

  it('extracts simple tasting rating lookups', () => {
    expect(parseTastingRatingQuery("J'avais mis combien d'etoiles au Rayas ?")).toEqual({
      kind: 'tasting_rating',
      query: 'rayas',
    })
    expect(parseTastingRatingQuery('Quelle note j avais mis au Caillez Lemaire ?')).toEqual({
      kind: 'tasting_rating',
      query: 'caillez lemaire',
    })
  })

  it('extracts tasting extreme lookups', () => {
    expect(parseTastingExtremeQuery('Quelle est la plus ancienne ?')).toEqual({
      kind: 'tasting_extreme',
      extreme: 'oldest',
    })
    expect(parseTastingExtremeQuery('Quelle est ma dégustation la plus récente ?')).toEqual({
      kind: 'tasting_extreme',
      extreme: 'newest',
    })
    expect(parseTastingExtremeQuery('Ma meilleure dégustation notée ?')).toEqual({
      kind: 'tasting_extreme',
      extreme: 'best',
    })
    expect(parseTastingExtremeQuery('Ma meilleure dégustation de Champagne ?')).toEqual({
      kind: 'tasting_extreme',
      extreme: 'best',
      query: 'champagne',
    })
    expect(parseTastingExtremeQuery("Ma meilleure dégustation d'Yquem ?")).toEqual({
      kind: 'tasting_extreme',
      extreme: 'best',
      query: 'yquem',
    })
  })

  it('extracts tasting relationship span questions', () => {
    expect(parseTastingRelationshipSpanQuery('Depuis combien de temps on se connait ?')).toEqual({
      kind: 'tasting_relationship_span',
    })
    expect(parseTastingRelationshipSpanQuery('Depuis quand tu me connais ?')).toEqual({
      kind: 'tasting_relationship_span',
    })
  })

  it('extracts magnum and demi-bouteille volume cellar counts', () => {
    expect(parseVolumeCellarBottleCount("Combien de magnums j'ai en cave ?")).toEqual({
      kind: 'volume_cellar_bottle_count',
      filter: 'magnum',
      label: 'magnums',
    })
    expect(parseVolumeCellarBottleCount('J ai combien de demi-bouteilles ?')).toEqual({
      kind: 'volume_cellar_bottle_count',
      filter: 'demi',
      label: 'demi-bouteilles',
    })
  })

  it('does not match volume queries without cellar scope', () => {
    expect(parseVolumeCellarBottleCount('Le magnum, c est mieux ?')).toBeNull()
  })

  it('detects positive cellar origin lookups', () => {
    expect(parseCellarOriginLookup("J'ai des vins italiens dans ma cave ?")).toMatchObject({
      kind: 'cellar_origin_lookup',
      needle: 'italie',
      polarity: 'has',
      label: 'vins italiens',
    })
    expect(parseCellarOriginLookup("Il y a des espagnols en cave ?")).toMatchObject({
      kind: 'cellar_origin_lookup',
      needle: 'espagne',
      polarity: 'has',
    })
  })

  it('detects negated cellar origin lookups', () => {
    expect(parseCellarOriginLookup("Il n'y a pas de vin italien dans ma cave ?")).toMatchObject({
      kind: 'cellar_origin_lookup',
      needle: 'italie',
      polarity: 'has_not',
    })
  })

  it('does not match origin lookups outside cellar context', () => {
    expect(parseCellarOriginLookup('Parle moi des vins italiens en general')).toBeNull()
  })
})
