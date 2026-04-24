import { describe, expect, it } from 'vitest'
import { INITIAL_STATE, type ConversationState } from './conversation-state'
import { interpretTurn, interpretTurnWithRouting } from './turn-interpreter'

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

  it('routes existing tasting-note lookups to memory, not tasting creation', () => {
    const result = interpretTurn("J'ai déjà fait une note de dégustation, tu peux la retrouver ?", false, state())

    expect(result).toEqual({
      turnType: 'context_switch',
      cognitiveMode: 'tasting_memory',
      shouldAllowUiAction: false,
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

  it('falls back to regex (cellar_lookup) for "Choisis dans ma cave" when classifier is null', () => {
    const result = interpretTurnWithRouting(
      'Choisis dans ma cave',
      false,
      state(),
      undefined,
      null,
    )

    expect(result.routing.winner).toBe('cellar_lookup')
    expect(result.interpretation.shouldAllowUiAction).toBe(false)
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

  it('ignores unknown classifier values and falls back to regex', () => {
    const result = interpretTurnWithRouting(
      'Choisis dans ma cave',
      false,
      state(),
      undefined,
      'garbage_value',
    )

    expect(result.routing.winner).toBe('cellar_lookup')
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
