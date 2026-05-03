type UsageContext = {
  route?: string | null
  turnType?: string | null
  mode?: string | null
}

const TOOL_ROUTES = new Set([
  'cellar_lookup',
  'memory_lookup',
  'tasting_log',
  'recommendation_request',
  'recommendation_refinement',
  'memory_guided_recommendation',
])

const TOOL_MODES = new Set([
  'cellar_assistant',
  'tasting_memory',
  'wine_conversation',
])

export function shouldEnableCelestinTools(input: {
  authReady: boolean
  hasImage: boolean
  usageContext?: UsageContext
}): boolean {
  if (!input.authReady || input.hasImage) return false

  const route = input.usageContext?.route ?? null
  const mode = input.usageContext?.mode ?? null

  return (route != null && TOOL_ROUTES.has(route))
    || (mode != null && TOOL_MODES.has(mode))
}
