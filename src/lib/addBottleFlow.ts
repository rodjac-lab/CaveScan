import type { BatchProgressItem } from '@/components/BatchProgress'
import type { BatchItemData } from '@/components/BatchItemForm'
import { normalizeWineColor, type BottleVolumeOption, type WineExtraction } from '@/lib/types'

export type AddBottleStep = 'capture' | 'extracting' | 'confirm' | 'saving' | 'batch-extracting' | 'batch-confirm'

export const MAX_ADD_BOTTLE_BATCH_SIZE = 12

export interface AddBottleLocationState {
  prefillExtraction?: Partial<WineExtraction> | null
  prefillPhotoFile?: File | null
  prefillBatchFiles?: File[] | null
  prefillBatchExtractions?: Partial<WineExtraction>[] | null
  prefillQuantity?: number
  prefillVolume?: BottleVolumeOption
}

export function hasWinePrefill(extraction: Partial<WineExtraction> | null | undefined): boolean {
  return Boolean(
    extraction?.domaine
    || extraction?.cuvee
    || extraction?.appellation
    || extraction?.millesime
    || extraction?.couleur,
  )
}

export function createUploadStamp(): string {
  return String(Date.now())
}

export function toBatchItemData(file: File | null, extraction: Partial<WineExtraction>, index: number): BatchItemData {
  return {
    id: `batch-${Date.now()}-${index}`,
    photoFile: file,
    photoPreview: file ? URL.createObjectURL(file) : null,
    photoFileBack: null,
    photoPreviewBack: null,
    extractionStatus: 'extracted',
    domaine: extraction.domaine || '',
    cuvee: extraction.cuvee || '',
    appellation: extraction.appellation || '',
    millesime: extraction.millesime ? String(extraction.millesime) : '',
    couleur: normalizeWineColor(extraction.couleur || null) || '',
    country: extraction.country || '',
    region: extraction.region || '',
    zoneId: '',
    shelf: '',
    purchasePrice: extraction.purchase_price ? String(extraction.purchase_price) : '',
    quantity: (extraction as Record<string, unknown>).quantity as number ?? 1,
    volumeL: ((extraction as Record<string, unknown>).volume as BottleVolumeOption) || '0.75',
    rawExtraction: {
      domaine: extraction.domaine || null,
      cuvee: extraction.cuvee || null,
      appellation: extraction.appellation || null,
      millesime: extraction.millesime || null,
      couleur: normalizeWineColor(extraction.couleur || null),
      country: extraction.country || null,
      region: extraction.region || null,
      cepage: extraction.cepage || null,
      confidence: extraction.confidence ?? 0,
      grape_varieties: extraction.grape_varieties || null,
      serving_temperature: extraction.serving_temperature || null,
      typical_aromas: extraction.typical_aromas || null,
      food_pairings: extraction.food_pairings || null,
      character: extraction.character || null,
    } as WineExtraction,
    skipped: false,
  }
}

export function createPendingBatchItem(file: File, index: number): BatchItemData {
  return {
    id: `batch-${Date.now()}-${index}`,
    photoFile: file,
    photoPreview: URL.createObjectURL(file),
    photoFileBack: null,
    photoPreviewBack: null,
    extractionStatus: 'pending',
    domaine: '',
    cuvee: '',
    appellation: '',
    millesime: '',
    couleur: '',
    country: '',
    region: '',
    zoneId: '',
    shelf: '',
    purchasePrice: '',
    quantity: 1,
    volumeL: '0.75',
    rawExtraction: null,
    skipped: false,
  }
}

export function buildRawExtractionFromPrefill(prefillExtraction: Partial<WineExtraction>): WineExtraction {
  return {
    domaine: prefillExtraction.domaine || null,
    cuvee: prefillExtraction.cuvee || null,
    appellation: prefillExtraction.appellation || null,
    millesime: prefillExtraction.millesime || null,
    couleur: normalizeWineColor(prefillExtraction.couleur || null),
    country: prefillExtraction.country || null,
    region: prefillExtraction.region || null,
    cepage: prefillExtraction.cepage || null,
    confidence: 0,
    grape_varieties: prefillExtraction.grape_varieties || null,
    serving_temperature: prefillExtraction.serving_temperature || null,
    typical_aromas: prefillExtraction.typical_aromas || null,
    food_pairings: prefillExtraction.food_pairings || null,
    character: prefillExtraction.character || null,
  }
}

export function toAddBottleBatchProgressItems(batchItems: BatchItemData[]): BatchProgressItem[] {
  return batchItems.map((item) => ({
    id: item.id,
    photoPreview: item.photoPreview,
    status: item.extractionStatus,
    error: item.extractionError,
    domaine: item.domaine,
    appellation: item.appellation,
  }))
}

export function findNextEditableBatchIndex(items: BatchItemData[], currentIndex: number): number | null {
  const nextAfterCurrent = items.findIndex((item, index) => index > currentIndex && !item.saved && !item.skipped)
  if (nextAfterCurrent !== -1) return nextAfterCurrent

  const nextBeforeCurrent = items.findIndex((item, index) => index < currentIndex && !item.saved && !item.skipped)
  if (nextBeforeCurrent !== -1) return nextBeforeCurrent

  return null
}
