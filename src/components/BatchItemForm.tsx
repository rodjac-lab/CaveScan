import { useRef } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Autocomplete } from '@/components/Autocomplete'
import { WINE_COLORS, type WineColor } from '@/lib/types'
import type { Zone } from '@/lib/types'

export interface BatchItemData {
  id: string
  photoFile: File
  photoPreview: string
  photoFileBack: File | null
  photoPreviewBack: string | null
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'error'
  extractionError?: string
  domaine: string
  cuvee: string
  appellation: string
  millesime: string
  couleur: WineColor | ''
  zoneId: string
  shelf: string
  purchasePrice: string
  rawExtraction: unknown
}

interface BatchItemFormProps {
  item: BatchItemData
  currentIndex: number
  totalItems: number
  zones: Zone[]
  zonesLoading: boolean
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
  onUpdate: (updates: Partial<BatchItemData>) => void
  onBackPhotoSelect: (file: File) => void
  onZoomImage: (src: string, label?: string) => void
}

export function BatchItemForm({
  item,
  currentIndex,
  totalItems,
  zones,
  zonesLoading,
  domainesSuggestions,
  appellationsSuggestions,
  onUpdate,
  onBackPhotoSelect,
  onZoomImage,
}: BatchItemFormProps) {
  const fileInputBackRef = useRef<HTMLInputElement>(null)

  const handleBackPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onBackPhotoSelect(file)
    }
  }

  const handleMillesimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    onUpdate({ millesime: val })
  }

  return (
    <div className="space-y-4">
      {/* Batch navigation header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Fiche {currentIndex + 1} sur {totalItems}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: totalItems }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i === currentIndex
                  ? 'bg-[var(--accent)]'
                  : i < currentIndex
                    ? 'bg-green-500'
                    : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Photo previews */}
      {(item.photoPreview || item.photoPreviewBack) && (
        <Card>
          <CardContent className="p-2">
            <div className="flex gap-2">
              {item.photoPreview && (
                <div className="flex-1">
                  <img
                    src={item.photoPreview}
                    alt="Étiquette avant"
                    className="max-h-28 w-full rounded object-contain cursor-zoom-in"
                    onClick={() => onZoomImage(item.photoPreview, 'Avant')}
                  />
                  <p className="text-xs text-center text-muted-foreground mt-1">Avant</p>
                </div>
              )}
              {item.photoPreviewBack && (
                <div className="flex-1">
                  <img
                    src={item.photoPreviewBack}
                    alt="Étiquette arrière"
                    className="max-h-28 w-full rounded object-contain cursor-zoom-in"
                    onClick={() => onZoomImage(item.photoPreviewBack!, 'Arrière')}
                  />
                  <p className="text-xs text-center text-muted-foreground mt-1">Arrière</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add back photo button */}
      {item.photoPreview && !item.photoPreviewBack && (
        <>
          <input
            ref={fileInputBackRef}
            type="file"
            accept="image/*"
            onChange={handleBackPhotoChange}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputBackRef.current?.click()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Ajouter la contre-étiquette
          </Button>
        </>
      )}

      {/* Extraction error warning */}
      {item.extractionError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {item.extractionError}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label htmlFor="domaine">Domaine / Producteur</Label>
          <Autocomplete
            id="domaine"
            value={item.domaine}
            onChange={(value) => onUpdate({ domaine: value })}
            suggestions={domainesSuggestions}
            placeholder="ex: Chartogne Taillet"
          />
        </div>

        <div>
          <Label htmlFor="cuvee">Cuvée</Label>
          <Input
            id="cuvee"
            value={item.cuvee}
            onChange={(e) => onUpdate({ cuvee: e.target.value })}
            placeholder="ex: Orizeaux"
          />
        </div>

        <div>
          <Label htmlFor="appellation">Appellation</Label>
          <Autocomplete
            id="appellation"
            value={item.appellation}
            onChange={(value) => onUpdate({ appellation: value })}
            suggestions={appellationsSuggestions}
            placeholder="ex: Margaux"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="millesime">Millésime</Label>
            <Input
              id="millesime"
              inputMode="numeric"
              pattern="[0-9]*"
              value={item.millesime}
              onChange={handleMillesimeChange}
              placeholder="ex: 2020"
              maxLength={4}
            />
          </div>

          <div>
            <Label htmlFor="couleur">Couleur</Label>
            <Select
              value={item.couleur}
              onValueChange={(v) => onUpdate({ couleur: v as WineColor })}
            >
              <SelectTrigger id="couleur">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {WINE_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="zone">Zone de stockage</Label>
          <Select
            value={item.zoneId}
            onValueChange={(v) => onUpdate({ zoneId: v })}
            disabled={zonesLoading}
          >
            <SelectTrigger id="zone">
              <SelectValue placeholder="Choisir une zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="shelf">Étagère / Emplacement</Label>
          <Input
            id="shelf"
            value={item.shelf}
            onChange={(e) => onUpdate({ shelf: e.target.value })}
            placeholder="ex: Étagère 1, Haut..."
          />
        </div>

        <div>
          <Label htmlFor="price">Prix d'achat (€)</Label>
          <Input
            id="price"
            inputMode="decimal"
            value={item.purchasePrice}
            onChange={(e) =>
              onUpdate({ purchasePrice: e.target.value.replace(/[^0-9.,]/g, '') })
            }
            placeholder="ex: 12.50"
          />
        </div>
      </div>
    </div>
  )
}
