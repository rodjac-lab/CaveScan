import type { RefObject } from 'react'
import { Camera, Loader2, Check, X, Wine, Plus, ImageIcon } from 'lucide-react'
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { StoragePositionPicker } from '@/components/StoragePositionPicker'
import { PhotoPreviewCard } from '@/components/PhotoPreviewCard'
import { WineFormFields } from '@/components/WineFormFields'
import { QuantitySelector } from '@/components/QuantitySelector'
import type { BottleVolumeOption, WineColor, WineExtraction, Zone } from '@/lib/types'

interface HeaderProps {
  subtitle?: string
}

interface CaptureStepProps {
  fileInputRef: RefObject<HTMLInputElement | null>
  fileInputBatchRef: RefObject<HTMLInputElement | null>
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBatchFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
  onManualEntry: () => void
}

interface ExtractingStepProps {
  photoPreview: string | null
  onZoom: (src: string) => void
}

interface SingleConfirmStepProps {
  photoPreview: string | null
  photoPreviewBack: string | null
  fileInputBackRef: RefObject<HTMLInputElement | null>
  onBackPhotoSelect: (event: React.ChangeEvent<HTMLInputElement>) => void
  onZoom: (src: string, label?: string) => void
  domaine: string
  cuvee: string
  appellation: string
  millesime: string
  couleur: WineColor | ''
  country: string
  region: string
  volumeL: BottleVolumeOption
  onDomaineChange: (value: string) => void
  onCuveeChange: (value: string) => void
  onAppellationChange: (value: string) => void
  onMillesimeChange: (value: string) => void
  onCouleurChange: (value: WineColor | '') => void
  onCountryChange: (value: string) => void
  onRegionChange: (value: string) => void
  onVolumeChange: (value: BottleVolumeOption) => void
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
  quantity: number
  onQuantityChange: (value: number) => void
  zoneId: string
  onZoneChange: (value: string) => void
  zones: Zone[]
  zonesLoading: boolean
  shelf: string
  onShelfChange: (value: string) => void
  purchasePrice: string
  onPurchasePriceChange: (value: string) => void
  rawExtraction: WineExtraction | null
  onCancel: () => void
  onSave: () => void
}

interface ZoomDialogProps {
  zoomImage: { src: string; label?: string } | null
  onClose: () => void
}

export function AddBottleHeader({ subtitle = 'Ajouter des bouteilles à votre cave' }: HeaderProps) {
  return (
    <div className="mb-4">
      <p className="brand-text">Celestin</p>
      <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Encaver</h1>
      <p className="text-[13px] font-light text-[var(--text-secondary)]">
        {subtitle}
      </p>
    </div>
  )
}

export function AddBottleCaptureStep({
  fileInputRef,
  fileInputBatchRef,
  onFileSelect,
  onBatchFileSelect,
  onManualEntry,
}: CaptureStepProps) {
  return (
    <div className="mt-6 space-y-4">
      <p className="text-muted-foreground">
        Prenez une photo de l'étiquette ou saisissez manuellement
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileSelect}
        className="hidden"
      />

      <input
        ref={fileInputBatchRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onBatchFileSelect}
        className="hidden"
      />

      <Button
        size="lg"
        className="w-full h-24 flex-col gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="h-8 w-8" />
        <span>Photographier</span>
      </Button>

      <Button
        size="lg"
        variant="outline"
        className="w-full h-16 flex-col gap-1"
        onClick={() => fileInputBatchRef.current?.click()}
      >
        <ImageIcon className="h-6 w-6" />
        <span>Choisir des photos</span>
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">ou</span>
        </div>
      </div>

      <Button variant="ghost" className="w-full" onClick={onManualEntry}>
        <Wine className="mr-2 h-4 w-4" />
        Saisie manuelle
      </Button>
    </div>
  )
}

export function AddBottleExtractingStep({ photoPreview, onZoom }: ExtractingStepProps) {
  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      {photoPreview && (
        <img
          src={photoPreview}
          alt="Étiquette"
          className="max-h-48 rounded-lg object-contain cursor-zoom-in"
          onClick={() => onZoom(photoPreview)}
        />
      )}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Analyse de l'étiquette...</span>
      </div>
    </div>
  )
}

