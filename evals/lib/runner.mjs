/**
 * Network and filesystem helpers for the Celestin eval suite.
 * Shared between CLI runner and Vitest suite.
 */

import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const FIXTURE_DIR = path.join(ROOT, 'evals')
export const TEMPLATE_FIXTURE = path.join(FIXTURE_DIR, 'celestin-fixture.template.json')
export const DEFAULT_SCENARIOS = path.join(ROOT, 'evals', 'celestin-scenarios.json')
export const DEFAULT_CONVERSATIONS = path.join(ROOT, 'evals', 'celestin-conversations.json')
export const DEFAULT_OUT_DIR = path.join(ROOT, 'evals', 'results')

export function findLatestRealFixture() {
  if (!fs.existsSync(FIXTURE_DIR)) return null

  const candidates = fs.readdirSync(FIXTURE_DIR)
    .filter((name) => /^celestin-fixture.*\.json$/i.test(name))
    .filter((name) => name !== 'celestin-fixture.template.json')
    .map((name) => {
      const fullPath = path.join(FIXTURE_DIR, name)
      return {
        name,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  return candidates[0]?.fullPath ?? null
}

export function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const env = {}
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n/g, '')
      .trim()
    env[key] = value
  }
  return env
}

export function loadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * Build the request body for a celestin call inside a multi-turn conversation.
 * Carries conversationState forward.
 *
 * In authenticated eval mode (options.omitContext), cave/profile/memories/
 * compiledProfileMarkdown are dropped from the body so the edge function
 * loads them from the database under the JWT's user_id — that exercises the
 * prod prefetch path.
 */
export function buildRequestBody(fixture, message, history, conversationState, provider, options = {}) {
  const omitContext = options.omitContext === true
  return {
    message,
    history,
    ...(omitContext ? {} : {
      cave: fixture.cave ?? [],
      profile: fixture.profile,
      memories: fixture.memories,
      ...(fixture.compiledProfileMarkdown ? { compiledProfileMarkdown: fixture.compiledProfileMarkdown } : {}),
    }),
    context: fixture.context,
    debugTrace: true,
    requestSource: 'cli_eval',
    ...(conversationState ? { conversationState } : {}),
    ...(provider ? { provider } : {}),
  }
}

/**
 * Single-turn scenario body — uses fixture.history as-is (preserves legacy format).
 */
export function buildSingleTurnBody(fixture, scenario, provider, options = {}) {
  const omitContext = options.omitContext === true
  const history = (scenario.history ?? fixture.history ?? []).map((turn) => ({
    role: turn.role,
    text: turn.content,
  }))

  return {
    message: scenario.message,
    history,
    ...(omitContext ? {} : {
      cave: fixture.cave ?? [],
      profile: fixture.profile,
      memories: fixture.memories,
      ...(fixture.compiledProfileMarkdown ? { compiledProfileMarkdown: fixture.compiledProfileMarkdown } : {}),
    }),
    context: fixture.context,
    debugTrace: true,
    requestSource: 'cli_eval',
    ...(provider ? { provider } : {}),
  }
}

/**
 * POST to the deployed celestin edge function. Throws on HTTP error.
 *
 * options.userJwt — when set, sent as Authorization Bearer (apikey header
 * stays the anon key, which Supabase Edge requires as the project key).
 * The edge function then resolves auth.uid() from the JWT and reads the
 * user's cave/profile/memory from the database.
 */
export async function callCelestin(body, baseUrl, anonKey, options = {}) {
  const start = Date.now()
  const functionName = process.env.CELESTIN_FUNCTION_NAME?.trim() || 'celestin'
  const bearer = options.userJwt || anonKey
  const res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  })

  const elapsedMs = Date.now() - start
  const data = await res.json()
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }

  return { data, elapsedMs }
}

/**
 * Read .env.local + process.env, return Supabase URL + anon key.
 * Throws with a clear message if missing — used by both CLI and Vitest.
 */
export function loadSupabaseEnv() {
  const env = { ...readEnvFile(path.join(ROOT, '.env.local')), ...process.env }
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Either set them in .env.local or export them in your shell before running the eval.'
    )
  }

  return { supabaseUrl, supabaseAnonKey }
}

/**
 * Read TEST_USER_EMAIL / TEST_USER_PASSWORD from .env.local + process.env.
 * Returns null when either is missing (so callers can fall back to anon mode).
 */
export function loadTestUserCreds() {
  const env = { ...readEnvFile(path.join(ROOT, '.env.local')), ...process.env }
  const email = env.TEST_USER_EMAIL?.trim()
  const password = env.TEST_USER_PASSWORD?.trim()
  if (!email || !password) return null
  return { email, password }
}

/**
 * Sign in to the test account via Supabase auth and return its JWT.
 * Used by the authenticated eval path so the edge function reads cave/
 * profile/memory from the DB under the test user's RLS scope.
 */
export async function loadTestUserJwt(supabaseUrl, supabaseAnonKey, creds) {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  })
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`Failed to sign in test user (${creds.email}): ${error?.message ?? 'no session returned'}`)
  }
  return { jwt: data.session.access_token, userId: data.user.id }
}

/**
 * Resolve fixture path: explicit > latest real > template (template only OK for dry-run).
 */
export function resolveFixturePath(explicitPath, allowTemplate = false) {
  if (explicitPath) return explicitPath
  const latest = findLatestRealFixture()
  if (latest) return latest
  if (allowTemplate) return TEMPLATE_FIXTURE
  throw new Error(
    'No real fixture found in evals/. Export one from Debug ("Exporter la fixture Celestin") ' +
    'or pass --fixture evals/celestin-fixture-YYYY-MM-DD.json.'
  )
}
