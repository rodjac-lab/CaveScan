import { describe, expect, it } from 'vitest'
import { ensureRecommendationUiAction } from './recommendation-action'
import type { ResolvedContextSources } from './source-resolver'

function sources(overrides: Partial<ResolvedContextSources> = {}): ResolvedContextSources {
  return {
    requirements: [],
    cave: {
      level: 'shortlist',
      totalBottles: 3,
      referenceCount: 3,
      bottles: [
        {
          id: 'abc12345',
          domaine: 'Domaine Test',
          cuvee: 'Les Blancs',
          appellation: 'Sancerre',
          millesime: 2020,
          couleur: 'blanc',
          character: 'Tendu et salin.',
          quantity: 1,
          food_pairings: ['poisson', 'volaille'],
        },
        {
          id: 'dup12345',
          domaine: 'Domaine Test',
          cuvee: 'Les Blancs',
          appellation: 'Sancerre',
          millesime: 2020,
          couleur: 'blanc',
          character: 'Duplicate row.',
          quantity: 1,
          food_pairings: ['apéritif'],
        },
        {
          id: 'def67890',
          domaine: 'Domaine Rouge',
          cuvee: null,
          appellation: 'Bourgogne',
          millesime: 2021,
          couleur: 'rouge',
          character: null,
          quantity: 2,
          food_pairings: null,
        },
      ],
    },
    zones: [],
    ...overrides,
  }
}

describe('ensureRecommendationUiAction', () => {
  it('adds cards for bottles explicitly recommended by the model text', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Je partirais sur le Sancerre 2020 Domaine Test Les Blancs : il a la tension qu il faut.',
        ui_action: null,
        action_chips: null,
      },
      interpretation: {
        turnType: 'task_request',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: true,
        inferredTaskType: 'recommendation',
      },
      routingIntent: 'recommendation_request',
      resolvedSources: sources(),
    })

    expect(response.ui_action?.kind).toBe('show_recommendations')
    expect(response.ui_action?.payload.cards).toHaveLength(1)
    expect(response.ui_action?.payload.cards[0]).toMatchObject({
      bottle_id: 'abc12345',
      name: 'Domaine Test Les Blancs',
      appellation: 'Sancerre',
      color: 'blanc',
      reason: 'Je partirais sur le Sancerre 2020 Domaine Test Les Blancs : il a la tension qu il faut.',
    })
  })

  it('does not fabricate local shortlist cards when the model did not name bottles', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Je vais chercher dans ta cave ce qui marche vraiment bien la-dessus.',
        ui_action: null,
        action_chips: null,
      },
      interpretation: {
        turnType: 'task_request',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: true,
        inferredTaskType: 'recommendation',
      },
      routingIntent: 'recommendation_request',
      resolvedSources: sources(),
    })

    expect(response.ui_action).toBeNull()
  })

  it('does not add cards on non-recommendation routes', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'De rien.',
        ui_action: null,
        action_chips: null,
      },
      interpretation: {
        turnType: 'social_ack',
        cognitiveMode: 'social',
        shouldAllowUiAction: false,
      },
      routingIntent: 'social_ack',
      resolvedSources: sources(),
    })

    expect(response.ui_action).toBeNull()
  })

  it('keeps an existing model action unchanged', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Voici trois pistes.',
        ui_action: {
          kind: 'show_recommendations',
          payload: {
            cards: [{
              bottle_id: 'existing',
              name: 'Existing',
              appellation: 'Existing',
              badge: 'De ta cave',
              reason: 'Existing',
              color: 'rouge',
            }],
          },
        },
        action_chips: null,
      },
      interpretation: {
        turnType: 'task_request',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: true,
        inferredTaskType: 'recommendation',
      },
      routingIntent: 'recommendation_request',
      resolvedSources: sources(),
    })

    expect(response.ui_action?.payload.cards).toHaveLength(1)
    expect(response.ui_action?.payload.cards[0].bottle_id).toBe('existing')
  })
})
