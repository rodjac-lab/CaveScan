import { supabase } from '@/lib/supabase'
import type { BottleWithZone } from '@/lib/types'

/**
 * Opens a bottle: decrements quantity if > 1 (+ creates a drunk row),
 * or marks the existing row as drunk if quantity === 1.
 * Returns the ID of the drunk bottle row.
 */
export async function openBottle(bottle: BottleWithZone): Promise<{ drunkBottleId: string }> {
  if ((bottle.quantity ?? 1) > 1) {
    // Decrement quantity on the in-stock row
    const { error: decrementError } = await supabase
      .from('bottles')
      .update({ quantity: (bottle.quantity ?? 1) - 1 })
      .eq('id', bottle.id)
    if (decrementError) throw decrementError

    // Create a new row for the opened bottle
    const { data: newDrunk, error: insertError } = await supabase
      .from('bottles')
      .insert({
        domaine: bottle.domaine,
        cuvee: bottle.cuvee,
        appellation: bottle.appellation,
        millesime: bottle.millesime,
        couleur: bottle.couleur,
        zone_id: bottle.zone_id,
        shelf: bottle.shelf,
        photo_url: bottle.photo_url,
        photo_url_back: bottle.photo_url_back,
        purchase_price: bottle.purchase_price,
        raw_extraction: bottle.raw_extraction,
        grape_varieties: bottle.grape_varieties,
        serving_temperature: bottle.serving_temperature,
        typical_aromas: bottle.typical_aromas,
        food_pairings: bottle.food_pairings,
        character: bottle.character,
        volume_l: bottle.volume_l,
        quantity: 1,
        status: 'drunk',
        drunk_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (insertError) throw insertError

    return { drunkBottleId: newDrunk.id }
  } else {
    // Last bottle — mark existing row as drunk
    const { error } = await supabase
      .from('bottles')
      .update({
        status: 'drunk',
        drunk_at: new Date().toISOString(),
      })
      .eq('id', bottle.id)
    if (error) throw error

    return { drunkBottleId: bottle.id }
  }
}
