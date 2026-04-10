import { selectRelevantMemories } from '@/lib/tastingMemories'
import { serializeMemoriesForPrompt } from '@/lib/tastingMemoryFormatting'
import type { MemoryFact } from '@/lib/chatPersistence'
import type { Bottle } from '@/lib/types'

export type MemoryWeightReport = {
  noteCount: number
  rawChars: number
  rawTokens: number
  avgChars: number
  maxChars: number
  currentMemoryChars: number
  currentMemoryTokens: number
}

export type MemoryAuditReport = {
  activeCount: number
  temporaryCount: number
  lowConfidenceCount: number
  duplicateClusters: Array<{ canonical: string; count: number; samples: string[] }>
  longFacts: Array<{ fact: string; chars: number; category: string }>
  categoryCounts: Record<string, number>
}

export function estimateTokens(textOrChars: string | number): number {
  const chars = typeof textOrChars === 'number' ? textOrChars : textOrChars.length
  return Math.ceil(chars / 4)
}

export function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'il y a moins d\'1h'
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  return `il y a ${days} jours`
}

function normalizeFact(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildMemoryAuditReport(facts: MemoryFact[]): MemoryAuditReport {
  const clusters = new Map<string, Array<{ fact: string; category: string }>>()
  const categoryCounts = facts.reduce<Record<string, number>>((acc, fact) => {
    acc[fact.category] = (acc[fact.category] ?? 0) + 1
    const canonical = normalizeFact(fact.fact)
    if (!clusters.has(canonical)) clusters.set(canonical, [])
    clusters.get(canonical)?.push({ fact: fact.fact, category: fact.category })
    return acc
  }, {})

  const duplicateClusters = [...clusters.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([canonical, items]) => ({
      canonical,
      count: items.length,
      samples: [...new Set(items.map((item) => item.fact))].slice(0, 3),
    }))
    .sort((left, right) => right.count - left.count)

  const lowConfidenceCount = facts.filter((fact) => fact.confidence < 0.65).length
  const temporaryCount = facts.filter((fact) => fact.is_temporary).length
  const longFacts = facts
    .map((fact) => ({ fact: fact.fact, chars: fact.fact.length, category: fact.category }))
    .filter((fact) => fact.chars > 140)
    .sort((left, right) => right.chars - left.chars)
    .slice(0, 5)

  return {
    activeCount: facts.length,
    temporaryCount,
    lowConfidenceCount,
    duplicateClusters: duplicateClusters.slice(0, 8),
    longFacts,
    categoryCounts,
  }
}

export function buildMemoryWeightReport(bottles: Bottle[]): MemoryWeightReport | null {
  const bottlesWithNotes = bottles.filter((bottle) => bottle.tasting_note && bottle.tasting_note.trim().length > 0)
  if (bottlesWithNotes.length === 0) return null

  const rawChars = bottlesWithNotes.reduce((sum, bottle) => sum + (bottle.tasting_note?.trim().length ?? 0), 0)
  const maxChars = bottlesWithNotes.reduce((max, bottle) => Math.max(max, bottle.tasting_note?.trim().length ?? 0), 0)
  const avgChars = Math.round(rawChars / bottlesWithNotes.length)
  const selectedMemories = selectRelevantMemories(null, bottlesWithNotes, 5)
  const currentMemoryText = serializeMemoriesForPrompt(selectedMemories)

  return {
    noteCount: bottlesWithNotes.length,
    rawChars,
    rawTokens: estimateTokens(rawChars),
    avgChars,
    maxChars,
    currentMemoryChars: currentMemoryText.length,
    currentMemoryTokens: estimateTokens(currentMemoryText),
  }
}
