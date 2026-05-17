import { describe, expect, it } from 'vitest'
import { INITIAL_STATE } from './conversation-state'
import { resolveActiveMemoryFocus } from './memory-focus'
import type { TurnInterpretation } from './turn-interpreter'
import type { RequestBody } from './types'

const tastingMemoryTurn: TurnInterpretation = {
  turnType: 'context_switch',
  cognitiveMode: 'tasting_memory',
  shouldAllowUiAction: false,
}

function body(overrides: Partial<RequestBody>): RequestBody {
  return {
    message: '',
    history: [],
    cave: [],
    ...overrides,
  }
}

describe('resolveActiveMemoryFocus', () => {
  it('uses assistant-identified wine context for existing tasting-note lookups', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: 'J’ai déjà fait une note de dégustation, tu peux la retrouver ?',
        history: [
          { role: 'user', text: 'Tu connais ce vin ?' },
          { role: 'assistant', text: 'Je vois une Appellation Test 2018 du Clos Horizon. Tu veux savoir ce que tu en avais pensé ?' },
        ],
      }),
      tastingMemoryTurn,
      INITIAL_STATE,
      'Je vois une Appellation Test 2018 du Clos Horizon. Tu veux savoir ce que tu en avais pensé ?',
    )

    expect(focus).toBe('Clos Horizon')
  })

  it('keeps an existing focus for short rating follow-ups', () => {
    const focus = resolveActiveMemoryFocus(
      body({ message: 'On avait mis combien d’étoiles ?' }),
      tastingMemoryTurn,
      { ...INITIAL_STATE, memoryFocus: 'Rayas' },
    )

    expect(focus).toBe('Rayas')
  })

  it('refreshes an older focus from the immediate assistant answer before a rating follow-up', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: "On avait mis combien d'étoiles ?",
        history: [
          { role: 'user', text: 'Tu te souviens de la soirée vin du 26 février ?' },
          { role: 'assistant', text: 'Il y avait aussi le Pedro Ximenez 1986 en digestif.' },
          { role: 'user', text: 'Et le Rayas, il était comment ?' },
          { role: 'assistant', text: "Le Rayas blanc 1998 : 4/5, encore très jeune, pas ton meilleur Rayas à date." },
        ],
      }),
      tastingMemoryTurn,
      { ...INITIAL_STATE, memoryFocus: 'Pedro Ximenez' },
      "Le Rayas blanc 1998 : 4/5, encore très jeune, pas ton meilleur Rayas à date.",
    )

    expect(focus).toBe('Rayas')
  })

  it('extracts direct tasting focus only when the message carries tasting evidence', () => {
    const focus = resolveActiveMemoryFocus(
      body({ message: "Tu te souviens du Gangloff qu'on a bu ?" }),
      tastingMemoryTurn,
      INITIAL_STATE,
    )

    expect(focus).toBe('Gangloff')
  })

  it('keeps a multi-token producer focus with particles', () => {
    const focus = resolveActiveMemoryFocus(
      body({ message: "Tu te souviens du Grange des Pères qu'on a bu le 26 février ?" }),
      tastingMemoryTurn,
      INITIAL_STATE,
    )

    expect(focus).toBe('Grange des Pères')
  })

  it('does not turn a wine mentioned by someone else into a tasting focus', () => {
    const focus = resolveActiveMemoryFocus(
      body({ message: "Tu te souviens du Gangloff dont m'a parlé Marc ?" }),
      tastingMemoryTurn,
      INITIAL_STATE,
    )

    expect(focus).toBeNull()
  })

  it('does not infer a follow-up focus from an ambiguous previous user turn', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: "C'était quoi comme millésime déjà ?",
        history: [
          { role: 'user', text: "Tu te souviens du Gangloff dont m'a parlé Marc ?" },
          { role: 'assistant', text: "Je peux regarder, mais je ne sais pas encore si tu parles d'une dégustation à toi ou d'un conseil de Marc." },
        ],
      }),
      tastingMemoryTurn,
      INITIAL_STATE,
      "Je peux regarder, mais je ne sais pas encore si tu parles d'une dégustation à toi ou d'un conseil de Marc.",
    )

    expect(focus).toBeNull()
  })

  it('does not infer a focus from pronominal fragments in an assistant clarification', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: "C'était quoi comme millésime déjà ?",
        history: [
          { role: 'user', text: "Tu te souviens du Gangloff dont m'a parlé Marc ?" },
          { role: 'assistant', text: "2010 — un grand millésime en Côte Rôtie. C'est celui que tu avais adoré chez Marc." },
        ],
      }),
      tastingMemoryTurn,
      INITIAL_STATE,
      "2010 — un grand millésime en Côte Rôtie. C'est celui que tu avais adoré chez Marc.",
    )

    expect(focus).toBeNull()
  })

  it('keeps the previous user focus instead of drifting to a region in the assistant answer', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: "C'était quoi comme millésime déjà ?",
        history: [
          { role: 'user', text: "Tu te souviens du Gangloff qu'on a bu ?" },
          { role: 'assistant', text: 'Grand millésime en Rhône Nord, sombre et profond.' },
        ],
      }),
      tastingMemoryTurn,
      { ...INITIAL_STATE, memoryFocus: 'Gangloff' },
      'Grand millésime en Rhône Nord, sombre et profond.',
    )

    expect(focus).toBe('Gangloff')
  })

  it('does not extract sentence glue from an assistant miss', () => {
    const focus = resolveActiveMemoryFocus(
      body({
        message: "C'était quoi comme millésime déjà ?",
        history: [
          { role: 'user', text: "Tu te souviens du Grange des Pères qu'on a bu le 26 février ?" },
          { role: 'assistant', text: "Je n'ai pas retrouvé cette dégustation. Soit je l'ai oubliée, soit elle n'a pas été loggée." },
        ],
      }),
      tastingMemoryTurn,
      { ...INITIAL_STATE, memoryFocus: 'Grange des Pères' },
      "Je n'ai pas retrouvé cette dégustation. Soit je l'ai oubliée, soit elle n'a pas été loggée.",
    )

    expect(focus).toBe('Grange des Pères')
  })
})
