/**
 * Celestin eval CLI runner — produces JSON + HTML report.
 *
 * Pure assertions, fixture loading, and HTTP calls live in evals/lib/ so the
 * Vitest suite (evals/celestin-eval.test.ts) can reuse them. This script
 * orchestrates a one-shot run with rich console output and an HTML report.
 */

import fs from 'fs'
import path from 'path'

import {
  analyzeScenarioResult,
  analyzeTurnResult,
  detectIntroFlags,
  getCards,
  getUiActionKind,
  summarizeAssistantMessage,
} from '../evals/lib/assertions.mjs'

import {
  DEFAULT_CONVERSATIONS,
  DEFAULT_OUT_DIR,
  DEFAULT_SCENARIOS,
  TEMPLATE_FIXTURE,
  buildRequestBody,
  buildSingleTurnBody,
  callCelestin,
  ensureDir,
  findLatestRealFixture,
  loadJson,
  loadSupabaseEnv,
} from '../evals/lib/runner.mjs'

const ROOT = process.cwd()

function parseArgs(argv) {
  const args = {
    fixture: null,
    scenarios: null,
    conversations: null,
    outDir: DEFAULT_OUT_DIR,
    dryRun: false,
    provider: null,
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--fixture' && argv[i + 1]) args.fixture = path.resolve(argv[++i])
    else if (arg === '--scenarios' && argv[i + 1]) args.scenarios = path.resolve(argv[++i])
    else if (arg === '--conversations' && argv[i + 1]) args.conversations = path.resolve(argv[++i])
    else if (arg === '--out-dir' && argv[i + 1]) args.outDir = path.resolve(argv[++i])
    else if (arg === '--provider' && argv[i + 1]) args.provider = argv[++i]
    else if (arg === '--dry-run') args.dryRun = true
  }

  if (!args.scenarios && !args.conversations) {
    args.scenarios = DEFAULT_SCENARIOS
    args.conversations = DEFAULT_CONVERSATIONS
  }

  return args
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function runConversation(conversation, fixture, baseUrl, anonKey, dryRun, provider) {
  const turns = conversation.turns
  const turnResults = []
  let history = []
  let conversationState = null
  let chainBroken = false

  console.log(`\n  Conversation ${conversation.id}: ${conversation.description}`)

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    console.log(`    Turn ${i + 1}/${turns.length}: "${turn.message}"`)

    const body = buildRequestBody(fixture, turn.message, history, conversationState, provider)

    if (dryRun) {
      turnResults.push({
        turnIndex: i,
        message: turn.message,
        elapsedMs: 0,
        response: { message: 'Dry run: no network call', ui_action: null, _nextState: null },
        analysis: {
          uiActionKind: 'none',
          nextPhase: null,
          cardCount: 0,
          checks: [],
          allPassed: true,
          skipped: false,
        },
      })
      continue
    }

    try {
      const { data, elapsedMs } = await callCelestin(body, baseUrl, anonKey)

      const analysis = analyzeTurnResult(turn, data)

      if (chainBroken) {
        analysis.skipped = true
        analysis.allPassed = true
        console.log(`      ⊘ skipped (previous turn failed) | ui=${analysis.uiActionKind} phase=${analysis.nextPhase} | ${elapsedMs}ms`)
      } else {
        analysis.skipped = false
        const statusIcon = analysis.allPassed ? '✓' : '✗'
        const checksStr = analysis.checks.map((c) => `${c.check}:${c.pass ? '✓' : `✗(${c.expected}≠${c.actual})`}`).join(' ')
        console.log(`      ${statusIcon} ${checksStr} | ui=${analysis.uiActionKind} phase=${analysis.nextPhase} | ${elapsedMs}ms`)

        if (!analysis.allPassed) {
          chainBroken = true
        }
      }

      turnResults.push({
        turnIndex: i,
        message: turn.message,
        elapsedMs,
        response: data,
        analysis,
      })

      const assistantText = summarizeAssistantMessage(data)
      history = [
        ...history,
        { role: 'user', text: turn.message },
        { role: 'assistant', text: assistantText },
      ]
      conversationState = data._nextState ?? null
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.log(`      ✗ ERROR: ${errMsg}`)
      turnResults.push({
        turnIndex: i,
        message: turn.message,
        elapsedMs: null,
        response: { message: errMsg, ui_action: null, _nextState: null },
        analysis: {
          uiActionKind: 'none',
          nextPhase: null,
          cardCount: 0,
          checks: [{ check: 'error', expected: 'success', actual: errMsg, pass: false }],
          allPassed: false,
          skipped: false,
        },
      })
      break
    }
  }

  const allPassed = turnResults.every((t) => t.analysis.allPassed)
  const totalMs = turnResults.reduce((sum, t) => sum + (t.elapsedMs ?? 0), 0)

  return {
    id: conversation.id,
    type: 'conversation',
    description: conversation.description,
    turnCount: turns.length,
    turnsCompleted: turnResults.length,
    totalMs,
    allPassed,
    turns: turnResults,
  }
}

