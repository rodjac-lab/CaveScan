import { describe, expect, it } from 'vitest'
import { computeNextState, INITIAL_STATE, type ConversationState } from './conversation-state'
import { interpretTurn, interpretTurnWithRouting } from './turn-interpreter'
import type { RoutingIntent, TurnRoutingResult } from './turn-types'

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    ...INITIAL_STATE,
    ...overrides,
  }
}

interface RoutingExpectation {
  id: string
  message: string
  expectedWinner: RoutingIntent
  expectedMode: TurnRoutingResult['interpretation']['cognitiveMode']
  expectedUiAction: boolean
  conversationalIntent?: string | null
  lastAssistantText?: string
  state?: Partial<ConversationState>
}

function expectRoute(testCase: RoutingExpectation): TurnRoutingResult {
  const result = interpretTurnWithRouting(
    testCase.message,
    false,
    state(testCase.state),
    testCase.lastAssistantText,
    testCase.conversationalIntent,
  )

  expect(result.routing.winner, testCase.id).toBe(testCase.expectedWinner)
  expect(result.interpretation.cognitiveMode, testCase.id).toBe(testCase.expectedMode)
  expect(result.interpretation.shouldAllowUiAction, testCase.id).toBe(testCase.expectedUiAction)
  return result
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

  it('routes existing tasting-note lookups to memory, not tasting creation', () => {
    const result = interpretTurn("J'ai déjà fait une note de dégustation, tu peux la retrouver ?", false, state())

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'tasting_memory',
      shouldAllowUiAction: false,
    })
  })

  it('routes broad tasting count questions to tasting memory', () => {
    const result = interpretTurnWithRouting(
      "Tu peux me dire combien de dégustations de champagne j'ai déjà fait ?",
      false,
      state(),
    )

    expect(result.routing.winner).toBe('tasting_log')
    expect(result.interpretation).toEqual({
      turnType: 'task_request',
      cognitiveMode: 'tasting_memory',
      shouldAllowUiAction: true,
      inferredTaskType: 'tasting',
    })
  })

  it('routes accented encavage phrasing to cellar_assistant', () => {
    const result = interpretTurn("J'ai acheté du vin aujourd'hui", false, state())

    expect(result).toEqual({
      turnType: 'task_request',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
      inferredTaskType: 'encavage',
    })
  })

  it('keeps short follow-ups attached to the tasting memory context', () => {
    const result = interpretTurn(
      "Et le Rayas, c'etait comment ?",
      false,
      state(),
      "On avait aussi degusté le Châteauneuf-du-Pape 1998 du Château Rayas, que tu avais jugé encore un peu jeune.",
    )

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'tasting_memory',
      shouldAllowUiAction: false,
    })
  })

  it('keeps rating follow-ups in tasting memory mode', () => {
    const result = interpretTurn(
      "On avait mis combien d'etoiles ?",
      false,
      state(),
      "Le Rayas 1998, tu l'avais trouve excellent mais encore un peu jeune.",
    )

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

  it('keeps memory-guided recommendation follow-ups in recommendation mode', () => {
    const result = interpretTurn(
      "Quelque chose dans l'esprit de ce qu'on avait aimé avec l'osso bucco.",
      false,
      state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
      "Je te propose quelques rouges pour ce soir.",
    )

    expect(result).toEqual({
      turnType: 'task_continue',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
    })
  })

  it('treats exploratory pivots after a recommendation as conversational, not as an automatic new recommendation batch', () => {
    const result = interpretTurn(
      'Et si je veux plutôt un italien ?',
      false,
      state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
      'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
    )

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    })
  })

  it('keeps recommendation refinement available from history when local state was reset', () => {
    const result = interpretTurn(
      'Tu en as plutôt en blanc ?',
      false,
      state(),
      'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
    )

    expect(result).toEqual({
      turnType: 'task_continue',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
    })
  })

  it('recognizes recommendation refinement from natural assistant wording, not only card markers', () => {
    const result = interpretTurnWithRouting(
      'Tu en as d autres, plutot en blanc ?',
      false,
      state(),
      'Pour une paella, je partirais sur un blanc tendu, un rose structure ou un rouge tres leger. Voici trois pistes pour toi.',
    )

    expect(result.routing.winner).toBe('recommendation_refinement')
    expect(result.interpretation).toEqual({
      turnType: 'task_continue',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
    })
  })

  it('treats a wine question with a photo as conversation, not automatic encavage', () => {
    const result = interpretTurn('Tu connais ce vin ?', true, state())

    expect(result).toEqual({
      turnType: 'smalltalk',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    })
  })

  it('explains exploratory pivots after recommendations with candidates and winner', () => {
    const result = interpretTurnWithRouting(
      'Et si je veux plutôt un italien ?',
      false,
      state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
      'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
    )

    expect(result.routing.scope).toBe('post_task_ack')
    expect(result.routing.winner).toBe('exploratory_reco_pivot')
    expect(result.routing.reasons).toContain('exploratory_pivot_after_recommendation')
    expect(result.routing.candidates.map((candidate) => candidate.intent)).toContain('recommendation_refinement')
    expect(result.interpretation).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    })
  })

  it('explains photo questions as wine conversation over image action', () => {
    const result = interpretTurnWithRouting('Tu connais ce vin ?', true, state())

    expect(result.routing.scope).toBe('image')
    expect(result.routing.winner).toBe('wine_question')
    expect(result.routing.candidates.map((candidate) => candidate.intent)).toContain('image_cellar_action')
    expect(result.interpretation).toEqual({
      turnType: 'smalltalk',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    })
  })
})

