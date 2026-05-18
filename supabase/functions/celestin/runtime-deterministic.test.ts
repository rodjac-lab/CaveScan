import { describe, expect, it } from 'vitest'
import type { AuthContext } from './auth'
import type { RequestBody } from './types'

Object.defineProperty(globalThis, 'Deno', {
  value: {
    env: {
      get: () => undefined,
    },
  },
  configurable: true,
})

function supabaseMock() {
  const calls: string[] = []

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(table)

        if (table === 'bottles') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [{ quantity: 2, couleur: 'rouge' }, { quantity: 1, couleur: 'blanc' }],
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'zones') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ name: 'Paris' }],
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'celestin_turn_observability') {
          return {
            upsert: async () => ({ error: null }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

function supabaseTastingMock() {
  const calls: string[] = []

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(table)

        if (table === 'bottles') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    { domaine: 'Laherte', cuvee: null, appellation: 'Champagne', millesime: 2018, couleur: 'bulles' },
                    { domaine: 'Domaine A', cuvee: null, appellation: 'Chablis', millesime: 2020, couleur: 'blanc' },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'celestin_turn_observability') {
          return {
            upsert: async () => ({ error: null }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

function supabaseTastingRatingMock() {
  const calls: string[] = []

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(table)

        if (table === 'bottles') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    {
                      domaine: 'Chateau Rayas',
                      cuvee: null,
                      appellation: 'Chateauneuf-du-Pape',
                      millesime: 1998,
                      couleur: 'rouge',
                      country: 'France',
                      region: 'Rhone',
                      rating: 4,
                      drunk_at: '2026-01-10',
                      tasting_note: 'Grand souvenir.',
                    },
                    {
                      domaine: 'Domaine A',
                      cuvee: null,
                      appellation: 'Chablis',
                      millesime: 2020,
                      couleur: 'blanc',
                      country: 'France',
                      region: 'Bourgogne',
                      rating: 5,
                      drunk_at: '2026-01-11',
                      tasting_note: 'Autre note.',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'celestin_turn_observability') {
          return {
            upsert: async () => ({ error: null }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('runCelestinTurn deterministic exact answers', () => {
  it('answers generic cellar bottle counts without calling an LLM provider', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseMock()
    const body: RequestBody = {
      message: 'Combien de bouteilles ai-je en cave ?',
      history: [],
      cave: [],
      contextStrategy: 'backend_managed',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Tu as 3 bouteilles en cave, sur 2 references.')
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
    expect(result.debugTrace.capability).toBe('FACTS')
    expect(result.debugTrace.responseMode).toBe('deterministic')
    expect(mock.calls).toContain('bottles')
    expect(mock.calls).toContain('zones')
  })

  it('answers filtered cellar bottle counts without calling an LLM provider', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseMock()
    const body: RequestBody = {
      message: "J'ai combien de rouges en cave ?",
      history: [],
      cave: [],
      contextStrategy: 'backend_managed',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Tu as 2 bouteilles de rouges en cave, sur 1 reference.')
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
    expect(mock.calls).toContain('bottles')
  })

  it('answers simple tasting counts without calling an LLM provider', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseTastingMock()
    const body: RequestBody = {
      message: "Combien de dégustations de Champagne j'ai faites ?",
      history: [],
      cave: [],
      contextStrategy: 'backend_managed',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Tu as 1 degustation de champagne.')
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
    expect(mock.calls).toContain('bottles')
  })

  it('answers single-match tasting rating lookups without calling an LLM provider', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseTastingRatingMock()
    const body: RequestBody = {
      message: "J'avais mis combien d'etoiles au Rayas ?",
      history: [],
      cave: [],
      contextStrategy: 'backend_managed',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Tu avais mis 4/5 a Chateau Rayas Chateauneuf-du-Pape 1998.')
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
    expect(mock.calls).toContain('bottles')
  })

  it('answers focused tasting vintage follow-ups without calling an LLM provider', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseTastingRatingMock()
    const body: RequestBody = {
      message: "C'était quoi comme millésime déjà ?",
      history: [],
      cave: [],
      contextStrategy: 'backend_managed',
      conversationState: {
        phase: 'idle_smalltalk',
        taskType: 'tasting',
        memoryFocus: 'Rayas',
      },
      orchestrationVersion: 'v2',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Je retrouve 1998 comme millesime pour Rayas.')
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
    expect(result.debugTrace.capability).toBe('FACTS')
  })

  it('answers focused tasting follow-ups even when routing confidence is low', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseTastingRatingMock()
    const body: RequestBody = {
      message: "C'était quoi comme millésime déjà ?",
      history: [
        { role: 'user', text: "Tu te souviens du Rayas qu'on a bu ?" },
        { role: 'assistant', text: 'Oui, tu avais garde un souvenir precis du Rayas.' },
      ],
      cave: [],
      contextStrategy: 'backend_managed',
      conversationState: {
        phase: 'active_task',
        taskType: 'personal_fact',
        memoryFocus: 'Rayas',
      },
      orchestrationVersion: 'v2',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Je retrouve 1998 comme millesime pour Rayas.')
    expect(result.debugTrace.confidence).toBeLessThan(0.7)
    expect(result.debugTrace.responseMode).toBe('deterministic')
    expect(result.debugTrace.factReadiness?.directAnswerAllowed).toBe(true)
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
  })

  it('answers focused tasting impression follow-ups without calling an LLM provider', async () => {
    const { runCelestinTurn } = await import('./runtime')
    const mock = supabaseTastingRatingMock()
    const body: RequestBody = {
      message: "Et le Rayas, c'était comment ?",
      history: [],
      cave: [],
      contextStrategy: 'backend_managed',
      conversationState: {
        phase: 'idle_smalltalk',
        taskType: 'tasting',
        memoryFocus: 'Gangloff',
      },
      orchestrationVersion: 'v2',
    }

    const result = await runCelestinTurn(body, {
      userId: 'user-1',
      supabase: mock.client as never,
    } as AuthContext)

    expect(result.provider).toBe('deterministic')
    expect(result.response.message).toBe('Tu l avais note 4/5. Ta note disait : Grand souvenir.')
    expect(result.debugTrace.providerTrace.attempts).toEqual([])
    expect(result.debugTrace.capability).toBe('FACTS')
  })
})
