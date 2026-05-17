import { buildContextPlan, type ContextPlan } from "./context-plan.ts"
import { buildContextPackage } from "./context-package.ts"
import { computeNextState, INITIAL_STATE, type ConversationState } from "./conversation-state.ts"
import { buildDeterministicResponse } from "./deterministic-response.ts"
import { CelestinProviderFallbackError, celestinWithFallback, type CelestinProviderTrace } from "./llm-providers.ts"
import { resolveActiveMemoryFocus } from "./memory-focus.ts"
import { buildProviderHistory } from "./prompt-assembler.ts"
import { canResolveRecommendationUiAction, ensureRecommendationUiAction } from "./recommendation-action.ts"
import { applyResponsePolicy } from "./response-policy.ts"
import { interpretTurnWithRouting } from "./turn-interpreter.ts"
import { persistCelestinTurnObservability } from "./observability.ts"
import type { ResolvedContextSources } from "./source-resolver.ts"
import { forcedToolNameForSourceMode, resolveSourceMode, shouldEnableToolsForSourceMode, shouldRequireToolUseForSourceMode, type SourceMode } from "./source-mode.ts"
import { buildCelestinV2Plan, buildLowConfidenceV2Response, shouldClarifyLowConfidenceV2, type CelestinV2Plan } from "./v2-plan.ts"
import type { AuthContext } from "./auth.ts"
import type { CaveBottle, CelestinResponse, RequestBody } from "./types.ts"

export interface CelestinTurnRuntimeResult {
  response: CelestinResponse
  nextState: ConversationState
  debugTrace: Record<string, unknown>
  provider: string
  turnId: string
}

function resolveRequestSource(body: RequestBody): string {
  if (typeof body.requestSource === 'string' && body.requestSource.trim()) {
    return body.requestSource.trim()
  }

  if (body.message === '__prefetch__') return 'prefetch'
  if (body.provider && body.debugTrace) return 'debug_or_eval'
  return 'chat'
}

function uiActionKind(response: CelestinResponse): string {
  return response.ui_action?.kind ?? 'none'
}

