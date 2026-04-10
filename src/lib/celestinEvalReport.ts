import { collectDiagnostics, scoreResult } from '@/lib/celestinEvalAnalysis'
import type { CelestinEvalFixture, CelestinEvalResult, CelestinEvalScenario } from '@/lib/celestinEval'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderExpectations(scenario: CelestinEvalScenario): string {
  const expectations = scenario.expectations
  if (!expectations) return ''
  const items: string[] = []
  if (expectations.expectedUiActionKind) {
    items.push(`Action UI : <strong>${expectations.expectedUiActionKind === 'none' ? 'aucune' : expectations.expectedUiActionKind}</strong>`)
  }
  if (expectations.expectRelay === true) items.push('Doit poser une <strong>question de relance</strong>')
  if (expectations.expectRelay === false) items.push('Ne doit <strong>pas</strong> poser de question')
  if (expectations.avoidColors?.length) items.push(`Couleurs interdites : <strong>${expectations.avoidColors.join(', ')}</strong>`)
  if (typeof expectations.maxCards === 'number') items.push(`Max cartes : <strong>${expectations.maxCards}</strong>`)
  if (expectations.maxWordCount) items.push(`Max mots : <strong>${expectations.maxWordCount}</strong>`)
  if (items.length === 0) return ''
  return `<div class="expectations"><span class="exp-label">Attendu :</span> ${items.join(' · ')}</div>`
}

function renderProviderColumn(
  scenario: CelestinEvalScenario,
  result: CelestinEvalResult | undefined,
  providerRuntimeLabel: string,
): string {
  if (!result) {
    return `<div class="provider-col"><div class="provider-name">${escapeHtml(providerRuntimeLabel)}</div><div class="empty">Pas de resultat</div></div>`
  }

  const diagnostics = collectDiagnostics(scenario, result)
  const score = scoreResult(scenario, result)
  const scoreClass = score === 'pass' ? 'ok' : score === 'warn' ? 'warning' : 'error'
  const scoreLabel = score === 'pass' ? 'PASS' : score === 'warn' ? 'WARN' : 'FAIL'
  const cards = result.response.ui_action?.kind === 'show_recommendations'
    ? result.response.ui_action.payload?.cards ?? []
    : result.response.cards ?? []

  const cardsHtml = cards.map((card) => `
    <div class="card">
      <div class="badge">${escapeHtml(card.badge ?? '')}</div>
      <div class="name">${escapeHtml(card.name ?? '')}</div>
      <div class="appellation">${escapeHtml(card.appellation ?? '')}</div>
      <div class="card-meta">color=${escapeHtml(card.color ?? '')}</div>
    </div>
  `).join('')

  const diagnosticsHtml = diagnostics.length > 0
    ? `<div class="diagnostics">${diagnostics.map((diagnostic) => {
        const icon = diagnostic.level === 'fail' ? '&#x2718;' : diagnostic.level === 'warn' ? '&#x26A0;' : '&#x2139;'
        const cls = diagnostic.level === 'fail' ? 'diag-fail' : diagnostic.level === 'warn' ? 'diag-warn' : 'diag-info'
        return `<div class="diag ${cls}"><span class="diag-icon">${icon}</span><strong>${escapeHtml(diagnostic.label)}</strong> — ${escapeHtml(diagnostic.detail)}</div>`
      }).join('')}</div>`
    : '<div class="diag-ok">&#x2714; Tous les criteres sont respectes</div>'

  return `
    <div class="provider-col ${scoreClass}">
      <div class="provider-header">
        <span class="provider-name">${escapeHtml(providerRuntimeLabel)}</span>
        <span class="score-badge ${scoreClass}">${scoreLabel}</span>
      </div>
      <div class="timing">${result.elapsedMs ?? '—'}ms | ${result.analysis.wordCount} mots</div>
      <div class="message-text">${escapeHtml(result.response.message ?? '')}</div>
      <div class="summary-row">
        <span>UI: ${escapeHtml(result.analysis.uiActionKind ?? 'none')}</span>
        <span>Cards: ${result.analysis.cardCount}</span>
        <span>Relance: ${result.analysis.isRelay ? 'oui' : 'non'}</span>
        <span>Memoire: ${result.analysis.memoryUsed ? 'oui' : 'non'}</span>
      </div>
      ${diagnosticsHtml}
      ${cardsHtml ? `<div class="cards">${cardsHtml}</div>` : ''}
    </div>
  `
}

