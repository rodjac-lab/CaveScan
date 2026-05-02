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
})