export function AddBottleSingleConfirmStep({
  photoPreview,
  photoPreviewBack,
  fileInputBackRef,
  onBackPhotoSelect,
  onZoom,
  domaine,
  cuvee,
  appellation,
  millesime,
  couleur,
  country,
  region,
  volumeL,
  onDomaineChange,
  onCuveeChange,
  onAppellationChange,
  onMillesimeChange,
  onCouleurChange,
  onCountryChange,
  onRegionChange,
  onVolumeChange,
  domainesSuggestions,
  appellationsSuggestions,
  quantity,
  onQuantityChange,
  zoneId,
  onZoneChange,
  zones,
  zonesLoading,
  shelf,
  onShelfChange,
  purchasePrice,
  onPurchasePriceChange,
  rawExtraction,
  onCancel,
  onSave,
}: SingleConfirmStepProps) {
  return (
    <div className="mt-6 space-y-4">
      <PhotoPreviewCard
        photoPreview={photoPreview}
        photoPreviewBack={photoPreviewBack}
        onZoom={onZoom}
      />

      {photoPreview && !photoPreviewBack && (
        <>
          <input
            ref={fileInputBackRef}
            type="file"
            accept="image/*"
            onChange={onBackPhotoSelect}
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

      <div className="space-y-3">
        <WineFormFields
          domaine={domaine}
          cuvee={cuvee}
          appellation={appellation}
          millesime={millesime}
          couleur={couleur}
          country={country}
          region={region}
          onDomaineChange={onDomaineChange}
          onCuveeChange={onCuveeChange}
          onAppellationChange={onAppellationChange}
          onMillesimeChange={onMillesimeChange}
          onCouleurChange={onCouleurChange}
          onCountryChange={onCountryChange}
          onRegionChange={onRegionChange}
          volumeL={volumeL}
          onVolumeChange={onVolumeChange}
          domainesSuggestions={domainesSuggestions}
          appellationsSuggestions={appellationsSuggestions}
        />

        <QuantitySelector value={quantity} onChange={onQuantityChange} />

        <div>
          <Label htmlFor="zone">Zone de stockage</Label>
          <Select value={zoneId} onValueChange={onZoneChange} disabled={zonesLoading}>
            <SelectTrigger id="zone">
              <SelectValue placeholder="Choisir une zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="shelf">Étagère / Emplacement</Label>
          <div id="shelf" className="mt-1">
            <StoragePositionPicker
              zoneId={zoneId}
              zone={zones.find((zone) => zone.id === zoneId)}
              value={shelf}
              onChange={onShelfChange}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="price">Prix d'achat (€)</Label>
          <Input
            id="price"
            inputMode="decimal"
            value={purchasePrice}
            onChange={(event) => onPurchasePriceChange(event.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="ex: 12.50"
          />
        </div>
      </div>

      {rawExtraction && (rawExtraction.typical_aromas?.length || rawExtraction.food_pairings?.length || rawExtraction.serving_temperature || rawExtraction.character) && (
        <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3 card-shadow">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Repères de dégustation</p>
          {rawExtraction.serving_temperature && (
            <p className="text-[12px] text-[var(--text-secondary)] mb-1">
              <span className="text-[var(--text-muted)]">Temp. :</span> {rawExtraction.serving_temperature}
            </p>
          )}
          {rawExtraction.typical_aromas && rawExtraction.typical_aromas.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {rawExtraction.typical_aromas.map((aroma, index) => (
                <span key={index} className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{aroma}</span>
              ))}
            </div>
          )}
          {rawExtraction.character && (
            <p className="text-[12px] italic text-[var(--text-secondary)] leading-relaxed">{rawExtraction.character}</p>
          )}
          {rawExtraction.food_pairings && rawExtraction.food_pairings.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-[11px] text-[var(--text-muted)] mr-1">Accords :</span>
              {rawExtraction.food_pairings.map((pairing, index) => (
                <span key={index} className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{pairing}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          Annuler
        </Button>
        <Button
          className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
          onClick={onSave}
        >
          <Check className="mr-2 h-4 w-4" />
          {quantity > 1 ? `Ajouter ${quantity} bouteilles` : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}

export function AddBottleSavingStep() {
  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      <span className="text-muted-foreground">Enregistrement...</span>
    </div>
  )
}

export function AddBottleZoomDialog({ zoomImage, onClose }: ZoomDialogProps) {
  return (
    <Dialog open={!!zoomImage} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[calc(100%-1rem)] p-2 sm:max-w-3xl"
        showCloseButton={false}
      >
        <div className="flex flex-col gap-2">
          <img
            src={zoomImage?.src}
            alt={zoomImage?.label ? `Photo ${zoomImage.label}` : 'Photo'}
            className="max-h-[80vh] w-full object-contain rounded-md bg-black/80"
          />
          {zoomImage?.label && (
            <p className="text-center text-xs text-muted-foreground">{zoomImage.label}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
