import { type BottleWithZone, type TastingPhoto } from '@/lib/types'

export interface PhotoEntry {
  url: string
  label: string
}

/** Collect all photo URLs for a bottle, deduplicated by URL. */
export function getBottlePhotoEntries(bottle: BottleWithZone): PhotoEntry[] {
  const entries = [
    bottle.photo_url ? { url: bottle.photo_url, label: 'etiquette' } : null,
    ...((bottle.tasting_photos as TastingPhoto[]) || []).map((photo) => ({
      url: photo.url,
      label: photo.label || 'degustation',
    })),
  ].filter((entry): entry is PhotoEntry => !!entry?.url)

  return Array.from(new Map(entries.map((e) => [e.url, e])).values())
}
