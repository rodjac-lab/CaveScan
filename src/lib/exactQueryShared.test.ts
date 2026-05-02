import { describe, expect, it } from 'vitest'
import { parseGenericCellarBottleCount, parseTastingCountQuery, parseTastingRatingQuery } from '../../shared/celestin/exact-query'

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
