import { useRef, useState, useEffect, useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useRecommendations } from '@/hooks/useRecommendations'
import type { RecommendationCard } from '@/lib/recommendationStore'

type Mode = 'generic' | 'food' | 'wine'

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M8 0L9.5 5.5L15 7L9.5 8.5L8 14L6.5 8.5L1 7L6.5 5.5L8 0Z" />
    </svg>
  )
}

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'food', label: 'Ce soir je mange...' },
  { value: 'wine', label: 'Ce soir je bois...' },
]

const PRIMARY_ACTIONS: Array<{ label: string; hint: string }> = [
  { label: 'Plus audacieux', hint: 'style plus audacieux, accords originaux' },
  { label: 'Plus classique', hint: 'style plus classique, valeur sure' },
  { label: 'Moins cher', hint: 'budget plus accessible, meilleur rapport qualite-prix' },
]

function buildRecommendationQuery(baseQuery: string | null, refinementHint: string | null): string | null {
  if (!baseQuery && !refinementHint) return null
  if (!baseQuery && refinementHint) return `Affinage sommelier: ${refinementHint}`
  if (!refinementHint) return baseQuery
  return `${baseQuery} | Contraintes: ${refinementHint}`
}

function colorToBarClass(color: RecommendationCard['color']): string {
  switch (color) {
    case 'rouge': return 'bg-[var(--red-wine)]'
    case 'blanc': return 'bg-[var(--white-wine)]'
    case 'rose': return 'bg-[var(--rose-wine)]'
    case 'bulles': return 'bg-[var(--champagne)]'
    default: return 'bg-[var(--accent)]'
  }
}

function badgeToClass(badge: string): string {
  switch (badge) {
    case 'De ta cave': return 'bg-[var(--accent)]'
    case 'Accord parfait': return 'bg-[var(--red-wine)]'
    case 'Audacieux': return 'bg-[var(--champagne)]'
    case 'Decouverte': return 'bg-[var(--text-muted)]'
    default: return 'bg-[var(--accent)]'
  }
}

function LoadingCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="flex-shrink-0 w-[220px] h-[188px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden animate-pulse"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex">
        <div className="w-[4px] bg-[var(--border-color)]" />
        <div className="flex-1 p-3">
          <div className="h-4 w-20 rounded-full bg-[var(--border-color)] mb-2" />
          <div className="h-4 w-4/5 rounded bg-[var(--border-color)] mb-2" />
          <div className="h-3 w-2/5 rounded bg-[var(--border-color)] mb-3" />
          <div className="h-3 w-full rounded bg-[var(--border-color)] mb-1.5" />
          <div className="h-3 w-5/6 rounded bg-[var(--border-color)]" />
        </div>
      </div>
    </div>
  )
}

function InitialLoadingSkeleton() {
  return (
    <>
      <LoadingCardSkeleton index={0} />
      <LoadingCardSkeleton index={1} />
      <LoadingCardSkeleton index={2} />
    </>
  )
}

const TAP_THRESHOLD = 10

interface RecommendationCardItemProps {
  card: RecommendationCard
  onTap: () => void
}

