/**
 * Pure assertion helpers for Celestin eval suite.
 * Shared between the CLI runner (scripts/evaluate-celestin.mjs)
 * and the Vitest suite (evals/celestin-eval.test.ts).
 *
 * Pure functions — no I/O, no network, no env access.
 */

export function normalizeEvalText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function textContainsNumericToken(responseText, token) {
  return new RegExp(`(^|[^0-9])${token}([^0-9]|$)`).test(responseText)
}

const RATING_ALIASES = {
  '1': ['1', '1/5', 'un', 'une'],
  '2': ['2', '2/5', 'deux'],
  '3': ['3', '3/5', 'trois'],
  '4': ['4', '4/5', 'quatre'],
  '5': ['5', '5/5', 'cinq'],
}

export function responseContainsExpectedTerm(responseText, term) {
  const normalizedText = normalizeEvalText(responseText)
  const normalizedTerm = normalizeEvalText(term)

  const aliases = RATING_ALIASES[normalizedTerm] ?? [normalizedTerm]
  return aliases.some((alias) => {
    if (/^[1-5]$/.test(alias)) return textContainsNumericToken(normalizedText, alias)
    return normalizedText.includes(alias)
  })
}

/**
 * Lines, after trimming whitespace per line, that are non-empty.
 * Used for responseMaxLines assertion.
 */
export function responseLineCount(text) {
  return String(text ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .length
}

export function getUiActionKind(response) {
  return response?.ui_action?.kind ?? 'none'
}

export function getCards(response) {
  if (response?.ui_action?.kind === 'show_recommendations') {
    return response.ui_action.payload?.cards ?? []
  }
  return response?.cards ?? []
}

export function detectMemoryUsage(text, cards) {
  const haystack = [text, ...(cards ?? []).map((card) => `${card.reason ?? ''}`)]
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
  ]

  return patterns.some((pattern) => haystack.includes(pattern))
}

export function detectIntroFlags(text) {
  const normalized = (text ?? '').toLowerCase()
  return {
    hasTiens: normalized.includes('tiens'),
    hasPepites: normalized.includes('pépite') || normalized.includes('pepite'),
    hasAhLead: normalized.startsWith('ah,') || normalized.startsWith('ah '),
  }
}

/**
 * Single-turn scenario analysis: ui_action mismatch, color filters, max cards, memory, intro flags.
 */
export function analyzeScenarioResult(scenario, response) {
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

/**
 * Multi-turn conversation: per-turn checks (uiAction, nextPhase, cognitiveMode,
 * responseContains/NotContains, responseMaxLength, responseMaxLines).
 */
export function analyzeTurnResult(turn, response) {
  const actualUiAction = getUiActionKind(response)
  const actualPhase = response._nextState?.phase ?? null
  const checks = []

  if (turn.expect.uiAction !== null && turn.expect.uiAction !== undefined) {
    const pass = actualUiAction === turn.expect.uiAction
    checks.push({
      check: 'uiAction',
      expected: turn.expect.uiAction,
      actual: actualUiAction,
      pass,
    })
  }

  if (turn.expect.nextPhase !== null && turn.expect.nextPhase !== undefined) {
    const pass = actualPhase === turn.expect.nextPhase
    checks.push({
      check: 'nextPhase',
      expected: turn.expect.nextPhase,
      actual: actualPhase,
      pass,
    })
  }

  if (turn.expect.cognitiveMode !== null && turn.expect.cognitiveMode !== undefined) {
    const actualMode = response._debug?.cognitiveMode ?? null
    const pass = actualMode === turn.expect.cognitiveMode
    checks.push({
      check: 'cognitiveMode',
      expected: turn.expect.cognitiveMode,
      actual: actualMode ?? 'unknown',
      pass,
    })
  }

  if (Array.isArray(turn.expect.responseContains)) {
    const responseText = response.message ?? ''
    for (const term of turn.expect.responseContains) {
      const pass = responseContainsExpectedTerm(responseText, term)
      checks.push({
        check: 'contains',
        expected: term,
        actual: pass ? 'found' : 'missing',
        pass,
      })
    }
  }

  if (Array.isArray(turn.expect.responseNotContains)) {
    const responseText = (response.message ?? '').toLowerCase()
    for (const term of turn.expect.responseNotContains) {
      const found = responseText.includes(term.toLowerCase())
      checks.push({
        check: 'not_contains',
        expected: `absent: "${term}"`,
        actual: found ? 'found (bad)' : 'absent (good)',
        pass: !found,
      })
    }
  }

  if (typeof turn.expect.responseMaxLength === 'number') {
    const len = (response.message ?? '').length
    const pass = len <= turn.expect.responseMaxLength
    checks.push({
      check: 'maxLength',
      expected: `≤${turn.expect.responseMaxLength}`,
      actual: `${len}`,
      pass,
    })
  }

  if (typeof turn.expect.responseMaxLines === 'number') {
    const lines = responseLineCount(response.message)
    const pass = lines <= turn.expect.responseMaxLines
    checks.push({
      check: 'maxLines',
      expected: `≤${turn.expect.responseMaxLines}`,
      actual: `${lines}`,
      pass,
    })
  }

  return {
    uiActionKind: actualUiAction,
    nextPhase: actualPhase,
    cardCount: getCards(response).length,
    checks,
    allPassed: checks.every((c) => c.pass),
  }
}

/**
 * Build a text summary of assistant response for chained-turn history,
 * matching what the frontend stores (so the LLM sees coherent history).
 */
export function summarizeAssistantMessage(response) {
  let text = response.message ?? ''
  const uiAction = response.ui_action
  if (uiAction?.kind === 'show_recommendations') {
    const cards = uiAction.payload?.cards ?? []
    if (cards.length > 0) {
      text += ` [${cards.length} recommandations : ${cards.map((c) => c.name).join(', ')}]`
    }
  } else if (uiAction?.kind === 'prepare_add_wine') {
    text += ' [propose encavage]'
  } else if (uiAction?.kind === 'prepare_add_wines') {
    const count = uiAction.payload?.wines?.length ?? 0
    text += ` [propose ${count} encavages]`
  } else if (uiAction?.kind === 'prepare_log_tasting') {
    text += ' [propose dégustation]'
  }
  return text
}
