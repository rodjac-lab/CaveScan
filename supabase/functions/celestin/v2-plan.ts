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
  recommendationReady: boolean
  actionReady: boolean
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

function normalizeRecommendationText(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .trim()
}

function hasRecommendationConstraint(message: string): boolean {
  const normalized = normalizeRecommendationText(message)

  const hasStyleConstraint =
    /\b(rouge|blanc|rose|bulles?|champagne)\b/.test(normalized)
    && /\b(leger|legere|sec|tendu|frais|fruite|structure|puissant|tannique|mineral|vif|rond|souple|plutot)\b/.test(normalized)

  const hasFoodOrMealContext = /\b(poulet|pizza|raclette|paella|poisson|viande|boeuf|agneau|porc|veau|canard|sushi|pates?|risotto|couscous|tajine|fromage|dessert|aperitif|apero|grillade|barbecue|volaille|fruits? de mer|saumon|thon|agneau|osso bucco)\b/.test(normalized)
    || /\b(pour accompagner|pour aller avec|pour manger|ce soir c est|diner rapide|dejeuner)\b/.test(normalized)

  return hasStyleConstraint || hasFoodOrMealContext
}

function recommendationReadyForRoute(input: {
  route: string
  message: string
}): boolean {
  if (input.route === 'recommendation_refinement') return true
  if (input.route === 'prefetch') return true
  if (input.route === 'memory_guided_recommendation') return true
  if (input.route !== 'recommendation_request') return true
  return hasRecommendationConstraint(input.message)
}

function hasActionPayloadSignal(input: {
  route: string
  message: string
  hasImage: boolean
}): boolean {
  if (input.hasImage) return true
  if (input.route === 'restaurant_image') return true

  const normalized = normalizeRecommendationText(input.message)
  if (input.route === 'image_cellar_action') return input.hasImage

  if (input.route !== 'encavage_request') return true

  const hasVintage = /\b(19|20)\d{2}\b/.test(normalized)
  const hasProducerSignal = /\b(domaine|chateau|château|clos|maison)\b/.test(input.message.toLowerCase())
  const hasAppellationOrRegion = /\b(sancerre|chablis|champagne|bourgogne|bordeaux|rhone|loire|jura|beaujolais|chianti|barolo|rioja|riesling|meursault|cote rotie|côte-rôtie)\b/.test(normalized)
  const hasBottleObject = /\b(bouteille|bouteilles|magnum|demi bouteille|vin)\b/.test(normalized)

  return hasProducerSignal && (hasVintage || hasAppellationOrRegion || hasBottleObject)
}

function actionReadyForRoute(input: {
  route: string
  message: string
  hasImage: boolean
}): boolean {
  if (input.route !== 'encavage_request' && input.route !== 'image_cellar_action' && input.route !== 'restaurant_image') return true
  return hasActionPayloadSignal(input)
}

function responseModeForCapability(input: {
  capability: CelestinCapability
  contextPlan: ContextPlan
  confidence: number
  recommendationReady: boolean
  actionReady: boolean
}): CelestinResponseMode {
  if (input.capability !== 'CHAT' && input.confidence < 0.7) return 'clarification'
  if (input.contextPlan.truthPolicy === 'exact_only' || input.contextPlan.truthPolicy === 'memory_only') return 'deterministic'
  if (input.capability === 'RECOMMEND') return input.recommendationReady ? 'closed_choice' : 'clarification'
  if (input.capability === 'ACTIONS') return input.actionReady ? 'workflow' : 'clarification'
  return 'free_chat'
}

function actionContractForCapability(capability: CelestinCapability, recommendationReady: boolean, actionReady: boolean): CelestinActionContract {
  if (capability === 'RECOMMEND') {
    if (!recommendationReady) {
      return {
        kind: 'none',
        allowedUiActionKinds: [],
        requiresBackendMaterialization: false,
        lowConfidenceBehavior: 'clarify',
      }
    }

    return {
      kind: 'closed_recommendation_selection',
      allowedUiActionKinds: ['show_recommendations'],
      requiresBackendMaterialization: true,
      lowConfidenceBehavior: 'clarify',
    }
  }

  if (capability === 'ACTIONS') {
    if (!actionReady) {
      return {
        kind: 'none',
        allowedUiActionKinds: [],
        requiresBackendMaterialization: false,
        lowConfidenceBehavior: 'clarify',
      }
    }

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
  const recommendationReady = capability === 'RECOMMEND'
    ? recommendationReadyForRoute({ route: input.routingResult.routing.winner, message: input.body.message })
    : true
  const actionReady = capability === 'ACTIONS'
    ? actionReadyForRoute({
        route: input.routingResult.routing.winner,
        message: input.body.message,
        hasImage: !!input.body.image,
      })
    : true
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
    recommendationReady,
    actionReady,
    requiredSources,
    actionContract: actionContractForCapability(capability, recommendationReady, actionReady),
    responseMode: responseModeForCapability({ capability, contextPlan: input.contextPlan, confidence, recommendationReady, actionReady }),
    reasons: [
      `route:${input.routingResult.routing.winner}`,
      `turn:${input.routingResult.interpretation.turnType}`,
      ...(capability === 'RECOMMEND' ? [`recommendationReady:${recommendationReady}`] : []),
      ...(capability === 'ACTIONS' ? [`actionReady:${actionReady}`] : []),
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
    ? 'Je peux te proposer une bouteille, mais il me manque un peu de contexte. Tu cherches plutot un accord avec un plat, une occasion, ou un style précis ?'
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
