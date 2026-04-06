import type { Bottle, TastingTags } from '@/lib/types'

function ratingStars(rating: number | null): string {
  if (!rating) return ''
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5 ? 1 : 0
  const empty = 5 - full - half
  return '\u2605'.repeat(full) + (half ? '\u2BEA' : '') + '\u2606'.repeat(empty)
}

export function serializeMemoriesForPrompt(memories: Bottle[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map((bottle) => {
    const tags = bottle.tasting_tags as TastingTags | null
    const identity = [bottle.domaine, bottle.cuvee, bottle.appellation].filter(Boolean).join(' | ') || 'Vin'
    const headerParts: string[] = [identity]

    if (bottle.millesime) headerParts.push(String(bottle.millesime))
    if (bottle.drunk_at) {
      const date = new Date(bottle.drunk_at)
      headerParts.push(`deguste le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    }
    if (bottle.rating) headerParts.push(`note ${bottle.rating}/5 ${ratingStars(bottle.rating)}`)
    if (tags?.sentiment) headerParts.push(`sentiment ${tags.sentiment}`)
    if (tags?.maturite) headerParts.push(`maturite ${tags.maturite}`)

    const contextParts: string[] = []
    if (tags?.plats?.length) {
      const occasion = tags.occasion ? ` (${tags.occasion})` : ''
      contextParts.push(`accord vecu: ${tags.plats.join(', ')}${occasion}`)
    } else if (tags?.occasion) {
      contextParts.push(`occasion: ${tags.occasion}`)
    }

    if (tags?.descripteurs?.length) {
      contextParts.push(`descripteurs: ${tags.descripteurs.join(', ')}`)
    }

    const noteText = bottle.tasting_note?.replace(/\s+/g, ' ').trim()
    if (noteText) {
      contextParts.push(`verbatim utilisateur: "${noteText}"`)
    }

    return [`- ${headerParts.join(' | ')}`, ...contextParts].join('\n')
  })

  return lines.join('\n\n')
}
