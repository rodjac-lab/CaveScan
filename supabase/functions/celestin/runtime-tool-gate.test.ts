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
    cellarCandidates: 'none',
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
    const { resolveSourceMode } = await import('./source-mode')

    expect(resolveSourceMode(plan(), body("J'ai deja ete a Rome ?")).kind).toBe('source_required')
    expect(resolveSourceMode(plan(), body("Je ne retrouve pas le nom du restaurant")).kind).toBe('source_required')
  })

  it('does not force tools for general wine culture questions', async () => {
    const { resolveSourceMode } = await import('./source-mode')

    expect(resolveSourceMode(plan(), body('La biodynamie, c est serieux ?'))).toEqual({ kind: 'normal', tools: 'auto' })
    expect(resolveSourceMode(plan(), body('Parle-moi du Gamay'))).toEqual({ kind: 'normal', tools: 'auto' })
  })

  it('requires one tool for elliptic personal memory follow-ups', async () => {
    const { resolveSourceMode } = await import('./source-mode')

    expect(resolveSourceMode(
      plan(),
      bodyAfterAssistant('Dans quel restaurant ?', 'Tu as dégusté le Pèppoli à Rome avec ta famille.'),
    ).kind).toBe('source_required')
  })

  it('preserves explicit forced tool plans', async () => {
    const { forcedToolNameForSourceMode, resolveSourceMode } = await import('./source-mode')

    expect(forcedToolNameForSourceMode(resolveSourceMode(plan({ tools: 'force_cellar' }), body('Combien de Champagne ?')))).toBe('query_cellar')
  })

  it('disables tools for normal source mode when the context plan has no tools', async () => {
    const { resolveSourceMode, shouldEnableToolsForSourceMode } = await import('./source-mode')
    const sourceMode = resolveSourceMode(plan({ tools: 'none' }), body('Merci !'))

    expect(sourceMode).toEqual({ kind: 'normal', tools: 'none' })
    expect(shouldEnableToolsForSourceMode({
      sourceMode,
      authReady: true,
      hasImage: false,
    })).toBe(false)
  })

  it('enables auto tools only when auth is ready and there is no image', async () => {
    const { resolveSourceMode, shouldEnableToolsForSourceMode } = await import('./source-mode')
    const sourceMode = resolveSourceMode(plan({ tools: 'auto' }), body('Parle-moi du Gamay'))

    expect(shouldEnableToolsForSourceMode({
      sourceMode,
      authReady: true,
      hasImage: false,
    })).toBe(true)

    expect(shouldEnableToolsForSourceMode({
      sourceMode,
      authReady: false,
      hasImage: false,
    })).toBe(false)

    expect(shouldEnableToolsForSourceMode({
      sourceMode,
      authReady: true,
      hasImage: true,
    })).toBe(false)
  })
})
