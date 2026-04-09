import { describe, expect, it, vi } from 'vitest'
import { buildDrunkBottleInsertFromExtraction } from '@/lib/bottleWrites'
import type { WineExtraction } from '@/lib/types'

describe('buildDrunkBottleInsertFromExtraction', () => {
  it('creates a drunk bottle record for out-of-cellar tastings', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T18:45:00.000Z'))

    const extraction: WineExtraction = {
      domaine: 'Rodolfo Cosini',
      cuvee: 'Brunello di Montalcino',
      appellation: 'Brunello di Montalcino',
      millesime: 2020,
      couleur: 'rouge',
      country: 'Italie',
      region: 'Toscane',
      confidence: 0.93,
      cepage: null,
      grape_varieties: ['Sangiovese'],
      serving_temperature: null,
      typical_aromas: null,
      food_pairings: ['osso bucco'],
      character: 'Jeune et croquant',
      drink_from: null,
      drink_until: null,
      purchase_price: null,
      zone_name: null,
    }

    const record = buildDrunkBottleInsertFromExtraction(extraction, { photoUrl: 'https://cdn.example/front.jpg' })

    expect(record.status).toBe('drunk')
    expect(record.drunk_at).toBe('2026-04-09T18:45:00.000Z')
    expect(record.photo_url).toBe('https://cdn.example/front.jpg')
    expect(record.zone_id).toBeNull()
    expect(record.quantity).toBe(1)
    expect(record.volume_l).toBe(0.75)
    expect(record.food_pairings).toEqual(['osso bucco'])

    vi.useRealTimers()
  })
})
