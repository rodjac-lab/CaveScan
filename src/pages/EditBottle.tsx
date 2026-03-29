import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Check, ImageIcon, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Autocomplete } from '@/components/Autocomplete'
import { StoragePositionPicker } from '@/components/StoragePositionPicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useBottle, useAppellationsSuggestions, useDomainesSuggestions } from '@/hooks/useBottles'
import { useZones } from '@/hooks/useZones'
import { supabase } from '@/lib/supabase'
import { BOTTLE_VOLUMES, WINE_COLORS, type BottleVolumeOption, type WineColor } from '@/lib/types'
import { uploadPhoto } from '@/lib/uploadPhoto'
import { showToast } from '@/lib/toast'

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="h-px flex-1 bg-[var(--border-color)]" />
        <span className="section-divider-label">{title}</span>
        <div className="h-px flex-1 bg-[var(--border-color)]" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export default function EditBottle() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { bottle, loading: bottleLoading, error: bottleError } = useBottle(id)
  const { zones, loading: zonesLoading } = useZones()
  const domainesSuggestions = useDomainesSuggestions()
  const appellationsSuggestions = useAppellationsSuggestions()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)

  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null)
  const [localPhotoUrlBack, setLocalPhotoUrlBack] = useState<string | null>(null)
  const [showFrontPhotoOptions, setShowFrontPhotoOptions] = useState(false)
  const [showBackPhotoOptions, setShowBackPhotoOptions] = useState(false)
  const [uploadingFront, setUploadingFront] = useState(false)
  const [uploadingBack, setUploadingBack] = useState(false)
  const [removingFront, setRemovingFront] = useState(false)
  const [removingBack, setRemovingBack] = useState(false)
  const frontPhotoInputRef = useRef<HTMLInputElement>(null)
  const frontGalleryRef = useRef<HTMLInputElement>(null)
  const backPhotoInputRef = useRef<HTMLInputElement>(null)
  const backGalleryRef = useRef<HTMLInputElement>(null)

  const [domaine, setDomaine] = useState('')
  const [cuvee, setCuvee] = useState('')
  const [appellation, setAppellation] = useState('')
  const [millesime, setMillesime] = useState('')
  const [couleur, setCouleur] = useState<WineColor | ''>('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [grapeVarietiesInput, setGrapeVarietiesInput] = useState('')
  const [character, setCharacter] = useState('')
  const [servingTemperature, setServingTemperature] = useState('')
  const [typicalAromasInput, setTypicalAromasInput] = useState('')
  const [foodPairingsInput, setFoodPairingsInput] = useState('')
  const [zoneId, setZoneId] = useState('none')
  const [shelf, setShelf] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [marketValue, setMarketValue] = useState('')
  const [notes, setNotes] = useState('')
  const [volumeL, setVolumeL] = useState<BottleVolumeOption>('0.75')

  useEffect(() => {
    if (!bottle) return

    setDomaine(bottle.domaine || '')
    setCuvee(bottle.cuvee || '')
    setAppellation(bottle.appellation || '')
    setMillesime(bottle.millesime?.toString() || '')
    setCouleur(bottle.couleur || '')
    setCountry(bottle.country || '')
    setRegion(bottle.region || '')
    setGrapeVarietiesInput((bottle.grape_varieties || []).join(', '))
    setCharacter(bottle.character || '')
    setServingTemperature(bottle.serving_temperature || '')
    setTypicalAromasInput((bottle.typical_aromas || []).join(', '))
    setFoodPairingsInput((bottle.food_pairings || []).join(', '))
    setZoneId(bottle.zone_id || 'none')
    setShelf(bottle.shelf || '')
    setPurchasePrice(bottle.purchase_price?.toString() || '')
    setMarketValue(bottle.market_value?.toString() || '')
    setNotes(bottle.notes || '')
    setVolumeL((bottle.volume_l?.toString() as BottleVolumeOption) || '0.75')
    setLocalPhotoUrl(bottle.photo_url || null)
    setLocalPhotoUrlBack(bottle.photo_url_back || null)
  }, [bottle])

  const handleMillesimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setMillesime(val)
  }

  const handlePhotoSelect = async (side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !bottle) return
    e.target.value = ''

    const isFront = side === 'front'
    if (isFront) {
      setUploadingFront(true)
      setShowFrontPhotoOptions(false)
    } else {
      setUploadingBack(true)
      setShowBackPhotoOptions(false)
    }

    try {
      const url = await uploadPhoto(file, `${Date.now()}-${side}.jpg`)
      if (!url) throw new Error('Upload failed')

      const field = isFront ? 'photo_url' : 'photo_url_back'
      const { error: dbError } = await supabase
        .from('bottles')
        .update({ [field]: url })
        .eq('id', bottle.id)

      if (!dbError) {
        if (isFront) setLocalPhotoUrl(url)
        else setLocalPhotoUrlBack(url)
      }
    } catch (err) {
      console.error('Photo upload error:', err)
      showToast('Erreur lors de l\'upload de la photo')
    }

    if (isFront) setUploadingFront(false)
    else setUploadingBack(false)
  }

  const handlePhotoRemove = async (side: 'front' | 'back') => {
    if (!bottle) return

    const isFront = side === 'front'
    if (isFront) {
      setRemovingFront(true)
      setShowFrontPhotoOptions(false)
    } else {
      setRemovingBack(true)
      setShowBackPhotoOptions(false)
    }

    try {
      const field = isFront ? 'photo_url' : 'photo_url_back'
      const { error: dbError } = await supabase
        .from('bottles')
        .update({ [field]: null })
        .eq('id', bottle.id)

      if (!dbError) {
        if (isFront) setLocalPhotoUrl(null)
        else setLocalPhotoUrlBack(null)
      }
    } catch (err) {
      console.error('Photo remove error:', err)
      showToast('Erreur lors de la suppression de la photo')
    }

    if (isFront) setRemovingFront(false)
    else setRemovingBack(false)
  }

  const handleSave = async () => {
    if (!bottle) return

    if (!domaine && !appellation) {
      setError("Veuillez renseigner au moins le domaine ou l'appellation")
      return
    }

    setSaving(true)
    setError(null)

    const grapeVarieties = grapeVarietiesInput.split(',').map((value) => value.trim()).filter(Boolean)
    const typicalAromas = typicalAromasInput.split(',').map((value) => value.trim()).filter(Boolean)
    const foodPairings = foodPairingsInput.split(',').map((value) => value.trim()).filter(Boolean)

    const { error: updateError } = await supabase
      .from('bottles')
      .update({
        domaine: domaine || null,
        cuvee: cuvee || null,
        appellation: appellation || null,
        millesime: millesime ? parseInt(millesime) : null,
        couleur: couleur || null,
        country: country || null,
        region: region || null,
        grape_varieties: grapeVarieties.length > 0 ? grapeVarieties : null,
        character: character || null,
        serving_temperature: servingTemperature || null,
        typical_aromas: typicalAromas.length > 0 ? typicalAromas : null,
        food_pairings: foodPairings.length > 0 ? foodPairings : null,
        zone_id: zoneId === 'none' ? null : zoneId,
        shelf: shelf || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice.replace(',', '.')) : null,
        market_value: marketValue ? parseFloat(marketValue.replace(',', '.')) : null,
        notes: notes || null,
        volume_l: parseFloat(volumeL),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bottle.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    navigate(`/bottle/${bottle.id}`, { replace: true })
  }

  if (bottleLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
      </div>
    )
  }

  if (bottleError || !bottle) {
    return (
      <div className="flex-1 p-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {bottleError || 'Bouteille non trouvee'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-xl font-bold">Modifier la bouteille</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <input ref={frontPhotoInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoSelect('front', e)} className="hidden" />
      <input ref={frontGalleryRef} type="file" accept="image/*" onChange={(e) => handlePhotoSelect('front', e)} className="hidden" />
      <input ref={backPhotoInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoSelect('back', e)} className="hidden" />
      <input ref={backGalleryRef} type="file" accept="image/*" onChange={(e) => handlePhotoSelect('back', e)} className="hidden" />

      <Card className="mb-4 border-[var(--border-color)] shadow-[var(--shadow-sm)]">
        <CardContent className="p-2">
          <div className="flex gap-2">
            <div className="flex-1">
              {uploadingFront || removingFront ? (
                <div className="flex h-[120px] items-center justify-center rounded bg-black/10">
                  <Loader2 className="h-5 w-5 animate-spin text-wine-600" />
                </div>
              ) : showFrontPhotoOptions ? (
                <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 rounded border border-dashed border-wine-300 bg-wine-50/50">
                  <Button variant="outline" size="sm" className="h-7 w-28 text-xs" onClick={() => { setShowFrontPhotoOptions(false); frontPhotoInputRef.current?.click() }}>
                    <Camera className="mr-1 h-3 w-3" />Photo
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 w-28 text-xs" onClick={() => { setShowFrontPhotoOptions(false); frontGalleryRef.current?.click() }}>
                    <ImageIcon className="mr-1 h-3 w-3" />Galerie
                  </Button>
                  {localPhotoUrl && (
                    <Button variant="outline" size="sm" className="h-7 w-28 text-xs text-destructive" onClick={() => void handlePhotoRemove('front')}>
                      <Trash2 className="mr-1 h-3 w-3" />Supprimer
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setShowFrontPhotoOptions(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : localPhotoUrl ? (
                <div className="relative">
                  <img
                    src={localPhotoUrl}
                    alt="Etiquette avant"
                    className="max-h-[120px] w-full cursor-zoom-in rounded object-contain bg-black/20"
                    onClick={() => setZoomImage({ src: localPhotoUrl, label: 'Avant' })}
                  />
                  <button
                    className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white transition-colors hover:bg-black/70"
                    onClick={() => setShowFrontPhotoOptions(true)}
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowFrontPhotoOptions(true)}
                  className="flex h-[120px] w-full flex-col items-center justify-center gap-1 rounded border-[1.5px] border-dashed border-wine-300 bg-wine-50/30 text-wine-400 transition-colors hover:border-wine-500 hover:text-wine-600"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-[10px]">Etiquette</span>
                </button>
              )}
            </div>

            <div className="flex-1">
              {uploadingBack || removingBack ? (
                <div className="flex h-[120px] items-center justify-center rounded bg-black/10">
                  <Loader2 className="h-5 w-5 animate-spin text-wine-600" />
                </div>
              ) : showBackPhotoOptions ? (
                <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 rounded border border-dashed border-wine-300 bg-wine-50/50">
                  <Button variant="outline" size="sm" className="h-7 w-28 text-xs" onClick={() => { setShowBackPhotoOptions(false); backPhotoInputRef.current?.click() }}>
                    <Camera className="mr-1 h-3 w-3" />Photo
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 w-28 text-xs" onClick={() => { setShowBackPhotoOptions(false); backGalleryRef.current?.click() }}>
                    <ImageIcon className="mr-1 h-3 w-3" />Galerie
                  </Button>
                  {localPhotoUrlBack && (
                    <Button variant="outline" size="sm" className="h-7 w-28 text-xs text-destructive" onClick={() => void handlePhotoRemove('back')}>
                      <Trash2 className="mr-1 h-3 w-3" />Supprimer
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setShowBackPhotoOptions(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : localPhotoUrlBack ? (
                <div className="relative">
                  <img
                    src={localPhotoUrlBack}
                    alt="Etiquette arriere"
                    className="max-h-[120px] w-full cursor-zoom-in rounded object-contain bg-black/20"
                    onClick={() => setZoomImage({ src: localPhotoUrlBack, label: 'Arriere' })}
                  />
                  <button
                    className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white transition-colors hover:bg-black/70"
                    onClick={() => setShowBackPhotoOptions(true)}
                  >
                    Changer
                  </button>
                </div>
              ) : localPhotoUrl ? (
                <button
                  onClick={() => setShowBackPhotoOptions(true)}
                  className="flex h-[120px] w-full flex-col items-center justify-center gap-1 rounded border-[1.5px] border-dashed border-wine-300 bg-wine-50/30 text-wine-400 transition-colors hover:border-wine-500 hover:text-wine-600"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px]">Contre-etiquette</span>
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <SectionCard title="Identite du vin">
          <div>
            <Label htmlFor="domaine">Domaine / Producteur</Label>
            <Autocomplete
              id="domaine"
              value={domaine}
              onChange={setDomaine}
              suggestions={domainesSuggestions}
              placeholder="ex: Chartogne Taillet"
            />
          </div>

          <div>
            <Label htmlFor="cuvee">Cuvee</Label>
            <Input
              id="cuvee"
              value={cuvee}
              onChange={(e) => setCuvee(e.target.value)}
              placeholder="ex: Orizeaux"
            />
          </div>

          <div>
            <Label htmlFor="appellation">Appellation</Label>
            <Autocomplete
              id="appellation"
              value={appellation}
              onChange={setAppellation}
              suggestions={appellationsSuggestions}
              placeholder="ex: Margaux"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="millesime">Millesime</Label>
              <Input
                id="millesime"
                inputMode="numeric"
                pattern="[0-9]*"
                value={millesime}
                onChange={handleMillesimeChange}
                placeholder="ex: 2020"
                maxLength={4}
              />
            </div>

            <div>
              <Label htmlFor="couleur">Couleur</Label>
              <Select value={couleur} onValueChange={(v) => setCouleur(v as WineColor)}>
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
            <Label htmlFor="grape-varieties">Cepages</Label>
            <Input
              id="grape-varieties"
              value={grapeVarietiesInput}
              onChange={(e) => setGrapeVarietiesInput(e.target.value)}
              placeholder="ex: Cabernet Sauvignon, Merlot"
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Separez les cepages par des virgules.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="ex: Bordeaux"
              />
            </div>

            <div>
              <Label htmlFor="country">Pays</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="ex: France"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="volume">Volume</Label>
            <Select value={volumeL} onValueChange={(v) => setVolumeL(v as BottleVolumeOption)}>
              <SelectTrigger id="volume">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOTTLE_VOLUMES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SectionCard>

        <SectionCard title="Reperes">
          <div>
            <Label htmlFor="character">Reperes</Label>
            <Textarea
              id="character"
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              placeholder="Lecture du vin par Celestin..."
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="servingTemperature">Temperature de service</Label>
            <Input
              id="servingTemperature"
              value={servingTemperature}
              onChange={(e) => setServingTemperature(e.target.value)}
              placeholder="ex: 16-17C"
            />
          </div>

          <div>
            <Label htmlFor="typicalAromas">Aromatique</Label>
            <Textarea
              id="typicalAromas"
              value={typicalAromasInput}
              onChange={(e) => setTypicalAromasInput(e.target.value)}
              placeholder="ex: cassis, violette, graphite"
              rows={3}
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Separez les aromes par des virgules.
            </p>
          </div>

          <div>
            <Label htmlFor="foodPairings">Accords</Label>
            <Textarea
              id="foodPairings"
              value={foodPairingsInput}
              onChange={(e) => setFoodPairingsInput(e.target.value)}
              placeholder="ex: canard roti, boeuf en croute"
              rows={3}
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Separez les accords par des virgules.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Gestion de cave">
          <div>
            <Label htmlFor="zone">Zone de stockage</Label>
            <Select value={zoneId} onValueChange={setZoneId} disabled={zonesLoading}>
              <SelectTrigger id="zone">
                <SelectValue placeholder="Choisir une zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune zone</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="shelf">Etagere / Emplacement</Label>
            <div id="shelf" className="mt-1">
              <StoragePositionPicker
                zoneId={zoneId === 'none' ? '' : zoneId}
                zone={zones.find((z) => z.id === zoneId)}
                value={shelf}
                onChange={setShelf}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Prix d'achat (EUR)</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="ex: 12.50"
              />
            </div>

            <div>
              <Label htmlFor="marketValue">Valeur marchande (EUR)</Label>
              <Input
                id="marketValue"
                inputMode="decimal"
                value={marketValue}
                onChange={(e) => setMarketValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="ex: 25.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes personnelles sur cette bouteille..."
              rows={3}
            />
          </div>
        </SectionCard>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>
            Annuler
          </Button>
          <Button
            className="flex-1 bg-wine-900 hover:bg-wine-800"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

      <Dialog open={!!zoomImage} onOpenChange={(open) => !open && setZoomImage(null)}>
        <DialogContent
          className="max-w-[calc(100%-1rem)] p-2 sm:max-w-3xl"
          showCloseButton={false}
        >
          <div className="flex flex-col gap-2">
            <img
              src={zoomImage?.src}
              alt={zoomImage?.label ? `Photo ${zoomImage.label}` : 'Photo'}
              className="max-h-[80vh] w-full rounded-md bg-black/80 object-contain"
            />
            {zoomImage?.label && (
              <p className="text-center text-xs text-muted-foreground">{zoomImage.label}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
