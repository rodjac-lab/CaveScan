import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Loader2, Check, X, Wine, Search, PenLine, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useBottles } from '@/hooks/useBottles'
import { normalizeWineColor, type WineColor, type BottleWithZone, type WineExtraction } from '@/lib/types'

type Step = 'choose' | 'extracting' | 'matching' | 'select' | 'confirm' | 'not_found' | 'saving'

const MAX_IMAGE_SIZE = 1200
const IMAGE_QUALITY = 0.85

const COLOR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-red-900/30 text-red-300',
  blanc: 'bg-amber-100/30 text-amber-200',
  rose: 'bg-pink-300/30 text-pink-300',
  bulles: 'bg-yellow-200/30 text-yellow-200',
}

export default function RemoveBottle() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)
  const { bottles } = useBottles()

  const [step, setStep] = useState<Step>('choose')
  const [searchQuery, setSearchQuery] = useState('')
  const [matches, setMatches] = useState<BottleWithZone[]>([])
  const [selectedBottle, setSelectedBottle] = useState<BottleWithZone | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<WineExtraction | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  const filteredBottles = searchQuery.length >= 2
    ? bottles.filter(b => {
        const query = searchQuery.toLowerCase()
        return (
          b.domaine?.toLowerCase().includes(query) ||
          b.appellation?.toLowerCase().includes(query) ||
          b.millesime?.toString().includes(query)
        )
      })
    : []

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
      setError('Échec de la reconnaissance. Essayez la recherche manuelle.')
      setStep('choose')
    }
  }

  const handleSelectBottle = (bottle: BottleWithZone) => {
    setSelectedBottle(bottle)
    setStep('confirm')
  }

  const handleConfirmRemove = async () => {
    if (!selectedBottle) return

    setStep('saving')

    const { error } = await supabase
      .from('bottles')
      .update({
        status: 'drunk',
        drunk_at: new Date().toISOString()
      })
      .eq('id', selectedBottle.id)

    if (error) {
      setError('Échec de l\'enregistrement')
      setStep('confirm')
    } else {
      navigate(`/bottle/${selectedBottle.id}`)
    }
  }

  const handleLogTasting = async () => {
    if (!extraction) return

    setStep('saving')

    try {
      let photoUrl: string | null = null

      // Upload photo if exists
      if (photoFile) {
        const compressedBlob = await resizeImage(photoFile, MAX_IMAGE_SIZE, IMAGE_QUALITY)
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

  const handleReset = () => {
    setStep('choose')
    setSearchQuery('')
    setMatches([])
    setSelectedBottle(null)
    setError(null)
    setExtraction(null)
    setPhotoFile(null)
  }

  return (
    <div className="flex-1 p-4">
      <h1 className="text-2xl font-bold">Déguster</h1>

      {error && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step: Choose method */}
      {step === 'choose' && (
        <div className="mt-6 space-y-4">
          <p className="text-muted-foreground">
            Scannez l'étiquette du vin que vous dégustez
          </p>

          {/* Camera input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Gallery input */}
          <input
            ref={fileInputGalleryRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            size="lg"
            className="w-full h-20 flex-col gap-2 bg-wine-900 hover:bg-wine-800"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-7 w-7" />
            <span>Photographier</span>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="w-full h-14 flex-col gap-1"
            onClick={() => fileInputGalleryRef.current?.click()}
          >
            <ImageIcon className="h-5 w-5" />
            <span>Choisir une photo</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou rechercher</span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un vin..."
              className="pl-10"
            />
          </div>

          {/* Search results */}
          {filteredBottles.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredBottles.map((bottle) => (
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
                        {bottle.domaine || bottle.appellation || 'Vin'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {bottle.millesime && `${bottle.millesime} - `}
                        {bottle.zone?.name}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && filteredBottles.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Aucun résultat pour "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {/* Step: Extracting */}
      {(step === 'extracting' || step === 'matching') && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
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
                      {bottle.domaine || bottle.appellation || 'Vin'}
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
                {extraction.domaine || extraction.appellation || 'Vin'}
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
              className="flex-1 bg-wine-900 hover:bg-wine-800"
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
                      className={`rounded object-contain ${selectedBottle.photo_url_back ? 'flex-1 max-h-24' : 'w-full max-h-32'}`}
                    />
                  )}
                  {selectedBottle.photo_url_back && (
                    <img
                      src={selectedBottle.photo_url_back}
                      alt="Étiquette arrière"
                      className={`rounded object-contain ${selectedBottle.photo_url ? 'flex-1 max-h-24' : 'w-full max-h-32'}`}
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

          <p className="text-center text-muted-foreground">
            Confirmer la sortie de cette bouteille ?
          </p>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button
              className="flex-1 bg-wine-900 hover:bg-wine-800"
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
          <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
          <span className="text-muted-foreground">Enregistrement...</span>
        </div>
      )}
    </div>
  )
}

function findMatches(
  bottles: BottleWithZone[],
  extraction: { domaine?: string; appellation?: string; millesime?: number }
): BottleWithZone[] {
  return bottles.filter(bottle => {
    let score = 0

    if (extraction.domaine && bottle.domaine) {
      if (bottle.domaine.toLowerCase().includes(extraction.domaine.toLowerCase()) ||
          extraction.domaine.toLowerCase().includes(bottle.domaine.toLowerCase())) {
        score += 3
      }
    }

    if (extraction.appellation && bottle.appellation) {
      if (bottle.appellation.toLowerCase().includes(extraction.appellation.toLowerCase()) ||
          extraction.appellation.toLowerCase().includes(bottle.appellation.toLowerCase())) {
        score += 2
      }
    }

    if (extraction.millesime && bottle.millesime === extraction.millesime) {
      score += 2
    }

    return score >= 2
  })
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
    return { width: maxSize, height: (height / width) * maxSize }
  }

  return { width: (width / height) * maxSize, height: maxSize }
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
