import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useBottle } from '@/hooks/useBottles'
import { getWineColorLabel } from '@/lib/types'
import { BottleIdentityCard } from '@/components/BottleIdentityCard'
import { TastingGuideCard } from '@/components/TastingGuideCard'
import { TastingSection } from '@/components/TastingSection'
import { CaveSection } from '@/components/CaveSection'
import { BottleDeleteDialog } from '@/components/BottleDeleteDialog'

const COLOR_CSS_VARS: Record<string, string> = {
  rouge: 'red-wine',
  blanc: 'white-wine',
  rose: 'rose-wine',
  bulles: 'champagne',
}

interface BatchState {
  batchIds?: string[]
  batchIndex?: number
  groupBottleIds?: string[]
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

  const [zoomImage, setZoomImage] = useState<{ src: string; label?: string } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleZoom = (src: string, label?: string) => setZoomImage({ src, label })

  const handleSaveAndNext = () => {
    if (batchState && batchIndex < totalBatch - 1) {
      const nextId = batchState.batchIds![batchIndex + 1]
      navigate(`/bottle/${nextId}`, {
        state: { batchIds: batchState.batchIds, batchIndex: batchIndex + 1 },
        replace: true
      })
    } else {
      navigate('/cheers')
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

  return (
    <div className="flex-1 overflow-y-auto">
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
            style={{ backgroundColor: `var(--${COLOR_CSS_VARS[bottle.couleur] ?? 'champagne'})` }}
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
      <BottleIdentityCard bottle={bottle} onZoom={handleZoom} />

      {/* ===== TASTING GUIDE ===== */}
      <TastingGuideCard bottle={bottle} />

      {/* ===== TASTING SECTION (drunk bottles) ===== */}
      {isDrunk && (
        <TastingSection
          bottle={bottle}
          onRefetch={refetch}
          onZoom={handleZoom}
          isBatchMode={!!isBatchMode}
          batchIndex={batchIndex}
          totalBatch={totalBatch}
          onSaveAndNext={handleSaveAndNext}
        />
      )}

      {/* ===== CAVE SECTIONS (in_stock bottles) ===== */}
      {!isDrunk && (
        <CaveSection bottle={bottle} onRefetch={refetch} groupBottleIds={batchState?.groupBottleIds} />
      )}

      {/* ===== DELETE ===== */}
      <div className="mx-4 mt-6 mb-2 flex justify-center">
        <button
          className="text-[13px] text-[var(--text-muted)] hover:text-red-600 transition-colors"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Supprimer cette bouteille
        </button>
      </div>

      {/* Bottom spacer for nav bar */}
      <div className="h-[90px]" />

      {/* ===== DELETE CONFIRMATION DIALOG ===== */}
      <BottleDeleteDialog
        bottle={bottle}
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onDeleted={refetch}
      />

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
