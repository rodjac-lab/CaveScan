import { type BottleWithZone } from '@/lib/types'
import { track } from '@/lib/track'
import { ENABLE_SHARE_CARD_IMAGE } from '@/lib/featureFlags'
import { getBottlePhotoEntries } from '@/lib/bottlePhotos'

function getShareEmoji(color: BottleWithZone['couleur']): string {
  if (color === 'bulles') return '\u{1F942}' // 🥂
  return '\u{1F377}' // 🍷
}

function buildShareText(bottle: BottleWithZone): string {
  const emoji = getShareEmoji(bottle.couleur)
  const title = bottle.domaine || bottle.appellation || 'Vin'
  const lines: string[] = []

  lines.push(`${emoji} ${title}${bottle.cuvee ? ` \u00AB ${bottle.cuvee} \u00BB` : ''}${bottle.millesime ? ` ${bottle.millesime}` : ''}`)

  if (bottle.appellation && bottle.domaine) {
    lines.push(bottle.appellation)
  }

  lines.push('')

  if (bottle.tasting_note) {
    lines.push(bottle.tasting_note)
    lines.push('')
  }

  lines.push('\u2014\nPartag\u00e9 avec Celestin \u00b7 mycelestin.com')

  return lines.join('\n')
}

async function fetchPhotosAsFiles(bottle: BottleWithZone): Promise<File[]> {
  const entries = getBottlePhotoEntries(bottle)
  if (entries.length === 0) return []

  const safeName = (bottle.domaine || bottle.appellation || 'vin').replace(/[^a-zA-Z0-9]/g, '_')

  const results = await Promise.allSettled(
    entries.map(async (entry, index) => {
      const response = await fetch(entry.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const mimeType = blob.type || 'image/jpeg'
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
      const safeLabel = entry.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
      return new File([blob], `${safeName}_${index + 1}_${safeLabel}.${extension}`, { type: mimeType })
    }),
  )

  return results
    .filter((r): r is PromiseFulfilledResult<File> => r.status === 'fulfilled')
    .map((r) => r.value)
}

async function shareWithCardImage(bottle: BottleWithZone, text: string): Promise<boolean> {
  const { generateShareCardImage } = await import('@/lib/shareCardImage')
  const cardFile = await generateShareCardImage(bottle)
  if (!cardFile) return false

  if (navigator.canShare && navigator.canShare({ files: [cardFile] })) {
    await navigator.share({ text, files: [cardFile] })
    track('bottle_shared', { format: 'card_image' })
    return true
  }
  return false
}

async function shareWithPhotos(bottle: BottleWithZone, text: string): Promise<boolean> {
  if (!navigator.canShare) return false

  const files = await fetchPhotosAsFiles(bottle)
  if (files.length > 0 && navigator.canShare({ files })) {
    await navigator.share({ text, files })
    track('bottle_shared', { format: 'photos' })
    return true
  }
  return false
}

export async function shareWine(bottle: BottleWithZone): Promise<void> {
  if (!navigator.share) return

  const text = buildShareText(bottle)

  try {
    // Card image mode (feature-flagged)
    if (ENABLE_SHARE_CARD_IMAGE) {
      if (await shareWithCardImage(bottle, text)) return
    }

    // Photos mode (current default)
    if (await shareWithPhotos(bottle, text)) return

    // Text-only fallback
    await navigator.share({ text })
    track('bottle_shared', { format: 'text' })
  } catch {
    // User cancelled share
  }
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.share
}
