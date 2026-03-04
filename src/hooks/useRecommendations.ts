import { supabase } from '@/lib/supabase'
import { serializeProfileForPrompt } from '@/lib/taste-profile'
import { rankCaveBottles } from '@/lib/recommendationRanking'
import {
  buildQueryKey,
  getCachedRecommendation,
  setCachedRecommendation,
} from '@/lib/recommendationStore'
import type { RecommendationCard } from '@/lib/recommendationStore'
import { selectRelevantMemories, serializeMemoriesForPrompt } from '@/lib/tastingMemories'
import { getSeason, getDayOfWeek, formatDrunkSummary, resolveBottleIds } from '@/lib/contextHelpers'
import type { Bottle, TasteProfile } from '@/lib/types'

// === Prefetch (fire-and-forget, called from AppLayout) ===

let prefetchStarted = false

export async function prefetchDefaultRecommendations(): Promise<void> {
  if (prefetchStarted) return
  prefetchStarted = true

  const queryKey = buildQueryKey('generic', null)
  if (getCachedRecommendation(queryKey)) return

  try {
    const [caveRes, drunkRes] = await Promise.all([
      supabase.from('bottles').select('*').eq('status', 'in_stock'),
      supabase.from('bottles').select('*').eq('status', 'drunk').order('drunk_at', { ascending: false }).limit(30),
    ])
    const profileRes = await supabase
      .from('user_taste_profiles')
      .select('computed_profile, explicit_preferences, computed_at')
      .maybeSingle()

    const caveBottles = (caveRes.data ?? []) as Bottle[]
    const drunkBottles = (drunkRes.data ?? []) as Bottle[]
    const profile: TasteProfile | null = profileRes.data
      ? {
          computed: profileRes.data.computed_profile as TasteProfile['computed'],
          explicit: (profileRes.data.explicit_preferences as TasteProfile['explicit']) ?? {},
          computedAt: profileRes.data.computed_at ?? '',
        }
      : null

    const ranked = rankCaveBottles('generic', null, caveBottles, drunkBottles, profile, 24)
    const caveSummary = ranked.map(({ bottle, score }) => ({
      id: bottle.id.substring(0, 8),
      domaine: bottle.domaine,
      appellation: bottle.appellation,
      millesime: bottle.millesime,
      couleur: bottle.couleur,
      character: bottle.character,
      cuvee: bottle.cuvee,
      local_score: Math.round(score * 100) / 100,
    }))

    const profileStr = profile ? serializeProfileForPrompt(profile) : undefined
    const memories = selectRelevantMemories('generic', null, drunkBottles)
    const memoriesStr = serializeMemoriesForPrompt(memories) || undefined
    const recentDrunk = drunkBottles.slice(0, 5).map(formatDrunkSummary)

    const { data, error } = await supabase.functions.invoke('celestin', {
      body: {
        message: '__prefetch__',
        history: [],
        cave: caveSummary,
        profile: profileStr,
        memories: memoriesStr,
        context: {
          dayOfWeek: getDayOfWeek(),
          season: getSeason(),
          recentDrunk: recentDrunk.length > 0 ? recentDrunk : undefined,
        },
      },
    })

    if (error) throw error
    if (data?.error) throw new Error(data.error)

    // Resolve bottle IDs (short 8-char → full UUID)
    const cards = resolveBottleIds((data.cards ?? []) as RecommendationCard[], caveBottles)

    const text: string | null = typeof data.text === 'string' ? data.text : null
    setCachedRecommendation(queryKey, { text, cards })
    console.log('[prefetch] Default recommendations cached via celestin')
  } catch (err) {
    console.warn('[prefetch] Failed:', err)
    prefetchStarted = false
  }
}
