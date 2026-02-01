import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Loader2, Check, X, Wine, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Autocomplete } from '@/components/Autocomplete'
import { supabase } from '@/lib/supabase'
import { useZones } from '@/hooks/useZones'
import { useDomainesSuggestions, useAppellationsSuggestions } from '@/hooks/useBottles'
import { WINE_COLORS, type WineColor, type WineExtraction } from '@/lib/types'

type Step = 'capture' | 'extracting' | 'confirm' | 'saving'

const MAX_IMAGE_SIZE = 1200
const IMAGE_QUALITY = 0.85

export default function AddBottle() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputBackRef = useRef<HTMLInputElement>(null)
  const { zones, loading: zonesLoading } = useZones()
  const domainesSuggestions = useDomainesSuggestions()
  const appellationsSuggestions = useAppellationsSuggestions()

  const [step, setStep] = useState<Step>('capture')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFileBack, setPhotoFileBack] = useState<File | null>(null)
  const [photoPreviewBack, setPhotoPreviewBack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Extracted/editable data
  const [domaine, setDomaine] = useState('')
  const [appellation, setAppellation] = useState('')
  const [millesime, setMillesime] = useState('')
  const [couleur, setCouleur] = useState<WineColor | ''>('')
  const [zoneId, setZoneId] = useState('')
  const [shelf, setShelf] = useState('')
  const [rawExtraction, setRawExtraction] = useState<WineExtraction | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
    setStep('extracting')

    try {
      const base64 = await fileToBase64(file)

      const { data, error } = await supabase.functions.invoke('extract-wine', {
        body: { image_base64: base64 },
      })

      if (error) throw error

      // Pre-fill form with extracted data
      setRawExtraction(data)
      setDomaine(data.domaine || '')
      setAppellation(data.appellation || '')
      setMillesime(data.millesime?.toString() || '')
      setCouleur(data.couleur || '')
      setStep('confirm')
    } catch (err) {
      console.error('Extraction error:', err)
      setError('Échec de l\'extraction. Vous pouvez saisir manuellement.')
      setStep('confirm')
    }
  }

  const handleBackPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoFileBack(file)
    setPhotoPreviewBack(URL.createObjectURL(file))

    // If we have incomplete data, try to extract from back label too
    if (!domaine || !appellation || !millesime) {
      setStep('extracting')
      try {
        const base64 = await fileToBase64(file)
        const { data, error } = await supabase.functions.invoke('extract-wine', {
          body: { image_base64: base64 },
        })

        if (!error && data) {
          // Only fill in missing fields
          if (!domaine && data.domaine) setDomaine(data.domaine)
          if (!appellation && data.appellation) setAppellation(data.appellation)
          if (!millesime && data.millesime) setMillesime(data.millesime.toString())
          if (!couleur && data.couleur) setCouleur(data.couleur)
        }
      } catch (err) {
        console.error('Back extraction error:', err)
      }
      setStep('confirm')
    }
  }

  const handleSave = async () => {
    if (!domaine && !appellation) {
      setError('Veuillez renseigner au moins le domaine ou l\'appellation')
      return
    }

    setStep('saving')
    setError(null)

    try {
      let photoUrl: string | null = null
      let photoUrlBack: string | null = null
      const timestamp = Date.now()

      // Upload compressed front photo if exists
      if (photoFile) {
        const compressedBlob = await resizeImage(photoFile, MAX_IMAGE_SIZE, IMAGE_QUALITY)
        const fileName = `${timestamp}-front.jpg`
        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('wine-labels')
          .getPublicUrl(fileName)

        photoUrl = urlData.publicUrl
      }

      // Upload compressed back photo if exists
      if (photoFileBack) {
        const compressedBlob = await resizeImage(photoFileBack, MAX_IMAGE_SIZE, IMAGE_QUALITY)
        const fileName = `${timestamp}-back.jpg`
        const { error: uploadError } = await supabase.storage
          .from('wine-labels')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('wine-labels')
          .getPublicUrl(fileName)

        photoUrlBack = urlData.publicUrl
      }

      // Insert bottle
      const { error: insertError } = await supabase.from('bottles').insert({
        domaine: domaine || null,
        appellation: appellation || null,
        millesime: millesime ? parseInt(millesime) : null,
        couleur: couleur || null,
        zone_id: zoneId || null,
        shelf: shelf || null,
        photo_url: photoUrl,
        photo_url_back: photoUrlBack,
        raw_extraction: rawExtraction,
        status: 'in_stock',
      })

      if (insertError) throw insertError

      // Success - go home
      navigate('/')
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
      setStep('confirm')
    }
  }

  const handleReset = () => {
    setStep('capture')
    setPhotoFile(null)
    setPhotoPreview(null)
    setPhotoFileBack(null)
    setPhotoPreviewBack(null)
    setDomaine('')
    setAppellation('')
    setMillesime('')
    setCouleur('')
    setZoneId('')
    setShelf('')
    setRawExtraction(null)
    setError(null)
  }

  function handleMillesimeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setMillesime(val)
  }

  return (
    <div className="flex-1 p-4">
      <h1 className="text-2xl font-bold">Ajouter une bouteille</h1>

      {error && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step: Capture */}
      {step === 'capture' && (
        <div className="mt-6 space-y-4">
          <p className="text-muted-foreground">
            Prenez une photo de l'étiquette ou saisissez manuellement
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            size="lg"
            className="w-full h-32 flex-col gap-2 bg-wine-900 hover:bg-wine-800"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-8 w-8" />
            <span>Photographier l'étiquette</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setStep('confirm')}
          >
            <Wine className="mr-2 h-4 w-4" />
            Saisie manuelle
          </Button>
        </div>
      )}

      {/* Step: Extracting */}
      {step === 'extracting' && (
        <div className="mt-6 flex flex-col items-center gap-4">
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Étiquette"
              className="max-h-48 rounded-lg object-contain"
            />
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Analyse de l'étiquette...</span>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <div className="mt-6 space-y-4">
          {/* Photo previews */}
          {(photoPreview || photoPreviewBack) && (
            <Card>
              <CardContent className="p-2">
                <div className="flex gap-2">
                  {photoPreview && (
                    <div className="flex-1">
                      <img
                        src={photoPreview}
                        alt="Étiquette avant"
                        className="max-h-28 w-full rounded object-contain"
                      />
                      <p className="text-xs text-center text-muted-foreground mt-1">Avant</p>
                    </div>
                  )}
                  {photoPreviewBack && (
                    <div className="flex-1">
                      <img
                        src={photoPreviewBack}
                        alt="Étiquette arrière"
                        className="max-h-28 w-full rounded object-contain"
                      />
                      <p className="text-xs text-center text-muted-foreground mt-1">Arrière</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add back photo button */}
          {photoPreview && !photoPreviewBack && (
            <>
              <input
                ref={fileInputBackRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleBackPhotoSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileInputBackRef.current?.click()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter la contre-étiquette
              </Button>
            </>
          )}

          <div className="space-y-3">
            <div>
              <Label htmlFor="domaine">Domaine / Producteur</Label>
              <Autocomplete
                id="domaine"
                value={domaine}
                onChange={setDomaine}
                suggestions={domainesSuggestions}
                placeholder="Château Margaux"
              />
            </div>

            <div>
              <Label htmlFor="appellation">Appellation</Label>
              <Autocomplete
                id="appellation"
                value={appellation}
                onChange={setAppellation}
                suggestions={appellationsSuggestions}
                placeholder="Margaux"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="millesime">Millésime</Label>
                <Input
                  id="millesime"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={millesime}
                  onChange={handleMillesimeChange}
                  placeholder="2020"
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

            <div className="pt-2 border-t">
              <Label htmlFor="zone">Zone de stockage</Label>
              <Select value={zoneId} onValueChange={setZoneId} disabled={zonesLoading}>
                <SelectTrigger id="zone">
                  <SelectValue placeholder="Choisir une zone" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="shelf">Étagère / Emplacement</Label>
              <Input
                id="shelf"
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
                placeholder="Étagère 1, Haut, etc."
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button
              className="flex-1 bg-wine-900 hover:bg-wine-800"
              onClick={handleSave}
            >
              <Check className="mr-2 h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
          <span className="text-muted-foreground">Enregistrement...</span>
        </div>
      )}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  const resizedBlob = await resizeImage(file, MAX_IMAGE_SIZE, IMAGE_QUALITY)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(resizedBlob)
  })
}

function calculateResizedDimensions(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height }
  }

  if (width > height) {
    return {
      width: maxSize,
      height: (height / width) * maxSize,
    }
  }

  return {
    width: (width / height) * maxSize,
    height: maxSize,
  }
}

async function resizeImage(file: File, maxSize: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const { width, height } = calculateResizedDimensions(img.width, img.height, maxSize)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Could not create blob'))
          }
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl
  })
}
