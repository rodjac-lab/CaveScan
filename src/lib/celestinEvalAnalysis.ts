import type {
  CelestinEvalAnalysis,
  CelestinEvalCard,
  CelestinEvalResult,
  CelestinEvalResponse,
  CelestinEvalScenario,
} from '@/lib/celestinEval'

export interface DiagnosticItem {
  level: 'fail' | 'warn' | 'info'
  label: string
  detail: string
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
  return patterns.filter((pattern) => normalized.includes(pattern.toLowerCase()))
}

function detectIntroFlags(text?: string) {
  const normalized = (text ?? '').toLowerCase()
  return {
    hasTiens: normalized.includes('tiens'),
    hasPepites: normalized.includes('pépite') || normalized.includes('pepite'),
    hasAhLead: normalized.startsWith('ah,') || normalized.startsWith('ah '),
  }
}

function getRecommendationCards(response: CelestinEvalResponse): CelestinEvalCard[] {
  return response.ui_action?.kind === 'show_recommendations'
    ? response.ui_action.payload?.cards ?? []
    : response.cards ?? []
}

export function analyzeCelestinEvalResult(
  scenario: CelestinEvalScenario,
  response: CelestinEvalResponse,
  provider: string = '',
): CelestinEvalAnalysis {
  const cards = getRecommendationCards(response)
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

export function isApiError(result: CelestinEvalResult): boolean {
  const message = result.response.message ?? ''
  return message.includes('timed out')
    || message.includes('indisponible')
    || message.includes('not valid JSON')
    || message.startsWith('[')
}

export function collectDiagnostics(scenario: CelestinEvalScenario, result: CelestinEvalResult): DiagnosticItem[] {
  const items: DiagnosticItem[] = []
  const analysis = result.analysis
  const expectations = scenario.expectations

  if (isApiError(result)) {
    items.push({ level: 'fail', label: 'Erreur API', detail: result.response.message ?? 'Erreur inconnue' })
    return items
  }

  if (analysis.expectedUiActionKindMismatch) {
    items.push({
      level: 'fail',
      label: 'Action UI incorrecte',
      detail: `Attendu : ${expectations?.expectedUiActionKind} | Recu : ${analysis.uiActionKind}`,
    })
  }

  if (analysis.maxCardsExceeded) {
    items.push({
      level: 'fail',
      label: 'Trop de cartes',
      detail: `Attendu : max ${expectations?.maxCards} | Recu : ${analysis.cardCount}`,
    })
  }

  if (analysis.avoidColorHits.length > 0) {
    items.push({
      level: 'fail',
      label: 'Couleur interdite recommandee',
      detail: analysis.avoidColorHits.map((hit) => `${hit.name} (${hit.color})`).join(', '),
    })
  }

  if (expectations?.expectRelay === true && !analysis.isRelay) {
    items.push({
      level: 'fail',
      label: 'Relance manquante',
      detail: 'Le LLM devait poser une question (contexte incomplet) mais a repondu directement',
    })
  }

  if (expectations?.expectRelay === false && analysis.isRelay) {
    items.push({
      level: 'warn',
      label: 'Relance inattendue',
      detail: 'Le contexte etait suffisant, le LLM ne devait pas poser de question',
    })
  }

  if (analysis.forbiddenPatternHits.length > 0) {
    items.push({
      level: 'warn',
      label: 'Expressions interdites detectees',
      detail: analysis.forbiddenPatternHits.map((pattern) => `"${pattern}"`).join(', '),
    })
  }

  if (expectations?.maxWordCount && analysis.wordCount > expectations.maxWordCount) {
    items.push({
      level: 'warn',
      label: 'Trop verbeux',
      detail: `${analysis.wordCount} mots (max attendu : ${expectations.maxWordCount})`,
    })
  }

  if (analysis.introFlags.hasAhLead) {
    items.push({ level: 'warn', label: 'Commence par "Ah"', detail: 'Interdit dans la persona Celestin' })
  }
  if (analysis.introFlags.hasTiens) {
    items.push({ level: 'warn', label: 'Utilise "tiens"', detail: 'Considere comme filler' })
  }

  return items
}

export function scoreResult(scenario: CelestinEvalScenario, result: CelestinEvalResult): 'pass' | 'warn' | 'fail' {
  if (isApiError(result)) return 'fail'
  const diagnostics = collectDiagnostics(scenario, result)
  if (diagnostics.some((diagnostic) => diagnostic.level === 'fail')) return 'fail'
  if (diagnostics.some((diagnostic) => diagnostic.level === 'warn')) return 'warn'
  return 'pass'
}
