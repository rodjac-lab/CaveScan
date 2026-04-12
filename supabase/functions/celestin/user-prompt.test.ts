import { describe, expect, it } from 'vitest'
import { INITIAL_STATE } from './conversation-state'
import { buildUserPrompt } from './user-prompt'
import type { RequestBody } from './types'
import type { TurnInterpretation } from './turn-interpreter'

function body(message: string): RequestBody {
  return {
    message,
    history: [],
    cave: [],
    context: {
      dayOfWeek: 'dimanche',
      season: 'printemps',
    },
  }
}

describe('buildUserPrompt', () => {
  it('makes exploratory recommendation pivots standalone and forbids previous dish reuse', () => {
    const interpretation: TurnInterpretation = {
      turnType: 'context_switch',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    }

    const prompt = buildUserPrompt(
      body('Et si je veux plutôt un italien ?'),
      interpretation,
      { ...INITIAL_STATE, phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' },
      'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
      'exploratory_reco_pivot',
    )

    expect(prompt).toContain('PIVOT EXPLORATOIRE')
    expect(prompt).toContain('question autonome')
    expect(prompt).toContain('Ne mentionne PAS le plat precedent')
    expect(prompt).toContain('ne declenche PAS de ui_action')
  })

  it('asks for immediate cards on direct recommendation requests', () => {
    const interpretation: TurnInterpretation = {
      turnType: 'task_request',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
      inferredTaskType: 'recommendation',
    }

    const prompt = buildUserPrompt(
      body("Ce soir c'est pizza"),
      interpretation,
      INITIAL_STATE,
      undefined,
      'recommendation_request',
    )

    expect(prompt).toContain('RECOMMANDATION IMMEDIATE')
    expect(prompt).toContain('Utilise show_recommendations maintenant')
    expect(prompt).toContain('Ne reponds pas seulement par des styles generiques')
  })
})
