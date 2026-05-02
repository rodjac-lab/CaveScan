import type { ContextPlan } from "./context-plan.ts"
import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent } from "./turn-interpreter.ts"
import type { CelestinResponse, RequestBody } from "./types.ts"

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asksGenericCellarBottleCount(message: string): boolean {
  const text = normalize(message)
  if (!/\b(combien|nombre)\b/.test(text)) return false
  if (!/\bbouteilles?\b/.test(text)) return false

  const mentionsCellarScope =
    /\b(j ai|ai je|ma cave|en cave)\b/.test(text)
    || /\bcombien de bouteilles\b/.test(text)
  if (!mentionsCellarScope) return false

  // Anything after "bouteilles de X" is a filtered lookup, not a generic total.
  if (/\bbouteilles?\s+(de|d )\s+\w+/.test(text)) return false

  return true
}

export function buildDeterministicResponse(input: {
  body: RequestBody
  routingIntent: RoutingIntent
  contextPlan: ContextPlan
  resolvedSources: ResolvedContextSources
}): CelestinResponse | null {
  if (input.routingIntent !== 'cellar_lookup') return null
  if (input.contextPlan.truthPolicy !== 'exact_only') return null
  if (input.body.image) return null
  if (!asksGenericCellarBottleCount(input.body.message)) return null

  const total = input.resolvedSources.cave.totalBottles
  const references = input.resolvedSources.cave.referenceCount

  if (total === 0) {
    return {
      message: 'Ta cave est vide pour l instant.',
      ui_action: null,
      action_chips: ['Ajouter une bouteille', 'Voir la cave'],
    }
  }

  const referencePart = references === 1 ? '1 reference' : `${references} references`
  const bottlePart = total === 1 ? '1 bouteille' : `${total} bouteilles`

  return {
    message: `Tu as ${bottlePart} en cave, sur ${referencePart}.`,
    ui_action: null,
    action_chips: ['Voir la cave', 'Quels rouges ?', 'Que boire ce soir ?'],
  }
}
