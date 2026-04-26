import { describe, expect, it } from 'vitest'
import { buildContextBlock, buildMemoriesSection, summarizeCaveCounts } from './context-builder'
import type { RequestBody } from './types'

const MODES = [
  'greeting',
  'social',
  'wine_conversation',
  'tasting_memory',
  'restaurant_assistant',
  'cellar_assistant',
] as const

/**
 * Deterministic body fixture. Kept minimal but covers all the branches
 * used by buildContextBlock: profile, memories, sqlRetrieval, cave, zones.
 * If you need to update because of an intentional prompt change, run
 *   npx vitest -u supabase/functions/celestin/context-builder.test.ts
 */
function fixture(overrides: Partial<RequestBody> = {}): RequestBody {
  return {
    message: 'test',
    history: [],
    profile: 'Aime les vins de Loire et les rouges légers.',
    memories: 'Souvenir Domaine Gangloff 2018 — note 4/5, ouvert le 2026-02-26.',
    memoryEvidenceMode: 'synthesis',
    sqlRetrieval: '[Inventaire]\nL inventaire compte 6 fiche(s) — TROP pour lister.\n- Domaine Gangloff · Côte-Rôtie · 2018',
    compiledProfileMarkdown: '## Profil compilé\n- Loire blanc\n- Beaujolais',
    cave: [
      {
        id: 'b1',
        domaine: 'Domaine Gangloff',
        cuvee: null,
        appellation: 'Côte-Rôtie',
        millesime: 2018,
        couleur: 'rouge',
        character: null,
        quantity: 2,
        volume: '0.75',
      },
      {
        id: 'b2',
        domaine: 'Thillardon',
        cuvee: 'Les Carrières',
        appellation: 'Chénas',
        millesime: 2020,
        couleur: 'rouge',
        character: 'jus tendu',
        quantity: 1,
        volume: '1.5',
        local_score: 0.82,
      },
    ],
    ...overrides,
  }
}

describe('summarizeCaveCounts', () => {
  it('counts references vs total bottles correctly', () => {
    const body = fixture()
    expect(summarizeCaveCounts(body)).toEqual({ totalBottles: 3, referenceCount: 2 })
  })

  it('treats missing quantity as 1', () => {
    const body = fixture({ cave: [{ id: 'x', domaine: 'X', cuvee: null, appellation: null, millesime: null, couleur: null, character: null }] })
    expect(summarizeCaveCounts(body)).toEqual({ totalBottles: 1, referenceCount: 1 })
  })
})

describe('buildMemoriesSection', () => {
  it('exact mode adds strict-inventory directive', () => {
    expect(buildMemoriesSection(fixture({ memoryEvidenceMode: 'exact' }))).toMatchSnapshot()
  })
  it('synthesis mode adds base-de-synthese directive', () => {
    expect(buildMemoriesSection(fixture({ memoryEvidenceMode: 'synthesis' }))).toMatchSnapshot()
  })
  it('permissive mode emits memories alone, persona handles citation guidance', () => {
    expect(buildMemoriesSection(fixture({ memoryEvidenceMode: undefined }))).toMatchSnapshot()
  })
  it('returns empty when no memories', () => {
    expect(buildMemoriesSection(fixture({ memories: undefined }))).toEqual([])
  })
})

describe('buildContextBlock', () => {
  for (const mode of MODES) {
    it(`matches snapshot for mode=${mode}`, () => {
      const block = buildContextBlock(fixture(), mode)
      expect(block).toMatchSnapshot()
    })
  }

  it('falls back to raw profile when compiledProfileMarkdown is missing', () => {
    const block = buildContextBlock(
      fixture({ compiledProfileMarkdown: undefined }),
      'cellar_assistant',
    )
    expect(block).toContain('Profil de gout')
    expect(block).not.toContain('Profil utilisateur compile')
  })

  it('omits sqlRetrieval block in greeting mode', () => {
    const block = buildContextBlock(fixture(), 'greeting')
    expect(block).not.toContain('Faits deterministes')
  })

  it('shows zones in cellar_assistant mode when provided', () => {
    const body = fixture()
    ;(body as Record<string, unknown>).zones = ['Cave principale', 'Cave secondaire']
    const block = buildContextBlock(body, 'cellar_assistant')
    expect(block).toContain('Cave principale')
    expect(block).toContain('Cave secondaire')
  })
})
