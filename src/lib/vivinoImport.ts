import JSZip from 'jszip'
import Papa from 'papaparse'
import { insertBottle, type BottleInsertRecord } from '@/lib/bottleWrites'
import { generateAndSaveEmbedding } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import { extractAndSaveTags } from '@/lib/tastingMemories'
import type { Bottle, BottleStatus, WineColor } from '@/lib/types'

type CsvRow = Record<string, string | undefined>

type ExistingBottleRow = Pick<Bottle, 'id' | 'domaine' | 'cuvee' | 'appellation' | 'millesime' | 'status' | 'raw_extraction' | 'photo_url'>

interface VivinoCellarRow {
  winery: string | null
  wineName: string | null
  vintage: number | null
  region: string | null
  country: string | null
  regionalWineStyle: string | null
  averageRating: number | null
  wineType: string | null
  link: string | null
  quantity: number
}

interface VivinoTastingRow {
  winery: string | null
  wineName: string | null
  vintage: number | null
  region: string | null
  country: string | null
  regionalWineStyle: string | null
  averageRating: number | null
  scanDate: string | null
  scanReviewLocation: string | null
  yourRating: number | null
  yourReview: string | null
  personalNote: string | null
  wineType: string | null
  drinkingWindow: string | null
  link: string | null
  labelImage: string | null
}

interface VivinoPriceRow extends VivinoTastingRow {
  winePrice: number | null
}

export interface VivinoCellarCandidate {
  sourceRef: string
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  country: string | null
  region: string | null
  couleur: WineColor | null
  millesime: number | null
  quantity: number
  averageRating: number | null
  regionalWineStyle: string | null
  link: string | null
  labelImage: string | null
}

export interface VivinoTastingCandidate {
  sourceRef: string
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  country: string | null
  region: string | null
  couleur: WineColor | null
  millesime: number | null
  rating: number | null
  tastingNote: string | null
  reviewLocation: string | null
  drunkAt: string | null
  purchasePrice: number | null
  averageRating: number | null
  regionalWineStyle: string | null
  link: string | null
  labelImage: string | null
}

export interface VivinoImportPreview {
  sourceFileName: string
  cellar: VivinoCellarCandidate[]
  tastings: VivinoTastingCandidate[]
  summary: {
    cellarReferences: number
    cellarBottles: number
    tastingEntries: number
    priceEntries: number
  }
}

export interface VivinoImportResult {
  importedCellarReferences: number
  importedCellarBottles: number
  importedTastings: number
  importedLabelPhotos: number
  alreadyPresent: number
}

