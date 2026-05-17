import type { AuthContext } from "./auth.ts"
import type { ContextPlan } from "./context-plan.ts"
import type { ConversationState } from "./conversation-state.ts"
import { assembleCelestinPrompt } from "./prompt-assembler.ts"
import { resolveContextSourcesForRequest, type ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"
import type { ConversationTurn, RequestBody } from "./types.ts"

export interface ContextPackage {
  plan: ContextPlan
  sources: ResolvedContextSources
  contextBlock: string
  systemPrompt: string
  userPrompt: string
  providerHistory: ConversationTurn[]
}

export async function buildContextPackage(input: {
  body: RequestBody
  interpretation: TurnInterpretation
  contextPlan: ContextPlan
  state: ConversationState
  activeMemoryFocus: string | null
  lastAssistantText?: string
  routingIntent: RoutingIntent
  auth?: AuthContext
}): Promise<ContextPackage> {
  const sources = await resolveContextSourcesForRequest(input.body, input.contextPlan, input.auth, {
    activeMemoryFocus: input.activeMemoryFocus,
  })
  const prompt = assembleCelestinPrompt({
    body: input.body,
    interpretation: input.interpretation,
    contextPlan: input.contextPlan,
    resolvedSources: sources,
    state: { ...input.state, memoryFocus: input.activeMemoryFocus },
    lastAssistantText: input.lastAssistantText,
    routingIntent: input.routingIntent,
  })

  return {
    plan: input.contextPlan,
    sources,
    ...prompt,
  }
}
