import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { serializeProfileForPrompt } from '@/lib/taste-profile'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { useTasteProfile } from '@/hooks/useTasteProfile'
import { buildLocalRecommendationCards, rankCaveBottles } from '@/lib/recommendationRanking'
import {
  buildQueryKey,
  getCachedRecommendation,
  setCachedRecommendation,
  type RecommendationCard,
} from '@/lib/recommendationStore'
import type { Bottle, TasteProfile } from '@/lib/types'

type Mode = 'food' | 'wine' | 'surprise'

interface CaveBottleSummary {
  id: string
  domaine: string | null
  appellation: string | null
  millesime: number | null
  couleur: string | null
  character: string | null
  cuvee: string | null
}

const FALLBACK_CARDS: RecommendationCard[] = [
  { name: 'Château Margaux 2015', appellation: 'Margaux', badge: 'Découverte', reason: 'Ce millésime approche son apogée. C\'est le moment idéal pour l\'ouvrir.', color: 'rouge' },
  { name: 'Pouilly-Fumé 2023', appellation: 'Loire', badge: 'Découverte', reason: 'Un blanc vif parfait pour les soirées de fin d\'hiver, sur un poisson au four.', color: 'blanc' },
  { name: 'Champagne Brut Rosé', appellation: 'Champagne', badge: 'Découverte', reason: 'Pourquoi ne pas célébrer ce soir\u00a0?', color: 'bulles' },
]

function getSeason(): string {
  const month = new Date().getMonth()
  if (month >= 2 && month <= 4) return 'printemps'
  if (month >= 5 && month <= 7) return 'été'
  if (month >= 8 && month <= 10) return 'automne'
  return 'hiver'
}

function getDayOfWeek(): string {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long' })
}

function buildCavePayload(bottles: Bottle[]): CaveBottleSummary[] {
  return bottles.map((b) => ({
    id: b.id.substring(0, 8),
    domaine: b.domaine,
    appellation: b.appellation,
    millesime: b.millesime,
    couleur: b.couleur,
    character: b.character,
    cuvee: b.cuvee,
  }))
}

function resolveBottleIds(
  cards: RecommendationCard[],
  bottles: Bottle[]
): RecommendationCard[] {
  return cards.map((card) => {
    if (!card.bottle_id) return card
    const match = bottles.find((b) => b.id.startsWith(card.bottle_id!))
    return match ? { ...card, bottle_id: match.id } : card
  })
}

function formatDrunkSummary(b: Bottle): string {
  return [b.domaine, b.appellation, b.millesime].filter(Boolean).join(' ')
}

