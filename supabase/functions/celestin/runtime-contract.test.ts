import { beforeAll, describe, expect, it } from 'vitest'
import type { CelestinProviderTrace } from './llm-providers'
import type { ResolvedContextSources } from './source-resolver'
import type { RoutingIntent } from './turn-interpreter'
import type { CelestinV2Plan } from './v2-plan'

Object.defineProperty(globalThis, 'Deno', {
  value: {
    env: {
      get: () => undefined,
    },
  },
  configurable: true,
})

let canAcceptRecommendationClarification: (input: {
  userMessage: string
  routingIntent: RoutingIntent
  assistantMessage: string
}) => boolean
let operationalActionContractViolation: Awaited<typeof import('./runtime')>['operationalActionContractViolation']
let canDegradeClosedChoiceRecommendation: Awaited<typeof import('./runtime')>['canDegradeClosedChoiceRecommendation']
let buildClosedChoiceDegradedRecommendation: Awaited<typeof import('./runtime')>['buildClosedChoiceDegradedRecommendation']
let CelestinProviderFallbackError: typeof import('./llm-providers')['CelestinProviderFallbackError']

beforeAll(async () => {
  const runtime = await import('./runtime')
  const providers = await import('./llm-providers')
  canAcceptRecommendationClarification = runtime.canAcceptRecommendationClarification
  operationalActionContractViolation = runtime.operationalActionContractViolation
  canDegradeClosedChoiceRecommendation = runtime.canDegradeClosedChoiceRecommendation
  buildClosedChoiceDegradedRecommendation = runtime.buildClosedChoiceDegradedRecommendation
  CelestinProviderFallbackError = providers.CelestinProviderFallbackError
}, 10000)

