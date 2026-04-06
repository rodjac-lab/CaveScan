import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { buildCompiledProfileMarkdown } from "../../../shared/celestin/compiled-profile.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CompileRequestBody {
  reason?: string
  forceFullRewrite?: boolean
}

async function getAuthenticatedUserId(req: Request, supabase: ReturnType<typeof createClient>): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) throw new Error('Missing Authorization token')

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw new Error('Unable to authenticate user')
  }

  return data.user.id
}

function scoreMoment(tasting: Record<string, unknown>): number {
  const rating = typeof tasting.rating === 'number' ? tasting.rating : 0
  const note = String(tasting.tasting_note ?? '')
  const sentiment = String((tasting.tasting_tags as { sentiment?: string } | null)?.sentiment ?? '')
  let score = rating * 10
  if (sentiment === 'excellent') score += 4
  else if (sentiment === 'bon') score += 1
  if (note.length > 180) score += 2
  if (/\b19\/20\b|\bgrand vin\b|\bincroyable\b|\bsublime\b/i.test(note)) score += 3
  return score
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let userId: string | null = null
  let reason = 'manual_compile'

  try {
    const body = (await req.json().catch(() => ({}))) as CompileRequestBody
    userId = await getAuthenticatedUserId(req, supabase)
    reason = body.reason?.trim() || 'manual_compile'

    await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: userId,
          compilation_status: 'compiling',
          last_compilation_reason: reason,
        },
        { onConflict: 'user_id' }
      )

    const [
      { data: profileRow, error: profileError },
      { data: memoryFacts, error: factsError },
      { data: topTastings, error: topTastingsError },
      { data: recentTastings, error: recentTastingsError },
      { data: existingProfile, error: existingProfileError },
    ] = await Promise.all([
      supabase
        .from('user_taste_profiles')
        .select('computed_profile, explicit_preferences')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('user_memory_facts')
        .select('category, fact, confidence, is_temporary, created_at, expires_at, superseded_by')
        .eq('user_id', userId)
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('bottles')
        .select('domaine, cuvee, appellation, millesime, drunk_at, rating, tasting_note, tasting_tags')
        .eq('user_id', userId)
        .eq('status', 'drunk')
        .not('tasting_note', 'is', null)
        .order('drunk_at', { ascending: false })
        .limit(30),
      supabase
        .from('bottles')
        .select('domaine, cuvee, appellation, millesime, drunk_at, rating, tasting_note, tasting_tags')
        .eq('user_id', userId)
        .eq('status', 'drunk')
        .order('drunk_at', { ascending: false })
        .limit(12),
      supabase
        .from('user_profiles')
        .select('version')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

    if (profileError) throw profileError
    if (factsError) throw factsError
    if (topTastingsError) throw topTastingsError
    if (recentTastingsError) throw recentTastingsError
    if (existingProfileError) throw existingProfileError

    const activeFacts = (memoryFacts ?? []).filter((fact) => {
      const expiresAt = fact.expires_at ? new Date(String(fact.expires_at)).getTime() : null
      return !fact.is_temporary || (expiresAt != null && expiresAt > Date.now())
    })

    const sortedTopTastings = [...(topTastings ?? [])]
      .sort((left, right) => scoreMoment(right as Record<string, unknown>) - scoreMoment(left as Record<string, unknown>))
      .slice(0, 8)

    const markdown = buildCompiledProfileMarkdown({
      computedProfile: (profileRow?.computed_profile as Record<string, unknown> | null) ?? null,
      questionnaireProfile: (profileRow?.explicit_preferences as { questionnaire?: Record<string, unknown> } | null)?.questionnaire ?? null,
      memoryFacts: activeFacts as Array<Record<string, unknown>>,
      topTastings: sortedTopTastings as Array<Record<string, unknown>>,
      recentTastings: (recentTastings ?? []) as Array<Record<string, unknown>>,
    })

    const version = Math.max(1, Number(existingProfile?.version ?? 0) + 1)
    const now = new Date().toISOString()

    const { data: savedProfile, error: saveError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: userId,
          compiled_markdown: markdown,
          version,
          last_compiled_from_event_at: now,
          last_compilation_reason: reason,
          compilation_status: 'ready',
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )
      .select('user_id, compiled_markdown, updated_at, version, last_compiled_from_event_at, last_compilation_reason, compilation_status')
      .single()

    if (saveError) throw saveError

    return new Response(JSON.stringify({ success: true, profile: savedProfile, forceFullRewrite: !!body.forceFullRewrite }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[compile-user-profile] Error:', message)

    if (userId) {
      await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: userId,
            compilation_status: 'error',
            last_compilation_reason: reason,
          },
          { onConflict: 'user_id' },
        )
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
