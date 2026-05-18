#!/usr/bin/env node
/**
 * Compare Celestin providers on qualitative, mostly no-tools prompts.
 *
 * This is intentionally not a product scorecard. It produces side-by-side
 * responses so humans can judge tone, warmth, repetition, and provider quirks.
 */

import fs from 'fs'
import path from 'path'

import {
  DEFAULT_OUT_DIR,
  buildSingleTurnBody,
  callCelestin,
  ensureDir,
  loadJson,
  loadSupabaseEnv,
  loadTestUserCreds,
  loadTestUserJwt,
  resolveFixturePath,
} from '../evals/lib/runner.mjs'

const DEFAULT_SCENARIOS = 'evals/celestin-provider-quality-scenarios.json'
const DEFAULT_PROVIDERS = ['claude', 'gemini-flash-lite-stable-t08']
const TONE_TERMS = [
  'oublie',
  'il faut',
  'arme fatale',
  'massacrer',
  'ecraser',
  'écraser',
  'tuer',
  'sans aucun doute',
  'parfait',
]

function parseFlagValue(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : null
}

const AUTH = process.argv.includes('--auth')
const OMIT_CONTEXT = process.argv.includes('--omit-context')
const ORCHESTRATION = parseFlagValue('orchestration') ?? 'v2'
const SCENARIOS_PATH = parseFlagValue('scenarios') ?? DEFAULT_SCENARIOS
const TRACK = parseFlagValue('track')
const PROVIDERS = (parseFlagValue('providers') ?? DEFAULT_PROVIDERS.join(','))
  .split(',')
  .map((provider) => provider.trim())
  .filter(Boolean)

if (!['v1', 'v2'].includes(ORCHESTRATION)) {
  console.error(`Invalid --orchestration: ${ORCHESTRATION}. Must be v1 or v2.`)
  process.exit(1)
}

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function lineCount(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length
}

function toneSignals(text) {
  const normalized = normalizeText(text)
  return TONE_TERMS
    .filter((term) => normalized.includes(normalizeText(term)))
    .join(', ')
}

function isProviderErrorMessage(message) {
  const trimmed = String(message ?? '').trim()
  return /^\[[^\]]+\]\s+.+(cannot answer|contract violation|all providers failed|no resolvable ui_action|missing ui_action|unterminated string|no text response)/i.test(trimmed)
    || /momentanement indisponible|momentanément indisponible|all providers failed|contract violation/i.test(trimmed)
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
}

function fmtLatency(value) {
  return Number.isFinite(value) ? `${value}ms` : 'n/a'
}

