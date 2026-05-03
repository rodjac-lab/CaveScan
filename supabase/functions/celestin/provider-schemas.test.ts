import { describe, expect, it } from 'vitest'
import { GEMINI_RESPONSE_SCHEMA, OPENAI_RESPONSE_SCHEMA } from './provider-schemas'

describe('provider response schemas', () => {
  it('does not expose show_recommendations as a model ui_action', () => {
    expect(GEMINI_RESPONSE_SCHEMA.properties.ui_action.properties.kind.enum).not.toContain('show_recommendations')
    expect(OPENAI_RESPONSE_SCHEMA.schema.properties.ui_action.properties.kind.enum).not.toContain('show_recommendations')
  })

  it('does not ask providers to build recommendation card payloads', () => {
    expect(GEMINI_RESPONSE_SCHEMA.properties.ui_action.properties.payload.properties).not.toHaveProperty('cards')
    expect(OPENAI_RESPONSE_SCHEMA.schema.properties.ui_action.properties.payload.properties).not.toHaveProperty('cards')
  })
})
