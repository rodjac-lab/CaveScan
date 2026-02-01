import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Autocomplete } from '@/components/Autocomplete'
import { supabase } from '@/lib/supabase'
import { useZones } from '@/hooks/useZones'
import { useBottle, useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { WINE_COLORS, type WineColor } from '@/lib/types'

export default function EditBottle() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { bottle, loading: bottleLoading, error: bottleError } = useBottle(id)
  const { zones, loading: zonesLoading } = useZones()
  const domainesSuggestions = useDomainesSuggestions()
  const appellationsSuggestions = useAppellationsSuggestions()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)

  // Form state
  const [domaine, setDomaine] = useState('')
  const [appellation, setAppellation] = useState('')
  const [millesime, setMillesime] = useState('')
  const [couleur, setCouleur] = useState<WineColor | ''>('')
  const [zoneId, setZoneId] = useState('none')
  const [shelf, setShelf] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [marketValue, setMarketValue] = useState('')
  const [notes, setNotes] = useState('')

  // Populate form when bottle data loads
  useEffect(() => {
    if (bottle) {
      setDomaine(bottle.domaine || '')
      setAppellation(bottle.appellation || '')
      setMillesime(bottle.millesime?.toString() || '')
      setCouleur(bottle.couleur || '')
      setZoneId(bottle.zone_id || 'none')
      setShelf(bottle.shelf || '')
      setPurchasePrice(bottle.purchase_price?.toString() || '')
      setMarketValue(bottle.market_value?.toString() || '')
      setNotes(bottle.notes || '')
    }
  }, [bottle])

  const handleMillesimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setMillesime(val)
  }

  const handleSave = async () => {
    if (!bottle) return

    if (!domaine && !appellation) {
      setError('Veuillez renseigner au moins le domaine ou l\'appellation')
      return
    }

    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('bottles')
      .update({
        domaine: domaine || null,
        appellation: appellation || null,
        millesime: millesime ? parseInt(millesime) : null,
        couleur: couleur || null,
        zone_id: zoneId === 'none' ? null : zoneId,
        shelf: shelf || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice.replace(',', '.')) : null,
        market_value: marketValue ? parseFloat(marketValue.replace(',', '.')) : null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bottle.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
    } else {
      navigate(`/bottle/${bottle.id}`)
    }
  }

  if (bottleLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
      </div>
    )
  }

  if (bottleError || !bottle) {
    return (
      <div className="flex-1 p-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {bottleError || 'Bouteille non trouvée'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-xl font-bold">Modifier la bouteille</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Photo preview */}
      {(bottle.photo_url || bottle.photo_url_back) && (
        <Card className="mb-4">
          <CardContent className="p-2">
            <div className="flex gap-2">
              {bottle.photo_url && (
                <div className="flex-1">
                  <img
                    src={bottle.photo_url}
                    alt="Etiquette avant"
                    className="max-h-24 w-full rounded object-contain bg-black/20 cursor-zoom-in"
                    onClick={() => setZoomImage({ src: bottle.photo_url!, label: 'Avant' })}
                  />
                </div>
              )}
              {bottle.photo_url_back && (
                <div className="flex-1">
                  <img
                    src={bottle.photo_url_back}
                    alt="Etiquette arriere"
                    className="max-h-24 w-full rounded object-contain bg-black/20 cursor-zoom-in"
                    onClick={() => setZoomImage({ src: bottle.photo_url_back!, label: 'Arriere' })}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="domaine">Domaine / Producteur</Label>
          <Autocomplete
            id="domaine"
            value={domaine}
            onChange={setDomaine}
            suggestions={domainesSuggestions}
            placeholder="ex: Chateau Margaux"
          />
        </div>

        <div>
          <Label htmlFor="appellation">Appellation</Label>
          <Autocomplete
            id="appellation"
            value={appellation}
            onChange={setAppellation}
            suggestions={appellationsSuggestions}
            placeholder="ex: Margaux"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="millesime">Millesime</Label>
            <Input
              id="millesime"
              inputMode="numeric"
              pattern="[0-9]*"
              value={millesime}
              onChange={handleMillesimeChange}
              placeholder="ex: 2020"
              maxLength={4}
            />
          </div>

          <div>
            <Label htmlFor="couleur">Couleur</Label>
            <Select value={couleur} onValueChange={(v) => setCouleur(v as WineColor)}>
              <SelectTrigger id="couleur">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {WINE_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="zone">Zone de stockage</Label>
          <Select value={zoneId} onValueChange={setZoneId} disabled={zonesLoading}>
            <SelectTrigger id="zone">
              <SelectValue placeholder="Choisir une zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune zone</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="shelf">Etagere / Emplacement</Label>
          <Input
            id="shelf"
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
            placeholder="ex: Etagere 1, Haut..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="price">Prix d'achat (EUR)</Label>
            <Input
              id="price"
              inputMode="decimal"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="ex: 12.50"
            />
          </div>

          <div>
            <Label htmlFor="marketValue">Valeur marchande (EUR)</Label>
            <Input
              id="marketValue"
              inputMode="decimal"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="ex: 25.00"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes personnelles sur cette bouteille..."
            rows={3}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>
            Annuler
          </Button>
          <Button
            className="flex-1 bg-wine-900 hover:bg-wine-800"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

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
