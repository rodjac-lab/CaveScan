import { describe, expect, it } from 'vitest'
import { canResolveRecommendationUiAction, ensureRecommendationUiAction } from './recommendation-action'
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
  it('builds cards from structured recommendation selection before text matching', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Je partirais sur un blanc tendu de ta cave.',
        recommendation_selection: [{
          bottle_id: 'abc12345',
          name: 'Domaine Test Les Blancs',
          reason: 'La tension du Sancerre ira mieux que les rouges trop tanniques.',
          badge: 'Accord parfait',
        }],
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
      badge: 'Accord parfait',
      reason: 'La tension du Sancerre ira mieux que les rouges trop tanniques.',
      color: 'blanc',
    })
  })

  it('resolves structured recommendation selection by name when bottle_id is missing', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Le Sancerre est le bon axe.',
        recommendation_selection: [{
          bottle_id: null,
          name: 'Domaine Test Les Blancs Sancerre 2020',
          reason: 'Nom resolu sans id.',
          badge: null,
        }],
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

    expect(response.ui_action?.payload.cards[0].bottle_id).toBe('abc12345')
    expect(response.ui_action?.payload.cards[0].reason).toBe('Nom resolu sans id.')
  })

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

  it('reports whether a recommendation action can be resolved before provider acceptance', () => {
    expect(canResolveRecommendationUiAction({
      response: {
        message: 'Le Sancerre 2020 Domaine Test Les Blancs est le bon choix ici.',
        ui_action: null,
        action_chips: null,
      },
      resolvedSources: sources(),
    })).toBe(true)
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

  it('prefers structured selection over model-built recommendation cards', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Voici le bon choix.',
        recommendation_selection: [{
          bottle_id: 'abc12345',
          name: 'Domaine Test Les Blancs',
          reason: 'Selection structuree resolue par le backend.',
          badge: 'Accord parfait',
        }],
        ui_action: {
          kind: 'show_recommendations',
          payload: {
            cards: [{
              bottle_id: 'model-card',
              name: 'Carte modele',
              appellation: 'App modele',
              badge: 'De ta cave',
              reason: 'Carte construite par le modele.',
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
    expect(response.ui_action?.payload.cards[0]).toMatchObject({
      bottle_id: 'abc12345',
      name: 'Domaine Test Les Blancs',
      appellation: 'Sancerre',
      millesime: 2020,
      reason: 'Selection structuree resolue par le backend.',
      color: 'blanc',
    })
  })

  it('filters hard pairing color mismatches from model cards', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Voici deux options.',
        ui_action: {
          kind: 'show_recommendations',
          payload: {
            cards: [
              {
                bottle_id: 'red',
                name: 'Morgon',
                appellation: 'Morgon',
                badge: 'De ta cave',
                reason: 'Rouge leger.',
                color: 'rouge',
              },
              {
                bottle_id: 'white',
                name: 'Sancerre',
                appellation: 'Sancerre',
                badge: 'Accord parfait',
                reason: 'Blanc tendu.',
                color: 'blanc',
              },
            ],
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
      userMessage: 'Ce soir sushi',
    })

    expect(response.ui_action?.payload.cards).toHaveLength(1)
    expect(response.ui_action?.payload.cards[0].color).toBe('blanc')
  })

  it('keeps a light red recommendation when the user explicitly asks red for sushi', () => {
    const response = ensureRecommendationUiAction({
      response: {
        message: 'Si tu veux tenter le rouge sur sushi, je viserais tres leger.',
        ui_action: {
          kind: 'show_recommendations',
          payload: {
            cards: [
              {
                bottle_id: 'red',
                name: 'Morgon',
                appellation: 'Morgon',
                badge: 'Audacieux',
                reason: 'Rouge leger, peu tannique.',
                color: 'rouge',
              },
            ],
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
      userMessage: "J'en ai marre des blancs. Propose-moi un rouge leger sur mes sushis.",
    })

    expect(response.ui_action?.payload.cards).toHaveLength(1)
    expect(response.ui_action?.payload.cards[0].color).toBe('rouge')
  })
})
