import { searchSemanticMemories } from '@/lib/semanticMemory'
import type { Bottle, TastingTags } from '@/lib/types'
import {
  extractQueryTerms,
  hasSpecificIdentityMatch,
  normalizeForMatch,
  termMatchesIdentity,
} from '@/lib/tastingMemoryFilters'
import type {
  MemoryEvidenceMode,
  MemorySearchMessage,
  MemorySelectionOptions,
} from '@/lib/tastingMemoryTypes'

interface ScoredMemory {
  bottle: Bottle
  score: number
  relevanceScore: number
}

function getIdentityFields(bottle: Bottle): string[] {
  return [bottle.domaine, bottle.appellation, bottle.cuvee].filter(Boolean) as string[]
}

function dedupeMemories(memories: Bottle[]): Bottle[] {
  const merged = new Map<string, Bottle>()
  for (const bottle of memories) {
    if (!merged.has(bottle.id)) {
      merged.set(bottle.id, bottle)
    }
  }
  return Array.from(merged.values())
}

function countTermMatches(normalizedQuery: string, terms: string[]): number {
  let matches = 0
  for (const term of terms) {
    if (normalizedQuery.includes(normalizeForMatch(term))) {
      matches += 1
    }
  }
  return matches
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, diff / (1000 * 60 * 60 * 24))
}

function computeBaseMemoryScore(bottle: Bottle, tags: TastingTags | null): number {
  let score = 0

  if (tags?.sentiment === 'excellent') score += 3
  else if (tags?.sentiment === 'bon') score += 1

  if (bottle.rating != null) {
    if (bottle.rating >= 4) score += 1.5
    if (bottle.rating === 5) score += 1.0
  }

  const days = daysSince(bottle.drunk_at)
  if (days < 30) score += 1.5
  else if (days < 90) score += 0.8
  else if (days < 180) score += 0.3

  return score
}

function computeQueryRelevance(
  bottle: Bottle,
  normalizedQuery: string,
  fallbackWords: string[],
  tags: TastingTags | null,
): number {
  let relevanceScore = 0
  const identityFields = getIdentityFields(bottle)

  for (const word of fallbackWords) {
    for (const field of identityFields) {
      if (termMatchesIdentity(word, field)) {
        relevanceScore += 5
      }
    }
  }

  if (tags) {
    relevanceScore += countTermMatches(normalizedQuery, tags.plats) * 3
    relevanceScore += countTermMatches(normalizedQuery, tags.descripteurs) * 3
    relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
  }

  if (bottle.tasting_note) {
    const normalizedNote = normalizeForMatch(bottle.tasting_note)
    for (const word of fallbackWords) {
      if (normalizedNote.includes(word)) {
        relevanceScore += 2
      }
    }
  }

  return relevanceScore
}

export function sortMemoriesForEvidence(memories: Bottle[], mode: MemoryEvidenceMode): Bottle[] {
  function computeMemoryHighlightScore(bottle: Bottle): number {
    const note = bottle.tasting_note?.trim() ?? ''
    const normalizedNote = note ? normalizeForMatch(note) : ''
    const tags = bottle.tasting_tags as TastingTags | null
    let score = 0

    if (bottle.rating != null) score += bottle.rating * 8
    if (tags?.sentiment === 'excellent') score += 5
    else if (tags?.sentiment === 'bon') score += 2

    if (note.length > 120) score += 2
    if (note.length > 220) score += 1

    if (/\b19\/20\b|\b20\/20\b|\bgrand millesime\b|\bgrand vin\b|\bincroyable\b|\bsublime\b/.test(normalizedNote)) {
      score += 4
    }

    if (/\bdeuxieme vin de la soiree\b|\bdeuxieme\b|\bderriere\b|\bjuste derriere\b|\ben dessous\b/.test(normalizedNote)) {
      score -= 6
    }

    return score
  }

  return [...memories].sort((left, right) => {
    const leftDays = daysSince(left.drunk_at)
    const rightDays = daysSince(right.drunk_at)
    const leftHasNote = left.tasting_note && left.tasting_note.trim().length > 0 ? 1 : 0
    const rightHasNote = right.tasting_note && right.tasting_note.trim().length > 0 ? 1 : 0

    if (mode === 'synthesis' && leftHasNote !== rightHasNote) {
      return rightHasNote - leftHasNote
    }

    if (leftDays !== rightDays) {
      return leftDays - rightDays
    }

    if (mode === 'synthesis') {
      const leftHighlight = computeMemoryHighlightScore(left)
      const rightHighlight = computeMemoryHighlightScore(right)
      if (leftHighlight !== rightHighlight) {
        return rightHighlight - leftHighlight
      }
    }

    const leftRating = left.rating ?? 0
    const rightRating = right.rating ?? 0
    if (leftRating !== rightRating) {
      return rightRating - leftRating
    }

    return ([left.domaine, left.cuvee, left.appellation].filter(Boolean).join(' '))
      .localeCompare([right.domaine, right.cuvee, right.appellation].filter(Boolean).join(' '))
  })
}

