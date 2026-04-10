import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchItemData } from '@/components/BatchItemForm'
import { insertBottle } from '@/lib/bottleWrites'
import { enrichWineAndUpdate } from '@/lib/enrichWine'
import { uploadPhoto } from '@/lib/uploadPhoto'
import { saveBatchCellarBottle, saveSingleCellarBottle } from '@/lib/addBottlePersistence'
import type { WineExtraction } from '@/lib/types'

vi.mock('@/lib/addBottleFlow', async () => {
  const actual = await vi.importActual<typeof import('@/lib/addBottleFlow')>('@/lib/addBottleFlow')
  return {
    ...actual,
    createUploadStamp: () => 'stamp',
  }
})

vi.mock('@/lib/uploadPhoto', () => ({
  uploadPhoto: vi.fn(async (_file: File, fileName: string) => `uploaded:${fileName}`),
}))

vi.mock('@/lib/enrichWine', () => ({
  enrichWineAndUpdate: vi.fn(),
}))

vi.mock('@/lib/bottleWrites', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bottleWrites')>('@/lib/bottleWrites')
  return {
    ...actual,
    insertBottle: vi.fn(async () => ({ id: 'bottle-1' })),
  }
})

const minimalExtraction: WineExtraction = {
  domaine: 'Domaine Test',
  cuvee: null,
  appellation: 'Morgon',
  millesime: 2022,
  couleur: 'rouge',
  country: null,
  region: null,
  cepage: null,
  confidence: 0,
  grape_varieties: null,
  serving_temperature: null,
  typical_aromas: null,
  food_pairings: null,
  character: null,
}

function makeFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

describe('addBottlePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads photos and inserts a cellar bottle', async () => {
    const front = makeFile('front.jpg')
    const back = makeFile('back.jpg')

    await saveSingleCellarBottle({
      domaine: 'Rayas',
      cuvee: '',
      appellation: 'Châteauneuf-du-Pape',
      millesime: '1998',
      couleur: 'rouge',
      country: 'France',
      region: 'Rhône',
      zoneId: 'zone-1',
      shelf: 'A1',
      purchasePrice: '120',
      photoFile: front,
      photoFileBack: back,
      rawExtraction: minimalExtraction,
      quantity: 2,
      volumeL: '0.75',
    })

    expect(uploadPhoto).toHaveBeenCalledWith(front, 'stamp-front.jpg')
    expect(uploadPhoto).toHaveBeenCalledWith(back, 'stamp-back.jpg')
    expect(insertBottle).toHaveBeenCalledWith(expect.objectContaining({
      domaine: 'Rayas',
      appellation: 'Châteauneuf-du-Pape',
      millesime: 1998,
      status: 'in_stock',
      zone_id: 'zone-1',
      shelf: 'A1',
      photo_url: 'uploaded:stamp-front.jpg',
      photo_url_back: 'uploaded:stamp-back.jpg',
      quantity: 2,
      volume_l: 0.75,
    }))
  })

  it('keeps the batch enrichment fallback after insert', async () => {
    const item = {
      id: 'batch-1',
      photoFile: makeFile('front.jpg'),
      photoFileBack: null,
      domaine: 'Foillard',
      cuvee: 'Côte du Py',
      appellation: 'Morgon',
      millesime: '2022',
      couleur: 'rouge',
      country: 'France',
      region: 'Beaujolais',
      zoneId: '',
      shelf: '',
      purchasePrice: '',
      quantity: 1,
      volumeL: '0.75',
      rawExtraction: minimalExtraction,
    } as BatchItemData

    await saveBatchCellarBottle(item)

    expect(uploadPhoto).toHaveBeenCalledWith(item.photoFile, 'stamp-batch-1-front.jpg')
    expect(insertBottle).toHaveBeenCalled()
    expect(enrichWineAndUpdate).toHaveBeenCalledWith('bottle-1', {
      domaine: 'Foillard',
      cuvee: 'Côte du Py',
      appellation: 'Morgon',
      millesime: '2022',
      couleur: 'rouge',
    })
  })
})
