import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
import { BatchProgress, type BatchProgressItem } from '@/components/BatchProgress'
import { useSwipeable } from 'react-swipeable'
import { BatchItemForm, type BatchItemData } from '@/components/BatchItemForm'
import { StoragePositionPicker } from '@/components/StoragePositionPicker'
import { PhotoPreviewCard } from '@/components/PhotoPreviewCard'
import { WineFormFields } from '@/components/WineFormFields'
import { QuantitySelector } from '@/components/QuantitySelector'
import { ENABLE_MULTI_BOTTLE_SCAN } from '@/lib/featureFlags'
import { useZones } from '@/hooks/useZones'
import { useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { normalizeWineColor, type BottleVolumeOption, type WineColor, type WineExtraction, type Zone } from '@/lib/types'
import { buildCellarBottleInsert, insertBottle } from '@/lib/bottleWrites'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import { MULTI_BOTTLE_IMAGE_MAX_SIZE } from '@/lib/image'
import { track } from '@/lib/track'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { uploadPhoto } from '@/lib/uploadPhoto'
import { enrichWineAndUpdate } from '@/lib/enrichWine'

type Step = 'capture' | 'extracting' | 'confirm' | 'saving' | 'batch-extracting' | 'batch-confirm'

const MAX_BATCH_SIZE = 12

interface AddBottleLocationState {
  prefillExtraction?: Partial<WineExtraction> | null
  prefillPhotoFile?: File | null
  prefillBatchFiles?: File[] | null
  prefillBatchExtractions?: Partial<WineExtraction>[] | null
  prefillQuantity?: number
  prefillVolume?: BottleVolumeOption
}

function toBatchItemData(file: File | null, extraction: Partial<WineExtraction>, index: number): BatchItemData {
  return {
    id: `batch-${Date.now()}-${index}`,
    photoFile: file,
    photoPreview: file ? URL.createObjectURL(file) : null,
    photoFileBack: null,
    photoPreviewBack: null,
    extractionStatus: 'extracted',
    domaine: extraction.domaine || '',
    cuvee: extraction.cuvee || '',
    appellation: extraction.appellation || '',
    millesime: extraction.millesime ? String(extraction.millesime) : '',
    couleur: normalizeWineColor(extraction.couleur || null) || '',
    country: extraction.country || '',
    region: extraction.region || '',
    zoneId: '',
    shelf: '',
    purchasePrice: extraction.purchase_price ? String(extraction.purchase_price) : '',
    quantity: (extraction as Record<string, unknown>).quantity as number ?? 1,
    volumeL: ((extraction as Record<string, unknown>).volume as BottleVolumeOption) || '0.75',
    rawExtraction: {
      domaine: extraction.domaine || null,
      cuvee: extraction.cuvee || null,
      appellation: extraction.appellation || null,
      millesime: extraction.millesime || null,
      couleur: normalizeWineColor(extraction.couleur || null),
      country: extraction.country || null,
      region: extraction.region || null,
      cepage: extraction.cepage || null,
      confidence: extraction.confidence ?? 0,
      grape_varieties: extraction.grape_varieties || null,
      serving_temperature: extraction.serving_temperature || null,
      typical_aromas: extraction.typical_aromas || null,
      food_pairings: extraction.food_pairings || null,
      character: extraction.character || null,
    } as WineExtraction,
    skipped: false,
  }
}

function createUploadStamp(): string {
  return String(Date.now())
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

  const locationState = location.state as AddBottleLocationState | null
  const prefillExtraction = locationState?.prefillExtraction ?? null
  const prefillPhotoFile = locationState?.prefillPhotoFile ?? null
  const prefillBatchFiles = locationState?.prefillBatchFiles ?? null
  const prefillBatchExtractions = locationState?.prefillBatchExtractions ?? null
  const prefillQuantity = locationState?.prefillQuantity ?? undefined
  const prefillVolume = locationState?.prefillVolume ?? undefined
  const hasPrefill = !!(
    prefillExtraction?.domaine ||
    prefillExtraction?.cuvee ||
    prefillExtraction?.appellation ||
    prefillExtraction?.millesime ||
    prefillExtraction?.couleur
  )

  const [step, setStep] = useState<Step>(hasPrefill || !!prefillPhotoFile ? 'confirm' : 'capture')
  const [photoFile, setPhotoFile] = useState<File | null>(prefillPhotoFile)
  const [photoPreview, setPhotoPreview] = useState<string | null>(() => (prefillPhotoFile ? URL.createObjectURL(prefillPhotoFile) : null))
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
  const [country, setCountry] = useState(prefillExtraction?.country || '')
  const [region, setRegion] = useState(prefillExtraction?.region || '')
  const [zoneId, setZoneId] = useState('')
  const [shelf, setShelf] = useState('')

  // Match zone_name from Celestin conversational entry to actual zone ID
  useEffect(() => {
    if (!prefillExtraction?.zone_name || zones.length === 0 || zoneId) return
    const match = zones.find(z => z.name.toLowerCase() === prefillExtraction.zone_name!.toLowerCase())
    if (!match) return

    const timer = window.setTimeout(() => {
      setZoneId(match.id)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [prefillExtraction?.zone_name, zones, zoneId])
  const [purchasePrice, setPurchasePrice] = useState(prefillExtraction?.purchase_price ? String(prefillExtraction.purchase_price) : '')
  const [quantity, setQuantity] = useState(prefillQuantity ?? 1)
  const [volumeL, setVolumeL] = useState<BottleVolumeOption>(prefillVolume ?? '0.75')
  const [rawExtraction, setRawExtraction] = useState<WineExtraction | null>(
    prefillExtraction
      ? {
          domaine: prefillExtraction.domaine || null,
          cuvee: prefillExtraction.cuvee || null,
          appellation: prefillExtraction.appellation || null,
          millesime: prefillExtraction.millesime || null,
          couleur: normalizeWineColor(prefillExtraction.couleur || null),
          country: prefillExtraction.country || null,
          region: prefillExtraction.region || null,
          cepage: prefillExtraction.cepage || null,
          confidence: 0,
          grape_varieties: prefillExtraction.grape_varieties || null,
          serving_temperature: prefillExtraction.serving_temperature || null,
          typical_aromas: prefillExtraction.typical_aromas || null,
          food_pairings: prefillExtraction.food_pairings || null,
          character: prefillExtraction.character || null,
        }
      : null,
  )

  // Batch mode state
  const [batchItems, setBatchItems] = useState<BatchItemData[]>([])
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [batchExtractionIndex, setBatchExtractionIndex] = useState(0)
  const batchInitRef = useRef(false)

  async function extractBatchSequentially(items: BatchItemData[]) {
    const updatedItems = [...items]

    for (let i = 0; i < updatedItems.length; i++) {
      setBatchExtractionIndex(i)

      // Update status to extracting
      updatedItems[i] = { ...updatedItems[i], extractionStatus: 'extracting' }
      setBatchItems([...updatedItems])

      try {
        const parsed = await extractWineFromFile(updatedItems[i].photoFile!)
        const extraction = parsed.bottles[0]

        updatedItems[i] = {
          ...updatedItems[i],
          extractionStatus: 'extracted',
          domaine: extraction.domaine || '',
          cuvee: extraction.cuvee || '',
          appellation: extraction.appellation || '',
          millesime: extraction.millesime?.toString() || '',
          couleur: normalizeWineColor(extraction.couleur) || '',
          country: extraction.country || '',
          region: extraction.region || '',
          rawExtraction: extraction,
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

  useEffect(() => {
    if (!prefillBatchExtractions || prefillBatchExtractions.length === 0 || batchInitRef.current) return
    batchInitRef.current = true

    const items = prefillBatchExtractions
      .slice(0, MAX_BATCH_SIZE)
      .map((extraction, index) => toBatchItemData(prefillPhotoFile ?? null, extraction, index))

    const timer = window.setTimeout(() => {
      setBatchItems(items)
      setCurrentBatchIndex(0)
      setBatchExtractionIndex(0)
      setError(null)
      setStep('batch-confirm')
    }, 0)

    return () => window.clearTimeout(timer)
  }, [prefillBatchExtractions, prefillPhotoFile])

  // Auto-start batch when arriving from Scanner with multiple files
  useEffect(() => {
    if (!prefillBatchFiles || prefillBatchFiles.length === 0 || batchInitRef.current) return
    batchInitRef.current = true

    const selectedFiles = prefillBatchFiles.slice(0, MAX_BATCH_SIZE)

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
      country: '',
      region: '',
      zoneId: '',
      shelf: '',
      purchasePrice: '',
      quantity: 1,
      volumeL: '0.75' as const,
      rawExtraction: null,
      skipped: false,
    }))

    const timer = window.setTimeout(() => {
      setBatchItems(items)
      setCurrentBatchIndex(0)
      setBatchExtractionIndex(0)
      setError(null)
      track('scan_batch', { count: selectedFiles.length })
      setStep('batch-extracting')
      void extractBatchSequentially(items)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [prefillBatchFiles])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
    setStep('extracting')

    try {
      const parsed = await extractWineFromFile(file, {
        retryMultiBottleMaxSize: ENABLE_MULTI_BOTTLE_SCAN ? MULTI_BOTTLE_IMAGE_MAX_SIZE : undefined,
      })

      if (ENABLE_MULTI_BOTTLE_SCAN && parsed.kind === 'multi_bottle') {
        const items = parsed.bottles.map((extraction, index) => toBatchItemData(file, extraction, index))
        setBatchItems(items)
        setCurrentBatchIndex(0)
        setBatchExtractionIndex(0)
        setRawExtraction(null)
        track('scan_multi_from_single_photo', { count: parsed.bottles.length })
        setStep('batch-confirm')
        return
      }

      const extraction = parsed.bottles[0]

      // Pre-fill form with extracted data
      setRawExtraction(extraction)
      setDomaine(extraction.domaine || '')
      setCuvee(extraction.cuvee || '')
      setAppellation(extraction.appellation || '')
      setMillesime(extraction.millesime?.toString() || '')
      setCouleur(normalizeWineColor(extraction.couleur) || '')
      setCountry(extraction.country || '')
      setRegion(extraction.region || '')
      track('scan_single', { provider: 'extract-wine' })
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

    // If only 1 photo selected, reuse single mode
    if (files.length === 1) {
      await handleFileSelect(e)
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
      country: '',
      region: '',
      zoneId: '',
      shelf: '',
      purchasePrice: '',
      quantity: 1,
      volumeL: '0.75' as const,
      rawExtraction: null,
      skipped: false,
    }))

    setBatchItems(items)
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
    setError(null)
    track('scan_batch', { count: selectedFiles.length })
    setStep('batch-extracting')

    // Start sequential extraction
    await extractBatchSequentially(items)
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
        const extraction = (await extractWineFromFile(file)).bottles[0]
        // Only fill in missing fields
        if (!domaine && extraction.domaine) setDomaine(extraction.domaine)
        if (!cuvee && extraction.cuvee) setCuvee(extraction.cuvee)
        if (!appellation && extraction.appellation) setAppellation(extraction.appellation)
        if (!millesime && extraction.millesime) setMillesime(extraction.millesime.toString())
        if (!couleur && extraction.couleur) setCouleur(normalizeWineColor(extraction.couleur) || '')
        if (!country && extraction.country) setCountry(extraction.country)
        if (!region && extraction.region) setRegion(extraction.region)
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
        const extraction = (await extractWineFromFile(file)).bottles[0]
        const updates: Partial<BatchItemData> = {}
        if (!currentItem.domaine && extraction.domaine) updates.domaine = extraction.domaine
        if (!currentItem.cuvee && extraction.cuvee) updates.cuvee = extraction.cuvee
        if (!currentItem.appellation && extraction.appellation) updates.appellation = extraction.appellation
        if (!currentItem.millesime && extraction.millesime) updates.millesime = extraction.millesime.toString()
        if (!currentItem.couleur && extraction.couleur) updates.couleur = normalizeWineColor(extraction.couleur) || ''
        if (!currentItem.country && extraction.country) updates.country = extraction.country
        if (!currentItem.region && extraction.region) updates.region = extraction.region
        if (Object.keys(updates).length > 0) {
          updatedItems[currentBatchIndex] = {
            ...updatedItems[currentBatchIndex],
            ...updates,
          }
          setBatchItems([...updatedItems])
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
      const timestamp = createUploadStamp()
      const photoUrl = photoFile ? await uploadPhoto(photoFile, `${timestamp}-front.jpg`) : null
      const photoUrlBack = photoFileBack ? await uploadPhoto(photoFileBack, `${timestamp}-back.jpg`) : null

      const bottleData = buildCellarBottleInsert({
        domaine,
        cuvee,
        appellation,
        millesime,
        couleur,
        country,
        region,
        zoneId,
        shelf,
        purchasePrice,
        photoUrl,
        photoUrlBack,
        rawExtraction,
        quantity,
        volumeL,
      })

      // Keep acquisitions as separate lots; no automatic merge.
      await insertBottle(bottleData)

      track('bottle_added', { couleur: couleur || null, has_photo: !!photoFile })
      triggerProfileRecompute()

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
      const timestamp = createUploadStamp()
      const photoUrl = item.photoFile ? await uploadPhoto(item.photoFile, `${timestamp}-${item.id}-front.jpg`) : null
      const photoUrlBack = item.photoFileBack
        ? await uploadPhoto(item.photoFileBack, `${timestamp}-${item.id}-back.jpg`)
        : null

      const bottleData = buildCellarBottleInsert({
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
        rawExtraction: item.rawExtraction as WineExtraction | null,
        quantity: item.quantity,
        volumeL: item.volumeL,
      })

      // Keep acquisitions as separate lots; no automatic merge.
      const { id: bottleId } = await insertBottle(bottleData)

      track('bottle_added', { couleur: item.couleur || null, has_photo: true, quantity: item.quantity })

      // If enrichment fields are missing (multi-bottle extraction), enrich async
      const raw = item.rawExtraction as WineExtraction | null
      if (raw && !raw.character && !raw.typical_aromas?.length) {
        enrichWineAndUpdate(bottleId, {
          domaine: item.domaine,
          cuvee: item.cuvee,
          appellation: item.appellation,
          millesime: item.millesime,
          couleur: item.couleur,
        })
      }

      // Mark current item as saved
      const updatedItems = [...batchItems]
      updatedItems[currentBatchIndex] = { ...updatedItems[currentBatchIndex], saved: true, skipped: false }
      setBatchItems(updatedItems)

      // Find next unsaved item, or finish
      const nextUnsaved = updatedItems.findIndex((it, i) => i !== currentBatchIndex && !it.saved && !it.skipped)
      if (nextUnsaved !== -1) {
        setCurrentBatchIndex(nextUnsaved)
        setStep('batch-confirm')
      } else {
        // All items saved
        triggerProfileRecompute()
        handleReset()
      }
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
      setStep('batch-confirm')
    }
  }

  const handleBatchSkipCurrentItem = () => {
    const updatedItems = [...batchItems]
    updatedItems[currentBatchIndex] = {
      ...updatedItems[currentBatchIndex],
      skipped: true,
    }
    setBatchItems(updatedItems)

    const nextAfterCurrent = updatedItems.findIndex((it, i) => i > currentBatchIndex && !it.saved && !it.skipped)
    if (nextAfterCurrent !== -1) {
      setCurrentBatchIndex(nextAfterCurrent)
      return
    }

    const nextBeforeCurrent = updatedItems.findIndex((it, i) => i < currentBatchIndex && !it.saved && !it.skipped)
    if (nextBeforeCurrent !== -1) {
      setCurrentBatchIndex(nextBeforeCurrent)
      return
    }

    // All items saved or skipped, finish
    handleReset()
  }

  const handleReset = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    if (photoPreviewBack) URL.revokeObjectURL(photoPreviewBack)
    batchItems.forEach((item) => {
      if (item.photoPreview) URL.revokeObjectURL(item.photoPreview)
      if (item.photoPreviewBack) URL.revokeObjectURL(item.photoPreviewBack)
    })

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
    setCountry('')
    setRegion('')
    setZoneId('')
    setShelf('')
    setPurchasePrice('')
    setQuantity(1)
    setVolumeL('0.75')
    setRawExtraction(null)
    setError(null)
    // Reset batch state
    setBatchItems([])
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
  }

  // Build batch progress items for display
  const batchProgressItems: BatchProgressItem[] = batchItems.map((item) => ({
    id: item.id,
    photoPreview: item.photoPreview,
    status: item.extractionStatus,
    error: item.extractionError,
    domaine: item.domaine,
    appellation: item.appellation,
  }))

  useEffect(() => {
    if (!zoneId && zones.length === 1) {
      const timer = window.setTimeout(() => {
        setZoneId(zones[0].id)
      }, 0)

      return () => window.clearTimeout(timer)
    }
  }, [zoneId, zones])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 pb-28">
      {/* Page Header */}
      <div className="mb-4">
        <p className="brand-text">Celestin</p>
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
          <PhotoPreviewCard
            photoPreview={photoPreview}
            photoPreviewBack={photoPreviewBack}
            onZoom={(src, label) => setZoomImage({ src, label })}
          />

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
            <WineFormFields
              domaine={domaine}
              cuvee={cuvee}
              appellation={appellation}
              millesime={millesime}
              couleur={couleur}
              country={country}
              region={region}
              onDomaineChange={setDomaine}
              onCuveeChange={setCuvee}
              onAppellationChange={setAppellation}
              onMillesimeChange={setMillesime}
              onCouleurChange={setCouleur}
              onCountryChange={setCountry}
              onRegionChange={setRegion}
              volumeL={volumeL}
              onVolumeChange={setVolumeL}
              domainesSuggestions={domainesSuggestions}
              appellationsSuggestions={appellationsSuggestions}
            />

            <QuantitySelector value={quantity} onChange={setQuantity} />

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
              <div id="shelf" className="mt-1">
                <StoragePositionPicker
                  zoneId={zoneId}
                  zone={zones.find((z) => z.id === zoneId)}
                  value={shelf}
                  onChange={setShelf}
                />
              </div>
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

          {/* Enriched tasting guide */}
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
                  {rawExtraction.typical_aromas.map((a, i) => (
                    <span key={i} className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{a}</span>
                  ))}
                </div>
              )}
              {rawExtraction.character && (
                <p className="text-[12px] italic text-[var(--text-secondary)] leading-relaxed">{rawExtraction.character}</p>
              )}
              {rawExtraction.food_pairings && rawExtraction.food_pairings.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[11px] text-[var(--text-muted)] mr-1">Accords :</span>
                  {rawExtraction.food_pairings.map((f, i) => (
                    <span key={i} className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{f}</span>
                  ))}
                </div>
              )}
            </div>
          )}

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
        <BatchConfirmSwipeable
          currentBatchIndex={currentBatchIndex}
          batchItems={batchItems}
          zones={zones}
          zonesLoading={zonesLoading}
          domainesSuggestions={domainesSuggestions}
          appellationsSuggestions={appellationsSuggestions}
          onUpdate={handleBatchItemUpdate}
          onNavigate={setCurrentBatchIndex}
          onBackPhotoSelect={handleBatchBackPhotoSelect}
          onZoomImage={(src, label) => setZoomImage({ src, label })}
          onSkip={handleBatchSkipCurrentItem}
          onSave={handleBatchSaveCurrentItem}
        />
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

function BatchConfirmSwipeable({
  currentBatchIndex,
  batchItems,
  zones,
  zonesLoading,
  domainesSuggestions,
  appellationsSuggestions,
  onUpdate,
  onNavigate,
  onBackPhotoSelect,
  onZoomImage,
  onSkip,
  onSave,
}: {
  currentBatchIndex: number
  batchItems: BatchItemData[]
  zones: Zone[]
  zonesLoading: boolean
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
  onUpdate: (updates: Partial<BatchItemData>) => void
  onNavigate: (index: number) => void
  onBackPhotoSelect: (file: File) => void
  onZoomImage: (src: string, label?: string) => void
  onSkip: () => void
  onSave: () => void
}) {
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (currentBatchIndex < batchItems.length - 1) onNavigate(currentBatchIndex + 1)
    },
    onSwipedRight: () => {
      if (currentBatchIndex > 0) onNavigate(currentBatchIndex - 1)
    },
    preventScrollOnSwipe: false,
    trackTouch: true,
    delta: 40,
  })

  const unsavedCount = batchItems.filter(it => !it.saved && !it.skipped).length

  return (
    <div {...swipeHandlers} className="mt-6 space-y-4">
      <div className="text-center mb-4">
        <p className="text-lg font-semibold text-[var(--text-primary)]">
          {unsavedCount} bouteille{unsavedCount > 1 ? 's' : ''} restante{unsavedCount > 1 ? 's' : ''}
        </p>
      </div>

      <BatchItemForm
        item={batchItems[currentBatchIndex]}
        currentIndex={currentBatchIndex}
        totalItems={batchItems.length}
        allItems={batchItems}
        zones={zones}
        zonesLoading={zonesLoading}
        domainesSuggestions={domainesSuggestions}
        appellationsSuggestions={appellationsSuggestions}
        onUpdate={onUpdate}
        onNavigate={onNavigate}
        onBackPhotoSelect={onBackPhotoSelect}
        onZoomImage={onZoomImage}
      />

      <div className="flex gap-3 pt-4">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          <X className="mr-2 h-4 w-4" />
          {unsavedCount > 1 ? 'Passer' : 'Terminer'}
        </Button>
        {batchItems[currentBatchIndex].saved ? (
          <Button
            variant="outline"
            className="flex-1 border-green-500 text-green-600"
            disabled
          >
            <Check className="mr-2 h-4 w-4" />
            Deja enregistree
          </Button>
        ) : batchItems[currentBatchIndex].skipped ? (
          <Button
            variant="outline"
            className="flex-1 border-[var(--text-muted)] text-[var(--text-muted)]"
            disabled
          >
            <X className="mr-2 h-4 w-4" />
            Ignoree
          </Button>
        ) : (
          <Button
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            onClick={onSave}
          >
            <Check className="mr-2 h-4 w-4" />
            Enregistrer
          </Button>
        )}
      </div>
    </div>
  )
}
