import type { WineColor } from '@/lib/types'

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
