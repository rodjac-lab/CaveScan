import { useState, useRef } from 'react'
import { Loader2, Save, Share2, ArrowRight, Plus, Camera, ImageIcon, X, Check, Star, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { type TastingPhoto, type BottleWithZone } from '@/lib/types'
import { track } from '@/lib/track'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { uploadPhoto } from '@/lib/uploadPhoto'
import { extractAndSaveTags } from '@/lib/tastingMemories'

const TASTING_LABELS = ['Bouchon', 'Bouteille', 'Plat', 'Ambiance', 'Autre']

function buildTastingPhotoFilename(): string {
  return `${crypto.randomUUID()}-tasting.jpg`
}

function getShareEmoji(color: BottleWithZone['couleur']): string {
  if (color === 'blanc' || color === 'bulles') return '🥂'
  return '🍷'
}

interface TastingSectionProps {
  bottle: BottleWithZone
  onRefetch: () => Promise<void>
  onZoom: (src: string, label?: string) => void
  /** Batch mode */
  isBatchMode?: boolean
  batchIndex?: number
  totalBatch?: number
  onSaveAndNext?: () => void
  savingBatch?: boolean
}

export function TastingSection({
  bottle,
  onRefetch,
  onZoom,
  isBatchMode,
  batchIndex = 0,
  totalBatch = 0,
  onSaveAndNext,
  savingBatch,
}: TastingSectionProps) {
  const [tastingNote, setTastingNote] = useState(bottle.tasting_note || '')
  const [rating, setRating] = useState<number | null>(bottle.rating ?? null)
  const [rebuy, setRebuy] = useState<boolean | null>(bottle.rebuy ?? null)
  const [qpr, setQpr] = useState<number | null>(bottle.qpr ?? null)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)

  // Tasting photo state
  const [showPhotoOptions, setShowPhotoOptions] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [deletingPhotoIndex, setDeletingPhotoIndex] = useState<number | null>(null)
  const tastingPhotoInputRef = useRef<HTMLInputElement>(null)
  const tastingPhotoGalleryRef = useRef<HTMLInputElement>(null)

  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const handleSaveTastingNote = async () => {
    setSaving(true)
    const noteValue = tastingNote || null
    const { error } = await supabase
      .from('bottles')
      .update({
        tasting_note: noteValue,
        rating,
        rebuy,
        qpr,
        ...(!noteValue ? { tasting_tags: null } : {}),
      })
      .eq('id', bottle.id)

    if (!error) {
      track('tasting_saved')
      triggerProfileRecompute()
      extractAndSaveTags({ ...bottle, tasting_note: noteValue, rating, rebuy, qpr })
      await onRefetch()
    }
    setSaving(false)
  }

  const handleTastingPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingFile(file)
    setShowPhotoOptions(false)
    setShowLabelPicker(true)
    e.target.value = ''
  }

  const handleLabelSelect = async (label?: string) => {
    if (!pendingFile) return

    setShowLabelPicker(false)
    setUploadingPhoto(true)

    try {
      const photoUrl = await uploadPhoto(pendingFile, buildTastingPhotoFilename())

      const newPhoto: TastingPhoto = {
        url: photoUrl!,
        label,
        taken_at: new Date().toISOString(),
      }

      const existingPhotos = (bottle.tasting_photos as TastingPhoto[]) || []
      const updatedPhotos = [...existingPhotos, newPhoto]

      const { error } = await supabase
        .from('bottles')
        .update({ tasting_photos: updatedPhotos })
        .eq('id', bottle.id)

      if (!error) {
        await onRefetch()
      }
    } catch (err) {
      console.error('Upload error:', err)
    }

    setPendingFile(null)
    setUploadingPhoto(false)
  }

  const handleRemoveTastingPhoto = async (indexToRemove: number) => {
    const existingPhotos = (bottle.tasting_photos as TastingPhoto[]) || []
    if (!existingPhotos[indexToRemove]) return

    setDeletingPhotoIndex(indexToRemove)

    try {
      const updatedPhotos = existingPhotos.filter((_, index) => index !== indexToRemove)
      const { error } = await supabase
        .from('bottles')
        .update({ tasting_photos: updatedPhotos })
        .eq('id', bottle.id)

      if (!error) {
        await onRefetch()
      }
    } catch (err) {
      console.error('Delete tasting photo error:', err)
    }

    setDeletingPhotoIndex(null)
  }

  const handleShare = async () => {
    setSharing(true)

    try {
      const title = bottle.domaine || bottle.appellation || 'Vin'
      const lines: string[] = []
      const shareEmoji = getShareEmoji(bottle.couleur)

      lines.push(`${shareEmoji} ${title}${bottle.cuvee ? ` « ${bottle.cuvee} »` : ''}${bottle.millesime ? ` ${bottle.millesime}` : ''}`)
      if (bottle.appellation && bottle.domaine) {
        lines.push(bottle.appellation)
      }
      lines.push('')
      if (tastingNote) {
        lines.push(tastingNote)
        lines.push('')
      }

      lines.push('—\nPartagé avec Celestin\nMyCelestin.com')

      const text = lines.join('\n')

      const photoEntries = [
        bottle.photo_url ? { url: bottle.photo_url, label: 'principale' } : null,
        ...(((bottle.tasting_photos as TastingPhoto[]) || []).map((photo) => ({
          url: photo.url,
          label: photo.label || 'degustation',
        }))),
      ].filter((entry): entry is { url: string; label: string } => !!entry?.url)

      if (photoEntries.length > 0 && navigator.canShare) {
        try {
          const uniquePhotoEntries = Array.from(
            new Map(photoEntries.map((entry) => [entry.url, entry])).values(),
          )
          const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_') || 'vin'
          const downloadResults = await Promise.allSettled(
            uniquePhotoEntries.map(async (entry, index) => {
              const response = await fetch(entry.url)
              const blob = await response.blob()
              const mimeType = blob.type || 'image/jpeg'
              const extension = mimeType.includes('png')
                ? 'png'
                : mimeType.includes('webp')
                  ? 'webp'
                  : 'jpg'
              const safeLabel = entry.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
              const fileName = `${safeTitle}_${index + 1}_${safeLabel}.${extension}`
              return new File([blob], fileName, { type: mimeType })
            }),
          )
          const files = downloadResults
            .filter((result): result is PromiseFulfilledResult<File> => result.status === 'fulfilled')
            .map((result) => result.value)

          if (files.length > 0 && navigator.canShare({ files })) {
            await navigator.share({ text, files })
            track('bottle_shared')
            setSharing(false)
            return
          }
        } catch {
          // Fall back to text-only share
        }
      }

      if (navigator.share) {
        await navigator.share({ text })
        track('bottle_shared')
      }
    } catch (err) {
      console.log('Share cancelled or failed:', err)
    }

    setSharing(false)
  }

  const handleBatchSaveAndNext = async () => {
    setSaving(true)

    const hasChanges =
      tastingNote !== (bottle.tasting_note || '') ||
      rating !== (bottle.rating ?? null) ||
      rebuy !== (bottle.rebuy ?? null) ||
      qpr !== (bottle.qpr ?? null)

    if (hasChanges) {
      const noteVal = tastingNote || null
      await supabase
        .from('bottles')
        .update({
          tasting_note: noteVal,
          rating,
          rebuy,
          qpr,
          ...(!noteVal ? { tasting_tags: null } : {}),
        })
        .eq('id', bottle.id)
      extractAndSaveTags({ ...bottle, tasting_note: noteVal, rating, rebuy, qpr })
    }

    setSaving(false)
    onSaveAndNext?.()
  }

  const isSaving = saving || !!savingBatch

  return (
    <div className="tasting-section-anim mx-4 mt-[14px]">
      {/* Hidden tasting photo inputs */}
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
          {bottle.tasting_photos && bottle.tasting_photos.length > 0 && (
            (bottle.tasting_photos as TastingPhoto[]).map((photo, index) => (
              <div key={index} className="relative">
                <img
                  src={photo.url}
                  alt={photo.label || 'Photo'}
                  className="h-[52px] w-[52px] rounded-lg object-cover cursor-zoom-in"
                  onClick={() => onZoom(photo.url, photo.label)}
                />
                {photo.label && (
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 rounded-b-lg">
                    {photo.label}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Supprimer la photo"
                  onClick={() => void handleRemoveTastingPhoto(index)}
                  disabled={deletingPhotoIndex === index}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/85 disabled:opacity-60"
                >
                  {deletingPhotoIndex === index ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
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
        {/* Rating, Rebuy, QPR controls */}
        <div className="border-t border-[var(--border-color)] px-[14px] py-3 flex flex-col gap-3">
          {/* Rating stars */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--text-muted)] w-12 shrink-0">Note</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-0.5 transition-colors"
                  onClick={() => setRating(rating === star ? null : star)}
                >
                  <Star
                    className={`h-[22px] w-[22px] ${
                      rating && star <= rating
                        ? 'fill-[var(--accent)] text-[var(--accent)]'
                        : 'fill-none text-[var(--text-muted)]'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Rebuy + QPR row */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                rebuy
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)]'
              }`}
              onClick={() => setRebuy(rebuy ? null : true)}
            >
              <RefreshCw className="h-3 w-3" />
              À racheter
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] text-[var(--text-muted)] mr-0.5">Q/P</span>
              {([
                { value: 1, label: 'Cher' },
                { value: 2, label: 'Correct' },
                { value: 3, label: 'Pépite' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                    qpr === option.value
                      ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                      : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)]'
                  }`}
                  onClick={() => setQpr(qpr === option.value ? null : option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--border-color)] py-2.5 px-[14px]">
          {isBatchMode ? (
            <button
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-light)] transition-colors disabled:opacity-50"
              onClick={handleBatchSaveAndNext}
              disabled={isSaving}
            >
              {isSaving ? (
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
              disabled={isSaving}
            >
              {isSaving ? (
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
  )
}
