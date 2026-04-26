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
 *   C4 reco_cards_3_to_5       — when ui_action=show_recommendations, cards in [3..5]
 *
 * Usage:
 *   node scripts/scorecard-celestin.mjs           # full run (~2.5min, ~$0.10)
 *   node scripts/scorecard-celestin.mjs --quick   # only single-turn scenarios (~30s)
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
  resolveFixturePath,
} from '../evals/lib/runner.mjs'
import { summarizeAssistantMessage } from '../evals/lib/assertions.mjs'

const QUICK = process.argv.includes('--quick')

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

function evaluateResponse(message, uiAction) {
  const fw = firstWord(message)
  const lines = nonEmptyLineCount(message)
  const excls = exclamationCount(message)
  const cards = recoCardCount(uiAction)

  const c1 = !FORBIDDEN_FIRST_WORDS.has(fw)
  const c2 = lines <= 5
  const c3 = excls <= 1
  const c4 = cards === null ? null : cards >= 3 && cards <= 5

  return {
    c1_first_word_non_filler: { pass: c1, detail: { firstWord: fw } },
    c2_max_5_lines: { pass: c2, detail: { lines } },
    c3_max_1_exclamation: { pass: c3, detail: { exclamations: excls } },
    c4_reco_cards_3_to_5: { pass: c4, detail: { cards } },
  }
}

function aggregate(results) {
  const counters = {
    c1_first_word_non_filler: { pass: 0, fail: 0, na: 0 },
    c2_max_5_lines: { pass: 0, fail: 0, na: 0 },
    c3_max_1_exclamation: { pass: 0, fail: 0, na: 0 },
    c4_reco_cards_3_to_5: { pass: 0, fail: 0, na: 0 },
  }

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
  lines.push(`Mode: ${meta.mode} | Total responses scored: ${meta.totalResponses} | Wall-clock: ${meta.elapsedSec}s`)
  lines.push('')
  lines.push('## Summary by criterion')
  lines.push('')
  lines.push('| Criterion | Pass | Fail | N/A | Pass rate |')
  lines.push('|-----------|------|------|-----|-----------|')
  for (const [key, s] of Object.entries(summary)) {
    if (key === 'overall') continue
    lines.push(`| ${key} | ${s.pass} | ${s.fail} | ${s.na} | **${fmtPct(s.passRate)}** |`)
  }
  lines.push(`| **OVERALL** | ${summary.overall.pass} | ${summary.overall.fail} | — | **${fmtPct(summary.overall.passRate)}** |`)
  lines.push('')

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
      const body = buildSingleTurnBody(ctx.fixture, scenario, null)
      const { data } = await callCelestin(body, ctx.supabaseUrl, ctx.supabaseAnonKey)
      const message = data.message ?? ''
      const uiAction = data.ui_action ?? null
      const scorecard = evaluateResponse(message, uiAction)
      results.push({
        kind: 'single',
        scenarioId: scenario.id,
        turnIndex: null,
        userMessage: scenario.message,
        assistantMessage: message,
        uiActionKind: uiAction?.kind ?? null,
        scorecard,
      })
      process.stdout.write('ok\n')
    } catch (err) {
      process.stdout.write(`ERROR: ${err.message}\n`)
    }
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
        const body = buildRequestBody(ctx.fixture, turn.message, history, conversationState, null)
        const { data } = await callCelestin(body, ctx.supabaseUrl, ctx.supabaseAnonKey)
        const message = data.message ?? ''
        const uiAction = data.ui_action ?? null
        const scorecard = evaluateResponse(message, uiAction)
        results.push({
          kind: 'multi',
          scenarioId: conv.id,
          turnIndex: t,
          userMessage: turn.message,
          assistantMessage: message,
          uiActionKind: uiAction?.kind ?? null,
          scorecard,
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
    }
  }
  return results
}

async function main() {
  const env = loadSupabaseEnv()
  const fixturePath = resolveFixturePath(null)
  const fixture = loadJson(fixturePath)
  if (!fixture) throw new Error(`Could not load fixture at ${fixturePath}`)

  const ctx = { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, fixture }

  const scenarios = loadJson(DEFAULT_SCENARIOS) ?? []
  const conversations = QUICK ? [] : loadJson(DEFAULT_CONVERSATIONS) ?? []

  console.log(`Celestin scorecard — ${scenarios.length} single-turn + ${conversations.length} multi-turn`)
  console.log(`Fixture: ${path.relative(process.cwd(), fixturePath)}`)
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
    totalResponses: allResults.length,
    elapsedSec,
    fixture: path.basename(fixturePath),
  }

  ensureDir(DEFAULT_OUT_DIR)
  const baseName = `scorecard-${timestamp}`
  const jsonPath = path.join(DEFAULT_OUT_DIR, `${baseName}.json`)
  const mdPath = path.join(DEFAULT_OUT_DIR, `${baseName}.md`)

  fs.writeFileSync(jsonPath, JSON.stringify({ meta, summary, results: allResults }, null, 2))
  fs.writeFileSync(mdPath, buildMarkdown(summary, allResults, meta))

  console.log('=== SUMMARY ===')
  for (const [key, s] of Object.entries(summary)) {
    if (key === 'overall') continue
    console.log(`  ${key.padEnd(30)} ${fmtPct(s.passRate).padStart(7)}  (${s.pass}/${s.pass + s.fail}, ${s.na} N/A)`)
  }
  console.log('  ---')
  console.log(`  ${'OVERALL'.padEnd(30)} ${fmtPct(summary.overall.passRate).padStart(7)}  (${summary.overall.pass}/${summary.overall.total})`)
  console.log('')
  console.log(`Reports written:`)
  console.log(`  - ${path.relative(process.cwd(), jsonPath)}`)
  console.log(`  - ${path.relative(process.cwd(), mdPath)}`)
}

main().catch((err) => {
  console.error('Scorecard failed:', err)
  process.exit(1)
})
