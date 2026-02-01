export type WineColor = 'rouge' | 'blanc' | 'rosé' | 'bulles'

export type BottleStatus = 'in_stock' | 'drunk'

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
  status: BottleStatus
  added_at: string
  drunk_at: string | null
  updated_at: string
  tasting_note: string | null
  price: number | null
  drink_from: number | null
  drink_until: number | null
  notes: string | null
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
  { value: 'rosé', label: 'Rosé' },
  { value: 'bulles', label: 'Bulles' },
]

export function getWineColorLabel(color: WineColor | null): string {
  if (!color) return 'Inconnu'
  return WINE_COLORS.find(c => c.value === color)?.label ?? 'Inconnu'
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
