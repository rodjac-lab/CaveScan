import { describe, expect, it } from 'vitest'
import { parseAndValidate } from './response-validation'

describe('parseAndValidate', () => {
  it('parses plain JSON responses', () => {
    expect(parseAndValidate('{"message":"Salut","action_chips":["A"]}')).toMatchObject({
      message: 'Salut',
      action_chips: ['A'],
    })
  })

  it('extracts JSON fenced after natural language text', () => {
    const parsed = parseAndValidate(`12 degustations.

\`\`\`json
{
  "message": "Tu as 12 degustations.",
  "action_chips": ["Voir les notes"]
}
\`\`\`
`)

    expect(parsed).toMatchObject({
      message: 'Tu as 12 degustations.',
      action_chips: ['Voir les notes'],
    })
  })
})
