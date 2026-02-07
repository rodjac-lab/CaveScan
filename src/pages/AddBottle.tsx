import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Camera, Loader2, Check, X, Wine, Plus, Minus, ImageIcon } from 'lucide-react'
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Autocomplete } from '@/components/Autocomplete'
import { BatchProgress, type BatchProgressItem } from '@/components/BatchProgress'
import { BatchItemForm, type BatchItemData } from '@/components/BatchItemForm'
import { supabase } from '@/lib/supabase'
import { useZones } from '@/hooks/useZones'
import { useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { WINE_COLORS, normalizeWineColor, type WineColor, type WineExtraction } from '@/lib/types'
import { fileToBase64, resizeImage } from '@/lib/image'

type Step = 'capture' | 'extracting' | 'confirm' | 'saving' | 'batch-extracting' | 'batch-confirm'

const MAX_BATCH_SIZE = 12

interface AddBottleLocationState {
  prefillExtraction?: Partial<WineExtraction> | null
}

export default function AddBottle() {
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)
  const fileInputBatchRef = useRef<HTMLInputElement>(null)
  const fileInputBackRef = useRef<HTMLInputElement>(null)
  const { zones, loading: zonesLoading } = useZones()
  const domainesSuggestions = useDomainesSuggestions()
  const appellationsSuggestions = useAppellationsSuggestions()

  const prefillExtraction = (location.state as AddBottleLocationState | null)?.prefillExtraction ?? null
  const hasPrefill = !!(
    prefillExtraction?.domaine ||
    prefillExtraction?.cuvee ||
    prefillExtraction?.appellation ||
    prefillExtraction?.millesime ||
    prefillExtraction?.couleur
  )

  const [step, setStep] = useState<Step>(hasPrefill ? 'confirm' : 'capture')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFileBack, setPhotoFileBack] = useState<File | null>(null)
  const [photoPreviewBack, setPhotoPreviewBack] = useState<string | null>(null)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Single bottle mode state
  const [domaine, setDomaine] = useState(prefillExtraction?.domaine || '')
  const [cuvee, setCuvee] = useState(prefillExtraction?.cuvee || '')
  const [appellation, setAppellation] = useState(prefillExtraction?.appellation || '')
  const [millesime, setMillesime] = useState(prefillExtraction?.millesime ? String(prefillExtraction.millesime) : '')
  const [couleur, setCouleur] = useState<WineColor | ''>(normalizeWineColor(prefillExtraction?.couleur || null) || '')
  const [zoneId, setZoneId] = useState('')
  const [shelf, setShelf] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [rawExtraction, setRawExtraction] = useState<WineExtraction | null>(
    prefillExtraction
      ? {
          domaine: prefillExtraction.domaine || null,
          cuvee: prefillExtraction.cuvee || null,
          appellation: prefillExtraction.appellation || null,
          millesime: prefillExtraction.millesime || null,
          couleur: normalizeWineColor(prefillExtraction.couleur || null),
          region: null,
          cepage: null,
          confidence: 0,
        }
      : null,
  )

  // Batch mode state
  const [batchItems, setBatchItems] = useState<BatchItemData[]>([])
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [batchExtractionIndex, setBatchExtractionIndex] = useState(0)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
    setStep('extracting')

    try {
      const base64 = await fileToBase64(file)

      const { data, error } = await supabase.functions.invoke('extract-wine', {
        body: { image_base64: base64 },
      })

      if (error) throw error

      // Pre-fill form with extracted data
      setRawExtraction(data)
      setDomaine(data.domaine || '')
      setCuvee(data.cuvee || '')
      setAppellation(data.appellation || '')
      setMillesime(data.millesime?.toString() || '')
      setCouleur(normalizeWineColor(data.couleur) || '')
      setStep('confirm')
    } catch (err) {
      console.error('Extraction error:', err)
      setError('Échec de l\'extraction. Vous pouvez saisir manuellement.')
      setStep('confirm')
    }
  }

  const handleBatchFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // If only 1 photo selected, use single mode
    if (files.length === 1) {
      const file = files[0]
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
      setError(null)
      setStep('extracting')

      try {
        const base64 = await fileToBase64(file)
        const { data, error } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (error) throw error

        setRawExtraction(data)
        setDomaine(data.domaine || '')
        setCuvee(data.cuvee || '')
        setAppellation(data.appellation || '')
        setMillesime(data.millesime?.toString() || '')
        setCouleur(normalizeWineColor(data.couleur) || '')
        setStep('confirm')
      } catch (err) {
        console.error('Extraction error:', err)
        setError('Échec de l\'extraction. Vous pouvez saisir manuellement.')
        setStep('confirm')
      }
      return
    }

    // Multiple photos - batch mode
    const selectedFiles = Array.from(files).slice(0, MAX_BATCH_SIZE)

    const items: BatchItemData[] = selectedFiles.map((file, index) => ({
      id: `batch-${Date.now()}-${index}`,
      photoFile: file,
      photoPreview: URL.createObjectURL(file),
      photoFileBack: null,
      photoPreviewBack: null,
      extractionStatus: 'pending' as const,
      domaine: '',
      cuvee: '',
      appellation: '',
      millesime: '',
      couleur: '' as const,
      zoneId: '',
      shelf: '',
      purchasePrice: '',
      rawExtraction: null,
    }))

    setBatchItems(items)
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
    setError(null)
    setStep('batch-extracting')

    // Start sequential extraction
    await extractBatchSequentially(items)
  }

  const extractBatchSequentially = async (items: BatchItemData[]) => {
    const updatedItems = [...items]

    for (let i = 0; i < updatedItems.length; i++) {
      setBatchExtractionIndex(i)

      // Update status to extracting
      updatedItems[i] = { ...updatedItems[i], extractionStatus: 'extracting' }
      setBatchItems([...updatedItems])

      try {
        const base64 = await fileToBase64(updatedItems[i].photoFile)
        const { data, error } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (error) throw error

        updatedItems[i] = {
          ...updatedItems[i],
          extractionStatus: 'extracted',
          domaine: data.domaine || '',
          cuvee: data.cuvee || '',
          appellation: data.appellation || '',
          millesime: data.millesime?.toString() || '',
          couleur: normalizeWineColor(data.couleur) || '',
          rawExtraction: data,
        }
      } catch (err) {
        console.error(`Extraction error for item ${i}:`, err)
        updatedItems[i] = {
          ...updatedItems[i],
          extractionStatus: 'error',
          extractionError: 'Échec de l\'extraction. Saisissez manuellement.',
        }
      }

      setBatchItems([...updatedItems])
    }

    // All extractions done, move to batch confirm
    setStep('batch-confirm')
  }

  const handleBackPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoFileBack(file)
    setPhotoPreviewBack(URL.createObjectURL(file))

    // If we have incomplete data, try to extract from back label too
    if (!domaine || !appellation || !millesime) {
      setStep('extracting')
      try {
        const base64 = await fileToBase64(file)
        const { data, error } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (!error && data) {
          // Only fill in missing fields
          if (!domaine && data.domaine) setDomaine(data.domaine)
          if (!cuvee && data.cuvee) setCuvee(data.cuvee)
          if (!appellation && data.appellation) setAppellation(data.appellation)
          if (!millesime && data.millesime) setMillesime(data.millesime.toString())
          if (!couleur && data.couleur) setCouleur(normalizeWineColor(data.couleur) || '')
        }
      } catch (err) {
        console.error('Back extraction error:', err)
      }
      setStep('confirm')
    }
  }

  const handleBatchBackPhotoSelect = async (file: File) => {
    const currentItem = batchItems[currentBatchIndex]
    const preview = URL.createObjectURL(file)

    // Update current item with back photo
    const updatedItems = [...batchItems]
    updatedItems[currentBatchIndex] = {
      ...currentItem,
      photoFileBack: file,
      photoPreviewBack: preview,
    }
    setBatchItems(updatedItems)

    // If missing data, try extraction from back label
    if (!currentItem.domaine || !currentItem.appellation || !currentItem.millesime) {
      try {
        const base64 = await fileToBase64(file)
        const { data, error } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (!error && data) {
          const updates: Partial<BatchItemData> = {}
          if (!currentItem.domaine && data.domaine) updates.domaine = data.domaine
          if (!currentItem.cuvee && data.cuvee) updates.cuvee = data.cuvee
          if (!currentItem.appellation && data.appellation) updates.appellation = data.appellation
          if (!currentItem.millesime && data.millesime) updates.millesime = data.millesime.toString()
          if (!currentItem.couleur && data.couleur) updates.couleur = normalizeWineColor(data.couleur) || ''

          if (Object.keys(updates).length > 0) {
            updatedItems[currentBatchIndex] = {
              ...updatedItems[currentBatchIndex],
              ...updates,
            }
            setBatchItems([...updatedItems])
          }
        }
      } catch (err) {
        console.error('Back extraction error:', err)
      }
    }
  }

  const handleBatchItemUpdate = (updates: Partial<BatchItemData>) => {
    const updatedItems = [...batchItems]
    updatedItems[currentBatchIndex] = {
      ...updatedItems[currentBatchIndex],
      ...updates,
    }
    setBatchItems(updatedItems)
  }

  const handleSave = async () => {
    if (!domaine && !appellation) {
      setError('Veuillez renseigner au moins le domaine ou l\'appellation')
      return
    }

    setStep('saving')
    setError(null)

    try {
      let photoUrl: string | null = null
      let photoUrlBack: string | null = null
      const timestamp = Date.now()

      // Upload compressed front photo if exists
      if (photoFile) {
        const compressedBlob = await resizeImage(photoFile)
        const fileName = `${timestamp}-front.jpg`
        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('wine-labels')
          .getPublicUrl(fileName)

        photoUrl = urlData.publicUrl
      }

      // Upload compressed back photo if exists
      if (photoFileBack) {
        const compressedBlob = await resizeImage(photoFileBack)
        const fileName = `${timestamp}-back.jpg`
        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('wine-labels')
          .getPublicUrl(fileName)

        photoUrlBack = urlData.publicUrl
      }

      // Create bottle records (one per quantity)
      const bottleData = {
        domaine: domaine || null,
        cuvee: cuvee || null,
        appellation: appellation || null,
        millesime: millesime ? parseInt(millesime) : null,
        couleur: couleur || null,
        zone_id: zoneId || null,
        shelf: shelf || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice.replace(',', '.')) : null,
        photo_url: photoUrl,
        photo_url_back: photoUrlBack,
        raw_extraction: rawExtraction,
        status: 'in_stock',
      }

      // Insert multiple bottles if quantity > 1
      const bottles = Array.from({ length: quantity }, () => ({ ...bottleData }))
      const { error: insertError } = await supabase.from('bottles').insert(bottles)

      if (insertError) throw insertError

      // Success - reset form to add more bottles
      handleReset()
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
      setStep('confirm')
    }
  }

  const handleBatchSaveCurrentItem = async () => {
    const item = batchItems[currentBatchIndex]

    if (!item.domaine && !item.appellation) {
      setError('Veuillez renseigner au moins le domaine ou l\'appellation')
      return
    }

    setStep('saving')
    setError(null)

    try {
      let photoUrl: string | null = null
      let photoUrlBack: string | null = null
      const timestamp = Date.now()

      // Upload compressed front photo
      const compressedBlob = await resizeImage(item.photoFile)
      const fileName = `${timestamp}-${item.id}-front.jpg`
      const { error: uploadError } = await supabase.storage
        .from('wine-labels')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('wine-labels')
        .getPublicUrl(fileName)

      photoUrl = urlData.publicUrl

      // Upload compressed back photo if exists
      if (item.photoFileBack) {
        const compressedBlobBack = await resizeImage(item.photoFileBack)
        const fileNameBack = `${timestamp}-${item.id}-back.jpg`
        const { error: uploadErrorBack } = await supabase.storage
          .from('wine-labels')
          .upload(fileNameBack, compressedBlobBack, { contentType: 'image/jpeg' })

        if (uploadErrorBack) throw uploadErrorBack

        const { data: urlDataBack } = supabase.storage
          .from('wine-labels')
          .getPublicUrl(fileNameBack)

        photoUrlBack = urlDataBack.publicUrl
      }

      // Create bottle record
      const bottleData = {
        domaine: item.domaine || null,
        cuvee: item.cuvee || null,
        appellation: item.appellation || null,
        millesime: item.millesime ? parseInt(item.millesime) : null,
        couleur: item.couleur || null,
        zone_id: item.zoneId || null,
        shelf: item.shelf || null,
        purchase_price: item.purchasePrice ? parseFloat(item.purchasePrice.replace(',', '.')) : null,
        photo_url: photoUrl,
        photo_url_back: photoUrlBack,
        raw_extraction: item.rawExtraction,
        status: 'in_stock',
      }

      const { error: insertError } = await supabase.from('bottles').insert([bottleData])

      if (insertError) throw insertError

      // Move to next item or finish
      if (currentBatchIndex < batchItems.length - 1) {
        setCurrentBatchIndex(currentBatchIndex + 1)
        setStep('batch-confirm')
      } else {
        // All items saved, reset
        handleReset()
      }
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
      setStep('batch-confirm')
    }
  }

  const handleBatchSkipCurrentItem = () => {
    if (currentBatchIndex < batchItems.length - 1) {
      setCurrentBatchIndex(currentBatchIndex + 1)
    } else {
      // Last item, reset
      handleReset()
    }
  }

  const handleReset = () => {
    setStep('capture')
    setPhotoFile(null)
    setPhotoPreview(null)
    setPhotoFileBack(null)
    setPhotoPreviewBack(null)
    setDomaine('')
    setCuvee('')
    setAppellation('')
    setMillesime('')
    setCouleur('')
    setZoneId('')
    setShelf('')
    setPurchasePrice('')
    setQuantity(1)
    setRawExtraction(null)
    setError(null)
    // Reset batch state
    setBatchItems([])
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
  }

  function handleMillesimeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setMillesime(val)
  }

  // Build batch progress items for display
  const batchProgressItems: BatchProgressItem[] = batchItems.map((item) => ({
    id: item.id,
    photoPreview: item.photoPreview,
    status: item.extractionStatus,
    error: item.extractionError,
  }))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Page Header */}
      <div className="mb-4">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Encaver</h1>
        <p className="text-[13px] font-light text-[var(--text-secondary)]">
          Ajouter des bouteilles à votre cave
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step: Capture */}
      {step === 'capture' && (
        <div className="mt-6 space-y-4">
          <p className="text-muted-foreground">
            Prenez une photo de l'étiquette ou saisissez manuellement
          </p>

          {/* Camera input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Gallery input (single) */}
          <input
            ref={fileInputGalleryRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Batch input (multiple) */}
          <input
            ref={fileInputBatchRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleBatchFileSelect}
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

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setStep('confirm')}
          >
            <Wine className="mr-2 h-4 w-4" />
            Saisie manuelle
          </Button>
        </div>
      )}

      {/* Step: Extracting (single mode) */}
      {step === 'extracting' && (
        <div className="mt-6 flex flex-col items-center gap-4">
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Étiquette"
              className="max-h-48 rounded-lg object-contain cursor-zoom-in"
              onClick={() => setZoomImage({ src: photoPreview })}
            />
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Analyse de l'étiquette...</span>
          </div>
        </div>
      )}

      {/* Step: Batch Extracting */}
      {step === 'batch-extracting' && (
        <div className="mt-6">
          <BatchProgress items={batchProgressItems} currentIndex={batchExtractionIndex} />
        </div>
      )}

      {/* Step: Confirm (single mode) */}
      {step === 'confirm' && (
        <div className="mt-6 space-y-4">
          {/* Photo previews */}
          {(photoPreview || photoPreviewBack) && (
            <Card>
              <CardContent className="p-2">
                <div className="flex gap-2">
                  {photoPreview && (
                    <div className="flex-1">
                      <img
                        src={photoPreview}
                        alt="Étiquette avant"
                        className="max-h-28 w-full rounded object-contain cursor-zoom-in"
                        onClick={() => setZoomImage({ src: photoPreview, label: 'Avant' })}
                      />
                      <p className="text-xs text-center text-muted-foreground mt-1">Avant</p>
                    </div>
                  )}
                  {photoPreviewBack && (
                    <div className="flex-1">
                      <img
                        src={photoPreviewBack}
                        alt="Étiquette arrière"
                        className="max-h-28 w-full rounded object-contain cursor-zoom-in"
                        onClick={() => setZoomImage({ src: photoPreviewBack, label: 'Arriere' })}
                      />
                      <p className="text-xs text-center text-muted-foreground mt-1">Arrière</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add back photo button */}
          {photoPreview && !photoPreviewBack && (
            <>
              <input
                ref={fileInputBackRef}
                type="file"
                accept="image/*"
                onChange={handleBackPhotoSelect}
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
              <Label htmlFor="cuvee">Cuvée</Label>
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
                <Label htmlFor="millesime">Millésime</Label>
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

            {/* Quantity selector */}
            <div className="pt-2 border-t">
              <Label>Quantité</Label>
              <div className="flex items-center gap-3 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-xl font-semibold w-8 text-center">{quantity}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(q => Math.min(12, q + 1))}
                  disabled={quantity >= 12}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {quantity > 1 && (
                  <span className="text-sm text-muted-foreground">
                    bouteilles
                  </span>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="zone">Zone de stockage</Label>
              <Select value={zoneId} onValueChange={setZoneId} disabled={zonesLoading}>
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
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
                placeholder="ex: Étagère 1, Haut..."
              />
            </div>

            <div>
              <Label htmlFor="price">Prix d'achat (€)</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="ex: 12.50"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
              onClick={handleSave}
            >
              <Check className="mr-2 h-4 w-4" />
              {quantity > 1 ? `Ajouter ${quantity} bouteilles` : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Batch Confirm */}
      {step === 'batch-confirm' && batchItems[currentBatchIndex] && (
        <div className="mt-6 space-y-4">
          <div className="text-center mb-4">
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {batchItems.length} bouteilles à valider
            </p>
          </div>

          <BatchItemForm
            item={batchItems[currentBatchIndex]}
            currentIndex={currentBatchIndex}
            totalItems={batchItems.length}
            zones={zones}
            zonesLoading={zonesLoading}
            domainesSuggestions={domainesSuggestions}
            appellationsSuggestions={appellationsSuggestions}
            onUpdate={handleBatchItemUpdate}
            onBackPhotoSelect={handleBatchBackPhotoSelect}
            onZoomImage={(src, label) => setZoomImage({ src, label })}
          />

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={handleBatchSkipCurrentItem}>
              <X className="mr-2 h-4 w-4" />
              {currentBatchIndex < batchItems.length - 1 ? 'Passer' : 'Annuler'}
            </Button>
            <Button
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
              onClick={handleBatchSaveCurrentItem}
            >
              <Check className="mr-2 h-4 w-4" />
              {currentBatchIndex < batchItems.length - 1 ? 'Enregistrer →' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          <span className="text-muted-foreground">Enregistrement...</span>
        </div>
      )}

      <Dialog open={!!zoomImage} onOpenChange={(open) => !open && setZoomImage(null)}>
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
    </div>
  )
}
