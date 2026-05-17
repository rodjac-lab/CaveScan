export interface WineIdentityInput {
  domaine?: string | null
  cuvee?: string | null
  appellation?: string | null
  millesime?: number | string | null
  couleur?: string | null
  country?: string | null
  region?: string | null
}

export interface CanonicalWineIdentity {
  producer: string | null
  cuvee: string | null
  appellation: string | null
  vintage: number | null
  color: string | null
  country: string | null
  region: string | null
  label: string
  key: string
}

export function normalizeWineIdentityPart(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[-‐‑‒–—]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function cleanVintage(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value !== 'string') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function canonicalWineIdentity(input: WineIdentityInput): CanonicalWineIdentity {
  const producer = cleanString(input.domaine)
  const cuvee = cleanString(input.cuvee)
  const appellation = cleanString(input.appellation)
  const vintage = cleanVintage(input.millesime)
  const color = cleanString(input.couleur)
  const country = cleanString(input.country)
  const region = cleanString(input.region)

  const label = [producer, cuvee, appellation, vintage].filter(Boolean).join(' · ')
  const keyParts = [
    producer,
    cuvee,
    appellation,
    vintage,
  ].map(normalizeWineIdentityPart).filter(Boolean)

  return {
    producer,
    cuvee,
    appellation,
    vintage,
    color,
    country,
    region,
    label,
    key: keyParts.join('|'),
  }
}

export function sameWineIdentity(left: WineIdentityInput, right: WineIdentityInput): boolean {
  const leftIdentity = canonicalWineIdentity(left)
  const rightIdentity = canonicalWineIdentity(right)
  return !!leftIdentity.key && leftIdentity.key === rightIdentity.key
}
