import type { WineColor } from '@/lib/types'

export function normalizeForKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function parseWineColor(wineType: string | null): WineColor | null {
  const normalized = normalizeForKey(wineType)
  if (!normalized) return null
  if (normalized.includes('red')) return 'rouge'
  if (normalized.includes('white')) return 'blanc'
  if (normalized.includes('rose')) return 'rose'
  if (normalized.includes('sparkling') || normalized.includes('champagne')) return 'bulles'
  return null
}
