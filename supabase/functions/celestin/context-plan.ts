import type { TurnRoutingResult } from './turn-types.ts'

export type ProfileContextLevel = 'none' | 'minimal' | 'recommendation' | 'memory'
export type CaveContextLevel = 'none' | 'count' | 'shortlist' | 'tool_only' | 'full_debug'
export type ZonesContextLevel = 'none' | 'names'
export type MemoriesContextLevel = 'none' | 'targeted' | 'exact'
export type ToolContextPolicy = 'none' | 'auto' | 'force_cellar' | 'force_memory' | 'force_tastings'
export type HistoryContextLevel = 'compact' | 'normal' | 'pivot'
export type TruthPolicy = 'standard' | 'prudent_factual' | 'exact_only' | 'memory_only'

export interface ContextPlan {
  profile: ProfileContextLevel
  cave: CaveContextLevel
  zones: ZonesContextLevel
  memories: MemoriesContextLevel
  tools: ToolContextPolicy
  history: HistoryContextLevel
  truthPolicy: TruthPolicy
  reasons: string[]
}

function basePlan(): ContextPlan {
  return {
    profile: 'minimal',
    cave: 'none',
    zones: 'none',
    memories: 'none',
    tools: 'none',
    history: 'compact',
    truthPolicy: 'standard',
    reasons: [],
  }
}

function withReasons(plan: Omit<ContextPlan, 'reasons'>, reasons: string[]): ContextPlan {
  return { ...plan, reasons }
}

export function buildContextPlan(routingResult: TurnRoutingResult): ContextPlan {
  const route = routingResult.routing.winner

  switch (route) {
    case 'wine_question':
      return withReasons({
        ...basePlan(),
        profile: 'none',
        tools: 'auto',
        truthPolicy: 'prudent_factual',
      }, ['wine culture question: avoid injecting personal sources, but allow tools when the user asks for personal facts'])

    case 'cellar_lookup':
      return withReasons({
        ...basePlan(),
        profile: 'none',
        cave: 'tool_only',
        zones: 'names',
        tools: 'force_cellar',
        truthPolicy: 'exact_only',
      }, ['cellar lookup: exact inventory facts must come from cellar source'])

    case 'recommendation_request':
      return withReasons({
        ...basePlan(),
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }, ['recommendation: combine taste profile, cellar shortlist, and targeted texture'])

    case 'recommendation_refinement':
      return withReasons({
        ...basePlan(),
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }, ['recommendation refinement: keep current task context actionable'])

    case 'memory_guided_recommendation':
      return withReasons({
        ...basePlan(),
        profile: 'recommendation',
        cave: 'shortlist',
        zones: 'names',
        memories: 'targeted',
        tools: 'force_tastings',
        history: 'normal',
      }, ['memory-guided recommendation: recommendation must be grounded in exact tasting evidence'])

    case 'memory_lookup':
      return withReasons({
        ...basePlan(),
        profile: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        truthPolicy: 'memory_only',
      }, ['memory lookup: exact past-experience facts must come from tasting or memory source'])

    case 'exploratory_reco_pivot':
      return withReasons({
        ...basePlan(),
        profile: 'none',
        history: 'pivot',
      }, ['recommendation pivot: drop stale dish/card history and stale recommendation sources'])

    case 'tasting_log':
      return withReasons({
        ...basePlan(),
        profile: 'none',
        memories: 'exact',
        tools: 'force_tastings',
        history: 'normal',
        truthPolicy: 'memory_only',
      }, ['tasting route: tasting facts need exact source grounding'])

    case 'encavage_request':
    case 'image_cellar_action':
      return withReasons({
        ...basePlan(),
        profile: 'none',
        cave: 'count',
        zones: 'names',
        tools: 'auto',
        history: 'normal',
      }, ['cellar action: operational flow needs zones and limited cellar metadata'])

    case 'restaurant_image':
      return withReasons({
        ...basePlan(),
        profile: 'recommendation',
        cave: 'shortlist',
        memories: 'targeted',
        tools: 'auto',
        history: 'normal',
      }, ['restaurant image: menu pairing benefits from taste profile and available bottles'])

    case 'greeting':
    case 'social_ack':
    case 'task_cancel':
      return withReasons({
        ...basePlan(),
        profile: 'minimal',
        cave: 'count',
        truthPolicy: 'standard',
      }, ['social turn: keep context light'])

    case 'prefetch':
    case 'unknown':
    default:
      return withReasons({
        ...basePlan(),
        profile: 'none',
        tools: 'auto',
        truthPolicy: 'prudent_factual',
      }, ['fallback: avoid profile-based guessing, but allow tools when the model needs exact personal facts'])
  }
}
