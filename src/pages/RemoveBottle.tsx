import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useSwipeable } from 'react-swipeable'
import { Button } from '@/components/ui/button'
import { BatchProgress, type BatchProgressItem } from '@/components/BatchProgress'
import { BatchTastingItemForm } from '@/components/BatchTastingItemForm'
import { RemoveResultStep } from '@/components/RemoveResultStep'
import { useBottles, useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { normalizeWineColor, type BottleWithZone, type WineExtraction } from '@/lib/types'
import { buildDrunkBottleInsertFromExtraction, insertBottle } from '@/lib/bottleWrites'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import { track } from '@/lib/track'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { openBottle } from '@/lib/bottleActions'
import { uploadPhoto } from '@/lib/uploadPhoto'
import { findMatches } from '@/lib/wineMatching'
import {
  getActiveBatchSession,
  setBatchSessionStatus,
  updateBatchItem,
  useBatchSession,
  type BatchItem,
} from '@/lib/batchSessionStore'

type Step = 'processing' | 'result' | 'saving'
           | 'batch-extracting' | 'batch-review' | 'batch-saving'
type MatchType = 'in_cave' | 'not_in_cave'

interface RemoveBottleLocationState {
  prefillExtraction?: Partial<WineExtraction> | null
  prefillPhotoFile?: File | null
}

interface ScanResult {
  extraction: WineExtraction
  photoFile: File | null
  photoUri: string | null
  matchType: MatchType
  primaryMatch: BottleWithZone | null
  alternatives: BottleWithZone[]
}

export default function RemoveBottle() {
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

  // Auto-start batch processing when arriving from Scanner with a pending batch session
  const batchStartedRef = useRef(false)
  useEffect(() => {
    if (batchStartedRef.current) return
    if (bottlesLoading) return
    if (!batchSession || batchSession.status !== 'processing') return
    // Check if any items still need processing (no processedAt)
    const hasUnprocessed = batchSession.items.some(item => !item.processedAt)
    if (!hasUnprocessed) return

    batchStartedRef.current = true
    setStep('batch-extracting')
    void processBatchInBackground(batchSession.id)
  }, [batchSession, bottlesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-transition: when batch is ready, go from extracting to review
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

  // Map batch items to BatchProgressItem[] for the BatchProgress component
  const batchProgressItems: BatchProgressItem[] = useMemo(() => {
    if (!batchSession) return []
    return batchSession.items.map((item) => ({
      id: item.id,
      photoPreview: item.photoUri,
      status: item.extractionStatus,
      error: item.error ?? undefined,
      domaine: item.extraction?.domaine ?? undefined,
      appellation: item.extraction?.appellation ?? undefined,
    }))
  }, [batchSession])

  const batchExtractionCurrentIndex = useMemo(() => {
    if (!batchSession) return 0
    const idx = batchSession.items.findIndex(
      (item) => item.extractionStatus === 'extracting'
    )
    return idx >= 0 ? idx : batchSession.items.length - 1
  }, [batchSession])

  // Swipe handlers for batch review (must be at top level — Rules of Hooks)
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

  const goToDegustations = () => {
    if (activeBatchSession) {
      setBatchSessionStatus(activeBatchSession.id, 'done')
    }
    navigate('/degustations')
  }

  const resetScanResult = () => {
    if (scanResult?.photoUri) {
      URL.revokeObjectURL(scanResult.photoUri)
    }
    setScanResult(null)
    navigate('/degustations')
  }

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

  // Handle prefill from Scanner
  useEffect(() => {
    if (prefillHandled) return
    if (bottlesLoading) return // Wait until bottles are loaded before matching
    const state = location.state as RemoveBottleLocationState | null
    if (!state) return

    const { prefillExtraction, prefillPhotoFile } = state

    if (prefillExtraction) {
      // We have extraction data (with or without photo) - go straight to matching
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
      // Only photo, need to run OCR
      setPrefillHandled(true)
      void processSingleFile(prefillPhotoFile)
    }
  }, [location.state, bottles, bottlesLoading, prefillHandled, processSingleFile])

  const processBatchInBackground = async (sessionId: string) => {
    const startedSession = getActiveBatchSession()
    if (!startedSession || startedSession.id !== sessionId) return

    for (const item of startedSession.items) {
      const currentSession = getActiveBatchSession()
      if (!currentSession || currentSession.id !== sessionId || currentSession.status !== 'processing') {
        return
      }

      // Mark as extracting
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
          // Photo upload failed — continue without photo
        }
      }

      const { id } = await insertBottle(
        buildDrunkBottleInsertFromExtraction(result.extraction, { photoUrl })
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

  // ── Batch per-item handlers ──

  const findNextUnsavedIndex = (fromIndex: number, items: BatchItem[]): number | null => {
    // Search forward from fromIndex
    for (let i = fromIndex + 1; i < items.length; i++) {
      if (!items[i].saved && !items[i].ignored) return i
    }
    // Wrap around
    for (let i = 0; i < fromIndex; i++) {
      if (!items[i].saved && !items[i].ignored) return i
    }
    return null
  }

  const handleBatchItemSave = async (item: BatchItem) => {
    if (!activeBatchSession) return

    try {
      if (item.matchType === 'in_cave' && item.primaryMatch) {
        await openBottle(item.primaryMatch)
        track('bottle_opened', { matched: true, batch: true })
      } else {
        // Insert new bottle as drunk (not_in_cave or unresolved with user edits)
        let photoUrl: string | null = null
        try {
          photoUrl = await uploadPhoto(item.photoFile, `${Date.now()}-front-${item.id}.jpg`)
        } catch {
          // Photo upload failed — continue without photo
        }

        await insertBottle(
          buildDrunkBottleInsertFromExtraction(item.extraction as WineExtraction, { photoUrl })
        )
        track('bottle_opened', { matched: false, batch: true })
      }

      // Mark saved
      updateBatchItem(activeBatchSession.id, item.id, { saved: true })

      // Check if all items are done
      const currentItems = getActiveBatchSession()?.items ?? []
      const allDone = currentItems.every((it) => it.id === item.id || it.saved || it.ignored)

      if (allDone) {
        setBatchSessionStatus(activeBatchSession.id, 'done')
        triggerProfileRecompute()
        navigate('/degustations')
        return
      }

      // Jump to next unsaved
      const nextIdx = findNextUnsavedIndex(currentBatchIndex, currentItems)
      if (nextIdx !== null) {
        setCurrentBatchIndex(nextIdx)
      }
    } catch (err) {
      console.error('Batch item save error:', err)
      setError("Echec de l'enregistrement")
    }
  }

  const handleBatchItemSkip = () => {
    if (!activeBatchSession) return

    const items = activeBatchSession.items
    const nextIdx = findNextUnsavedIndex(currentBatchIndex, items)

    if (nextIdx !== null) {
      setCurrentBatchIndex(nextIdx)
    } else {
      // All items are saved or ignored — finish
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
      alternatives: merged.filter((c) => c.id !== bottle.id),
    })
  }

  const handleUpdateBatchExtraction = (itemId: string, field: string, value: string) => {
    if (!activeBatchSession) return
    const item = activeBatchSession.items.find((it) => it.id === itemId)
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
            // Photo upload failed — continue without photo
          }

          await insertBottle(
            buildDrunkBottleInsertFromExtraction(item.extraction, { photoUrl })
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

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  if (step === 'processing') {
    return (
      <div className="flex-1 p-6">
        <div className="mb-4">
          <p className="brand-text">Celestin</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Dégustations</h1>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 transition-all duration-200 ease-out">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">Analyse en cours...</p>
        </div>
      </div>
    )
  }

  if (step === 'result' && scanResult) {
    return (
      <RemoveResultStep
        scanResult={scanResult}
        error={error}
        showAlternatives={showAlternatives}
        onPrimaryAction={handlePrimaryAction}
        onSelectAlternative={handleSelectAlternative}
        onToggleAlternatives={() => setShowAlternatives((current) => !current)}
        onCancel={resetScanResult}
      />
    )
  }

  if (step === 'batch-extracting' && batchSession) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <p className="brand-text">Celestin</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Dégustations</h1>
        </div>

        <BatchProgress
          items={batchProgressItems}
          currentIndex={batchExtractionCurrentIndex}
        />

        <div className="mt-6">
          <Button variant="outline" className="w-full" onClick={goToDegustations}>
            Quitter le batch
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'batch-review' && activeBatchSession) {
    const currentItem = activeBatchSession.items[currentBatchIndex]
    const unsavedCount = activeBatchSession.items.filter((it) => !it.saved && !it.ignored).length
    const totalBatchItems = activeBatchSession.items.length

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-4 pb-2">
          <p className="brand-text">Celestin</p>
          <h2 className="font-serif text-[16px] font-semibold text-[var(--text-primary)]">
            {activeBatchSession.label}
          </h2>
        </div>

        <div {...swipeHandlers} className="flex-1 min-h-0 overflow-y-auto px-6 pb-3 scrollbar-hide">
          {currentItem ? (
            <BatchTastingItemForm
              key={currentItem.id}
              item={currentItem}
              currentIndex={currentBatchIndex}
              totalItems={totalBatchItems}
              allItems={activeBatchSession.items}
              domainesSuggestions={domainesSuggestions}
              appellationsSuggestions={appellationsSuggestions}
              onNavigate={setCurrentBatchIndex}
              onSave={handleBatchItemSave}
              onSkip={handleBatchItemSkip}
              onSelectAlternative={handleBatchSelectAlternative}
              onUpdateExtraction={handleUpdateBatchExtraction}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-3 border-t border-[var(--border-color)] bg-[var(--bg)]">
          {unsavedCount > 0 && (
            <Button
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-light)]"
              onClick={handleBatchConfirmAllRemaining}
            >
              Tout valider les {unsavedCount} restants
            </Button>
          )}
          <Button variant="outline" className={`w-full ${unsavedCount > 0 ? 'mt-2' : ''}`} onClick={goToDegustations}>
            Quitter le batch
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'saving' || step === 'batch-saving') {
    return (
      <div className="flex-1 p-6">
        <div className="mb-4">
          <p className="brand-text">Celestin</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Dégustations</h1>
        </div>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">
            {step === 'saving' ? 'Enregistrement...' : 'Validation de la rafale...'}
          </p>
        </div>
      </div>
    )
  }

  return null
}
