import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Loader2, PenLine, Check, X, ChevronRight, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BatchProgress, type BatchProgressItem } from '@/components/BatchProgress'
import { BatchTastingItemForm } from '@/components/BatchTastingItemForm'
import { supabase } from '@/lib/supabase'
import { useBottles, useRecentlyDrunk, useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { normalizeWineColor, type WineColor, type BottleWithZone, type WineExtraction } from '@/lib/types'
import { fileToBase64, resizeImage } from '@/lib/image'
import { track } from '@/lib/track'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { stringSimilarity } from '@/lib/utils'
import {
  createBatchSession,
  getActiveBatchSession,
  setBatchSessionStatus,
  updateBatchItem,
  useBatchSession,
  type BatchItem,
} from '@/lib/batchSessionStore'

type Step = 'choose' | 'processing' | 'result' | 'saving'
           | 'batch-extracting' | 'batch-review' | 'batch-saving'
type MatchType = 'in_cave' | 'not_in_cave'

const MAX_BATCH_SIZE = 12

interface RemoveBottleLocationState {
  prefillExtraction?: Partial<WineExtraction> | null
  prefillPhotoFile?: File | null
}

interface ScanResult {
  extraction: WineExtraction
  photoFile: File
  photoUri: string
  matchType: MatchType
  primaryMatch: BottleWithZone | null
  alternatives: BottleWithZone[]
}

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

export default function RemoveBottle() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)
  const { bottles, loading: bottlesLoading } = useBottles()
  const { bottles: recentlyDrunk, loading: drunkLoading } = useRecentlyDrunk()
  const batchSession = useBatchSession()
  const domainesSuggestions = useDomainesSuggestions()
  const appellationsSuggestions = useAppellationsSuggestions()

  const [step, setStep] = useState<Step>('choose')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefillHandled, setPrefillHandled] = useState(false)
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)

  // Handle prefill from Scanner
  useEffect(() => {
    if (prefillHandled) return
    if (bottlesLoading) return // Wait until bottles are loaded before matching
    const state = location.state as RemoveBottleLocationState | null
    if (!state) return

    const { prefillExtraction, prefillPhotoFile } = state

    if (prefillExtraction && prefillPhotoFile) {
      // We have both extraction and photo - go straight to matching
      setPrefillHandled(true)
      const extraction = {
        domaine: prefillExtraction.domaine || null,
        cuvee: prefillExtraction.cuvee || null,
        appellation: prefillExtraction.appellation || null,
        millesime: prefillExtraction.millesime || null,
        couleur: normalizeWineColor(prefillExtraction.couleur || null),
        region: prefillExtraction.region || null,
        cepage: prefillExtraction.cepage || null,
        confidence: prefillExtraction.confidence ?? 0,
      } as WineExtraction

      const matched = findMatches(bottles, extraction)
      const [primaryMatch, ...alternatives] = matched

      setScanResult({
        extraction,
        photoFile: prefillPhotoFile,
        photoUri: URL.createObjectURL(prefillPhotoFile),
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
  }, [location.state, bottles, bottlesLoading, prefillHandled])

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
      setStep('choose')
    }
  }, [batchSession, step])

  const activeBatchSession = useMemo(() => {
    return batchSession && batchSession.status !== 'done' ? batchSession : null
  }, [batchSession])

  const batchSummary = useMemo(() => {
    if (!activeBatchSession) return null

    const inCave = activeBatchSession.items.filter((item) => item.matchType === 'in_cave').length
    const notInCave = activeBatchSession.items.filter((item) => item.matchType === 'not_in_cave').length
    const unresolved = activeBatchSession.items.filter((item) => item.matchType === 'unresolved').length

    return {
      total: activeBatchSession.items.length,
      inCave,
      notInCave,
      unresolved,
    }
  }, [activeBatchSession])

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

  const formatDrunkDate = (value?: string | null) => {
    const empty = { day: '', month: '' }
    if (!value) return empty
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return empty
    return {
      day: date.getDate().toString().padStart(2, '0'),
      month: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    }
  }

  const resetToChoose = () => {
    setError(null)
    setShowAlternatives(false)
    setStep('choose')
  }

  const resetScanResult = () => {
    if (scanResult?.photoUri) {
      URL.revokeObjectURL(scanResult.photoUri)
    }
    setScanResult(null)
    resetToChoose()
  }

  const processSingleFile = async (file: File) => {
    setError(null)
    setShowAlternatives(false)
    setStep('processing')

    try {
      const base64 = await fileToBase64(file)
      const { data, error: extractError } = await supabase.functions.invoke('extract-wine', {
        body: { image_base64: base64 },
      })

      if (extractError) throw extractError

      const extractionData = data as WineExtraction
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
      navigate('/add', {
        state: {
          prefillPhotoFile: file,
          prefillExtraction: null,
        },
      })
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processSingleFile(file)
    e.target.value = ''
  }

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
        const base64 = await fileToBase64(item.photoFile)
        const { data, error: extractError } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (extractError) throw extractError

        const extractionData = data as WineExtraction
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

  const handleBatchFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (files.length === 1) {
      await processSingleFile(files[0])
      e.target.value = ''
      return
    }

    const selectedFiles = Array.from(files).slice(0, MAX_BATCH_SIZE)
    const session = createBatchSession(selectedFiles)
    setError(null)
    setStep('batch-extracting')
    e.target.value = ''

    void processBatchInBackground(session.id)
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
      const { error: updateError } = await supabase
        .from('bottles')
        .update({
          status: 'drunk',
          drunk_at: new Date().toISOString(),
        })
        .eq('id', bottle.id)

      if (updateError) throw updateError

      track('bottle_opened', { matched: true })
      triggerProfileRecompute()
      navigate(`/bottle/${bottle.id}`)
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
      const compressedBlob = await resizeImage(result.photoFile)
      const fileName = `${Date.now()}-front.jpg`
      const { error: uploadError } = await supabase.storage
        .from('wine-labels')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('wine-labels').getPublicUrl(fileName)
        photoUrl = urlData.publicUrl
      }

      const { data, error: insertError } = await supabase
        .from('bottles')
        .insert({
          domaine: result.extraction.domaine || null,
          cuvee: result.extraction.cuvee || null,
          appellation: result.extraction.appellation || null,
          millesime: result.extraction.millesime || null,
          couleur: normalizeWineColor(result.extraction.couleur) || null,
          photo_url: photoUrl,
          raw_extraction: result.extraction,
          status: 'drunk',
          drunk_at: new Date().toISOString(),
          grape_varieties: result.extraction.grape_varieties || null,
          serving_temperature: result.extraction.serving_temperature || null,
          typical_aromas: result.extraction.typical_aromas || null,
          food_pairings: result.extraction.food_pairings || null,
          character: result.extraction.character || null,
        })
        .select()
        .single()

      if (insertError) throw insertError
      track('bottle_opened', { matched: false })
      triggerProfileRecompute()
      navigate(`/bottle/${data.id}`)
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
        // Mark existing bottle as drunk
        await supabase
          .from('bottles')
          .update({ status: 'drunk', drunk_at: new Date().toISOString() })
          .eq('id', item.primaryMatch.id)
        track('bottle_opened', { matched: true, batch: true })
      } else {
        // Insert new bottle as drunk (not_in_cave or unresolved with user edits)
        let photoUrl: string | null = null
        const compressedBlob = await resizeImage(item.photoFile)
        const fileName = `${Date.now()}-front-${item.id}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('wine-labels').getPublicUrl(fileName)
          photoUrl = urlData.publicUrl
        }

        await supabase.from('bottles').insert({
          domaine: item.extraction?.domaine || null,
          cuvee: item.extraction?.cuvee || null,
          appellation: item.extraction?.appellation || null,
          millesime: item.extraction?.millesime || null,
          couleur: normalizeWineColor(item.extraction?.couleur) || null,
          photo_url: photoUrl,
          raw_extraction: item.extraction,
          status: 'drunk',
          drunk_at: new Date().toISOString(),
          grape_varieties: item.extraction?.grape_varieties || null,
          serving_temperature: item.extraction?.serving_temperature || null,
          typical_aromas: item.extraction?.typical_aromas || null,
          food_pairings: item.extraction?.food_pairings || null,
          character: item.extraction?.character || null,
        })
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
        setStep('choose')
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
      setStep('choose')
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
          await supabase
            .from('bottles')
            .update({ status: 'drunk', drunk_at: new Date().toISOString() })
            .eq('id', item.primaryMatch.id)
          updateBatchItem(activeBatchSession.id, item.id, { saved: true })
          continue
        }

        if ((item.matchType === 'not_in_cave' || item.matchType === 'unresolved') && item.extraction) {
          let photoUrl: string | null = null
          const compressedBlob = await resizeImage(item.photoFile)
          const fileName = `${Date.now()}-front-${item.id}.jpg`

          const { error: uploadError } = await supabase.storage
            .from('wine-labels')
            .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('wine-labels').getPublicUrl(fileName)
            photoUrl = urlData.publicUrl
          }

          await supabase.from('bottles').insert({
            domaine: item.extraction.domaine || null,
            cuvee: item.extraction.cuvee || null,
            appellation: item.extraction.appellation || null,
            millesime: item.extraction.millesime || null,
            couleur: normalizeWineColor(item.extraction.couleur) || null,
            photo_url: photoUrl,
            raw_extraction: item.extraction,
            status: 'drunk',
            drunk_at: new Date().toISOString(),
            grape_varieties: item.extraction.grape_varieties || null,
            serving_temperature: item.extraction.serving_temperature || null,
            typical_aromas: item.extraction.typical_aromas || null,
            food_pairings: item.extraction.food_pairings || null,
            character: item.extraction.character || null,
          })
          updateBatchItem(activeBatchSession.id, item.id, { saved: true })
        }
      }

      setBatchSessionStatus(activeBatchSession.id, 'done')
      triggerProfileRecompute()
      setStep('choose')
    } catch (err) {
      console.error('Batch save error:', err)
      setError("Echec de l'enregistrement de la rafale")
      setStep('batch-review')
    }
  }

  const MATCH_BADGE_CONFIG: Record<string, { dot: string; text: string; label: string }> = {
    in_cave: { dot: 'bg-[var(--accent)]', text: 'text-[var(--accent)]', label: 'En cave' },
    not_in_cave: { dot: 'bg-[var(--text-muted)]', text: 'text-[var(--text-muted)]', label: 'Hors cave' },
    unresolved: { dot: 'bg-[var(--text-muted)]', text: 'text-[var(--text-muted)]', label: 'Non identifie' },
  }

  const renderMatchBadge = (matchType: MatchType | 'unresolved') => {
    const config = MATCH_BADGE_CONFIG[matchType]

    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
    )
  }

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  if (step === 'choose') {
    // Determine where the batch banner button should navigate
    const handleBatchBannerClick = () => {
      if (!activeBatchSession) return
      if (activeBatchSession.status === 'processing') {
        setStep('batch-extracting')
      } else {
        setCurrentBatchIndex(0)
        setStep('batch-review')
      }
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex-shrink-0 px-6 pt-4 pb-3">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
          <p className="text-[13px] font-light text-[var(--text-secondary)]">Sorties de cave & degustations</p>
        </header>

        {error && (
          <div className="flex-shrink-0 mx-6 rounded-[var(--radius-sm)] bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[84px] scrollbar-hide">
          {activeBatchSession && batchSummary && (
            <button
              type="button"
              onClick={handleBatchBannerClick}
              className="mx-6 mb-3 mt-2 flex w-[calc(100%-3rem)] items-center gap-3 rounded-[var(--radius-sm)] border border-[rgba(184,134,11,0.12)] bg-[var(--accent-bg)] px-3 py-2.5 text-left"
            >
              {activeBatchSession.status === 'processing' ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
              ) : (
                <CheckCircle className="h-5 w-5 text-[var(--accent)]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {activeBatchSession.status === 'processing'
                    ? `${batchSummary.total} vins en cours d'analyse...`
                    : `${batchSummary.total} vins a documenter`}
                </p>
                <p className="text-[11px] font-normal text-[var(--text-muted)]">{activeBatchSession.label}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          )}

          <div className="mx-6 mt-2 mb-2 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border-color)]" />
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-[var(--text-muted)]">Ouvertures recentes</span>
            <div className="h-px flex-1 bg-[var(--border-color)]" />
          </div>

          <div className="px-6 py-2">
            {drunkLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
              </div>
            ) : recentlyDrunk.length === 0 ? (
              <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--bg-card)] py-6 text-center text-sm text-[var(--text-secondary)] card-shadow">
                Aucune ouverture recente.
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentlyDrunk.map((bottle) => {
                  const { day, month } = formatDrunkDate(bottle.drunk_at)

                  return (
                    <Link key={bottle.id} to={`/bottle/${bottle.id}`}>
                      <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2.5 pr-3 card-shadow transition-all duration-200 hover:bg-[var(--accent-bg)]">
                        <div className="w-9 flex-shrink-0 text-center">
                          <p className="font-serif text-[17px] font-bold leading-tight text-[var(--text-primary)]">{day}</p>
                          <p className="text-[9px] font-medium uppercase text-[var(--text-muted)]">{month}</p>
                        </div>

                        <div
                          className={`h-8 w-[3px] flex-shrink-0 rounded-sm ${
                            bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                            {bottle.domaine || bottle.appellation || 'Vin'}
                          </p>
                          <p className="truncate text-[11px] font-light text-[var(--text-secondary)]">
                            {[bottle.appellation !== bottle.domaine ? bottle.appellation : null, bottle.millesime].filter(Boolean).join(' · ')}
                          </p>
                        </div>

                        {bottle.zone_id && <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)]">Ma cave</span>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 px-4 py-2 bg-[var(--bg)]">
          <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 scan-shadow">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileInputGalleryRef}
              type="file"
              accept="image/*"
              onChange={handleBatchFileSelect}
              multiple
              className="hidden"
            />

            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputGalleryRef.current?.click()}
                className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[rgba(184,134,11,0.12)] bg-[var(--accent-bg)] text-[var(--accent)] transition-all duration-200 hover:bg-[var(--accent-bg)]/80"
              >
                <GalleryIcon className="h-5 w-5" />
              </button>

              <div className="flex-1 text-center">
                <p className="font-serif text-base font-semibold text-[var(--text-primary)]">Ouvrir une bouteille</p>
                <p className="text-xs text-[var(--text-muted)]">Scanner l'etiquette</p>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-white transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
                  boxShadow: '0 3px 12px rgba(184,134,11,0.25)',
                }}
              >
                <CameraIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div className="flex-1 p-6">
        <div className="mb-4">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 transition-all duration-200 ease-out">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">Analyse en cours...</p>
        </div>
      </div>
    )
  }

  if (step === 'result' && scanResult) {
    const displayName = scanResult.primaryMatch?.domaine || scanResult.primaryMatch?.appellation || scanResult.extraction.domaine || scanResult.extraction.appellation || 'Vin'
    const detail = scanResult.primaryMatch
      ? [scanResult.primaryMatch.appellation, scanResult.primaryMatch.millesime].filter(Boolean).join(' · ')
      : [scanResult.extraction.appellation, scanResult.extraction.millesime].filter(Boolean).join(' · ')

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-[var(--radius-sm)] bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3.5 card-shadow">
            <div className="flex items-start gap-3">
              <img src={scanResult.photoUri} alt="Bouteille scannee" className="h-[58px] w-[58px] rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{displayName}</p>
                <p className="mt-0.5 truncate text-[11px] font-normal text-[var(--text-muted)]">{detail || 'Information partielle'}</p>
                <div className="mt-2 flex items-center gap-3">
                  {renderMatchBadge(scanResult.matchType)}
                  {scanResult.matchType === 'in_cave' && scanResult.primaryMatch?.zone && (
                    <span className="text-[11px] font-normal text-[var(--text-muted)]">
                      {scanResult.primaryMatch.zone.name}
                      {scanResult.primaryMatch.shelf ? ` · ${scanResult.primaryMatch.shelf}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Button className="w-full bg-[var(--accent)] hover:bg-[var(--accent-light)]" onClick={handlePrimaryAction}>
            {scanResult.matchType === 'in_cave' ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Sortir de cave
              </>
            ) : (
              <>
                <PenLine className="mr-2 h-4 w-4" />
                Noter la degustation
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => setShowAlternatives((current) => !current)}
            className="w-full text-center text-[12px] font-medium text-[var(--accent)]"
          >
            Ce n'est pas cette bouteille ?
          </button>

          {showAlternatives && (
            <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              {scanResult.alternatives.length > 0 ? (
                scanResult.alternatives.map((bottle) => (
                  <button
                    key={bottle.id}
                    type="button"
                    onClick={() => handleSelectAlternative(bottle)}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg)] p-2.5 text-left transition-colors hover:bg-[var(--accent-bg)]"
                  >
                    <div className={`h-8 w-[3px] rounded-sm ${bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                        {bottle.domaine || bottle.appellation || 'Vin'}
                      </p>
                      <p className="truncate text-[11px] font-normal text-[var(--text-muted)]">
                        {[bottle.appellation, bottle.millesime].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    navigate('/add', {
                      state: {
                        prefillExtraction: scanResult.extraction,
                        prefillPhotoFile: scanResult.photoFile,
                      },
                    })
                  }
                >
                  Saisir manuellement
                </Button>
              )}
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={resetScanResult}>
            <X className="mr-2 h-4 w-4" />
            Annuler
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'batch-extracting' && batchSession) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
        </div>

        <BatchProgress
          items={batchProgressItems}
          currentIndex={batchExtractionCurrentIndex}
        />

        <div className="mt-6">
          <Button variant="outline" className="w-full" onClick={resetToChoose}>
            Retour
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'batch-review' && activeBatchSession) {
    const currentItem = activeBatchSession.items[currentBatchIndex]
    const unsavedCount = activeBatchSession.items.filter((it) => !it.saved && !it.ignored).length

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-4 pb-2">
          <p className="brand-text">CaveScan</p>
          <h2 className="font-serif text-[16px] font-semibold text-[var(--text-primary)]">
            {activeBatchSession.label}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-3 scrollbar-hide">
          {currentItem && (
            <BatchTastingItemForm
              key={currentItem.id}
              item={currentItem}
              currentIndex={currentBatchIndex}
              totalItems={activeBatchSession.items.length}
              allItems={activeBatchSession.items}
              domainesSuggestions={domainesSuggestions}
              appellationsSuggestions={appellationsSuggestions}
              onNavigate={setCurrentBatchIndex}
              onSave={handleBatchItemSave}
              onSkip={handleBatchItemSkip}
              onSelectAlternative={handleBatchSelectAlternative}
              onUpdateExtraction={handleUpdateBatchExtraction}
            />
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
          <Button variant="outline" className={`w-full ${unsavedCount > 0 ? 'mt-2' : ''}`} onClick={resetToChoose}>
            Retour
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'saving' || step === 'batch-saving') {
    return (
      <div className="flex-1 p-6">
        <div className="mb-4">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
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

const SIMILARITY_THRESHOLD_PRIMARY = 0.75
const SIMILARITY_THRESHOLD_SECONDARY = 0.8
const MATCH_SCORE_THRESHOLD = 3
const APPELLATION_MISMATCH_PENALTY = -2.0

type MatchCandidate = {
  bottle: BottleWithZone
  score: number
}

function findMatches(
  bottles: BottleWithZone[],
  extraction: { domaine?: string | null; cuvee?: string | null; appellation?: string | null; millesime?: number | null },
): BottleWithZone[] {
  const candidates: MatchCandidate[] = []

  for (const bottle of bottles) {
    if (extraction.millesime && bottle.millesime && bottle.millesime !== extraction.millesime) {
      continue
    }

    let score = 0

    if (extraction.domaine && bottle.domaine) {
      const similarity = stringSimilarity(extraction.domaine, bottle.domaine)
      if (similarity >= SIMILARITY_THRESHOLD_PRIMARY) {
        score += similarity * 4
      }
    }

    if (extraction.cuvee && bottle.cuvee) {
      const similarity = stringSimilarity(extraction.cuvee, bottle.cuvee)
      if (similarity >= SIMILARITY_THRESHOLD_PRIMARY) {
        score += similarity * 4
      }
    }

    if (extraction.appellation && bottle.appellation) {
      const similarity = stringSimilarity(extraction.appellation, bottle.appellation)
      if (similarity >= SIMILARITY_THRESHOLD_SECONDARY) {
        score += similarity * 1.5
      } else {
        score += APPELLATION_MISMATCH_PENALTY
      }
    }

    if (extraction.millesime && bottle.millesime === extraction.millesime) {
      score += 1
    }

    if (score >= MATCH_SCORE_THRESHOLD) {
      candidates.push({ bottle, score })
    }
  }

  return candidates.sort((a, b) => b.score - a.score).map((candidate) => candidate.bottle)
}
