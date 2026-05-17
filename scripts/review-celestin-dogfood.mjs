#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { readEnvFile } from '../evals/lib/runner.mjs'

const DEFAULT_HOURS = 48
const DEFAULT_LIMIT = 80
const DEFAULT_WINDOW_MINUTES = 20

function parseFlagValue(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]
  const eq = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function loadEnv() {
  return {
    ...readEnvFile('.env.local'),
    ...readEnvFile('.env.playwright.local'),
    ...process.env,
  }
}

function requireEnv(env, key) {
  const value = env[key]?.trim()
  if (!value) throw new Error(`Missing ${key}. Add it to .env.local or export it before running this script.`)
  return value
}

function loadAdminCreds(env) {
  const email = env.CELESTIN_ADMIN_EMAIL?.trim()
    || env.TEST_USER_EMAIL?.trim()
    || env.PLAYWRIGHT_TEST_EMAIL?.trim()
  const password = env.CELESTIN_ADMIN_PASSWORD?.trim()
    || env.TEST_USER_PASSWORD?.trim()
    || env.PLAYWRIGHT_TEST_PASSWORD?.trim()

  if (!email || !password) return null
  return { email, password }
}

function parseNumberFlag(name, fallback) {
  const raw = parseFlagValue(name)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --${name}: ${raw}`)
  }
  return value
}

function parseDate(value, flagName) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --${flagName}: ${value}`)
  return date
}

function dateRange() {
  const around = parseFlagValue('around')
  if (around) {
    const center = parseDate(around, 'around')
    const windowMs = parseNumberFlag('window-min', DEFAULT_WINDOW_MINUTES) * 60 * 1000
    return {
      since: new Date(center.getTime() - windowMs).toISOString(),
      until: new Date(center.getTime() + windowMs).toISOString(),
      label: `around ${around} (+/- ${Math.round(windowMs / 60000)} min)`,
    }
  }

  const since = parseFlagValue('since')
  if (since) {
    return {
      since: parseDate(since, 'since').toISOString(),
      until: null,
      label: `since ${since}`,
    }
  }

  const hours = parseNumberFlag('hours', DEFAULT_HOURS)
  return {
    since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    until: null,
    label: `last ${hours}h`,
  }
}

function formatLocalDate(iso) {
  if (!iso) return 'n/a'
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(iso))
}

function compactText(text, max = 180) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

function summarizeTurn(turn) {
  const metadata = turn.metadata && typeof turn.metadata === 'object' ? turn.metadata : {}
  const resolved = metadata.resolvedSources && typeof metadata.resolvedSources === 'object' ? metadata.resolvedSources : {}
  const providerErrors = Array.isArray(turn.provider_errors) ? turn.provider_errors : []

  return {
    localTime: formatLocalDate(turn.created_at),
    capability: turn.capability ?? 'UNKNOWN',
    mode: turn.response_mode ?? turn.mode ?? 'n/a',
    provider: [turn.provider, turn.provider_path].filter(Boolean).join('/') || 'n/a',
    latency: turn.frontend_total_ms ?? turn.edge_function_ms ?? turn.edge_ms ?? null,
    llm: turn.llm_ms ?? null,
    tools: Array.isArray(turn.tool_names) && turn.tool_names.length
      ? `${turn.tool_names.join(', ')} (${turn.tool_calls_count ?? 0})`
      : `${turn.tool_calls_count ?? 0}`,
    ui: turn.ui_action_kind ?? 'none',
    success: turn.success ? 'ok' : 'KO',
    error: turn.error_message || providerErrors.join(' | ') || '',
    readiness: [
      metadata.recommendationReady === true ? 'recoReady' : null,
      metadata.recommendationReady === false ? 'recoNotReady' : null,
      metadata.actionReady === true ? 'actionReady' : null,
      metadata.actionReady === false ? 'actionNotReady' : null,
      resolved.tastings?.factReadiness ? `fact:${resolved.tastings.factReadiness}` : null,
    ].filter(Boolean).join(', '),
  }
}

