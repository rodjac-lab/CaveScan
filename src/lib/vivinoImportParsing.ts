import JSZip from 'jszip'
import Papa from 'papaparse'
import { parseWineColor, normalizeForKey } from '@/lib/vivinoImportShared'
import type {
  VivinoCellarCandidate,
  VivinoImportPreview,
  VivinoTastingCandidate,
} from '@/lib/vivinoImportTypes'

type CsvRow = Record<string, string | undefined>

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
  const zipBytes = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBytes)
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