function renderScoreboard(
  providers: string[],
  results: CelestinEvalResult[],
  scenarios: CelestinEvalScenario[],
): string {
  if (providers.length <= 1) return ''

  const providerScores = providers.map((label) => {
    const providerResults = results.filter((result) => result.provider === label)
    const pass = providerResults.filter((result) => {
      const scenario = scenarios.find((candidate) => candidate.id === result.id)
      return scenario && scoreResult(scenario, result) === 'pass'
    }).length
    const fail = providerResults.filter((result) => {
      const scenario = scenarios.find((candidate) => candidate.id === result.id)
      return scenario && scoreResult(scenario, result) === 'fail'
    }).length
    const total = providerResults.length
    const avgMs = Math.round(providerResults.reduce((sum, result) => sum + (result.elapsedMs ?? 0), 0) / total)
    const avgWords = Math.round(providerResults.reduce((sum, result) => sum + result.analysis.wordCount, 0) / total)
    return { name: label, pass, fail, total, pct: Math.round((pass / total) * 100), avgMs, avgWords }
  })

  return `
    <div class="scoreboard">
      ${providerScores.map((score) => `
        <div class="score-card">
          <div class="score-provider">${escapeHtml(score.name)}</div>
          <div class="score-pct ${score.pct >= 80 ? 'good' : score.pct >= 50 ? 'mid' : 'bad'}">${score.pct}%</div>
          <div class="score-detail">${score.pass}/${score.total} pass | ${score.fail} fail</div>
          <div class="score-detail">${score.avgMs}ms moy. | ${score.avgWords} mots moy.</div>
        </div>
      `).join('')}
    </div>
  `
}

