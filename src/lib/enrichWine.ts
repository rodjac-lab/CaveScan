import { supabase } from './supabase'

interface EnrichmentInput {
  domaine: string
  cuvee: string
  appellation: string
  millesime: string
  couleur: string
}

interface EnrichmentResult {
  country?: string | null
  region?: string | null
  grape_varieties?: string[] | null
  serving_temperature?: string | null
  typical_aromas?: string[] | null
  food_pairings?: string[] | null
  character?: string | null
  drink_from?: number | null
  drink_until?: number | null
}

/**
 * Calls the enrich-wine edge function and updates the bottle in DB.
 * Fire-and-forget: does not throw, logs errors silently.
 */
export async function enrichWineAndUpdate(bottleId: string, wine: EnrichmentInput): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('enrich-wine', {
      body: {
        domaine: wine.domaine || null,
        cuvee: wine.cuvee || null,
        appellation: wine.appellation || null,
        millesime: wine.millesime || null,
        couleur: wine.couleur || null,
      },
    })

    if (error) {
      console.error('[enrichWine] Edge function error:', error)
      return
    }

    const enrichment = data as EnrichmentResult
    if (!enrichment || typeof enrichment !== 'object') return

    // Build update payload with only non-null enriched fields
    const update: Record<string, unknown> = {}
    if (enrichment.grape_varieties) update.grape_varieties = enrichment.grape_varieties
    if (enrichment.serving_temperature) update.serving_temperature = enrichment.serving_temperature
    if (enrichment.typical_aromas) update.typical_aromas = enrichment.typical_aromas
    if (enrichment.food_pairings) update.food_pairings = enrichment.food_pairings
    if (enrichment.character) update.character = enrichment.character
    if (enrichment.drink_from) update.drink_from = enrichment.drink_from
    if (enrichment.drink_until) update.drink_until = enrichment.drink_until
    if (enrichment.country) update.country = enrichment.country
    if (enrichment.region) update.region = enrichment.region

    if (Object.keys(update).length === 0) return

    const { error: updateError } = await supabase
      .from('bottles')
      .update(update)
      .eq('id', bottleId)

    if (updateError) {
      console.error('[enrichWine] DB update error:', updateError)
    } else {
      console.log(`[enrichWine] Enriched bottle ${bottleId}:`, Object.keys(update).join(', '))
    }
  } catch (err) {
    console.error('[enrichWine] Unexpected error:', err)
  }
}