// --- HTML Report ---

function renderCard(card) {
  return `
    <div class="card">
      <div class="badge">${escapeHtml(card.badge ?? '')}</div>
      <div class="name">${escapeHtml(card.name ?? '')}</div>
      <div class="appellation">${escapeHtml(card.appellation ?? '')}</div>
      <div class="card-meta">color=${escapeHtml(card.color ?? '')}${card.bottle_id ? ` | bottle=${escapeHtml(card.bottle_id)}` : ''}</div>
      <div class="reason">${escapeHtml(card.reason ?? '')}</div>
    </div>
  `
}

function renderSingleTurnResult(result, scenario) {
  const cardsHtml = getCards(result.response).map(renderCard).join('')
  const flags = result.analysis.introFlags
  const introFlagLabels = [
    flags.hasTiens ? 'tiens' : null,
    flags.hasAhLead ? 'ah' : null,
  ].filter(Boolean)

  const warnings = [
    ...(result.analysis.expectedUiActionKindMismatch
      ? [`Expected ui_action.kind: ${scenario?.expectations?.expectedUiActionKind ?? ''}, got: ${result.analysis.uiActionKind ?? 'none'}`]
      : []),
    ...(result.analysis.maxCardsExceeded
      ? [`Expected max cards: ${scenario?.expectations?.maxCards ?? ''}, got: ${result.analysis.cardCount}`]
      : []),
    ...(result.analysis.avoidColorHits.length > 0
      ? result.analysis.avoidColorHits.map((hit) => `Avoid-color hit: ${hit.name} (${hit.color})`)
      : []),
    ...(introFlagLabels.length > 0 ? [`Intro flags: ${introFlagLabels.join(', ')}`] : []),
    ...(result.analysis.memoryUsed ? ['Memory mention detected'] : []),
  ]

  return `
    <section class="scenario">
      <div class="scenario-head">
        <h2>${escapeHtml(result.id)}</h2>
        <div class="timing">${result.elapsedMs} ms</div>
      </div>
      <div class="question"><strong>Question:</strong> ${escapeHtml(scenario?.message ?? '')}</div>
      <div class="notes"><strong>Notes:</strong> ${escapeHtml(scenario?.notes ?? '')}</div>
      <div class="intro"><strong>Intro:</strong> ${escapeHtml(result.response.message ?? '')}</div>
      <div class="summary">
        <span>UI: ${escapeHtml(getUiActionKind(result.response))}</span>
        <span>Cards: ${result.analysis.cardCount}</span>
        <span>Memory: ${result.analysis.memoryUsed ? 'yes' : 'no'}</span>
      </div>
      <div class="warnings">
        ${warnings.length > 0 ? warnings.map((w) => `<div class="warning">${escapeHtml(w)}</div>`).join('') : '<div class="ok">No automatic warning</div>'}
      </div>
      <div class="cards">${cardsHtml || '<div class="empty">No cards</div>'}</div>
    </section>
  `
}

