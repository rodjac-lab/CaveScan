import { buildMemoryEvidenceBundle } from '@/lib/tastingMemories'
import type { Bottle } from '@/lib/types'

export interface CelestinEvalScenario {
  id: string
  message: string
  notes?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  expectations?: {
    avoidColors?: string[]
    expectedUiActionKind?: string
    maxCards?: number
    expectRelay?: boolean
    forbiddenPatterns?: string[]
    maxWordCount?: number
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
  drunk?: Bottle[]
  profile?: string | null
  memories?: string | null
  compiledProfileMarkdown?: string | null
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
  message?: string
  ui_action?: { kind?: string; payload?: { cards?: CelestinEvalCard[] | null } | null } | null
  cards?: CelestinEvalCard[]
  [key: string]: unknown
}

export interface CelestinEvalAnalysis {
  uiActionKind?: string | null
  cardCount: number
  wordCount: number
  isRelay: boolean
  memoryUsed: boolean
  forbiddenPatternHits: string[]
  provider: string
  introFlags: {
    hasTiens: boolean
    hasPepites: boolean
    hasAhLead: boolean
  }
  expectedUiActionKindMismatch: boolean
  maxCardsExceeded: boolean
  avoidColorHits: Array<{
    name?: string
    color?: string
    badge?: string
  }>
}

export interface CelestinEvalResult {
  id: string
  provider: string
  elapsedMs: number | null
  request: Record<string, unknown>
  response: CelestinEvalResponse
  analysis: CelestinEvalAnalysis
}

const FORBIDDEN_PATTERNS_DEFAULT = ['Ah,', 'Ah ', 'Excellente question', 'Tu as tout à fait raison', "Salut l'ami", 'Absolument']

export const CELESTIN_EVAL_SCENARIOS: CelestinEvalScenario[] = [
  // --- Bloc A: Qualite reco one-shot ---
  {
    id: 'reco_ce_soir',
    message: "Qu'est-ce que j'ouvre ce soir ?",
    notes: 'Reco ouverte sans contrainte. 3-5 cartes, vins de la cave.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'accord_sushi',
    message: 'Ce soir sushi',
    notes: 'Pas de rouge tannique. Priorite blanc/bulles.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      avoidColors: ['rouge'],
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'accord_osso_bucco',
    message: 'Osso bucco ce soir',
    notes: 'Souvenirs osso bucco utilises correctement. "passe son pic" != "pas aime".',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'fromage',
    message: 'Plateau de fromages',
    notes: 'Priorite au blanc.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'un_rouge',
    message: 'Un rouge pour ce soir',
    notes: 'Contexte suffisant, pas de relance.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      expectRelay: false,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  // --- Bloc B: Qualite conversationnelle ---
  {
    id: 'relance_accord',
    message: 'Accord mets & vin',
    notes: 'Contexte incomplet. Doit poser une question ("Qu\'est-ce que tu manges ?").',
    expectations: {
      expectedUiActionKind: 'none',
      expectRelay: true,
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
      maxWordCount: 60,
    },
  },
  {
    id: 'relance_vague',
    message: 'Un bon vin',
    notes: 'Trop vague. Doit relancer ("Pour quelle occasion ?").',
    expectations: {
      expectedUiActionKind: 'none',
      expectRelay: true,
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
      maxWordCount: 60,
    },
  },
  {
    id: 'culture_vin',
    message: 'Quels domaines ont plante des cepages atypiques dans leur region ?',
    notes: 'Question culture vin. Reponse avec noms concrets, pas de renvoi vers la cave.',
    history: [],
    expectations: {
      expectedUiActionKind: 'none',
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'encavage_conversationnel',
    message: "J'ai achete un Crozes-Hermitage 2022",
    notes: 'Pas de prepare_add_wine immediat. Doit demander le domaine.',
    expectations: {
      expectedUiActionKind: 'none',
      expectRelay: true,
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
      maxWordCount: 40,
    },
  },
  {
    id: 'souvenir_maturite',
    message: "Qu'est-ce que tu penses du Brunello ?",
    notes: 'Ne doit PAS dire "pas aime" ou "pas emballe". Maturite != jugement.',
    history: [
      {
        role: 'user',
        content: "On a ouvert le Brunello di Montalcino 2015 hier soir avec un osso bucco.",
      },
      {
        role: 'assistant',
        content: "Un Brunello 2015 avec un osso bucco, c'est un bel accord. Comment tu l'as trouve ?",
      },
      {
        role: 'user',
        content: "Excellent ! Mais il etait passe son pic, un peu fatigue sur la fin. Le nez etait superbe par contre.",
      },
    ],
    expectations: {
      expectedUiActionKind: 'none',
      maxCards: 0,
      forbiddenPatterns: [...FORBIDDEN_PATTERNS_DEFAULT, "pas aime", "pas emballe", "n'a pas plu", "decu"],
    },
  },
]

export async function buildCelestinEvalRequest(
  fixture: CelestinEvalFixture,
  scenario: CelestinEvalScenario,
  provider?: string,
): Promise<Record<string, unknown>> {
  const rawHistory = scenario.history ?? fixture.history ?? []
  const history = rawHistory.map((turn) => ({
    role: turn.role,
    text: turn.content,
  }))
  const memoryEvidence = fixture.drunk && fixture.drunk.length > 0
    ? await buildMemoryEvidenceBundle({
        query: scenario.message,
        recentMessages: rawHistory.map((turn) => ({
          role: turn.role === 'assistant' ? 'celestin' : 'user',
          text: turn.content,
        })),
        drunkBottles: fixture.drunk,
      })
    : null

  return {
    message: scenario.message,
    history,
    cave: fixture.cave ?? [],
    profile: fixture.profile ?? undefined,
    memories: memoryEvidence ? memoryEvidence.serialized : (fixture.memories ?? undefined),
    context: fixture.context ?? undefined,
    ...(memoryEvidence?.mode ? { memoryEvidenceMode: memoryEvidence.mode } : {}),
    ...(provider ? { provider } : {}),
    ...(fixture.compiledProfileMarkdown ? { compiledProfileMarkdown: fixture.compiledProfileMarkdown } : {}),
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
    'tu avais aime',
    'tu te souviens',
    'on a deja bu',
    'on a déjà bu',
    'tu avais trouve',
    'tu avais trouvé',
    'comme le ',
    'la derniere fois',
    'la dernière fois',
    'passe son pic',
    'passé son pic',
  ]

  return patterns.some((pattern) => haystack.includes(pattern))
}

function countWords(text?: string): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function detectRelay(text?: string, uiActionKind?: string): boolean {
  if (!text) return false
  if (uiActionKind && uiActionKind !== 'none') return false
  const trimmed = text.trim()
  return trimmed.endsWith('?') || trimmed.endsWith('\u00a0?')
}

function detectForbiddenPatterns(text?: string, patterns?: string[]): string[] {
  if (!text || !patterns) return []
  const normalized = text.toLowerCase()
  return patterns.filter((p) => normalized.includes(p.toLowerCase()))
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
  provider: string = '',
): CelestinEvalAnalysis {
  const cards = response.ui_action?.kind === 'show_recommendations'
    ? response.ui_action.payload?.cards ?? []
    : response.cards ?? []
  const avoidColors = scenario.expectations?.avoidColors ?? []
  const avoidColorHits = cards.filter((card) => avoidColors.includes(card.color ?? ''))
  const expectedUiActionKind = scenario.expectations?.expectedUiActionKind
  const maxCards = scenario.expectations?.maxCards
  const uiActionKind = response.ui_action?.kind ?? 'none'

  return {
    uiActionKind,
    cardCount: cards.length,
    wordCount: countWords(response.message),
    isRelay: detectRelay(response.message, uiActionKind),
    memoryUsed: detectMemoryUsage(response.message, cards),
    forbiddenPatternHits: detectForbiddenPatterns(response.message, scenario.expectations?.forbiddenPatterns),
    provider,
    introFlags: detectIntroFlags(response.message),
    expectedUiActionKindMismatch: !!(expectedUiActionKind && uiActionKind !== expectedUiActionKind),
    maxCardsExceeded: typeof maxCards === 'number' ? cards.length > maxCards : false,
    avoidColorHits: avoidColorHits.map((card) => ({
      name: card.name,
      color: card.color,
      badge: card.badge,
    })),
  }
}

// === Comparative HTML Report ===

interface DiagnosticItem {
  level: 'fail' | 'warn' | 'info'
  label: string
  detail: string
}

function isApiError(result: CelestinEvalResult): boolean {
  const msg = result.response.message ?? ''
  return msg.includes('timed out') || msg.includes('indisponible') || msg.includes('not valid JSON') || msg.startsWith('[')
}

function collectDiagnostics(scenario: CelestinEvalScenario, result: CelestinEvalResult): DiagnosticItem[] {
  const items: DiagnosticItem[] = []
  const a = result.analysis
  const exp = scenario.expectations

  // API-level errors first
  if (isApiError(result)) {
    items.push({ level: 'fail', label: 'Erreur API', detail: result.response.message ?? 'Erreur inconnue' })
    return items // no point checking further
  }

  // ui_action mismatch
  if (a.expectedUiActionKindMismatch) {
    items.push({
      level: 'fail',
      label: 'Action UI incorrecte',
      detail: `Attendu : ${exp?.expectedUiActionKind} | Recu : ${a.uiActionKind}`,
    })
  }

  // Card count
  if (a.maxCardsExceeded) {
    items.push({
      level: 'fail',
      label: 'Trop de cartes',
      detail: `Attendu : max ${exp?.maxCards} | Recu : ${a.cardCount}`,
    })
  }

  // Avoid colors
  if (a.avoidColorHits.length > 0) {
    items.push({
      level: 'fail',
      label: 'Couleur interdite recommandee',
      detail: a.avoidColorHits.map((h) => `${h.name} (${h.color})`).join(', '),
    })
  }

  // Relay expected but missing
  if (exp?.expectRelay === true && !a.isRelay) {
    items.push({
      level: 'fail',
      label: 'Relance manquante',
      detail: 'Le LLM devait poser une question (contexte incomplet) mais a repondu directement',
    })
  }

  // Relay unexpected
  if (exp?.expectRelay === false && a.isRelay) {
    items.push({
      level: 'warn',
      label: 'Relance inattendue',
      detail: 'Le contexte etait suffisant, le LLM ne devait pas poser de question',
    })
  }

  // Forbidden patterns
  if (a.forbiddenPatternHits.length > 0) {
    items.push({
      level: 'warn',
      label: 'Expressions interdites detectees',
      detail: a.forbiddenPatternHits.map((p) => `"${p}"`).join(', '),
    })
  }

  // Verbosity
  if (exp?.maxWordCount && a.wordCount > exp.maxWordCount) {
    items.push({
      level: 'warn',
      label: 'Trop verbeux',
      detail: `${a.wordCount} mots (max attendu : ${exp.maxWordCount})`,
    })
  }

  // Intro flags
  if (a.introFlags.hasAhLead) {
    items.push({ level: 'warn', label: 'Commence par "Ah"', detail: 'Interdit dans la persona Celestin' })
  }
  if (a.introFlags.hasTiens) {
    items.push({ level: 'warn', label: 'Utilise "tiens"', detail: 'Considere comme filler' })
  }

  return items
}

function scoreResult(scenario: CelestinEvalScenario, result: CelestinEvalResult): 'pass' | 'warn' | 'fail' {
  if (isApiError(result)) return 'fail'
  const diags = collectDiagnostics(scenario, result)
  if (diags.some((d) => d.level === 'fail')) return 'fail'
  if (diags.some((d) => d.level === 'warn')) return 'warn'
  return 'pass'
}

export function renderCelestinEvalHtmlReport(
  results: CelestinEvalResult[],
  fixture: CelestinEvalFixture,
  scenarios: CelestinEvalScenario[],
): string {
  // Group results by scenario
  const providers = [...new Set(results.map((r) => r.provider))].sort()
  const isComparative = providers.length > 1
  const resultsByScenario = new Map<string, CelestinEvalResult[]>()
  for (const r of results) {
    const list = resultsByScenario.get(r.id) ?? []
    list.push(r)
    resultsByScenario.set(r.id, list)
  }

  // Score summary per provider/runtime
  const providerScores = providers.map((label) => {
    const providerResults = results.filter((r) => r.provider === label)
    const pass = providerResults.filter((r) => {
      const s = scenarios.find((sc) => sc.id === r.id)
      return s && scoreResult(s, r) === 'pass'
    }).length
    const fail = providerResults.filter((r) => {
      const s = scenarios.find((sc) => sc.id === r.id)
      return s && scoreResult(s, r) === 'fail'
    }).length
    const total = providerResults.length
    const avgMs = Math.round(providerResults.reduce((sum, r) => sum + (r.elapsedMs ?? 0), 0) / total)
    const avgWords = Math.round(providerResults.reduce((sum, r) => sum + r.analysis.wordCount, 0) / total)
    return { name: label, pass, fail, total, pct: Math.round((pass / total) * 100), avgMs, avgWords }
  })

  const scoreboardHtml = isComparative ? `
    <div class="scoreboard">
      ${providerScores.map((ps) => `
        <div class="score-card">
          <div class="score-provider">${escapeHtml(ps.name)}</div>
          <div class="score-pct ${ps.pct >= 80 ? 'good' : ps.pct >= 50 ? 'mid' : 'bad'}">${ps.pct}%</div>
          <div class="score-detail">${ps.pass}/${ps.total} pass | ${ps.fail} fail</div>
          <div class="score-detail">${ps.avgMs}ms moy. | ${ps.avgWords} mots moy.</div>
        </div>
      `).join('')}
    </div>
  ` : ''

  // Build expectations summary for a scenario
  function renderExpectations(scenario: CelestinEvalScenario): string {
    const exp = scenario.expectations
    if (!exp) return ''
    const items: string[] = []
    if (exp.expectedUiActionKind) items.push(`Action UI : <strong>${exp.expectedUiActionKind === 'none' ? 'aucune' : exp.expectedUiActionKind}</strong>`)
    if (exp.expectRelay === true) items.push('Doit poser une <strong>question de relance</strong>')
    if (exp.expectRelay === false) items.push('Ne doit <strong>pas</strong> poser de question')
    if (exp.avoidColors?.length) items.push(`Couleurs interdites : <strong>${exp.avoidColors.join(', ')}</strong>`)
    if (typeof exp.maxCards === 'number') items.push(`Max cartes : <strong>${exp.maxCards}</strong>`)
    if (exp.maxWordCount) items.push(`Max mots : <strong>${exp.maxWordCount}</strong>`)
    if (items.length === 0) return ''
    return `<div class="expectations"><span class="exp-label">Attendu :</span> ${items.join(' · ')}</div>`
  }

  const scenarioRows = scenarios.map((scenario) => {
    const scenarioResults = resultsByScenario.get(scenario.id) ?? []

    const providerCols = providers.map((providerRuntimeLabel) => {
      const result = scenarioResults.find((r) => r.provider === providerRuntimeLabel)
      if (!result) {
        return `<div class="provider-col"><div class="provider-name">${escapeHtml(providerRuntimeLabel)}</div><div class="empty">Pas de resultat</div></div>`
      }

      const diags = collectDiagnostics(scenario, result)
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

      const diagsHtml = diags.length > 0
        ? `<div class="diagnostics">${diags.map((d) => {
            const icon = d.level === 'fail' ? '&#x2718;' : d.level === 'warn' ? '&#x26A0;' : '&#x2139;'
            const cls = d.level === 'fail' ? 'diag-fail' : d.level === 'warn' ? 'diag-warn' : 'diag-info'
            return `<div class="diag ${cls}"><span class="diag-icon">${icon}</span><strong>${escapeHtml(d.label)}</strong> — ${escapeHtml(d.detail)}</div>`
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
          ${diagsHtml}
          ${cardsHtml ? `<div class="cards">${cardsHtml}</div>` : ''}
        </div>
      `
    }).join('')

    return `
      <section class="scenario">
        <div class="scenario-head">
          <h2>${escapeHtml(scenario.id)}</h2>
        </div>
        <div class="question"><strong>Question :</strong> ${escapeHtml(scenario.message)}</div>
        <div class="notes">${escapeHtml(scenario.notes ?? '')}</div>
        ${renderExpectations(scenario)}
        ${scenario.history && scenario.history.length > 0
          ? `<div class="history"><strong>Historique :</strong> ${scenario.history.map((h) => `<br/><span class="hist-role">${escapeHtml(h.role)}</span> : ${escapeHtml(h.content)}`).join('')}</div>`
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
    ${scoreboardHtml}
    ${scenarioRows}
  </div>
</body>
</html>`
}
