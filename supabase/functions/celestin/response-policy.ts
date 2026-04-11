import type { ConversationState } from "./conversation-state.ts"
import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { CelestinResponse, RequestBody } from "./types.ts"

function stripFillerOpener(message: string): string {
  const cleaned = message.replace(/^(Ah[,! ] *|Oh[,! ] *|Tiens[,! ] *|Absolument[,! ] *|Excellente question[,! ] *)/i, '')
  if (cleaned !== message) {
    console.log(`[celestin] Policy: stripped filler opener`)
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
  return message
}

function neutralizeUnknownCategoryValidation(message: string): string {
  return message
    .replace(/\bcette appellation\b/gi, 'ce nom')
    .replace(/\bce domaine\b/gi, 'ce nom')
    .replace(/\bce cepage\b/gi, 'ce nom')
    .replace(/\bce cépage\b/gi, 'ce nom')
    .replace(/\bce terroir\b/gi, 'ce nom')
}

function extractPreviousRecommendationAnchor(history: RequestBody['history']): string | null {
  const previousUserTurn = [...history].reverse().find((turn) => turn.role === 'user')
  const text = previousUserTurn?.text?.trim()
  if (!text) return null

  const patterns = [
    /^(?:ce soir c['’]?est|ce soir c est)\s+(.+)$/i,
    /^(?:pour|avec)\s+(.+)$/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }

  return null
}

function stripPreviousAnchor(message: string, anchor: string): string {
  if (!anchor) return message

  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`\\bavec\\s+(?:le|la|les|l['’])?\\s*${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\bpour\\s+(?:le|la|les|l['’])?\\s*${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\bdu\\s+${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\bde\\s+${escapedAnchor}\\b`, 'gi'),
    new RegExp(`\\b${escapedAnchor}\\b`, 'gi'),
  ]

  let cleaned = message
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  cleaned = cleaned
    .replace(/\s+,/g, ',')
    .replace(/\s+!/g, '!')
    .replace(/\s+\?/g, '?')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ', ')
    .replace(/^,\s*/g, '')
    .trim()

  if (!cleaned) return message
  return cleaned
}

export function applyResponsePolicy(
  response: CelestinResponse,
  body: RequestBody,
  state: ConversationState,
  interpretation: TurnInterpretation,
  lastAssistantText?: string,
  messageLength?: number,
): CelestinResponse {
  const result = { ...response }

  if (result.message) {
    result.message = stripFillerOpener(result.message)
  }

  if (
    result.message
    && interpretation.cognitiveMode === 'wine_conversation'
    && /(appellation|domaine|cepage|cépage|terroir)/i.test(body.message)
    && /\bje ne (?:connais|reconnais) pas\b/i.test(result.message)
  ) {
    result.message = neutralizeUnknownCategoryValidation(result.message)
  }

  if (
    result.message
    && interpretation.turnType === 'context_switch'
    && interpretation.cognitiveMode === 'wine_conversation'
    && state.taskType === 'recommendation'
  ) {
    const previousAnchor = extractPreviousRecommendationAnchor(body.history)
    if (previousAnchor && !body.message.toLowerCase().includes(previousAnchor.toLowerCase())) {
      result.message = stripPreviousAnchor(result.message, previousAnchor)
      if (result.ui_action?.kind === 'show_recommendations') {
        result.ui_action.payload.cards = (result.ui_action.payload.cards ?? []).map((card) => ({
          ...card,
          reason: card.reason ? stripPreviousAnchor(card.reason, previousAnchor) : card.reason,
        }))
      }
    }
  }

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

