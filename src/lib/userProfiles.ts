import { supabase } from '@/lib/supabase'

export interface UserProfileRow {
  user_id: string
  compiled_markdown: string | null
  updated_at: string
  version: number
  last_compiled_from_event_at: string | null
  last_compilation_reason: string | null
  compilation_status: string | null
}

async function ensureFreshSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error

  const activeSession = data.session
  const expiresAtMs = activeSession?.expires_at ? activeSession.expires_at * 1000 : null
  const shouldRefresh = !activeSession || (expiresAtMs != null && expiresAtMs <= Date.now() + 60_000)

  if (shouldRefresh) {
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) throw refreshError
  }
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const maybeContext = (error as { context?: Response } | null)?.context
  if (maybeContext instanceof Response) {
    try {
      const raw = await maybeContext.text()
      return `HTTP ${maybeContext.status}${raw ? `: ${raw}` : ''}`
    } catch {
      return `HTTP ${maybeContext.status}`
    }
  }

  return error instanceof Error ? error.message : String(error)
}

export async function loadUserProfile(): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, compiled_markdown, updated_at, version, last_compiled_from_event_at, last_compilation_reason, compilation_status')
    .maybeSingle()

  if (error) throw error
  return data as UserProfileRow | null
}

export async function compileUserProfile(reason = 'manual_debug_force'): Promise<UserProfileRow> {
  await ensureFreshSession()

  const { data, error } = await supabase.functions.invoke('compile-user-profile', {
    body: { reason, forceFullRewrite: true },
  })

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error))
  }
  return data?.profile as UserProfileRow
}

export async function ensureCompiledUserProfile(reason = 'auto_runtime_bootstrap'): Promise<UserProfileRow> {
  const existing = await loadUserProfile()
  if (existing?.compiled_markdown?.trim()) {
    return existing
  }

  return compileUserProfile(reason)
}
