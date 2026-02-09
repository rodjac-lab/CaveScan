import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, PenLine, Check, X, ChevronRight, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { normalizeWineColor, type WineColor, type BottleWithZone, type WineExtraction } from '@/lib/types'
import { fileToBase64, resizeImage } from '@/lib/image'
import { stringSimilarity } from '@/lib/utils'
import {
  createBatchSession,
  getActiveBatchSession,
  markBatchSessionDone,
  setBatchSessionStatus,
  updateBatchItem,
  useBatchSession,
  type BatchItem,
} from '@/lib/batchSessionStore'

type Step = 'choose' | 'processing' | 'result' | 'review' | 'saving' | 'batch-saving'
type MatchType = 'in_cave' | 'not_in_cave'

const MAX_BATCH_SIZE = 12

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)
  const { bottles } = useBottles()
  const { bottles: recentlyDrunk, loading: drunkLoading } = useRecentlyDrunk()
  const batchSession = useBatchSession()

  const [step, setStep] = useState<Step>('choose')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (scanResult?.photoUri) {
        URL.revokeObjectURL(scanResult.photoUri)
      }
    }
  }, [scanResult?.photoUri])

  useEffect(() => {
    if (step === 'review' && (!batchSession || batchSession.status === 'done')) {
      setStep('choose')
    }
  }, [batchSession, step])

  const activeBatchSession = useMemo(() => {
    if (!batchSession) return null
    if (batchSession.status === 'done') return null
    return batchSession
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

  const formatDrunkDate = (value?: string | null) => {
    if (!value) return { day: '', month: '' }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return { day: '', month: '' }
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
    setStep('choose')
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
        })
        .select()
        .single()

      if (insertError) throw insertError
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

  const handleToggleIgnoreBatchItem = (item: BatchItem) => {
    if (!activeBatchSession) return
    updateBatchItem(activeBatchSession.id, item.id, { ignored: !item.ignored })
  }

  const handleBatchConfirmAll = async () => {
    if (!activeBatchSession) return

    setStep('batch-saving')

    try {
      for (const item of activeBatchSession.items) {
        if (item.ignored) continue

        if (item.matchType === 'in_cave' && item.primaryMatch) {
          await supabase
            .from('bottles')
            .update({ status: 'drunk', drunk_at: new Date().toISOString() })
            .eq('id', item.primaryMatch.id)
          continue
        }

        if (item.matchType === 'not_in_cave' && item.extraction) {
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
          })
        }
      }

      markBatchSessionDone(activeBatchSession.id)
      setStep('choose')
    } catch (err) {
      console.error('Batch save error:', err)
      setError("Echec de l'enregistrement de la rafale")
      setStep('review')
    }
  }

  const renderMatchBadge = (matchType: MatchType | 'unresolved') => {
    const isInCave = matchType === 'in_cave'
    const isUnresolved = matchType === 'unresolved'
    const dotColor = isInCave ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'
    const textColor = isInCave ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
    const label = isUnresolved ? 'Non identifie' : isInCave ? 'En cave' : 'Hors cave'

    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${textColor}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        {label}
      </span>
    )
  }

  if (step === 'choose') {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex-shrink-0 px-6 pt-4 pb-3">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
          <p className="text-[13px] font-light text-[var(--text-secondary)]">Sorties de cave & dégustations</p>
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
              onClick={() => setStep('review')}
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
                <p className="font-serif text-base font-semibold text-[var(--text-primary)]">Scanner un vin</p>
                <p className="text-xs text-[var(--text-muted)]">Photo ou galerie</p>
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

  if (step === 'review' && activeBatchSession && batchSummary) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-6 pb-3">
        <div className="mb-3">
          <p className="brand-text">CaveScan</p>
          <h2 className="font-serif text-[16px] font-semibold text-[var(--text-primary)]">{activeBatchSession.label}</h2>
          <p className="text-[11px] font-normal text-[var(--text-muted)]">
            {batchSummary.total} vins · {batchSummary.inCave} en cave, {batchSummary.notInCave} hors cave
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-hide">
          {activeBatchSession.items.map((item) => {
            const name = item.primaryMatch?.domaine || item.primaryMatch?.appellation || item.extraction?.domaine || item.extraction?.appellation || 'Vin non identifie'
            const detail = item.primaryMatch
              ? [item.primaryMatch.appellation, item.primaryMatch.millesime].filter(Boolean).join(' · ')
              : [item.extraction?.appellation, item.extraction?.millesime].filter(Boolean).join(' · ')

            return (
              <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5">
                <div className="flex items-start gap-3">
                  <img src={item.photoUri} alt="Bouteille" className="h-[30px] w-[30px] rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{name}</p>
                      {renderMatchBadge(item.matchType === null ? 'unresolved' : item.matchType)}
                    </div>
                    <p className="truncate text-[11px] font-normal text-[var(--text-muted)]">{detail || item.error || 'Information partielle'}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  {item.matchType === 'in_cave' && (
                    <button
                      type="button"
                      onClick={() => updateBatchItem(activeBatchSession.id, item.id, { ignored: false })}
                      className="flex-1 rounded-[var(--radius-sm)] bg-[var(--accent-bg)] px-3 py-2 text-center text-[12px] font-medium text-[var(--accent)]"
                    >
                      Sortir de cave
                    </button>
                  )}

                  {item.matchType === 'not_in_cave' && (
                    <button
                      type="button"
                      onClick={() => updateBatchItem(activeBatchSession.id, item.id, { ignored: false })}
                      className="flex-1 rounded-[var(--radius-sm)] bg-[var(--accent-bg)] px-3 py-2 text-center text-[12px] font-medium text-[var(--accent)]"
                    >
                      Noter la degustation
                    </button>
                  )}

                  {(item.matchType === 'unresolved' || item.matchType === null) && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/add', {
                          state: {
                            prefillExtraction: item.extraction,
                            prefillPhotoFile: item.photoFile,
                          },
                        })
                      }
                      className="flex-1 rounded-[var(--radius-sm)] bg-[var(--accent-bg)] px-3 py-2 text-center text-[12px] font-medium text-[var(--accent)]"
                    >
                      Saisir manuellement
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleIgnoreBatchItem(item)}
                    className="text-[12px] font-medium text-[var(--text-muted)]"
                  >
                    {item.ignored ? 'Reprendre' : 'Ignorer'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="pt-3">
          <Button className="w-full bg-[var(--accent)] hover:bg-[var(--accent-light)]" onClick={handleBatchConfirmAll}>
            Tout valider
          </Button>
          <Button variant="outline" className="mt-2 w-full" onClick={resetToChoose}>
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