describe('conversationalIntent arbitrage', () => {
  it('forces "Choisis dans ma cave" to recommendation when classifier says recommendation', () => {
    const result = interpretTurnWithRouting(
      'Choisis dans ma cave',
      false,
      state(),
      undefined,
      'recommendation',
    )

    expect(result.routing.winner).toBe('recommendation_request')
    expect(result.interpretation).toEqual({
      turnType: 'task_request',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
      inferredTaskType: 'recommendation',
    })
  })

  it('falls back to regex recommendation for "Choisis dans ma cave" when classifier is null', () => {
    const result = interpretTurnWithRouting(
      'Choisis dans ma cave',
      false,
      state(),
      undefined,
      null,
    )

    expect(result.routing.winner).toBe('recommendation_request')
    expect(result.interpretation.shouldAllowUiAction).toBe(true)
    expect(result.interpretation.inferredTaskType).toBe('recommendation')
  })

  it('keeps factual inventory query on cellar_lookup when classifier says inventory_lookup', () => {
    const result = interpretTurnWithRouting(
      "Combien de bouteilles j'ai en cave ?",
      false,
      state(),
      undefined,
      'inventory_lookup',
    )

    expect(result.routing.winner).toBe('cellar_lookup')
    expect(result.interpretation).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: false,
    })
  })

  it('routes pure recommendation phrasing when classifier agrees', () => {
    const result = interpretTurnWithRouting(
      'Trouve-moi un vin pour ce soir',
      false,
      state(),
      undefined,
      'recommendation',
    )

    expect(result.routing.winner).toBe('recommendation_request')
    expect(result.interpretation.shouldAllowUiAction).toBe(true)
    expect(result.interpretation.inferredTaskType).toBe('recommendation')
  })

  it('routes memory references when classifier says memory_lookup', () => {
    const result = interpretTurnWithRouting(
      'Tu te souviens de la derniere fois ?',
      false,
      state(),
      undefined,
      'memory_lookup',
    )

    expect(result.routing.winner).toBe('memory_lookup')
    expect(result.interpretation).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'tasting_memory',
      shouldAllowUiAction: false,
    })
  })

  it('makes recommendation win over a competing memory regex signal', () => {
    // "on avait bu" matches MEMORY regex. Classifier disambiguates toward recommendation.
    const result = interpretTurnWithRouting(
      "Sers-moi quelque chose dans l'esprit de ce qu'on avait bu la derniere fois",
      false,
      state(),
      undefined,
      'recommendation',
    )

    expect(result.routing.winner).toBe('recommendation_request')
    expect(result.interpretation.shouldAllowUiAction).toBe(true)
  })

  it('clears intent signals on smalltalk and leaves contextual routing fluid', () => {
    // "parle-moi" matches WINE_CULTURE — routing should still land on wine_question.
    const result = interpretTurnWithRouting(
      'Parle-moi du Savagnin',
      false,
      state(),
      undefined,
      'smalltalk',
    )

    expect(result.routing.winner).toBe('wine_question')
    expect(result.interpretation.cognitiveMode).toBe('wine_conversation')
    expect(result.interpretation.shouldAllowUiAction).toBe(false)
  })

  it('ignores unknown classifier values and falls back to regex recommendation', () => {
    const result = interpretTurnWithRouting(
      'Choisis dans ma cave',
      false,
      state(),
      undefined,
      'garbage_value',
    )

    expect(result.routing.winner).toBe('recommendation_request')
    expect(result.interpretation.shouldAllowUiAction).toBe(true)
  })

  it('still honours contextual signals (refinement) over the classifier intent', () => {
    // Classifier says smalltalk, but a short refinement after a reco must still pivot to task_continue.
    const result = interpretTurnWithRouting(
      'Tu en as plutôt en blanc ?',
      false,
      state(),
      'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
      'smalltalk',
    )

    expect(result.routing.winner).toBe('recommendation_refinement')
    expect(result.interpretation.shouldAllowUiAction).toBe(true)
  })
})

