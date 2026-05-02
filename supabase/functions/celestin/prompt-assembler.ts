import { buildContextBlockFromResolvedSources } from "./context-builder.ts"
import type { ContextPlan } from "./context-plan.ts"
import type { ConversationState } from "./conversation-state.ts"
import { buildContextPlanInstructions } from "./prompt-context-policy.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"
import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent, TurnInterpretation } from "./turn-interpreter.ts"
import { buildUserPrompt } from "./user-prompt.ts"
import type { ConversationTurn, RequestBody } from "./types.ts"

export interface PromptAssemblyInput {
  body: RequestBody
  interpretation: TurnInterpretation
  contextPlan: ContextPlan
  resolvedSources: ResolvedContextSources
  state: ConversationState
  lastAssistantText?: string
  routingIntent?: RoutingIntent
}

export interface AssembledCelestinPrompt {
  contextBlock: string
  systemPrompt: string
  userPrompt: string
  providerHistory: ConversationTurn[]
}

export function buildProviderHistory(body: RequestBody, contextPlan?: ContextPlan): ConversationTurn[] {
  if (contextPlan?.history !== 'pivot') return body.history

  // A pivot such as "Et si je veux plutot un italien ?" must not let the model
  // continue the previous dish/cards. Routing already used the full history.
  return body.history.slice(0, -2)
}

export function assembleCelestinPrompt(input: PromptAssemblyInput): AssembledCelestinPrompt {
  const contextBlock = buildContextBlockFromResolvedSources(input.resolvedSources)
  const contextPolicy = buildContextPlanInstructions(input.contextPlan)
  const systemParts = [
    buildCelestinSystemPrompt(input.interpretation.cognitiveMode),
    contextPolicy ? `--- POLITIQUE DU TOUR ---\n\n${contextPolicy}` : '',
    `--- CONTEXTE UTILISATEUR ---\n\n${contextBlock}`,
  ].filter(Boolean)
  const systemPrompt = systemParts.join('\n\n')

  const userPrompt = buildUserPrompt(
    input.body,
    input.interpretation,
    input.state,
    input.lastAssistantText,
    input.routingIntent,
    input.contextPlan,
  )

  return {
    contextBlock,
    systemPrompt,
    userPrompt,
    providerHistory: buildProviderHistory(input.body, input.contextPlan),
  }
}
