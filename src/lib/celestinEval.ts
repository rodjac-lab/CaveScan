export interface CelestinEvalScenario {
  id: string
  message: string
  notes?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  expectations?: {
    avoidColors?: string[]
  }
}

export interface CelestinEvalFixtureBottle {
  id: string
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: string | null
  quantity: number
  volume: string
  local_score: number
}

export interface CelestinEvalFixture {
  name?: string
  description?: string
  exportedAt?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  cave?: CelestinEvalFixtureBottle[]
  profile?: string | null
  memories?: string | null
  context?: {
    dayOfWeek?: string
    season?: string
    recentDrunk?: string[]
  }
}

export interface CelestinEvalCard {
  name?: string
  appellation?: string
  color?: string
  badge?: string
  bottle_id?: string
  reason?: string
}

export interface CelestinEvalResponse {
  type?: string
  text?: string
  cards?: CelestinEvalCard[]
  [key: string]: unknown
}

export interface CelestinEvalAnalysis {
  cardCount: number
  memoryUsed: boolean
  introFlags: {
    hasTiens: boolean
    hasPepites: boolean
    hasAhLead: boolean
  }
  avoidColorHits: Array<{
    name?: string
    color?: string
    badge?: string
  }>
}

export interface CelestinEvalResult {
  id: string
  elapsedMs: number | null
  request: Record<string, unknown>
  response: CelestinEvalResponse
  analysis: CelestinEvalAnalysis
}

export const CELESTIN_EVAL_SCENARIOS: CelestinEvalScenario[] = [
  {
    id: 'generic_tonight',
    message: "Qu'est-ce que j'ouvre ce soir ?",
    notes: 'Reco ouverte sans plat explicite.',
  },
  {
    id: 'sushi',
    message: 'Ce soir sushi',
    notes: 'Verifier les garde-fous sur poisson cru.',
    expectations: { avoidColors: ['rouge'] },
  },
  {
    id: 'cheese_board',
    message: 'Je fais un plateau de fromages',
    notes: 'Verifier la priorite au blanc et la qualite des alternatives.',
  },
  {
    id: 'paella',
    message: 'Ce soir paella',
    notes: 'Verifier si les rouges restent secondaires et prudents.',
  },
  {
    id: 'memory_rome',
    message: "Tu te souviens du chianti qu'on avait adore avec des spaghetti a Rome ?",
    notes: "Tester la qualite relationnelle et l'usage de la memoire.",
  },
  {
    id: 'encave_chianti',
    message: "J'ai achete 6 bouteilles de Chianti Classico 2021",
    notes: 'Verifier que Celestin reste naturel en mode encavage.',
  },
]

export function buildCelestinEvalRequest(
  fixture: CelestinEvalFixture,
  scenario: CelestinEvalScenario,
): Record<string, unknown> {
  return {
    message: scenario.message,
    history: scenario.history ?? fixture.history ?? [],
    cave: fixture.cave ?? [],
    profile: fixture.profile ?? undefined,
    memories: fixture.memories ?? undefined,
    context: fixture.context ?? undefined,
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function detectMemoryUsage(text?: string, cards?: CelestinEvalCard[]): boolean {
  const haystack = [text ?? '', ...(cards ?? []).map((card) => card.reason ?? '')]
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

function detectIntroFlags(text?: string) {
  const normalized = (text ?? '').toLowerCase()
  return {
    hasTiens: normalized.includes('tiens'),
    hasPepites: normalized.includes('pépite') || normalized.includes('pepite'),
    hasAhLead: normalized.startsWith('ah,') || normalized.startsWith('ah '),
  }
}

export function analyzeCelestinEvalResult(
  scenario: CelestinEvalScenario,
  response: CelestinEvalResponse,
): CelestinEvalAnalysis {
  const cards = response.cards ?? []
  const avoidColors = scenario.expectations?.avoidColors ?? []
  const avoidColorHits = cards.filter((card) => avoidColors.includes(card.color ?? ''))

  return {
    cardCount: cards.length,
    memoryUsed: detectMemoryUsage(response.text, cards),
    introFlags: detectIntroFlags(response.text),
    avoidColorHits: avoidColorHits.map((card) => ({
      name: card.name,
      color: card.color,
      badge: card.badge,
    })),
  }
}

function renderCard(card: CelestinEvalCard): string {
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

export function renderCelestinEvalHtmlReport(
  results: CelestinEvalResult[],
  fixture: CelestinEvalFixture,
  scenarios: CelestinEvalScenario[],
): string {
  const rows = results.map((result) => {
    const scenario = scenarios.find((entry) => entry.id === result.id)
    const cardsHtml = (result.response.cards ?? []).map(renderCard).join('')
    const flags = result.analysis.introFlags
    const introFlagLabels = [
      flags.hasTiens ? 'tiens' : null,
      flags.hasPepites ? 'pepites' : null,
      flags.hasAhLead ? 'ah' : null,
    ].filter(Boolean)

    const warnings = [
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
          <div class="timing">${escapeHtml(result.elapsedMs ?? '')} ms</div>
        </div>
        <div class="question"><strong>Question:</strong> ${escapeHtml(scenario?.message ?? '')}</div>
        <div class="notes"><strong>Notes:</strong> ${escapeHtml(scenario?.notes ?? '')}</div>
        <div class="intro"><strong>Intro:</strong> ${escapeHtml(result.response.text ?? '')}</div>
        <div class="summary">
          <span>Type: ${escapeHtml(result.response.type ?? '')}</span>
          <span>Cards: ${result.analysis.cardCount}</span>
          <span>Memory: ${result.analysis.memoryUsed ? 'yes' : 'no'}</span>
        </div>
        <div class="warnings">
          ${warnings.length > 0 ? warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join('') : '<div class="ok">No automatic warning</div>'}
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
