import type { WineColor } from '@/lib/types'

export interface RecommendationCard {
  bottle_id?: string
  name: string
  appellation: string
  badge: string
  reason: string
  color: WineColor
}

interface CacheEntry {
  cards: RecommendationCard[]
  fetchedAt: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes

const cache: Record<string, CacheEntry> = {}

export function buildQueryKey(mode: string, query: string | null): string {
  return `${mode}:${query || 'default'}`
}

export function getCachedRecommendation(key: string): RecommendationCard[] | null {
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    delete cache[key]
    return null
  }
  return entry.cards
}

export function setCachedRecommendation(key: string, cards: RecommendationCard[]): void {
  cache[key] = { cards, fetchedAt: Date.now() }
}

export function clearRecommendationCache(): void {
  for (const key in cache) {
    delete cache[key]
  }
}
