import { describe, expect, it } from 'vitest'
import {
  buildGeminiCelestinTools,
  buildGeminiFunctionResponseContent,
  buildOpenAICelestinTools,
  extractGeminiProviderToolCalls,
} from './provider-tool-adapters'

describe('provider tool adapters', () => {
  it('exports Celestin tools as Gemini function declarations', () => {
    const tools = buildGeminiCelestinTools()

    expect(tools).toHaveLength(1)
    expect(tools[0].functionDeclarations.map((tool) => tool.name)).toEqual([
      'query_cellar',
      'query_tastings',
      'query_memory',
      'search_cellar_candidates',
    ])
    expect(tools[0].functionDeclarations[0]).toMatchObject({
      name: 'query_cellar',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          aggregate: { type: 'string', enum: ['list', 'count'] },
        },
      },
    })
  })

  it('exports Celestin tools as OpenAI function tools without changing the source schemas', () => {
    const tools = buildOpenAICelestinTools()

    expect(tools[1]).toMatchObject({
      type: 'function',
      function: {
        name: 'query_tastings',
        parameters: {
          type: 'object',
          properties: {
            aggregate: {
              type: 'string',
              enum: ['list', 'count', 'first', 'last', 'best', 'worst', 'top_region', 'top_appellation', 'top_domaine'],
            },
          },
        },
      },
    })
  })

  it('normalizes Gemini function calls to the common provider tool-call contract', () => {
    const calls = extractGeminiProviderToolCalls({
      role: 'model',
      parts: [
        { text: 'Je vais verifier.' },
        { functionCall: { id: 'call_1', name: 'query_tastings', args: { query: 'rayas' } } },
        { functionCall: { name: 'query_memory', args: { query: 'restaurant' } } },
      ],
    })

    expect(calls).toEqual([
      { id: 'call_1', name: 'query_tastings', input: { query: 'rayas' } },
      { id: 'gemini_2_query_memory', name: 'query_memory', input: { query: 'restaurant' } },
    ])
  })

  it('builds Gemini functionResponse content with the original call ids', () => {
    const content = buildGeminiFunctionResponseContent([
      {
        id: 'call_1',
        name: 'query_tastings',
        input: { query: 'rayas' },
        content: '{"source":"tastings","totalRows":1}',
        isError: false,
        trace: {
          name: 'query_tastings',
          input: { query: 'rayas' },
          durationMs: 12,
          source: 'tastings',
          totalRows: 1,
        },
      },
      {
        id: 'call_2',
        name: 'query_memory',
        input: { query: 'rome' },
        content: 'Tool failed',
        isError: true,
        trace: {
          name: 'query_memory',
          input: { query: 'rome' },
          durationMs: 8,
          error: 'Tool failed',
        },
      },
    ])

    expect(content).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'query_tastings',
            id: 'call_1',
            response: { result: { source: 'tastings', totalRows: 1 } },
          },
        },
        {
          functionResponse: {
            name: 'query_memory',
            id: 'call_2',
            response: { result: 'Tool failed', error: true },
          },
        },
      ],
    })
  })
})
