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

function bodyAfterAssistant(message: string, assistantText: string): RequestBody {
  return {
    message,
    history: [{ role: 'assistant', text: assistantText }],
    cave: [],
  }
}

describe('tool use gate', () => {
  it('requires one tool for personal past-memory questions on auto tools', async () => {
    const { shouldRequireToolUseForTurn } = await import('./runtime')

    expect(shouldRequireToolUseForTurn(plan(), body("J'ai deja ete a Rome ?"))).toBe(true)
    expect(shouldRequireToolUseForTurn(plan(), body("Je ne retrouve pas le nom du restaurant"))).toBe(true)
  })

  it('does not force tools for general wine culture questions', async () => {
    const { shouldRequireToolUseForTurn } = await import('./runtime')

    expect(shouldRequireToolUseForTurn(plan(), body('La biodynamie, c est serieux ?'))).toBe(false)
    expect(shouldRequireToolUseForTurn(plan(), body('Parle-moi du Gamay'))).toBe(false)
  })

  it('requires one tool for elliptic personal memory follow-ups', async () => {
    const { shouldRequireToolUseForTurn } = await import('./runtime')

    expect(shouldRequireToolUseForTurn(
      plan(),
      bodyAfterAssistant('Dans quel restaurant ?', 'Tu as dégusté le Pèppoli à Rome avec ta famille.'),
    )).toBe(true)
  })

  it('preserves explicit forced tool plans', async () => {
    const { forcedToolNameForTurn } = await import('./runtime')

    expect(forcedToolNameForTurn(plan({ tools: 'force_cellar' }))).toBe('query_cellar')
  })
})
