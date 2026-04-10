import { describe, expect, it } from 'vitest'
import { analyzeCelestinEvalResult, collectDiagnostics, scoreResult } from '@/lib/celestinEvalAnalysis'
import type { CelestinEvalResult, CelestinEvalScenario } from '@/lib/celestinEval'

function makeResult(scenario: CelestinEvalScenario, response: CelestinEvalResult['response']): CelestinEvalResult {
  return {
    id: scenario.id,
    provider: 'test',
    elapsedMs: 10,
    request: {},
    response,
    analysis: analyzeCelestinEvalResult(scenario, response, 'test'),
  }
}

describe('celestinEvalAnalysis', () => {
  it('detects ui action mismatches and forbidden recommendation colors', () => {
    const scenario: CelestinEvalScenario = {
      id: 'sushi',
      message: 'Ce soir sushi',
      expectations: {
        expectedUiActionKind: 'show_recommendations',
        avoidColors: ['rouge'],
      },
    }
    const result = makeResult(scenario, {
      message: 'Je te propose ceci.',
      ui_action: {
        kind: 'show_recommendations',
        payload: {
          cards: [{ name: 'Syrah', color: 'rouge' }],
        },
      },
    })

    expect(result.analysis.uiActionKind).toBe('show_recommendations')
    expect(result.analysis.cardCount).toBe(1)
    expect(result.analysis.avoidColorHits).toHaveLength(1)
    expect(scoreResult(scenario, result)).toBe('fail')
    expect(collectDiagnostics(scenario, result).map((diagnostic) => diagnostic.label)).toContain('Couleur interdite recommandee')
  })

  it('detects required relay questions', () => {
    const scenario: CelestinEvalScenario = {
      id: 'vague',
      message: 'Un bon vin',
      expectations: {
        expectedUiActionKind: 'none',
        expectRelay: true,
      },
    }
    const result = makeResult(scenario, {
      message: 'Pour quelle occasion ?',
      ui_action: null,
    })

    expect(result.analysis.isRelay).toBe(true)
    expect(scoreResult(scenario, result)).toBe('pass')
  })

  it('warns on forbidden wording without failing', () => {
    const scenario: CelestinEvalScenario = {
      id: 'style',
      message: 'Question',
      expectations: {
        expectedUiActionKind: 'none',
        forbiddenPatterns: ['Ah,'],
      },
    }
    const result = makeResult(scenario, {
      message: 'Ah, je vois.',
      ui_action: null,
    })

    expect(result.analysis.forbiddenPatternHits).toEqual(['Ah,'])
    expect(scoreResult(scenario, result)).toBe('warn')
  })
})
