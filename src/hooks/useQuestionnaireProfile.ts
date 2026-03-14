import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { QuestionnaireProfile } from '@/lib/questionnaire-profile'

/**
 * Hook to load and save the Célestin questionnaire profile.
 * Stored in user_taste_profiles.explicit_preferences.questionnaire (JSONB).
 */
export function useQuestionnaireProfile() {
  const [profile, setProfile] = useState<QuestionnaireProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_taste_profiles')
        .select('explicit_preferences')
        .maybeSingle()

      if (error) throw error

      const questionnaire = data?.explicit_preferences?.questionnaire as QuestionnaireProfile | undefined
      setProfile(questionnaire?.completedAt ? questionnaire : null)
    } catch (err) {
      console.error('[useQuestionnaireProfile] fetch failed:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const saveProfile = useCallback(async (questionnaireData: QuestionnaireProfile) => {
    try {
      // First, fetch existing explicit_preferences to merge
      const { data: existing } = await supabase
        .from('user_taste_profiles')
        .select('explicit_preferences')
        .maybeSingle()

      const existingPrefs = (existing?.explicit_preferences as Record<string, unknown>) ?? {}
      const merged = { ...existingPrefs, questionnaire: questionnaireData }
      const now = new Date().toISOString()

      // Upsert into user_taste_profiles
      const { error } = await supabase
        .from('user_taste_profiles')
        .upsert(
          {
            explicit_preferences: merged,
            updated_at: now,
          },
          { onConflict: 'user_id' }
        )

      if (error) throw error

      setProfile(questionnaireData)
    } catch (err) {
      console.error('[useQuestionnaireProfile] save failed:', err)
    }
  }, [])

  const clearProfile = useCallback(async () => {
    try {
      const { data: existing } = await supabase
        .from('user_taste_profiles')
        .select('explicit_preferences')
        .maybeSingle()

      if (existing) {
        const existingPrefs = (existing.explicit_preferences as Record<string, unknown>) ?? {}
        const { questionnaire: _, ...rest } = existingPrefs
        await supabase
          .from('user_taste_profiles')
          .update({ explicit_preferences: rest, updated_at: new Date().toISOString() })
          .not('user_id', 'is', null)  // RLS handles the user filter
      }

      setProfile(null)
    } catch (err) {
      console.error('[useQuestionnaireProfile] clear failed:', err)
    }
  }, [])

  return { profile, loading, saveProfile, clearProfile, refetch: fetchProfile }
}
