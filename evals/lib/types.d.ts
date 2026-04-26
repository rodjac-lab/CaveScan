/**
 * TypeScript declarations for the .mjs eval helpers, so consumers (Vitest
 * test files, scripts) get full type safety without the helpers themselves
 * needing to be in TypeScript.
 */

export interface CelestinResponse {
  message: string
  ui_action?: { kind?: string; payload?: unknown } | null
  cards?: unknown[]
  _nextState?: { phase?: string | null } | null
  _debug?: { cognitiveMode?: string | null; turnType?: string | null; provider?: string | null } | null
}

export interface EvalScenario {
  id: string
  message: string
  notes?: string
  history?: Array<{ role: string; content: string }>
  expectations?: {
    expectedUiActionKind?: string
    avoidColors?: string[]
    maxCards?: number
  }
}

export interface EvalTurn {
  message: string
  expect: {
    uiAction?: string | null
    nextPhase?: string | null
    cognitiveMode?: string | null
    responseContains?: string[]
    responseNotContains?: string[]
    responseMaxLength?: number
    responseMaxLines?: number
  }
}

export interface EvalConversation {
  id: string
  type?: string
  description?: string
  turns: EvalTurn[]
}

export interface TurnAnalysis {
  uiActionKind: string
  nextPhase: string | null
  cardCount: number
  checks: Array<{ check: string; expected: string; actual: string; pass: boolean }>
  allPassed: boolean
}

export interface ScenarioAnalysis {
  uiActionKind: string
  cardCount: number
  memoryUsed: boolean
  introFlags: { hasTiens: boolean; hasPepites: boolean; hasAhLead: boolean }
  expectedUiActionKindMismatch: boolean
  avoidColorHits: Array<{ name: string; color: string; badge: string }>
  maxCardsExceeded: boolean
}

// --- assertions.mjs ---
declare module './assertions.mjs' {
  export function normalizeEvalText(value: unknown): string
  export function textContainsNumericToken(responseText: string, token: string): boolean
  export function responseContainsExpectedTerm(responseText: string, term: string): boolean
  export function responseLineCount(text: unknown): number
  export function getUiActionKind(response: CelestinResponse | null | undefined): string
  export function getCards(response: CelestinResponse | null | undefined): unknown[]
  export function detectMemoryUsage(text: string, cards: Array<{ reason?: string }> | undefined): boolean
  export function detectIntroFlags(text: string): { hasTiens: boolean; hasPepites: boolean; hasAhLead: boolean }
  export function analyzeScenarioResult(scenario: EvalScenario, response: CelestinResponse): ScenarioAnalysis
  export function analyzeTurnResult(turn: EvalTurn, response: CelestinResponse): TurnAnalysis
  export function summarizeAssistantMessage(response: CelestinResponse): string
}

// --- runner.mjs ---
declare module './runner.mjs' {
  export const TEMPLATE_FIXTURE: string
  export const DEFAULT_SCENARIOS: string
  export const DEFAULT_CONVERSATIONS: string
  export const DEFAULT_OUT_DIR: string

  export function findLatestRealFixture(): string | null
  export function readEnvFile(filePath: string): Record<string, string>
  export function loadJson<T = unknown>(filePath: string | null | undefined): T | null
  export function ensureDir(dir: string): void
  export function buildRequestBody(
    fixture: Record<string, unknown>,
    message: string,
    history: Array<{ role: string; text: string }>,
    conversationState: unknown,
    provider: string | null,
  ): Record<string, unknown>
  export function buildSingleTurnBody(
    fixture: Record<string, unknown>,
    scenario: EvalScenario,
    provider: string | null,
  ): Record<string, unknown>
  export function callCelestin(
    body: Record<string, unknown>,
    baseUrl: string,
    anonKey: string,
  ): Promise<{ data: CelestinResponse; elapsedMs: number }>
  export function loadSupabaseEnv(): { supabaseUrl: string; supabaseAnonKey: string }
  export function resolveFixturePath(explicitPath: string | null, allowTemplate?: boolean): string
}
