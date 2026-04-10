import { supabase } from '@/lib/supabase'
import { buildCompositeText } from '@/lib/semanticMemory'
import type { Bottle } from '@/lib/types'

export type DebugBackfillState = {
  status: string | null
  running: boolean
}

let enrichState: DebugBackfillState = { status: null, running: false }
let embeddingState: DebugBackfillState = { status: null, running: false }
let tastingTagsState: DebugBackfillState = { status: null, running: false }

export function getEnrichBackfillState() {
  return enrichState
}

export function getEmbeddingBackfillState() {
  return embeddingState
}

export function getTastingTagsBackfillState() {
  return tastingTagsState
}

export async function runEnrichBackfill(onUpdate: (state: DebugBackfillState) => void) {
  if (enrichState.running) return
  enrichState = { status: 'Chargement des bouteilles...', running: true }
  onUpdate(enrichState)

  try {
    const { data: bottles } = await supabase
      .from('bottles')
      .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, raw_extraction, grape_varieties, serving_temperature, typical_aromas, food_pairings, character, drink_from, drink_until')
    if (!bottles || bottles.length === 0) {
      enrichState = { status: 'Toutes les bouteilles sont deja enrichies !', running: false }
      onUpdate(enrichState)
      return
    }

    const bottlesToProcess = bottles.filter((bottle) => {
      const rawExtraction = bottle.raw_extraction as { country?: string | null; region?: string | null } | null
      const hasRawOrigin = Boolean(rawExtraction?.country || rawExtraction?.region)
      return !bottle.country || !bottle.region || !bottle.grape_varieties || !bottle.serving_temperature || !bottle.typical_aromas || !bottle.food_pairings || !bottle.character || hasRawOrigin
    })

    if (bottlesToProcess.length === 0) {
      enrichState = { status: 'Toutes les bouteilles ont deja pays, region et enrichissement.', running: false }
      onUpdate(enrichState)
      return
    }

    let done = 0
    let errors = 0
    for (const bottle of bottlesToProcess) {
      enrichState = { status: `${done}/${bottlesToProcess.length} — ${bottle.domaine || bottle.appellation || 'vin'}...`, running: true }
      onUpdate(enrichState)

      const rawExtraction = bottle.raw_extraction as { country?: string | null; region?: string | null } | null
      const { data, error: fnErr } = await supabase.functions.invoke('enrich-wine', {
        body: { domaine: bottle.domaine, cuvee: bottle.cuvee, appellation: bottle.appellation, millesime: bottle.millesime, couleur: bottle.couleur },
      })

      if (fnErr || !data || data.error) {
        errors++
        done++
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      const updates: Record<string, unknown> = {}
      if (!bottle.country) updates.country = rawExtraction?.country || data.country || null
      if (!bottle.region) updates.region = rawExtraction?.region || data.region || null
      if (!bottle.grape_varieties) updates.grape_varieties = data.grape_varieties || null
      if (!bottle.serving_temperature) updates.serving_temperature = data.serving_temperature || null
      if (!bottle.typical_aromas) updates.typical_aromas = data.typical_aromas || null
      if (!bottle.food_pairings) updates.food_pairings = data.food_pairings || null
      if (!bottle.character) updates.character = data.character || null
      if (!bottle.drink_from && data.drink_from) updates.drink_from = data.drink_from
      if (!bottle.drink_until && data.drink_until) updates.drink_until = data.drink_until
      if (Object.keys(updates).length > 0) {
        await supabase.from('bottles').update(updates).eq('id', bottle.id)
      }
      done++
    }

    enrichState = { status: `Termine ! ${done - errors} enrichies, ${errors} erreurs`, running: false }
  } catch (err) {
    enrichState = { status: `Erreur: ${err instanceof Error ? err.message : 'inconnue'}`, running: false }
  }

  onUpdate(enrichState)
}

export async function runTastingTagsBackfill(onUpdate: (state: DebugBackfillState) => void) {
  if (tastingTagsState.running) return
  tastingTagsState = { status: 'Chargement des notes...', running: true }
  onUpdate(tastingTagsState)

  try {
    const { data: bottles } = await supabase
      .from('bottles')
      .select('id, domaine, cuvee, appellation, millesime, couleur, tasting_note')
      .not('tasting_note', 'is', null)

    if (!bottles || bottles.length === 0) {
      tastingTagsState = { status: 'Aucune note a traiter', running: false }
      onUpdate(tastingTagsState)
      return
    }

    let done = 0
    let errors = 0
    for (const bottle of bottles) {
      tastingTagsState = { status: `${done}/${bottles.length} — ${bottle.domaine || 'vin'}...`, running: true }
      onUpdate(tastingTagsState)

      const context = [bottle.domaine, bottle.cuvee, bottle.appellation, bottle.millesime, bottle.couleur].filter(Boolean).join(', ')
      const { data: tags, error: fnErr } = await supabase.functions.invoke('extract-tasting-tags', {
        body: { tasting_note: bottle.tasting_note, bottle_context: context },
      })

      if (fnErr || !tags) {
        errors++
        done++
        continue
      }

      await supabase.from('bottles').update({ tasting_tags: tags }).eq('id', bottle.id)
      done++
    }

    tastingTagsState = { status: `Termine ! ${done - errors} OK, ${errors} erreurs`, running: false }
  } catch (err) {
    tastingTagsState = { status: `Erreur: ${err instanceof Error ? err.message : 'inconnue'}`, running: false }
  }

  onUpdate(tastingTagsState)
}

export async function runEmbeddingBackfill(onUpdate: (state: DebugBackfillState) => void) {
  if (embeddingState.running) return
  embeddingState = { status: 'Chargement des bouteilles dégustées...', running: true }
  onUpdate(embeddingState)

  try {
    const { data: bottles } = await supabase
      .from('bottles')
      .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, tasting_note, tasting_tags, character, rating, drunk_at, rebuy, qpr, grape_varieties, food_pairings, serving_temperature, typical_aromas, status, added_at, updated_at, purchase_price, market_value, drink_from, drink_until, notes, tasting_photos, zone_id, shelf, photo_url, photo_url_back, raw_extraction, quantity, volume_l')
      .eq('status', 'drunk')
      .not('tasting_note', 'is', null)
      .is('embedding', null)

    if (!bottles || bottles.length === 0) {
      embeddingState = { status: 'Tous les embeddings sont déjà générés !', running: false }
      onUpdate(embeddingState)
      return
    }

    let done = 0
    let errors = 0
    for (const entry of bottles) {
      const bottle = entry as Bottle
      const text = buildCompositeText(bottle)
      if (!text || text.trim().length < 10) {
        done++
        continue
      }

      embeddingState = { status: `${done}/${bottles.length} — ${entry.domaine || entry.appellation || 'vin'}...`, running: true }
      onUpdate(embeddingState)

      const { error: fnErr } = await supabase.functions.invoke('generate-embedding', {
        body: { text, bottle_id: entry.id },
      })

      if (fnErr) {
        console.warn('[embedding-backfill] Error for', entry.id, fnErr)
        errors++
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      done++
    }

    embeddingState = { status: `Terminé ! ${done - errors} embeddings, ${errors} erreurs`, running: false }
  } catch (err) {
    embeddingState = { status: `Erreur: ${err instanceof Error ? err.message : 'inconnue'}`, running: false }
  }

  onUpdate(embeddingState)
}
