export type WineColor = 'rouge' | 'blanc' | 'rose' | 'bulles'

export type BottleStatus = 'in_stock' | 'drunk'

export interface TastingPhoto {
  url: string
  label?: string
  taken_at: string
}

export interface Zone {
  id: string
  name: string
  description: string | null
  rows: number
  columns: number
  position: number
  created_at: string
  updated_at: string
}

export interface Bottle {
  id: string
  domaine: string | null
  appellation: string | null
  millesime: number | null
  couleur: WineColor | null
  raw_extraction: Record<string, unknown> | null
  zone_id: string | null
  shelf: string | null
  photo_url: string | null
  photo_url_back: string | null
  status: BottleStatus
  added_at: string
  drunk_at: string | null
  updated_at: string
  tasting_note: string | null
  purchase_price: number | null
  market_value: number | null
  drink_from: number | null
  drink_until: number | null
  notes: string | null
  tasting_photos: TastingPhoto[] | null
}

export interface BottleWithZone extends Bottle {
  zone: Zone | null
}

export interface WineColorOption {
  value: WineColor
  label: string
}

export const WINE_COLORS: WineColorOption[] = [
  { value: 'rouge', label: 'Rouge' },
  { value: 'blanc', label: 'Blanc' },
  { value: 'rose', label: 'Rosé' },
  { value: 'bulles', label: 'Bulles' },
]

export function getWineColorLabel(color: WineColor | null): string {
  if (!color) return 'Inconnu'
  return WINE_COLORS.find(c => c.value === color)?.label ? 'Inconnu'
}

export function normalizeWineColor(color: string | null | undefined): WineColor | null {
  if (!color) return null
  const normalized = color
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  if (normalized === 'rose') return 'rose'
  if (normalized === 'rouge') return 'rouge'
  if (normalized === 'blanc') return 'blanc'
  if (normalized === 'bulles') return 'bulles'
  return null
}

export interface WineExtraction {
  domaine: string | null
  appellation: string | null
  millesime: number | null
  couleur: WineColor | null
  region: string | null
  cepage: string | null
  confidence: number
}
