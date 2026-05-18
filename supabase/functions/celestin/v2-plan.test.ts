import { describe, expect, it } from 'vitest'
import { INITIAL_STATE, type ConversationState } from './conversation-state'
import { buildContextPlan } from './context-plan'
import { resolveSourceMode } from './source-mode'
import { interpretTurnWithRouting } from './turn-interpreter'
import { buildCelestinV2Plan, shouldClarifyLowConfidenceV2 } from './v2-plan'
import type { RequestBody } from './types'

function planFor(message: string, overrides: Partial<RequestBody> = {}, state: Partial<ConversationState> = { phase: 'idle_smalltalk' }) {
  const body: RequestBody = {
    message,
    history: [],
    contextStrategy: 'backend_managed',
    ...overrides,
  }
  const routingResult = interpretTurnWithRouting(body.message, !!body.image, { ...INITIAL_STATE, ...state })
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

  it('lets exact memory facts bypass low-confidence clarification', () => {
    const plan = planFor(
      "C'était quoi comme millésime déjà ?",
      { orchestrationVersion: 'v2' },
      { phase: 'active_task', taskType: 'personal_fact', memoryFocus: 'Gangloff' },
    )

    expect(plan.capability).toBe('FACTS')
    expect(plan.confidence).toBeLessThan(0.7)
    expect(plan.requiredSources).toContain('memories:exact')
    expect(plan.requiredSources).toContain('tool:required')
    expect(plan.responseMode).toBe('deterministic')
    expect(shouldClarifyLowConfidenceV2(plan)).toBe(false)
  })

  it('classifies recommendations as closed choices that need backend materialization', () => {
    const plan = planFor('Qu est-ce que j ouvre avec un poulet roti ?', { orchestrationVersion: 'v2' })

    expect(plan.capability).toBe('RECOMMEND')
    expect(plan.recommendationReady).toBe(true)
    expect(plan.responseMode).toBe('closed_choice')
    expect(plan.actionContract).toMatchObject({
      kind: 'closed_recommendation_selection',
      allowedUiActionKinds: ['show_recommendations'],
      requiresBackendMaterialization: true,
    })
    expect(plan.requiredSources).toContain('cellarCandidates:preempted')
  })

  it('keeps vague recommendation requests in clarification mode without an action contract', () => {
    for (const message of [
      'Je cherche un vin pour ce soir',
      "Qu'est-ce que j'ouvre ?",
      'Que boire ce soir ?',
    ]) {
      const plan = planFor(message, { orchestrationVersion: 'v2' })

      expect(plan.capability, message).toBe('RECOMMEND')
      expect(plan.recommendationReady).toBe(false)
      expect(plan.responseMode).toBe('clarification')
      expect(plan.actionContract).toMatchObject({
        kind: 'none',
        allowedUiActionKinds: [],
        requiresBackendMaterialization: false,
      })
      expect(shouldClarifyLowConfidenceV2(plan)).toBe(true)
    }
  })

  it('treats concrete food or style recommendation requests as ready', () => {
    for (const message of [
      'Ce soir pizza maison.',
      "Ce soir c'est raclette",
      'Je cherche un vin pour accompagner une paella.',
      'Je cherche un rouge léger.',
      'Je voudrais un blanc sec.',
    ]) {
      const plan = planFor(message, { orchestrationVersion: 'v2' })

      expect(plan.capability, message).toBe('RECOMMEND')
      expect(plan.recommendationReady).toBe(true)
      expect(plan.responseMode).toBe('closed_choice')
    }
  })

  it('keeps low-confidence action-like turns in clarification mode only for V2', () => {
    const v1 = planFor('photo', { image: 'data:image/png;base64,abc' })
    const v2 = planFor('photo', { image: 'data:image/png;base64,abc', orchestrationVersion: 'v2' })

    expect(v1.capability).toBe('ACTIONS')
    expect(v1.responseMode).toBe('clarification')
    expect(shouldClarifyLowConfidenceV2(v1)).toBe(false)
    expect(shouldClarifyLowConfidenceV2(v2)).toBe(true)
  })

  it('keeps vague action requests in clarification mode without an operational contract', () => {
    const plan = planFor('Je veux ajouter une bouteille', { orchestrationVersion: 'v2' })

    expect(plan.capability).toBe('ACTIONS')
    expect(plan.actionReady).toBe(false)
    expect(plan.responseMode).toBe('clarification')
    expect(plan.actionContract).toMatchObject({
      kind: 'none',
      allowedUiActionKinds: [],
    })
  })

  it('uses workflow mode for action requests with enough payload signal', () => {
    const plan = planFor("J'ai acheté un Sancerre 2023 du Domaine Vacheron", { orchestrationVersion: 'v2' })

    expect(plan.capability).toBe('ACTIONS')
    expect(plan.actionReady).toBe(true)
    expect(plan.responseMode).toBe('workflow')
    expect(plan.actionContract).toMatchObject({
      kind: 'operational_ui_action',
      allowedUiActionKinds: ['prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
    })
  })

  it('does not force operational UI actions when producer identity is missing', () => {
    for (const message of [
      "J'ai acheté 6 bouteilles de Chianti Classico 2021",
      "Au fait j'ai acheté 3 bouteilles de Chablis 2022",
    ]) {
      const plan = planFor(message, { orchestrationVersion: 'v2' })

      expect(plan.capability, message).toBe('ACTIONS')
      expect(plan.actionReady, message).toBe(false)
      expect(plan.responseMode, message).toBe('clarification')
      expect(plan.actionContract.kind, message).toBe('none')
    }
  })

  it('keeps encavage follow-up payloads in workflow mode while collecting info', () => {
    const plan = planFor(
      'Un Sancerre 2023 du Domaine Vacheron',
      { orchestrationVersion: 'v2' },
      { phase: 'collecting_info', taskType: 'encavage' },
    )

    expect(plan.capability).toBe('ACTIONS')
    expect(plan.actionReady).toBe(true)
    expect(plan.confidence).toBeGreaterThanOrEqual(0.7)
    expect(plan.responseMode).toBe('workflow')
  })
})
