import { buildMemoryEvidenceBundle } from '@/lib/tastingMemories'
import { analyzeCelestinEvalResult } from '@/lib/celestinEvalAnalysis'
import { CELESTIN_EVAL_SCENARIOS } from '@/lib/celestinEvalScenarios'
import { renderCelestinEvalHtmlReport } from '@/lib/celestinEvalReport'
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

export { analyzeCelestinEvalResult, CELESTIN_EVAL_SCENARIOS, renderCelestinEvalHtmlReport }

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
