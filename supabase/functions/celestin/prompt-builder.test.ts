import { describe, expect, it } from 'vitest'
import { buildCelestinSystemPrompt } from './prompt-builder'

const MODES = [
  'greeting',
  'social',
  'wine_conversation',
  'tasting_memory',
  'restaurant_assistant',
  'cellar_assistant',
] as const

describe('buildCelestinSystemPrompt', () => {
  for (const mode of MODES) {
    it(`matches snapshot for mode=${mode}`, () => {
      const prompt = buildCelestinSystemPrompt(mode)
      expect(prompt).toMatchSnapshot()
    })
  }

  it('default (no mode) matches cellar_assistant snapshot', () => {
    const defaultPrompt = buildCelestinSystemPrompt(undefined)
    const cellarPrompt = buildCelestinSystemPrompt('cellar_assistant')
    expect(defaultPrompt).toBe(cellarPrompt)
  })
})