function buildMarkdown(input) {
  const lines = []
  lines.push(`# Celestin provider quality`)
  lines.push('')
  lines.push(`Generated: ${input.meta.timestamp}`)
  lines.push(`Providers: ${input.meta.providers.join(', ')}`)
  lines.push(`Orchestration: ${input.meta.orchestration}`)
  lines.push(`Authenticated: ${input.meta.authenticated ? 'yes' : 'no'}`)
  lines.push(`Track: ${input.meta.track ?? 'all'}`)
  lines.push(`Context omitted: ${input.meta.omitContext ? 'yes' : 'no'}`)
  lines.push(`Scenarios: ${input.meta.scenarios}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| Provider | OK | Errors | Mean | p50 | p95 | Tone signal hits |')
  lines.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const provider of input.meta.providers) {
    const results = input.results.filter((result) => result.provider === provider)
    const ok = results.filter((result) => result.ok).length
    const errors = results.length - ok
    const latencies = results.filter((result) => result.ok).map((result) => result.latencyMs).sort((a, b) => a - b)
    const mean = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null
    const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null
    const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : null
    const toneHits = results.reduce((sum, result) => sum + (result.toneSignals ? result.toneSignals.split(', ').filter(Boolean).length : 0), 0)
    lines.push(`| ${provider} | ${ok} | ${errors} | ${fmtLatency(mean)} | ${fmtLatency(p50)} | ${fmtLatency(p95)} | ${toneHits} |`)
  }
  lines.push('')
  lines.push('## Responses')
  lines.push('')

  for (const scenario of input.scenarios) {
    lines.push(`### ${scenario.id}`)
    lines.push('')
    lines.push(`- track: ${scenario.track ?? 'n/a'}`)
    lines.push(`- category: ${scenario.category ?? 'n/a'}`)
    lines.push(`- user: ${scenario.message}`)
    if (scenario.notes) lines.push(`- notes: ${scenario.notes}`)
    lines.push('')
    lines.push('| Provider | Latency | Route | UI | Tone signals | Response |')
    lines.push('|---|---:|---|---|---|---|')
    for (const provider of input.meta.providers) {
      const result = input.results.find((candidate) => candidate.provider === provider && candidate.scenarioId === scenario.id)
      if (!result) {
        lines.push(`| ${provider} | n/a | n/a | n/a | n/a | Missing result |`)
        continue
      }
      if (!result.ok) {
        lines.push(`| ${provider} | ${fmtLatency(result.latencyMs)} | error | n/a | n/a | **ERROR:** ${escapeCell(result.error)} |`)
        continue
      }
      lines.push([
        provider,
        fmtLatency(result.latencyMs),
        escapeCell(`${result.capability ?? 'n/a'} / ${result.responseMode ?? 'n/a'}`),
        escapeCell(result.uiActionKind ?? 'none'),
        escapeCell(result.toneSignals || 'none'),
        escapeCell(result.assistantMessage),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  const env = loadSupabaseEnv()
  const fixturePath = resolveFixturePath(parseFlagValue('fixture'), false)
  const fixture = loadJson(fixturePath)
  if (!fixture) throw new Error(`Could not load fixture at ${fixturePath}`)

  const allScenarios = loadJson(SCENARIOS_PATH)
  if (!Array.isArray(allScenarios) || allScenarios.length === 0) {
    throw new Error(`No provider quality scenarios found at ${SCENARIOS_PATH}`)
  }
  const scenarios = TRACK
    ? allScenarios.filter((scenario) => scenario.track === TRACK)
    : allScenarios
  if (scenarios.length === 0) {
    throw new Error(`No provider quality scenarios found at ${SCENARIOS_PATH} for track=${TRACK}`)
  }

  let authSession = null
  if (AUTH) {
    const creds = loadTestUserCreds()
    if (!creds) {
      throw new Error(
        '--auth requires TEST_USER_EMAIL and TEST_USER_PASSWORD, or PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD, in .env.local/.env.playwright.local.',
      )
    }
    authSession = await loadTestUserJwt(env.supabaseUrl, env.supabaseAnonKey, creds)
  }

  console.log(`Celestin provider quality — ${scenarios.length} scenarios x ${PROVIDERS.length} providers`)
  console.log(`Providers: ${PROVIDERS.join(', ')}`)
  console.log(`Orchestration: ${ORCHESTRATION}`)
  console.log(`Track: ${TRACK ?? 'all'}`)
  console.log(`Authenticated: ${authSession ? authSession.userId : 'no'}`)
  console.log(`Context omitted: ${OMIT_CONTEXT ? 'yes' : 'no'}`)
  console.log('')

  const results = []
  for (const scenario of scenarios) {
    console.log(`Scenario: ${scenario.id}`)
    for (const provider of PROVIDERS) {
      process.stdout.write(`  ${provider}... `)
      const body = buildSingleTurnBody(fixture, scenario, provider, {
        orchestrationVersion: ORCHESTRATION,
        omitContext: OMIT_CONTEXT || !!authSession,
      })
      const startedAt = Date.now()
      try {
        const { data } = await callCelestin(body, env.supabaseUrl, env.supabaseAnonKey, { userJwt: authSession?.jwt })
        const latencyMs = Date.now() - startedAt
        const assistantMessage = data.message ?? ''
        if (isProviderErrorMessage(assistantMessage)) {
          results.push({
            scenarioId: scenario.id,
            provider,
            ok: false,
            latencyMs,
            error: assistantMessage,
          })
          console.log(`PROVIDER ERROR (${latencyMs}ms): ${assistantMessage.slice(0, 120)}`)
          continue
        }
        results.push({
          scenarioId: scenario.id,
          provider,
          ok: true,
          latencyMs,
          assistantMessage,
          lineCount: lineCount(assistantMessage),
          toneSignals: toneSignals(assistantMessage),
          uiActionKind: data.ui_action?.kind ?? null,
          capability: data._debug?.capability ?? null,
          responseMode: data._debug?.responseMode ?? null,
          providerPath: data._debug?.providerTrace?.providerPath ?? null,
        })
        console.log(`ok (${latencyMs}ms)`)
      } catch (err) {
        const latencyMs = Date.now() - startedAt
        results.push({
          scenarioId: scenario.id,
          provider,
          ok: false,
          latencyMs,
          error: err instanceof Error ? err.message : String(err),
        })
        console.log(`ERROR (${latencyMs}ms): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const meta = {
    timestamp,
    providers: PROVIDERS,
    orchestration: ORCHESTRATION,
    track: TRACK ?? null,
    omitContext: OMIT_CONTEXT,
    authenticated: !!authSession,
    userId: authSession?.userId ?? null,
    fixture: path.basename(fixturePath),
    scenarios: scenarios.length,
  }
  const payload = { meta, scenarios, results }

  ensureDir(DEFAULT_OUT_DIR)
  const providerSuffix = PROVIDERS.join('_').replace(/[^a-z0-9_-]+/gi, '-')
  const trackSuffix = TRACK ? `-${TRACK}` : ''
  const contextSuffix = OMIT_CONTEXT ? '-no-context' : ''
  const baseName = `provider-quality${trackSuffix}${contextSuffix}-${providerSuffix}-${timestamp}`
  const jsonPath = path.join(DEFAULT_OUT_DIR, `${baseName}.json`)
  const mdPath = path.join(DEFAULT_OUT_DIR, `${baseName}.md`)
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(mdPath, buildMarkdown(payload))

  console.log('')
  console.log('Reports written:')
  console.log(`  - ${jsonPath}`)
  console.log(`  - ${mdPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
