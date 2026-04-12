import { describe, expect, it } from 'vitest'
import { applyResponsePolicy } from './response-policy'
import type { TurnInterpretation } from './turn-interpreter'

const wineQuestion: TurnInterpretation = {
  turnType: 'smalltalk',
  cognitiveMode: 'wine_conversation',
  shouldAllowUiAction: false,
}

describe('applyResponsePolicy', () => {
  it('removes banned theatrical openers from provider messages', () => {
    const result = applyResponsePolicy({
      message: 'Ah non, pas du tout ! Le Savagnin reste distinct.',
      action_chips: [],
    }, wineQuestion)

    expect(result.message).toBe('non, pas du tout ! Le Savagnin reste distinct.')
  })

  it('keeps concrete messages unchanged', () => {
    const result = applyResponsePolicy({
      message: 'Le Savagnin est un cépage du Jura.',
      action_chips: [],
    }, wineQuestion)

    expect(result.message).toBe('Le Savagnin est un cépage du Jura.')
  })
})
