import type { WineExtraction } from '@/lib/types'

export interface ExtractWineResult {
  kind: 'single_bottle' | 'multi_bottle'
  bottles: WineExtraction[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeWineExtraction(value: unknown): WineExtraction | null {
  if (!isRecord(value)) return null

  const candidate: WineExtraction = {
    domaine: typeof value.domaine === 'string' ? value.domaine : null,
    cuvee: typeof value.cuvee === 'string' ? value.cuvee : null,
    appellation: typeof value.appellation === 'string' ? value.appellation : null,
    millesime: typeof value.millesime === 'number' ? value.millesime : null,
    couleur:
      value.couleur === 'rouge' || value.couleur === 'blanc' || value.couleur === 'rose' || value.couleur === 'bulles'
        ? value.couleur
        : null,
    country: typeof value.country === 'string' ? value.country : null,
    region: typeof value.region === 'string' ? value.region : null,
    cepage: typeof value.cepage === 'string' ? value.cepage : null,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    grape_varieties: Array.isArray(value.grape_varieties) ? value.grape_varieties.filter((item): item is string => typeof item === 'string') : null,
    serving_temperature: typeof value.serving_temperature === 'string' ? value.serving_temperature : null,
    typical_aromas: Array.isArray(value.typical_aromas) ? value.typical_aromas.filter((item): item is string => typeof item === 'string') : null,
    food_pairings: Array.isArray(value.food_pairings) ? value.food_pairings.filter((item): item is string => typeof item === 'string') : null,
    character: typeof value.character === 'string' ? value.character : null,
  }

  if (!candidate.domaine && !candidate.appellation && !candidate.cuvee && !candidate.millesime) {
    return null
  }

  return candidate
}

export function parseExtractWineResponse(data: unknown): ExtractWineResult {
  if (isRecord(data) && Array.isArray(data.bottles)) {
    const bottles = data.bottles
      .map((item) => sanitizeWineExtraction(item))
      .filter((item): item is WineExtraction => !!item)

    if (bottles.length === 0) {
      throw new Error('Aucune bouteille exploitable detectee')
    }

    return {
      kind: bottles.length > 1 || data.kind === 'multi_bottle' ? 'multi_bottle' : 'single_bottle',
      bottles,
    }
  }

  const singleBottle = sanitizeWineExtraction(data)
  if (!singleBottle) {
    throw new Error('Reponse extracteur invalide')
  }

  return {
    kind: 'single_bottle',
    bottles: [singleBottle],
  }
}
