import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type TimingBody = {
  turnId?: string
  prepMs?: number
  celestinMs?: number
  totalMs?: number
  memoryMs?: number
  compiledProfileMs?: number
  classifierMs?: number
}

function nonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

async function getAuthenticatedUserId(req: Request, supabase: ReturnType<typeof createClient>): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Missing Authorization token')

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) throw new Error('Unable to authenticate user')

  return data.user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const userId = await getAuthenticatedUserId(req, supabase)
    const body = (await req.json().catch(() => ({}))) as TimingBody
    const turnId = typeof body.turnId === 'string' ? body.turnId.trim() : ''
    if (!turnId) throw new Error('Missing turnId')

    const { data, error } = await supabase
      .from('celestin_turn_observability')
      .update({
        frontend_recorded_at: new Date().toISOString(),
        frontend_prep_ms: nonNegativeInteger(body.prepMs),
        frontend_celestin_ms: nonNegativeInteger(body.celestinMs),
        frontend_total_ms: nonNegativeInteger(body.totalMs),
        frontend_memory_ms: nonNegativeInteger(body.memoryMs),
        frontend_compiled_profile_ms: nonNegativeInteger(body.compiledProfileMs),
        frontend_classifier_ms: nonNegativeInteger(body.classifierMs),
      })
      .eq('turn_id', turnId)
      .eq('user_id', userId)
      .select('turn_id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('No matching Celestin turn for this user')

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[record-celestin-client-timing] failed:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
