import { supabase } from '@/lib/supabase'
import { isObviouslyConversational } from '@/lib/celestinIntentPreFilter'
import type { Bottle } from '@/lib/types'

export type FactualIntent = 'temporal' | 'geographic' | 'quantitative' | 'ranking' | 'inventory'
export type InventoryScope = 'drunk' | 'cave' | 'both'

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
  confidence: number
  _meta?: { provider: string; latencyMs: number }
}

export interface ClassifyFactualIntentInput {
  query: string
  cave: Bottle[]
  drunk: Bottle[]
  today?: Date
}

function distinctStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function collectAvailableValues(bottles: Bottle[]) {
  return {
    countries: distinctStrings(bottles.map((b) => b.country)),
    regions: distinctStrings(bottles.map((b) => b.region)),
    appellations: distinctStrings(bottles.map((b) => b.appellation)),
    domaines: distinctStrings(bottles.map((b) => b.domaine)),
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
