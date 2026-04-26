/**
 * Celestin LLM eval suite — runs the same scenarios + conversations as the
 * CLI runner (scripts/evaluate-celestin.mjs), but as Vitest tests with
 * per-scenario isolation.
 *
 * Gated by RUN_LLM_EVAL=1 because each test makes a real Gemini call via
 * the deployed celestin edge function (~$0.10 / full run). The default
 * `npm test` skips this suite to stay fast and free.
 *
 * Trigger explicitly:
 *   RUN_LLM_EVAL=1 npx vitest run evals/celestin-eval.test.ts
 *   npm run eval:celestin
 *   npm run verify:full
 */

import { beforeAll, describe, it, expect } from 'vitest'

import {
  analyzeScenarioResult,
  analyzeTurnResult,
  summarizeAssistantMessage,
} from './lib/assertions.mjs'

import {
  DEFAULT_CONVERSATIONS,
  DEFAULT_SCENARIOS,
  buildRequestBody,
  buildSingleTurnBody,
  callCelestin,
  loadJson,
  loadSupabaseEnv,
  resolveFixturePath,
} from './lib/runner.mjs'

import type { EvalConversation, EvalScenario } from './lib/runner.mjs'

const RUN_LLM_EVAL = process.env.RUN_LLM_EVAL === '1' || process.env.RUN_LLM_EVAL === 'true'

const TURN_TIMEOUT_MS = 60_000 // single Gemini call

// Lazy-loaded only when RUN_LLM_EVAL is set, so `npm test` (default) reads no
// fixture/scenario files. `it.each` needs the array up front though, so when
// gated we hand it [] and Vitest skips the parent describe entirely.
const scenarios: EvalScenario[] = RUN_LLM_EVAL
  ? loadJson<EvalScenario[]>(DEFAULT_SCENARIOS) ?? []
  : []
const conversations: EvalConversation[] = RUN_LLM_EVAL
  ? loadJson<EvalConversation[]>(DEFAULT_CONVERSATIONS) ?? []
  : []

interface EvalContext {
  supabaseUrl: string
  supabaseAnonKey: string
  fixture: Record<string, unknown>
}

function bootstrapEvalContext(): EvalContext {
  const env = loadSupabaseEnv()
  const fixturePath = resolveFixturePath(null)
  const fixture = loadJson<Record<string, unknown>>(fixturePath)
  if (!fixture) throw new Error(`Could not load fixture at ${fixturePath}`)
  return { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, fixture }
}

describe.skipIf(!RUN_LLM_EVAL)('Celestin LLM eval', () => {
  let ctx: EvalContext

  beforeAll(() => {
    ctx = bootstrapEvalContext()
  })

  describe('single-turn scenarios', () => {
    for (const scenario of scenarios) {
      it(
        scenario.id,
        async () => {
          const body = buildSingleTurnBody(ctx.fixture, scenario, null)
          const { data } = await callCelestin(body, ctx.supabaseUrl, ctx.supabaseAnonKey)
          const analysis = analyzeScenarioResult(scenario, data)

          const failures: string[] = []
          if (analysis.expectedUiActionKindMismatch) {
            failures.push(
              `expected ui_action.kind=${scenario.expectations?.expectedUiActionKind}, got ${analysis.uiActionKind}`,
            )
          }
          if (analysis.maxCardsExceeded) {
            failures.push(
              `cards (${analysis.cardCount}) > maxCards (${scenario.expectations?.maxCards})`,
            )
          }
          if (analysis.avoidColorHits.length > 0) {
            failures.push(
              `avoid-color hits: ${analysis.avoidColorHits.map((h) => `${h.name}(${h.color})`).join(', ')}`,
            )
          }

          expect(failures, failures.join(' ; ')).toEqual([])
        },
        TURN_TIMEOUT_MS,
      )
    }
  })

  describe('multi-turn conversations', () => {
    for (const conversation of conversations) {
      it(
        conversation.id,
        async () => {
          let history: Array<{ role: string; text: string }> = []
          let conversationState: unknown = null
          const failures: string[] = []

          for (let i = 0; i < conversation.turns.length; i++) {
            const turn = conversation.turns[i]
            const body = buildRequestBody(ctx.fixture, turn.message, history, conversationState, null)

            const { data } = await callCelestin(body, ctx.supabaseUrl, ctx.supabaseAnonKey)
            const analysis = analyzeTurnResult(turn, data)

            if (!analysis.allPassed) {
              const failedChecks = analysis.checks
                .filter((c) => !c.pass)
                .map((c) => `${c.check}(expected=${c.expected}, got=${c.actual})`)
                .join(' | ')
              failures.push(`turn ${i + 1} "${turn.message}" → ${failedChecks}`)
              break
            }

            const assistantText = summarizeAssistantMessage(data)
            history = [
              ...history,
              { role: 'user', text: turn.message },
              { role: 'assistant', text: assistantText },
            ]
            conversationState = data._nextState ?? null
          }

          expect(failures, failures.join('\n')).toEqual([])
        },
        conversation.turns.length * TURN_TIMEOUT_MS,
      )
    }
  })
})
