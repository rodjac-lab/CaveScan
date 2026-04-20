import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { applyPatchToMarkdown, countBulletsInSection, type ProfilePatch } from "../../../shared/celestin/profile-patch.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const API_TIMEOUT_MS = 20_000
const MAX_SIGNALS = 20
const MOMENTS_MARQUANTS_SOFT_CAP = 10
const REWRITE_EVERY_N_PATCHES = 20
const REWRITE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  reason?: string
}

interface CandidateSignalRow {
  id: string
  signal_type: string
  payload: Record<string, unknown>
  created_at: string
}

interface PatchResult {
  patch: ProfilePatch
  model: string
}

const PATCH_PROMPT = `Tu es l'assistant qui entretient la mémoire compilée d'un utilisateur de Celestin (sommelier IA personnel).

Tu reçois :
1. le profil compilé actuel en Markdown (4 sections fixes)
2. les signaux candidats détectés récemment (tastings notés, contradictions, nouvelles préférences)

Tu décides d'UN SEUL patch à appliquer, ou "no_change" si rien de durable n'est vraiment appris.

# Sections autorisées

- profil_gustatif — préférences durables (cépages, styles, régions aimés)
- moments_marquants — expériences vécues, souvenirs forts, accords réussis
- explorations_en_cours — sujets que l'utilisateur explore actuellement
- style_de_conversation — préférences de ton / pédagogie

# Actions autorisées

- add : ajouter une ligne de bullet point à la section (content = texte du bullet)
- edit : modifier une ligne existante (previous_content = bullet exact actuel, content = nouveau texte)
- remove : supprimer une ligne existante (previous_content = bullet exact à retirer)
- no_change : les signaux ne justifient pas de modification durable

# Règles strictes

- Un seul patch par appel. Pas de multi-patch.
- Préfère un fait précis à une généralisation large ("A adoré le Barolo 2018" > "aime le Barolo").
- Ne réécris PAS une section entière. Chaque patch modifie UNE ligne (ou ajoute UNE ligne).
- Ne modifie jamais le format du Markdown (garde les "## Section" intacts).
- Si les signaux sont faibles, ambigus, ou contradictoires sans preuve durable → no_change.
- Pour edit et remove : previous_content doit matcher EXACTEMENT un bullet existant (avec ou sans le tiret initial).
- reason : une phrase courte qui justifie le patch (pour audit).

# Règles IMPORTANTES sur la consolidation (ne JAMAIS fusionner deux vins distincts)

Un vin est défini par la combinaison DOMAINE + CUVÉE + MILLÉSIME. Un changement dans l'un de ces trois champs = un vin différent, une expérience distincte, qui mérite sa propre entrée.

- NE FUSIONNE JAMAIS deux millésimes différents d'un même domaine. Un 2007 et un 2008 peuvent être radicalement différents (bon vs mauvais millésime), et cette différence compte pour l'amateur de vin.
- NE FUSIONNE JAMAIS deux cuvées différentes d'un même domaine, même année.
- edit = améliorer la PRÉCISION de la MÊME expérience (même domaine + cuvée + millésime). Pas consolider deux expériences distinctes.
- Si une section est déjà pleine (soft cap) et qu'un nouveau signal arrive, ne force pas un edit pour faire de la place. Choisis no_change, SAUF si le nouveau signal remplace CLAIREMENT une entrée devenue moins pertinente ou moins représentative.

# Format de réponse

JSON strict :
{
  "action": "add" | "edit" | "remove" | "no_change",
  "section": "profil_gustatif" | "moments_marquants" | "explorations_en_cours" | "style_de_conversation",
  "content": "texte du bullet (pour add ou edit)",
  "previous_content": "bullet exact actuel (pour edit ou remove)",
  "reason": "justification courte"
}

Pour "no_change", section et content peuvent être omis. reason reste utile.`

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout))
}