function isClarificationMessage(message: string): boolean {
  return /\?/.test(message) || /\b(dis[- ]moi|precise|précise|quel plat|quelle occasion|tu manges quoi|c'est pour quoi)\b/i.test(message)
}

function normalizeForRecommendationContract(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .trim()
}

function asksUserToInspectCellar(assistantMessage: string): boolean {
  const normalized = normalizeForRecommendationContract(assistantMessage)
  return /\b(tu as|as tu|est ce que tu as|tu aurais|tu possedes|tu possèdes)\b.*\b(cave|blancs?|rouges?|roses?|bulles?|champagnes?|bouteilles?|vins?)\b/.test(normalized)
    || /\b(dans ta cave|en cave|qui trainent|qui traînent|sous la main)\b/.test(normalized)
}

export function canAcceptRecommendationClarification(input: {
  userMessage: string
  routingIntent: string
  assistantMessage: string
}): boolean {
  if (!isClarificationMessage(input.assistantMessage)) return false
  if (input.routingIntent !== 'recommendation_request') return false
  if (asksUserToInspectCellar(input.assistantMessage)) return false

  const normalized = normalizeForRecommendationContract(input.userMessage)
  const hasConcreteStyle = /\b(rouge|blanc|rose|bulles?|champagne)\b/.test(normalized)
  if (hasConcreteStyle) return false

  return true
}

export function operationalActionContractViolation(plan: CelestinV2Plan, response: CelestinResponse): string | null {
  if (!plan.enabled || plan.capability !== 'ACTIONS' || plan.responseMode !== 'workflow') return null
  const kind = response.ui_action?.kind
  if (!kind) return 'Operational action contract violation: missing ui_action'
  if (!plan.actionContract.allowedUiActionKinds.includes(kind)) {
    return `Operational action contract violation: disallowed ui_action ${kind}`
  }
  return null
}

function isRecommendationContractError(message: string): boolean {
  return message.includes('Recommendation response contract violation: no resolvable ui_action or recommendation_selection')
}

function firstProviderMessage(trace: CelestinProviderTrace): string | null {
  for (const response of trace.responses) {
    const message = response.normalized?.messagePreview?.trim()
    if (message) return message
  }
  return null
}

export function canDegradeClosedChoiceRecommendation(input: {
  error: unknown
  v2Plan: CelestinV2Plan
  routingIntent: string
}): boolean {
  if (!(input.error instanceof CelestinProviderFallbackError)) return false
  if (!input.v2Plan.enabled || input.v2Plan.capability !== 'RECOMMEND' || input.v2Plan.responseMode !== 'closed_choice') return false
  if (
    input.routingIntent !== 'recommendation_request'
    && input.routingIntent !== 'recommendation_refinement'
    && input.routingIntent !== 'memory_guided_recommendation'
  ) return false
  return input.error.providerErrors.some(isRecommendationContractError) && firstProviderMessage(input.error.trace) !== null
}

export function buildClosedChoiceDegradedRecommendation(input: {
  error: CelestinProviderFallbackError
  userMessage: string
  interpretation: ReturnType<typeof interpretTurnWithRouting>['interpretation']
  routingIntent: ReturnType<typeof interpretTurnWithRouting>['routing']['winner']
  resolvedSources: ResolvedContextSources
}): CelestinResponse {
  const providerMessage = firstProviderMessage(input.error.trace)
  const message = providerMessage && !isClarificationMessage(providerMessage)
    ? providerMessage
    : 'Je te propose les options les plus pertinentes de ta cave pour cet accord.'

  return ensureRecommendationUiAction({
    response: {
      message,
      ui_action: null,
      action_chips: ['Autre option', 'Plus frais', 'Voir ma cave'],
      recommendation_selection: null,
    },
    interpretation: input.interpretation,
    routingIntent: input.routingIntent,
    resolvedSources: input.resolvedSources,
    userMessage: input.userMessage,
    requireStructuredSelection: false,
    allowMaterialization: true,
    minimumCards: 2,
  })
}

function emptyProviderTrace(): CelestinProviderTrace {
  return {
    attempts: [],
    toolCalls: [],
    claudeCache: { creationInputTokens: 0, readInputTokens: 0 },
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    providerPath: 'direct_response',
    responses: [],
  }
}

function usedRecommendationCandidateTool(trace: CelestinProviderTrace): boolean {
  return trace.toolCalls.some((tool) => tool.name === 'search_cellar_candidates')
}

function buildDebugTrace(input: {
  body: RequestBody
  conversationState: ConversationState
  nextState: ConversationState
  contextBlock: string
  systemPrompt: string
  userPrompt: string
  provider: string
  activeMemoryFocus: string | null
  rawResponse: CelestinResponse
  response: CelestinResponse
  routingResult: ReturnType<typeof interpretTurnWithRouting>
  providerErrors: string[]
  providerTrace: CelestinProviderTrace
  contextPlan: ContextPlan
  sourceMode: SourceMode
  resolvedSources: ResolvedContextSources
  v2Plan: CelestinV2Plan
}) {
  const { body, conversationState, nextState, rawResponse, response, routingResult } = input

  return {
    turnType: routingResult.interpretation.turnType,
    cognitiveMode: routingResult.interpretation.cognitiveMode,
    provider: input.provider,
    providerErrors: input.providerErrors,
    providerTrace: input.providerTrace,
    compiledProfile: !!input.resolvedSources.profile?.compiledMarkdown,
    memoryEvidenceMode: body.memoryEvidenceMode ?? null,
    memoryFocus: input.activeMemoryFocus,
    factReadiness: input.resolvedSources.tastings?.factReadiness ?? null,
    conversationalIntent: (typeof body.conversationalIntent === 'string' ? body.conversationalIntent : null),
    routing: routingResult.routing,
    contextPlan: input.contextPlan,
    sourceMode: input.sourceMode,
    capability: input.v2Plan.capability,
    confidence: input.v2Plan.confidence,
    recommendationReady: input.v2Plan.recommendationReady,
    actionReady: input.v2Plan.actionReady,
    actionContract: input.v2Plan.actionContract,
    responseMode: input.v2Plan.responseMode,
    orchestrationVersion: input.v2Plan.orchestrationVersion,
    v2: input.v2Plan,
    state: {
      beforePhase: conversationState.phase,
      beforeTask: conversationState.taskType ?? null,
      beforeMemoryFocus: conversationState.memoryFocus ?? null,
      afterPhase: nextState.phase,
      afterTask: nextState.taskType ?? null,
      afterMemoryFocus: nextState.memoryFocus ?? null,
    },
    prompt: {
      systemChars: input.systemPrompt.length,
      userChars: input.userPrompt.length,
      contextChars: input.contextBlock.length,
      historyTurns: body.history.length,
      providerHistoryTurns: buildProviderHistory(body, input.contextPlan).length,
      frontendCaveCount: body.cave?.length ?? 0,
      hasImage: !!body.image,
      resolvedSourceRequirements: input.resolvedSources.requirements,
      resolvedCave: {
        level: input.resolvedSources.cave.level,
        totalBottles: input.resolvedSources.cave.totalBottles,
        referenceCount: input.resolvedSources.cave.referenceCount,
        injectedBottles: input.resolvedSources.cave.bottles.length,
      },
    },
    memory: body.memoryTrace ?? null,
    policy: {
      rawUiActionKind: uiActionKind(rawResponse),
      finalUiActionKind: uiActionKind(response),
      strippedUiAction: uiActionKind(rawResponse) !== uiActionKind(response),
    },
  }
}

function compactBottleFromRow(row: Record<string, unknown>): CaveBottle | null {
  if (typeof row.id !== 'string') return null
  return {
    id: row.id.slice(0, 8),
    domaine: typeof row.domaine === 'string' ? row.domaine : null,
    cuvee: typeof row.cuvee === 'string' ? row.cuvee : null,
    appellation: typeof row.appellation === 'string' ? row.appellation : null,
    millesime: typeof row.millesime === 'number' ? row.millesime : null,
    couleur: typeof row.couleur === 'string' ? row.couleur : null,
    character: typeof row.character === 'string' ? row.character : null,
    quantity: typeof row.quantity === 'number' ? row.quantity : undefined,
    food_pairings: Array.isArray(row.food_pairings) ? row.food_pairings.filter((item): item is string => typeof item === 'string') : null,
  }
}

function compactBottleFromToolCandidate(row: Record<string, unknown>): CaveBottle | null {
  if (typeof row.id !== 'string') return null
  return {
    id: row.id.slice(0, 8),
    domaine: typeof row.domaine === 'string' ? row.domaine : null,
    cuvee: typeof row.cuvee === 'string' ? row.cuvee : null,
    appellation: typeof row.appellation === 'string' ? row.appellation : null,
    millesime: typeof row.millesime === 'number' ? row.millesime : null,
    couleur: typeof row.couleur === 'string' ? row.couleur : null,
    character: typeof row.why_candidate === 'string'
      ? row.why_candidate
      : typeof row.character === 'string'
        ? row.character
        : null,
    quantity: typeof row.quantity === 'number' ? row.quantity : undefined,
    food_pairings: Array.isArray(row.food_pairings) ? row.food_pairings.filter((item): item is string => typeof item === 'string') : null,
  }
}

function mergeCaveBottles(primary: CaveBottle[], extra: CaveBottle[]): CaveBottle[] {
  const byId = new Map<string, CaveBottle>()
  for (const bottle of [...primary, ...extra]) {
    if (!bottle.id || byId.has(bottle.id)) continue
    byId.set(bottle.id, bottle)
  }
  return [...byId.values()]
}

function resolveRecommendationToolCandidates(providerTrace: CelestinProviderTrace): CaveBottle[] {
  return providerTrace.toolCalls
    .filter((tool) => tool.name === 'search_cellar_candidates')
    .flatMap((tool) => tool.rows ?? [])
    .map((row) => compactBottleFromToolCandidate(row))
    .filter((bottle): bottle is CaveBottle => bottle !== null)
}

async function resolveRecommendationSelectionSources(input: {
  response: CelestinResponse
  resolvedSources: ResolvedContextSources
  providerTrace: CelestinProviderTrace
  auth?: AuthContext
}): Promise<ResolvedContextSources> {
  const toolCandidates = resolveRecommendationToolCandidates(input.providerTrace)
  const selectionIds = (input.response.recommendation_selection ?? [])
    .map((item) => item.bottle_id?.trim())
    .filter((id): id is string => !!id)
  if (selectionIds.length === 0 && toolCandidates.length === 0) return input.resolvedSources
  const allSelectionsAlreadyResolved = selectionIds.every((id) =>
    input.resolvedSources.cave.bottles.some((bottle) => bottle.id.startsWith(id) || id.startsWith(bottle.id)),
  )
  if (allSelectionsAlreadyResolved && toolCandidates.length === 0) {
    return input.resolvedSources
  }
  if (!input.auth?.userId || !input.auth.supabase) return input.resolvedSources

  const { data, error } = await input.auth.supabase
    .from('bottles')
    .select('id,domaine,cuvee,appellation,millesime,couleur,character,quantity,food_pairings,status')
    .eq('user_id', input.auth.userId)
    .eq('status', 'in_stock')
    .limit(500)

  if (error) {
    console.warn('[celestin:recommendations] Could not resolve selected bottles:', error.message)
    return input.resolvedSources
  }

  const selected = (data ?? [])
    .filter((row: Record<string, unknown>) => {
      if (typeof row.id !== 'string') return false
      return selectionIds.some((id) => row.id.startsWith(id) || id.startsWith(row.id.slice(0, 8)))
    })
    .map((row: Record<string, unknown>) => compactBottleFromRow(row))
    .filter((bottle): bottle is CaveBottle => bottle !== null)

  const bottles = mergeCaveBottles(selected, toolCandidates)
  if (bottles.length === 0) return input.resolvedSources

  return {
    ...input.resolvedSources,
    cave: {
      ...input.resolvedSources.cave,
      level: 'shortlist',
      referenceCount: bottles.length,
      totalBottles: bottles.reduce((sum, bottle) => sum + (typeof bottle.quantity === 'number' ? bottle.quantity : 1), 0),
      bottles,
    },
  }
}

export async function runCelestinTurn(body: RequestBody, auth?: AuthContext): Promise<CelestinTurnRuntimeResult> {
  const startedAt = performance.now()
  const turnId = crypto.randomUUID()
  const conversationState: ConversationState = body.conversationState ?? { ...INITIAL_STATE }
  const requestSource = resolveRequestSource(body)
  let routingResult: ReturnType<typeof interpretTurnWithRouting> | null = null
  let contextPlan: ContextPlan | null = null
  let sourceMode: SourceMode | null = null
  let v2Plan: CelestinV2Plan | null = null
  let activeMemoryFocus: string | null = null
  let resolvedSources: ResolvedContextSources | null = null
  let contextBlock = ''
  let systemPrompt = ''
  let userPrompt = ''
  let providerHistory: ReturnType<typeof buildProviderHistory> = []
  let failedProviderTrace: CelestinProviderTrace | null = null
  let failedProviderErrors: string[] = []

  try {
    const lastAssistantTurn = [...body.history].reverse().find((turn) => turn.role === 'assistant')
    const lastAssistantText = lastAssistantTurn?.text
    const conversationalIntent = typeof body.conversationalIntent === 'string' ? body.conversationalIntent : null
    routingResult = interpretTurnWithRouting(body.message, !!body.image, conversationState, lastAssistantText, conversationalIntent)
    const { interpretation, routing } = routingResult
    contextPlan = buildContextPlan(routingResult)
    sourceMode = resolveSourceMode(contextPlan, body)
    v2Plan = buildCelestinV2Plan({ body, routingResult, contextPlan, sourceMode })

    console.log(`[celestin] source=${requestSource} message="${body.message.slice(0, 80)}" turn=${interpretation.turnType} mode=${interpretation.cognitiveMode} route=${routing.winner} capability=${v2Plan.capability} confidence=${v2Plan.confidence.toFixed(2)} orchestration=${v2Plan.orchestrationVersion} profile=${contextPlan.profile} cavePlan=${contextPlan.cave} tools=${contextPlan.tools} truth=${contextPlan.truthPolicy} state=${conversationState.phase} convIntent=${conversationalIntent ?? 'null'} history=${body.history.length} cave=${body.cave?.length ?? 0} image=${body.image ? 'yes' : 'no'}`)

    activeMemoryFocus = resolveActiveMemoryFocus(body, interpretation, conversationState, lastAssistantText)
    const contextPackage = await buildContextPackage({
      body,
      interpretation,
      contextPlan,
      state: conversationState,
      activeMemoryFocus,
      lastAssistantText,
      routingIntent: routing.winner,
      auth,
    })
    ;({
      sources: resolvedSources,
      contextBlock,
      systemPrompt,
      userPrompt,
      providerHistory,
    } = contextPackage)

    if (shouldClarifyLowConfidenceV2(v2Plan)) {
      const rawResponse = buildLowConfidenceV2Response(v2Plan)
      const response = applyResponsePolicy(rawResponse, interpretation)
      const providerTrace = emptyProviderTrace()
      const provider = 'v2_clarification'
      const nextState = computeNextState(
        conversationState,
        interpretation.turnType,
        false,
        undefined,
        interpretation.inferredTaskType,
        activeMemoryFocus,
      )

      const debugTrace = buildDebugTrace({
        body,
        conversationState,
        nextState,
        contextBlock,
        systemPrompt,
        userPrompt,
        provider,
        activeMemoryFocus,
        rawResponse,
        response,
        routingResult,
        providerErrors: [],
        providerTrace,
        contextPlan,
        sourceMode,
        resolvedSources,
        v2Plan,
      })

      await persistCelestinTurnObservability({
        supabase: auth?.supabase ?? null,
        turnId,
        userId: auth?.userId ?? null,
        body,
        startedAt,
        success: true,
        route: routing.winner,
        turnType: interpretation.turnType,
        mode: interpretation.cognitiveMode,
        stateBefore: conversationState,
        stateAfter: nextState,
        activeMemoryFocus,
        prompt: {
          systemChars: systemPrompt.length,
          userChars: userPrompt.length,
          contextChars: contextBlock.length,
          providerHistoryTurns: providerHistory.length,
        },
        response,
        rawResponse,
        provider,
        providerErrors: [],
        providerTrace,
        contextPlan,
        sourceMode,
        resolvedSources,
        v2Plan,
      })

      console.log(`[celestin] V2 clarification: route=${routing.winner} capability=${v2Plan.capability} confidence=${v2Plan.confidence.toFixed(2)}`)

      return {
        response,
        nextState,
        debugTrace,
        provider,
        turnId,
      }
    }

    const deterministicResponse = buildDeterministicResponse({
      body,
      routingIntent: routing.winner,
      contextPlan,
      resolvedSources,
    })

    if (deterministicResponse) {
      const response = applyResponsePolicy(deterministicResponse, interpretation)
      const providerTrace = emptyProviderTrace()
      const provider = 'deterministic'
      const nextState = computeNextState(
        conversationState,
        interpretation.turnType,
        !!response.ui_action,
        response.ui_action?.kind,
        interpretation.inferredTaskType,
        activeMemoryFocus,
      )

      const debugTrace = buildDebugTrace({
        body,
        conversationState,
        nextState,
        contextBlock,
        systemPrompt,
        userPrompt,
        provider,
        activeMemoryFocus,
        rawResponse: deterministicResponse,
        response,
        routingResult,
        providerErrors: [],
        providerTrace,
        contextPlan,
        sourceMode,
        resolvedSources,
        v2Plan,
      })

      await persistCelestinTurnObservability({
        supabase: auth?.supabase ?? null,
        turnId,
        userId: auth?.userId ?? null,
        body,
        startedAt,
        success: true,
        route: routing.winner,
        turnType: interpretation.turnType,
        mode: interpretation.cognitiveMode,
        stateBefore: conversationState,
        stateAfter: nextState,
        activeMemoryFocus,
        prompt: {
          systemChars: systemPrompt.length,
          userChars: userPrompt.length,
          contextChars: contextBlock.length,
          providerHistoryTurns: providerHistory.length,
        },
        response,
        rawResponse: deterministicResponse,
        provider,
        providerErrors: [],
        providerTrace,
        contextPlan,
        sourceMode,
        resolvedSources,
        v2Plan,
      })

      console.log(`[celestin] Deterministic response: route=${routing.winner} msg="${response.message.slice(0, 120)}"`)

      return {
        response,
        nextState,
        debugTrace,
        provider,
        turnId,
      }
    }

    let provider: string
    let rawResponse: CelestinResponse
    let providerErrors: string[]
    let providerTrace: CelestinProviderTrace
    try {
      const providerResult = await celestinWithFallback(
        systemPrompt,
        userPrompt,
        providerHistory,
        body.provider,
        body.image,
        {
          auth,
          requestSource,
          toolsEnabled: shouldEnableToolsForSourceMode({
            sourceMode,
            authReady: !!auth?.userId && !!auth.supabase,
            hasImage: !!body.image,
          }),
          forcedToolName: forcedToolNameForSourceMode(sourceMode),
          requireToolUse: shouldRequireToolUseForSourceMode(sourceMode),
          validateResponse: (candidate) => {
            const policyCandidate = applyResponsePolicy(candidate, interpretation)
            const actionViolation = operationalActionContractViolation(v2Plan, policyCandidate)
            if (actionViolation) return actionViolation

            if (
              interpretation.shouldAllowUiAction
              && (routing.winner === 'recommendation_request' || routing.winner === 'recommendation_refinement' || routing.winner === 'memory_guided_recommendation')
              && (!v2Plan.enabled || v2Plan.responseMode === 'closed_choice')
              && !canResolveRecommendationUiAction({
                response: policyCandidate,
                resolvedSources,
                userMessage: body.message,
                canFetchSelectedBottleIds: !!auth?.userId && !!auth.supabase,
              })
              && !(
                !v2Plan.enabled
                && canAcceptRecommendationClarification({
                  userMessage: body.message,
                  routingIntent: routing.winner,
                  assistantMessage: policyCandidate.message,
                })
              )
            ) {
              return 'Recommendation response contract violation: no resolvable ui_action or recommendation_selection'
            }

            return null
          },
          usageContext: {
            turnId,
            route: routing.winner,
            turnType: interpretation.turnType,
            mode: interpretation.cognitiveMode,
          },
        },
      )
      provider = providerResult.provider
      rawResponse = providerResult.response
      providerErrors = providerResult.providerErrors
      providerTrace = providerResult.trace
    } catch (error) {
      if (
        error instanceof CelestinProviderFallbackError
        && canDegradeClosedChoiceRecommendation({ error, v2Plan, routingIntent: routing.winner })
      ) {
        failedProviderTrace = error.trace
        failedProviderErrors = error.providerErrors
        provider = 'contract_degraded'
        rawResponse = buildClosedChoiceDegradedRecommendation({
          error,
          userMessage: body.message,
          interpretation,
          routingIntent: routing.winner,
          resolvedSources,
        })
        providerErrors = error.providerErrors
        providerTrace = error.trace
        providerTrace.providerPath = 'fallback_response'
      } else {
        if (error instanceof CelestinProviderFallbackError) {
          failedProviderTrace = error.trace
          failedProviderErrors = error.providerErrors
        }
        throw error
      }
    }

    const policyResponse = applyResponsePolicy(rawResponse, interpretation)
    const responseSources = await resolveRecommendationSelectionSources({
      response: policyResponse,
      resolvedSources,
      providerTrace,
      auth,
    })
    const response = ensureRecommendationUiAction({
      response: policyResponse,
      interpretation,
      routingIntent: routing.winner,
      resolvedSources: responseSources,
      userMessage: body.message,
      requireStructuredSelection: usedRecommendationCandidateTool(providerTrace),
      allowMaterialization: !v2Plan.enabled || v2Plan.responseMode === 'closed_choice',
      minimumCards: v2Plan.enabled && v2Plan.responseMode === 'closed_choice' ? 2 : 1,
    })

    const nextState = computeNextState(
      conversationState,
      interpretation.turnType,
      !!response.ui_action,
      response.ui_action?.kind,
      interpretation.inferredTaskType,
      activeMemoryFocus,
    )

    const debugTrace = buildDebugTrace({
      body,
      conversationState,
      nextState,
      contextBlock,
      systemPrompt,
      userPrompt,
      provider,
      activeMemoryFocus,
      rawResponse,
      response,
      routingResult,
      providerErrors,
      providerTrace,
      contextPlan,
      sourceMode,
      resolvedSources: responseSources,
      v2Plan,
    })

    await persistCelestinTurnObservability({
      supabase: auth?.supabase ?? null,
      turnId,
      userId: auth?.userId ?? null,
      body,
      startedAt,
      success: true,
      route: routing.winner,
      turnType: interpretation.turnType,
      mode: interpretation.cognitiveMode,
      stateBefore: conversationState,
      stateAfter: nextState,
      activeMemoryFocus,
      prompt: {
        systemChars: systemPrompt.length,
        userChars: userPrompt.length,
        contextChars: contextBlock.length,
        providerHistoryTurns: providerHistory.length,
      },
      response,
      rawResponse,
      provider,
      providerErrors,
      providerTrace,
      contextPlan,
      sourceMode,
      resolvedSources: responseSources,
      v2Plan,
    })

    if (body.debugTrace) {
      console.log('[celestin:trace]', JSON.stringify({
        route: routing.winner,
        source: requestSource,
        turnType: interpretation.turnType,
        mode: interpretation.cognitiveMode,
        memoryDecision: (body.memoryTrace as { decision?: unknown } | undefined)?.decision ?? null,
        uiAction: uiActionKind(response),
        provider,
        providerPath: providerTrace.providerPath,
        contextPlan,
        sourceMode,
        toolCalls: providerTrace.toolCalls.map((tool) => ({ name: tool.name, totalRows: tool.totalRows, durationMs: tool.durationMs })),
      }))
    }

    console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'} nextState=${nextState.phase} focus=${nextState.memoryFocus ?? 'none'} sourceMode=${sourceMode.kind} msg="${response.message.slice(0, 120)}" compiled=${responseSources.profile?.compiledMarkdown ? 'yes' : 'no'}`)

    return {
      response,
      nextState,
      debugTrace,
      provider,
      turnId,
    }
  } catch (error) {
    await persistCelestinTurnObservability({
      supabase: auth?.supabase ?? null,
      turnId,
      userId: auth?.userId ?? null,
      body,
      startedAt,
      success: false,
      error,
      route: routingResult?.routing.winner ?? null,
      turnType: routingResult?.interpretation.turnType ?? null,
      mode: routingResult?.interpretation.cognitiveMode ?? null,
      stateBefore: conversationState,
      activeMemoryFocus,
      prompt: contextPlan ? {
        systemChars: systemPrompt.length,
        userChars: userPrompt.length,
        contextChars: contextBlock.length,
        providerHistoryTurns: providerHistory.length,
      } : null,
      providerErrors: failedProviderErrors,
      providerTrace: failedProviderTrace,
      contextPlan,
      sourceMode,
      resolvedSources,
      v2Plan,
    })
    throw error
  }
}
