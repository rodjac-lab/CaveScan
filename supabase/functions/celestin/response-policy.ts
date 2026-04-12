import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { CelestinResponse } from "./types.ts"

const BANNED_OPENERS = [
  'ah',
  'oh',
  'tiens',
  'bon',
  'alors',
  'absolument',
  'excellente question',
  'bien sur',
  'bien sûr',
]

function stripBannedOpener(message: string): string {
  const openerPattern = new RegExp(`^\\s*(?:${BANNED_OPENERS.join('|')})(?:[,!:.\\s]+)`, 'i')
  return message.replace(openerPattern, '').trimStart()
}

export function applyResponsePolicy(
  response: CelestinResponse,
  interpretation: TurnInterpretation,
): CelestinResponse {
  const result = {
    ...response,
    message: stripBannedOpener(response.message),
  }

  if (!interpretation.shouldAllowUiAction && result.ui_action) {
    console.log(`[celestin] Policy: stripped ui_action (${result.ui_action.kind}) — turnType=${interpretation.turnType}, mode=${interpretation.cognitiveMode}`)
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