async function getAuthenticatedUserId(req: Request, supabase: ReturnType<typeof createClient>): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) throw new Error('Missing Authorization token')

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new Error('Unable to authenticate user')
  return data.user.id
}

function parsePatchResponse(text: string): ProfilePatch {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object in LLM response')
    parsed = JSON.parse(match[0])
  }

  const obj = parsed as Record<string, unknown>
  const action = String(obj.action ?? '')
  if (!['add', 'edit', 'remove', 'no_change'].includes(action)) {
    throw new Error(`Invalid action: ${action}`)
  }

  return {
    action: action as ProfilePatch['action'],
    section: obj.section as ProfilePatch['section'] | undefined,
    content: typeof obj.content === 'string' ? obj.content : undefined,
    previous_content: typeof obj.previous_content === 'string' ? obj.previous_content : undefined,
    reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 500) : undefined,
  }
}

async function callGemini(userPrompt: string): Promise<PatchResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PATCH_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            action: { type: 'STRING', enum: ['add', 'edit', 'remove', 'no_change'] },
            section: {
              type: 'STRING',
              enum: ['profil_gustatif', 'moments_marquants', 'explorations_en_cours', 'style_de_conversation'],
              nullable: true,
            },
            content: { type: 'STRING', nullable: true },
            previous_content: { type: 'STRING', nullable: true },
            reason: { type: 'STRING', nullable: true },
          },
          required: ['action'],
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini 2.5 Flash (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  return { patch: parsePatchResponse(text), model: 'gemini-2.5-flash' }
}

async function callClaude(userPrompt: string): Promise<PatchResult> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      system: PATCH_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  return { patch: parsePatchResponse(textContent.text), model: CLAUDE_MODEL }
}

