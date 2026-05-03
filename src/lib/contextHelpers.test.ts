import { describe, expect, it } from 'vitest'
import { resolveBottleIds } from './contextHelpers'

describe('resolveBottleIds', () => {
  it('keeps appellation and vintage as separate card fields', () => {
    const cards = resolveBottleIds(
      [{
        bottle_id: 'abc12345',
        name: 'Placeholder',
        appellation: 'Placeholder',
        millesime: 2020,
        badge: 'De ta cave',
        reason: 'Reason',
        color: 'blanc',
      }],
      [{
        id: 'abc12345-full',
        domaine: 'Domaine Test',
        cuvee: 'Les Blancs',
        appellation: 'Sancerre',
        millesime: 2020,
      }],
    )

    expect(cards[0]).toMatchObject({
      bottle_id: 'abc12345-full',
      name: 'Domaine Test — Les Blancs',
      appellation: 'Sancerre',
      millesime: 2020,
    })
  })
})
