import { describe, expect, it, vi } from 'vitest'
import { buildMemoryAuditReport, buildMemoryWeightReport, estimateTokens, formatRelativeDate } from '@/lib/debugInsights'
import type { MemoryFact } from '@/lib/chatPersistence'
import type { Bottle } from '@/lib/types'

vi.mock('@/lib/tastingMemories', () => ({
  selectRelevantMemories: vi.fn(() => [{ id: 'memory-1' }]),
}))

vi.mock('@/lib/tastingMemoryFormatting', () => ({
  serializeMemoriesForPrompt: vi.fn(() => 'memoire serializee'),
}))

describe('debugInsights', () => {
  it('estimate token count from chars', () => {
    expect(estimateTokens(10)).toBe(3)
    expect(estimateTokens('12345678')).toBe(2)
  })

  it('formats relative date labels', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'))

    expect(formatRelativeDate('2026-04-10T11:30:00.000Z')).toBe("il y a moins d'1h")
    expect(formatRelativeDate('2026-04-10T09:00:00.000Z')).toBe('il y a 3h')
    expect(formatRelativeDate('2026-04-09T10:00:00.000Z')).toBe('hier')

    vi.useRealTimers()
  })

  it('builds a memory audit report', () => {
    const facts: MemoryFact[] = [
      {
        id: '1',
        category: 'preference',
        fact: 'Aime les rouges du Jura',
        confidence: 0.9,
        is_temporary: false,
        expires_at: null,
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: '2',
        category: 'preference',
        fact: 'Aime les rouges du jura',
        confidence: 0.5,
        is_temporary: true,
        expires_at: null,
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: '3',
        category: 'context',
        fact: 'x'.repeat(150),
        confidence: 0.7,
        is_temporary: true,
        expires_at: null,
        created_at: '2026-04-10T10:00:00.000Z',
      },
    ]

    const report = buildMemoryAuditReport(facts)

    expect(report.activeCount).toBe(3)
    expect(report.temporaryCount).toBe(2)
    expect(report.lowConfidenceCount).toBe(1)
    expect(report.categoryCounts.preference).toBe(2)
    expect(report.duplicateClusters).toHaveLength(1)
    expect(report.longFacts).toHaveLength(1)
  })

  it('builds a memory weight report from tasting notes', () => {
    const bottles = [
      {
        id: 'b1',
        tasting_note: 'Premier nez ample et salin',
      },
      {
        id: 'b2',
        tasting_note: 'Finale plus tendue et épicée',
      },
      {
        id: 'b3',
        tasting_note: null,
      },
    ] as Bottle[]

    const report = buildMemoryWeightReport(bottles)

    expect(report).not.toBeNull()
    expect(report?.noteCount).toBe(2)
    expect(report?.rawChars).toBeGreaterThan(10)
    expect(report?.currentMemoryChars).toBe('memoire serializee'.length)
  })

  it('returns null when there are no tasting notes', () => {
    const report = buildMemoryWeightReport([{ id: 'b1', tasting_note: '   ' }] as Bottle[])
    expect(report).toBeNull()
  })
})
