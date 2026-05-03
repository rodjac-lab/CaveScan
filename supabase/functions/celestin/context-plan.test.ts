import { describe, expect, it } from 'vitest'
import { buildContextPlan, type ContextPlan } from './context-plan'
import type { TurnRoutingResult, RoutingIntent } from './turn-types'

function routing(route: RoutingIntent): TurnRoutingResult {
  return {
    interpretation: {
      turnType: 'task_request',
      cognitiveMode: route === 'wine_question' ? 'wine_conversation' : 'cellar_assistant',
      shouldAllowUiAction: route.includes('recommendation'),
    },
    routing: {
      scope: 'idle_smalltalk',
      winner: route,
      reasons: [],
      candidates: [],
    },
  }
}

function expectPlan(route: RoutingIntent, expected: Omit<ContextPlan, 'reasons'>): void {
  const plan = buildContextPlan(routing(route))

  expect(plan).toMatchObject(expected)
  expect(plan.reasons.length).toBeGreaterThan(0)
}

describe('buildContextPlan', () => {
  it('keeps wine questions factual and source-light', () => {
    expectPlan('wine_question', {
      profile: 'none',
      cave: 'none',
      zones: 'none',
      memories: 'none',
      tools: 'auto',
      history: 'compact',
      truthPolicy: 'prudent_factual',
    })
  })

  it('forces exact cellar source for cellar lookups', () => {
    expectPlan('cellar_lookup', {
      profile: 'none',
      cave: 'tool_only',
      zones: 'names',
      memories: 'none',
      tools: 'force_cellar',
      history: 'compact',
      truthPolicy: 'exact_only',
    })
  })

  it('uses recommendation sources for first recommendation requests', () => {
    expectPlan('recommendation_request', {
      profile: 'recommendation',
      cave: 'shortlist',
      zones: 'names',
      memories: 'targeted',
      tools: 'auto',
      history: 'normal',
      truthPolicy: 'standard',
    })
  })

  it('keeps recommendation refinements actionable', () => {
    expectPlan('recommendation_refinement', {
      profile: 'recommendation',
      cave: 'shortlist',
      zones: 'names',
      memories: 'targeted',
      tools: 'auto',
      history: 'normal',
      truthPolicy: 'standard',
    })
  })

  it('grounds direct memory lookup in exact memory or tasting evidence', () => {
    expectPlan('memory_lookup', {
      profile: 'none',
      cave: 'none',
      zones: 'none',
      memories: 'exact',
      tools: 'force_tastings',
      history: 'compact',
      truthPolicy: 'memory_only',
    })
  })

  it('grounds memory-guided recommendation while preserving recommendation context', () => {
    expectPlan('memory_guided_recommendation', {
      profile: 'recommendation',
      cave: 'shortlist',
      zones: 'names',
      memories: 'targeted',
      tools: 'force_tastings',
      history: 'normal',
      truthPolicy: 'standard',
    })
  })

  it('keeps exploratory pivots source-light to avoid stale recommendation contamination', () => {
    expectPlan('exploratory_reco_pivot', {
      profile: 'none',
      cave: 'none',
      zones: 'none',
      memories: 'none',
      tools: 'none',
      history: 'pivot',
      truthPolicy: 'standard',
    })
  })

  it('grounds tasting routes in exact tasting evidence without profile context', () => {
    expectPlan('tasting_log', {
      profile: 'none',
      cave: 'none',
      zones: 'none',
      memories: 'exact',
      tools: 'force_tastings',
      history: 'normal',
      truthPolicy: 'memory_only',
    })
  })

  it('keeps unknown turns profile-free while allowing tools', () => {
    expectPlan('unknown', {
      profile: 'none',
      cave: 'none',
      zones: 'none',
      memories: 'none',
      tools: 'auto',
      history: 'compact',
      truthPolicy: 'prudent_factual',
    })
  })
})
