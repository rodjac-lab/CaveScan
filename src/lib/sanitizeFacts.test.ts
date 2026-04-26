/**
 * Documents the T3 sanitization contract: facts that pass through the
 * extract-chat-insights LLM but match well-known noise patterns are
 * dropped at compile-time before reaching the user's profile.
 *
 * This is the safety net that lets the extraction prompt stay light —
 * if a defensive rule is added/removed in the prompt, these tests
 * confirm what the pipeline catches independently.
 */

import { describe, expect, it } from 'vitest'
import { sanitizeFacts, type MemoryFactLike } from '../../shared/celestin/compiled-profile'

function fact(category: MemoryFactLike['category'], text: string): MemoryFactLike {
  return { category, fact: text, confidence: 0.8 }
}

describe('sanitizeFacts (T3 safety net)', () => {
  describe('cellar_intent: drops inventory observations the LLM mistook for intentions', () => {
    const cases = [
      "n'a aucun champagne en cave",
      "ne possède pas de Bourgogne",
      "possède trois magnums dans sa cave",
      "il y a une bouteille de Sancerre",
    ]
    for (const text of cases) {
      it(`drops "${text}"`, () => {
        expect(sanitizeFacts([fact('cellar_intent', text)])).toHaveLength(0)
      })
    }

    it('keeps a real intention', () => {
      const real = fact('cellar_intent', 'Veut acheter du Pinot Noir au prochain salon')
      expect(sanitizeFacts([real])).toEqual([real])
    })
  })

  describe('wine_knowledge: drops feedback about the app/Celestin itself', () => {
    const cases = [
      "Celestin doit retenir ses préférences",
      "s'attend à ce que l'app retrouve ses notes",
      "voudrait que l'app suggère des accords",
    ]
    for (const text of cases) {
      it(`drops "${text}"`, () => {
        expect(sanitizeFacts([fact('wine_knowledge', text)])).toHaveLength(0)
      })
    }
  })

  describe('wine_knowledge: drops one-off questions about wine culture', () => {
    const cases = [
      "se demande si Barolo et Barbaresco diffèrent vraiment",
      "se demande comment vieillit un Chenin",
      "s'intéresse à la différence entre Côte-Rôtie et Hermitage",
      "se questionne sur l'élevage en barrique",
    ]
    for (const text of cases) {
      it(`drops "${text}"`, () => {
        expect(sanitizeFacts([fact('wine_knowledge', text)])).toHaveLength(0)
      })
    }

    it('keeps a real knowledge fact', () => {
      const real = fact('wine_knowledge', 'Préfère les explications simples sans jargon')
      expect(sanitizeFacts([real])).toEqual([real])
    })
  })

  it('preserves order and other categories untouched', () => {
    const facts: MemoryFactLike[] = [
      fact('preference', 'Aime les Chenin de Loire'),
      fact('cellar_intent', "n'a aucun champagne"), // dropped
      fact('aversion', "N'aime pas le boisé"),
      fact('wine_knowledge', "se demande si le Bourgogne est cher"), // dropped
      fact('life_event', 'Voyage à Beaune en septembre'),
    ]
    const sanitized = sanitizeFacts(facts)
    expect(sanitized.map((f) => f.fact)).toEqual([
      'Aime les Chenin de Loire',
      "N'aime pas le boisé",
      'Voyage à Beaune en septembre',
    ])
  })

  it('drops facts with empty text regardless of category', () => {
    expect(sanitizeFacts([fact('preference', '   ')])).toHaveLength(0)
    expect(sanitizeFacts([{ category: 'preference', fact: null }])).toHaveLength(0)
  })
})
