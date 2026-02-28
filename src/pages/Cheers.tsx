import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, X, Share2, Star } from 'lucide-react'
import { useDrunkBottles } from '@/hooks/useBottles'
import { type WineColor, type BottleWithZone } from '@/lib/types'

type ColorFilter = WineColor | null
type RatingFilter = 3 | 4 | 5 | null

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

const COLOR_PILLS: { value: WineColor; label: string }[] = [
  { value: 'rouge', label: 'Rouge' },
  { value: 'blanc', label: 'Blanc' },
  { value: 'rose', label: 'Rosé' },
  { value: 'bulles', label: 'Bulles' },
]

const RATING_FILTERS: { value: 3 | 4 | 5; label: string }[] = [
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
  { value: 5, label: '5' },
]

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
}

function formatDrunkDate(value?: string | null) {
  if (!value) return { day: '', month: '', year: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '', month: '', year: '' }
  return {
    day: date.getDate().toString().padStart(2, '0'),
    month: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    year: date.getFullYear().toString(),
  }
}

function filterBottles(
  bottles: BottleWithZone[],
  colorFilter: ColorFilter,
  ratingFilter: RatingFilter,
  query: string,
): BottleWithZone[] {
  let results = bottles

  if (colorFilter) {
    results = results.filter((b) => b.couleur === colorFilter)
  }

  if (ratingFilter) {
    results = results.filter((b) => b.rating != null && b.rating >= ratingFilter)
  }

  if (query.length >= 2) {
    const q = query.toLowerCase()
    results = results.filter(
      (b) =>
        b.domaine?.toLowerCase().includes(q) ||
        b.cuvee?.toLowerCase().includes(q) ||
        b.appellation?.toLowerCase().includes(q) ||
        b.millesime?.toString().includes(q),
    )
  }

  return results
}

export default function Cheers() {
  const { bottles, loading } = useDrunkBottles()
  const [colorFilter, setColorFilter] = useState<ColorFilter>(null)
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(
    () => filterBottles(bottles, colorFilter, ratingFilter, searchQuery),
    [bottles, colorFilter, ratingFilter, searchQuery],
  )

  const handleShare = async (bottle: BottleWithZone, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!navigator.share) return

    const title = bottle.domaine || bottle.appellation || 'Vin'
    const lines: string[] = []
    lines.push(`\u{1F377} ${title}${bottle.cuvee ? ` \u00AB ${bottle.cuvee} \u00BB` : ''}${bottle.millesime ? ` ${bottle.millesime}` : ''}`)
    if (bottle.appellation && bottle.domaine) lines.push(bottle.appellation)
    if (bottle.tasting_note) {
      lines.push('')
      lines.push(bottle.tasting_note)
    }
    lines.push('\n\u2014\nPartag\u00e9 avec CaveScan')

    try {
      await navigator.share({ text: lines.join('\n') })
    } catch {
      // User cancelled
    }
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setColorFilter(null)
    setRatingFilter(null)
  }

  const hasFilters = !!colorFilter || !!ratingFilter || searchQuery.length > 0

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
        <p className="text-[13px] font-light text-[var(--text-secondary)]">
          Historique de vos dégustations
        </p>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-6 pb-2">
        {/* Color pills */}
        <div className="flex items-center gap-2 mb-2">
          {COLOR_PILLS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColorFilter((cur) => (cur === c.value ? null : c.value))}
              className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-colors ${
                colorFilter === c.value
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)]'
              }`}
            >
              {c.label}
            </button>
          ))}
          <div className="w-px h-4 bg-[var(--border-color)]" />
          {RATING_FILTERS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRatingFilter((cur) => (cur === r.value ? null : r.value))}
              className={`flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                ratingFilter === r.value
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)]'
              }`}
            >
              <Star className="h-3 w-3" />
              {r.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher domaine, appellation..."
            className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-9 text-[13px] placeholder:text-[var(--text-muted)] placeholder:italic"
          />
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-4 scrollbar-hide">
        {bottles.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-card)] py-8 card-shadow">
            <p className="text-center text-[var(--text-secondary)] text-sm">
              Aucune dégustation enregistrée.
            </p>
            <p className="text-center text-[var(--text-muted)] text-xs">
              Scannez une bouteille avec l'intent "Déguster" pour commencer.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-card)] py-8 card-shadow">
            <SearchIcon className="h-10 w-10 text-[var(--text-muted)]" />
            <p className="text-center text-[var(--text-secondary)] text-sm">
              Aucun résultat
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((bottle) => {
              const { day, month } = formatDrunkDate(bottle.drunk_at)
              const displayName = bottle.domaine || bottle.appellation || 'Vin'
              const detail = [
                bottle.appellation !== bottle.domaine ? bottle.appellation : null,
                bottle.millesime,
              ]
                .filter(Boolean)
                .join(' \u00B7 ')
              const noteExcerpt = bottle.tasting_note
                ? bottle.tasting_note.length > 80
                  ? bottle.tasting_note.slice(0, 80) + '\u2026'
                  : bottle.tasting_note
                : null

              return (
                <Link key={bottle.id} to={`/bottle/${bottle.id}`}>
                  <div className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2.5 pr-3 card-shadow transition-all duration-200 hover:bg-[var(--accent-bg)]">
                    {/* Date */}
                    <div className="w-9 flex-shrink-0 text-center pt-0.5">
                      <p className="font-serif text-[17px] font-bold leading-tight text-[var(--text-primary)]">{day}</p>
                      <p className="text-[9px] font-medium uppercase text-[var(--text-muted)]">{month}</p>
                    </div>

                    {/* Color bar */}
                    <div
                      className={`h-10 w-[3px] flex-shrink-0 rounded-sm mt-0.5 ${
                        bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'
                      }`}
                    />

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{displayName}</p>
                      <p className="truncate text-[11px] font-light text-[var(--text-secondary)]">
                        {detail || 'Information partielle'}
                      </p>
                      {noteExcerpt && (
                        <p className="mt-1 text-[11px] italic text-[var(--text-muted)] line-clamp-2">
                          {noteExcerpt}
                        </p>
                      )}
                    </div>

                    {/* Right: rating + share */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-0.5">
                      {bottle.rating != null && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: bottle.rating }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-[var(--accent)] text-[var(--accent)]" />
                          ))}
                        </div>
                      )}
                      {typeof navigator !== 'undefined' && !!navigator.share && (
                        <button
                          onClick={(e) => handleShare(bottle, e)}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
