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
 */
export function buildRequestBody(fixture, message, history, conversationState, provider) {
  return {
    message,
    history,
    cave: fixture.cave ?? [],
    profile: fixture.profile,
    memories: fixture.memories,
    context: fixture.context,
    debugTrace: true,
    ...(conversationState ? { conversationState } : {}),
    ...(provider ? { provider } : {}),
    ...(fixture.compiledProfileMarkdown ? { compiledProfileMarkdown: fixture.compiledProfileMarkdown } : {}),
  }
}

/**
 * Single-turn scenario body — uses fixture.history as-is (preserves legacy format).
 */
export function buildSingleTurnBody(fixture, scenario, provider) {
  const history = (scenario.history ?? fixture.history ?? []).map((turn) => ({
    role: turn.role,
    text: turn.content,
  }))

  return {
    message: scenario.message,
    history,
    cave: fixture.cave ?? [],
    profile: fixture.profile,
    memories: fixture.memories,
    context: fixture.context,
    debugTrace: true,
    ...(provider ? { provider } : {}),
    ...(fixture.compiledProfileMarkdown ? { compiledProfileMarkdown: fixture.compiledProfileMarkdown } : {}),
  }
}

/**
 * POST to the deployed celestin edge function. Throws on HTTP error.
 */
export async function callCelestin(body, baseUrl, anonKey) {
  const start = Date.now()
  const res = await fetch(`${baseUrl}/functions/v1/celestin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
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