function rankMemoryCandidates(
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
  options: MemorySelectionOptions = {},
): Bottle[] {
  const withNotes = drunkBottles.filter((bottle) => bottle.tasting_note && bottle.tasting_note.trim().length > 0)
  if (withNotes.length === 0) return []

  const { selectionProfile = 'default', recentMessages = [] } = options
  const hasQuery = query != null && query.trim().length > 0
  const normalizedQuery = hasQuery ? normalizeForMatch(query) : ''
  const fallbackWords = hasQuery ? extractQueryTerms(query) : []
  const recentWindow = recentMessages.slice(-6)

  function countRecentMentions(bottle: Bottle): number {
    const identityFields = getIdentityFields(bottle)
      .map((field) => normalizeForMatch(field))
      .filter((field) => field.length >= 4)

    if (identityFields.length === 0 || recentWindow.length === 0) return 0

    return recentWindow.reduce((sum, message: MemorySearchMessage) => {
      const normalizedText = normalizeForMatch(message.text)
      const hasMention = identityFields.some((field) => normalizedText.includes(field))
      if (!hasMention) return sum
      return sum + (message.role === 'celestin' ? 2 : 1)
    }, 0)
  }

  const scored: ScoredMemory[] = withNotes.map((bottle) => {
    const tags = bottle.tasting_tags as TastingTags | null
    const relevanceScore = hasQuery
      ? computeQueryRelevance(bottle, normalizedQuery, fallbackWords, tags)
      : 0
    let score = computeBaseMemoryScore(bottle, tags) + relevanceScore

    if (selectionProfile === 'recommendation') {
      score -= countRecentMentions(bottle) * 2.25
    }

    return { bottle, score, relevanceScore }
  })

  const relevantOnly = hasQuery ? scored.filter((entry) => entry.relevanceScore > 0) : []
  if (relevantOnly.length > 0) {
    relevantOnly.sort((a, b) => b.score - a.score)
    return relevantOnly.slice(0, limit).map((entry) => entry.bottle)
  }

  if (selectionProfile === 'recommendation') {
    return []
  }

  scored.sort((a, b) => b.score - a.score)
  return scored
    .filter((entry) => entry.score > 0)
    .slice(0, limit)
    .map((entry) => entry.bottle)
}

export function selectRelevantMemories(
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
  options: MemorySelectionOptions = {},
): Bottle[] {
  return rankMemoryCandidates(query, drunkBottles, limit, options)
}

export async function selectRelevantMemoriesAsync(
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
  options: MemorySelectionOptions = {},
): Promise<Bottle[]> {
  const { selectionProfile = 'default', recentMessages = [] } = options
  if (!query || query.trim().length < 3) {
    return selectRelevantMemories(query, drunkBottles, limit, options)
  }

  const keywordMatches = selectRelevantMemories(query, drunkBottles, limit, options)
  const exactIdentityMatch = keywordMatches.some((bottle) => hasSpecificIdentityMatch(query, bottle))

  if (exactIdentityMatch || keywordMatches.length > 0) {
    return keywordMatches
  }

  const meaningfulTerms = extractQueryTerms(query)
  if (meaningfulTerms.length < 2) {
    return keywordMatches
  }

  try {
    const results = await searchSemanticMemories(query, limit)
    if (results.length > 0) {
      const rescored = rankMemoryCandidates(
        query,
        dedupeMemories([...results, ...keywordMatches]),
        limit,
        { selectionProfile, recentMessages },
      )
      if (rescored.length > 0) {
        return rescored
      }
      return results
    }
  } catch (err) {
    console.warn('[tastingMemories] Semantic search failed, falling back to keyword matching:', err)
  }

  return keywordMatches
}
