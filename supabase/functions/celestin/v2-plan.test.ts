import { describe, expect, it } from 'vitest'
import { buildContextPlan } from './context-plan'
import { resolveSourceMode } from './source-mode'
import { interpretTurnWithRouting } from './turn-interpreter'
import { buildCelestinV2Plan, shouldClarifyLowConfidenceV2 } from './v2-plan'
import type { RequestBody } from './types'

function planFor(message: string, overrides: Partial<RequestBody> = {}) {
  const body: RequestBody = {
    message,
    history: [],
    contextStrategy: 'backend_managed',
    ...overrides,
  }
  const routingResult = interpretTurnWithRouting(body.message, !!body.image, { phase: 'idle_smalltalk' })
  const contextPlan = buildContextPlan(routingResult)
  const sourceMode = resolveSourceMode(contextPlan, body)
  return buildCelestinV2Plan({ body, routingResult, contextPlan, sourceMode })
}

describe('buildCelestinV2Plan', () => {
  it('classifies exact cellar lookups as FACTS with exact sources', () => {
    const plan = planFor('Combien de bouteilles ai-je en cave ?', { orchestrationVersion: 'v2' })

    expect(plan.enabled).toBe(true)
    expect(plan.capability).toBe('FACTS')
    expect(plan.responseMode).toBe('deterministic')
    expect(plan.requiredSources).toContain('cave:tool_only')
    expect(plan.requiredSources).toContain('tool:query_cellar')
    expect(shouldClarifyLowConfidenceV2(plan)).toBe(false)
  })

  it('classifies recommendations as closed choices that need backend materialization', () => {
    const plan = planFor('Qu est-ce que j ouvre avec un poulet roti ?', { orchestrationVersion: 'v2' })

    expect(plan.capability).toBe('RECOMMEND')
    expect(plan.responseMode).toBe('closed_choice')
    expect(plan.actionContract).toMatchObject({
      kind: 'closed_recommendation_selection',
      allowedUiActionKinds: ['show_recommendations'],
      requiresBackendMaterialization: true,
    })
    expect(plan.requiredSources).toContain('cellarCandidates:preempted')
  })

  it('keeps low-confidence action-like turns in clarification mode only for V2', () => {
    const v1 = planFor('photo', { image: 'data:image/png;base64,abc' })
    const v2 = planFor('photo', { image: 'data:image/png;base64,abc', orchestrationVersion: 'v2' })

    expect(v1.capability).toBe('ACTIONS')
    expect(v1.responseMode).toBe('clarification')
    expect(shouldClarifyLowConfidenceV2(v1)).toBe(false)
    expect(shouldClarifyLowConfidenceV2(v2)).toBe(true)
  })
})
