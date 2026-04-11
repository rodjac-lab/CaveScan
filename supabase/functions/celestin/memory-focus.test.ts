import { describe, expect, it } from 'vitest'
import { INITIAL_STATE } from './conversation-state'
import { resolveActiveMemoryFocus } from './memory-focus'
import type { TurnInterpretation } from './turn-interpreter'
import type { RequestBody } from './types'

const tastingMemoryTurn: TurnInterpretation = {
  turnType: 'context_switch',
  cognitiveMode: 'tasting_memory',
  shouldAllowUiAction: false,
}

function body(overrides: Partial<RequestBody>): RequestBody {
  return {
    message: '',
    history: [],
    cave: [],
    ...overrides,
  }
}

describe('resolveActiveMemoryFocus', () => {
  it('uses assistant-identified wine context for existing tasting-note lookups', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: 'J’ai déjà fait une note de dégustation, tu peux la retrouver ?',
        history: [
          { role: 'user', text: 'Tu connais ce vin ?' },
          { role: 'assistant', text: 'Je vois une Appellation Test 2018 du Clos Horizon. Tu veux savoir ce que tu en avais pensé ?' },
        ],
      }),
      tastingMemoryTurn,
      INITIAL_STATE,
      'Je vois une Appellation Test 2018 du Clos Horizon. Tu veux savoir ce que tu en avais pensé ?',
    )

    expect(focus).toBe('Clos Horizon')
  })

  it('keeps an existing focus for short rating follow-ups', () => {
    const focus = resolveActiveMemoryFocus(
      body({ message: 'On avait mis combien d’étoiles ?' }),
      tastingMemoryTurn,
      { ...INITIAL_STATE, memoryFocus: 'Rayas' },
    )

    expect(focus).toBe('Rayas')
  })
})
