import { supabase } from '@/lib/supabase'

export interface CandidateSignalRow {
  id: string
  signal_type: string
  payload: Record<string, unknown>
  created_at: string
  consumed_at: string | null
  consumed_by_patch_id: string | null
}

export interface ProfilePatchRow {
  id: string
  profile_version_before: number
  profile_version_after: number
  action: string
  section: string | null
  content: string | null
  reason: string | null
  based_on_signal_ids: string[]
  llm_model: string | null
  applied_at: string
}

export async function loadRecentCandidateSignals(limit = 20): Promise<CandidateSignalRow[]> {
  const { data, error } = await supabase
    .from('profile_candidate_signals')
    .select('id, signal_type, payload, created_at, consumed_at, consumed_by_patch_id')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CandidateSignalRow[]
}

export async function loadRecentProfilePatches(limit = 20): Promise<ProfilePatchRow[]> {
  const { data, error } = await supabase
    .from('profile_patches')
    .select('id, profile_version_before, profile_version_after, action, section, content, reason, based_on_signal_ids, llm_model, applied_at')
    .order('applied_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as ProfilePatchRow[]
}
