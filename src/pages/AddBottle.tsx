import { BatchProgress } from '@/components/BatchProgress'
import { BatchConfirmSwipeable } from '@/components/BatchConfirmSwipeable'
import {
  AddBottleCaptureStep,
  AddBottleExtractingStep,
  AddBottleHeader,
  AddBottleSavingStep,
  AddBottleSingleConfirmStep,
  AddBottleZoomDialog,
} from '@/components/add-bottle/AddBottleSteps'
import { useAddBottleFlow } from '@/hooks/useAddBottleFlow'

export default function AddBottle() {
  const flow = useAddBottleFlow()
  const currentBatchItem = flow.batchItems[flow.currentBatchIndex]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 pb-28">
      <AddBottleHeader />

      {flow.error && (
        <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {flow.error}
        </div>
      )}

      {flow.step === 'capture' && (
        <AddBottleCaptureStep
          fileInputRef={flow.fileInputRef}
          fileInputBatchRef={flow.fileInputBatchRef}
          onFileSelect={flow.handleFileSelect}
          onBatchFileSelect={flow.handleBatchFileSelect}
          onManualEntry={() => flow.setStep('confirm')}
        />
      )}

      {flow.step === 'extracting' && (
        <AddBottleExtractingStep
          photoPreview={flow.photoPreview}
          onZoom={(src) => flow.setZoomImage({ src })}
        />
      )}

      {flow.step === 'batch-extracting' && (
        <BatchProgress
          items={flow.batchProgressItems}
          currentIndex={flow.batchExtractionIndex}
        />
      )}

      {flow.step === 'confirm' && (
        <AddBottleSingleConfirmStep
          photoPreview={flow.photoPreview}
          photoPreviewBack={flow.photoPreviewBack}
          fileInputBackRef={flow.fileInputBackRef}
          onBackPhotoSelect={flow.handleBackPhotoSelect}
          onZoom={(src, label) => flow.setZoomImage({ src, label })}
          domaine={flow.domaine}
          cuvee={flow.cuvee}
          appellation={flow.appellation}
          millesime={flow.millesime}
          couleur={flow.couleur}
          country={flow.country}
          region={flow.region}
          volumeL={flow.volumeL}
          onDomaineChange={flow.setDomaine}
          onCuveeChange={flow.setCuvee}
          onAppellationChange={flow.setAppellation}
          onMillesimeChange={flow.setMillesime}
          onCouleurChange={flow.setCouleur}
          onCountryChange={flow.setCountry}
          onRegionChange={flow.setRegion}
          onVolumeChange={flow.setVolumeL}
          domainesSuggestions={flow.domainesSuggestions}
          appellationsSuggestions={flow.appellationsSuggestions}
          quantity={flow.quantity}
          onQuantityChange={flow.setQuantity}
          zoneId={flow.zoneId}
          onZoneChange={flow.setZoneId}
          zones={flow.zones}
          zonesLoading={flow.zonesLoading}
          shelf={flow.shelf}
          onShelfChange={flow.setShelf}
          purchasePrice={flow.purchasePrice}
          onPurchasePriceChange={flow.setPurchasePrice}
          rawExtraction={flow.rawExtraction}
          onCancel={flow.handleReset}
          onSave={flow.handleSave}
        />
      )}

      {flow.step === 'batch-confirm' && currentBatchItem && (
        <BatchConfirmSwipeable
          currentBatchIndex={flow.currentBatchIndex}
          batchItems={flow.batchItems}
          zones={flow.zones}
          zonesLoading={flow.zonesLoading}
          domainesSuggestions={flow.domainesSuggestions}
          appellationsSuggestions={flow.appellationsSuggestions}
          onUpdate={flow.handleBatchItemUpdate}
          onNavigate={flow.setCurrentBatchIndex}
          onBackPhotoSelect={flow.handleBatchBackPhotoSelect}
          onZoomImage={(src, label) => flow.setZoomImage({ src, label })}
          onSkip={flow.handleBatchSkipCurrentItem}
          onSave={flow.handleBatchSaveCurrentItem}
        />
      )}

      {flow.step === 'saving' && <AddBottleSavingStep />}

      <AddBottleZoomDialog
        zoomImage={flow.zoomImage}
        onClose={() => flow.setZoomImage(null)}
      />
    </div>
  )
}
