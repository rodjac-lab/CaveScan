import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { computeTasteProfile, triggerProfileRecompute } from '@/lib/taste-profile'
import type {
  Bottle,
  TasteProfile,
  ComputedTasteProfile,
  ExplicitPreferences,
} from '@/lib/types'

export function useTasteProfile() {
  const [profile, setProfile] = useState<TasteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('user_taste_profiles')
        .select('computed_profile, explicit_preferences, computed_at')
        .maybeSingle()

      if (fetchError) throw fetchError

      if (data) {
        setProfile({
          computed: data.computed_profile as ComputedTasteProfile,
          explicit: (data.explicit_preferences as ExplicitPreferences) ?? {},
          computedAt: data.computed_at ?? '',
        })
      } else {
        setProfile(null)
      }
    } catch (err) {
      console.error('[useTasteProfile] fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur de chargement du profil')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const recompute = useCallback(
    async (inStock: Bottle[], drunk: Bottle[]) => {
      try {
        const computed = computeTasteProfile(inStock, drunk)
        const now = new Date().toISOString()

        await supabase
          .from('user_taste_profiles')
          .upsert(
            {
              computed_profile: computed,
              computed_at: now,
              updated_at: now,
            },
            { onConflict: 'user_id' }
          )

        setProfile((prev) => ({
          computed,
          explicit: prev?.explicit ?? {},
          computedAt: now,
        }))
      } catch (err) {
        console.error('[useTasteProfile] recompute failed:', err)
      }
    },
    []
  )

  const refetch = useCallback(async () => {
    await fetchProfile()
  }, [fetchProfile])

  return { profile, loading, error, recompute, refetch, triggerProfileRecompute }
}
