import type { CelestinProviderResponse, UiActionKind } from "./types.ts"

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

function extractJsonObject(text: string): string {
  const stripped = stripMarkdownCodeBlock(text)
  if (stripped.trim().startsWith('{')) return stripped

  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?\{[\s\S]*?\})\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start >= 0 && end > start) return stripped.slice(start, end + 1)

  return stripped
}

export function parseAndValidate(raw: string): CelestinProviderResponse {
  const jsonText = extractJsonObject(raw).replace(/[\r\n]/g, ' ')
  const data = JSON.parse(jsonText) as CelestinProviderResponse
  if (!data.message) {
    throw new Error('Invalid response: missing "message" field')
  }
  if (/```(?:json)?/i.test(data.message) || /^\s*\{[\s\S]*"message"\s*:/i.test(data.message)) {
    throw new Error('Invalid response: message contains raw JSON')
  }

  const validUiActions: UiActionKind[] = ['show_recommendations', 'prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting']
  if (data.ui_action) {
    if (!validUiActions.includes(data.ui_action.kind)) {
      throw new Error(`Invalid ui_action kind: ${data.ui_action.kind}`)
    }
    if (data.ui_action.kind === 'show_recommendations' && (!data.ui_action.payload?.cards || data.ui_action.payload.cards.length === 0)) {
      throw new Error('Invalid ui_action: show_recommendations requires cards')
    }
    if ((data.ui_action.kind === 'prepare_add_wine' || data.ui_action.kind === 'prepare_log_tasting') && !data.ui_action.payload?.extraction) {
      throw new Error(`Invalid ui_action: ${data.ui_action.kind} requires extraction`)
    }
    if (data.ui_action.kind === 'prepare_add_wines' && (!data.ui_action.payload?.extractions || data.ui_action.payload.extractions.length === 0)) {
      throw new Error('Invalid ui_action: prepare_add_wines requires extractions array')
    }
  }

  if (data.action_chips && !Array.isArray(data.action_chips)) {
    data.action_chips = null
  }

  if (data.recommendation_selection && !Array.isArray(data.recommendation_selection)) {
    data.recommendation_selection = null
  }

  return data
}
