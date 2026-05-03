import { describe, expect, it } from 'vitest'

Object.defineProperty(globalThis, 'Deno', {
  value: {
    env: {
      get: () => undefined,
    },
  },
  configurable: true,
})

describe('recommendation response contract', () => {
  it('accepts clarification only for vague recommendation requests', async () => {
    const { canAcceptRecommendationClarification } = await import('./runtime')

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour ce soir.',
      routingIntent: 'recommendation_request',
      assistantMessage: "Tu manges quoi ?",
    })).toBe(true)
  })

  it('rejects clarification when the user already gave a dish', async () => {
    const { canAcceptRecommendationClarification } = await import('./runtime')

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu as des blancs ou des rouges légers qui traînent ?',
    })).toBe(false)

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner un poulet rôti.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu préfères un blanc ou un rouge ?',
    })).toBe(false)
  })

  it('rejects clarification on recommendation refinements', async () => {
    const { canAcceptRecommendationClarification } = await import('./runtime')

    expect(canAcceptRecommendationClarification({
      userMessage: 'Tu en as d autres, plutôt en rouge ?',
      routingIntent: 'recommendation_refinement',
      assistantMessage: 'C est pour quel plat ?',
    })).toBe(false)
  })
})