async function callRecommendApi(
  mode: Mode,
  query: string | null,
  profile: TasteProfile | null,
  caveBottlesForPrompt: Bottle[],
  drunkBottles: Bottle[],
  allCaveBottles: Bottle[],
): Promise<RecommendationCard[]> {
  const profileStr = profile ? serializeProfileForPrompt(profile) : ''
  const cave = buildCavePayload(caveBottlesForPrompt)
  const recentDrunk = drunkBottles.slice(0, 5).map(formatDrunkSummary)

  const { data, error } = await supabase.functions.invoke('recommend-wine', {
    body: {
      mode,
      query: query || undefined,
      profile: profileStr,
      cave,
      context: {
        dayOfWeek: getDayOfWeek(),
        season: getSeason(),
        recentDrunk: recentDrunk.length > 0 ? recentDrunk : undefined,
      },
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return resolveBottleIds(data.cards ?? [], allCaveBottles)
}

// === Prefetch (fire-and-forget, called from AppLayout) ===

let prefetchStarted = false

export async function prefetchDefaultRecommendations(): Promise<void> {
  if (prefetchStarted) return
  prefetchStarted = true

  const queryKey = buildQueryKey('food', null)
  if (getCachedRecommendation(queryKey)) return

  try {
    // Fetch data directly from Supabase (no hooks here)
    const [caveRes, drunkRes, profileRes] = await Promise.all([
      supabase.from('bottles').select('*').eq('status', 'in_stock'),
      supabase.from('bottles').select('*').eq('status', 'drunk').order('drunk_at', { ascending: false }).limit(30),
      supabase.from('user_taste_profiles').select('computed_profile, explicit_preferences, computed_at').maybeSingle(),
    ])

    const caveBottles = (caveRes.data ?? []) as Bottle[]
    const drunkBottles = (drunkRes.data ?? []) as Bottle[]
    const profile: TasteProfile | null = profileRes.data
      ? {
          computed: profileRes.data.computed_profile as TasteProfile['computed'],
          explicit: (profileRes.data.explicit_preferences as TasteProfile['explicit']) ?? {},
          computedAt: profileRes.data.computed_at ?? '',
        }
      : null

    const ranked = rankCaveBottles('food', null, caveBottles, drunkBottles, profile, 24)
    const shortlistedBottles = ranked.map((item) => item.bottle)
    const cards = await callRecommendApi('food', null, profile, shortlistedBottles, drunkBottles, caveBottles)
    setCachedRecommendation(queryKey, cards)
    console.log('[prefetch] Default recommendations cached')
  } catch (err) {
    // Fire-and-forget: don't crash, the hook will retry on page visit
    console.warn('[prefetch] Failed:', err)
    prefetchStarted = false
  }
}

// === Hook (used by CeSoirModule) ===

export function useRecommendations(
  mode: Mode,
  query: string | null
): {
  cards: RecommendationCard[]
  loading: boolean
  error: string | null
} {
  const [cards, setCards] = useState<RecommendationCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { bottles: caveBottles, loading: cavesLoading } = useBottles()
  const { bottles: drunkBottles, loading: drunkLoading } = useRecentlyDrunk()
  const { profile, loading: profileLoading } = useTasteProfile()

  const dataReady = !cavesLoading && !drunkLoading && !profileLoading

  const requestIdRef = useRef(0)

  const caveRef = useRef(caveBottles)
  const drunkRef = useRef(drunkBottles)
  const profileRef = useRef(profile)
  caveRef.current = caveBottles
  drunkRef.current = drunkBottles
  profileRef.current = profile

  useEffect(() => {
    const queryKey = buildQueryKey(mode, query)
    const cached = getCachedRecommendation(queryKey)
    if (cached) {
      setCards(cached)
      setLoading(false)
      setError(null)
    } else {
      setCards([])
      setLoading(true)
      setError(null)
    }
  }, [mode, query])

  const fetchRecommendations = useCallback(async () => {
    const queryKey = buildQueryKey(mode, query)

    const cached = getCachedRecommendation(queryKey)
    const ranked = rankCaveBottles(mode, query, caveRef.current, drunkRef.current, profileRef.current, 24)
    const shortlistedBottles = ranked.map((item) => item.bottle)
    const localCards = buildLocalRecommendationCards(ranked, query)

    if (!cached && localCards.length > 0) {
      setCards(localCards)
      setLoading(false)
      setError(null)
    } else if (cached) {
      setCards(cached)
      setLoading(false)
      setError(null)
    } else {
      setLoading(true)
      setError(null)
    }

    const currentRequestId = ++requestIdRef.current

    try {
      const resolved = await callRecommendApi(
        mode,
        query,
        profileRef.current,
        shortlistedBottles,
        drunkRef.current,
        caveRef.current,
      )

      if (currentRequestId !== requestIdRef.current) return

      setCachedRecommendation(queryKey, resolved)
      setCards(resolved)
      setError(null)
    } catch (err) {
      if (currentRequestId !== requestIdRef.current) return
      console.error('[useRecommendations] fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur de recommandation')
      if (localCards.length > 0) {
        setCards(localCards)
      } else if (cached) {
        setCards(cached)
      } else {
        setCards(FALLBACK_CARDS)
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [mode, query])

  useEffect(() => {
    if (dataReady) {
      fetchRecommendations()
    }
  }, [dataReady, fetchRecommendations])

  return { cards, loading, error }
}