function cleanString(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.replace(/\uFEFF/g, '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseNumber(value: string | undefined): number | null {
  const cleaned = cleanString(value)
  if (!cleaned) return null
  const normalized = cleaned.replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseInteger(value: string | undefined): number | null {
  const cleaned = cleanString(value)
  if (!cleaned) return null
  const parsed = Number.parseInt(cleaned, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePrice(value: string | undefined): number | null {
  const cleaned = cleanString(value)
  if (!cleaned) return null
  const normalized = cleaned
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeForKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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

function parseWineColor(wineType: string | null): WineColor | null {
  const normalized = normalizeForKey(wineType)
  if (!normalized) return null
  if (normalized.includes('red')) return 'rouge'
  if (normalized.includes('white')) return 'blanc'
  if (normalized.includes('rose')) return 'rose'
  if (normalized.includes('sparkling') || normalized.includes('champagne')) return 'bulles'
  return null
}

function parseVivinoDate(value: string | null): string | null {
  if (!value) return null
  const isoCandidate = value.replace(' ', 'T')
  const parsed = new Date(isoCandidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function joinTastingText(review: string | null, personalNote: string | null): string | null {
  if (review && personalNote) return `${review}\n\nNote perso Vivino: ${personalNote}`
  return review || personalNote
}

function compactKeyFragment(value: string | null): string {
  return normalizeForKey(value).slice(0, 80) || 'notext'
}

function parseCsv<T extends CsvRow>(content: string): T[] {
  const result = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: 'greedy',
  })

  if (result.errors.length > 0) {
    const firstError = result.errors[0]
    throw new Error(`CSV invalide: ${firstError.message}`)
  }

  return result.data.filter((row) => Object.values(row).some((value) => cleanString(value) !== null))
}

async function readCsvFromArchive(zip: JSZip, fileName: string): Promise<string | null> {
  const entry = Object.values(zip.files).find((file) => {
    if (file.dir) return false
    const baseName = file.name.split('/').pop()?.toLowerCase()
    return baseName === fileName.toLowerCase()
  })

  if (!entry) return null
  return entry.async('string')
}

function rowLinkOrIdentity(row: {
  winery: string | null
  wineName: string | null
  vintage: number | null
  region: string | null
  link: string | null
}): string {
  if (row.link) return `link:${row.link}`
  return `identity:${[
    normalizeForKey(row.winery),
    normalizeForKey(row.wineName),
    normalizeForKey(row.region),
    row.vintage ?? '',
  ].join('|')}`
}

function mapLabelImages(rows: VivinoTastingRow[]): Map<string, string> {
  const labelImages = new Map<string, string>()

  for (const row of rows) {
    if (!row.labelImage) continue
    const key = rowLinkOrIdentity(row)
    if (!labelImages.has(key)) {
      labelImages.set(key, row.labelImage)
    }
  }

  return labelImages
}

function mapCellarRows(rows: VivinoCellarRow[], labelImages: Map<string, string>): VivinoCellarCandidate[] {
  const bySource = new Map<string, VivinoCellarCandidate>()

  for (const row of rows) {
    const sourceRef = `vivino:cellar:${rowLinkOrIdentity(row)}`
    const quantity = Math.max(1, row.quantity)
    const existing = bySource.get(sourceRef)

    if (existing) {
      existing.quantity += quantity
      continue
    }

    bySource.set(sourceRef, {
      sourceRef,
      domaine: row.winery,
      cuvee: row.wineName,
      appellation: row.region,
      country: row.country,
      region: row.region,
      couleur: parseWineColor(row.wineType),
      millesime: row.vintage,
      quantity,
      averageRating: row.averageRating,
      regionalWineStyle: row.regionalWineStyle,
      link: row.link,
      labelImage: labelImages.get(rowLinkOrIdentity(row)) ?? null,
    })
  }

  return Array.from(bySource.values())
}

function isConfidentTastingRow(row: VivinoTastingRow): boolean {
  const hasRating = row.yourRating != null
  const hasReview = !!row.yourReview
  const hasTimedNote = !!row.personalNote && !!row.scanDate
  return hasRating || hasReview || hasTimedNote
}

function mapPriceRows(rows: VivinoPriceRow[]): Map<string, number> {
  const prices = new Map<string, number>()

  for (const row of rows) {
    if (row.winePrice == null) continue
    const key = rowLinkOrIdentity(row)
    if (!prices.has(key)) prices.set(key, row.winePrice)
  }

  return prices
}

function mapTastingRows(rows: VivinoTastingRow[], prices: Map<string, number>): VivinoTastingCandidate[] {
  const candidates: VivinoTastingCandidate[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (!isConfidentTastingRow(row)) continue

    const linkOrIdentity = rowLinkOrIdentity(row)
    const sourceRef = `vivino:tasting:${linkOrIdentity}:${row.scanDate ?? 'undated'}:${row.yourRating ?? 'norating'}:${compactKeyFragment(row.yourReview ?? row.personalNote)}`
    if (seen.has(sourceRef)) continue
    seen.add(sourceRef)

    candidates.push({
      sourceRef,
      domaine: row.winery,
      cuvee: row.wineName,
      appellation: row.region,
      country: row.country,
      region: row.region,
      couleur: parseWineColor(row.wineType),
      millesime: row.vintage,
      rating: row.yourRating,
      tastingNote: joinTastingText(row.yourReview, row.personalNote),
      reviewLocation: row.scanReviewLocation,
      drunkAt: parseVivinoDate(row.scanDate),
      purchasePrice: prices.get(linkOrIdentity) ?? null,
      averageRating: row.averageRating,
      regionalWineStyle: row.regionalWineStyle,
      link: row.link,
      labelImage: row.labelImage,
    })
  }

  return candidates
}

function buildVivinoRawExtraction(candidate: VivinoCellarCandidate | VivinoTastingCandidate, dataset: 'cellar' | 'full_wine_list'): Record<string, unknown> {
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

interface VivinoLabelImportJob {
  bottleId: string
  imageUrl: string
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

function mapCellarCsvRows(rows: CsvRow[]): VivinoCellarRow[] {
  return rows.map((row) => ({
    winery: cleanString(row['Winery']),
    wineName: cleanString(row['Wine name']),
    vintage: parseInteger(row['Vintage']),
    region: cleanString(row['Region']),
    country: cleanString(row['Country']),
    regionalWineStyle: cleanString(row['Regional wine style']),
    averageRating: parseNumber(row['Average rating']),
    wineType: cleanString(row['Wine type']),
    link: cleanString(row['Link to wine']),
    quantity: parseInteger(row['User cellar count']) ?? 1,
  }))
}

function mapFullWineCsvRows(rows: CsvRow[]): VivinoTastingRow[] {
  return rows.map((row) => ({
    winery: cleanString(row['Winery']),
    wineName: cleanString(row['Wine name']),
    vintage: parseInteger(row['Vintage']),
    region: cleanString(row['Region']),
    country: cleanString(row['Country']),
    regionalWineStyle: cleanString(row['Regional wine style']),
    averageRating: parseNumber(row['Average rating']),
    scanDate: cleanString(row['Scan date']),
    scanReviewLocation: cleanString(row['Scan/Review Location']),
    yourRating: parseNumber(row['Your rating']),
    yourReview: cleanString(row['Your review']),
    personalNote: cleanString(row['Personal Note']),
    wineType: cleanString(row['Wine type']),
    drinkingWindow: cleanString(row['Drinking Window']),
    link: cleanString(row['Link to wine']),
    labelImage: cleanString(row['Label image']),
  }))
}

function mapPriceCsvRows(rows: CsvRow[]): VivinoPriceRow[] {
  return rows.map((row) => ({
    ...mapFullWineCsvRows([row])[0],
    winePrice: parsePrice(row['Wine price']),
  }))
}

export async function parseVivinoZip(file: File): Promise<VivinoImportPreview> {
  const zip = await JSZip.loadAsync(file)
  const [cellarCsv, fullWineCsv, priceCsv] = await Promise.all([
    readCsvFromArchive(zip, 'cellar.csv'),
    readCsvFromArchive(zip, 'full_wine_list.csv'),
    readCsvFromArchive(zip, 'user_prices.csv'),
  ])

  if (!cellarCsv && !fullWineCsv) {
    throw new Error('Export Vivino invalide: impossible de trouver cellar.csv ou full_wine_list.csv')
  }

  const cellarRows = cellarCsv ? mapCellarCsvRows(parseCsv<CsvRow>(cellarCsv)) : []
  const fullWineRows = fullWineCsv ? mapFullWineCsvRows(parseCsv<CsvRow>(fullWineCsv)) : []
  const priceRows = priceCsv ? mapPriceCsvRows(parseCsv<CsvRow>(priceCsv)) : []

  const priceMap = mapPriceRows(priceRows)
  const labelImages = mapLabelImages(fullWineRows)
  const cellar = mapCellarRows(cellarRows, labelImages)
  const tastings = mapTastingRows(fullWineRows, priceMap)
  const priceEntries = tastings.filter((row) => row.purchasePrice != null).length

  return {
    sourceFileName: file.name,
    cellar,
    tastings,
    summary: {
      cellarReferences: cellar.length,
      cellarBottles: cellar.reduce((sum, row) => sum + row.quantity, 0),
      tastingEntries: tastings.length,
      priceEntries,
    },
  }
}

export async function importVivinoPreview(preview: VivinoImportPreview): Promise<VivinoImportResult> {
  const { data: existingRows, error } = await supabase
    .from('bottles')
    .select('id, domaine, cuvee, appellation, millesime, status, raw_extraction, photo_url')

  if (error) throw error

  const existing = (existingRows ?? []) as ExistingBottleRow[]
  const seenSourceRefs = new Set<string>()
  const seenIdentityKeys = new Set<string>()
  const bottlesBySourceRef = new Map<string, ExistingBottleRow>()
  const bottlesByIdentityKey = new Map<string, ExistingBottleRow>()
  const labelImportJobs: VivinoLabelImportJob[] = []

  for (const bottle of existing) {
    const sourceRef = extractExistingSourceRef(bottle.raw_extraction)
    const identityKey = buildIdentityKey(bottle)
    if (sourceRef) {
      seenSourceRefs.add(sourceRef)
      bottlesBySourceRef.set(sourceRef, bottle)
    }
    seenIdentityKeys.add(identityKey)
    bottlesByIdentityKey.set(identityKey, bottle)
  }

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
    seenSourceRefs.add(candidate.sourceRef)
    seenIdentityKeys.add(identityKey)
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
    seenSourceRefs.add(candidate.sourceRef)
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
