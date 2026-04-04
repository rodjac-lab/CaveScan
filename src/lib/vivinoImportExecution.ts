import { insertBottle, type BottleInsertRecord } from '@/lib/bottleWrites'
import { generateAndSaveEmbedding } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import { extractAndSaveTags } from '@/lib/tastingMemories'
import type { Bottle, BottleStatus } from '@/lib/types'
import { normalizeForKey } from '@/lib/vivinoImportShared'
import type {
  VivinoCellarCandidate,
  VivinoImportPreview,
  VivinoImportResult,
  VivinoTastingCandidate,
} from '@/lib/vivinoImportTypes'

type ExistingBottleRow = Pick<
  Bottle,
  'id' | 'domaine' | 'cuvee' | 'appellation' | 'millesime' | 'status' | 'raw_extraction' | 'photo_url'
>

interface VivinoLabelImportJob {
  bottleId: string
  imageUrl: string
}

function buildIdentityKey(input: {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  status?: BottleStatus
}): string {
  return [
    input.status ?? '',
    normalizeForKey(input.domaine),
    normalizeForKey(input.cuvee),
    normalizeForKey(input.appellation),
    input.millesime ?? '',
  ].join('|')
}

function buildVivinoRawExtraction(
  candidate: VivinoCellarCandidate | VivinoTastingCandidate,
  dataset: 'cellar' | 'full_wine_list',
): Record<string, unknown> {
  return {
    import_meta: {
      platform: 'vivino',
      dataset,
      source_ref: candidate.sourceRef,
      imported_at: new Date().toISOString(),
    },
    vivino: {
      link: candidate.link,
      average_rating: candidate.averageRating,
      regional_wine_style: candidate.regionalWineStyle,
      review_location: 'reviewLocation' in candidate ? candidate.reviewLocation : null,
      label_image: 'labelImage' in candidate ? candidate.labelImage : null,
    },
  }
}

function buildImportedCellarRecord(candidate: VivinoCellarCandidate): BottleInsertRecord {
  return {
    domaine: candidate.domaine,
    cuvee: candidate.cuvee,
    appellation: candidate.appellation,
    millesime: candidate.millesime,
    couleur: candidate.couleur,
    country: candidate.country,
    region: candidate.region,
    zone_id: null,
    shelf: null,
    photo_url: null,
    photo_url_back: null,
    raw_extraction: buildVivinoRawExtraction(candidate, 'cellar'),
    status: 'in_stock',
    drunk_at: null,
    purchase_price: null,
    market_value: null,
    drink_from: null,
    drink_until: null,
    notes: null,
    tasting_photos: null,
    rating: null,
    rebuy: null,
    qpr: null,
    grape_varieties: null,
    serving_temperature: null,
    typical_aromas: null,
    food_pairings: null,
    character: null,
    quantity: candidate.quantity,
    volume_l: 0.75,
    tasting_tags: null,
  }
}

function buildImportedTastingRecord(candidate: VivinoTastingCandidate): BottleInsertRecord {
  return {
    domaine: candidate.domaine,
    cuvee: candidate.cuvee,
    appellation: candidate.appellation,
    millesime: candidate.millesime,
    couleur: candidate.couleur,
    country: candidate.country,
    region: candidate.region,
    zone_id: null,
    shelf: null,
    photo_url: null,
    photo_url_back: null,
    raw_extraction: buildVivinoRawExtraction(candidate, 'full_wine_list'),
    status: 'drunk',
    drunk_at: candidate.drunkAt,
    purchase_price: candidate.purchasePrice,
    market_value: null,
    drink_from: null,
    drink_until: null,
    notes: candidate.reviewLocation ? `Lieu Vivino: ${candidate.reviewLocation}` : null,
    tasting_note: candidate.tastingNote,
    tasting_photos: null,
    rating: candidate.rating,
    rebuy: null,
    qpr: null,
    grape_varieties: null,
    serving_temperature: null,
    typical_aromas: null,
    food_pairings: null,
    character: null,
    quantity: 1,
    volume_l: 0.75,
    tasting_tags: null,
  }
}

function extractExistingSourceRef(rawExtraction: Bottle['raw_extraction']): string | null {
  if (!rawExtraction || typeof rawExtraction !== 'object') return null
  const importMeta = (rawExtraction as Record<string, unknown>).import_meta
  if (!importMeta || typeof importMeta !== 'object') return null
  const sourceRef = (importMeta as Record<string, unknown>).source_ref
  return typeof sourceRef === 'string' ? sourceRef : null
}

function toBottleForPostProcessing(id: string, record: BottleInsertRecord): Bottle {
  return {
    id,
    domaine: record.domaine,
    cuvee: record.cuvee,
    appellation: record.appellation,
    millesime: record.millesime,
    couleur: record.couleur,
    country: record.country,
    region: record.region,
    raw_extraction: record.raw_extraction,
    zone_id: record.zone_id,
    shelf: record.shelf,
    photo_url: record.photo_url,
    photo_url_back: record.photo_url_back,
    status: record.status,
    added_at: record.added_at ?? new Date().toISOString(),
    drunk_at: record.drunk_at,
    updated_at: new Date().toISOString(),
    tasting_note: record.tasting_note ?? null,
    purchase_price: record.purchase_price,
    market_value: record.market_value ?? null,
    drink_from: record.drink_from,
    drink_until: record.drink_until,
    notes: record.notes ?? null,
    tasting_photos: record.tasting_photos ?? null,
    rating: record.rating ?? null,
    rebuy: record.rebuy ?? null,
    qpr: record.qpr ?? null,
    grape_varieties: record.grape_varieties,
    serving_temperature: record.serving_temperature,
    typical_aromas: record.typical_aromas,
    food_pairings: record.food_pairings,
    character: record.character,
    quantity: record.quantity,
    volume_l: record.volume_l,
    tasting_tags: record.tasting_tags ?? null,
  }
}

