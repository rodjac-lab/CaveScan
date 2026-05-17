import { describe, expect, it } from 'vitest'
import { containsStructuredResponseAttempt, parseAndValidate, stripStructuredResponseArtifacts } from './response-validation'

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

  it('keeps structured recommendation selections', () => {
    const parsed = parseAndValidate(JSON.stringify({
      message: 'Je partirais sur ce Sancerre.',
      recommendation_selection: [{
        bottle_id: 'abc12345',
        name: 'Domaine Test Les Blancs',
        reason: 'Tension utile sur le plat.',
        badge: 'Accord parfait',
      }],
      action_chips: ['Et en rouge ?'],
    }))

    expect(parsed.recommendation_selection).toEqual([{
      bottle_id: 'abc12345',
      name: 'Domaine Test Les Blancs',
      reason: 'Tension utile sur le plat.',
      badge: 'Accord parfait',
    }])
  })

  it('rejects provider responses that leak raw JSON inside the user-facing message', () => {
    expect(() => parseAndValidate(JSON.stringify({
      message: '```json\n{"message":"Raclette","action_chips":["Blanc sec"]}\n```',
      ui_action: null,
    }))).toThrow('message contains raw JSON')
  })

  it('strips a trailing incomplete JSON artifact before wrapping text-only provider output', () => {
    const cleaned = stripStructuredResponseArtifacts(`Tu touches à mon terrain favori.

**Selosse** : oxydation noble et tension.

\`\`\`json
{
  "message": "Tu touches à mon terrain favori.`,
    )

    expect(cleaned).toBe('Tu touches à mon terrain favori.\n\n**Selosse** : oxydation noble et tension.')
  })

  it('strips a trailing structured object artifact before wrapping text-only provider output', () => {
    const cleaned = stripStructuredResponseArtifacts(`Réponse lisible.

{
  "message": "Réponse lisible.",
  "action_chips": []`,
    )

    expect(cleaned).toBe('Réponse lisible.')
  })

  it('detects malformed structured attempts that must not be wrapped as text', () => {
    expect(containsStructuredResponseAttempt(`Réponse lisible.

\`\`\`json
{
  "message": "Réponse lisible.`)).toBe(true)

    expect(containsStructuredResponseAttempt(`Réponse lisible.

{
  "message": "Réponse lisible.",
  "action_chips": []`)).toBe(true)

    expect(containsStructuredResponseAttempt('Réponse libre sans artefact structuré.')).toBe(false)
  })
})
