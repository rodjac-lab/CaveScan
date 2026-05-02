import { describe, expect, it } from 'vitest'
import { parseGenericCellarBottleCount, parseTastingCountQuery } from '../../shared/celestin/exact-query'

describe('exact query parsing', () => {
  it('recognizes generic cellar bottle counts', () => {
    expect(parseGenericCellarBottleCount('J ai combien de bouteilles en cave ?')).toEqual({
      kind: 'generic_cellar_bottle_count',
    })
  })

  it('does not treat filtered cellar bottle counts as generic', () => {
    expect(parseGenericCellarBottleCount('Combien de bouteilles de Champagne ai-je ?')).toBeNull()
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
})
