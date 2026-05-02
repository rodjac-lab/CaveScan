import { describe, expect, it } from 'vitest'
import { summarizeResolvedSources } from './observability'
import type { ResolvedContextSources } from './source-resolver'

function sources(overrides: Partial<ResolvedContextSources> = {}): ResolvedContextSources {
  return {
    requirements: [],
    profile: {
      level: 'recommendation',
      compiledMarkdown: '## Profil',
    },
    memories: {
      level: 'targeted',
      text: 'Souvenir exact',
      evidenceMode: 'synthesis',
      source: 'backend_tastings',
      selectedCount: 1,
    },
    cave: {
      level: 'shortlist',
      totalBottles: 12,
      referenceCount: 8,
      bottles: [
        {
          id: 'b1',
          domaine: 'Domaine A',
          cuvee: null,
          appellation: 'Chablis',
          millesime: 2020,
          couleur: 'blanc',
          character: 'tendu',
          quantity: 2,
        },
      ],
    },
    zones: ['Paris', 'Bourgogne'],
    tastings: {
      kind: 'rating',
      totalRows: 1,
      query: 'rayas',
      rows: [
        {
          domaine: 'Chateau Rayas',
          cuvee: null,
          appellation: 'Chateauneuf-du-Pape',
          millesime: 1998,
          couleur: 'rouge',
          rating: 4,
          drunk_at: '2026-01-10',
        },
      ],
    },
    ...overrides,
  }
}

describe('summarizeResolvedSources', () => {
  it('keeps source observability compact and structured', () => {
    expect(summarizeResolvedSources(sources())).toEqual({
      profile: {
        level: 'recommendation',
        compiled: true,
        legacy: false,
      },
      memories: {
        level: 'targeted',
        evidenceMode: 'synthesis',
        source: 'backend_tastings',
        selectedCount: 1,
        chars: 14,
      },
      sqlRetrieval: null,
      cave: {
        level: 'shortlist',
        totalBottles: 12,
        referenceCount: 8,
        injectedBottles: 1,
      },
      zones: {
        count: 2,
      },
      tastings: {
        kind: 'rating',
        totalRows: 1,
        rowCount: 1,
        query: 'rayas',
      },
    })
  })

  it('returns null when sources were not resolved', () => {
    expect(summarizeResolvedSources(null)).toBeNull()
  })
})
