import { supabase } from '@/lib/supabase'
import { isObviouslyConversational } from '@/lib/celestinIntentPreFilter'
import type { Bottle } from '@/lib/types'

export type FactualIntent = 'temporal' | 'geographic' | 'quantitative' | 'ranking' | 'inventory'
export type InventoryScope = 'drunk' | 'cave' | 'both'
export type ConversationalIntent =
  | 'recommendation'
  | 'inventory_lookup'
  | 'memory_lookup'
  | 'tasting_log'
  | 'encavage'
  | 'smalltalk'

export interface ClassifiedFilters {
  millesime?: number
  country?: string
  region?: string
  appellation?: string
  appellationPattern?: string
  domaine?: string
  cuvee?: string
  dateRange?: { start: string; end: string }
  freeLocation?: string
}

export interface ClassifiedIntent {
  isFactual: boolean
  intent: FactualIntent | null
  filters: ClassifiedFilters
  scope: InventoryScope | null
  rankingDirection: 'desc' | 'asc' | null
  rankingLimit: number | null
  conversationalIntent: ConversationalIntent | null
  confidence: number
  _meta?: { provider: string; latencyMs: number }
}

export interface ClassifyFactualIntentInput {
  query: string
  cave: Bottle[]
  drunk: Bottle[]
  today?: Date
}

function addDistinct(bucket: { seen: Set<string>; values: string[] }, raw: string | null | undefined): void {
  if (!raw) return
  const trimmed = raw.trim()
  if (!trimmed) return
  const key = trimmed.toLowerCase()
  if (bucket.seen.has(key)) return
  bucket.seen.add(key)
  bucket.values.push(trimmed)
}

function collectAvailableValues(bottles: Bottle[]) {
  const countries = { seen: new Set<string>(), values: [] as string[] }
  const regions = { seen: new Set<string>(), values: [] as string[] }
  const appellations = { seen: new Set<string>(), values: [] as string[] }
  const domaines = { seen: new Set<string>(), values: [] as string[] }
  for (const b of bottles) {
    addDistinct(countries, b.country)
    addDistinct(regions, b.region)
    addDistinct(appellations, b.appellation)
    addDistinct(domaines, b.domaine)
  }
  return {
    countries: countries.values,
    regions: regions.values,
    appellations: appellations.values,
    domaines: domaines.values,
  }
}

function isoToday(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function classifyFactualIntent(input: ClassifyFactualIntentInput): Promise<ClassifiedIntent | null> {
  const query = input.query?.trim()
  if (!query) return null

  if (isObviouslyConversational(query)) return null

  const combined = [...input.cave, ...input.drunk]
  const { countries, regions, appellations, domaines } = collectAvailableValues(combined)
  const today = isoToday(input.today ?? new Date())

  try {
    const { data, error } = await supabase.functions.invoke('classify-celestin-intent', {
      body: {
        query,
        today,
        availableCountries: countries,
        availableRegions: regions,
        availableAppellations: appellations,
        availableDomaines: domaines,
      },
    })
    if (error) {
      console.warn('[classifyFactualIntent] edge function error', error)
      return null
    }
    if (!data || typeof data !== 'object') return null
    const result = data as ClassifiedIntent & { error?: string }
    if (result.error) {
      console.warn('[classifyFactualIntent]', result.error)
      return null
    }
    return result
  } catch (err) {
    console.warn('[classifyFactualIntent] invocation failed', err)
    return null
  }
}
