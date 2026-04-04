import { describe, expect, it } from 'vitest'
import { INITIAL_STATE, type ConversationState } from './conversation-state'
import { interpretTurn } from './turn-interpreter'

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    ...INITIAL_STATE,
    ...overrides,
  }
}

describe('interpretTurn', () => {
  it('routes cellar inventory questions to cellar_assistant without ui actions', () => {
    const result = interpretTurn("Salut, j'ai du champagne dans ma cave ?", false, state())

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: false,
    })
  })

  it('keeps cellar follow-ups attached to the cellar context', () => {
    const result = interpretTurn(
      "Et Chartogne-Taillet c'est pas du champagne ?",
      false,
      state(),
      "Non, tu n'as pas de champagne enregistre dans ta cave pour le moment.",
    )

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: false,
    })
  })

  it('keeps tasting memory questions in tasting_memory mode', () => {
    const result = interpretTurn("Tu te souviens du Brunello de l'osso bucco ?", false, state())

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'tasting_memory',
      shouldAllowUiAction: false,
    })
  })

  it('does not leak general wine culture questions into the cellar mode', () => {
    const result = interpretTurn("C'est quoi la difference entre un Barolo et un Barbaresco ?", false, state())

    expect(result).toEqual({
      turnType: 'smalltalk',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    })
  })
})