function renderConversationResult(convResult) {
  const statusClass = convResult.allPassed ? 'conv-pass' : 'conv-fail'
  const statusLabel = convResult.allPassed ? 'PASS' : 'FAIL'

  const turnsHtml = convResult.turns.map((turn) => {
    const checks = turn.analysis.checks
    const turnPass = turn.analysis.allPassed
    const turnSkipped = turn.analysis.skipped
    const turnStatusClass = turnSkipped ? 'turn-skipped' : (turnPass ? 'turn-pass' : 'turn-fail')
    const turnStatusIcon = turnSkipped ? '⊘' : (turnPass ? '✓' : '✗')

    const checksHtml = turnSkipped
      ? '<span class="check-skipped">skipped (previous turn failed)</span>'
      : checks.map((c) => {
          const checkClass = c.pass ? 'check-pass' : 'check-fail'
          return `<span class="${checkClass}">${escapeHtml(c.check)}: expected <strong>${escapeHtml(c.expected)}</strong>, got <strong>${escapeHtml(c.actual)}</strong></span>`
        }).join('')

    const cardsHtml = getCards(turn.response).map(renderCard).join('')

    return `
      <div class="turn ${turnStatusClass}">
        <div class="turn-head">
          <div class="turn-label">Tour ${turn.turnIndex + 1}</div>
          <div class="turn-status">${turnStatusIcon}</div>
          <div class="timing">${turn.elapsedMs ?? '—'} ms</div>
        </div>
        <div class="turn-user"><strong>User:</strong> ${escapeHtml(turn.message)}</div>
        <div class="turn-assistant"><strong>Celestin:</strong> ${escapeHtml(turn.response.message ?? '')}</div>
        <div class="turn-meta">
          <span>UI: ${escapeHtml(turn.analysis.uiActionKind)}</span>
          <span>Phase: ${escapeHtml(turn.analysis.nextPhase ?? '—')}</span>
          <span>Cards: ${turn.analysis.cardCount}</span>
          <span>Turn: ${escapeHtml(turn.response._debug?.turnType ?? '—')}</span>
          <span>Mode: ${escapeHtml(turn.response._debug?.cognitiveMode ?? '—')}</span>
          <span>Provider: ${escapeHtml(turn.response._debug?.provider ?? '—')}</span>
        </div>
        <div class="turn-checks">${checksHtml || '<span class="check-none">No checks</span>'}</div>
        ${cardsHtml ? `<div class="cards">${cardsHtml}</div>` : ''}
      </div>
    `
  }).join('')

  return `
    <section class="conversation ${statusClass}">
      <div class="scenario-head">
        <h2>${escapeHtml(convResult.id)} <span class="conv-badge ${statusClass}">${statusLabel}</span></h2>
        <div class="timing">${convResult.totalMs} ms total</div>
      </div>
      <div class="conv-desc">${escapeHtml(convResult.description)}</div>
      <div class="conv-summary">${convResult.turnsCompleted}/${convResult.turnCount} tours</div>
      <div class="turns">${turnsHtml}</div>
    </section>
  `
}