export function renderCelestinEvalHtmlReport(
  results: CelestinEvalResult[],
  fixture: CelestinEvalFixture,
  scenarios: CelestinEvalScenario[],
): string {
  const providers = [...new Set(results.map((result) => result.provider))].sort()
  const isComparative = providers.length > 1
  const resultsByScenario = new Map<string, CelestinEvalResult[]>()
  for (const result of results) {
    const list = resultsByScenario.get(result.id) ?? []
    list.push(result)
    resultsByScenario.set(result.id, list)
  }

  const scenarioRows = scenarios.map((scenario) => {
    const scenarioResults = resultsByScenario.get(scenario.id) ?? []
    const providerCols = providers.map((providerRuntimeLabel) =>
      renderProviderColumn(
        scenario,
        scenarioResults.find((result) => result.provider === providerRuntimeLabel),
        providerRuntimeLabel,
      ),
    ).join('')

    return `
      <section class="scenario">
        <div class="scenario-head">
          <h2>${escapeHtml(scenario.id)}</h2>
        </div>
        <div class="question"><strong>Question :</strong> ${escapeHtml(scenario.message)}</div>
        <div class="notes">${escapeHtml(scenario.notes ?? '')}</div>
        ${renderExpectations(scenario)}
        ${scenario.history && scenario.history.length > 0
          ? `<div class="history"><strong>Historique :</strong> ${scenario.history.map((turn) => `<br/><span class="hist-role">${escapeHtml(turn.role)}</span> : ${escapeHtml(turn.content)}`).join('')}</div>`
          : ''
        }
        <div class="provider-grid ${isComparative ? 'comparative' : 'single'}">
          ${providerCols}
        </div>
      </section>
    `
  }).join('\n')

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Celestin Eval — ${isComparative ? 'Comparatif' : providers[0] ?? 'Eval'}</title>
  <style>
    body { font-family: Georgia, serif; background: #f5f1ea; color: #1c1a17; margin: 0; padding: 24px; }
    .page { max-width: 1400px; margin: 0 auto; }
    h1 { margin: 0 0 4px; font-size: 36px; }
    .page-meta { color: #6a625b; margin-bottom: 20px; font-size: 14px; }
    .scoreboard { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
    .score-card { background: #fffdf9; border: 1px solid #e2d8ca; border-radius: 14px; padding: 16px 20px; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .score-provider { font-weight: 700; font-size: 18px; margin-bottom: 6px; }
    .score-pct { font-size: 32px; font-weight: 700; }
    .score-pct.good { color: #275d2e; }
    .score-pct.mid { color: #8a6d1b; }
    .score-pct.bad { color: #7b3226; }
    .score-detail { font-size: 13px; color: #6a625b; margin-top: 2px; }
    .scenario { background: #fffdf9; border: 1px solid #e2d8ca; border-radius: 16px; padding: 18px; margin-bottom: 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.04); }
    .scenario-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .scenario h2 { margin: 0 0 6px; font-size: 22px; }
    .notes { color: #6a625b; font-size: 13px; font-style: italic; }
    .question, .history { margin: 8px 0; line-height: 1.45; font-size: 14px; }
    .history { color: #5c534b; font-size: 13px; }
    .provider-grid { display: grid; gap: 14px; margin-top: 14px; }
    .provider-grid.comparative { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .provider-grid.single { grid-template-columns: 1fr; }
    .provider-col { border: 2px solid #e2d8ca; border-radius: 12px; padding: 14px; background: #fff; }
    .provider-col.ok { border-color: #a8d5a2; }
    .provider-col.warning { border-color: #f0d48b; }
    .provider-col.error { border-color: #e8a090; }
    .provider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .provider-name { font-weight: 700; font-size: 16px; }
    .score-badge { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .score-badge.ok { background: #e4efe2; color: #275d2e; }
    .score-badge.warning { background: #fef3cd; color: #856404; }
    .score-badge.error { background: #f8d7da; color: #721c24; }
    .timing { font-size: 12px; color: #8a7e73; margin-bottom: 8px; }
    .message-text { font-size: 14px; line-height: 1.5; margin-bottom: 10px; padding: 10px; background: #faf8f4; border-radius: 8px; border: 1px solid #eee; }
    .summary-row { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #5c534b; margin-bottom: 8px; }
    .expectations { margin: 8px 0; padding: 8px 12px; background: #f0eee8; border-radius: 8px; font-size: 13px; line-height: 1.5; color: #5c534b; }
    .exp-label { font-weight: 700; color: #3a3630; }
    .diagnostics { margin: 10px 0; }
    .diag { padding: 6px 10px; margin-bottom: 4px; border-radius: 8px; font-size: 13px; line-height: 1.5; }
    .diag-icon { margin-right: 6px; }
    .diag-fail { background: #fde8e8; color: #7b3226; border-left: 3px solid #c0392b; }
    .diag-warn { background: #fef9e7; color: #7d6608; border-left: 3px solid #d4ac0d; }
    .diag-info { background: #eaf2f8; color: #2c5282; border-left: 3px solid #3498db; }
    .diag-ok { padding: 6px 10px; border-radius: 8px; background: #e4efe2; color: #275d2e; font-size: 13px; border-left: 3px solid #27ae60; }
    .hist-role { font-weight: 600; color: #6a625b; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-top: 10px; }
    .card { background: #faf8f4; border: 1px solid #eadfce; border-radius: 10px; padding: 10px; }
    .badge { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #9b7b1f; margin-bottom: 4px; }
    .name { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
    .appellation { color: #7b746e; font-size: 12px; }
    .card-meta { font-size: 11px; color: #8a7e73; margin-top: 4px; }
    .empty { color: #8a7e73; font-style: italic; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Celestin Eval${isComparative ? ' — Comparatif' : ''}</h1>
    <div class="page-meta">
      Fixture: ${escapeHtml(fixture.name ?? 'unnamed')} |
      Providers: ${providers.join(', ')} |
      Scenarios: ${scenarios.length}
    </div>
    ${renderScoreboard(providers, results, scenarios)}
    ${scenarioRows}
  </div>
</body>
</html>`
}
