import { describe, expect, it } from 'vitest'
import { buildContextPlanInstructions } from './prompt-context-policy'
import type { ContextPlan } from './context-plan'

function plan(overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    profile: 'none',
    cave: 'none',
    zones: 'none',
    memories: 'none',
    tools: 'none',
    history: 'compact',
    truthPolicy: 'standard',
    reasons: ['test'],
    ...overrides,
  }
}

describe('buildContextPlanInstructions', () => {
  it('keeps pure wine questions free of source policy noise', () => {
    expect(buildContextPlanInstructions(plan({
      truthPolicy: 'prudent_factual',
    }))).toBe('')
  })

  it('centralizes exact cellar policy from ContextPlan', () => {
    const policy = buildContextPlanInstructions(plan({
      cave: 'tool_only',
      tools: 'force_cellar',
      truthPolicy: 'exact_only',
    }))

    expect(policy).toContain('VERITE EXACTE')
    expect(policy).toContain('query_cellar')
    expect(policy).toContain('quantites')
  })

  it('centralizes memory-only tasting policy from ContextPlan', () => {
    const policy = buildContextPlanInstructions(plan({
      memories: 'exact',
      tools: 'force_tastings',
      truthPolicy: 'memory_only',
    }))

    expect(policy).toContain('VERITE MEMOIRE')
    expect(policy).toContain('query_tastings')
    expect(policy).toContain('fait exact en premiere phrase')
  })

  it('centralizes exploratory pivot policy from routing state', () => {
    const policy = buildContextPlanInstructions(plan(), {
      interpretation: {
        turnType: 'context_switch',
        cognitiveMode: 'wine_conversation',
        shouldAllowUiAction: false,
      },
      state: {
        phase: 'post_task_ack',
        taskType: 'recommendation',
        lastUiActionKind: 'show_recommendations',
        turnsSinceLastAction: 0,
        memoryFocus: null,
      },
      routingIntent: 'exploratory_reco_pivot',
    })

    expect(policy).toContain('PIVOT EXPLORATOIRE')
    expect(policy).toContain('question autonome')
    expect(policy).toContain('plat precedent')
  })

  it('centralizes recommendation action policy from interpretation', () => {
    const policy = buildContextPlanInstructions(plan({
      cave: 'shortlist',
      tools: 'auto',
    }), {
      interpretation: {
        turnType: 'task_request',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: true,
        inferredTaskType: 'recommendation',
      },
      state: {
        phase: 'idle_smalltalk',
        taskType: undefined,
        lastUiActionKind: undefined,
        turnsSinceLastAction: 0,
        memoryFocus: null,
      },
      routingIntent: 'recommendation_request',
    })

    expect(policy).toContain('RECOMMANDATION IMMEDIATE')
    expect(policy).toContain('show_recommendations')
    expect(policy).toContain('2-3 cartes')
  })

  it('centralizes encavage continuation action policy', () => {
    const policy = buildContextPlanInstructions(plan(), {
      interpretation: {
        turnType: 'task_continue',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: true,
      },
      state: {
        phase: 'collecting_info',
        taskType: 'encavage',
        lastUiActionKind: undefined,
        turnsSinceLastAction: 0,
        memoryFocus: null,
      },
      routingIntent: 'encavage_request',
    })

    expect(policy).toContain('ENCAVAGE')
    expect(policy).toContain('prepare_add_wine')
    expect(policy).toContain('Reponse tres courte')
  })
})
