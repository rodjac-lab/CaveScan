import type { ContextPlan } from "./context-plan.ts"
import type { CelestinToolName } from "./tools.ts"
import type { RequestBody } from "./types.ts"

export type SourceMode =
  | { kind: 'normal'; tools: 'none' | 'auto' }
  | { kind: 'source_required' }
  | { kind: 'forced_tool'; tool: CelestinToolName }

function normalizeForSourceGate(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function forcedToolNameForPlan(contextPlan: ContextPlan): CelestinToolName | undefined {
  if (contextPlan.tools === 'force_cellar') return 'query_cellar'
  if (contextPlan.tools === 'force_memory') return 'query_memory'
  if (contextPlan.tools === 'force_tastings') return 'query_tastings'
  return undefined
}

function shouldRequireSourceForAutoTools(contextPlan: ContextPlan, body: RequestBody): boolean {
  if (contextPlan.tools !== 'auto') return false

  const normalized = normalizeForSourceGate(body.message)
  const isPersonalSubject = /\b(j ai|je|j y|moi|me|mes|on|nous|tu)\b/.test(normalized)
  const asksPastMemory = /\b(deja|ete|alle|allee|alles|souvenir|souviens|retrouve|retrouver|cherche|chercher|restaurant|resto|lieu|nom|note|degustation|bu|ouvert)\b/.test(normalized)
  const asksEllipticMemoryDetail = /\b(restaurant|resto|lieu|nom|adresse|ville|ou|où|quand|avec qui)\b/.test(normalized)
  const lastAssistant = [...body.history].reverse().find((turn) => turn.role === 'assistant')?.text
  const assistantWasDiscussingPersonalMemory = lastAssistant
    ? /\b(rome|restaurant|resto|barchetta|premnord|peppoli|pèppoli|degust|dégust|souvenir|tu y as|tu as bu|vous y etiez|vous y étiez)\b/i.test(lastAssistant)
    : false

  return (isPersonalSubject && asksPastMemory)
    || (asksEllipticMemoryDetail && assistantWasDiscussingPersonalMemory)
}

export function resolveSourceMode(contextPlan: ContextPlan, body: RequestBody): SourceMode {
  const forcedTool = forcedToolNameForPlan(contextPlan)
  if (forcedTool) return { kind: 'forced_tool', tool: forcedTool }
  if (shouldRequireSourceForAutoTools(contextPlan, body)) return { kind: 'source_required' }
  return { kind: 'normal', tools: contextPlan.tools === 'auto' ? 'auto' : 'none' }
}

export function forcedToolNameForSourceMode(sourceMode: SourceMode): CelestinToolName | undefined {
  return sourceMode.kind === 'forced_tool' ? sourceMode.tool : undefined
}

export function shouldRequireToolUseForSourceMode(sourceMode: SourceMode): boolean {
  return sourceMode.kind === 'source_required'
}

export function shouldEnableToolsForSourceMode(input: {
  sourceMode: SourceMode
  authReady: boolean
  hasImage: boolean
}): boolean {
  if (!input.authReady || input.hasImage) return false
  if (input.sourceMode.kind === 'forced_tool' || input.sourceMode.kind === 'source_required') return true
  return input.sourceMode.tools === 'auto'
}
