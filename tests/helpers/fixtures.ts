export const E2E_PREFIX = '[e2e]'

export const TEST_IMAGE = {
  name: 'e2e-label.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l4gXWQAAAABJRU5ErkJggg==',
    'base64',
  ),
}

export function makeExtraction(overrides: Record<string, unknown> = {}) {
  return {
    domaine: `${E2E_PREFIX} Domaine Test`,
    cuvee: `${E2E_PREFIX} Cuvee Test`,
    appellation: `${E2E_PREFIX} Appellation Test`,
    millesime: 2022,
    couleur: 'rouge',
    country: 'France',
    region: 'Test',
    cepage: null,
    confidence: 0.98,
    grape_varieties: ['pinot noir'],
    serving_temperature: '14-16 C',
    typical_aromas: ['cerise', 'poivre'],
    food_pairings: ['volaille'],
    character: 'Frais, precis, pret pour le test e2e.',
    purchase_price: null,
    drink_from: 2025,
    drink_until: 2030,
    ...overrides,
  }
}

export function makeExtractWineResponse(extraction: Record<string, unknown>) {
  return {
    kind: 'single_bottle',
    provider: 'e2e-mock',
    bottles: [extraction],
  }
}
