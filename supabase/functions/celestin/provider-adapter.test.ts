import { describe, expect, it } from 'vitest'
import { previewProviderText, recordProviderResponse, type ProviderResponseTraceSink } from './provider-adapter'
import { containsStructuredResponseAttempt, parseAndValidate } from './response-validation'

describe('provider-adapter', () => {
  it('records raw provider text and normalized response summary', () => {
    const trace: ProviderResponseTraceSink = { responses: [] }

    recordProviderResponse({
      trace,
      provider: 'Claude',
      rawText: '{\n  "message": "Voici trois pistes.",\n  "recommendation_selection": []\n}',
      parseStatus: 'success',
      response: {
        message: 'Voici trois pistes.',
        recommendation_selection: [{ bottle_id: 'abc12345', name: 'Domaine X', reason: 'Accord.', badge: 'Accord parfait' }],
        ui_action: null,
        action_chips: ['Et en rouge ?'],
      },
    })

    expect(trace.responses).toHaveLength(1)
    expect(trace.responses[0]).toMatchObject({
      provider: 'Claude',
      parseStatus: 'success',
      rawTextPreview: '{ "message": "Voici trois pistes.", "recommendation_selection": [] }',
      normalized: {
        messagePreview: 'Voici trois pistes.',
        uiActionKind: 'none',
        recommendationSelectionCount: 1,
        actionChipsCount: 1,
      },
    })
  })

  it('truncates raw provider text previews', () => {
    expect(previewProviderText('a'.repeat(20), 8)).toBe('aaaaaaaa')
  })

  it('treats malformed structured output as a provider error, not wrapped text', () => {
    const raw = `Réponse lisible.

\`\`\`json
{
  "message": "Réponse lisible.`

    expect(containsStructuredResponseAttempt(raw)).toBe(true)
    expect(() => parseAndValidate(raw)).toThrow()
  })
})
