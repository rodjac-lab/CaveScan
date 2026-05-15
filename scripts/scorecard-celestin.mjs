#!/usr/bin/env node
/**
 * Celestin scorecard — deterministic-only (Phase 1).
 *
 * Runs the same 10 single-turn scenarios + 30 multi-turn conversations as the
 * LLM eval, captures every assistant response, and applies binary criteria
 * derived directly from persona.ts / rules.ts. Outputs:
 *   - evals/results/scorecard-{timestamp}.json (raw per-response data)
 *   - evals/results/scorecard-{timestamp}.md   (human-readable summary)
 *
 * No LLM judge yet — Phase 1 ships only what regex/count can verify:
 *   C1 first_word_non_filler   — no leading "Ah/Oh/Tiens/Bon/Alors/Absolument/Bien/Excellente"
 *   C2 max_5_lines             — body ≤ 5 non-empty lines
 *   C3 max_1_exclamation       — at most 1 "!" in message
 *   C4 reco_cards_2_to_5       — when ui_action=show_recommendations, cards in [2..5]
 *
 * Phase 2: semantic criteria via Claude Haiku 4.5 judge (scorecard-judge edge fn)
 *   J1 anti_echo                       — does not parrot the user's words back
 *   J2 no_rhetorical_question_finale   — does not close with a closed-ended hook
 *   J3 no_theatre                      — no "Quelle liste !", "C'est du lourd !"
 *   J4 no_permission_seeking           — does not ask "Tu veux que je propose ?"
 *   J5 direct_answer_first             — answers the question before citing memory
 *
 * Usage:
 *   node scripts/scorecard-celestin.mjs                       # deterministic only, default (~2.5min, ~$0.10)
 *   node scripts/scorecard-celestin.mjs --quick               # 10 single-turn deterministic (~30s)
 *   node scripts/scorecard-celestin.mjs --auth                # authenticated test account; DB cave/profile/memory
 *   node scripts/scorecard-celestin.mjs --with-judge          # Phase 2: + LLM judge (~5min, ~$0.20)
 *   node scripts/scorecard-celestin.mjs --provider claude     # force a specific provider (gemini|gemini-flash-lite|claude|openai)
 *
 * The LLM judge (J1-J5 semantic criteria) is OFF by default — it surfaces drifts
 * that are largely well-known Gemini quirks (lyrism, light parroting on
 * acks, "on peut ... si tu veux" softeners). Enable it explicitly when you
 * want to measure those, or to validate a fix targeted at one of them.
 */

import fs from 'fs'
import path from 'path'

import {
  DEFAULT_CONVERSATIONS,
  DEFAULT_OUT_DIR,
  DEFAULT_SCENARIOS,
  buildRequestBody,
  buildSingleTurnBody,
  callCelestin,
  ensureDir,
  loadJson,
  loadSupabaseEnv,
  loadTestUserCreds,
  loadTestUserJwt,
  resolveFixturePath,
} from '../evals/lib/runner.mjs'
import { summarizeAssistantMessage } from '../evals/lib/assertions.mjs'

const QUICK = process.argv.includes('--quick')
const AUTH = process.argv.includes('--auth') || process.argv.includes('--test-user')
// LLM judge is OFF by default — enable explicitly with --with-judge.
const WITH_JUDGE = process.argv.includes('--with-judge')
const NO_JUDGE = !WITH_JUDGE

function parseFlagValue(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : null
}

const PROVIDER = parseFlagValue('provider')
const VALID_PROVIDERS = ['gemini', 'gemini-flash-lite', 'gemini-3-flash', 'gemini-3-flash-low', 'claude', 'openai']
if (PROVIDER && !VALID_PROVIDERS.includes(PROVIDER)) {
  console.error(`Invalid --provider: ${PROVIDER}. Must be one of: ${VALID_PROVIDERS.join(', ')}`)
  process.exit(1)
}

const ORCHESTRATION = parseFlagValue('orchestration') ?? 'v1'
if (!['v1', 'v2'].includes(ORCHESTRATION)) {
  console.error(`Invalid --orchestration: ${ORCHESTRATION}. Must be v1 or v2.`)
  process.exit(1)
}

const THROTTLE_MS = Number(parseFlagValue('throttle-ms') ?? 0)
function throttle() {
  if (!Number.isFinite(THROTTLE_MS) || THROTTLE_MS <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, THROTTLE_MS))
}

