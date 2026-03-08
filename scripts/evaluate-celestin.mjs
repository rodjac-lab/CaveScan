import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DEFAULT_FIXTURE = path.join(ROOT, 'evals', 'celestin-fixture.template.json')
const DEFAULT_SCENARIOS = path.join(ROOT, 'evals', 'celestin-scenarios.json')
const DEFAULT_OUT_DIR = path.join(ROOT, 'evals', 'results')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const env = {}
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    env[key] = value
  }
  return env
}

function parseArgs(argv) {
  const args = {
    fixture: DEFAULT_FIXTURE,
    scenarios: DEFAULT_SCENARIOS,
    outDir: DEFAULT_OUT_DIR,
    dryRun: false,
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--fixture') args.fixture = path.resolve(argv[++i])
    else if (arg === '--scenarios') args.scenarios = path.resolve(argv[++i])
    else if (arg === '--out-dir') args.outDir = path.resolve(argv[++i])
    else if (arg === '--dry-run') args.dryRun = true
  }

  return args
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function buildRequestBody(fixture, scenario) {
  return {
    message: scenario.message,
    history: scenario.history ?? fixture.history ?? [],
    cave: fixture.cave ?? [],
    profile: fixture.profile,
    memories: fixture.memories,
    context: fixture.context,
  }
}

function detectMemoryUsage(text, cards) {
  const haystack = [text, ...(cards ?? []).map((card) => `${card.reason ?? ''}`)]
    .join(' ')
    .toLowerCase()

  const patterns = [
    'tu avais adore',
    'tu avais adoré',
    'tu as aime',
    'tu as aimé',
    'tu adores',
    'tu avais aime',
    'tu te souviens',
    'recemment',
    'récemment',
  ]

  return patterns.some((pattern) => haystack.includes(pattern))
}

function detectIntroFlags(text) {
  const normalized = (text ?? '').toLowerCase()
  return {
    hasTiens: normalized.includes('tiens'),
    hasPepites: normalized.includes('pépite') || normalized.includes('pepite'),
    hasAhLead: normalized.startsWith('ah,') || normalized.startsWith('ah '),
  }
}

function getUiActionKind(response) {
  return response?.ui_action?.kind ?? 'none'
}

function getCards(response) {
  if (response?.ui_action?.kind === 'show_recommendations') {
    return response.ui_action.payload?.cards ?? []
  }
  return response?.cards ?? []
}

function analyzeScenarioResult(scenario, response) {
  const cards = getCards(response)
  const avoidColors = scenario.expectations?.avoidColors ?? []
  const avoidColorHits = cards.filter((card) => avoidColors.includes(card.color))
  const expectedUiActionKind = scenario.expectations?.expectedUiActionKind

  return {
    uiActionKind: getUiActionKind(response),
    cardCount: cards.length,
    memoryUsed: detectMemoryUsage(response.message, cards),
    introFlags: detectIntroFlags(response.message),
    expectedUiActionKindMismatch: Boolean(expectedUiActionKind && getUiActionKind(response) !== expectedUiActionKind),
    avoidColorHits: avoidColorHits.map((card) => ({
      name: card.name,
      color: card.color,
      badge: card.badge,
    })),
    maxCardsExceeded: typeof scenario.expectations?.maxCards === 'number'
      ? cards.length > scenario.expectations.maxCards
      : false,
  }
}

async function callCelestin(body, baseUrl, anonKey) {
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

function renderCard(card) {
  return `
    <div class="card">
      <div class="badge">${escapeHtml(card.badge ?? '')}</div>
      <div class="name">${escapeHtml(card.name ?? '')}</div>
      <div class="appellation">${escapeHtml(card.appellation ?? '')}</div>
      <div class="meta">color=${escapeHtml(card.color ?? '')}${card.bottle_id ? ` | bottle=${escapeHtml(card.bottle_id)}` : ''}</div>
      <div class="reason">${escapeHtml(card.reason ?? '')}</div>
    </div>
  `
}

function renderHtmlReport(results, fixture, scenarios) {
  const rows = results.map((result) => {
    const scenario = scenarios.find((s) => s.id === result.id)
    const cardsHtml = getCards(result.response).map(renderCard).join('')
    const flags = result.analysis.introFlags
    const introFlagLabels = [
      flags.hasTiens ? 'tiens' : null,
      flags.hasPepites ? 'pepites' : null,
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
  }).join('\n')

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
    .meta { color: #6a625b; margin-bottom: 24px; }
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
    .meta { font-size: 12px; color: #8a7e73; }
    .reason { margin-top: 8px; font-size: 14px; line-height: 1.45; }
    .empty { color: #8a7e73; font-style: italic; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Celestin Eval Report</h1>
    <div class="meta">Fixture: ${escapeHtml(fixture.name ?? 'unnamed')} | Scenarios: ${results.length}</div>
    ${rows}
  </div>
</body>
</html>`
}

async function main() {
  const args = parseArgs(process.argv)
  const env = { ...readEnvFile(path.join(ROOT, '.env.local')), ...process.env }
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }

  const fixture = loadJson(args.fixture)
  const scenarios = loadJson(args.scenarios)
  ensureDir(args.outDir)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const results = []

  for (const scenario of scenarios) {
    const body = buildRequestBody(fixture, scenario)
    console.log(`Running ${scenario.id}: ${scenario.message}`)
    if (args.dryRun) {
      results.push({
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
      })
      continue
    }
    try {
      const { data, elapsedMs } = await callCelestin(body, supabaseUrl, supabaseAnonKey)
      results.push({
        id: scenario.id,
        elapsedMs,
        request: body,
        response: data,
        analysis: analyzeScenarioResult(scenario, data),
      })
    } catch (error) {
      results.push({
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
      })
    }
  }

  const jsonPath = path.join(args.outDir, `celestin-eval-${timestamp}.json`)
  const htmlPath = path.join(args.outDir, `celestin-eval-${timestamp}.html`)

  fs.writeFileSync(jsonPath, JSON.stringify({ fixture, scenarios, results }, null, 2))
  fs.writeFileSync(htmlPath, renderHtmlReport(results, fixture, scenarios))

  console.log(`\nReport written:`)
  console.log(`- ${jsonPath}`)
  console.log(`- ${htmlPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