describe('recommendation response contract', () => {
  const closedChoicePlan: CelestinV2Plan = {
    orchestrationVersion: 'v2',
    enabled: true,
    capability: 'RECOMMEND',
    confidence: 0.91,
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

  const trace = (message = 'Je partirais sur un blanc sec et tendu.'): CelestinProviderTrace => ({
    attempts: [
      { provider: 'Claude Haiku 4.5', status: 'error', durationMs: 1200, error: 'Recommendation response contract violation: no resolvable ui_action or recommendation_selection' },
    ],
    toolCalls: [],
    claudeCache: { creationInputTokens: 0, readInputTokens: 0 },
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    providerPath: 'direct_response',
    responses: [{
      provider: 'Claude',
      parseStatus: 'success',
      rawTextPreview: '{"message":"Je partirais sur un blanc sec et tendu."}',
      normalized: {
        messagePreview: message,
        uiActionKind: 'none',
        recommendationSelectionCount: 0,
        actionChipsCount: 0,
      },
    }],
  })
  const emptyTrace = (): CelestinProviderTrace => ({
    ...trace(),
    responses: [],
  })

  const contractError = (providerErrors: string[]) => new CelestinProviderFallbackError(providerErrors, trace())

  const recommendationSources = (): ResolvedContextSources => ({
    requirements: [],
    cave: {
      level: 'shortlist',
      totalBottles: 2,
      referenceCount: 2,
      bottles: [
        {
          id: 'white001',
          domaine: 'Domaine Blanc',
          cuvee: 'Silex',
          appellation: 'Sancerre',
          millesime: 2022,
          couleur: 'blanc',
          character: 'Blanc sec, salin et tres frais.',
          quantity: 1,
          food_pairings: ['sushi', 'poisson cru'],
        },
        {
          id: 'white002',
          domaine: 'Domaine Jura',
          cuvee: 'Savagnin',
          appellation: 'Cotes du Jura',
          millesime: 2020,
          couleur: 'blanc',
          character: 'Blanc nerveux, ideal sur poisson cru.',
          quantity: 1,
          food_pairings: ['sushi'],
        },
      ],
    },
    zones: [],
  })

  it('accepts clarification only for vague recommendation requests', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour ce soir.',
      routingIntent: 'recommendation_request',
      assistantMessage: "Tu manges quoi ?",
    })).toBe(true)
  })

  it('accepts useful dish clarifications even when the user already gave a dish', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'C est une paella plutôt fruits de mer ou plutôt viande ?',
    })).toBe(true)

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner un poulet rôti.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu le prépares plutôt nature ou avec une sauce crémée ?',
    })).toBe(true)
  })

  it('rejects clarifications that ask the user to inspect their cellar', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu as des blancs ou des rouges légers qui traînent ?',
    })).toBe(false)

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner un poulet rôti.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu as quoi en cave ?',
    })).toBe(false)
  })

  it('rejects clarification when the user already gave a style constraint', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un rouge pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu préfères un blanc ou un rouge ?',
    })).toBe(false)
  })

  it('rejects clarification on recommendation refinements', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Tu en as d autres, plutôt en rouge ?',
      routingIntent: 'recommendation_refinement',
      assistantMessage: 'C est pour quel plat ?',
    })).toBe(false)
  })

  it('degrades closed-choice recommendation provider failures when backend candidates are available', () => {
    const recommendationContract = 'Recommendation response contract violation: no resolvable ui_action or recommendation_selection'

    expect(canDegradeClosedChoiceRecommendation({
      error: contractError([recommendationContract, recommendationContract]),
      v2Plan: closedChoicePlan,
      routingIntent: 'recommendation_request',
      resolvedSources: recommendationSources(),
    })).toBe(true)

    expect(canDegradeClosedChoiceRecommendation({
      error: contractError(['Unterminated string in JSON at position 14705']),
      v2Plan: closedChoicePlan,
      routingIntent: 'recommendation_request',
      resolvedSources: recommendationSources(),
    })).toBe(true)

    expect(canDegradeClosedChoiceRecommendation({
      error: new CelestinProviderFallbackError([recommendationContract], emptyTrace()),
      v2Plan: closedChoicePlan,
      routingIntent: 'recommendation_request',
      resolvedSources: recommendationSources(),
    })).toBe(true)

    expect(canDegradeClosedChoiceRecommendation({
      error: contractError([recommendationContract]),
      v2Plan: { ...closedChoicePlan, responseMode: 'clarification' },
      routingIntent: 'recommendation_request',
      resolvedSources: recommendationSources(),
    })).toBe(false)
  })

  it('turns a closed-choice contract failure into backend recommendation cards', () => {
    const response = buildClosedChoiceDegradedRecommendation({
      error: new CelestinProviderFallbackError(
        ['Recommendation response contract violation: no resolvable ui_action or recommendation_selection'],
        trace('Sur sushi, je viserais un blanc sec, salin, avec peu de bois.'),
      ),
      userMessage: 'Ce soir sushi',
      interpretation: {
        turnType: 'task_request',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: true,
        inferredTaskType: 'recommendation',
      },
      routingIntent: 'recommendation_request',
      resolvedSources: recommendationSources(),
    })

    expect(response.message).toContain('blanc sec')
    expect(response.ui_action?.kind).toBe('show_recommendations')
    expect(response.ui_action?.payload.cards).toHaveLength(2)
    expect(response.ui_action?.payload.cards.map((card) => card.color)).toEqual(['blanc', 'blanc'])
  })
})

describe('operational action contract', () => {
  const workflowPlan: CelestinV2Plan = {
    orchestrationVersion: 'v2',
    enabled: true,
    capability: 'ACTIONS',
    confidence: 0.9,
    recommendationReady: true,
    actionReady: true,
    requiredSources: [],
    responseMode: 'workflow',
    actionContract: {
      kind: 'operational_ui_action',
      allowedUiActionKinds: ['prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
      requiresBackendMaterialization: false,
      lowConfidenceBehavior: 'clarify',
    },
    reasons: ['test'],
  }

  it('requires an allowed ui_action for ready V2 action workflows', () => {
    expect(operationalActionContractViolation(workflowPlan, {
      message: 'Tu veux ajouter quelle bouteille ?',
      ui_action: null,
    })).toBe('Operational action contract violation: missing ui_action')

    expect(operationalActionContractViolation(workflowPlan, {
      message: 'Je te propose ceci.',
      ui_action: { kind: 'show_recommendations', payload: { cards: [] } },
    })).toBe('Operational action contract violation: disallowed ui_action show_recommendations')
  })

  it('accepts allowed operational ui_actions', () => {
    expect(operationalActionContractViolation(workflowPlan, {
      message: 'Je te prépare la fiche.',
      ui_action: {
        kind: 'prepare_add_wine',
        payload: {
          extraction: {
            domaine: 'Domaine Vacheron',
            cuvee: null,
            appellation: 'Sancerre',
            millesime: 2023,
            couleur: null,
            country: null,
            region: null,
            quantity: 1,
            volume: '0.75',
          },
        },
      },
    })).toBeNull()
  })
})
