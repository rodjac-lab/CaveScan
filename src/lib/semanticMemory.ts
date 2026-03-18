import { supabase } from '@/lib/supabase'
import type { Bottle, TastingTags } from '@/lib/types'

/**
 * Build the composite text that gets embedded for a bottle.
 * Combines identity, origin, tasting note, and structured tags
 * so "vin italien de Noël" matches a Brunello tasted at Christmas.
 */
export function buildCompositeText(bottle: Bottle): string {
  const parts: string[] = []

  // Identity line
  const identity = [bottle.domaine, bottle.cuvee, bottle.appellation, bottle.millesime, bottle.couleur]
    .filter(Boolean)
    .join(' | ')
  if (identity) parts.push(identity)

  // Origin line
  const origin = [bottle.country, bottle.region].filter(Boolean).join(', ')
  if (origin) parts.push(origin)

  // Tasting note
  if (bottle.tasting_note) {
    parts.push(`Note: "${bottle.tasting_note.trim()}"`)
  }

  // Structured tags
  const tags = bottle.tasting_tags as TastingTags | null
  if (tags) {
    const tagParts: string[] = []
    if (tags.plats?.length) tagParts.push(`Plats: ${tags.plats.join(', ')}`)
    if (tags.occasion) tagParts.push(`Occasion: ${tags.occasion}`)
    if (tags.sentiment) tagParts.push(`Sentiment: ${tags.sentiment}`)
    if (tags.descripteurs?.length) tagParts.push(`Descripteurs: ${tags.descripteurs.join(', ')}`)
    if (tags.keywords?.length) tagParts.push(`Keywords: ${tags.keywords.join(', ')}`)
    if (tagParts.length) parts.push(tagParts.join('. '))
  }

  // Character from enrichment
  if (bottle.character) {
    parts.push(`Caractère: ${bottle.character}`)
  }

  return parts.join('\n')
}

/**
 * Search memories semantically via embeddings.
 * Returns Bottle[] ready for serializeMemoriesForPrompt().
 */
export async function searchSemanticMemories(query: string, limit = 7): Promise<Bottle[]> {
  // Step 1: Get query embedding from edge function
  const { data: embData, error: embError } = await supabase.functions.invoke('generate-embedding', {
    body: { query },
  })

  if (embError || !embData?.embedding) {
    throw new Error(embError?.message || 'Failed to generate query embedding')
  }

  // Step 2: Search via RPC
  const { data: results, error: rpcError } = await supabase.rpc('search_memories', {
    query_embedding: JSON.stringify(embData.embedding),
    match_count: limit,
    similarity_threshold: 0.3,
  })

  if (rpcError) {
    throw new Error(`search_memories RPC failed: ${rpcError.message}`)
  }

  if (!results || results.length === 0) return []

  // Map RPC results to Bottle shape (enough fields for serializeMemoriesForPrompt)
  return results.map((r: Record<string, unknown>) => ({
    id: r.id,
    domaine: r.domaine,
    cuvee: r.cuvee,
    appellation: r.appellation,
    millesime: r.millesime,
    couleur: r.couleur,
    country: r.country,
    region: r.region,
    tasting_note: r.tasting_note,
    tasting_tags: r.tasting_tags,
    rating: r.rating,
    drunk_at: r.drunk_at,
    character: r.character,
    grape_varieties: r.grape_varieties,
    food_pairings: r.food_pairings,
    rebuy: r.rebuy,
    qpr: r.qpr,
    // Fill remaining Bottle fields with defaults (not used by serializer)
    raw_extraction: null,
    zone_id: null,
    shelf: null,
    photo_url: null,
    photo_url_back: null,
    status: 'drunk' as const,
    added_at: '',
    updated_at: '',
    purchase_price: null,
    market_value: null,
    drink_from: null,
    drink_until: null,
    notes: null,
    tasting_photos: null,
    serving_temperature: null,
    typical_aromas: null,
    quantity: 1,
    volume_l: 0.75,
  })) as Bottle[]
}

/**
 * Generate an embedding for a bottle and save it to the DB.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export function generateAndSaveEmbedding(bottle: Bottle): void {
  const text = buildCompositeText(bottle)
  if (!text || text.trim().length < 10) return

  ;(async () => {
    try {
      const { error } = await supabase.functions.invoke('generate-embedding', {
        body: { text, bottle_id: bottle.id },
      })

      if (error) {
        console.warn('[semanticMemory] Failed to generate embedding:', error)
      } else {
        console.log('[semanticMemory] Embedding saved for bottle', bottle.id)
      }
    } catch (err) {
      console.warn('[semanticMemory] Unexpected error:', err)
    }
  })()
}
