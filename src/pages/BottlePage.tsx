import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Calendar, Wine, Loader2, Save, Share2, Euro } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useBottle } from '@/hooks/useBottles'
import { getWineColorLabel, type WineColor } from '@/lib/types'

const COLOR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-red-900/30 text-red-300',
  blanc: 'bg-amber-100/30 text-amber-200',
  rosé: 'bg-pink-300/30 text-pink-300',
  bulles: 'bg-yellow-200/30 text-yellow-200',
}

export default function BottlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { bottle, loading, error, refetch } = useBottle(id)

  const [tastingNote, setTastingNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [sharing, setSharing] = useState(false)

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
          {bottle.domaine || bottle.appellation || 'Vin'}
        </h1>
        {bottle.couleur && (
          <span className={`rounded-full px-3 py-1 text-sm ${COLOR_STYLES[bottle.couleur]}`}>
            {getWineColorLabel(bottle.couleur)}
          </span>
        )}
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
                  className={`w-full object-contain bg-black/20 ${bottle.photo_url_back ? 'max-h-48 rounded' : 'max-h-64'}`}
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
                  className={`w-full object-contain bg-black/20 ${bottle.photo_url ? 'max-h-48 rounded' : 'max-h-64'}`}
                />
                {bottle.photo_url && (
                  <p className="text-xs text-center text-muted-foreground mt-1">Arrière</p>
                )}
              </div>
            )}
          </div>
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
    </div>
  )
}
