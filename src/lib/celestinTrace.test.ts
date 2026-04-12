import { describe, expect, it, vi } from 'vitest'
import { buildCelestinRealTraceEntry } from '@/lib/celestinTrace'

describe('celestinTrace', () => {
  it('captures the real request and routing evidence without storing full payloads', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T18:00:00.000Z'))

    const trace = buildCelestinRealTraceEntry({
      userMessage: 'Tu retrouves ma note sur ce Meursault ?',
      body: {
        history: [{ role: 'assistant', text: 'Je vois un Meursault Vincent Latour 2018.' }],
        cave: [{ id: '1' }, { id: '2' }],
        memories: 'Note reelle: 3/5, large mais plaisant.'.repeat(40),
        memoryEvidenceMode: 'exact',
        compiledProfileMarkdown: 'profil compile',
        conversationState: {
          phase: 'idle_smalltalk',
          taskType: null,
          memoryFocus: 'Vincent Latour Meursault 2018',
        },
      },
      response: {
        message: 'Tu l avais note 3/5.',
        ui_action: null,
        _debug: {
          provider: 'openai',
          turnType: 'context_switch',
          cognitiveMode: 'tasting_memory',
          memoryFocus: 'Vincent Latour Meursault 2018',
          routing: {
            winner: 'memory_lookup',
            scope: 'idle_smalltalk',
            reasons: ['memory_terms'],
            candidates: [{ intent: 'memory_lookup', confidence: 88, reasons: ['memory_terms'] }],
          },
        },
      },
    })

    expect(trace.createdAt).toBe('2026-04-11T18:00:00.000Z')
    expect(trace.request.historyTurns).toBe(1)
    expect(trace.request.caveCount).toBe(2)
    expect(trace.request.memoriesChars).toBeGreaterThan(600)
    expect(trace.request.memoriesPreview).toHaveLength(600)
    expect(trace.response?.routing?.winner).toBe('memory_lookup')
    expect(trace.response?.cognitiveMode).toBe('tasting_memory')

    vi.useRealTimers()
  })
})
