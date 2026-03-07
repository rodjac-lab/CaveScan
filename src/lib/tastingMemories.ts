import { supabase } from '@/lib/supabase'
import type { Bottle, TastingTags } from '@/lib/types'

type Mode = 'generic' | 'food' | 'wine' | 'surprise'

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
  relevanceScore: number
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

function countTermMatches(normalizedQuery: string, terms: string[]): number {
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
  mode: Mode,
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
): Bottle[] {
  // Only consider bottles that have a tasting note
  const withNotes = drunkBottles.filter((b) => b.tasting_note && b.tasting_note.trim().length > 0)
  if (withNotes.length === 0) return []

  // Pre-normalize query and fallback words once (avoid re-normalizing per bottle)
  const hasQuery = query != null && query.trim().length > 0
  const normalizedQuery = hasQuery ? normalizeForMatch(query) : ''
  const fallbackWords = hasQuery
    ? query.split(/\s+/).filter((w) => w.length > 2).map(normalizeForMatch)
    : []

  const scored: ScoredMemory[] = withNotes.map((bottle) => {
    let score = 0
    let relevanceScore = 0
    const tags = bottle.tasting_tags as TastingTags | null

    // --- Query matching ---
    if (hasQuery) {
      if (tags) {
        if (mode === 'food') {
          relevanceScore += countTermMatches(normalizedQuery, tags.plats) * 4
          relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
        } else if (mode === 'wine') {
          relevanceScore += countTermMatches(normalizedQuery, tags.descripteurs) * 4
          relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
        } else {
          relevanceScore += countTermMatches(normalizedQuery, tags.plats) * 3
          relevanceScore += countTermMatches(normalizedQuery, tags.descripteurs) * 3
          relevanceScore += countTermMatches(normalizedQuery, tags.keywords) * 2
        }
      }

      // Fallback: search in raw tasting_note text if no tags or no tag matches
      if (relevanceScore === 0 && bottle.tasting_note) {
        const normalizedNote = normalizeForMatch(bottle.tasting_note)
        for (const word of fallbackWords) {
          if (normalizedNote.includes(word)) {
            relevanceScore += 2
          }
        }
      }
    }

    score += relevanceScore

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

    return { bottle, score, relevanceScore }
  })

  // Only keep memories that are actually relevant to the current query.
  const relevantOnly = hasQuery
    ? scored.filter((entry) => entry.relevanceScore > 0)
    : []

  // Sort by score descending, collect top N with positive score
  relevantOnly.sort((a, b) => b.score - a.score)
  const result: Bottle[] = []
  for (const s of relevantOnly) {
    if (s.score <= 0 || result.length >= limit) break
    result.push(s.bottle)
  }
  return result
}

// === Serialization for Prompt ===

/**
 * Formats selected memories into a compact text block for the sommelier prompt.
 */
function ratingStars(rating: number | null): string {
  if (!rating) return ''
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

export function serializeMemoriesForPrompt(memories: Bottle[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map((b) => {
    const tags = b.tasting_tags as TastingTags | null
    const identity = [b.domaine, b.appellation].filter(Boolean).join(' ')
    const parts: string[] = [`- ${identity}`]

    if (b.millesime) parts.push(`millésime: ${b.millesime}`)
    if (b.drunk_at) {
      const date = new Date(b.drunk_at)
      parts.push(`dégusté le: ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    }
    if (b.rating) parts.push(`${ratingStars(b.rating)}`)
    if (tags?.sentiment) parts.push(`sentiment: ${tags.sentiment}`)
    if (tags?.maturite) parts.push(`maturité: ${tags.maturite}`)

    // Accord vécu : plat + note + occasion en un bloc lisible
    if (tags?.plats?.length) {
      const stars = b.rating ? ` ${ratingStars(b.rating)}` : ''
      const occasion = tags.occasion ? ` (${tags.occasion})` : ''
      parts.push(`accord vécu : ${tags.plats.join(', ')}${stars}${occasion}`)
    } else if (tags?.occasion) {
      parts.push(`occasion: ${tags.occasion}`)
    }

    if (tags?.descripteurs?.length) parts.push(`descripteurs: ${tags.descripteurs.join(', ')}`)
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
