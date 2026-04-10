import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BatchProgress } from '@/components/BatchProgress'
import { BatchTastingItemForm } from '@/components/BatchTastingItemForm'
import { RemoveResultStep } from '@/components/RemoveResultStep'
import { useRemoveBottleFlow } from '@/hooks/useRemoveBottleFlow'

function RemoveBottleTitle() {
  return (
    <div className="mb-4">
      <p className="brand-text">Celestin</p>
      <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Dégustations</h1>
    </div>
  )
}

function RemoveBottleLoading({ label }: { label: string }) {
  return (
    <div className="flex-1 p-6">
      <RemoveBottleTitle />
      <div className="mt-10 flex flex-col items-center gap-3 transition-all duration-200 ease-out">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</p>
      </div>
    </div>
  )
}

export default function RemoveBottle() {
  const flow = useRemoveBottleFlow()

  if (flow.step === 'processing') {
    return <RemoveBottleLoading label="Analyse en cours..." />
  }

  if (flow.step === 'result' && flow.scanResult) {
    return (
      <RemoveResultStep
        scanResult={flow.scanResult}
        error={flow.error}
        showAlternatives={flow.showAlternatives}
        onPrimaryAction={flow.handlePrimaryAction}
        onSelectAlternative={flow.handleSelectAlternative}
        onToggleAlternatives={() => flow.setShowAlternatives((current) => !current)}
        onCancel={flow.resetScanResult}
      />
    )
  }

  if (flow.step === 'batch-extracting' && flow.activeBatchSession) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <RemoveBottleTitle />
        <BatchProgress
          items={flow.batchProgressItems}
          currentIndex={flow.batchExtractionCurrentIndex}
        />
        <div className="mt-6">
          <Button variant="outline" className="w-full" onClick={flow.goToDegustations}>
            Quitter le batch
          </Button>
        </div>
      </div>
    )
  }

  if (flow.step === 'batch-review' && flow.activeBatchSession) {
    const currentItem = flow.activeBatchSession.items[flow.currentBatchIndex]
    const unsavedCount = flow.activeBatchSession.items.filter((item) => !item.saved && !item.ignored).length
    const totalBatchItems = flow.activeBatchSession.items.length

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-4 pb-2">
          <p className="brand-text">Celestin</p>
          <h2 className="font-serif text-[16px] font-semibold text-[var(--text-primary)]">
            {flow.activeBatchSession.label}
          </h2>
        </div>

        <div {...flow.swipeHandlers} className="flex-1 min-h-0 overflow-y-auto px-6 pb-3 scrollbar-hide">
          {currentItem ? (
            <BatchTastingItemForm
              key={currentItem.id}
              item={currentItem}
              currentIndex={flow.currentBatchIndex}
              totalItems={totalBatchItems}
              allItems={flow.activeBatchSession.items}
              domainesSuggestions={flow.domainesSuggestions}
              appellationsSuggestions={flow.appellationsSuggestions}
              onNavigate={flow.setCurrentBatchIndex}
              onSave={flow.handleBatchItemSave}
              onSkip={flow.handleBatchItemSkip}
              onSelectAlternative={flow.handleBatchSelectAlternative}
              onUpdateExtraction={flow.handleUpdateBatchExtraction}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-3 border-t border-[var(--border-color)] bg-[var(--bg)]">
          {unsavedCount > 0 && (
            <Button
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-light)]"
              onClick={flow.handleBatchConfirmAllRemaining}
            >
              Tout valider les {unsavedCount} restants
            </Button>
          )}
          <Button variant="outline" className={`w-full ${unsavedCount > 0 ? 'mt-2' : ''}`} onClick={flow.goToDegustations}>
            Quitter le batch
          </Button>
        </div>
      </div>
    )
  }

  if (flow.step === 'saving' || flow.step === 'batch-saving') {
    return (
      <RemoveBottleLoading
        label={flow.step === 'saving' ? 'Enregistrement...' : 'Validation de la rafale...'}
      />
    )
  }

  return null
}
