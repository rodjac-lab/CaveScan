import type { CelestinResponse } from "./types.ts"

export interface CelestinProviderResponseTrace {
  provider: string
  rawTextPreview: string
  parseStatus: 'success' | 'wrapped_text' | 'error'
  normalized?: {
    messagePreview: string
    uiActionKind: string
    recommendationSelectionCount: number
    actionChipsCount: number
  }
  error?: string
}

export interface ProviderResponseTraceSink {
  responses: CelestinProviderResponseTrace[]
}

export function previewProviderText(value: string, max = 1600): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

function summarizeProviderResponse(response: CelestinResponse): CelestinProviderResponseTrace['normalized'] {
  return {
    messagePreview: previewProviderText(response.message, 500),
    uiActionKind: response.ui_action?.kind ?? 'none',
    recommendationSelectionCount: response.recommendation_selection?.length ?? 0,
    actionChipsCount: response.action_chips?.length ?? 0,
  }
}

export function recordProviderResponse(input: {
  trace?: ProviderResponseTraceSink
  provider: string
  rawText: string
  parseStatus: CelestinProviderResponseTrace['parseStatus']
  response?: CelestinResponse
  error?: unknown
}) {
  if (!input.trace) return
  input.trace.responses.push({
    provider: input.provider,
    rawTextPreview: previewProviderText(input.rawText),
    parseStatus: input.parseStatus,
    normalized: input.response ? summarizeProviderResponse(input.response) : undefined,
    error: input.error
      ? previewProviderText(input.error instanceof Error ? input.error.message : String(input.error), 500)
      : undefined,
  })
}
