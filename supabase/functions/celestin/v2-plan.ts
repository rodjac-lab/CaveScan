import type { ContextPlan } from "./context-plan.ts"
import type { SourceMode } from "./source-mode.ts"
import type { TurnRoutingResult } from "./turn-types.ts"
import type { RequestBody } from "./types.ts"

export type CelestinOrchestrationVersion = 'v1' | 'v2'
export type CelestinCapability = 'FACTS' | 'RECOMMEND' | 'ACTIONS' | 'CHAT'
export type CelestinResponseMode = 'deterministic' | 'closed_choice' | 'workflow' | 'free_chat' | 'clarification'

export interface CelestinActionContract {
  kind: 'none' | 'closed_recommendation_selection' | 'operational_ui_action'
  allowedUiActionKinds: string[]
  requiresBackendMaterialization: boolean
  lowConfidenceBehavior: 'clarify' | 'free_chat'
}

export interface CelestinV2Plan {
  orchestrationVersion: CelestinOrchestrationVersion
  enabled: boolean
  capability: CelestinCapability
  confidence: number
  requiredSources: string[]
  actionContract: CelestinActionContract
  responseMode: CelestinResponseMode
  reasons: string[]
}

function normalizeConfidence(confidence: number | undefined): number {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 0.1
  return Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence))
}

function winnerConfidence(routingResult: TurnRoutingResult): number {
  const winner = routingResult.routing.winner
  const candidate = routingResult.routing.candidates.find((entry) => entry.intent === winner)
  return normalizeConfidence(candidate?.confidence)
}

function capabilityForRoute(route: string): CelestinCapability {
  if (route === 'cellar_lookup' || route === 'memory_lookup' || route === 'tasting_log') return 'FACTS'
  if (route === 'recommendation_request' || route === 'recommendation_refinement' || route === 'memory_guided_recommendation' || route === 'prefetch') {
    return 'RECOMMEND'
  }
  if (route === 'encavage_request' || route === 'image_cellar_action' || route === 'restaurant_image') return 'ACTIONS'
  return 'CHAT'
}

function responseModeForCapability(input: {
  capability: CelestinCapability
  contextPlan: ContextPlan
  confidence: number
}): CelestinResponseMode {
  if (input.capability !== 'CHAT' && input.confidence < 0.7) return 'clarification'
  if (input.contextPlan.truthPolicy === 'exact_only' || input.contextPlan.truthPolicy === 'memory_only') return 'deterministic'
  if (input.capability === 'RECOMMEND') return 'closed_choice'
  if (input.capability === 'ACTIONS') return 'workflow'
  return 'free_chat'
}

function actionContractForCapability(capability: CelestinCapability): CelestinActionContract {
  if (capability === 'RECOMMEND') {
    return {
      kind: 'closed_recommendation_selection',
      allowedUiActionKinds: ['show_recommendations'],
      requiresBackendMaterialization: true,
      lowConfidenceBehavior: 'clarify',
    }
  }

  if (capability === 'ACTIONS') {
    return {
      kind: 'operational_ui_action',
      allowedUiActionKinds: ['prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
      requiresBackendMaterialization: false,
      lowConfidenceBehavior: 'clarify',
    }
  }

  return {
    kind: 'none',
    allowedUiActionKinds: [],
    requiresBackendMaterialization: false,
    lowConfidenceBehavior: 'free_chat',
  }
}

function sourceModeRequirement(sourceMode: SourceMode): string | null {
  if (sourceMode.kind === 'forced_tool') return `tool:${sourceMode.tool}`
  if (sourceMode.kind === 'source_required') return 'tool:required'
  return null
}

function resolveVersion(body: RequestBody): CelestinOrchestrationVersion {
  return body.orchestrationVersion === 'v2' ? 'v2' : 'v1'
}

export function buildCelestinV2Plan(input: {
  body: RequestBody
  routingResult: TurnRoutingResult
  contextPlan: ContextPlan
  sourceMode: SourceMode
}): CelestinV2Plan {
  const orchestrationVersion = resolveVersion(input.body)
  const capability = capabilityForRoute(input.routingResult.routing.winner)
  const confidence = winnerConfidence(input.routingResult)
  const requiredSources: string[] = []
  if (input.contextPlan.profile !== 'none') requiredSources.push(`profile:${input.contextPlan.profile}`)
  if (input.contextPlan.cave !== 'none') requiredSources.push(`cave:${input.contextPlan.cave}`)
  if (input.contextPlan.zones !== 'none') requiredSources.push(`zones:${input.contextPlan.zones}`)
  if (input.contextPlan.memories !== 'none') requiredSources.push(`memories:${input.contextPlan.memories}`)
  if (input.contextPlan.cellarCandidates !== 'none') requiredSources.push(`cellarCandidates:${input.contextPlan.cellarCandidates}`)
  const sourceRequirement = sourceModeRequirement(input.sourceMode)
  if (sourceRequirement) requiredSources.push(sourceRequirement)

  return {
    orchestrationVersion,
    enabled: orchestrationVersion === 'v2',
    capability,
    confidence,
    requiredSources,
    actionContract: actionContractForCapability(capability),
    responseMode: responseModeForCapability({ capability, contextPlan: input.contextPlan, confidence }),
    reasons: [
      `route:${input.routingResult.routing.winner}`,
      `turn:${input.routingResult.interpretation.turnType}`,
      ...input.routingResult.routing.reasons,
      ...input.contextPlan.reasons,
    ],
  }
}

export function shouldClarifyLowConfidenceV2(plan: CelestinV2Plan): boolean {
  return plan.enabled && plan.responseMode === 'clarification'
}

export function buildLowConfidenceV2Response(plan: CelestinV2Plan) {
  const message = plan.capability === 'RECOMMEND'
    ? 'Je peux te proposer une bouteille, mais il me manque un contexte clair. Tu cherches plutot un accord avec un plat, une occasion, ou un style précis ?'
    : plan.capability === 'ACTIONS'
      ? "Je veux éviter de lancer une mauvaise action. Tu veux ajouter une bouteille, enregistrer une dégustation, ou sortir une bouteille de stock ?"
      : "Je peux répondre, mais je dois d'abord clarifier la demande pour ne pas inventer de fait personnel."

  return {
    message,
    ui_action: null,
    recommendation_selection: null,
    action_chips: null,
  }
}
