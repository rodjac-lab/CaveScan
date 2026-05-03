import { describe, expect, it } from 'vitest'
import { buildContextBlockFromResolvedSources } from './context-builder'
import type { ResolvedContextSources } from './source-resolver'

function sources(overrides: Partial<ResolvedContextSources> = {}): ResolvedContextSources {
  return {
    requirements: [],
    cave: { level: 'none', totalBottles: 0, referenceCount: 0, bottles: [] },
    zones: [],
    ...overrides,
  }
}

describe('buildContextBlockFromResolvedSources', () => {
  it('returns empty context when no source is resolved', () => {
    expect(buildContextBlockFromResolvedSources(sources())).toBe('')
  })

  it('renders compiled profile before legacy profile', () => {
    const block = buildContextBlockFromResolvedSources(sources({
      profile: {
        level: 'recommendation',
        compiledMarkdown: '## Profil compile',
        legacyProfile: 'Profil legacy',
      },
    }))

    expect(block).toContain('Profil utilisateur compile')
    expect(block).toContain('## Profil compile')
    expect(block).not.toContain('Profil legacy')
  })

  it('renders exact memories with strict grounding instruction', () => {
    const block = buildContextBlockFromResolvedSources(sources({
      memories: {
        level: 'exact',
        text: 'Souvenir Caillez Lemaire 2014 - note 4/5.',
        evidenceMode: 'exact',
      },
    }))

    expect(block).toContain('Souvenirs de degustation')
    expect(block).toContain('Souvenir Caillez Lemaire 2014')
    expect(block).toContain('N ajoute aucun autre vin')
  })

  it('renders cellar count without bottle details', () => {
    const block = buildContextBlockFromResolvedSources(sources({
      cave: { level: 'count', totalBottles: 12, referenceCount: 8, bottles: [] },
    }))

    expect(block).toBe('Cave : 12 bouteilles (8 references).')
  })

  it('renders tool-only cellar without serializing bottles', () => {
    const block = buildContextBlockFromResolvedSources(sources({
      zones: ['Paris'],
      cave: { level: 'tool_only', totalBottles: 12, referenceCount: 8, bottles: [] },
    }))

    expect(block).toContain('Zones de stockage disponibles : Paris')
    expect(block).toContain('Cave : detail non injecte')
    expect(block).not.toContain('Bouteilles en cave')
  })

  it('renders shortlist bottles only from resolved source bottles', () => {
    const block = buildContextBlockFromResolvedSources(sources({
      cave: {
        level: 'shortlist',
        totalBottles: 3,
        referenceCount: 2,
        bottles: [
          {
            id: 'b1',
            domaine: 'Domaine Gangloff',
            cuvee: null,
            appellation: 'Cote-Rotie',
            millesime: 2018,
            couleur: 'rouge',
            character: null,
            quantity: 2,
            volume: '0.75',
            food_pairings: ['agneau', 'volaille rotie'],
            local_score: 0.91,
          },
        ],
      },
    }))

    expect(block).toContain('Bouteilles en cave : 3 bouteilles (2 references).')
    expect(block).toContain('- [b1] Domaine Gangloff')
    expect(block).toContain('accords=agneau, volaille rotie')
    expect(block).toContain('score_local=0.91')
  })

  it('renders preempted candidates with explicit choose-from instruction', () => {
    const block = buildContextBlockFromResolvedSources(sources({
      cave: {
        level: 'shortlist',
        totalBottles: 12,
        referenceCount: 2,
        origin: 'preempted_candidates',
        bottles: [
          {
            id: 'aaaaaaaa',
            domaine: 'Domaine Gangloff',
            cuvee: null,
            appellation: 'Cote-Rotie',
            millesime: 2018,
            couleur: 'rouge',
            character: 'puissant epice',
            quantity: 2,
            food_pairings: ['gibier'],
          },
          {
            id: 'bbbbbbbb',
            domaine: 'Domaine Macle',
            cuvee: null,
            appellation: 'Cotes du Jura',
            millesime: 2014,
            couleur: 'blanc',
            character: 'oxydatif',
            quantity: 1,
            food_pairings: null,
          },
        ],
      },
    }))

    expect(block).toContain('Candidats cave pre-selectionnes : 2 bouteilles')
    expect(block).toContain('cave totale : 12 bouteilles')
    expect(block).toContain('recommendation_selection')
    expect(block).toContain('Ne propose pas de bouteille hors de cette liste')
    expect(block).toContain('- [aaaaaaaa] Domaine Gangloff')
    expect(block).toContain('- [bbbbbbbb] Domaine Macle')
  })
})
