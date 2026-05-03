import { describe, expect, it } from 'vitest'
import { assembleCelestinPrompt, buildProviderHistory } from './prompt-assembler'
import type { ContextPlan } from './context-plan'
import type { ConversationState } from './conversation-state'
import type { ResolvedContextSources } from './source-resolver'
import type { RequestBody } from './types'

function body(overrides: Partial<RequestBody> = {}): RequestBody {
  return {
    message: 'Et si je veux plutot un italien ?',
    history: [
      { role: 'user', text: 'Que boire avec une pizza ?' },
      { role: 'assistant', text: 'Je partirais sur ces pistes.' },
      { role: 'user', text: 'Plutot rouge.' },
      { role: 'assistant', text: 'Voici trois rouges.' },
    ],
    cave: [],
    ...overrides,
  }
}

function plan(overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    profile: 'none',
    cave: 'none',
    zones: 'none',
    memories: 'none',
    tools: 'none',
    history: 'compact',
    truthPolicy: 'standard',
    cellarCandidates: 'none',
    reasons: ['test'],
    ...overrides,
  }
}

function sources(overrides: Partial<ResolvedContextSources> = {}): ResolvedContextSources {
  return {
    requirements: [],
    cave: { level: 'none', totalBottles: 0, referenceCount: 0, bottles: [] },
    zones: [],
    ...overrides,
  }
}

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    phase: 'idle_smalltalk',
    ...overrides,
  }
}

describe('PromptAssembler', () => {
  it('keeps provider history compact for non-pivot turns', () => {
    expect(buildProviderHistory(body(), plan({ history: 'compact' }))).toHaveLength(4)
  })

  it('drops stale recommendation tail for pivot turns', () => {
    expect(buildProviderHistory(body(), plan({ history: 'pivot' }))).toEqual([
      { role: 'user', text: 'Que boire avec une pizza ?' },
      { role: 'assistant', text: 'Je partirais sur ces pistes.' },
    ])
  })

  it('assembles system context and user prompt from resolved sources', () => {
    const assembled = assembleCelestinPrompt({
      body: body({ message: 'Combien ai-je de bouteilles ?' }),
      interpretation: {
        turnType: 'task_request',
        cognitiveMode: 'cellar_assistant',
        shouldAllowUiAction: false,
        inferredTaskType: undefined,
      },
      contextPlan: plan({ cave: 'tool_only', zones: 'names', tools: 'force_cellar', truthPolicy: 'exact_only' }),
      resolvedSources: sources({
        requirements: [{ kind: 'cave', level: 'tool_only', reason: 'test' }],
        cave: { level: 'tool_only', totalBottles: 12, referenceCount: 8, bottles: [] },
        zones: ['Paris'],
      }),
      state: state(),
      routingIntent: 'cellar_lookup',
    })

    expect(assembled.contextBlock).toContain('Zones de stockage disponibles : Paris')
    expect(assembled.contextBlock).toContain('Cave : detail non injecte')
    expect(assembled.systemPrompt).toContain('--- POLITIQUE DU TOUR ---')
    expect(assembled.systemPrompt).toContain('query_cellar')
    expect(assembled.systemPrompt).toContain('--- CONTEXTE UTILISATEUR ---')
    expect(assembled.userPrompt).toContain('Combien ai-je de bouteilles ?')
  })

})
