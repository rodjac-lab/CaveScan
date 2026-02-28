import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ChevronRight, CheckCircle } from 'lucide-react'
import type { WineColor, BottleWithZone } from '@/lib/types'
import type { BatchSession } from '@/lib/batchSessionStore'

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function formatDrunkDate(value?: string | null) {
  const empty = { day: '', month: '' }
  if (!value) return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return empty
  return {
    day: date.getDate().toString().padStart(2, '0'),
    month: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
  }
}

interface RemoveChooseStepProps {
  error: string | null
  activeBatchSession: BatchSession | null
  batchSummary: { total: number; inCave: number; notInCave: number; unresolved: number } | null
  drunkLoading: boolean
  recentlyDrunk: BottleWithZone[]
  onBatchBannerClick: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBatchFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function RemoveChooseStep({
  error,
  activeBatchSession,
  batchSummary,
  drunkLoading,
  recentlyDrunk,
  onBatchBannerClick,
  onFileSelect,
  onBatchFileSelect,
}: RemoveChooseStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputGalleryRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex-shrink-0 px-6 pt-4 pb-3">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
        <p className="text-[13px] font-light text-[var(--text-secondary)]">Sorties de cave & degustations</p>
      </header>

      {error && (
        <div className="flex-shrink-0 mx-6 rounded-[var(--radius-sm)] bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[84px] scrollbar-hide">
        {activeBatchSession && batchSummary && (
          <button
            type="button"
            onClick={onBatchBannerClick}
            className="mx-6 mb-3 mt-2 flex w-[calc(100%-3rem)] items-center gap-3 rounded-[var(--radius-sm)] border border-[rgba(184,134,11,0.12)] bg-[var(--accent-bg)] px-3 py-2.5 text-left"
          >
            {activeBatchSession.status === 'processing' ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
            ) : (
              <CheckCircle className="h-5 w-5 text-[var(--accent)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                {activeBatchSession.status === 'processing'
                  ? `${batchSummary.total} vins en cours d'analyse...`
                  : `${batchSummary.total} vins a documenter`}
              </p>
              <p className="text-[11px] font-normal text-[var(--text-muted)]">{activeBatchSession.label}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        )}

        <div className="mx-6 mt-2 mb-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border-color)]" />
          <span className="text-[10px] font-medium uppercase tracking-[2px] text-[var(--text-muted)]">Ouvertures recentes</span>
          <div className="h-px flex-1 bg-[var(--border-color)]" />
        </div>

        <div className="px-6 py-2">
          {drunkLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : recentlyDrunk.length === 0 ? (
            <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--bg-card)] py-6 text-center text-sm text-[var(--text-secondary)] card-shadow">
              Aucune ouverture recente.
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentlyDrunk.map((bottle) => {
                const { day, month } = formatDrunkDate(bottle.drunk_at)

                return (
                  <Link key={bottle.id} to={`/bottle/${bottle.id}`}>
                    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2.5 pr-3 card-shadow transition-all duration-200 hover:bg-[var(--accent-bg)]">
                      <div className="w-9 flex-shrink-0 text-center">
                        <p className="font-serif text-[17px] font-bold leading-tight text-[var(--text-primary)]">{day}</p>
                        <p className="text-[9px] font-medium uppercase text-[var(--text-muted)]">{month}</p>
                      </div>

                      <div
                        className={`h-8 w-[3px] flex-shrink-0 rounded-sm ${
                          bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'
                        }`}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                          {bottle.domaine || bottle.appellation || 'Vin'}
                        </p>
                        <p className="truncate text-[11px] font-light text-[var(--text-secondary)]">
                          {[bottle.appellation !== bottle.domaine ? bottle.appellation : null, bottle.millesime].filter(Boolean).join(' · ')}
                        </p>
                      </div>

                      {bottle.zone_id && <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)]">Ma cave</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 px-4 py-2 bg-[var(--bg)]">
        <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 scan-shadow">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileSelect}
            className="hidden"
          />
          <input
            ref={fileInputGalleryRef}
            type="file"
            accept="image/*"
            onChange={onBatchFileSelect}
            multiple
            className="hidden"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputGalleryRef.current?.click()}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[rgba(184,134,11,0.12)] bg-[var(--accent-bg)] text-[var(--accent)] transition-all duration-200 hover:bg-[var(--accent-bg)]/80"
            >
              <GalleryIcon className="h-5 w-5" />
            </button>

            <div className="flex-1 text-center">
              <p className="font-serif text-base font-semibold text-[var(--text-primary)]">Ouvrir une bouteille</p>
              <p className="text-xs text-[var(--text-muted)]">Scanner l'etiquette</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-white transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
                boxShadow: '0 3px 12px rgba(184,134,11,0.25)',
              }}
            >
              <CameraIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