async function generatePatchWithFallback(userPrompt: string): Promise<PatchResult> {
  const providers: Array<{ name: string; call: () => Promise<PatchResult> }> = []
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(userPrompt) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(userPrompt) })

  if (providers.length === 0) throw new Error('No API keys configured')

  const errors: string[] = []
  for (const provider of providers) {
    try {
      console.log(`[patch-user-profile] Trying ${provider.name}...`)
      return await provider.call()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[patch-user-profile] ${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}

function buildSignalDescription(signal: CandidateSignalRow): string {
  const payload = signal.payload ?? {}
  const lines: string[] = [`- [${signal.signal_type}] ${signal.created_at}`]
  for (const [key, value] of Object.entries(payload)) {
    if (value == null || value === '') continue
    const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value)
    lines.push(`    ${key}: ${rendered.slice(0, 300)}`)
  }
  return lines.join('\n')
}

async function maybeTriggerFullRewrite(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  nextVersion: number,
  authHeader: string | null,
): Promise<boolean> {
  const cadenceDue = nextVersion > 0 && nextVersion % REWRITE_EVERY_N_PATCHES === 0

  let ageDue = false
  if (!cadenceDue) {
    const { data: lastRewriteRow } = await supabase
      .from('profile_patches')
      .select('applied_at')
      .eq('user_id', userId)
      .eq('action', 'full_rewrite')
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastRewriteAt = lastRewriteRow?.applied_at ? new Date(String(lastRewriteRow.applied_at)).getTime() : 0
    ageDue = Date.now() - lastRewriteAt > REWRITE_AFTER_MS
  }

  if (!cadenceDue && !ageDue) return false

  try {
    const rewriteReason = cadenceDue ? `auto_rewrite_version_${nextVersion}` : 'auto_rewrite_stale_profile'
    const res = await fetch(`${SUPABASE_URL}/functions/v1/compile-user-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader ?? `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ reason: rewriteReason, forceFullRewrite: true }),
    })

    if (!res.ok) {
      console.warn(`[patch-user-profile] rewrite failed: HTTP ${res.status}`)
      return false
    }

    await supabase.from('profile_patches').insert({
      user_id: userId,
      profile_version_before: nextVersion,
      profile_version_after: nextVersion + 1,
      action: 'full_rewrite',
      reason: rewriteReason,
      llm_model: 'compile-user-profile',
    })

    return true
  } catch (err) {
    console.warn('[patch-user-profile] rewrite error:', err)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody
    const userId = await getAuthenticatedUserId(req, supabase)
    const reason = body.reason?.trim() || 'session_close'

    const { data: signals, error: signalsError } = await supabase
      .from('profile_candidate_signals')
      .select('id, signal_type, payload, created_at')
      .eq('user_id', userId)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_SIGNALS)

    if (signalsError) throw signalsError

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, action: 'no_change', reason: 'no_signals' }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('user_profiles')
      .select('compiled_markdown, version')
      .eq('user_id', userId)
      .maybeSingle()

    if (profileError) throw profileError

    const currentMarkdown = profileRow?.compiled_markdown ?? ''
    const currentVersion = Number(profileRow?.version ?? 0)

    if (!currentMarkdown.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'No compiled profile yet — run compile-user-profile first' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const momentsCount = countBulletsInSection(currentMarkdown, 'moments_marquants')
    const userPrompt = [
      `Profil compilé actuel :\n\n${currentMarkdown}`,
      `\nSignaux candidats à examiner (les plus récents en premier) :\n\n${(signals as CandidateSignalRow[]).map(buildSignalDescription).join('\n')}`,
      momentsCount >= MOMENTS_MARQUANTS_SOFT_CAP
        ? `\nAttention : la section moments_marquants contient déjà ${momentsCount} entrées. Si ce signal ne remplace pas CLAIREMENT une entrée existante devenue moins représentative, réponds no_change. Ne fusionne surtout pas des expériences distinctes (millésimes ou cuvées différents).`
        : '',
    ].join('')

    const { patch, model } = await generatePatchWithFallback(userPrompt)

    let nextMarkdown = currentMarkdown
    let changed = false
    let applyError: string | undefined

    if (patch.action !== 'no_change') {
      const result = applyPatchToMarkdown(currentMarkdown, patch)
      nextMarkdown = result.markdown
      changed = result.changed
      applyError = result.error
    }

    const now = new Date().toISOString()
    const nextVersion = changed ? currentVersion + 1 : currentVersion
    const signalIds = (signals as CandidateSignalRow[]).map((s) => s.id)

    if (changed) {
      const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: userId,
            compiled_markdown: nextMarkdown,
            version: nextVersion,
            last_compiled_from_event_at: now,
            last_compilation_reason: reason,
            compilation_status: 'ready',
            updated_at: now,
          },
          { onConflict: 'user_id' },
        )
      if (upsertError) throw upsertError
    }

    const { data: patchRow, error: patchInsertError } = await supabase
      .from('profile_patches')
      .insert({
        user_id: userId,
        profile_version_before: currentVersion,
        profile_version_after: nextVersion,
        action: patch.action,
        section: patch.section ?? null,
        content: patch.content ?? patch.previous_content ?? null,
        reason: patch.reason ?? applyError ?? reason,
        based_on_signal_ids: signalIds,
        llm_model: model,
      })
      .select('id')
      .single()

    if (patchInsertError) throw patchInsertError

    const { error: consumeError } = await supabase
      .from('profile_candidate_signals')
      .update({ consumed_at: now, consumed_by_patch_id: patchRow.id })
      .in('id', signalIds)

    if (consumeError) throw consumeError

    const rewriteTriggered = changed
      ? await maybeTriggerFullRewrite(supabase, userId, nextVersion, req.headers.get('Authorization'))
      : false

    return new Response(
      JSON.stringify({
        success: true,
        action: patch.action,
        section: patch.section ?? null,
        changed,
        apply_error: applyError ?? null,
        patch_id: patchRow.id,
        version: nextVersion,
        signals_consumed: signalIds.length,
        rewrite_triggered: rewriteTriggered,
      }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[patch-user-profile] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
