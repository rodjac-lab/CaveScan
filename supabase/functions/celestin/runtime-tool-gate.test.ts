import { describe, expect, it } from 'vitest'
import type { ContextPlan } from './context-plan'
import type { RequestBody } from './types'

Object.defineProperty(globalThis, 'Deno', {
  value: {
    env: {
      get: () => undefined,
    },
  },
  configurable: true,
})

function plan(overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    profile: 'none',
    cave: 'none',
    zones: 'none',
    memories: 'none',
    tools: 'auto',
    history: 'compact',
    truthPolicy: 'prudent_factual',
    reasons: ['test'],
    ...overrides,
  }
}

function body(message: string): RequestBody {
  return {
    message,
    history: [],
    cave: [],
  }
}

describe('forcedToolNameForTurn', () => {
  it('forces tasting lookup for personal past-memory questions on auto tools', async () => {
    const { forcedToolNameForTurn } = await import('./runtime')

    expect(forcedToolNameForTurn(plan(), body("J'ai deja ete a Rome ?"))).toBe('query_tastings')
    expect(forcedToolNameForTurn(plan(), body("Je ne retrouve pas le nom du restaurant"))).toBe('query_tastings')
  })

  it('does not force tools for general wine culture questions', async () => {
    const { forcedToolNameForTurn } = await import('./runtime')

    expect(forcedToolNameForTurn(plan(), body('La biodynamie, c est serieux ?'))).toBeUndefined()
    expect(forcedToolNameForTurn(plan(), body('Parle-moi du Gamay'))).toBeUndefined()
  })

  it('preserves explicit forced tool plans', async () => {
    const { forcedToolNameForTurn } = await import('./runtime')

    expect(forcedToolNameForTurn(plan({ tools: 'force_cellar' }), body("J'ai deja ete a Rome ?"))).toBe('query_cellar')
  })
})
