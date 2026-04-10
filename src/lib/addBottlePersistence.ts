import type { BatchItemData } from '@/components/BatchItemForm'
import { buildCellarBottleInsert, insertBottle } from '@/lib/bottleWrites'
import { createUploadStamp } from '@/lib/addBottleFlow'
import { enrichWineAndUpdate } from '@/lib/enrichWine'
import { uploadPhoto } from '@/lib/uploadPhoto'
import type { BottleVolumeOption, WineColor, WineExtraction } from '@/lib/types'

interface SingleBottleSaveDraft {
  domaine: string
  cuvee: string
  appellation: string
  millesime: string
  couleur: WineColor | ''
  country: string
  region: string
  zoneId: string
  shelf: string
  purchasePrice: string
  photoFile: File | null
  photoFileBack: File | null
  rawExtraction: WineExtraction | null
  quantity: number
  volumeL: BottleVolumeOption
}

export async function saveSingleCellarBottle(draft: SingleBottleSaveDraft): Promise<{ id: string }> {
  const timestamp = createUploadStamp()
  const photoUrl = draft.photoFile ? await uploadPhoto(draft.photoFile, `${timestamp}-front.jpg`) : null
  const photoUrlBack = draft.photoFileBack ? await uploadPhoto(draft.photoFileBack, `${timestamp}-back.jpg`) : null

  return insertBottle(
    buildCellarBottleInsert({
      domaine: draft.domaine,
      cuvee: draft.cuvee,
      appellation: draft.appellation,
      millesime: draft.millesime,
      couleur: draft.couleur,
      country: draft.country,
      region: draft.region,
      zoneId: draft.zoneId,
      shelf: draft.shelf,
      purchasePrice: draft.purchasePrice,
      photoUrl,
      photoUrlBack,
      rawExtraction: draft.rawExtraction,
      quantity: draft.quantity,
      volumeL: draft.volumeL,
    }),
  )
}

export async function saveBatchCellarBottle(item: BatchItemData): Promise<{ id: string }> {
  const timestamp = createUploadStamp()
  const photoUrl = item.photoFile ? await uploadPhoto(item.photoFile, `${timestamp}-${item.id}-front.jpg`) : null
  const photoUrlBack = item.photoFileBack ? await uploadPhoto(item.photoFileBack, `${timestamp}-${item.id}-back.jpg`) : null
  const rawExtraction = item.rawExtraction as WineExtraction | null

  const savedBottle = await insertBottle(
    buildCellarBottleInsert({
      domaine: item.domaine,
      cuvee: item.cuvee,
      appellation: item.appellation,
      millesime: item.millesime,
      couleur: item.couleur,
      country: item.country,
      region: item.region,
      zoneId: item.zoneId,
      shelf: item.shelf,
      purchasePrice: item.purchasePrice,
      photoUrl,
      photoUrlBack,
      rawExtraction,
      quantity: item.quantity,
      volumeL: item.volumeL,
    }),
  )

  if (rawExtraction && !rawExtraction.character && !rawExtraction.typical_aromas?.length) {
    void enrichWineAndUpdate(savedBottle.id, {
      domaine: item.domaine,
      cuvee: item.cuvee,
      appellation: item.appellation,
      millesime: item.millesime,
      couleur: item.couleur,
    })
  }

  return savedBottle
}