describe('routing audit matrix', () => {
  const recentRecommendationState: Partial<ConversationState> = {
    phase: 'post_task_ack',
    taskType: 'recommendation',
    lastUiActionKind: 'show_recommendations',
  }
  const recentRecommendationText = 'Je te propose trois pistes pour la pizza. [Vins proposés : ...]'

  const singleTurnCases: RoutingExpectation[] = [
    {
      id: 'inventory-count-all',
      message: "Combien de bouteilles j'ai en cave ?",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'inventory-count-inverted-word-order',
      message: "J'ai combien de bouteilles de Chassagne ?",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'inventory-existence-appellation',
      message: "Est-ce que j'ai du Chassagne en cave ?",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'inventory-domain-list',
      message: "Quels vins de Dujac j'ai ?",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'inventory-location',
      message: "Qu'est-ce que j'ai dans la cave de Bourgogne ?",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'inventory-zone-short',
      message: 'Dans ma cave de Paris',
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'wine-culture-chassagne-color',
      message: "Chassagne, c'est plutôt blanc ou rouge ?",
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'wine-culture-chassagne-fame',
      message: 'Chassagne est plus connu pour les rouges ou les blancs ?',
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'wine-culture-barolo-barbaresco',
      message: "C'est quoi la difference entre Barolo et Barbaresco ?",
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'wine-culture-volatile-acidity',
      message: "Pourquoi certains vins sentent le vinaigre ?",
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'wine-culture-serving-temperature',
      message: 'A quelle temperature je sers un pinot noir ?',
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'recommendation-food',
      message: 'Un rouge leger pour une pizza maison',
      expectedWinner: 'recommendation_request',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'recommendation-personal-cellar',
      message: 'Choisis un rouge leger dans ma cave pour Marc',
      expectedWinner: 'recommendation_request',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'recommendation-open-bottle',
      message: "Qu'est-ce qu'on ouvre avec un poulet roti ?",
      expectedWinner: 'recommendation_request',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'recommendation-memory-guided',
      message: "Quelque chose qui rappelle le restaurant a Rome",
      expectedWinner: 'memory_guided_recommendation',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'memory-rome',
      message: 'Tu te souviens du restaurant a Rome ?',
      expectedWinner: 'memory_lookup',
      expectedMode: 'tasting_memory',
      expectedUiAction: false,
    },
    {
      id: 'memory-with-friend',
      message: "Qu'est-ce qu'on avait bu avec Marc la derniere fois ?",
      expectedWinner: 'memory_lookup',
      expectedMode: 'tasting_memory',
      expectedUiAction: false,
    },
    {
      id: 'memory-rating',
      message: "J'avais mis combien d'etoiles au Rayas ?",
      expectedWinner: 'memory_lookup',
      expectedMode: 'tasting_memory',
      expectedUiAction: false,
    },
    {
      id: 'tasting-count',
      message: "Combien de degustations de champagne j'ai faites ?",
      expectedWinner: 'tasting_log',
      expectedMode: 'tasting_memory',
      expectedUiAction: true,
    },
    {
      id: 'tasting-create',
      message: "J'ai bu un beau Volnay hier soir, note ca",
      expectedWinner: 'tasting_log',
      expectedMode: 'tasting_memory',
      expectedUiAction: true,
    },
    {
      id: 'encavage-buy',
      message: "J'ai achete trois bouteilles de Chablis",
      expectedWinner: 'encavage_request',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'encavage-received',
      message: "J'ai recu ma commande de vin",
      expectedWinner: 'encavage_request',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'social-thanks',
      message: 'Merci',
      expectedWinner: 'social_ack',
      expectedMode: 'social',
      expectedUiAction: false,
    },
    {
      id: 'social-cancel',
      message: 'Laisse tomber',
      expectedWinner: 'task_cancel',
      expectedMode: 'social',
      expectedUiAction: false,
    },
    {
      id: 'small-contextless-short',
      message: 'Et sinon ?',
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'classifier-inventory-over-regex',
      message: 'Mes chassagne ?',
      conversationalIntent: 'inventory_lookup',
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    },
    {
      id: 'classifier-memory-over-regex',
      message: 'Rome',
      conversationalIntent: 'memory_lookup',
      expectedWinner: 'memory_lookup',
      expectedMode: 'tasting_memory',
      expectedUiAction: false,
    },
    {
      id: 'classifier-smalltalk-clears-cave-word',
      message: 'Parle-moi du mot cave en geologie',
      conversationalIntent: 'smalltalk',
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    },
    {
      id: 'recent-reco-refinement-white',
      message: 'Et en blanc ?',
      state: recentRecommendationState,
      lastAssistantText: recentRecommendationText,
      expectedWinner: 'recommendation_refinement',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
    {
      id: 'recent-reco-memory-guided',
      message: "Dans l'esprit de Rome",
      state: recentRecommendationState,
      lastAssistantText: recentRecommendationText,
      expectedWinner: 'memory_guided_recommendation',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    },
  ]

  it.each(singleTurnCases)('$id', (testCase) => {
    expectRoute(testCase)
  })

  it('keeps a cellar lookup thread in cellar mode across short follow-ups', () => {
    expectRoute({
      id: 'cellar-thread-turn-1',
      message: "J'ai combien de bouteilles de Chassagne ?",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    })

    expectRoute({
      id: 'cellar-thread-turn-2',
      message: 'Et en blanc ?',
      lastAssistantText: "Tu as 3 bouteilles de Chassagne en cave, dont 2 blancs.",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    })

    expectRoute({
      id: 'cellar-thread-turn-3',
      message: "Dans l'autre maison ?",
      lastAssistantText: "Tu as 3 bouteilles de Chassagne en cave, dont 2 blancs.",
      expectedWinner: 'cellar_lookup',
      expectedMode: 'cellar_assistant',
      expectedUiAction: false,
    })
  })

  it('keeps wine culture correction out of cellar mode', () => {
    expectRoute({
      id: 'culture-thread-turn-1',
      message: "Chassagne, c'est plutôt blanc ou rouge ?",
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    })

    expectRoute({
      id: 'culture-thread-turn-2',
      message: 'Tu es sur ? Je crois que c est surtout blanc.',
      lastAssistantText: 'Chassagne est surtout connu pour les rouges.',
      expectedWinner: 'wine_question',
      expectedMode: 'wine_conversation',
      expectedUiAction: false,
    })
  })

  it('keeps recommendation refinements actionable across a realistic multi-turn exchange', () => {
    let currentState = state()

    const first = interpretTurnWithRouting('Un rouge leger pour Marc avec une pizza maison', false, currentState)
    expect(first.routing.winner).toBe('recommendation_request')
    currentState = computeNextState(
      currentState,
      first.interpretation.turnType,
      true,
      'show_recommendations',
      first.interpretation.inferredTaskType,
    )

    const second = interpretTurnWithRouting('Plutot dans ma cave de Bourgogne', false, currentState, recentRecommendationText)
    expect(second.routing.winner).toBe('recommendation_refinement')
    expect(second.interpretation.cognitiveMode).toBe('cellar_assistant')

    const third = interpretTurnWithRouting('Et en blanc ?', false, currentState, recentRecommendationText)
    expect(third.routing.winner).toBe('recommendation_refinement')
    expect(third.interpretation.shouldAllowUiAction).toBe(true)
  })

  it('separates emotional memory lookup from memory-guided recommendation', () => {
    expectRoute({
      id: 'emotional-memory-direct',
      message: 'Tu te souviens du restaurant a Rome ?',
      expectedWinner: 'memory_lookup',
      expectedMode: 'tasting_memory',
      expectedUiAction: false,
    })

    expectRoute({
      id: 'emotional-memory-for-reco',
      message: 'Trouve-moi un italien qui rappelle ce restaurant a Rome',
      expectedWinner: 'recommendation_request',
      expectedMode: 'cellar_assistant',
      expectedUiAction: true,
    })
  })
})
