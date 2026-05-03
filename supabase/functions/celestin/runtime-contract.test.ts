import { beforeAll, describe, expect, it } from 'vitest'
import type { RoutingIntent } from './turn-interpreter'

Object.defineProperty(globalThis, 'Deno', {
  value: {
    env: {
      get: () => undefined,
    },
  },
  configurable: true,
})

let canAcceptRecommendationClarification: (input: {
  userMessage: string
  routingIntent: RoutingIntent
  assistantMessage: string
}) => boolean

beforeAll(async () => {
  const runtime = await import('./runtime')
  canAcceptRecommendationClarification = runtime.canAcceptRecommendationClarification
}, 10000)

describe('recommendation response contract', () => {
  it('accepts clarification only for vague recommendation requests', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour ce soir.',
      routingIntent: 'recommendation_request',
      assistantMessage: "Tu manges quoi ?",
    })).toBe(true)
  })

  it('accepts useful dish clarifications even when the user already gave a dish', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'C est une paella plutôt fruits de mer ou plutôt viande ?',
    })).toBe(true)

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner un poulet rôti.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu le prépares plutôt nature ou avec une sauce crémée ?',
    })).toBe(true)
  })

  it('rejects clarifications that ask the user to inspect their cellar', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu as des blancs ou des rouges légers qui traînent ?',
    })).toBe(false)

    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un vin pour accompagner un poulet rôti.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu as quoi en cave ?',
    })).toBe(false)
  })

  it('rejects clarification when the user already gave a style constraint', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Je cherche un rouge pour accompagner une paella.',
      routingIntent: 'recommendation_request',
      assistantMessage: 'Tu préfères un blanc ou un rouge ?',
    })).toBe(false)
  })

  it('rejects clarification on recommendation refinements', () => {
    expect(canAcceptRecommendationClarification({
      userMessage: 'Tu en as d autres, plutôt en rouge ?',
      routingIntent: 'recommendation_refinement',
      assistantMessage: 'C est pour quel plat ?',
    })).toBe(false)
  })
})
