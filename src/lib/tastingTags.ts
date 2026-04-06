import { supabase } from '@/lib/supabase'
import type { Bottle, TastingTags } from '@/lib/types'

function buildBottleContext(bottle: Bottle): string {
  return [bottle.domaine, bottle.appellation, bottle.millesime, bottle.couleur]
    .filter(Boolean)
    .join(', ')
}

export function extractAndSaveTags(bottle: Bottle): void {
  const note = bottle.tasting_note
  if (!note || note.trim().length === 0) return

  ;(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('extract-tasting-tags', {
        body: {
          tasting_note: note,
          bottle_context: buildBottleContext(bottle),
        },
      })

      if (error) {
        console.warn('[tastingTags] Edge function error:', error)
        return
      }

      const tags = data as TastingTags
      if (!tags || (!tags.plats?.length && !tags.descripteurs?.length && !tags.sentiment)) {
        console.log('[tastingTags] No meaningful tags extracted, skipping save')
        return
      }

      const { error: updateError } = await supabase
        .from('bottles')
        .update({ tasting_tags: tags })
        .eq('id', bottle.id)

      if (updateError) {
        console.warn('[tastingTags] Failed to save tags:', updateError)
      } else {
        console.log('[tastingTags] Tags saved for bottle', bottle.id)
      }
    } catch (err) {
      console.warn('[tastingTags] Unexpected error:', err)
    }
  })()
}
