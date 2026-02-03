import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, Check, X, Wine, PenLine, ImageIcon, Plus, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BatchDrinkProgress } from '@/components/BatchDrinkProgress'
import { supabase } from '@/lib/supabase'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { normalizeWineColor, type WineColor, type BottleWithZone, type WineExtraction, type TastingPhoto } from '@/lib/types'
import { fileToBase64, resizeImage } from '@/lib/image'

type Step = 'choose' | 'extracting' | 'matching' | 'select' | 'confirm' | 'not_found' | 'saving' | 'batch-extracting' | 'batch-confirm'

const MAX_BATCH_SIZE = 12

type BatchMatchStatus = 'pending' | 'extracting' | 'matching' | 'matched' | 'multiple' | 'not_found' | 'error'

interface BatchDrinkItem {
  id: string
  photoFile: File
  photoPreview: string
  status: BatchMatchStatus
  extraction?: WineExtraction
  matches: BottleWithZone[]
  selectedBottle?: BottleWithZone
  error?: string
}

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

const COLOR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]/20 text-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]/20 text-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]/20 text-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]/20 text-[var(--champagne)]',
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  )
}

export default function RemoveBottle() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)
  const fileInputBatchRef = useRef<HTMLInputElement>(null)
  const { bottles } = useBottles()
  const { bottles: recentlyDrunk, loading: drunkLoading } = useRecentlyDrunk()

  const [step, setStep] = useState<Step>('choose')
  const [matches, setMatches] = useState<BottleWithZone[]>([])
  const [selectedBottle, setSelectedBottle] = useState<BottleWithZone | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<WineExtraction | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)

  // Batch mode state
  const [batchItems, setBatchItems] = useState<BatchDrinkItem[]>([])
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [batchExtractionIndex, setBatchExtractionIndex] = useState(0)

  // Tasting photos state
  const [tastingPhotos, setTastingPhotos] = useState<{ file: File; label?: string; preview: string }[]>([])
  const [showTastingPhotoOptions, setShowTastingPhotoOptions] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [pendingTastingFile, setPendingTastingFile] = useState<File | null>(null)
  const tastingPhotoInputRef = useRef<HTMLInputElement>(null)
  const tastingPhotoGalleryRef = useRef<HTMLInputElement>(null)

  const TASTING_LABELS = ['Bouchon', 'Bouteille', 'Autre']

  const formatDrunkDate = (value?: string | null) => {
    if (!value) return { day: '', month: '' }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return { day: '', month: '' }
    return {
      day: date.getDate().toString().padStart(2, '0'),
      month: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setPhotoFile(file)
    setStep('extracting')

    try {
      const base64 = await fileToBase64(file)

      setStep('matching')

      const { data, error: extractError } = await supabase.functions.invoke('extract-wine', {
        body: { image_base64: base64 },
      })

      if (extractError) throw extractError

      // Store extraction for potential "not found" flow
      setExtraction(data)

      // Find matching bottles in inventory
      const matched = findMatches(bottles, data)

      if (matched.length === 0) {
        // No match - offer to log as tasting
        setStep('not_found')
      } else if (matched.length === 1) {
        setSelectedBottle(matched[0])
        setStep('confirm')
      } else {
        setMatches(matched)
        setStep('select')
      }
    } catch (err) {
      console.error('Extraction error:', err)
      setError('Échec de la reconnaissance. Réessayez.')
      setStep('choose')
    }
  }

  const handleBatchFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // If only 1 photo selected, use single mode
    if (files.length === 1) {
      const file = files[0]
      setError(null)
      setPhotoFile(file)
      setStep('extracting')

      try {
        const base64 = await fileToBase64(file)
        setStep('matching')

        const { data, error: extractError } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (extractError) throw extractError

        setExtraction(data)
        const matched = findMatches(bottles, data)

        if (matched.length === 0) {
          setStep('not_found')
        } else if (matched.length === 1) {
          setSelectedBottle(matched[0])
          setStep('confirm')
        } else {
          setMatches(matched)
          setStep('select')
        }
      } catch (err) {
        console.error('Extraction error:', err)
        setError('Échec de la reconnaissance. Réessayez.')
        setStep('choose')
      }
      return
    }

    // Multiple photos - batch mode
    const selectedFiles = Array.from(files).slice(0, MAX_BATCH_SIZE)

    const items: BatchDrinkItem[] = selectedFiles.map((file, index) => ({
      id: `batch-${Date.now()}-${index}`,
      photoFile: file,
      photoPreview: URL.createObjectURL(file),
      status: 'pending' as const,
      matches: [],
    }))

    setBatchItems(items)
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
    setError(null)
    setStep('batch-extracting')

    // Start sequential extraction and matching
    await extractAndMatchBatchSequentially(items)
  }

  const extractAndMatchBatchSequentially = async (items: BatchDrinkItem[]) => {
    const updatedItems = [...items]

    for (let i = 0; i < updatedItems.length; i++) {
      setBatchExtractionIndex(i)

      // Update status to extracting
      updatedItems[i] = { ...updatedItems[i], status: 'extracting' }
      setBatchItems([...updatedItems])

      try {
        const base64 = await fileToBase64(updatedItems[i].photoFile)

        // Update status to matching
        updatedItems[i] = { ...updatedItems[i], status: 'matching' }
        setBatchItems([...updatedItems])

        const { data, error } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (error) throw error

        const matched = findMatches(bottles, data)

        if (matched.length === 0) {
          updatedItems[i] = {
            ...updatedItems[i],
            status: 'not_found',
            extraction: data,
            matches: [],
          }
        } else if (matched.length === 1) {
          updatedItems[i] = {
            ...updatedItems[i],
            status: 'matched',
            extraction: data,
            matches: matched,
            selectedBottle: matched[0],
          }
        } else {
          updatedItems[i] = {
            ...updatedItems[i],
            status: 'multiple',
            extraction: data,
            matches: matched,
          }
        }
      } catch (err) {
        console.error(`Extraction error for item ${i}:`, err)
        updatedItems[i] = {
          ...updatedItems[i],
          status: 'error',
          error: 'Échec de l\'extraction',
        }
      }

      setBatchItems([...updatedItems])
    }

    // All extractions done, move to batch confirm
    setStep('batch-confirm')
  }

  const handleSelectBottle = (bottle: BottleWithZone) => {
    setSelectedBottle(bottle)
    setStep('confirm')
  }

  const handleBatchSelectBottle = (bottle: BottleWithZone) => {
    const updatedItems = [...batchItems]
    updatedItems[currentBatchIndex] = {
      ...updatedItems[currentBatchIndex],
      selectedBottle: bottle,
      status: 'matched',
    }
    setBatchItems(updatedItems)
  }

  const handleConfirmRemove = async () => {
    if (!selectedBottle) return

    setStep('saving')

    try {
      // Upload tasting photos if any
      const uploadedPhotos: TastingPhoto[] = []

      for (const photo of tastingPhotos) {
        const compressedBlob = await resizeImage(photo.file)
        const fileName = `${Date.now()}-tasting-${uploadedPhotos.length}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('wine-labels')
            .getPublicUrl(fileName)

          uploadedPhotos.push({
            url: urlData.publicUrl,
            label: photo.label,
            taken_at: new Date().toISOString()
          })
        }
      }

      // Merge with existing tasting photos
      const existingPhotos = (selectedBottle.tasting_photos as TastingPhoto[]) || []
      const allPhotos = [...existingPhotos, ...uploadedPhotos]

      const { error } = await supabase
        .from('bottles')
        .update({
          status: 'drunk',
          drunk_at: new Date().toISOString(),
          tasting_photos: allPhotos
        })
        .eq('id', selectedBottle.id)

      if (error) {
        setError('Échec de l\'enregistrement')
        setStep('confirm')
      } else {
        // Cleanup previews
        tastingPhotos.forEach(p => URL.revokeObjectURL(p.preview))
        navigate(`/bottle/${selectedBottle.id}`)
      }
    } catch (err) {
      console.error('Save error:', err)
      setError('Échec de l\'enregistrement')
      setStep('confirm')
    }
  }

  const handleLogTasting = async () => {
    if (!extraction) return

    setStep('saving')

    try {
      let photoUrl: string | null = null

      // Upload photo if exists
      if (photoFile) {
        const compressedBlob = await resizeImage(photoFile)
        const fileName = `${Date.now()}-front.jpg`
        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('wine-labels')
            .getPublicUrl(fileName)
          photoUrl = urlData.publicUrl
        }
      }

      // Create bottle directly as drunk
      const { data, error } = await supabase
        .from('bottles')
        .insert({
          domaine: extraction.domaine || null,
          cuvee: extraction.cuvee || null,
          appellation: extraction.appellation || null,
          millesime: extraction.millesime || null,
          couleur: normalizeWineColor(extraction.couleur) || null,
          photo_url: photoUrl,
          raw_extraction: extraction,
          status: 'drunk',
          drunk_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error

      // Navigate to bottle page to add tasting note
      navigate(`/bottle/${data.id}`)
    } catch (err) {
      console.error('Save error:', err)
      setError('Échec de l\'enregistrement')
      setStep('not_found')
    }
  }

  const handleBatchConfirmCurrent = async () => {
    const item = batchItems[currentBatchIndex]

    if (!item.selectedBottle) {
      // Skip if not found or not selected
      handleBatchSkipCurrent()
      return
    }

    setStep('saving')

    try {
      const { error } = await supabase
        .from('bottles')
        .update({
          status: 'drunk',
          drunk_at: new Date().toISOString(),
        })
        .eq('id', item.selectedBottle.id)

      if (error) throw error

      // Move to next item or finish
      if (currentBatchIndex < batchItems.length - 1) {
        setCurrentBatchIndex(currentBatchIndex + 1)
        setStep('batch-confirm')
      } else {
        // All items processed, cleanup and go home
        batchItems.forEach(p => URL.revokeObjectURL(p.photoPreview))
        navigate('/')
      }
    } catch (err) {
      console.error('Save error:', err)
      setError('Échec de l\'enregistrement')
      setStep('batch-confirm')
    }
  }

  const handleBatchSkipCurrent = () => {
    if (currentBatchIndex < batchItems.length - 1) {
      setCurrentBatchIndex(currentBatchIndex + 1)
    } else {
      // Last item, cleanup and go home
      batchItems.forEach(p => URL.revokeObjectURL(p.photoPreview))
      navigate('/')
    }
  }

  const handleBatchLogTasting = async () => {
    const item = batchItems[currentBatchIndex]
    if (!item.extraction) return

    setStep('saving')

    try {
      let photoUrl: string | null = null

      // Upload photo
      const compressedBlob = await resizeImage(item.photoFile)
      const fileName = `${Date.now()}-front.jpg`
      const { error: uploadError } = await supabase.storage
        .from('wine-labels')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('wine-labels')
          .getPublicUrl(fileName)
        photoUrl = urlData.publicUrl
      }

      // Create bottle directly as drunk
      const { data, error } = await supabase
        .from('bottles')
        .insert({
          domaine: item.extraction.domaine || null,
          cuvee: item.extraction.cuvee || null,
          appellation: item.extraction.appellation || null,
          millesime: item.extraction.millesime || null,
          couleur: normalizeWineColor(item.extraction.couleur) || null,
          photo_url: photoUrl,
          raw_extraction: item.extraction,
          status: 'drunk',
          drunk_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error

      // Cleanup batch previews and navigate to bottle page to add tasting note
      batchItems.forEach(p => URL.revokeObjectURL(p.photoPreview))
      navigate(`/bottle/${data.id}`)
    } catch (err) {
      console.error('Save error:', err)
      setError('Échec de l\'enregistrement')
      setStep('batch-confirm')
    }
  }

  const handleTastingPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingTastingFile(file)
    setShowTastingPhotoOptions(false)
    setShowLabelPicker(true)

    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleLabelSelect = async (label?: string) => {
    if (!pendingTastingFile) return

    const preview = URL.createObjectURL(pendingTastingFile)
    setTastingPhotos(prev => [...prev, { file: pendingTastingFile, label, preview }])
    setPendingTastingFile(null)
    setShowLabelPicker(false)
  }

  const handleRemoveTastingPhoto = (index: number) => {
    setTastingPhotos(prev => {
      const newPhotos = [...prev]
      URL.revokeObjectURL(newPhotos[index].preview)
      newPhotos.splice(index, 1)
      return newPhotos
    })
  }

  const handleReset = () => {
    setStep('choose')
    setMatches([])
    setSelectedBottle(null)
    setError(null)
    setExtraction(null)
    setPhotoFile(null)
    // Cleanup tasting photos
    tastingPhotos.forEach(p => URL.revokeObjectURL(p.preview))
    setTastingPhotos([])
    setShowTastingPhotoOptions(false)
    setShowLabelPicker(false)
    setPendingTastingFile(null)
    // Cleanup batch state
    batchItems.forEach(p => URL.revokeObjectURL(p.photoPreview))
    setBatchItems([])
    setCurrentBatchIndex(0)
    setBatchExtractionIndex(0)
  }

  // Render the main "choose" step with new layout
  if (step === 'choose') {
    return (
      <div className="flex flex-1 flex-col">
        {/* Page Header */}
        <div className="px-6 pt-4 pb-3">
          <p className="brand-text">CaveScan</p>
          <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Partager</h1>
          <p className="text-[13px] font-light text-[var(--text-secondary)]">
            On ouvre une bonne bouteille ?
          </p>
        </div>

        {error && (
          <div className="mx-6 rounded-[var(--radius-sm)] bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Section Header - Divider with label */}
        <div className="mx-6 mt-4 mb-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border-color)]" />
          <span className="text-[10px] font-medium uppercase tracking-[2px] text-[var(--text-muted)]">
            Ouvertures récentes
          </span>
          <div className="h-px flex-1 bg-[var(--border-color)]" />
        </div>

        {/* Recently Drunk List */}
        <div className="flex-1 overflow-y-auto px-6 py-2 scrollbar-hide">
          {drunkLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : recentlyDrunk.length === 0 ? (
            <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--bg-card)] py-6 text-center text-sm text-[var(--text-secondary)] card-shadow">
              Aucune ouverture récente.
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentlyDrunk.map((bottle) => {
                const { day, month } = formatDrunkDate(bottle.drunk_at)

                return (
                  <Link key={bottle.id} to={`/bottle/${bottle.id}`}>
                    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2.5 pr-3 card-shadow transition-all duration-200 hover:bg-[var(--accent-bg)]">
                      {/* Date */}
                      <div className="w-9 flex-shrink-0 text-center">
                        <p className="font-serif text-[17px] font-bold leading-tight text-[var(--text-primary)]">{day}</p>
                        <p className="text-[9px] font-medium uppercase text-[var(--text-muted)]">{month}</p>
                      </div>

                      {/* Color Bar */}
                      <div
                        className={`h-8 w-[3px] flex-shrink-0 rounded-sm ${
                          bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'
                        }`}
                      />

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                          {bottle.domaine || bottle.appellation || 'Vin'}
                        </p>
                        <p className="truncate text-[11px] font-light text-[var(--text-secondary)]">
                          {[bottle.appellation !== bottle.domaine ? bottle.appellation : null, bottle.millesime]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      {/* Context */}
                      {bottle.zone_id && (
                        <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)]">
                          Ma cave
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Scan Zone - Bottom */}
        <div className="mx-4 mb-20 rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 scan-shadow">
          {/* Hidden inputs */}
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
          <input
            ref={fileInputBatchRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleBatchFileSelect}
            className="hidden"
          />

          <div className="flex items-center gap-3">
            {/* Gallery Button */}
            <button
              onClick={() => fileInputGalleryRef.current?.click()}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[rgba(184,134,11,0.12)] bg-[var(--accent-bg)] text-[var(--accent)] transition-all duration-200 hover:bg-[var(--accent-bg)]/80"
            >
              <GalleryIcon className="h-5 w-5" />
            </button>

            {/* Center Text */}
            <div className="flex-1 text-center">
              <p className="font-serif text-base font-semibold text-[var(--text-primary)]">Scanner un vin</p>
              <p className="text-xs text-[var(--text-muted)]">Photo ou galerie</p>
            </div>

            {/* Camera Button - Primary with gradient */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-white transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
                boxShadow: '0 3px 12px rgba(184,134,11,0.25)'
              }}
            >
              <CameraIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Other steps
  return (
    <div className="flex-1 p-6">
      {/* Page Header for other steps */}
      <div className="mb-4">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Partager</h1>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step: Extracting */}
      {(step === 'extracting' || step === 'matching') && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          <span className="text-muted-foreground">
            {step === 'extracting' ? 'Analyse de l\'étiquette...' : 'Recherche dans la cave...'}
          </span>
        </div>
      )}

      {/* Step: Select from matches */}
      {step === 'select' && (
        <div className="mt-6 space-y-4">
          <p className="text-muted-foreground">
            {matches.length} bouteilles correspondent. Laquelle sortez-vous ?
          </p>

          <div className="space-y-2">
            {matches.map((bottle) => (
              <Card
                key={bottle.id}
                className="cursor-pointer transition-colors hover:bg-card/80"
                onClick={() => handleSelectBottle(bottle)}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      bottle.couleur ? COLOR_STYLES[bottle.couleur] : 'bg-muted'
                    }`}
                  >
                    <Wine className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {bottle.cuvee || bottle.domaine || bottle.appellation || 'Vin'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bottle.millesime && `${bottle.millesime} - `}
                      {bottle.zone?.name}
                      {bottle.shelf && ` - ${bottle.shelf}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="w-full" onClick={handleReset}>
            <X className="mr-2 h-4 w-4" />
            Annuler
          </Button>
        </div>
      )}

      {/* Step: Not found - offer to log tasting */}
      {step === 'not_found' && extraction && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Wine className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium text-lg">
                {extraction.cuvee || extraction.domaine || extraction.appellation || 'Vin'}
              </p>
              {extraction.millesime && (
                <p className="text-muted-foreground">{extraction.millesime}</p>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-muted-foreground">
            Ce vin n'est pas dans ta cave.<br />
            Tu veux noter cette dégustation ?
          </p>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
              onClick={handleLogTasting}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Noter
            </Button>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedBottle && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardContent className="p-4">
              {(selectedBottle.photo_url || selectedBottle.photo_url_back) && (
                <div className={`mb-4 flex ${selectedBottle.photo_url && selectedBottle.photo_url_back ? 'gap-2' : ''}`}>
                  {selectedBottle.photo_url && (
                    <img
                      src={selectedBottle.photo_url}
                      alt="Étiquette avant"
                      className={`rounded object-contain cursor-zoom-in ${selectedBottle.photo_url_back ? 'flex-1 max-h-24' : 'w-full max-h-32'}`}
                      onClick={() => setZoomImage({ src: selectedBottle.photo_url as string, label: 'Avant' })}
                    />
                  )}
                  {selectedBottle.photo_url_back && (
                    <img
                      src={selectedBottle.photo_url_back}
                      alt="Étiquette arrière"
                      className={`rounded object-contain cursor-zoom-in ${selectedBottle.photo_url ? 'flex-1 max-h-24' : 'w-full max-h-32'}`}
                      onClick={() => setZoomImage({ src: selectedBottle.photo_url_back as string, label: 'Arriere' })}
                    />
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    selectedBottle.couleur ? COLOR_STYLES[selectedBottle.couleur] : 'bg-muted'
                  }`}
                >
                  <Wine className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-lg">
                    {selectedBottle.domaine || selectedBottle.appellation || 'Vin'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedBottle.appellation && selectedBottle.domaine && `${selectedBottle.appellation} - `}
                    {selectedBottle.millesime}
                  </p>
                  {selectedBottle.zone && (
                    <p className="text-xs text-muted-foreground">
                      {selectedBottle.zone.name}
                      {selectedBottle.shelf && ` - ${selectedBottle.shelf}`}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tasting photos section */}
          <div className="space-y-3">
            {/* Tasting photo inputs */}
            <input
              ref={tastingPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleTastingPhotoSelect}
              className="hidden"
            />
            <input
              ref={tastingPhotoGalleryRef}
              type="file"
              accept="image/*"
              onChange={handleTastingPhotoSelect}
              className="hidden"
            />

            {/* Tasting photos preview */}
            {tastingPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tastingPhotos.map((photo, index) => (
                  <div key={index} className="relative">
                    <img
                      src={photo.preview}
                      alt={photo.label || 'Photo de dégustation'}
                      className="h-16 w-16 rounded object-cover cursor-zoom-in"
                      onClick={() => setZoomImage({ src: photo.preview, label: photo.label })}
                    />
                    {photo.label && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 rounded-b">
                        {photo.label}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveTastingPhoto(index)}
                      className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add tasting photo button */}
            {!showTastingPhotoOptions && !showLabelPicker && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowTastingPhotoOptions(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une photo
              </Button>
            )}

            {/* Photo source options */}
            {showTastingPhotoOptions && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowTastingPhotoOptions(false)
                    tastingPhotoInputRef.current?.click()
                  }}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Photographier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowTastingPhotoOptions(false)
                    tastingPhotoGalleryRef.current?.click()
                  }}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Galerie
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTastingPhotoOptions(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Label picker */}
            {showLabelPicker && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm text-muted-foreground mb-2">Type de photo :</p>
                  <div className="flex flex-wrap gap-2">
                    {TASTING_LABELS.map((label) => (
                      <Button
                        key={label}
                        variant="outline"
                        size="sm"
                        onClick={() => handleLabelSelect(label)}
                      >
                        {label}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLabelSelect(undefined)}
                    >
                      Passer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <p className="text-center text-muted-foreground">
            Confirmer la sortie de cette bouteille ?
          </p>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
              onClick={handleConfirmRemove}
            >
              <Check className="mr-2 h-4 w-4" />
              Confirmer
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

      {/* Step: Batch Extracting */}
      {step === 'batch-extracting' && (
        <div className="mt-6 space-y-4">
          <div className="text-center">
            <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
              Recherche des bouteilles...
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Progression: {batchItems.filter(item => ['matched', 'multiple', 'not_found', 'error'].includes(item.status)).length}/{batchItems.length}
            </p>
          </div>

          <div className="space-y-2">
            {batchItems.map((item, index) => {
              const isCurrent = index === batchExtractionIndex
              const statusConfig = {
                pending: { icon: <Loader2 className="h-4 w-4 text-muted-foreground" />, label: 'En attente' },
                extracting: { icon: <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />, label: 'Analyse...' },
                matching: { icon: <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />, label: 'Recherche...' },
                matched: { icon: <Check className="h-4 w-4 text-green-600" />, label: 'Trouvée' },
                multiple: { icon: <Check className="h-4 w-4 text-amber-500" />, label: 'Plusieurs' },
                not_found: { icon: <X className="h-4 w-4 text-muted-foreground" />, label: 'Non trouvée' },
                error: { icon: <X className="h-4 w-4 text-destructive" />, label: 'Erreur' },
              }
              const config = statusConfig[item.status]

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isCurrent ? 'bg-[var(--accent)]/10' : ''
                  }`}
                >
                  <img
                    src={item.photoPreview}
                    alt={`Photo ${index + 1}`}
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.selectedBottle?.domaine || item.extraction?.domaine || `Photo ${index + 1}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {config.icon}
                    <span className="text-xs text-muted-foreground">{config.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Step: Batch Confirm */}
      {step === 'batch-confirm' && batchItems[currentBatchIndex] && (
        <div className="mt-6 space-y-4">
          {/* Progress header */}
          <BatchDrinkProgress
            currentIndex={currentBatchIndex}
            totalItems={batchItems.length}
          />

          {(() => {
            const item = batchItems[currentBatchIndex]

            // Case: error
            if (item.status === 'error') {
              return (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {/* Photo */}
                    <div className="flex justify-center">
                      <img
                        src={item.photoPreview}
                        alt="Photo scannée"
                        className="h-28 rounded object-contain"
                      />
                    </div>

                    {/* Error message */}
                    <div className="text-center">
                      <p className="text-destructive font-medium">
                        {item.error || 'Erreur lors de l\'analyse'}
                      </p>
                    </div>

                    {/* Action */}
                    <Button variant="outline" className="w-full" onClick={handleBatchSkipCurrent}>
                      Passer
                    </Button>
                  </CardContent>
                </Card>
              )
            }

            // Case: not found
            if (item.status === 'not_found') {
              return (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {/* Photo */}
                    <div className="flex justify-center">
                      <img
                        src={item.photoPreview}
                        alt="Photo scannée"
                        className="h-28 rounded object-contain"
                      />
                    </div>

                    {/* Wine info */}
                    <div className="text-center">
                      <p className="font-serif text-lg font-semibold text-[var(--text-primary)]">
                        {item.extraction?.domaine || item.extraction?.appellation || 'Vin non identifié'}
                      </p>
                      {(item.extraction?.appellation || item.extraction?.millesime) && (
                        <p className="text-sm text-muted-foreground">
                          {[
                            item.extraction?.appellation !== item.extraction?.domaine ? item.extraction?.appellation : null,
                            item.extraction?.millesime,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground mt-3">
                        Ce vin n'est pas dans ta cave.
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" onClick={handleBatchSkipCurrent}>
                        <X className="mr-2 h-4 w-4" />
                        Passer
                      </Button>
                      <Button
                        className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
                        onClick={handleBatchLogTasting}
                      >
                        <PenLine className="mr-2 h-4 w-4" />
                        Noter
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            // Case: multiple matches - need to select
            if (item.status === 'multiple' && !item.selectedBottle) {
              return (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {/* Photo */}
                    <div className="flex justify-center">
                      <img
                        src={item.photoPreview}
                        alt="Photo scannée"
                        className="h-28 rounded object-contain"
                      />
                    </div>

                    {/* Message */}
                    <p className="text-center text-muted-foreground">
                      {item.matches.length} bouteilles correspondent. Laquelle ?
                    </p>

                    {/* Selection list */}
                    <div className="space-y-2">
                      {item.matches.map((bottle) => (
                        <div
                          key={bottle.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] cursor-pointer transition-colors hover:bg-[var(--accent-bg)]"
                          onClick={() => handleBatchSelectBottle(bottle)}
                        >
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-full ${
                              bottle.couleur ? COLOR_STYLES[bottle.couleur] : 'bg-muted'
                            }`}
                          >
                            <Wine className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">
                              {bottle.cuvee || bottle.domaine || bottle.appellation || 'Vin'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {bottle.millesime && `${bottle.millesime} - `}
                              {bottle.zone?.name}
                              {bottle.shelf && ` - ${bottle.shelf}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action */}
                    <Button variant="outline" className="w-full" onClick={handleBatchSkipCurrent}>
                      Passer
                    </Button>
                  </CardContent>
                </Card>
              )
            }

            // Case: matched (single or selected)
            if (item.selectedBottle) {
              const bottle = item.selectedBottle
              return (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {/* Photos side by side */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <img
                          src={item.photoPreview}
                          alt="Photo scannée"
                          className="h-28 w-full rounded object-contain bg-black/5"
                        />
                        <p className="text-xs text-center text-muted-foreground mt-1">Scannée</p>
                      </div>
                      {bottle.photo_url && (
                        <div className="flex-1">
                          <img
                            src={bottle.photo_url}
                            alt="Photo en cave"
                            className="h-28 w-full rounded object-contain bg-black/5"
                          />
                          <p className="text-xs text-center text-muted-foreground mt-1">En cave</p>
                        </div>
                      )}
                    </div>

                    {/* Wine info */}
                    <div className="text-center">
                      <p className="font-serif text-lg font-semibold text-[var(--text-primary)]">
                        {bottle.domaine || bottle.appellation || 'Vin'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          bottle.appellation && bottle.domaine && bottle.appellation !== bottle.domaine
                            ? bottle.appellation
                            : null,
                          bottle.millesime,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {bottle.zone && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {bottle.zone.name}
                          {bottle.shelf && ` - ${bottle.shelf}`}
                        </p>
                      )}
                    </div>

                    {/* Confirmation question */}
                    <p className="text-center text-muted-foreground">
                      Marquer comme bue ?
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" onClick={handleBatchSkipCurrent}>
                        <X className="mr-2 h-4 w-4" />
                        Passer
                      </Button>
                      <Button
                        className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
                        onClick={handleBatchConfirmCurrent}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Confirmer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            return null
          })()}
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

function findMatches(
  bottles: BottleWithZone[],
  extraction: { domaine?: string; cuvee?: string; appellation?: string; millesime?: number }
): BottleWithZone[] {
  return bottles.filter(bottle => {
    let score = 0

    // Primary identifiers: domaine and cuvée (high weight)
    if (extraction.domaine && bottle.domaine) {
      if (bottle.domaine.toLowerCase().includes(extraction.domaine.toLowerCase()) ||
          extraction.domaine.toLowerCase().includes(bottle.domaine.toLowerCase())) {
        score += 3
      }
    }

    if (extraction.cuvee && bottle.cuvee) {
      if (bottle.cuvee.toLowerCase().includes(extraction.cuvee.toLowerCase()) ||
          extraction.cuvee.toLowerCase().includes(bottle.cuvee.toLowerCase())) {
        score += 3
      }
    }

    // Secondary identifiers: appellation and millésime (low weight)
    // These alone should NOT be enough to match
    if (extraction.appellation && bottle.appellation) {
      if (bottle.appellation.toLowerCase().includes(extraction.appellation.toLowerCase()) ||
          extraction.appellation.toLowerCase().includes(bottle.appellation.toLowerCase())) {
        score += 1
      }
    }

    if (extraction.millesime && bottle.millesime === extraction.millesime) {
      score += 1
    }

    // Require at least domaine OR cuvée match (score >= 3)
    return score >= 3
  })
}

