import { Check, X } from 'lucide-react'
import { useSwipeable } from 'react-swipeable'
import { Button } from '@/components/ui/button'
import { BatchItemForm, type BatchItemData } from '@/components/BatchItemForm'
import type { Zone } from '@/lib/types'

interface BatchConfirmSwipeableProps {
  currentBatchIndex: number
  batchItems: BatchItemData[]
  zones: Zone[]
  zonesLoading: boolean
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
  onUpdate: (updates: Partial<BatchItemData>) => void
  onNavigate: (index: number) => void
  onBackPhotoSelect: (file: File) => void
  onZoomImage: (src: string, label?: string) => void
  onSkip: () => void
  onSave: () => void
}

export function BatchConfirmSwipeable({
  currentBatchIndex,
  batchItems,
  zones,
  zonesLoading,
  domainesSuggestions,
  appellationsSuggestions,
  onUpdate,
  onNavigate,
  onBackPhotoSelect,
  onZoomImage,
  onSkip,
  onSave,
}: BatchConfirmSwipeableProps) {
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (currentBatchIndex < batchItems.length - 1) onNavigate(currentBatchIndex + 1)
    },
    onSwipedRight: () => {
      if (currentBatchIndex > 0) onNavigate(currentBatchIndex - 1)
    },
    preventScrollOnSwipe: false,
    trackTouch: true,
    delta: 40,
  })

  const currentItem = batchItems[currentBatchIndex]
  const unsavedCount = batchItems.filter((item) => !item.saved && !item.skipped).length

  return (
    <div {...swipeHandlers} className="mt-6 space-y-4">
      <div className="text-center mb-4">
        <p className="text-lg font-semibold text-[var(--text-primary)]">
          {unsavedCount} bouteille{unsavedCount > 1 ? 's' : ''} restante{unsavedCount > 1 ? 's' : ''}
        </p>
      </div>

      <BatchItemForm
        item={currentItem}
        currentIndex={currentBatchIndex}
        totalItems={batchItems.length}
        allItems={batchItems}
        zones={zones}
        zonesLoading={zonesLoading}
        domainesSuggestions={domainesSuggestions}
        appellationsSuggestions={appellationsSuggestions}
        onUpdate={onUpdate}
        onNavigate={onNavigate}
        onBackPhotoSelect={onBackPhotoSelect}
        onZoomImage={onZoomImage}
      />

      <div className="flex gap-3 pt-4">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          <X className="mr-2 h-4 w-4" />
          {unsavedCount > 1 ? 'Passer' : 'Terminer'}
        </Button>
        {currentItem.saved ? (
          <Button
            variant="outline"
            className="flex-1 border-green-500 text-green-600"
            disabled
          >
            <Check className="mr-2 h-4 w-4" />
            Deja enregistree
          </Button>
        ) : currentItem.skipped ? (
          <Button
            variant="outline"
            className="flex-1 border-[var(--text-muted)] text-[var(--text-muted)]"
            disabled
          >
            <X className="mr-2 h-4 w-4" />
            Ignoree
          </Button>
        ) : (
          <Button
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            onClick={onSave}
          >
            <Check className="mr-2 h-4 w-4" />
            Enregistrer
          </Button>
        )}
      </div>
    </div>
  )
}
