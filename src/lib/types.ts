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
  cuvee: string | null
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
  rating: number | null
  rebuy: boolean | null
  qpr: number | null
  grape_varieties: string[] | null
  serving_temperature: string | null
  typical_aromas: string[] | null
  food_pairings: string[] | null
  character: string | null
  quantity: number
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
  return WINE_COLORS.find(c => c.value === color)?.label ?? 'Inconnu'
}

const VALID_WINE_COLORS = new Set<string>(['rouge', 'blanc', 'rose', 'bulles'])

export function normalizeWineColor(color: string | null | undefined): WineColor | null {
  if (!color) return null
  const normalized = color
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  return VALID_WINE_COLORS.has(normalized) ? (normalized as WineColor) : null
}

// ── Taste Profile types ──

export interface AppellationStat {
  name: string
  count: number
  avgRating: number | null
  score: number
}

export interface DomaineStat {
  name: string
  count: number
  avgRating: number | null
  score: number
}

export interface ColorDistribution {
  rouge: number
  blanc: number
  rose: number
  bulles: number
}

export interface PriceRange {
  min: number | null
  max: number | null
  avg: number | null
}

export interface QPRDistribution {
  cher: number
  correct: number
  pepite: number
}

export interface RecentTasting {
  bottleId: string
  domaine: string | null
  appellation: string | null
  millesime: number | null
  rating: number | null
  drunkAt: string
}

export interface SeasonalPattern {
  spring: number
  summer: number
  autumn: number
  winter: number
}

export interface ComputedTasteProfile {
  totalInCave: number
  totalTasted: number
  avgRating: number | null
  rebuyRate: number | null
  topAppellations: AppellationStat[]
  topDomaines: DomaineStat[]
  colorDistribution: ColorDistribution
  priceRange: PriceRange
  qprDistribution: QPRDistribution
  topAromas: string[]
  topFoodPairings: string[]
  recentTastings: RecentTasting[]
  seasonalPattern: SeasonalPattern
  dataPoints: number
}

export interface ExplicitPreferences {
  customPairings?: string[]
  lovedRegions?: string[]
  avoidedRegions?: string[]
  freeNotes?: string
}

export interface TasteProfile {
  computed: ComputedTasteProfile
  explicit: ExplicitPreferences
  computedAt: string
}

// ── Wine Extraction types ──

export interface WineExtraction {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: WineColor | null
  region: string | null
  cepage: string | null
  confidence: number
  grape_varieties?: string[] | null
  serving_temperature?: string | null
  typical_aromas?: string[] | null
  food_pairings?: string[] | null
  character?: string | null
}
