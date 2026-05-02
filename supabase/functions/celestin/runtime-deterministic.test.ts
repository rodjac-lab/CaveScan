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
                  data: [{ quantity: 2 }, { quantity: 1 }],
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
    expect(mock.calls).toContain('bottles')
    expect(mock.calls).toContain('zones')
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
})