async function fetchTurns(supabase, range) {
  const limit = parseNumberFlag('limit', DEFAULT_LIMIT)
  const source = parseFlagValue('source') ?? 'dogfood_v2'
  const sessionId = parseFlagValue('session')
  const userId = parseFlagValue('user-id')
  const orchestration = parseFlagValue('orchestration') ?? 'v2'

  let query = supabase
    .from('celestin_turn_observability')
    .select([
      'created_at',
      'turn_id',
      'user_id',
      'session_id',
      'request_source',
      'message_preview',
      'route',
      'turn_type',
      'mode',
      'orchestration_version',
      'capability',
      'confidence',
      'action_contract',
      'response_mode',
      'provider',
      'provider_path',
      'provider_errors',
      'edge_ms',
      'edge_function_ms',
      'llm_ms',
      'frontend_total_ms',
      'tool_calls_count',
      'tool_duration_ms',
      'tool_names',
      'ui_action_kind',
      'success',
      'error_kind',
      'error_message',
      'input_tokens',
      'output_tokens',
      'metadata',
    ].join(', '))
    .gte('created_at', range.since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (range.until) query = query.lte('created_at', range.until)
  if (!hasFlag('all-sources')) query = query.eq('request_source', source)
  if (orchestration !== 'all') query = query.eq('orchestration_version', orchestration)
  if (sessionId) query = query.eq('session_id', sessionId)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function fetchMessagesBySession(supabase, sessionIds) {
  if (sessionIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('chat_messages')
    .select('session_id, role, content, has_image, ui_action_kind, cognitive_mode, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true })

  if (error) throw error

  const bySession = new Map()
  for (const message of data ?? []) {
    const list = bySession.get(message.session_id) ?? []
    list.push(message)
    bySession.set(message.session_id, list)
  }
  return bySession
}

function groupTurnsBySession(turns) {
  const sessions = new Map()
  for (const turn of turns) {
    const key = turn.session_id ?? `turn:${turn.turn_id}`
    const list = sessions.get(key) ?? []
    list.push(turn)
    sessions.set(key, list)
  }

  return [...sessions.entries()]
    .map(([sessionId, sessionTurns]) => ({
      sessionId,
      turns: sessionTurns.sort((left, right) => new Date(left.created_at) - new Date(right.created_at)),
    }))
    .sort((left, right) => new Date(right.turns.at(-1)?.created_at ?? 0) - new Date(left.turns.at(-1)?.created_at ?? 0))
}

function printMarkdown({ range, turns, messagesBySession }) {
  const grouped = groupTurnsBySession(turns)
  const fallbackCount = turns.filter((turn) => turn.provider_path === 'fallback_response').length
  const failedCount = turns.filter((turn) => !turn.success).length
  const toolTurns = turns.filter((turn) => Number(turn.tool_calls_count ?? 0) > 0).length

  console.log(`# Celestin dogfood review`)
  console.log('')
  console.log(`- Filter: ${range.label}`)
  console.log(`- Turns: ${turns.length}`)
  console.log(`- Sessions: ${grouped.length}`)
  console.log(`- Fallback turns: ${fallbackCount}`)
  console.log(`- Failed turns: ${failedCount}`)
  console.log(`- Tool turns: ${toolTurns}`)

  for (const group of grouped) {
    const firstTurn = group.turns[0]
    const lastTurn = group.turns.at(-1)
    const sessionMessages = messagesBySession.get(group.sessionId) ?? []

    console.log('')
    console.log(`## Session ${group.sessionId}`)
    console.log('')
    console.log(`- Window: ${formatLocalDate(firstTurn.created_at)} -> ${formatLocalDate(lastTurn.created_at)}`)
    console.log(`- User: ${firstTurn.user_id ?? 'n/a'}`)
    console.log(`- Messages persisted: ${sessionMessages.length}`)
    console.log('')
    console.log('| Time | Capability | Mode | Provider | Latency | LLM | Tools | UI | Status | Readiness | User preview |')
    console.log('| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |')

    for (const turn of group.turns) {
      const summary = summarizeTurn(turn)
      console.log([
        summary.localTime,
        summary.capability,
        summary.mode,
        summary.provider,
        summary.latency ?? '',
        summary.llm ?? '',
        summary.tools,
        summary.ui,
        summary.success,
        summary.readiness,
        compactText(turn.message_preview),
      ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))

      if (summary.error) {
        console.log(``)
        console.log(`> Error ${turn.turn_id}: ${compactText(summary.error, 500)}`)
      }
    }

    if (sessionMessages.length > 0) {
      console.log('')
      console.log('Transcript:')
      for (const message of sessionMessages) {
        const role = message.role === 'celestin' ? 'assistant' : message.role
        const image = message.has_image ? ' [image]' : ''
        const action = message.ui_action_kind ? ` [${message.ui_action_kind}]` : ''
        console.log(`- ${formatLocalDate(message.created_at)} ${role}${image}${action}: ${compactText(message.content, hasFlag('full-messages') ? 1200 : 260)}`)
      }
    }
  }
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = requireEnv(env, 'VITE_SUPABASE_URL')
  const supabaseAnonKey = requireEnv(env, 'VITE_SUPABASE_ANON_KEY')
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || env.SUPABASE_SERVICE_ROLE?.trim()
    || env.SUPABASE_SERVICE_KEY?.trim()

  const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (!serviceRoleKey) {
    const creds = loadAdminCreds(env)
    if (!creds) {
      throw new Error(
        'Missing SUPABASE_SERVICE_ROLE_KEY or admin credentials. ' +
        'Set SUPABASE_SERVICE_ROLE_KEY, or CELESTIN_ADMIN_EMAIL/CELESTIN_ADMIN_PASSWORD. ' +
        'TEST_USER_EMAIL/TEST_USER_PASSWORD also works when that user is allowed to read the target data.'
      )
    }

    const { error } = await supabase.auth.signInWithPassword(creds)
    if (error) throw new Error(`Failed to sign in ${creds.email}: ${error.message}`)
  }

  const range = dateRange()
  const turns = await fetchTurns(supabase, range)
  const sessionIds = [...new Set(turns.map((turn) => turn.session_id).filter(Boolean))]
  const messagesBySession = await fetchMessagesBySession(supabase, sessionIds)

  if (hasFlag('json')) {
    console.log(JSON.stringify({ range, turns, messagesBySession: Object.fromEntries(messagesBySession) }, null, 2))
    return
  }

  printMarkdown({ range, turns, messagesBySession })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
