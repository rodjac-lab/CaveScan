import { describe, expect, it } from 'vitest'
import { buildDeterministicResponse } from './deterministic-response'
import type { ContextPlan } from './context-plan'
import type { ResolvedContextSources } from './source-resolver'
import type { RequestBody } from './types'

function body(message: string): RequestBody {
  return {
    message,
    history: [],
    cave: [],
  }
}

function plan(overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    profile: 'none',
    cave: 'tool_only',
    zones: 'names',
    memories: 'none',
    tools: 'force_cellar',
    history: 'compact',
    truthPolicy: 'exact_only',
    cellarCandidates: 'none',
    reasons: ['test'],
    ...overrides,
  }
}

function sources(overrides: Partial<ResolvedContextSources> = {}): ResolvedContextSources {
  return {
    requirements: [],
    cave: { level: 'tool_only', totalBottles: 12, referenceCount: 8, bottles: [] },
    zones: [],
    ...overrides,
  }
}

describe('buildDeterministicResponse', () => {
  it('answers generic cellar bottle counts without LLM', () => {
    const response = buildDeterministicResponse({
      body: body('Combien de bouteilles ai-je en cave ?'),
      routingIntent: 'cellar_lookup',
      contextPlan: plan(),
      resolvedSources: sources(),
    })

    expect(response?.message).toBe('Tu as 12 bouteilles en cave, sur 8 references.')
  })

  it('does not answer filtered cellar count questions without a resolved filter source', () => {
    const response = buildDeterministicResponse({
      body: body('Combien de bouteilles de Champagne ai-je ?'),
      routingIntent: 'cellar_lookup',
      contextPlan: plan(),
      resolvedSources: sources(),
    })

    expect(response).toBeNull()
  })

  it('answers resolved filtered cellar bottle counts without LLM', () => {
    const response = buildDeterministicResponse({
      body: body("J'ai combien de rouges en cave ?"),
      routingIntent: 'cellar_lookup',
      contextPlan: plan(),
      resolvedSources: sources({
        cave: {
          level: 'tool_only',
          totalBottles: 5,
          referenceCount: 3,
          bottles: [],
          countFilter: { kind: 'color', filter: 'rouge', label: 'rouges' },
        },
      }),
    })

    expect(response?.message).toBe('Tu as 5 bouteilles de rouges en cave, sur 3 references.')
  })

  it('keeps filtered cellar counts unresolved when the source filter does not match', () => {
    const response = buildDeterministicResponse({
      body: body("J'ai combien de rouges en cave ?"),
      routingIntent: 'cellar_lookup',
      contextPlan: plan(),
      resolvedSources: sources({
        cave: {
          level: 'tool_only',
          totalBottles: 2,
          referenceCount: 1,
          bottles: [],
          countFilter: { kind: 'color', filter: 'blanc', label: 'blancs' },
        },
      }),
    })

    expect(response).toBeNull()
  })

  it('only answers exact cellar lookup routes', () => {
    expect(buildDeterministicResponse({
      body: body('Combien de bouteilles ai-je ?'),
      routingIntent: 'recommendation_request',
      contextPlan: plan(),
      resolvedSources: sources(),
    })).toBeNull()

    expect(buildDeterministicResponse({
      body: body('Combien de bouteilles ai-je ?'),
      routingIntent: 'cellar_lookup',
      contextPlan: plan({ truthPolicy: 'standard' }),
      resolvedSources: sources(),
    })).toBeNull()
  })

  it('prepares an encavage action when a collecting encavage turn identifies one wine', () => {
    const response = buildDeterministicResponse({
      body: {
        ...body('Un Sancerre 2023 du Domaine Vacheron'),
        conversationState: {
          phase: 'collecting_info',
          taskType: 'encavage',
          lastUiActionKind: null,
          turnsSinceLastAction: 0,
          memoryFocus: null,
        },
      },
      routingIntent: 'encavage_request',
      contextPlan: plan({ truthPolicy: 'standard', tools: 'auto', cave: 'count' }),
      resolvedSources: sources({ cave: { level: 'count', totalBottles: 12, referenceCount: 8, bottles: [] } }),
    })

    expect(response?.ui_action?.kind).toBe('prepare_add_wine')
    expect(response?.ui_action?.payload.extraction).toMatchObject({
      domaine: 'Domaine Vacheron',
      appellation: 'Sancerre',
      millesime: 2023,
      quantity: 1,
      volume: '0.75',
    })
  })

  it('answers a short red follow-up in the previous geographic wine context', () => {
    const response = buildDeterministicResponse({
      body: {
        ...body('Plutôt un rouge.'),
        history: [
          { role: 'user', text: 'Je cherche un vin italien' },
          { role: 'assistant', text: "L'Italie, c'est vaste : tu cherches quel style ?" },
        ],
      },
      routingIntent: 'wine_question',
      contextPlan: plan({ truthPolicy: 'prudent_factual', cave: 'none', zones: 'none', tools: 'none' }),
      resolvedSources: sources({ cave: { level: 'none', totalBottles: 0, referenceCount: 0, bottles: [] } }),
    })

    expect(response?.ui_action).toBeNull()
    expect(response?.message.toLowerCase()).toContain('italien')
    expect(response?.message.toLowerCase()).toContain('rouge')
  })

  it('answers simple tasting counts from resolved tasting source', () => {
    const response = buildDeterministicResponse({
      body: body("Combien de dégustations de Champagne j'ai faites ?"),
      routingIntent: 'tasting_log',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: { kind: 'count', totalRows: 4, query: 'champagne', queryLabel: 'champagne' },
      }),
    })

    expect(response?.message).toBe('Tu as 4 degustations de champagne.')
  })

  it('does not answer tasting counts without resolved tasting source', () => {
    const response = buildDeterministicResponse({
      body: body("Combien de dégustations de Champagne j'ai faites ?"),
      routingIntent: 'tasting_log',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources(),
    })

    expect(response).toBeNull()
  })

  it('answers single-match tasting rating lookups from resolved tasting rows', () => {
    const response = buildDeterministicResponse({
      body: body("J'avais mis combien d'etoiles au Rayas ?"),
      routingIntent: 'memory_lookup',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: {
          kind: 'rating',
          totalRows: 1,
          query: 'rayas',
          queryLabel: 'rayas',
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
      }),
    })

    expect(response?.message).toBe('Tu avais mis 4/5 a Chateau Rayas Chateauneuf-du-Pape 1998.')
  })

  it('answers single-match tasting existence lookups with the matched wine', () => {
    const response = buildDeterministicResponse({
      body: body('Ai-je déjà bu des Côte-Rôtie ?'),
      routingIntent: 'memory_lookup',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: {
          kind: 'existence',
          totalRows: 1,
          query: 'cote rotie',
          queryLabel: 'cote rotie',
          rows: [
            {
              domaine: 'Gangloff',
              cuvee: 'Sereine Noire',
              appellation: 'Cote Rotie',
              millesime: 2010,
              couleur: 'rouge',
              rating: 5,
              drunk_at: '2026-02-26',
            },
          ],
          factReadiness: {
            directAnswerAllowed: true,
            answerPath: 'direct_fact',
            reason: 'explicit_tasting_subject',
            focus: {
              label: 'cote rotie',
              source: 'tasting',
              confidence: 0.95,
              evidence: 'explicit already tasted/opened phrasing',
            },
          },
        },
      }),
    })

    expect(response?.message.toLowerCase()).toContain('gangloff')
    expect(response?.message).toContain('2010')
  })

  it('does not answer focused tasting facts directly when the focus source is ambiguous', () => {
    const response = buildDeterministicResponse({
      body: body("C'était quoi comme millésime déjà ?"),
      routingIntent: 'memory_lookup',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: {
          kind: 'vintage',
          totalRows: 1,
          query: 'gangloff',
          queryLabel: 'gangloff',
          factReadiness: {
            directAnswerAllowed: false,
            answerPath: 'llm_fact_with_tools',
            reason: 'ambiguous_focus_source',
            focus: {
              label: 'Gangloff',
              source: 'unknown',
              confidence: 0.35,
              evidence: 'no direct tasting evidence',
            },
          },
          rows: [
            {
              domaine: 'Gangloff',
              cuvee: null,
              appellation: 'Cote-Rotie',
              millesime: 2018,
              couleur: 'rouge',
              rating: 4,
              drunk_at: '2026-01-10',
            },
          ],
        },
      }),
    })

    expect(response).toBeNull()
  })

  it('answers oldest tasting lookups from resolved tasting rows', () => {
    const response = buildDeterministicResponse({
      body: body('Quelle est la plus ancienne ?'),
      routingIntent: 'memory_lookup',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: {
          kind: 'extreme',
          totalRows: 84,
          queryLabel: 'oldest',
          rows: [
            {
              domaine: 'Grange des Peres',
              cuvee: null,
              appellation: 'VDP du Languedoc',
              millesime: 2009,
              couleur: 'rouge',
              rating: null,
              drunk_at: '2026-02-01T09:05:27.652Z',
            },
          ],
        },
      }),
    })

    expect(response?.message).toBe('Ta plus ancienne degustation enregistree est Grange des Peres VDP du Languedoc 2009, degustee le 1 février 2026.')
  })

  it('answers relationship span questions without claiming relationship start', () => {
    const response = buildDeterministicResponse({
      body: body('Depuis combien de temps on se connait ?'),
      routingIntent: 'tasting_log',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: {
          kind: 'span',
          totalRows: 84,
          firstDrunkAt: '2026-02-01T09:05:27.652Z',
          lastDrunkAt: '2026-05-14T16:29:10.165Z',
          rows: [
            {
              domaine: 'Grange des Peres',
              cuvee: null,
              appellation: 'VDP du Languedoc',
              millesime: 2009,
              couleur: 'rouge',
              rating: null,
              drunk_at: '2026-02-01T09:05:27.652Z',
            },
          ],
        },
      }),
    })

    expect(response?.message).toContain('Je ne peux pas dater notre relation avec certitude')
    expect(response?.message).toContain('Le plus ancien enregistrement que je retrouve est le 1 février 2026 : Grange des Peres VDP du Languedoc 2009')
    expect(response?.message).toContain('Il y a 84 degustations dans l historique')
  })

  it('does not invent best tasting when no rated row is resolved', () => {
    const response = buildDeterministicResponse({
      body: body('Quelle est ma meilleure dégustation notée ?'),
      routingIntent: 'memory_lookup',
      contextPlan: plan({
        cave: 'none',
        zones: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }),
      resolvedSources: sources({
        tastings: {
          kind: 'extreme',
          totalRows: 0,
          queryLabel: 'best',
          rows: [],
        },
      }),
    })

    expect(response?.message).toBe('Je ne retrouve aucune degustation notee fiable.')
  })

  it('does not answer ambiguous or unrated tasting rating lookups deterministically', () => {
    const contextPlan = plan({
      cave: 'none',
      zones: 'none',
      memories: 'exact',
      tools: 'force_tastings',
      truthPolicy: 'memory_only',
    })

    expect(buildDeterministicResponse({
      body: body("J'avais mis combien d'etoiles au Rayas ?"),
      routingIntent: 'memory_lookup',
      contextPlan,
      resolvedSources: sources({
        tastings: {
          kind: 'rating',
          totalRows: 2,
          query: 'rayas',
          queryLabel: 'rayas',
          rows: [
            { domaine: 'Rayas', cuvee: null, appellation: null, millesime: 1998, couleur: 'rouge', rating: 4, drunk_at: null },
            { domaine: 'Rayas', cuvee: null, appellation: null, millesime: 2001, couleur: 'rouge', rating: 5, drunk_at: null },
          ],
        },
      }),
    })).toBeNull()

    expect(buildDeterministicResponse({
      body: body("J'avais mis combien d'etoiles au Rayas ?"),
      routingIntent: 'memory_lookup',
      contextPlan,
      resolvedSources: sources({
        tastings: {
          kind: 'rating',
          totalRows: 1,
          query: 'rayas',
          queryLabel: 'rayas',
          rows: [
            { domaine: 'Rayas', cuvee: null, appellation: null, millesime: 1998, couleur: 'rouge', rating: null, drunk_at: null },
          ],
        },
      }),
    })).toBeNull()
  })
})
