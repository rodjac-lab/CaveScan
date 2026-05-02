import { describe, expect, it } from 'vitest'
import { buildDeterministicResponse } from './deterministic-response'
import type { ContextPlan } from './context-plan'
import type { ResolvedContextSources } from './source-resolver'
import type { RequestBody } from './types'

function body(message: string): RequestBody {
  return {
    message,
    history: [],
    cave: [],
  }
}

function plan(overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    profile: 'none',
    cave: 'tool_only',
    zones: 'names',
    memories: 'none',
    tools: 'force_cellar',
    history: 'compact',
    truthPolicy: 'exact_only',
    reasons: ['test'],
    ...overrides,
  }
}

function sources(overrides: Partial<ResolvedContextSources> = {}): ResolvedContextSources {
  return {
    requirements: [],
    cave: { level: 'tool_only', totalBottles: 12, referenceCount: 8, bottles: [] },
    zones: [],
    ...overrides,
  }
}

describe('buildDeterministicResponse', () => {
  it('answers generic cellar bottle counts without LLM', () => {
    const response = buildDeterministicResponse({
      body: body('Combien de bouteilles ai-je en cave ?'),
      routingIntent: 'cellar_lookup',
      contextPlan: plan(),
      resolvedSources: sources(),
    })

    expect(response?.message).toBe('Tu as 12 bouteilles en cave, sur 8 references.')
  })

  it('does not answer filtered cellar count questions deterministically yet', () => {
    const response = buildDeterministicResponse({
      body: body('Combien de bouteilles de Champagne ai-je ?'),
      routingIntent: 'cellar_lookup',
      contextPlan: plan(),
      resolvedSources: sources(),
    })

    expect(response).toBeNull()
  })

  it('only answers exact cellar lookup routes', () => {
    expect(buildDeterministicResponse({
      body: body('Combien de bouteilles ai-je ?'),
      routingIntent: 'recommendation_request',
      contextPlan: plan(),
      resolvedSources: sources(),
    })).toBeNull()

    expect(buildDeterministicResponse({
      body: body('Combien de bouteilles ai-je ?'),
      routingIntent: 'cellar_lookup',
      contextPlan: plan({ truthPolicy: 'standard' }),
      resolvedSources: sources(),
    })).toBeNull()
  })
})
