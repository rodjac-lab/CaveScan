import { supabase } from '@/lib/supabase'

export type AdminCelestinDailyHealth = {
  day: string
  turns: number
  successful_turns: number
  failed_turns: number
  edge_p50_ms: number | null
  edge_p95_ms: number | null
  llm_p50_ms: number | null
  llm_p95_ms: number | null
  frontend_total_p50_ms: number | null
  frontend_total_p95_ms: number | null
  frontend_prep_p50_ms: number | null
  frontend_prep_p95_ms: number | null
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  cache_read_turns: number
  fallback_turns: number
  avg_tool_calls: number | null
}

export type AdminCelestinCostByUser = {
  user_id: string | null
  turns: number
  first_turn_at: string | null
  last_turn_at: string | null
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  cache_read_turns: number
  failed_turns: number
  edge_p95_ms: number | null
}

export type AdminCelestinSlowTurn = {
  created_at: string
  turn_id: string
  user_id: string | null
  request_source: string | null
  message_preview: string | null
  route: string | null
  turn_type: string | null
  mode: string | null
  provider: string | null
  provider_path: string | null
  edge_ms: number | null
  llm_ms: number | null
  frontend_total_ms: number | null
  frontend_prep_ms: number | null
  frontend_celestin_ms: number | null
  frontend_memory_ms: number | null
  frontend_compiled_profile_ms: number | null
  tool_calls_count: number
  tool_duration_ms: number
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  success: boolean
  error_kind: string | null
  error_message: string | null
}

export type AdminCelestinObservabilitySnapshot = {
  daily: AdminCelestinDailyHealth[]
  costByUser: AdminCelestinCostByUser[]
  slowTurns: AdminCelestinSlowTurn[]
}

export function formatSupabaseError(error: unknown): string {
  if (!error) return 'Erreur inconnue'
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return String(error)

  const record = error as Record<string, unknown>
  const parts = [
    typeof record.message === 'string' ? record.message : null,
    typeof record.details === 'string' ? record.details : null,
    typeof record.hint === 'string' ? `Hint: ${record.hint}` : null,
    typeof record.code === 'string' ? `Code: ${record.code}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(record)
}

export async function loadAdminCelestinObservability(): Promise<AdminCelestinObservabilitySnapshot> {
  const [daily, costByUser, slowTurns] = await Promise.all([
    supabase.from('admin_celestin_daily_health_v').select('*').limit(14),
    supabase.from('admin_celestin_cost_by_user_v').select('*').limit(20),
    supabase.from('admin_celestin_slow_turns_v').select('*').limit(20),
  ])

  const firstError = daily.error ?? costByUser.error ?? slowTurns.error
  if (firstError) throw new Error(formatSupabaseError(firstError))

  return {
    daily: (daily.data ?? []) as AdminCelestinDailyHealth[],
    costByUser: (costByUser.data ?? []) as AdminCelestinCostByUser[],
    slowTurns: (slowTurns.data ?? []) as AdminCelestinSlowTurn[],
  }
}
