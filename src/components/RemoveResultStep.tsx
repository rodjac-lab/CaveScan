import { useNavigate } from 'react-router-dom'
import { PenLine, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WineColor, BottleWithZone, WineExtraction } from '@/lib/types'

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

type MatchType = 'in_cave' | 'not_in_cave'

const MATCH_BADGE_CONFIG: Record<string, { dot: string; text: string; label: string }> = {
  in_cave: { dot: 'bg-[var(--accent)]', text: 'text-[var(--accent)]', label: 'En cave' },
  not_in_cave: { dot: 'bg-[var(--text-muted)]', text: 'text-[var(--text-muted)]', label: 'Hors cave' },
}

interface ScanResult {
  extraction: WineExtraction
  photoFile: File | null
  photoUri: string | null
  matchType: MatchType
  primaryMatch: BottleWithZone | null
  alternatives: BottleWithZone[]
}

interface RemoveResultStepProps {
  scanResult: ScanResult
  error: string | null
  showAlternatives: boolean
  onPrimaryAction: () => void
  onSelectAlternative: (bottle: BottleWithZone) => void
  onToggleAlternatives: () => void
  onCancel: () => void
}

export function RemoveResultStep({
  scanResult,
  error,
  showAlternatives,
  onPrimaryAction,
  onSelectAlternative,
  onToggleAlternatives,
  onCancel,
}: RemoveResultStepProps) {
  const navigate = useNavigate()

  const displayName = scanResult.primaryMatch?.domaine || scanResult.primaryMatch?.appellation || scanResult.extraction.domaine || scanResult.extraction.appellation || 'Vin'
  const detail = scanResult.primaryMatch
    ? [scanResult.primaryMatch.appellation, scanResult.primaryMatch.millesime].filter(Boolean).join(' · ')
    : [scanResult.extraction.appellation, scanResult.extraction.millesime].filter(Boolean).join(' · ')

  const badgeConfig = MATCH_BADGE_CONFIG[scanResult.matchType]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Dégustations</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-sm)] bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4 animate-in fade-in duration-200">
        <div className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3.5 card-shadow">
          <div className="flex items-start gap-3">
            {scanResult.photoUri ? (
              <img src={scanResult.photoUri} alt="Bouteille scannee" className="h-[58px] w-[58px] rounded object-cover" />
            ) : (
              <div className="h-[58px] w-[58px] rounded bg-[var(--accent-bg)] flex items-center justify-center text-[var(--text-muted)] text-[20px]">
                🍷
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{displayName}</p>
              <p className="mt-0.5 truncate text-[11px] font-normal text-[var(--text-muted)]">{detail || 'Information partielle'}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${badgeConfig.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${badgeConfig.dot}`} />
                  {badgeConfig.label}
                </span>
                {scanResult.matchType === 'in_cave' && scanResult.primaryMatch?.zone && (
                  <span className="text-[11px] font-normal text-[var(--text-muted)]">
                    {scanResult.primaryMatch.zone.name}
                    {scanResult.primaryMatch.shelf ? ` · ${scanResult.primaryMatch.shelf}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <Button className="w-full bg-[var(--accent)] hover:bg-[var(--accent-light)]" onClick={onPrimaryAction}>
          {scanResult.matchType === 'in_cave' ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Sortir de cave
            </>
          ) : (
            <>
              <PenLine className="mr-2 h-4 w-4" />
              Noter la degustation
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={onToggleAlternatives}
          className="w-full text-center text-[12px] font-medium text-[var(--accent)]"
        >
          Ce n'est pas cette bouteille ?
        </button>

        {showAlternatives && (
          <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
            {scanResult.alternatives.length > 0 ? (
              scanResult.alternatives.map((bottle) => (
                <button
                  key={bottle.id}
                  type="button"
                  onClick={() => onSelectAlternative(bottle)}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg)] p-2.5 text-left transition-colors hover:bg-[var(--accent-bg)]"
                >
                  <div className={`h-8 w-[3px] rounded-sm ${bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {bottle.domaine || bottle.appellation || 'Vin'}
                    </p>
                    <p className="truncate text-[11px] font-normal text-[var(--text-muted)]">
                      {[bottle.appellation, bottle.millesime].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  navigate('/add', {
                    state: {
                      prefillExtraction: scanResult.extraction,
                      prefillPhotoFile: scanResult.photoFile ?? undefined,
                    },
                  })
                }
              >
                Saisir manuellement
              </Button>
            )}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          Annuler
        </Button>
      </div>
    </div>
  )
}
