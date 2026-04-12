import { describe, expect, it } from 'vitest'
import { buildMemoryEvidenceBundle } from '@/lib/tastingMemories'
import type { Bottle } from '@/lib/types'

function bottle(overrides: Partial<Bottle>): Bottle {
  return {
    id: 'bottle',
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

describe('buildMemoryEvidenceBundle', () => {
  it('uses assistant-identified wine context for a later tasting-note lookup', async () => {
    const target = bottle({
      id: 'target-photo-wine',
      domaine: 'Clos Horizon',
      appellation: 'Appellation Test',
      millesime: 2018,
      rating: 3,
      tasting_note: 'Note de regression cible, sobre et factuelle.',
    })
    const distractor = bottle({
      id: 'distractor-wine',
      domaine: 'Maison Fictive',
      appellation: 'Autre Appellation',
      millesime: 2020,
      rating: 4,
      tasting_note: 'Note de regression distracteur.',
    })

    const bundle = await buildMemoryEvidenceBundle({
      query: 'J’ai déjà fait une note de dégustation, tu peux la retrouver ?',
      recentMessages: [
        { role: 'user', text: 'Tu connais ce vin ?' },
        { role: 'celestin', text: 'Je vois une Appellation Test 2018 du Clos Horizon. Tu veux savoir ce que tu en avais pensé ?' },
      ],
      drunkBottles: [target, distractor],
    })

    expect(bundle?.mode).toBe('exact')
    expect(bundle?.usedConversationContext).toBe(true)
    expect(bundle?.planningQuery).toContain('Clos Horizon')
    expect(bundle?.memories.map((memory) => memory.id)).toEqual(['target-photo-wine'])
    expect(bundle?.serialized).toContain('note 3/5')
    expect(bundle?.serialized).toContain('Note de regression cible')
    expect(bundle?.serialized).not.toContain('note 4/5')
  })

  it('does not let generic producer words widen a precise producer lookup', async () => {
    const target = bottle({
      id: 'latour-meursault',
      domaine: 'Vincent Latour',
      appellation: 'Meursault',
      millesime: 2018,
      rating: 3,
      tasting_note: 'Beau Meursault mais un peu large, moins tendu que prévu.',
    })
    const distractor = bottle({
      id: 'roulot-meursault',
      domaine: 'Domaine Roulot',
      appellation: 'Meursault-Charmes',
      millesime: 2010,
      rating: 5,
      tasting_note: 'Grand souvenir sur un Meursault-Charmes laser.',
    })

    const bundle = await buildMemoryEvidenceBundle({
      query: 'J’ai déjà fait une note de dégustation, tu peux la retrouver ?',
      recentMessages: [
        { role: 'celestin', text: 'Je vois un Meursault 2018 du Domaine Vincent Latour. Tu veux me dire ce que tu en as pensé ?' },
      ],
      drunkBottles: [distractor, target],
    })

    expect(bundle?.mode).toBe('exact')
    expect(bundle?.memories.map((memory) => memory.id)).toEqual(['latour-meursault'])
    expect(bundle?.serialized).toContain('Beau Meursault')
    expect(bundle?.serialized).not.toContain('Domaine Roulot')
  })

  it('returns no exact memory when a precise producer hint is absent instead of falling back to appellation', async () => {
    const distractor = bottle({
      id: 'roulot-meursault',
      domaine: 'Domaine Roulot',
      appellation: 'Meursault-Charmes',
      millesime: 2010,
      rating: 5,
      tasting_note: 'Grand souvenir sur un Meursault-Charmes laser.',
    })

    const bundle = await buildMemoryEvidenceBundle({
      query: 'J’ai déjà fait une note de dégustation, tu peux la retrouver ?',
      recentMessages: [
        { role: 'celestin', text: 'Je vois un Meursault 2018 du Domaine Vincent Latour. Tu veux me dire ce que tu en as pensé ?' },
      ],
      drunkBottles: [distractor],
    })

    expect(bundle?.mode).toBe('exact')
    expect(bundle?.memories).toEqual([])
    expect(bundle?.serialized).toContain('Aucun resultat exact trouve')
    expect(bundle?.serialized).not.toContain('Domaine Roulot')
  })

  it('does not fill exact tasting-note lookups with unrelated generic memories', async () => {
    const unrelated = bottle({
      id: 'unrelated',
      domaine: 'Domaine Sans Rapport',
      appellation: 'Volnay',
      millesime: 2019,
      rating: 5,
      tasting_note: 'Grand souvenir mais sans lien avec la demande.',
    })

    const bundle = await buildMemoryEvidenceBundle({
      query: 'J’ai déjà fait une note de dégustation, tu peux la retrouver ?',
      recentMessages: [
        { role: 'user', text: 'Tu connais ce vin ?' },
        { role: 'celestin', text: 'Je vois un vin que je ne peux pas identifier clairement.' },
      ],
      drunkBottles: [unrelated],
    })

    expect(bundle?.mode).toBe('exact')
    expect(bundle?.memories).toEqual([])
    expect(bundle?.serialized).toContain('Aucun resultat exact trouve')
    expect(bundle?.serialized).not.toContain('Domaine Sans Rapport')
  })
})
