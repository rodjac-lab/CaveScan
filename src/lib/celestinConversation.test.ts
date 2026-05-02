import { describe, expect, it } from 'vitest'
import { buildCelestinRequestBody, type CelestinChatMessage } from '@/lib/celestinConversation'
import type { Bottle, TasteProfile } from '@/lib/types'

function bottle(overrides: Partial<Bottle> = {}): Bottle {
  return {
    id: '12345678-aaaa-bbbb-cccc-123456789abc',
    domaine: 'Domaine A',
    cuvee: 'Vieilles Vignes',
    appellation: 'Chablis',
    millesime: 2020,
    couleur: 'blanc',
    country: 'France',
    region: 'Bourgogne',
    raw_extraction: null,
    zone_id: 'zone-1',
    shelf: 'A1',
    photo_url: null,
    photo_url_back: null,
    status: 'in_stock',
    added_at: '2026-01-01',
    drunk_at: null,
    updated_at: '2026-01-02',
    tasting_note: null,
    purchase_price: 25,
    market_value: null,
    drink_from: 2024,
    drink_until: 2030,
    notes: 'salin',
    tasting_photos: null,
    rating: null,
    rebuy: null,
    qpr: null,
    grape_varieties: null,
    serving_temperature: null,
    typical_aromas: null,
    food_pairings: null,
    character: 'tendu',
    quantity: 2,
    volume_l: 0.75,
    tasting_tags: null,
    ...overrides,
  }
}

function profile(): TasteProfile {
  return {
    computedAt: '2026-01-01',
    explicit: {
      freeNotes: 'Aime les blancs tendus.',
    },
    computed: {
      totalInCave: 1,
      totalTasted: 1,
      avgRating: 4,
      rebuyRate: 1,
      topAppellations: [{ name: 'Chablis', count: 1, avgRating: 4, score: 1 }],
      topDomaines: [{ name: 'Domaine A', count: 1, avgRating: 4, score: 1 }],
      colorDistribution: { rouge: 0, blanc: 1, rose: 0, bulles: 0 },
      priceRange: { min: 25, max: 25, avg: 25 },
      qprDistribution: { cher: 0, correct: 1, pepite: 0 },
      topAromas: [],
      topFoodPairings: [],
      recentTastings: [],
      seasonalPattern: { spring: 0, summer: 0, autumn: 0, winter: 1 },
      dataPoints: 1,
      livedPairings: [],
      userDescriptors: [],
      typicalOccasions: [],
    },
  }
}

const messages: CelestinChatMessage[] = [
  { id: 'm1', role: 'user', text: 'Que boire avec une pizza ?' },
]

describe('buildCelestinRequestBody', () => {
  it('keeps backend-managed request bodies minimal', () => {
    const body = buildCelestinRequestBody({
      message: 'Que boire avec une pizza ?',
      cave: [bottle()],
      drunk: [bottle({ id: 'drunk-1', status: 'drunk', drunk_at: '2026-01-01', tasting_note: 'Rome' })],
      profile: profile(),
      messages,
      zones: ['Paris'],
      memoriesOverride: 'Souvenir frontend',
      memoryEvidenceMode: 'exact',
      memoryTrace: { decision: 'exact_filters' } as never,
      compiledProfileMarkdown: '## Profil compile',
      backendManagedContext: true,
    })

    expect(body.contextStrategy).toBe('backend_managed')
    expect(body.cave).toBeUndefined()
    expect(body.profile).toBeUndefined()
    expect(body.memories).toBeUndefined()
    expect(body.memoryEvidenceMode).toBeUndefined()
    expect(body.memoryTrace).toBeUndefined()
    expect(body.compiledProfileMarkdown).toBeUndefined()
    expect(body.zones).toBeUndefined()
    expect(body.context.recentDrunk).toBeUndefined()
  })

  it('keeps legacy context available for active-task fallback bodies', () => {
    const body = buildCelestinRequestBody({
      message: 'Et en blanc ?',
      cave: [bottle()],
      drunk: [bottle({ id: 'drunk-1', status: 'drunk', drunk_at: '2026-01-01', tasting_note: 'Rome' })],
      profile: profile(),
      messages,
      zones: ['Paris'],
      memoriesOverride: 'Souvenir frontend',
      memoryEvidenceMode: 'exact',
      compiledProfileMarkdown: '## Profil compile',
      backendManagedContext: false,
    })

    expect(body.contextStrategy).toBeUndefined()
    expect(body.cave).toHaveLength(1)
    expect(body.profile).toContain('blancs tendus')
    expect(body.memories).toBe('Souvenir frontend')
    expect(body.memoryEvidenceMode).toBe('exact')
    expect(body.compiledProfileMarkdown).toBe('## Profil compile')
    expect(body.zones).toEqual(['Paris'])
    expect(body.context.recentDrunk).toHaveLength(1)
  })
})
