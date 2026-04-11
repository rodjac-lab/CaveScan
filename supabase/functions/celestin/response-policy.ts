import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { CelestinResponse, RequestBody } from "./types.ts"

export function applyResponsePolicy(
  response: CelestinResponse,
  body: RequestBody,
  interpretation: TurnInterpretation,
  lastAssistantText?: string,
  messageLength?: number,
): CelestinResponse {
  const result = { ...response }

  if (!interpretation.shouldAllowUiAction && result.ui_action) {
    console.log(`[celestin] Policy: stripped ui_action (${result.ui_action.kind}) — turnType=${interpretation.turnType}, mode=${interpretation.cognitiveMode}`)
    result.ui_action = undefined
  }

  const hadRecentReco = lastAssistantText?.includes('[Vins proposés')
  if (hadRecentReco && (messageLength ?? 0) < 15 && result.ui_action?.kind === 'show_recommendations') {
    console.log('[celestin] Policy: fallback — stripped re-reco on very short post-reco message')
    result.ui_action = undefined
  }

  if (result.ui_action?.kind === 'prepare_add_wine' || result.ui_action?.kind === 'prepare_log_tasting') {
    const ext = result.ui_action.payload.extraction
    if (!ext?.domaine && !ext?.appellation) {
      console.log(`[celestin] Policy: stripped ${result.ui_action.kind} — extraction too incomplete (no domaine, no appellation)`)
      result.ui_action = undefined
    }
  }

  return result
}
