import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSwipeable } from 'react-swipeable'
import { useAppellationsSuggestions, useBottles, useDomainesSuggestions } from '@/hooks/useBottles'
import { buildDrunkBottleInsertFromExtraction, insertBottle } from '@/lib/bottleWrites'
import { openBottle } from '@/lib/bottleActions'
import {
  getActiveBatchSession,
  setBatchSessionStatus,
  updateBatchItem,
  useBatchSession,
  type BatchItem,
} from '@/lib/batchSessionStore'
import {
  findNextUnsavedIndex,
  getBatchExtractionCurrentIndex,
  toBatchProgressItems,
  type RemoveBottleLocationState,
  type ScanResult,
  type Step,
} from '@/lib/removeBottleFlow'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { track } from '@/lib/track'
import { normalizeWineColor, type BottleWithZone, type WineExtraction } from '@/lib/types'
import { uploadPhoto } from '@/lib/uploadPhoto'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import { findMatches } from '@/lib/wineMatching'

export function useRemoveBottleFlow() {
  const navigate = useNavigate()
  const location = useLocation()
  const { bottles, loading: bottlesLoading } = useBottles()
  const batchSession = useBatchSession()
  const domainesSuggestions = useDomainesSuggestions()
  const appellationsSuggestions = useAppellationsSuggestions()

  const [step, setStep] = useState<Step>('processing')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefillHandled, setPrefillHandled] = useState(false)
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)

  useEffect(() => {
    return () => {
      if (scanResult?.photoUri) {
        URL.revokeObjectURL(scanResult.photoUri)
      }
    }
  }, [scanResult?.photoUri])

  const batchStartedRef = useRef(false)
  useEffect(() => {
    if (batchStartedRef.current) return
    if (bottlesLoading) return
    if (!batchSession || batchSession.status !== 'processing') return

    const hasUnprocessed = batchSession.items.some((item) => !item.processedAt)
    if (!hasUnprocessed) return

    batchStartedRef.current = true
    setStep('batch-extracting')
    void processBatchInBackground(batchSession.id)
  }, [batchSession, bottlesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 'batch-extracting' && batchSession?.status === 'ready') {
      setCurrentBatchIndex(0)
      setStep('batch-review')
    }
  }, [batchSession?.status, step])

  useEffect(() => {
    if (step === 'batch-review' && (!batchSession || batchSession.status === 'done')) {
      navigate('/degustations')
    }
  }, [batchSession, navigate, step])

  const activeBatchSession = useMemo(() => {
    return batchSession && batchSession.status !== 'done' ? batchSession : null
  }, [batchSession])

  const batchProgressItems = useMemo(() => toBatchProgressItems(batchSession), [batchSession])
  const batchExtractionCurrentIndex = useMemo(() => getBatchExtractionCurrentIndex(batchSession), [batchSession])

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (activeBatchSession && currentBatchIndex < activeBatchSession.items.length - 1) {
        setCurrentBatchIndex(currentBatchIndex + 1)
      }
    },
    onSwipedRight: () => {
      if (currentBatchIndex > 0) setCurrentBatchIndex(currentBatchIndex - 1)
    },
    preventScrollOnSwipe: false,
    trackTouch: true,
    delta: 40,
  })

  const goToDegustations = useCallback(() => {
    if (activeBatchSession) {
      setBatchSessionStatus(activeBatchSession.id, 'done')
    }
    navigate('/degustations')
  }, [activeBatchSession, navigate])

  const resetScanResult = useCallback(() => {
    if (scanResult?.photoUri) {
      URL.revokeObjectURL(scanResult.photoUri)
    }
    setScanResult(null)
    navigate('/degustations')
  }, [navigate, scanResult?.photoUri])

  const processSingleFile = useCallback(async (file: File) => {
    setError(null)
    setShowAlternatives(false)
    setStep('processing')

    try {
      const parsed = await extractWineFromFile(file)
      if (parsed.kind === 'multi_bottle') {
        throw new Error('Cette photo contient plusieurs bouteilles. Utilisez une photo par bouteille pour ce parcours.')
      }

      const extractionData = parsed.bottles[0] as WineExtraction
      const matched = findMatches(bottles, extractionData)
      const [primaryMatch, ...alternatives] = matched

      if (scanResult?.photoUri) {
        URL.revokeObjectURL(scanResult.photoUri)
      }

      setScanResult({
        extraction: extractionData,
        photoFile: file,
        photoUri: URL.createObjectURL(file),
        matchType: primaryMatch ? 'in_cave' : 'not_in_cave',
        primaryMatch: primaryMatch ?? null,
        alternatives,
      })

      setStep('result')
    } catch (err) {
      console.error('Extraction error:', err)
      const message = err instanceof Error ? err.message : ''
      if (message.includes('plusieurs bouteilles')) {
        setError(message)
        navigate('/degustations')
        return
      }
      navigate('/add', {
        state: {
          prefillPhotoFile: file,
          prefillExtraction: null,
        },
      })
    }
  }, [bottles, navigate, scanResult?.photoUri])

  useEffect(() => {
    if (prefillHandled) return
    if (bottlesLoading) return
    const state = location.state as RemoveBottleLocationState | null
    if (!state) return

    const { prefillExtraction, prefillPhotoFile } = state

    if (prefillExtraction) {
      setPrefillHandled(true)
      const extraction = {
        domaine: prefillExtraction.domaine || null,
        cuvee: prefillExtraction.cuvee || null,
        appellation: prefillExtraction.appellation || null,
        millesime: prefillExtraction.millesime || null,
        couleur: normalizeWineColor(prefillExtraction.couleur || null),
        country: prefillExtraction.country || null,
        region: prefillExtraction.region || null,
        confidence: prefillExtraction.confidence ?? 0,
        grape_varieties: prefillExtraction.grape_varieties || null,
        serving_temperature: prefillExtraction.serving_temperature || null,
        typical_aromas: prefillExtraction.typical_aromas || null,
        food_pairings: prefillExtraction.food_pairings || null,
        character: prefillExtraction.character || null,
      } as WineExtraction

      const matched = findMatches(bottles, extraction)
      const [primaryMatch, ...alternatives] = matched

      setScanResult({
        extraction,
        photoFile: prefillPhotoFile ?? null,
        photoUri: prefillPhotoFile ? URL.createObjectURL(prefillPhotoFile) : null,
        matchType: primaryMatch ? 'in_cave' : 'not_in_cave',
        primaryMatch: primaryMatch ?? null,
        alternatives,
      })
      setStep('result')
    } else if (prefillPhotoFile) {
      setPrefillHandled(true)
      void processSingleFile(prefillPhotoFile)
    }
  }, [location.state, bottles, bottlesLoading, prefillHandled, processSingleFile])

  async function processBatchInBackground(sessionId: string) {
    const startedSession = getActiveBatchSession()
    if (!startedSession || startedSession.id !== sessionId) return

    for (const item of startedSession.items) {
      const currentSession = getActiveBatchSession()
      if (!currentSession || currentSession.id !== sessionId || currentSession.status !== 'processing') {
        return
      }

      updateBatchItem(sessionId, item.id, { extractionStatus: 'extracting' })

      try {
        const parsed = await extractWineFromFile(item.photoFile)
        if (parsed.kind === 'multi_bottle') {
          throw new Error('Photo multi-bouteilles non supportee dans ce parcours')
        }

        const extractionData = parsed.bottles[0] as WineExtraction
        const matched = findMatches(bottles, extractionData)
        const [primaryMatch, ...alternatives] = matched

        updateBatchItem(sessionId, item.id, {
          extraction: extractionData,
          primaryMatch: primaryMatch ?? null,
          alternatives,
          matchedBottleId: primaryMatch?.id ?? null,
          matchType: primaryMatch ? 'in_cave' : 'not_in_cave',
          processedAt: new Date().toISOString(),
          error: null,
          extractionStatus: 'extracted',
        })
      } catch (err) {
        console.error('Batch extraction error:', err)
        updateBatchItem(sessionId, item.id, {
          extraction: null,
          primaryMatch: null,
          alternatives: [],
          matchedBottleId: null,
          matchType: 'unresolved',
          processedAt: new Date().toISOString(),
          error: 'Non identifie',
          extractionStatus: 'error',
        })
      }
    }

    setBatchSessionStatus(sessionId, 'ready')
  }

  const handleSelectAlternative = (bottle: BottleWithZone) => {
    if (!scanResult) return
    const merged = [scanResult.primaryMatch, ...scanResult.alternatives].filter(Boolean) as BottleWithZone[]

    setScanResult({
      ...scanResult,
      matchType: 'in_cave',
      primaryMatch: bottle,
      alternatives: merged.filter((candidate) => candidate.id !== bottle.id),
    })
    setShowAlternatives(false)
  }

  const handleConfirmRemove = async (bottle: BottleWithZone) => {
    setStep('saving')

    try {
      const { drunkBottleId } = await openBottle(bottle)
      track('bottle_opened', { matched: true })
      triggerProfileRecompute()
      navigate(`/bottle/${drunkBottleId}`)
    } catch (err) {
      console.error('Save error:', err)
      setError("Echec de l'enregistrement")
      setStep('result')
    }
  }

  const handleLogTasting = async (result: ScanResult) => {
    setStep('saving')

    try {
      let photoUrl: string | null = null
      if (result.photoFile) {
        try {
          photoUrl = await uploadPhoto(result.photoFile, `${Date.now()}-front.jpg`)
        } catch {
          // continue without photo
        }
      }

      const { id } = await insertBottle(
        buildDrunkBottleInsertFromExtraction(result.extraction, { photoUrl }),
      )
      track('bottle_opened', { matched: false })
      triggerProfileRecompute()
      navigate(`/bottle/${id}`)
    } catch (err) {
      console.error('Save error:', err)
      setError("Echec de l'enregistrement")
      setStep('result')
    }
  }

  const handlePrimaryAction = async () => {
    if (!scanResult) return

    if (scanResult.matchType === 'in_cave' && scanResult.primaryMatch) {
      await handleConfirmRemove(scanResult.primaryMatch)
      return
    }

    await handleLogTasting(scanResult)
  }

  const handleBatchItemSave = async (item: BatchItem) => {
    if (!activeBatchSession) return

    try {
      if (item.matchType === 'in_cave' && item.primaryMatch) {
        await openBottle(item.primaryMatch)
        track('bottle_opened', { matched: true, batch: true })
      } else {
        let photoUrl: string | null = null
        try {
          photoUrl = await uploadPhoto(item.photoFile, `${Date.now()}-front-${item.id}.jpg`)
        } catch {
          // continue without photo
        }

        await insertBottle(
          buildDrunkBottleInsertFromExtraction(item.extraction as WineExtraction, { photoUrl }),
        )
        track('bottle_opened', { matched: false, batch: true })
      }

      updateBatchItem(activeBatchSession.id, item.id, { saved: true })

      const currentItems = getActiveBatchSession()?.items ?? []
      const allDone = currentItems.every((entry) => entry.id === item.id || entry.saved || entry.ignored)

      if (allDone) {
        setBatchSessionStatus(activeBatchSession.id, 'done')
        triggerProfileRecompute()
        navigate('/degustations')
        return
      }

      const nextIndex = findNextUnsavedIndex(currentBatchIndex, currentItems)
      if (nextIndex !== null) {
        setCurrentBatchIndex(nextIndex)
      }
    } catch (err) {
      console.error('Batch item save error:', err)
      setError("Echec de l'enregistrement")
    }
  }

  const handleBatchItemSkip = () => {
    if (!activeBatchSession) return

    const nextIndex = findNextUnsavedIndex(currentBatchIndex, activeBatchSession.items)
    if (nextIndex !== null) {
      setCurrentBatchIndex(nextIndex)
    } else {
      setBatchSessionStatus(activeBatchSession.id, 'done')
      triggerProfileRecompute()
      navigate('/degustations')
    }
  }

  const handleBatchSelectAlternative = (item: BatchItem, bottle: BottleWithZone) => {
    if (!activeBatchSession) return
    const merged = [item.primaryMatch, ...item.alternatives].filter(Boolean) as BottleWithZone[]
    updateBatchItem(activeBatchSession.id, item.id, {
      matchType: 'in_cave',
      primaryMatch: bottle,
      matchedBottleId: bottle.id,
      alternatives: merged.filter((candidate) => candidate.id !== bottle.id),
    })
  }

  const handleUpdateBatchExtraction = (itemId: string, field: string, value: string) => {
    if (!activeBatchSession) return
    const item = activeBatchSession.items.find((entry) => entry.id === itemId)
    if (!item) return

    const currentExtraction = item.extraction ?? ({} as Record<string, unknown>)
    const updatedExtraction = {
      ...currentExtraction,
      [field]: field === 'millesime' ? (value ? parseInt(value, 10) : null) : value,
    } as WineExtraction

    updateBatchItem(activeBatchSession.id, itemId, { extraction: updatedExtraction })
  }

  const handleBatchConfirmAllRemaining = async () => {
    if (!activeBatchSession) return

    setStep('batch-saving')

    try {
      for (const item of activeBatchSession.items) {
        if (item.saved || item.ignored) continue

        if (item.matchType === 'in_cave' && item.primaryMatch) {
          await openBottle(item.primaryMatch)
          updateBatchItem(activeBatchSession.id, item.id, { saved: true })
          continue
        }

        if ((item.matchType === 'not_in_cave' || item.matchType === 'unresolved') && item.extraction) {
          let photoUrl: string | null = null
          try {
            photoUrl = await uploadPhoto(item.photoFile, `${Date.now()}-front-${item.id}.jpg`)
          } catch {
            // continue without photo
          }

          await insertBottle(
            buildDrunkBottleInsertFromExtraction(item.extraction, { photoUrl }),
          )
          updateBatchItem(activeBatchSession.id, item.id, { saved: true })
        }
      }

      setBatchSessionStatus(activeBatchSession.id, 'done')
      triggerProfileRecompute()
      navigate('/degustations')
    } catch (err) {
      console.error('Batch save error:', err)
      setError("Echec de l'enregistrement de la rafale")
      setStep('batch-review')
    }
  }

  return {
    step,
    scanResult,
    error,
    showAlternatives,
    setShowAlternatives,
    activeBatchSession,
    batchProgressItems,
    batchExtractionCurrentIndex,
    currentBatchIndex,
    setCurrentBatchIndex,
    domainesSuggestions,
    appellationsSuggestions,
    swipeHandlers,
    goToDegustations,
    resetScanResult,
    handlePrimaryAction,
    handleSelectAlternative,
    handleBatchItemSave,
    handleBatchItemSkip,
    handleBatchSelectAlternative,
    handleUpdateBatchExtraction,
    handleBatchConfirmAllRemaining,
  }
}