function renderHtmlReport(singleResults, conversationResults, fixture, scenarios, runMeta) {
  const singleRows = singleResults.map((result) => {
    const scenario = scenarios?.find((s) => s.id === result.id)
    return renderSingleTurnResult(result, scenario)
  }).join('\n')

  const convRows = conversationResults.map(renderConversationResult).join('\n')

  const convTotal = conversationResults.length
  const convPassed = conversationResults.filter((c) => c.allPassed).length
  const convFailed = convTotal - convPassed

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Celestin Eval Report</title>
  <style>
    body { font-family: Georgia, serif; background: #f5f1ea; color: #1c1a17; margin: 0; padding: 24px; }
    .page { max-width: 1100px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 36px; }
    .report-meta { color: #6a625b; margin-bottom: 24px; }
    .section-title { font-size: 28px; margin: 32px 0 16px; border-bottom: 2px solid #e2d8ca; padding-bottom: 8px; }
    .scenario { background: #fffdf9; border: 1px solid #e2d8ca; border-radius: 16px; padding: 18px; margin-bottom: 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.04); }
    .scenario-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .scenario h2 { margin: 0 0 10px; font-size: 24px; }
    .timing { color: #8a7e73; font-size: 14px; }
    .question, .notes, .intro { margin: 8px 0; line-height: 1.45; }
    .summary { display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0; color: #5c534b; font-size: 14px; }
    .warnings { margin: 12px 0; }
    .warning { display: inline-block; margin: 4px 6px 0 0; padding: 6px 10px; border-radius: 999px; background: #f8e1dc; color: #7b3226; font-size: 13px; }
    .ok { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #e4efe2; color: #275d2e; font-size: 13px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 14px; }
    .card { background: #fff; border: 1px solid #eadfce; border-radius: 14px; padding: 12px; }
    .badge { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #9b7b1f; margin-bottom: 6px; }
    .name { font-weight: 700; margin-bottom: 4px; }
    .appellation { color: #7b746e; font-size: 14px; margin-bottom: 6px; }
    .card-meta { font-size: 12px; color: #8a7e73; }
    .reason { margin-top: 8px; font-size: 14px; line-height: 1.45; }
    .empty { color: #8a7e73; font-style: italic; }

    .conversation { background: #fffdf9; border: 1px solid #e2d8ca; border-radius: 16px; padding: 18px; margin-bottom: 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.04); }
    .conv-badge { font-size: 12px; padding: 2px 10px; border-radius: 999px; font-weight: 600; vertical-align: middle; }
    .conv-pass .conv-badge, .conv-badge.conv-pass { background: #e4efe2; color: #275d2e; }
    .conv-fail .conv-badge, .conv-badge.conv-fail { background: #f8e1dc; color: #7b3226; }
    .conv-desc { color: #5c534b; margin: 4px 0 12px; font-size: 15px; }
    .conv-summary { color: #8a7e73; font-size: 13px; margin-bottom: 12px; }
    .conv-stats { display: flex; gap: 16px; margin-bottom: 16px; font-size: 15px; }
    .conv-stats .stat-pass { color: #275d2e; font-weight: 600; }
    .conv-stats .stat-fail { color: #7b3226; font-weight: 600; }
    .turns { display: flex; flex-direction: column; gap: 8px; }
    .turn { border: 1px solid #eadfce; border-radius: 12px; padding: 14px; position: relative; }
    .turn-pass { border-left: 4px solid #6ead6e; }
    .turn-fail { border-left: 4px solid #c75050; }
    .turn-skipped { border-left: 4px solid #c5b88a; opacity: 0.7; }
    .turn-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .turn-label { font-weight: 700; font-size: 13px; color: #5c534b; }
    .turn-status { font-size: 16px; }
    .turn-user { margin: 6px 0; line-height: 1.45; color: #3a3630; }
    .turn-assistant { margin: 6px 0; line-height: 1.45; color: #5c534b; font-style: italic; }
    .turn-meta { display: flex; gap: 14px; font-size: 13px; color: #8a7e73; margin: 8px 0; }
    .turn-checks { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; }
    .check-pass { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #e4efe2; color: #275d2e; font-size: 12px; }
    .check-fail { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #f8e1dc; color: #7b3226; font-size: 12px; }
    .check-none { color: #8a7e73; font-size: 12px; font-style: italic; }
    .check-skipped { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #f0ead8; color: #8a7e53; font-size: 12px; font-style: italic; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Celestin Eval Report</h1>
    <div class="report-meta">Fixture: ${escapeHtml(fixture.name ?? 'unnamed')} | Mode: ${escapeHtml(runMeta.modeLabel)} | Single-turn: ${singleResults.length} | Conversations: ${convTotal}${convTotal > 0 ? ` (${convPassed} pass, ${convFailed} fail)` : ''}</div>

    ${convTotal > 0 ? `
    <h2 class="section-title">Conversations (multi-tour)</h2>
    <div class="conv-stats">
      <span class="stat-pass">${convPassed} passed</span>
      <span class="stat-fail">${convFailed} failed</span>
    </div>
    ${convRows}
    ` : ''}

    ${singleResults.length > 0 ? `
    <h2 class="section-title">Single-turn scenarios</h2>
    ${singleRows}
    ` : ''}
  </div>
</body>
</html>`
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv)
  const dryRun = args.dryRun

  let supabaseUrl = ''
  let supabaseAnonKey = ''
  if (!dryRun) {
    ({ supabaseUrl, supabaseAnonKey } = loadSupabaseEnv())
  }

  if (!args.fixture) {
    const latestRealFixture = findLatestRealFixture()
    args.fixture = latestRealFixture ?? TEMPLATE_FIXTURE
  }

  const fixture = loadJson(args.fixture)
  if (!fixture) throw new Error(`Fixture not found: ${args.fixture}`)

  if (fixture.name === 'template-fixture' && !args.dryRun) {
    throw new Error(
      'La template fixture ne doit plus servir pour une vraie eval. Exporte une fixture depuis Debug ou passe --fixture evals/celestin-fixture-YYYY-MM-DD.json.'
    )
  }

  const scenarios = args.scenarios ? loadJson(args.scenarios) : null
  const conversations = args.conversations ? loadJson(args.conversations) : null

  if (!scenarios && !conversations) {
    throw new Error('No scenarios or conversations to run. Use --scenarios and/or --conversations.')
  }

  ensureDir(args.outDir)

  if (args.provider) {
    console.log(`\n🔧 Forced provider: ${args.provider}`)
  }

  const structuredMemoryBits = [
    Array.isArray(fixture.drunk) ? `${fixture.drunk.length} degustations structurees` : null,
    fixture.compiledProfileMarkdown ? 'profil compile' : null,
  ].filter(Boolean)

  console.log(`\nFixture: ${path.basename(args.fixture)} (${fixture.name ?? 'unnamed'})`)
  if (structuredMemoryBits.length > 0) {
    console.log(`Memoire chargee: ${structuredMemoryBits.join(' | ')}`)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const singleResults = []
  const conversationResults = []

  console.log(`\n=== Memory runtime: compiled_profile_v1 ===`)

  if (scenarios && scenarios.length > 0) {
    console.log(`\n=== Single-turn scenarios (${scenarios.length}) ===`)
    // Single-turn scenarios are independent: parallel calls cut wall-clock time
    // ~3-4× without changing per-scenario semantics. Conversations stay
    // sequential below because turns chain state.
    const runOne = async (scenario) => {
      const body = buildSingleTurnBody(fixture, scenario, args.provider)
      console.log(`Running ${scenario.id}: ${scenario.message}`)
      if (args.dryRun) {
        return {
          id: scenario.id,
          elapsedMs: 0,
          request: body,
          response: { message: 'Dry run: no network call', ui_action: null },
          analysis: {
            uiActionKind: 'none',
            cardCount: 0,
            memoryUsed: false,
            introFlags: { hasTiens: false, hasPepites: false, hasAhLead: false },
            expectedUiActionKindMismatch: false,
            maxCardsExceeded: false,
            avoidColorHits: [],
          },
        }
      }
      try {
        const { data, elapsedMs } = await callCelestin(body, supabaseUrl, supabaseAnonKey)
        return {
          id: scenario.id,
          elapsedMs,
          request: body,
          response: data,
          analysis: analyzeScenarioResult(scenario, data),
        }
      } catch (error) {
        return {
          id: scenario.id,
          elapsedMs: null,
          request: body,
          response: { message: error instanceof Error ? error.message : String(error), ui_action: null },
          analysis: {
            uiActionKind: 'none',
            cardCount: 0,
            memoryUsed: false,
            introFlags: { hasTiens: false, hasPepites: false, hasAhLead: false },
            expectedUiActionKindMismatch: Boolean(scenario.expectations?.expectedUiActionKind && scenario.expectations.expectedUiActionKind !== 'none'),
            maxCardsExceeded: false,
            avoidColorHits: [],
          },
        }
      }
    }
    const results = await Promise.all(scenarios.map(runOne))
    singleResults.push(...results)
  }

  if (conversations && conversations.length > 0) {
    console.log(`\n=== Multi-turn conversations (${conversations.length}) ===`)
    for (const conversation of conversations) {
      const result = await runConversation(
        conversation,
        fixture,
        supabaseUrl,
        supabaseAnonKey,
        args.dryRun,
        args.provider,
      )
      conversationResults.push(result)
    }

    const passed = conversationResults.filter((c) => c.allPassed).length
    const failed = conversationResults.length - passed
    console.log(`\n  Conversations: ${passed} passed, ${failed} failed out of ${conversationResults.length}`)
  }

  const jsonPath = path.join(args.outDir, `celestin-eval-compiled_profile_v1-${timestamp}.json`)
  const htmlPath = path.join(args.outDir, `celestin-eval-compiled_profile_v1-${timestamp}.html`)

  fs.writeFileSync(jsonPath, JSON.stringify({
    fixture,
    scenarios: scenarios ?? [],
    conversations: conversations ?? [],
    memoryRuntime: {
      id: 'compiled_profile_v1',
      label: 'Compiled profile',
    },
    singleResults,
    conversationResults,
  }, null, 2))
  fs.writeFileSync(
    htmlPath,
    renderHtmlReport(singleResults, conversationResults, fixture, scenarios ?? [], {
      modeLabel: 'compiled_profile_v1',
    }),
  )

  console.log(`\nReport written:`)
  console.log(`- ${jsonPath}`)
  console.log(`- ${htmlPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
