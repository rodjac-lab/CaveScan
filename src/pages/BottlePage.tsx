import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Calendar, Wine, Loader2, Save, Share2, Euro, Pencil, Plus, Camera, ImageIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useBottle } from '@/hooks/useBottles'
import { getWineColorLabel, type TastingPhoto } from '@/lib/types'
import { resizeImage } from '@/lib/image'

const TASTING_LABELS = ['Bouchon', 'Bouteille', 'Autre']

export default function BottlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { bottle, loading, error, refetch } = useBottle(id)

  const [tastingNote, setTastingNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)

  // Tasting photo state
  const [showPhotoOptions, setShowPhotoOptions] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const tastingPhotoInputRef = useRef<HTMLInputElement>(null)
  const tastingPhotoGalleryRef = useRef<HTMLInputElement>(null)

  // Sync tasting note with bottle data
  useEffect(() => {
    if (bottle?.tasting_note) {
      setTastingNote(bottle.tasting_note)
    }
  }, [bottle?.tasting_note])

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
      navigate('/')
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

  return (
    <div className="flex-1 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-xl font-bold truncate">
          {bottle.cuvee || bottle.domaine || bottle.appellation || 'Vin'}
        </h1>
        {bottle.couleur && (
          <div
            className="w-[3px] h-6 rounded-full"
            style={{ backgroundColor: `var(--${
              bottle.couleur === 'rouge' ? 'red-wine' :
              bottle.couleur === 'blanc' ? 'white-wine' :
              bottle.couleur === 'rose' ? 'rose-wine' :
              'champagne'
            })` }}
            title={getWineColorLabel(bottle.couleur)}
          />
        )}
        <Button variant="ghost" size="icon" onClick={() => navigate(`/bottle/${bottle.id}/edit`)}>
          <Pencil className="h-5 w-5" />
        </Button>
      </div>

      {/* Photos */}
      {(bottle.photo_url || bottle.photo_url_back) && (
        <Card className="mb-4 overflow-hidden">
          <div className={`flex ${bottle.photo_url && bottle.photo_url_back ? 'gap-2 p-2' : ''}`}>
            {bottle.photo_url && (
              <div className={bottle.photo_url_back ? 'flex-1' : 'w-full'}>
                <img
                  src={bottle.photo_url}
                  alt="Étiquette avant"
                  className={`w-full object-contain bg-black/20 cursor-zoom-in ${bottle.photo_url_back ? 'max-h-48 rounded' : 'max-h-64'}`}
                  onClick={() => setZoomImage({ src: bottle.photo_url!, label: 'Avant' })}
                />
                {bottle.photo_url_back && (
                  <p className="text-xs text-center text-muted-foreground mt-1">Avant</p>
                )}
              </div>
            )}
            {bottle.photo_url_back && (
              <div className={bottle.photo_url ? 'flex-1' : 'w-full'}>
                <img
                  src={bottle.photo_url_back}
                  alt="Étiquette arrière"
                  className={`w-full object-contain bg-black/20 cursor-zoom-in ${bottle.photo_url ? 'max-h-48 rounded' : 'max-h-64'}`}
                  onClick={() => setZoomImage({ src: bottle.photo_url_back!, label: 'Arriere' })}
                />
                {bottle.photo_url && (
                  <p className="text-xs text-center text-muted-foreground mt-1">Arrière</p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tasting Photos */}
      {isDrunk && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <Label className="text-muted-foreground mb-3 block">Photos de dégustation</Label>

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

            {/* Existing tasting photos */}
            {bottle.tasting_photos && (bottle.tasting_photos as TastingPhoto[]).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {(bottle.tasting_photos as TastingPhoto[]).map((photo, index) => (
                  <div key={index} className="relative">
                    <img
                      src={photo.url}
                      alt={photo.label || 'Photo de dégustation'}
                      className="h-20 w-20 rounded object-cover cursor-zoom-in"
                      onClick={() => setZoomImage({ src: photo.url, label: photo.label })}
                    />
                    {photo.label && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 rounded-b">
                        {photo.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add photo button / options */}
            {uploadingPhoto ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-wine-600" />
                <span className="ml-2 text-sm text-muted-foreground">Upload en cours...</span>
              </div>
            ) : showLabelPicker ? (
              <div>
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
              </div>
            ) : showPhotoOptions ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setShowPhotoOptions(false)
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
                    setShowPhotoOptions(false)
                    tastingPhotoGalleryRef.current?.click()
                  }}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Galerie
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPhotoOptions(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowPhotoOptions(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une photo
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          {bottle.domaine && (
            <div>
              <Label className="text-muted-foreground">Domaine</Label>
              <p className="font-medium">{bottle.domaine}</p>
            </div>
          )}

          {bottle.cuvee && (
            <div>
              <Label className="text-muted-foreground">Cuvée</Label>
              <p className="font-medium">{bottle.cuvee}</p>
            </div>
          )}

          {bottle.appellation && (
            <div>
              <Label className="text-muted-foreground">Appellation</Label>
              <p className="font-medium">{bottle.appellation}</p>
            </div>
          )}

          {bottle.millesime && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{bottle.millesime}</span>
            </div>
          )}

          {bottle.zone && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>
                {bottle.zone.name}
                {bottle.shelf && ` - ${bottle.shelf}`}
              </span>
            </div>
          )}

          {(bottle.purchase_price || bottle.market_value) && (
            <div className="flex items-center gap-2">
              <Euro className="h-4 w-4 text-muted-foreground" />
              <span>
                {bottle.purchase_price && `${bottle.purchase_price.toFixed(2)} €`}
                {bottle.purchase_price && bottle.market_value && ' · '}
                {bottle.market_value && (
                  <span className="text-muted-foreground">
                    Valeur: {bottle.market_value.toFixed(2)} €
                  </span>
                )}
              </span>
            </div>
          )}

          {bottle.notes && (
            <div>
              <Label className="text-muted-foreground">Notes</Label>
              <p className="text-sm">{bottle.notes}</p>
            </div>
          )}

          {isDrunk && bottle.drunk_at && (
            <div className="pt-2 border-t">
              <Label className="text-muted-foreground">Bue le</Label>
              <p className="font-medium">
                {new Date(bottle.drunk_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tasting note (for drunk bottles) */}
      {isDrunk && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <Label htmlFor="tasting" className="text-muted-foreground">
              Note de dégustation
            </Label>
            <textarea
              id="tasting"
              value={tastingNote}
              onChange={(e) => setTastingNote(e.target.value)}
              placeholder="Vos impressions sur ce vin..."
              className="mt-2 w-full rounded-md border bg-input p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={4}
              spellCheck={true}
              autoCorrect="on"
              lang="fr"
              autoCapitalize="sentences"
            />
            <div className="flex gap-2 mt-3">
              <Button
                className="flex-1 bg-wine-900 hover:bg-wine-800"
                onClick={handleSaveTastingNote}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
              {canShare && (
                <Button
                  variant="outline"
                  onClick={handleShare}
                  disabled={sharing}
                >
                  {sharing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {!isDrunk && (
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleMarkAsDrunk}
          disabled={removing}
        >
          {removing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wine className="mr-2 h-4 w-4" />
          )}
          Marquer comme bue
        </Button>
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

