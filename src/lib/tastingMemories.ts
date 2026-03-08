import { supabase } from '@/lib/supabase'
import type { Bottle, TastingTags } from '@/lib/types'

type Mode = 'generic' | 'food' | 'wine' | 'surprise'

function buildBottleContext(bottle: Bottle): string {
  return [bottle.domaine, bottle.appellation, bottle.millesime, bottle.couleur]
    .filter(Boolean)
    .join(', ')
}

export function extractAndSaveTags(bottle: Bottle): void {
  const note = bottle.tasting_note
  if (!note || note.trim().length === 0) return

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

export function selectRelevantMemories(
  mode: Mode,
  query: string | null,
  drunkBottles: Bottle[],
  limit = 5,
): Bottle[] {
  const withNotes = drunkBottles.filter((b) => b.tasting_note && b.tasting_note.trim().length > 0)
  if (withNotes.length === 0) return []

  const hasQuery = query != null && query.trim().length > 0
  const normalizedQuery = hasQuery ? normalizeForMatch(query) : ''
  const fallbackWords = hasQuery
    ? query.split(/\s+/).filter((w) => w.length > 2).map(normalizeForMatch)
    : []

  const scored: ScoredMemory[] = withNotes.map((bottle) => {
    let score = 0
    let relevanceScore = 0
    const tags = bottle.tasting_tags as TastingTags | null

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

    return { bottle, score, relevanceScore }
  })

  // If query matched specific tags, prefer those
  const relevantOnly = hasQuery
    ? scored.filter((entry) => entry.relevanceScore > 0)
    : []

  if (relevantOnly.length > 0) {
    relevantOnly.sort((a, b) => b.score - a.score)
    return relevantOnly.slice(0, limit).map(s => s.bottle)
  }

  // Proactive mode: no textual match (or no query) → return top-scored memories
  // (best-rated, most recent, strongest sentiment)
  // This lets Celestin spontaneously cite great experiences
  scored.sort((a, b) => b.score - a.score)
  const proactive = scored.filter(s => s.score > 0).slice(0, limit)
  return proactive.map(s => s.bottle)
}

function ratingStars(rating: number | null): string {
  if (!rating) return ''
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

export function serializeMemoriesForPrompt(memories: Bottle[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map((bottle) => {
    const tags = bottle.tasting_tags as TastingTags | null
    const identity = [bottle.domaine, bottle.cuvee, bottle.appellation].filter(Boolean).join(' | ') || 'Vin'
    const headerParts: string[] = [identity]

    if (bottle.millesime) headerParts.push(String(bottle.millesime))
    if (bottle.drunk_at) {
      const date = new Date(bottle.drunk_at)
      headerParts.push(`deguste le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    }
    if (bottle.rating) headerParts.push(`note ${bottle.rating}/5 ${ratingStars(bottle.rating)}`)
    if (tags?.sentiment) headerParts.push(`sentiment ${tags.sentiment}`)
    if (tags?.maturite) headerParts.push(`maturite ${tags.maturite}`)

    const contextParts: string[] = []
    if (tags?.plats?.length) {
      const occasion = tags.occasion ? ` (${tags.occasion})` : ''
      contextParts.push(`accord vecu: ${tags.plats.join(', ')}${occasion}`)
    } else if (tags?.occasion) {
      contextParts.push(`occasion: ${tags.occasion}`)
    }

    if (tags?.descripteurs?.length) {
      contextParts.push(`descripteurs: ${tags.descripteurs.join(', ')}`)
    }

    const noteText = bottle.tasting_note?.replace(/\s+/g, ' ').trim()
    if (noteText) {
      contextParts.push(`verbatim utilisateur: "${noteText}"`)
    }

    return [`- ${headerParts.join(' | ')}`, ...contextParts].join('\n')
  })

  return lines.join('\n\n')
}
