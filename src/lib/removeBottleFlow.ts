import type { BatchProgressItem } from '@/components/BatchProgress'
import type { BatchItem, BatchSession } from '@/lib/batchSessionStore'
import type { BottleWithZone, WineExtraction } from '@/lib/types'

export type Step =
  | 'processing'
  | 'result'
  | 'saving'
  | 'batch-extracting'
  | 'batch-review'
  | 'batch-saving'

export type MatchType = 'in_cave' | 'not_in_cave'

export interface RemoveBottleLocationState {
  prefillExtraction?: Partial<WineExtraction> | null
  prefillPhotoFile?: File | null
}

export interface ScanResult {
  extraction: WineExtraction
  photoFile: File | null
  photoUri: string | null
  matchType: MatchType
  primaryMatch: BottleWithZone | null
  alternatives: BottleWithZone[]
}

export function toBatchProgressItems(batchSession: BatchSession | null): BatchProgressItem[] {
  if (!batchSession) return []
  return batchSession.items.map((item) => ({
    id: item.id,
    photoPreview: item.photoUri,
    status: item.extractionStatus,
    error: item.error ?? undefined,
    domaine: item.extraction?.domaine ?? undefined,
    appellation: item.extraction?.appellation ?? undefined,
  }))
}

export function getBatchExtractionCurrentIndex(batchSession: BatchSession | null): number {
  if (!batchSession) return 0
  const index = batchSession.items.findIndex((item) => item.extractionStatus === 'extracting')
  return index >= 0 ? index : Math.max(batchSession.items.length - 1, 0)
}

export function findNextUnsavedIndex(fromIndex: number, items: BatchItem[]): number | null {
  for (let index = fromIndex + 1; index < items.length; index++) {
    if (!items[index].saved && !items[index].ignored) return index
  }
  for (let index = 0; index < fromIndex; index++) {
    if (!items[index].saved && !items[index].ignored) return index
  }
  return null
}