function RecommendationCardItem({ card, onTap }: RecommendationCardItemProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  function handlePointerDown(e: ReactPointerEvent) {
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }

  function handlePointerUp(e: ReactPointerEvent) {
    if (!pointerStart.current) return
    const dx = Math.abs(e.clientX - pointerStart.current.x)
    const dy = Math.abs(e.clientY - pointerStart.current.y)
    pointerStart.current = null
    if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
      onTap()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onKeyDown={(e) => { if (e.key === 'Enter') onTap() }}
      className="flex-shrink-0 w-[220px] h-[188px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden cursor-pointer select-none"
    >
      <div className="flex">
        <div className={`w-[4px] ${colorToBarClass(card.color)}`} />
        <div className="flex-1 p-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${badgeToClass(card.badge)} mb-2`}>
            {card.badge}
          </span>
          <p className="font-serif text-[15px] font-bold text-[var(--text-primary)] leading-tight">
            {card.name}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{card.appellation}</p>
          <p className="text-[12px] italic text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-3">
            {card.reason}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function CeSoirModule() {
  const [mode, setMode] = useState<Mode>('generic')
  const [modeChosen, setModeChosen] = useState(false)
  const [expandedCard, setExpandedCard] = useState<RecommendationCard | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [queryInput, setQueryInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)
  const [activeRefinement, setActiveRefinement] = useState<string | null>(null)
  const [showQueryInput, setShowQueryInput] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refinementHint = useMemo(
    () => PRIMARY_ACTIONS.find((item) => item.label === activeRefinement)?.hint ?? activeRefinement,
    [activeRefinement]
  )

  const effectiveQuery = useMemo(
    () => buildRecommendationQuery(submittedQuery, refinementHint ?? null),
    [submittedQuery, refinementHint]
  )

  const { cards, loading, refreshing, error } = useRecommendations(mode, effectiveQuery)

  const searchPlaceholder = mode === 'food'
    ? 'Ex: filet de boeuf, sans tanins, 20-30EUR'
    : 'Ex: rouge leger, pas boise, 20-30EUR'

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    function handleScroll() {
      const cardWidth = 220 + 12
      const index = Math.round(node!.scrollLeft / cardWidth)
      setActiveIndex(Math.min(index, Math.max(cards.length - 1, 0)))
    }
    node.addEventListener('scroll', handleScroll, { passive: true })
    return () => node.removeEventListener('scroll', handleScroll)
  }, [cards.length])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, [effectiveQuery])

  function handleModeSwitch(newMode: Mode): void {
    setMode(newMode)
    setModeChosen(true)
    setSubmittedQuery(null)
    setQueryInput('')
    setActiveRefinement(null)
    setShowQueryInput(true)
  }

  function handleQuerySubmit(): void {
    const next = queryInput.trim()
    setSubmittedQuery(next.length >= 2 ? next : null)
  }

  function toggleRefinement(label: string): void {
    setActiveRefinement((prev) => (prev === label ? null : label))
  }

  const showCards = !loading && cards.length > 0

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1.5">
          <SparkleIcon />
          <span className="section-divider-label">Ce soir</span>
        </div>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto discover-carousel scrollbar-hide -mx-6 px-6 mb-1">
        {loading ? (
          <InitialLoadingSkeleton />
        ) : (
          <>
            {cards.map((card, i) => (
              <RecommendationCardItem
                key={card.bottle_id ?? `reco-${i}`}
                card={card}
                onTap={() => setExpandedCard(card)}
              />
            ))}
            {refreshing && (
              <>
                <LoadingCardSkeleton index={0} />
                <LoadingCardSkeleton index={1} />
              </>
            )}
          </>
        )}
      </div>

      {refreshing && !loading && (
        <p className="text-[11px] text-[var(--text-muted)] italic mb-2 text-center">
          Le sommelier affine les recommandations...
        </p>
      )}

      {showCards && (
        <div className="flex items-center justify-center gap-1.5 mb-3">
          {cards.map((card, i) => (
            <div
              key={card.bottle_id ?? `dot-${i}`}
              className={`transition-all duration-200 ${
                i === activeIndex ? 'discover-dot-active' : 'discover-dot-inactive'
              }`}
            />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3 card-shadow mb-3 text-center">
          <p className="text-[11px] text-[var(--text-muted)]">
            Le sommelier est momentanement indisponible. Suggestions par defaut affichees.
          </p>
        </div>
      )}

      <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3 card-shadow mt-3 mb-2">
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
          {PRIMARY_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => toggleRefinement(action.label)}
              className={`h-8 inline-flex items-center justify-center rounded-full px-3 text-[11px] leading-none font-medium border whitespace-nowrap transition-colors ${
                activeRefinement === action.label
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
          {MODE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleModeSwitch(value)}
              className={`h-8 inline-flex items-center justify-center rounded-full px-3 text-[11px] leading-none font-medium border whitespace-nowrap transition-colors ${
                modeChosen && mode === value
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowQueryInput((prev) => !prev)}
            className="h-8 inline-flex items-center justify-center rounded-full px-3 text-[11px] leading-none font-medium border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            {showQueryInput ? 'Fermer' : 'Preciser'}
          </button>
        </div>

        {showQueryInput && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleQuerySubmit() }}
            className="relative"
          >
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <SearchIcon />
            </div>
            <input
              autoFocus
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={searchPlaceholder}
              enterKeyHint="search"
              className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-10 text-[12px] placeholder:text-[var(--text-muted)] placeholder:italic"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            >
              <ChevronIcon />
            </button>
          </form>
        )}
      </div>

      <Dialog open={!!expandedCard} onOpenChange={() => setExpandedCard(null)}>
        <DialogContent className="max-w-[340px] rounded-[var(--radius)] p-0 overflow-hidden">
          {expandedCard && (
            <div className="flex">
              <div className={`w-[5px] flex-shrink-0 ${colorToBarClass(expandedCard.color)}`} />
              <div className="flex-1 p-5">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white ${badgeToClass(expandedCard.badge)} mb-3`}>
                  {expandedCard.badge}
                </span>
                <p className="font-serif text-[20px] font-bold text-[var(--text-primary)] leading-tight">
                  {expandedCard.name}
                </p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">{expandedCard.appellation}</p>
                <p className="text-[13px] italic text-[var(--text-secondary)] mt-3 leading-relaxed">
                  {expandedCard.reason}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
