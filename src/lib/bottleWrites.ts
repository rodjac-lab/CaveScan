import { supabase } from '@/lib/supabase'
import { normalizeWineColor, type Bottle, type BottleWithZone, type WineExtraction } from '@/lib/types'

type BottleInsertRecord = {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: ReturnType<typeof normalizeWineColor>
  country: string | null
  region: string | null
  zone_id: string | null
  shelf: string | null
  photo_url: string | null
  photo_url_back: string | null
  raw_extraction: Bottle['raw_extraction']
  status: Bottle['status']
  added_at?: string
  drunk_at: string | null
  tasting_note?: string | null
  purchase_price: number | null
  market_value?: number | null
  drink_from: number | null
  drink_until: number | null
  notes?: string | null
  tasting_photos?: Bottle['tasting_photos']
  rating?: number | null
  rebuy?: boolean | null
  qpr?: number | null
  grape_varieties: string[] | null
  serving_temperature: string | null
  typical_aromas: string[] | null
  food_pairings: string[] | null
  character: string | null
  quantity: number
  volume_l: number
  tasting_tags?: Bottle['tasting_tags']
}

export interface CellarBottleDraft {
  domaine: string
  cuvee: string
  appellation: string
  millesime: string
  couleur: Bottle['couleur'] | ''
  country: string
  region: string
  zoneId: string
  shelf: string
  purchasePrice: string
  photoUrl: string | null
  photoUrlBack: string | null
  rawExtraction: WineExtraction | null
  quantity: number
  volumeL: string
}

export function buildCellarBottleInsert(draft: CellarBottleDraft): BottleInsertRecord {
  return {
    domaine: draft.domaine || null,
    cuvee: draft.cuvee || null,
    appellation: draft.appellation || null,
    millesime: draft.millesime ? parseInt(draft.millesime, 10) : null,
    couleur: draft.couleur || null,
    country: draft.country || null,
    region: draft.region || null,
    zone_id: draft.zoneId || null,
    shelf: draft.shelf || null,
    purchase_price: draft.purchasePrice ? parseFloat(draft.purchasePrice.replace(',', '.')) : null,
    photo_url: draft.photoUrl,
    photo_url_back: draft.photoUrlBack,
    raw_extraction: draft.rawExtraction as Bottle['raw_extraction'],
    status: 'in_stock',
    drunk_at: null,
    grape_varieties: draft.rawExtraction?.grape_varieties || null,
    serving_temperature: draft.rawExtraction?.serving_temperature || null,
    typical_aromas: draft.rawExtraction?.typical_aromas || null,
    food_pairings: draft.rawExtraction?.food_pairings || null,
    character: draft.rawExtraction?.character || null,
    drink_from: draft.rawExtraction?.drink_from || null,
    drink_until: draft.rawExtraction?.drink_until || null,
    quantity: draft.quantity,
    volume_l: parseFloat(draft.volumeL),
  }
}

export function buildDrunkBottleInsertFromExtraction(
  extraction: WineExtraction,
  options: { photoUrl: string | null }
): BottleInsertRecord {
  return {
    domaine: extraction.domaine || null,
    cuvee: extraction.cuvee || null,
    appellation: extraction.appellation || null,
    millesime: extraction.millesime || null,
    couleur: normalizeWineColor(extraction.couleur) || null,
    country: extraction.country || null,
    region: extraction.region || null,
    zone_id: null,
    shelf: null,
    photo_url: options.photoUrl,
    photo_url_back: null,
    raw_extraction: extraction as unknown as Bottle['raw_extraction'],
    status: 'drunk',
    drunk_at: new Date().toISOString(),
    purchase_price: extraction.purchase_price ?? null,
    grape_varieties: extraction.grape_varieties || null,
    serving_temperature: extraction.serving_temperature || null,
    typical_aromas: extraction.typical_aromas || null,
    food_pairings: extraction.food_pairings || null,
    character: extraction.character || null,
    drink_from: null,
    drink_until: null,
    quantity: 1,
    volume_l: 0.75,
  }
}

export function buildDrunkBottleInsertFromBottle(
  bottle: BottleWithZone,
  drunkAt = new Date().toISOString()
): BottleInsertRecord {
  return {
    domaine: bottle.domaine,
    cuvee: bottle.cuvee,
    appellation: bottle.appellation,
    millesime: bottle.millesime,
    couleur: bottle.couleur,
    country: bottle.country,
    region: bottle.region,
    zone_id: bottle.zone_id,
    shelf: bottle.shelf,
    photo_url: bottle.photo_url,
    photo_url_back: bottle.photo_url_back,
    raw_extraction: bottle.raw_extraction,
    status: 'drunk',
    added_at: bottle.added_at,
    drunk_at: drunkAt,
    tasting_note: bottle.tasting_note,
    purchase_price: bottle.purchase_price,
    market_value: bottle.market_value,
    drink_from: bottle.drink_from,
    drink_until: bottle.drink_until,
    notes: bottle.notes,
    tasting_photos: bottle.tasting_photos,
    rating: bottle.rating,
    rebuy: bottle.rebuy,
    qpr: bottle.qpr,
    grape_varieties: bottle.grape_varieties,
    serving_temperature: bottle.serving_temperature,
    typical_aromas: bottle.typical_aromas,
    food_pairings: bottle.food_pairings,
    character: bottle.character,
    quantity: 1,
    volume_l: bottle.volume_l,
    tasting_tags: bottle.tasting_tags,
  }
}

export async function insertBottle(record: BottleInsertRecord): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('bottles')
    .insert(record)
    .select('id')
    .single()

  if (error) throw error
  return { id: data.id as string }
}

export async function updateBottleQuantity(id: string, quantity: number): Promise<void> {
  const { error } = await supabase
    .from('bottles')
    .update({ quantity })
    .eq('id', id)

  if (error) throw error
}

export async function markBottleAsDrunk(id: string, drunkAt: string): Promise<void> {
  const { error } = await supabase
    .from('bottles')
    .update({ status: 'drunk', drunk_at: drunkAt })
    .eq('id', id)

  if (error) throw error
}
