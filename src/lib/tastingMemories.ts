import { supabase } from '@/lib/supabase'
import type { Bottle, TastingTags } from '@/lib/types'

// === Tag Extraction (fire-and-forget) ===

function buildBottleContext(bottle: Bottle): string {
  return [bottle.domaine, bottle.appellation, bottle.millesime, bottle.couleur]
    .filter(Boolean)
    .join(', ')
}

/**
 * Calls the extract-tasting-tags edge function and saves tags to the bottle.
 * Fire-and-forget: never throws, never blocks the UI.
 */
export function extractAndSaveTags(bottle: Bottle): void {
  const note = bottle.tasting_note
  if (!note || note.trim().length === 0) return

  // Fire-and-forget async
  ;(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('extract-tasting-tags', {
        body: {
          tasting_note: note,
          bottle_context: buildBottleContext(bottle),
        },
      })

      if (error) {
        console.warn('[tastingMemories] Edge function error:', error)
        return
      }

      const tags = data as TastingTags
      if (!tags || (!tags.plats?.length && !tags.descripteurs?.length && !tags.sentiment)) {
        console.log('[tastingMemories] No meaningful tags extracted, skipping save')
        return
      }

      const { error: updateError } = await supabase
        .from('bottles')
        .update({ tasting_tags: tags })
        .eq('id', bottle.id)

      if (updateError) {
        console.warn('[tastingMemories] Failed to save tags:', updateError)
      } else {
        console.log('[tastingMemories] Tags saved for bottle', bottle.id)
      }
    } catch (err) {
      console.warn('[tastingMemories] Unexpected error:', err)
    }
  })()
}

// === Memory Selection for Sommelier ===

interface ScoredMemory {
  bottle: Bottle
  score: number
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

function queryMatchesTerms(query: string, terms: string[]): number {
  const normalizedQuery = normalizeForMatch(query)
  let matches = 0
  for (const term of terms) {
    if (normalizedQuery.includes(normalizeForMatch(term))) {
      matches++
    }
  }
  return matches
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, diff / (1000 * 60 * 60 * 24))
}

/**
 * Scores and selects the most relevant tasting memories for the sommelier prompt.
 */
export function selectRelevantMemories(
  mode: string,
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
): Bottle[] {
  // Only consider bottles that have a tasting note
  const withNotes = drunkBottles.filter((b) => b.tasting_note && b.tasting_note.trim().length > 0)
  if (withNotes.length === 0) return []

  const scored: ScoredMemory[] = withNotes.map((bottle) => {
    let score = 0
    const tags = bottle.tasting_tags as TastingTags | null

    // --- Query matching ---
    if (query && query.trim().length > 0) {
      if (tags) {
        if (mode === 'food') {
          score += queryMatchesTerms(query, tags.plats) * 4
          // Also check keywords for food-related terms
          score += queryMatchesTerms(query, tags.keywords) * 2
        } else if (mode === 'wine') {
          score += queryMatchesTerms(query, tags.descripteurs) * 4
          score += queryMatchesTerms(query, tags.keywords) * 2
        } else {
          // Generic/surprise: match against all tag fields
          score += queryMatchesTerms(query, tags.plats) * 3
          score += queryMatchesTerms(query, tags.descripteurs) * 3
          score += queryMatchesTerms(query, tags.keywords) * 2
        }
      }

      // Fallback: search in raw tasting_note text if no tags or no tag matches
      if (score === 0 && bottle.tasting_note) {
        const noteWords = query.split(/\s+/).filter((w) => w.length > 2)
        const normalizedNote = normalizeForMatch(bottle.tasting_note)
        for (const word of noteWords) {
          if (normalizedNote.includes(normalizeForMatch(word))) {
            score += 2
          }
        }
      }
    }

    // --- Sentiment bonus ---
    if (tags?.sentiment === 'excellent') score += 3
    else if (tags?.sentiment === 'bon') score += 1

    // --- Rating bonus ---
    if (bottle.rating != null) {
      if (bottle.rating >= 4) score += 1.5
      if (bottle.rating === 5) score += 1.0
    }

    // --- Recency bonus ---
    const days = daysSince(bottle.drunk_at)
    if (days < 30) score += 1.5
    else if (days < 90) score += 0.8
    else if (days < 180) score += 0.3

    return { bottle, score }
  })

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score)

  // Only return memories with a positive score
  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.bottle)
}

// === Serialization for Prompt ===

/**
 * Formats selected memories into a compact text block for the sommelier prompt.
 */
export function serializeMemoriesForPrompt(memories: Bottle[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map((b) => {
    const tags = b.tasting_tags as TastingTags | null
    const identity = [b.domaine, b.appellation, b.millesime].filter(Boolean).join(' ')
    const parts: string[] = [`- ${identity}`]

    if (b.rating) parts.push(`note: ${b.rating}/5`)
    if (tags?.sentiment) parts.push(`sentiment: ${tags.sentiment}`)
    if (tags?.plats?.length) parts.push(`plats: ${tags.plats.join(', ')}`)
    if (tags?.descripteurs?.length) parts.push(`descripteurs: ${tags.descripteurs.join(', ')}`)
    if (tags?.occasion) parts.push(`occasion: ${tags.occasion}`)
    if (tags?.keywords?.length) parts.push(`mots-clés: ${tags.keywords.join(', ')}`)

    // Fallback: include raw note snippet if no tags
    if (!tags && b.tasting_note) {
      const snippet = b.tasting_note.length > 100
        ? b.tasting_note.slice(0, 100) + '...'
        : b.tasting_note
      parts.push(`note: "${snippet}"`)
    }

    return parts.join(' | ')
  })

  return lines.join('\n')
}
