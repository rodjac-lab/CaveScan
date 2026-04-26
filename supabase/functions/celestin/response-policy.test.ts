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

  it('keeps the first exclamation and demotes the rest to periods', () => {
    const result = applyResponsePolicy({
      message: "L'Italie, c'est vaste ! Tu cherches quoi comme style ? Donne-moi une piste !",
      action_chips: [],
    }, wineQuestion)

    expect(result.message).toBe("L'Italie, c'est vaste ! Tu cherches quoi comme style ? Donne-moi une piste.")
  })

  it('does not touch messages with at most one exclamation', () => {
    const result = applyResponsePolicy({
      message: 'Belle découverte ! Le Bandol va bien avec ta côte de bœuf.',
      action_chips: [],
    }, wineQuestion)

    expect(result.message).toBe('Belle découverte ! Le Bandol va bien avec ta côte de bœuf.')
  })

  it('limits exclamations across multiple sentences', () => {
    const result = applyResponsePolicy({
      message: 'Magnifique ! C\'est top ! Vraiment !',
      action_chips: [],
    }, wineQuestion)

    expect(result.message).toBe('Magnifique ! C\'est top. Vraiment.')
  })
})