const JUDGE_KEYS = [
  'j1_anti_echo',
  'j2_no_rhetorical_question_finale',
  'j3_no_theatre',
  'j4_no_permission_seeking',
  'j5_direct_answer_first',
]

const FORBIDDEN_FIRST_WORDS = new Set(
  ['ah', 'oh', 'tiens', 'bon', 'alors', 'absolument', 'bien', 'excellente'].map((w) => w.toLowerCase()),
)

function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function firstWord(text) {
  if (!text) return ''
  const trimmed = text.trim()
  const match = trimmed.match(/^([A-Za-zÀ-ÿ']+)/)
  return match ? stripDiacritics(match[1]).toLowerCase() : ''
}

function nonEmptyLineCount(text) {
  if (!text) return 0
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length
}

function exclamationCount(text) {
  if (!text) return 0
  return (text.match(/!/g) ?? []).length
}

function recoCardCount(uiAction) {
  if (!uiAction || uiAction.kind !== 'show_recommendations') return null
  return uiAction.payload?.cards?.length ?? 0
}

function isProviderErrorMessage(message) {
  if (!message) return false
  const trimmed = message.trim()
  return /^\[[a-z0-9-]+\]\s/i.test(trimmed)
    || /momentanement indisponible|momentanément indisponible|all providers failed|fetch failed/i.test(trimmed)
}

function evaluateDeterministic(message, uiAction) {
  const fw = firstWord(message)
  const lines = nonEmptyLineCount(message)
  const excls = exclamationCount(message)
  const cards = recoCardCount(uiAction)

  const c1 = !FORBIDDEN_FIRST_WORDS.has(fw)
  const c2 = lines <= 5
  const c3 = excls <= 1
  const c4 = cards === null ? null : cards >= 2 && cards <= 5

  return {
    c1_first_word_non_filler: { pass: c1, detail: { firstWord: fw } },
    c2_max_5_lines: { pass: c2, detail: { lines } },
    c3_max_1_exclamation: { pass: c3, detail: { exclamations: excls } },
    c4_reco_cards_2_to_5: { pass: c4, detail: { cards } },
  }
}

async function callJudge(userMessage, assistantMessage, supabaseUrl, anonKey) {
  const res = await fetch(`${supabaseUrl}/functions/v1/scorecard-judge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ user_message: userMessage, assistant_message: assistantMessage }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

function emptyJudgeResult() {
  const out = {}
  for (const key of JUDGE_KEYS) {
    out[key] = { pass: null, detail: { reason: 'judge skipped or unavailable' } }
  }
  return out
}

async function judgeResponse(userMessage, assistantMessage, ctx) {
  if (NO_JUDGE) return emptyJudgeResult()
  try {
    const verdict = await callJudge(userMessage, assistantMessage, ctx.supabaseUrl, ctx.supabaseAnonKey)
    const reasoning = verdict._reasoning ?? ''
    const out = {}
    for (const key of JUDGE_KEYS) {
      out[key] = { pass: verdict[key] === true, detail: { reasoning } }
    }
    return out
  } catch (err) {
    const out = {}
    for (const key of JUDGE_KEYS) {
      out[key] = { pass: null, detail: { error: err.message } }
    }
    return out
  }
}

function aggregate(results) {
  const counters = {
    c1_first_word_non_filler: { pass: 0, fail: 0, na: 0 },
    c2_max_5_lines: { pass: 0, fail: 0, na: 0 },
    c3_max_1_exclamation: { pass: 0, fail: 0, na: 0 },
    c4_reco_cards_2_to_5: { pass: 0, fail: 0, na: 0 },
  }
  for (const key of JUDGE_KEYS) counters[key] = { pass: 0, fail: 0, na: 0 }

  for (const r of results) {
    for (const key of Object.keys(counters)) {
      const verdict = r.scorecard[key].pass
      if (verdict === null) counters[key].na += 1
      else if (verdict) counters[key].pass += 1
      else counters[key].fail += 1
    }
  }

  const summary = {}
  for (const [key, c] of Object.entries(counters)) {
    const total = c.pass + c.fail
    summary[key] = {
      pass: c.pass,
      fail: c.fail,
      na: c.na,
      total,
      passRate: total === 0 ? null : c.pass / total,
    }
  }

  const allBinary = results.flatMap((r) =>
    Object.values(r.scorecard)
      .map((v) => v.pass)
      .filter((v) => v !== null),
  )
  const overallPass = allBinary.filter((v) => v).length
  const overallTotal = allBinary.length
  summary.overall = {
    pass: overallPass,
    fail: overallTotal - overallPass,
    total: overallTotal,
    passRate: overallTotal === 0 ? null : overallPass / overallTotal,
  }

  const latencies = results.map((r) => r.latencyMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (latencies.length > 0) {
    const mean = Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
    const p50 = latencies[Math.floor(latencies.length * 0.5)]
    const p95 = latencies[Math.floor(latencies.length * 0.95)]
    summary.latencyMs = { count: latencies.length, mean, p50, p95, min: latencies[0], max: latencies[latencies.length - 1] }
  }

  const byCapability = {}
  for (const result of results) {
    const capability = result.capability ?? 'UNKNOWN'
    const bucket = byCapability[capability] ?? {
      responses: 0,
      failures: 0,
      fallback: 0,
      providerErrors: 0,
      recommendationCards: 0,
      latencies: [],
    }
    bucket.responses += 1
    bucket.failures += Object.values(result.scorecard).some((entry) => entry.pass === false) ? 1 : 0
    bucket.fallback += result.providerPath === 'fallback_response' ? 1 : 0
    bucket.providerErrors += isProviderErrorMessage(result.assistantMessage) ? 1 : 0
    bucket.recommendationCards += result.uiActionKind === 'show_recommendations' ? 1 : 0
    if (Number.isFinite(result.latencyMs)) bucket.latencies.push(result.latencyMs)
    byCapability[capability] = bucket
  }

  summary.byCapability = Object.fromEntries(Object.entries(byCapability).map(([capability, bucket]) => {
    const latencies = bucket.latencies.sort((a, b) => a - b)
    return [capability, {
      responses: bucket.responses,
      failures: bucket.failures,
      fallback: bucket.fallback,
      providerErrors: bucket.providerErrors,
      recommendationCards: bucket.recommendationCards,
      latencyP50Ms: latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null,
      latencyP95Ms: latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null,
    }]
  }))

  return summary
}

function fmtPct(rate) {
  if (rate === null) return 'N/A'
  return `${(rate * 100).toFixed(1)}%`
}

function buildMarkdown(summary, results, meta) {
  const lines = []
  lines.push(`# Celestin Scorecard — ${meta.timestamp}`)
  lines.push('')
  lines.push(`Mode: ${meta.mode} | Provider: ${meta.provider} | Total responses scored: ${meta.totalResponses} | Wall-clock: ${meta.elapsedSec}s`)
  lines.push(`Orchestration: ${meta.orchestration}`)
  lines.push(`Context: ${meta.authenticated ? `authenticated test account (${meta.userId})` : `local fixture (${meta.fixture})`}`)
  lines.push('')
  lines.push('## Summary by criterion')
  lines.push('')
  lines.push('| Criterion | Pass | Fail | N/A | Pass rate |')
  lines.push('|-----------|------|------|-----|-----------|')
  for (const [key, s] of Object.entries(summary)) {
    if (key === 'overall' || key === 'latencyMs' || key === 'byCapability') continue
    lines.push(`| ${key} | ${s.pass} | ${s.fail} | ${s.na} | **${fmtPct(s.passRate)}** |`)
  }
  lines.push(`| **OVERALL** | ${summary.overall.pass} | ${summary.overall.fail} | — | **${fmtPct(summary.overall.passRate)}** |`)
  lines.push('')

  if (summary.latencyMs) {
    const l = summary.latencyMs
    lines.push(`## Latency (per Celestin call, ms)`)
    lines.push('')
    lines.push(`mean=${l.mean} | p50=${l.p50} | p95=${l.p95} | min=${l.min} | max=${l.max} | n=${l.count}`)
    lines.push('')
  }

  if (summary.byCapability) {
    lines.push('## Summary by capability')
    lines.push('')
    lines.push('| Capability | Responses | Failures | Fallback | Provider errors | Reco cards | p50 | p95 |')
    lines.push('|------------|-----------|----------|----------|-----------------|------------|-----|-----|')
    for (const [capability, bucket] of Object.entries(summary.byCapability)) {
      lines.push(`| ${capability} | ${bucket.responses} | ${bucket.failures} | ${bucket.fallback} | ${bucket.providerErrors} | ${bucket.recommendationCards} | ${bucket.latencyP50Ms ?? 'N/A'} | ${bucket.latencyP95Ms ?? 'N/A'} |`)
    }
    lines.push('')
  }

  const failures = results.flatMap((r) =>
    Object.entries(r.scorecard)
      .filter(([, v]) => v.pass === false)
      .map(([key, v]) => ({
        scenarioId: r.scenarioId,
        turnIndex: r.turnIndex,
        userMessage: r.userMessage,
        assistantMessage: r.assistantMessage.slice(0, 200),
        criterion: key,
        detail: v.detail,
      })),
  )

  if (failures.length > 0) {
    lines.push('## Failures')
    lines.push('')
    for (const f of failures) {
      const turnLabel = f.turnIndex !== null ? ` turn ${f.turnIndex + 1}` : ''
      lines.push(`### ${f.scenarioId}${turnLabel} — ${f.criterion}`)
      lines.push(`- detail: \`${JSON.stringify(f.detail)}\``)
      lines.push(`- user: ${f.userMessage}`)
      lines.push(`- assistant: ${f.assistantMessage}${f.assistantMessage.length >= 200 ? '…' : ''}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

async function runSingleTurn(ctx, scenarios) {
  const results = []
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    process.stdout.write(`  [single ${i + 1}/${scenarios.length}] ${scenario.id}... `)
    try {
      const body = buildSingleTurnBody(ctx.fixture, scenario, PROVIDER, {
        orchestrationVersion: ORCHESTRATION,
        omitContext: ctx.authenticated,
      })
      const callStart = Date.now()
      const { data } = await callCelestin(body, ctx.supabaseUrl, ctx.supabaseAnonKey, { userJwt: ctx.userJwt })
      const latencyMs = Date.now() - callStart
      const message = data.message ?? ''
      const uiAction = data.ui_action ?? null
      if (isProviderErrorMessage(message)) {
        process.stdout.write(`PROVIDER ERROR (${latencyMs}ms): ${message.slice(0, 120)}\n`)
        continue
      }
      const deterministic = evaluateDeterministic(message, uiAction)
      const judge = await judgeResponse(scenario.message, message, ctx)
      results.push({
        kind: 'single',
        scenarioId: scenario.id,
        turnIndex: null,
        userMessage: scenario.message,
        assistantMessage: message,
        uiActionKind: uiAction?.kind ?? null,
        capability: data._debug?.capability ?? null,
        confidence: data._debug?.confidence ?? null,
        responseMode: data._debug?.responseMode ?? null,
        providerPath: data._debug?.providerTrace?.providerPath ?? null,
        latencyMs,
        scorecard: { ...deterministic, ...judge },
      })
      process.stdout.write('ok\n')
    } catch (err) {
      process.stdout.write(`ERROR: ${err.message}\n`)
    }
    await throttle()
  }
  return results
}

async function runMultiTurn(ctx, conversations) {
  const results = []
  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i]
    process.stdout.write(`  [conv ${i + 1}/${conversations.length}] ${conv.id} (${conv.turns.length} turns)\n`)
    let history = []
    let conversationState = null

    for (let t = 0; t < conv.turns.length; t++) {
      const turn = conv.turns[t]
      try {
        const body = buildRequestBody(ctx.fixture, turn.message, history, conversationState, PROVIDER, {
          orchestrationVersion: ORCHESTRATION,
          omitContext: ctx.authenticated,
        })
        const callStart = Date.now()
        const { data } = await callCelestin(body, ctx.supabaseUrl, ctx.supabaseAnonKey, { userJwt: ctx.userJwt })
        const latencyMs = Date.now() - callStart
        const message = data.message ?? ''
        const uiAction = data.ui_action ?? null
        if (isProviderErrorMessage(message)) {
          process.stdout.write(`    turn ${t + 1} PROVIDER ERROR (${latencyMs}ms): ${message.slice(0, 100)}\n`)
          break
        }
        const deterministic = evaluateDeterministic(message, uiAction)
        const judge = await judgeResponse(turn.message, message, ctx)
        results.push({
          kind: 'multi',
          scenarioId: conv.id,
          turnIndex: t,
          userMessage: turn.message,
          assistantMessage: message,
          uiActionKind: uiAction?.kind ?? null,
          capability: data._debug?.capability ?? null,
          confidence: data._debug?.confidence ?? null,
          responseMode: data._debug?.responseMode ?? null,
          providerPath: data._debug?.providerTrace?.providerPath ?? null,
          latencyMs,
          scorecard: { ...deterministic, ...judge },
        })

        const assistantText = summarizeAssistantMessage(data)
        history = [
          ...history,
          { role: 'user', text: turn.message },
          { role: 'assistant', text: assistantText },
        ]
        conversationState = data._nextState ?? null
      } catch (err) {
        process.stdout.write(`    turn ${t + 1} ERROR: ${err.message}\n`)
        break
      }
      await throttle()
    }
  }
  return results
}

async function main() {
  const env = loadSupabaseEnv()
  const fixturePath = resolveFixturePath(null)
  const fixture = loadJson(fixturePath)
  if (!fixture) throw new Error(`Could not load fixture at ${fixturePath}`)

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

  const ctx = {
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    fixture,
    authenticated: !!authSession,
    userJwt: authSession?.jwt,
  }

  const scenarios = loadJson(DEFAULT_SCENARIOS) ?? []
  const conversations = QUICK ? [] : loadJson(DEFAULT_CONVERSATIONS) ?? []

  console.log(`Celestin scorecard — ${scenarios.length} single-turn + ${conversations.length} multi-turn`)
  console.log(`Fixture: ${path.relative(process.cwd(), fixturePath)}`)
  if (authSession) {
    console.log(`Authenticated test account: ${authSession.userId}`)
    console.log('Context source: Supabase account data (fixture cave/profile/memory omitted)')
  } else {
    console.log('Context source: local fixture body')
  }
  console.log(`Provider: ${PROVIDER ?? 'default (Gemini → OpenAI fallback)'}`)
  console.log(`Orchestration: ${ORCHESTRATION}`)
  console.log('')

  const startedAt = Date.now()

  console.log('Single-turn scenarios:')
  const singleResults = await runSingleTurn(ctx, scenarios)
  console.log('')

  let multiResults = []
  if (conversations.length > 0) {
    console.log('Multi-turn conversations:')
    multiResults = await runMultiTurn(ctx, conversations)
    console.log('')
  }

  const allResults = [...singleResults, ...multiResults]
  const summary = aggregate(allResults)
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const meta = {
    timestamp,
    mode: QUICK ? 'quick (single-turn only)' : 'full',
    provider: PROVIDER ?? 'default',
    orchestration: ORCHESTRATION,
    authenticated: !!authSession,
    userId: authSession?.userId ?? null,
    totalResponses: allResults.length,
    elapsedSec,
    fixture: path.basename(fixturePath),
  }

  ensureDir(DEFAULT_OUT_DIR)
  const providerSuffix = PROVIDER ? `-${PROVIDER}` : ''
  const orchestrationSuffix = ORCHESTRATION === 'v2' ? '-v2' : ''
  const baseName = `scorecard${providerSuffix}${orchestrationSuffix}-${timestamp}`
  const jsonPath = path.join(DEFAULT_OUT_DIR, `${baseName}.json`)
  const mdPath = path.join(DEFAULT_OUT_DIR, `${baseName}.md`)

  fs.writeFileSync(jsonPath, JSON.stringify({ meta, summary, results: allResults }, null, 2))
  fs.writeFileSync(mdPath, buildMarkdown(summary, allResults, meta))

  console.log('=== SUMMARY ===')
  for (const [key, s] of Object.entries(summary)) {
    if (key === 'overall' || key === 'latencyMs' || key === 'byCapability') continue
    console.log(`  ${key.padEnd(36)} ${fmtPct(s.passRate).padStart(7)}  (${s.pass}/${s.pass + s.fail}, ${s.na} N/A)`)
  }
  console.log('  ---')
  console.log(`  ${'OVERALL'.padEnd(36)} ${fmtPct(summary.overall.passRate).padStart(7)}  (${summary.overall.pass}/${summary.overall.total})`)
  if (summary.latencyMs) {
    const l = summary.latencyMs
    console.log(`  ${'LATENCY ms (mean/p50/p95)'.padEnd(36)} ${l.mean}/${l.p50}/${l.p95}  (n=${l.count})`)
  }
  if (summary.byCapability) {
    console.log('  ---')
    for (const [capability, bucket] of Object.entries(summary.byCapability)) {
      console.log(`  ${capability.padEnd(36)} responses=${bucket.responses} failures=${bucket.failures} fallback=${bucket.fallback} cards=${bucket.recommendationCards}`)
    }
  }
  console.log('')
  console.log(`Reports written:`)
  console.log(`  - ${path.relative(process.cwd(), jsonPath)}`)
  console.log(`  - ${path.relative(process.cwd(), mdPath)}`)
}

main().catch((err) => {
  console.error('Scorecard failed:', err)
  process.exit(1)
})
