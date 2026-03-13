import type { WineColor } from '@/lib/types'

export interface RecommendationCard {
  bottle_id?: string
  name: string
  appellation: string
  millesime?: number | null
  badge: string
  reason: string
  color: WineColor
}

export interface RecommendationResponse {
  text: string | null
  cards: RecommendationCard[]
}

interface CacheEntry {
  text: string | null
  cards: RecommendationCard[]
  fetchedAt: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes

const cache: Record<string, CacheEntry> = {}

export function buildQueryKey(mode: string, query: string | null): string {
  return `${mode}:${query || 'default'}`
}

export function getCachedRecommendation(key: string): RecommendationResponse | null {
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    delete cache[key]
    return null
  }
  return { text: entry.text, cards: entry.cards }
}

export function setCachedRecommendation(key: string, response: RecommendationResponse): void {
  cache[key] = { text: response.text, cards: response.cards, fetchedAt: Date.now() }
}

export function clearRecommendationCache(): void {
  for (const key in cache) {
    delete cache[key]
  }
}
