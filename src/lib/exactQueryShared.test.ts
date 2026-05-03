import { describe, expect, it } from 'vitest'
import {
  parseFilteredCellarBottleCount,
  parseGenericCellarBottleCount,
  parseTastingCountQuery,
  parseTastingRatingQuery,
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
})
