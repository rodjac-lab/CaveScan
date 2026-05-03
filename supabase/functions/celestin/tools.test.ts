import { describe, expect, it } from 'vitest'
import { scoreCelestinToolFreeQueryForTest } from './tools'

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
