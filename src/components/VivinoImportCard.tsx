import { useRef, useState, type ChangeEvent } from 'react'
import { CheckCircle2, Download, Loader2, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { track } from '@/lib/track'
import { importVivinoPreview, parseVivinoZip, type VivinoImportPreview, type VivinoImportResult } from '@/lib/vivinoImport'

function formatCount(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value)
}

export function VivinoImportCard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<VivinoImportPreview | null>(null)
  const [result, setResult] = useState<VivinoImportResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const openPicker = () => inputRef.current?.click()

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setParsing(true)
    setErrorText(null)
    setPreview(null)
    setResult(null)

    try {
      const nextPreview = await parseVivinoZip(file)
      if (nextPreview.summary.cellarReferences === 0 && nextPreview.summary.tastingEntries === 0) {
        throw new Error('Aucune cave ou dégustation exploitable trouvée dans cet export Vivino.')
      }

      setPreview(nextPreview)
      track('vivino_import_preview_ready', {
        cellar_references: nextPreview.summary.cellarReferences,
        cellar_bottles: nextPreview.summary.cellarBottles,
        tasting_entries: nextPreview.summary.tastingEntries,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de lire cet export Vivino.'
      setErrorText(message)
      showToast(message)
    } finally {
      setParsing(false)
      event.target.value = ''
    }
  }

  const handleImport = async () => {
    if (!preview) return

    setImporting(true)
    setErrorText(null)

    try {
      const nextResult = await importVivinoPreview(preview)
      setResult(nextResult)
      track('vivino_import_completed', {
        imported_cellar_references: nextResult.importedCellarReferences,
        imported_cellar_bottles: nextResult.importedCellarBottles,
        imported_tastings: nextResult.importedTastings,
        already_present: nextResult.alreadyPresent,
      })
      showToast('Import Vivino terminé', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur pendant l’import Vivino.'
      setErrorText(message)
      showToast(message)
    } finally {
      setImporting(false)
    }
  }

  const resetFlow = () => {
    setPreview(null)
    setResult(null)
    setErrorText(null)
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Download className="h-[18px] w-[18px] text-[var(--text-secondary)]" />
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Import de données</h2>
      </div>

      <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm">
        <div className="space-y-4">
          <div>
            <p className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
              Importer depuis Vivino
            </p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Dépose ton export ZIP Vivino. Célestin reconstruira ta cave actuelle et tes dégustations les plus fiables.
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={handleFileChange}
          />

          {!preview && !result && (
            <Button
              onClick={openPicker}
              disabled={parsing}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            >
              {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Choisir mon export Vivino
            </Button>
          )}

          {preview && !result && (
            <div className="space-y-4">
              <div className="rounded-[12px] bg-[var(--bg-secondary)] px-4 py-3">
                <p className="text-[12px] font-medium text-[var(--text-primary)]">
                  {preview.sourceFileName}
                </p>
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                  Célestin a préparé un import propre à partir de ton export Vivino.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] border border-[var(--border-color)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Cave retrouvée</p>
                  <p className="mt-1 text-[22px] font-bold text-[var(--text-primary)]">
                    {formatCount(preview.summary.cellarBottles)}
                  </p>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    bouteilles sur {formatCount(preview.summary.cellarReferences)} références
                  </p>
                </div>

                <div className="rounded-[12px] border border-[var(--border-color)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Dégustations reconnues</p>
                  <p className="mt-1 text-[22px] font-bold text-[var(--text-primary)]">
                    {formatCount(preview.summary.tastingEntries)}
                  </p>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    reprises dans ton historique Célestin
                  </p>
                </div>
              </div>

              {preview.summary.priceEntries > 0 && (
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Prix retrouvés pour {formatCount(preview.summary.priceEntries)} vin{preview.summary.priceEntries > 1 ? 's' : ''}.
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={resetFlow}
                  disabled={importing}
                  className="sm:flex-1"
                >
                  Choisir un autre fichier
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="sm:flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
                >
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Importer dans Célestin
                </Button>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold">Import terminé</p>
                  <p className="mt-1 text-[12px] leading-relaxed">
                    {formatCount(result.importedCellarBottles)} bouteilles de cave et {formatCount(result.importedTastings)} dégustations ont été ajoutées à ton univers Célestin.
                  </p>
                  {result.alreadyPresent > 0 && (
                    <p className="mt-1 text-[12px] leading-relaxed text-emerald-800/90">
                      {formatCount(result.alreadyPresent)} élément{result.alreadyPresent > 1 ? 's' : ''} étai{result.alreadyPresent > 1 ? 'ent' : 't'} déjà présent{result.alreadyPresent > 1 ? 's' : ''}.
                    </p>
                  )}
                </div>
              </div>

              <Button variant="outline" onClick={resetFlow} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Importer un autre export
              </Button>
            </div>
          )}

          {errorText && (
            <p className="text-[12px] text-red-600">
              {errorText}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
