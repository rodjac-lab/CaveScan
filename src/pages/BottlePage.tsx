import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, MapPin, Calendar, Wine, Loader2, Save, Share2, Euro, Pencil, Plus, Camera, ImageIcon, X, Check, Tag, Grid2x2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { useBottle } from '@/hooks/useBottles'
import { getWineColorLabel, type TastingPhoto, type BottleWithZone } from '@/lib/types'
import { resizeImage } from '@/lib/image'

const TASTING_LABELS = ['Bouchon', 'Bouteille', 'Autre']

interface BatchState {
  batchIds?: string[]
  batchIndex?: number
}

export default function BottlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { bottle, loading, error, refetch } = useBottle(id)

  // Batch mode state
  const batchState = location.state as BatchState | null
  const isBatchMode = batchState?.batchIds && batchState.batchIds.length > 1
  const batchIndex = batchState?.batchIndex ?? 0
  const totalBatch = batchState?.batchIds?.length ?? 0

  const [tastingNote, setTastingNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)

  // Cave mode state
  const [sameWineCount, setSameWineCount] = useState<number>(1)
  const [pastTastings, setPastTastings] = useState<BottleWithZone[]>([])

  // Tasting photo state
  const [showPhotoOptions, setShowPhotoOptions] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const tastingPhotoInputRef = useRef<HTMLInputElement>(null)
  const tastingPhotoGalleryRef = useRef<HTMLInputElement>(null)

  // Sync tasting note with bottle data (reset when bottle changes)
  useEffect(() => {
    setTastingNote(bottle?.tasting_note || '')
  }, [bottle?.id])

  // Fetch cave data (same wine count + past tastings) for in_stock bottles
  useEffect(() => {
    if (!bottle || bottle.status === 'drunk') return

    async function fetchCaveData() {
      // Count in_stock bottles with same domaine + appellation + millesime
      const countQuery = supabase
        .from('bottles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_stock')

      if (bottle!.domaine) countQuery.eq('domaine', bottle!.domaine)
      else countQuery.is('domaine', null)
      if (bottle!.appellation) countQuery.eq('appellation', bottle!.appellation)
      else countQuery.is('appellation', null)
      if (bottle!.millesime) countQuery.eq('millesime', bottle!.millesime)
      else countQuery.is('millesime', null)

      const { count } = await countQuery
      setSameWineCount(count ?? 1)

      // Fetch drunk bottles with same wine identity
      const tastingsQuery = supabase
        .from('bottles')
        .select('*, zone:zones(*)')
        .eq('status', 'drunk')

      if (bottle!.domaine) tastingsQuery.eq('domaine', bottle!.domaine)
      else tastingsQuery.is('domaine', null)
      if (bottle!.appellation) tastingsQuery.eq('appellation', bottle!.appellation)
      else tastingsQuery.is('appellation', null)
      if (bottle!.millesime) tastingsQuery.eq('millesime', bottle!.millesime)
      else tastingsQuery.is('millesime', null)

      const { data: tastings } = await tastingsQuery
        .order('drunk_at', { ascending: false })
        .limit(20)

      setPastTastings(tastings ?? [])
    }

    fetchCaveData()
  }, [bottle?.id, bottle?.status])

  const handleSaveTastingNote = async () => {
    if (!bottle) return

    setSaving(true)
    const { error } = await supabase
      .from('bottles')
      .update({ tasting_note: tastingNote || null })
      .eq('id', bottle.id)

    if (!error) {
      await refetch()
    }
    setSaving(false)
  }

  const handleMarkAsDrunk = async () => {
    if (!bottle) return

    setRemoving(true)
    const { error } = await supabase
      .from('bottles')
      .update({
        status: 'drunk',
        drunk_at: new Date().toISOString()
      })
      .eq('id', bottle.id)

    if (!error) {
      await refetch()
    }
    setRemoving(false)
  }

  const handleShare = async () => {
    if (!bottle) return

    setSharing(true)

    try {
      // Build the share text
      const title = bottle.domaine || bottle.appellation || 'Vin'
      const lines: string[] = []

      lines.push(`🍷 ${title}${bottle.millesime ? ` ${bottle.millesime}` : ''}`)
      if (bottle.appellation && bottle.domaine) {
        lines.push(bottle.appellation)
      }
      lines.push('')
      if (tastingNote) {
        lines.push(tastingNote)
        lines.push('')
      }

      lines.push('—\nPartagé avec CaveScan')

      const text = lines.join('\n')

      // Try to share with image if available
      if (bottle.photo_url && navigator.canShare) {
        try {
          const response = await fetch(bottle.photo_url)
          const blob = await response.blob()
          const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`
          const file = new File([blob], fileName, { type: 'image/jpeg' })

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              text,
              files: [file],
            })
            setSharing(false)
            return
          }
        } catch {
          // Fall back to text-only share
        }
      }

      // Fallback: text-only share
      if (navigator.share) {
        await navigator.share({ text })
      }
    } catch (err) {
      // User cancelled or share failed - ignore
      console.log('Share cancelled or failed:', err)
    }

    setSharing(false)
  }

  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const handleTastingPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingFile(file)
    setShowPhotoOptions(false)
    setShowLabelPicker(true)
    e.target.value = ''
  }

  const handleLabelSelect = async (label?: string) => {
    if (!pendingFile || !bottle) return

    setShowLabelPicker(false)
    setUploadingPhoto(true)

    try {
      const compressedBlob = await resizeImage(pendingFile)
      const fileName = `${Date.now()}-tasting.jpg`
      const { error: uploadError } = await supabase.storage
        .from('wine-labels')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('wine-labels')
        .getPublicUrl(fileName)

      const newPhoto: TastingPhoto = {
        url: urlData.publicUrl,
        label,
        taken_at: new Date().toISOString()
      }

      const existingPhotos = (bottle.tasting_photos as TastingPhoto[]) || []
      const updatedPhotos = [...existingPhotos, newPhoto]

      const { error } = await supabase
        .from('bottles')
        .update({ tasting_photos: updatedPhotos })
        .eq('id', bottle.id)

      if (!error) {
        await refetch()
      }
    } catch (err) {
      console.error('Upload error:', err)
    }

    setPendingFile(null)
    setUploadingPhoto(false)
  }

  const handleSaveAndNext = async () => {
    if (!bottle) return
    setSaving(true)

    // Save tasting note if modified
    if (tastingNote !== (bottle.tasting_note || '')) {
      await supabase
        .from('bottles')
        .update({ tasting_note: tastingNote || null })
        .eq('id', bottle.id)
    }

    setSaving(false)

    if (batchState && batchIndex < totalBatch - 1) {
      // Go to next wine
      const nextId = batchState.batchIds![batchIndex + 1]
      navigate(`/bottle/${nextId}`, {
        state: {
          batchIds: batchState.batchIds,
          batchIndex: batchIndex + 1
        },
        replace: true
      })
    } else {
      // Last wine -> go back to Partager
      navigate('/remove')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
      </div>
    )
  }

  if (error || !bottle) {
    return (
      <div className="flex-1 p-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error || 'Bouteille non trouvée'}
        </div>
      </div>
    )
  }

  const isDrunk = bottle.status === 'drunk'

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  const displayDate = isDrunk && bottle.drunk_at
    ? formatDateShort(bottle.drunk_at)
    : bottle.added_at
      ? formatDateShort(bottle.added_at)
      : '—'

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hidden tasting photo inputs — always rendered */}
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

      {/* ===== PAGE HEADER ===== */}
      <div className="flex items-center gap-2 px-4 pt-[14px]">
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[var(--text-primary)] hover:bg-[var(--accent-bg)] transition-colors"
          onClick={() => {
            if (isBatchMode && batchIndex > 0) {
              navigate(`/bottle/${batchState!.batchIds![batchIndex - 1]}`, {
                state: { batchIds: batchState!.batchIds, batchIndex: batchIndex - 1 },
                replace: true
              })
            } else {
              navigate(-1)
            }
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        {bottle.couleur && (
          <div
            className="w-[3px] h-6 rounded-full shrink-0"
            style={{ backgroundColor: `var(--${
              bottle.couleur === 'rouge' ? 'red-wine' :
              bottle.couleur === 'blanc' ? 'white-wine' :
              bottle.couleur === 'rose' ? 'rose-wine' :
              'champagne'
            })` }}
            title={getWineColorLabel(bottle.couleur)}
          />
        )}
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[var(--text-muted)] hover:bg-[var(--accent-bg)] transition-colors"
          onClick={() => navigate(`/bottle/${bottle.id}/edit`)}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {/* ===== BATCH PROGRESS ===== */}
      {isBatchMode && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-[var(--text-muted)]">
          <span>Vin {batchIndex + 1} sur {totalBatch}</span>
        </div>
      )}

      {/* ===== IDENTITY CARD ===== */}
      <div className="identity-card-anim mx-4 mt-3 rounded-[var(--radius)] bg-[var(--bg-card)] shadow-[var(--shadow-md)] overflow-hidden">
        {/* Identity Top: photo + info */}
        <div className="flex gap-[14px] p-[14px]">
          {/* Photo thumbnail */}
          {bottle.photo_url ? (
            <img
              src={bottle.photo_url}
              alt="Étiquette"
              className="w-[90px] h-[120px] rounded-lg object-cover shrink-0 cursor-pointer bg-[#e8e3da] hover:scale-[1.02] transition-transform"
              onClick={() => setZoomImage({ src: bottle.photo_url!, label: 'Avant' })}
            />
          ) : (
            <div className="w-[90px] h-[120px] rounded-lg shrink-0 bg-[#e8e3da] flex items-center justify-center">
              <Wine className="h-6 w-6 text-[var(--text-muted)]" />
            </div>
          )}

          {/* Info zone */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <div className="font-serif text-[20px] font-bold leading-tight text-[var(--text-primary)]">
              {bottle.domaine || bottle.cuvee || bottle.appellation || 'Vin'}
            </div>
            {bottle.appellation && (
              <div className="text-[13px] text-[var(--text-secondary)] mt-px">
                {bottle.appellation}
              </div>
            )}
            {bottle.cuvee && bottle.domaine && (
              <div className="text-[13px] text-[var(--text-secondary)]">
                {bottle.cuvee}
              </div>
            )}
            {/* Tags: millesime + couleur */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {bottle.millesime && (
                <span className="font-serif text-xs font-semibold text-[var(--text-primary)] bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.06)] rounded-full px-2.5 py-0.5">
                  {bottle.millesime}
                </span>
              )}
              {bottle.couleur && (
                <span className="text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.06)] rounded-full px-2.5 py-0.5">
                  {getWineColorLabel(bottle.couleur)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Identity Details bar */}
        <div className="flex items-center border-t border-[var(--border-color)]">
          {/* Date */}
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-[var(--border-color)]">
            <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
              {displayDate}
            </span>
          </div>
          {/* Prix */}
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-[var(--border-color)]">
            <Euro className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
              {bottle.purchase_price ? `${bottle.purchase_price.toFixed(2)} €` : '—'}
            </span>
          </div>
          {/* Lieu */}
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
            <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
              {bottle.zone?.name || 'Cave'}
            </span>
          </div>
        </div>
      </div>

      {/* ===== TASTING SECTION (drunk bottles) ===== */}
      {isDrunk && (
        <div className="tasting-section-anim mx-4 mt-[14px]">
          {/* Section divider */}
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="flex-1 h-px bg-[var(--border-color)]" />
            <span className="section-divider-label">Dégustation</span>
            <div className="flex-1 h-px bg-[var(--border-color)]" />
          </div>

          {/* Tasting photos row */}
          {uploadingPhoto ? (
            <div className="flex items-center gap-2 mb-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Upload...</span>
            </div>
          ) : showLabelPicker ? (
            <div className="mb-2.5">
              <p className="text-xs text-[var(--text-muted)] mb-1.5">Type de photo :</p>
              <div className="flex flex-wrap gap-1.5">
                {TASTING_LABELS.map((label) => (
                  <Button key={label} variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleLabelSelect(label)}>
                    {label}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleLabelSelect(undefined)}>
                  Passer
                </Button>
              </div>
            </div>
          ) : showPhotoOptions ? (
            <div className="flex gap-1.5 mb-2.5">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => { setShowPhotoOptions(false); tastingPhotoInputRef.current?.click() }}>
                <Camera className="mr-1 h-3 w-3" />
                Photo
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => { setShowPhotoOptions(false); tastingPhotoGalleryRef.current?.click() }}>
                <ImageIcon className="mr-1 h-3 w-3" />
                Galerie
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowPhotoOptions(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              {bottle.tasting_photos && (bottle.tasting_photos as TastingPhoto[]).length > 0 && (
                (bottle.tasting_photos as TastingPhoto[]).map((photo, index) => (
                  <div key={index} className="relative">
                    <img
                      src={photo.url}
                      alt={photo.label || 'Photo'}
                      className="h-[52px] w-[52px] rounded-lg object-cover cursor-zoom-in"
                      onClick={() => setZoomImage({ src: photo.url, label: photo.label })}
                    />
                    {photo.label && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 rounded-b-lg">
                        {photo.label}
                      </span>
                    )}
                  </div>
                ))
              )}
              <button
                onClick={() => setShowPhotoOptions(true)}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-lg border-[1.5px] border-dashed border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent"
              >
                <Plus className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}

          {/* Tasting card */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] overflow-hidden">
            <textarea
              id="tasting"
              value={tastingNote}
              onChange={(e) => setTastingNote(e.target.value)}
              placeholder="Vos impressions sur ce vin..."
              className="w-full min-h-[162px] py-[14px] px-4 border-none bg-transparent text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:italic focus:outline-none resize-none"
              spellCheck={true}
              autoCorrect="on"
              lang="fr"
              autoCapitalize="sentences"
            />
            <div className="flex gap-2 border-t border-[var(--border-color)] py-2.5 px-[14px]">
              {isBatchMode ? (
                <button
                  className="flex-1 h-11 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-light)] transition-colors disabled:opacity-50"
                  onClick={handleSaveAndNext}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : batchIndex < totalBatch - 1 ? (
                    <>Suivant <ArrowRight className="h-4 w-4" /></>
                  ) : (
                    <>Terminer <Check className="h-4 w-4" /></>
                  )}
                </button>
              ) : (
                <button
                  className="flex-1 h-11 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--red-wine)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  onClick={handleSaveTastingNote}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Enregistrer
                </button>
              )}
              {canShare && (
                <button
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                  onClick={handleShare}
                  disabled={sharing}
                >
                  {sharing ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <Share2 className="h-[18px] w-[18px]" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== CAVE SECTIONS (in_stock bottles) ===== */}
      {!isDrunk && (
        <>
          {/* --- Section "Ma cave" --- */}
          <div className="cave-section-anim mx-4 mt-[14px]">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="flex-1 h-px bg-[var(--border-color)]" />
              <span className="section-divider-label">Ma cave</span>
              <div className="flex-1 h-px bg-[var(--border-color)]" />
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] overflow-hidden">
              {/* Quantité */}
              <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
                <Tag className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
                <span className="text-xs text-[var(--text-muted)] flex-1">Quantité</span>
                <span className="text-right">
                  <span className="font-serif text-[17px] font-bold text-[var(--text-primary)]">{sameWineCount}</span>
                  <span className="text-[11px] text-[var(--text-muted)] ml-1">btl</span>
                </span>
              </div>
              {/* Emplacement */}
              <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
                <Grid2x2 className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
                <span className="text-xs text-[var(--text-muted)] flex-1">Emplacement</span>
                <span className="text-[13px] font-medium text-[var(--text-primary)] text-right">
                  {bottle.zone?.name
                    ? `${bottle.zone.name}${bottle.shelf ? ` · ${bottle.shelf}` : ''}`
                    : '—'}
                </span>
              </div>
              {/* Entrée en cave */}
              <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
                <Calendar className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
                <span className="text-xs text-[var(--text-muted)] flex-1">Entrée en cave</span>
                <span className="text-[13px] font-medium text-[var(--text-primary)] text-right">
                  {bottle.added_at
                    ? new Date(bottle.added_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—'}
                </span>
              </div>
              {/* Prix d'achat */}
              <div className="flex items-center px-4 py-3">
                <Euro className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
                <span className="text-xs text-[var(--text-muted)] flex-1">Prix d'achat</span>
                <span className="text-[13px] font-medium text-[var(--text-primary)] text-right">
                  {bottle.purchase_price ? `${bottle.purchase_price.toFixed(2)} €` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* --- Section "Dégustations passées" --- */}
          <div className="history-section-anim mx-4 mt-[14px]">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="flex-1 h-px bg-[var(--border-color)]" />
              <span className="section-divider-label">Dégustations passées</span>
              <div className="flex-1 h-px bg-[var(--border-color)]" />
            </div>

            {pastTastings.length === 0 ? (
              <p className="text-center text-[13px] text-[var(--text-muted)] italic py-5">
                Aucune dégustation enregistrée pour ce vin.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {pastTastings.map((item) => {
                  const drunkDate = item.drunk_at ? new Date(item.drunk_at) : null
                  return (
                    <button
                      key={item.id}
                      className="flex gap-3 bg-[var(--bg-card)] p-3 px-3.5 rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] text-left transition-shadow hover:shadow-[var(--shadow-md)]"
                      onClick={() => navigate(`/bottle/${item.id}`)}
                    >
                      {/* Date block */}
                      <div className="shrink-0 w-9 text-center">
                        <div className="font-serif text-[17px] font-bold leading-none text-[var(--text-primary)]">
                          {drunkDate ? drunkDate.getDate().toString().padStart(2, '0') : '—'}
                        </div>
                        <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)] font-medium mt-0.5">
                          {drunkDate ? drunkDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : ''}
                        </div>
                      </div>
                      {/* Color bar */}
                      {item.couleur && (
                        <div
                          className="w-[3px] h-8 rounded-full shrink-0 self-center"
                          style={{ backgroundColor: `var(--${
                            item.couleur === 'rouge' ? 'red-wine' :
                            item.couleur === 'blanc' ? 'white-wine' :
                            item.couleur === 'rose' ? 'rose-wine' :
                            'champagne'
                          })` }}
                        />
                      )}
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {item.tasting_note ? (
                          <p className="text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-2">
                            {item.tasting_note}
                          </p>
                        ) : (
                          <p className="text-[13px] text-[var(--text-muted)] italic">
                            Pas de note
                          </p>
                        )}
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                          Enregistrée
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* --- CTA "Ouvrir cette bouteille" --- */}
          <div className="cta-section-anim mx-4 mt-4">
            <button
              className="w-full h-12 flex items-center justify-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--red-wine)] text-white text-[15px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              onClick={handleMarkAsDrunk}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <Wine className="h-[18px] w-[18px]" />
              )}
              Ouvrir cette bouteille
            </button>
          </div>
        </>
      )}

      {/* Bottom spacer for nav bar */}
      <div className="h-[90px]" />

      {/* ===== ZOOM DIALOG ===== */}
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

