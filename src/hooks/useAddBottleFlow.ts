import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { BatchItemData } from '@/components/BatchItemForm'
import { ENABLE_MULTI_BOTTLE_SCAN } from '@/lib/featureFlags'
import { useZones } from '@/hooks/useZones'
import { useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { normalizeWineColor, type BottleVolumeOption, type WineColor, type WineExtraction } from '@/lib/types'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import { MULTI_BOTTLE_IMAGE_MAX_SIZE } from '@/lib/image'
import { track } from '@/lib/track'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { saveBatchCellarBottle, saveSingleCellarBottle } from '@/lib/addBottlePersistence'
import {
  MAX_ADD_BOTTLE_BATCH_SIZE,
  buildRawExtractionFromPrefill,
  createPendingBatchItem,
  findNextEditableBatchIndex,
  hasWinePrefill,
  toAddBottleBatchProgressItems,
  toBatchItemData,
  type AddBottleLocationState,
  type AddBottleStep,
} from '@/lib/addBottleFlow'

export function useAddBottleFlow() {
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const hasPrefill = hasWinePrefill(prefillExtraction)

  const [step, setStep] = useState<AddBottleStep>(hasPrefill || !!prefillPhotoFile ? 'confirm' : 'capture')
  const [photoFile, setPhotoFile] = useState<File | null>(prefillPhotoFile)
  const [photoPreview, setPhotoPreview] = useState<string | null>(() => (prefillPhotoFile ? URL.createObjectURL(prefillPhotoFile) : null))
  const [photoFileBack, setPhotoFileBack] = useState<File | null>(null)
  const [photoPreviewBack, setPhotoPreviewBack] = useState<string | null>(null)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [domaine, setDomaine] = useState(prefillExtraction?.domaine || '')
  const [cuvee, setCuvee] = useState(prefillExtraction?.cuvee || '')
  const [appellation, setAppellation] = useState(prefillExtraction?.appellation || '')
  const [millesime, setMillesime] = useState(prefillExtraction?.millesime ? String(prefillExtraction.millesime) : '')
  const [couleur, setCouleur] = useState<WineColor | ''>(normalizeWineColor(prefillExtraction?.couleur || null) || '')
  const [country, setCountry] = useState(prefillExtraction?.country || '')
  const [region, setRegion] = useState(prefillExtraction?.region || '')
  const [zoneId, setZoneId] = useState('')
  const [shelf, setShelf] = useState('')
  const [purchasePrice, setPurchasePrice] = useState(prefillExtraction?.purchase_price ? String(prefillExtraction.purchase_price) : '')
  const [quantity, setQuantity] = useState(prefillQuantity ?? 1)
  const [volumeL, setVolumeL] = useState<BottleVolumeOption>(prefillVolume ?? '0.75')
  const [rawExtraction, setRawExtraction] = useState<WineExtraction | null>(
    prefillExtraction ? buildRawExtractionFromPrefill(prefillExtraction) : null,
  )

  const [batchItems, setBatchItems] = useState<BatchItemData[]>([])
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [batchExtractionIndex, setBatchExtractionIndex] = useState(0)
  const batchInitRef = useRef(false)

  useEffect(() => {
    if (!prefillExtraction?.zone_name || zones.length === 0 || zoneId) return
    const match = zones.find((zone) => zone.name.toLowerCase() === prefillExtraction.zone_name!.toLowerCase())
    if (!match) return

    const timer = window.setTimeout(() => {
      setZoneId(match.id)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [prefillExtraction?.zone_name, zones, zoneId])

  async function extractBatchSequentially(items: BatchItemData[]) {
    const updatedItems = [...items]

    for (let index = 0; index < updatedItems.length; index++) {
      setBatchExtractionIndex(index)
      updatedItems[index] = { ...updatedItems[index], extractionStatus: 'extracting' }
      setBatchItems([...updatedItems])

      try {
        const parsed = await extractWineFromFile(updatedItems[index].photoFile!)
        const extraction = parsed.bottles[0]

        updatedItems[index] = {
          ...updatedItems[index],
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
        console.error(`Extraction error for item ${index}:`, err)
        updatedItems[index] = {
          ...updatedItems[index],
          extractionStatus: 'error',
          extractionError: 'Échec de l\'extraction. Saisissez manuellement.',
        }
      }

      setBatchItems([...updatedItems])
    }

    setStep('batch-confirm')
  }

  useEffect(() => {
    if (!prefillBatchExtractions || prefillBatchExtractions.length === 0 || batchInitRef.current) return
    batchInitRef.current = true

    const items = prefillBatchExtractions
      .slice(0, MAX_ADD_BOTTLE_BATCH_SIZE)
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

  useEffect(() => {
    if (!prefillBatchFiles || prefillBatchFiles.length === 0 || batchInitRef.current) return
    batchInitRef.current = true

    const selectedFiles = prefillBatchFiles.slice(0, MAX_ADD_BOTTLE_BATCH_SIZE)
    const items: BatchItemData[] = selectedFiles.map(createPendingBatchItem)

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

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
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

  const handleBatchFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (files.length === 1) {
      await handleFileSelect(event)
      return
    }

    const selectedFiles = Array.from(files).slice(0, MAX_ADD_BOTTLE_BATCH_SIZE)
    const items: BatchItemData[] = selectedFiles.map(createPendingBatchItem)

    setBatchItems(items)
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
    setError(null)
    track('scan_batch', { count: selectedFiles.length })
    setStep('batch-extracting')
    await extractBatchSequentially(items)
  }

  const handleBackPhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPhotoFileBack(file)
    setPhotoPreviewBack(URL.createObjectURL(file))

    if (!domaine || !appellation || !millesime) {
      setStep('extracting')
      try {
        const extraction = (await extractWineFromFile(file)).bottles[0]
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
    const updatedItems = [...batchItems]
    updatedItems[currentBatchIndex] = {
      ...currentItem,
      photoFileBack: file,
      photoPreviewBack: preview,
    }
    setBatchItems(updatedItems)

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
      await saveSingleCellarBottle({
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
        photoFile,
        photoFileBack,
        rawExtraction,
        quantity,
        volumeL,
      })
      track('bottle_added', { couleur: couleur || null, has_photo: !!photoFile })
      triggerProfileRecompute()
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
      await saveBatchCellarBottle(item)
      track('bottle_added', { couleur: item.couleur || null, has_photo: true, quantity: item.quantity })

      const updatedItems = [...batchItems]
      updatedItems[currentBatchIndex] = { ...updatedItems[currentBatchIndex], saved: true, skipped: false }
      setBatchItems(updatedItems)

      const nextUnsaved = findNextEditableBatchIndex(updatedItems, currentBatchIndex)
      if (nextUnsaved !== null) {
        setCurrentBatchIndex(nextUnsaved)
        setStep('batch-confirm')
      } else {
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

    const nextIndex = findNextEditableBatchIndex(updatedItems, currentBatchIndex)
    if (nextIndex !== null) {
      setCurrentBatchIndex(nextIndex)
      return
    }

    handleReset()
  }

  function handleReset() {
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
    setBatchItems([])
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
  }

  useEffect(() => {
    if (!zoneId && zones.length === 1) {
      const timer = window.setTimeout(() => {
        setZoneId(zones[0].id)
      }, 0)

      return () => window.clearTimeout(timer)
    }
  }, [zoneId, zones])

  return {
    fileInputRef,
    fileInputBatchRef,
    fileInputBackRef,
    step,
    setStep,
    error,
    photoPreview,
    photoPreviewBack,
    zoomImage,
    setZoomImage,
    domaine,
    setDomaine,
    cuvee,
    setCuvee,
    appellation,
    setAppellation,
    millesime,
    setMillesime,
    couleur,
    setCouleur,
    country,
    setCountry,
    region,
    setRegion,
    zoneId,
    setZoneId,
    zones,
    zonesLoading,
    shelf,
    setShelf,
    purchasePrice,
    setPurchasePrice,
    quantity,
    setQuantity,
    volumeL,
    setVolumeL,
    rawExtraction,
    batchItems,
    currentBatchIndex,
    setCurrentBatchIndex,
    batchExtractionIndex,
    batchProgressItems: toAddBottleBatchProgressItems(batchItems),
    domainesSuggestions,
    appellationsSuggestions,
    handleFileSelect,
    handleBatchFileSelect,
    handleBackPhotoSelect,
    handleBatchBackPhotoSelect,
    handleBatchItemUpdate,
    handleSave,
    handleBatchSaveCurrentItem,
    handleBatchSkipCurrentItem,
    handleReset,
  }
}
