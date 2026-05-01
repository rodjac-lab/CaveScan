import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export type SupabaseServiceClient = ReturnType<typeof createClient>

export interface AuthContext {
  userId: string | null
  supabase: SupabaseServiceClient | null
}

export function createServiceClient(): SupabaseServiceClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export async function resolveAuthContext(req: Request): Promise<AuthContext> {
  const supabase = createServiceClient()
  if (!supabase) return { userId: null, supabase: null }

  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { userId: null, supabase }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) {
    console.warn('[celestin:auth] Could not resolve authenticated user for tools:', error?.message ?? 'missing user')
    return { userId: null, supabase }
  }

  return { userId: data.user.id, supabase }
}