function enqueueVivinoLabelImport(
  jobs: VivinoLabelImportJob[],
  bottle: Pick<ExistingBottleRow, 'id' | 'photo_url'> | { id: string; photo_url: string | null },
  imageUrl: string | null,
): void {
  if (!imageUrl || bottle.photo_url) return
  jobs.push({ bottleId: bottle.id, imageUrl })
}

async function importVivinoLabelPhoto(job: VivinoLabelImportJob): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('import-vivino-label', {
    body: {
      bottleId: job.bottleId,
      imageUrl: job.imageUrl,
    },
  })

  if (error) {
    console.warn('[vivinoImport] Label import failed:', error.message)
    return false
  }

  return Boolean(data?.photoUrl)
}

async function runVivinoLabelImports(jobs: VivinoLabelImportJob[], concurrency = 4): Promise<number> {
  if (jobs.length === 0) return 0

  const queue = [...jobs]
  let imported = 0
  const workerCount = Math.min(concurrency, queue.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const next = queue.shift()
        if (!next) return
        const ok = await importVivinoLabelPhoto(next)
        if (ok) imported += 1
      }
    }),
  )

  return imported
}

function createExistingBottleIndexes(existing: ExistingBottleRow[]) {
  const bottlesBySourceRef = new Map<string, ExistingBottleRow>()
  const bottlesByIdentityKey = new Map<string, ExistingBottleRow>()

  for (const bottle of existing) {
    const sourceRef = extractExistingSourceRef(bottle.raw_extraction)
    const identityKey = buildIdentityKey(bottle)

    if (sourceRef) {
      bottlesBySourceRef.set(sourceRef, bottle)
    }

    bottlesByIdentityKey.set(identityKey, bottle)
  }

  return { bottlesBySourceRef, bottlesByIdentityKey }
}

export async function importVivinoPreview(preview: VivinoImportPreview): Promise<VivinoImportResult> {
  const { data: existingRows, error } = await supabase
    .from('bottles')
    .select('id, domaine, cuvee, appellation, millesime, status, raw_extraction, photo_url')

  if (error) throw error

  const existing = (existingRows ?? []) as ExistingBottleRow[]
  const { bottlesBySourceRef, bottlesByIdentityKey } = createExistingBottleIndexes(existing)
  const labelImportJobs: VivinoLabelImportJob[] = []

  let importedCellarReferences = 0
  let importedCellarBottles = 0
  let importedTastings = 0
  let importedLabelPhotos = 0
  let alreadyPresent = 0

  for (const candidate of preview.cellar) {
    const identityKey = buildIdentityKey({ ...candidate, status: 'in_stock' })
    const existingBottle = bottlesBySourceRef.get(candidate.sourceRef) ?? bottlesByIdentityKey.get(identityKey)

    if (existingBottle) {
      enqueueVivinoLabelImport(labelImportJobs, existingBottle, candidate.labelImage)
      alreadyPresent += 1
      continue
    }

    const record = buildImportedCellarRecord(candidate)
    const { id } = await insertBottle(record)
    enqueueVivinoLabelImport(labelImportJobs, { id, photo_url: null }, candidate.labelImage)
    bottlesBySourceRef.set(candidate.sourceRef, { id, ...candidate, status: 'in_stock', raw_extraction: record.raw_extraction, photo_url: null })
    bottlesByIdentityKey.set(identityKey, { id, ...candidate, status: 'in_stock', raw_extraction: record.raw_extraction, photo_url: null })
    importedCellarReferences += 1
    importedCellarBottles += candidate.quantity
  }

  for (const candidate of preview.tastings) {
    const existingBottle = bottlesBySourceRef.get(candidate.sourceRef)

    if (existingBottle) {
      enqueueVivinoLabelImport(labelImportJobs, existingBottle, candidate.labelImage)
      alreadyPresent += 1
      continue
    }

    const record = buildImportedTastingRecord(candidate)
    const { id } = await insertBottle(record)
    enqueueVivinoLabelImport(labelImportJobs, { id, photo_url: null }, candidate.labelImage)
    bottlesBySourceRef.set(candidate.sourceRef, {
      id,
      domaine: candidate.domaine,
      cuvee: candidate.cuvee,
      appellation: candidate.appellation,
      millesime: candidate.millesime,
      status: 'drunk',
      raw_extraction: record.raw_extraction,
      photo_url: null,
    })
    importedTastings += 1

    const bottle = toBottleForPostProcessing(id, record)
    if (bottle.tasting_note) {
      extractAndSaveTags(bottle)
      generateAndSaveEmbedding(bottle)
    }
  }

  importedLabelPhotos = await runVivinoLabelImports(labelImportJobs)

  return {
    importedCellarReferences,
    importedCellarBottles,
    importedTastings,
    importedLabelPhotos,
    alreadyPresent,
  }
}
