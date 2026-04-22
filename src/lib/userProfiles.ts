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

let compiledProfileCache: Promise<UserProfileRow | null> | null = null

export function invalidateCompiledUserProfileCache(): void {
  compiledProfileCache = null
}

export async function getCompiledUserProfileCached(): Promise<UserProfileRow | null> {
  if (compiledProfileCache) return compiledProfileCache
  const promise = (async () => {
    try {
      return await ensureCompiledUserProfile('auto_runtime_bootstrap')
    } catch {
      try {
        return await loadUserProfile()
      } catch {
        return null
      }
    }
  })()
  compiledProfileCache = promise
  promise.catch(() => { compiledProfileCache = null })
  return promise
}

export async function compileUserProfile(reason = 'manual_debug_force'): Promise<UserProfileRow> {
  await ensureFreshSession()

  const { data, error } = await supabase.functions.invoke('compile-user-profile', {
    body: { reason, forceFullRewrite: true },
  })

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error))
  }
  invalidateCompiledUserProfileCache()
  return data?.profile as UserProfileRow
}

export async function ensureCompiledUserProfile(reason = 'auto_runtime_bootstrap'): Promise<UserProfileRow> {
  const existing = await loadUserProfile()
  if (existing?.compiled_markdown?.trim()) {
    return existing
  }

  return compileUserProfile(reason)
}

export interface PatchProfileResponse {
  success: boolean
  action?: 'add' | 'edit' | 'remove' | 'no_change'
  section?: string | null
  changed?: boolean
  apply_error?: string | null
  patch_id?: string
  version?: number
  signals_consumed?: number
  reason?: string
  error?: string
}

export async function patchUserProfile(reason = 'session_close'): Promise<PatchProfileResponse> {
  await ensureFreshSession()

  const { data, error } = await supabase.functions.invoke('patch-user-profile', {
    body: { reason },
  })

  if (error) {
    const message = await extractFunctionErrorMessage(error)
    return { success: false, error: message }
  }

  const response = (data ?? { success: false, error: 'Empty response' }) as PatchProfileResponse
  if (response.success && response.changed) {
    invalidateCompiledUserProfileCache()
  }
  return response
}
