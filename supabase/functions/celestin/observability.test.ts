import { describe, expect, it } from 'vitest'
import { persistCelestinTurnObservability, summarizeResolvedSources } from './observability'
import type { CelestinProviderTrace } from './llm-providers'
import type { ResolvedContextSources } from './source-resolver'
import type { CelestinV2Plan } from './v2-plan'

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
      selectedTastingMemories: [
        {
          label: 'Chateau Rayas 1998',
          rating: 4,
          drunkAt: '2026-01-10',
          score: 5.5,
          matchedTokens: ['rayas'],
          notePreview: 'Grand souvenir.',
        },
      ],
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
        selectedTastingMemories: [
          {
            label: 'Chateau Rayas 1998',
            rating: 4,
            drunkAt: '2026-01-10',
            score: 5.5,
            matchedTokens: ['rayas'],
            notePreview: 'Grand souvenir.',
          },
        ],
        chars: 14,
      },
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
        factReadiness: null,
      },
    })
  })

  it('returns null when sources were not resolved', () => {
    expect(summarizeResolvedSources(null)).toBeNull()
  })
})

describe('persistCelestinTurnObservability', () => {
  it('persists failed-turn route, V2 plan and provider response traces', async () => {
    let payload: Record<string, unknown> | null = null
    const supabase = {
      from: () => ({
        upsert: async (value: Record<string, unknown>) => {
          payload = value
          return { error: null }
        },
      }),
    }
    const providerTrace: CelestinProviderTrace = {
      attempts: [
        {
          provider: 'Claude Haiku 4.5',
          status: 'error',
          durationMs: 1234,
          error: 'Recommendation response contract violation: no resolvable ui_action or recommendation_selection',
        },
      ],
      toolCalls: [],
      claudeCache: { creationInputTokens: 0, readInputTokens: 0 },
      usage: { inputTokens: 11, outputTokens: 22, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      providerPath: 'fallback_response',
      responses: [{
        provider: 'Claude',
        rawTextPreview: '{"message":"Je partirais sur un blanc sec."}',
        parseStatus: 'success',
        normalized: {
          messagePreview: 'Je partirais sur un blanc sec.',
          uiActionKind: 'none',
          recommendationSelectionCount: 0,
          actionChipsCount: 0,
        },
      }],
    }
    const v2Plan: CelestinV2Plan = {
      orchestrationVersion: 'v2',
      enabled: true,
      capability: 'RECOMMEND',
      confidence: 0.92,
      recommendationReady: true,
      actionReady: false,
      requiredSources: [],
      responseMode: 'closed_choice',
      actionContract: {
        kind: 'recommendation_selection',
        allowedUiActionKinds: ['show_recommendations'],
        requiresBackendMaterialization: true,
        lowConfidenceBehavior: 'clarify',
      },
      reasons: ['test'],
    }

    await persistCelestinTurnObservability({
      supabase: supabase as never,
      turnId: 'turn-1',
      userId: 'user-1',
      body: {
        message: 'Ce soir sushi',
        history: [],
        orchestrationVersion: 'v2',
      },
      startedAt: performance.now(),
      success: false,
      error: new Error('All providers failed. Recommendation response contract violation: no resolvable ui_action or recommendation_selection'),
      route: 'recommendation_request',
      turnType: 'task_request',
      mode: 'cellar_assistant',
      providerErrors: ['Recommendation response contract violation: no resolvable ui_action or recommendation_selection'],
      providerTrace,
      resolvedSources: sources(),
      v2Plan,
    })

    expect(payload).toMatchObject({
      turn_id: 'turn-1',
      success: false,
      route: 'recommendation_request',
      orchestration_version: 'v2',
      capability: 'RECOMMEND',
      response_mode: 'closed_choice',
      provider_attempts: providerTrace.attempts,
      provider_errors: ['Recommendation response contract violation: no resolvable ui_action or recommendation_selection'],
    })
    expect((payload?.metadata as Record<string, unknown>).providerResponses).toEqual(providerTrace.responses)
    expect((payload?.metadata as Record<string, unknown>).v2Plan).toEqual(v2Plan)
    expect((payload?.metadata as Record<string, unknown>).resolvedSources).toMatchObject({
      cave: {
        level: 'shortlist',
      },
    })
  })
})
