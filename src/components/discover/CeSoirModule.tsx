import { useRef, useState, useEffect, useCallback } from 'react'
import { useRecommendations } from '@/hooks/useRecommendations'
import type { RecommendationCard } from '@/lib/recommendationStore'

type Mode = 'food' | 'wine'

// --- Icons ---

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
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

// --- Data ---

const FOOD_TAGS = ['Poulet rôti', 'Poisson', 'Fromage', 'Viande rouge', 'Pâtes', 'Sushi', 'Charcuterie', 'Dessert']
const WINE_TAGS = ['Rouge', 'Blanc', 'Rosé', 'Bulles', 'Léger', 'Corsé']

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'food', label: 'Ce soir je mange...' },
  { value: 'wine', label: 'Ce soir je bois...' },
]

// --- Helpers ---

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
    case 'Découverte': return 'bg-[var(--text-muted)]'
    default: return 'bg-[var(--accent)]'
  }
}

// --- Sub-components ---

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-[220px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden animate-pulse">
      <div className="flex">
        <div className="w-[4px] bg-[var(--border-color)]" />
        <div className="flex-1 p-3">
          <div className="h-4 w-16 rounded-full bg-[var(--border-color)] mb-2" />
          <div className="h-5 w-32 rounded bg-[var(--border-color)]" />
          <div className="h-3 w-20 rounded bg-[var(--border-color)] mt-1.5" />
          <div className="h-3 w-full rounded bg-[var(--border-color)] mt-3" />
          <div className="h-3 w-3/4 rounded bg-[var(--border-color)] mt-1" />
        </div>
      </div>
    </div>
  )
}

interface RecommendationCardItemProps {
  card: RecommendationCard
}

function RecommendationCardItem({ card }: RecommendationCardItemProps) {
  return (
    <div className="flex-shrink-0 w-[220px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden">
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

// --- Main component ---

export default function CeSoirModule() {
  const [mode, setMode] = useState<Mode>('food')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const effectiveQuery = selectedTag ?? submittedQuery
  const { cards, loading, error } = useRecommendations(mode, effectiveQuery)

  const tags = mode === 'food' ? FOOD_TAGS : WINE_TAGS
  const placeholder = mode === 'food' ? 'Ex: Magret de canard...' : 'Ex: Pinot Noir...'
  const hasActiveSearch = selectedTag !== null || submittedQuery !== null || searchQuery.trim().length > 0

  const resetSearch = useCallback(() => {
    setSelectedTag(null)
    setSearchQuery('')
    setSubmittedQuery(null)
  }, [])

  // Track which card is centered in the carousel
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function handleScroll() {
      const cardWidth = 220 + 12
      const index = Math.round(el!.scrollLeft / cardWidth)
      setActiveIndex(Math.min(index, Math.max(cards.length - 1, 0)))
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [cards.length])

  // Reset scroll position when the query changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' })
      setActiveIndex(0)
    }
  }, [effectiveQuery])

  function handleTagClick(tag: string): void {
    setSelectedTag(selectedTag === tag ? null : tag)
    setSearchQuery('')
    setSubmittedQuery(null)
  }

  function handleSearchSubmit(): void {
    if (searchQuery.trim().length < 2) return
    setSubmittedQuery(searchQuery.trim())
    setSelectedTag(null)
  }

  function handleModeSwitch(newMode: Mode): void {
    setMode(newMode)
    resetSearch()
  }

  function handleSearchChange(value: string): void {
    setSearchQuery(value)
    setSelectedTag(null)
    setSubmittedQuery(null)
  }

  const showCards = !loading && cards.length > 0

  return (
    <div>
      {/* Section title */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <span className="section-divider-label">Ce soir</span>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-3">
        {MODE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleModeSwitch(value)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium border transition-colors ${
              mode === value
                ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSearchSubmit() }}
        className="relative mb-3"
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <SearchIcon />
        </div>
        <input
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="search"
          className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-16 text-[13px] placeholder:text-[var(--text-muted)] placeholder:italic"
        />
        {hasActiveSearch && (
          <button
            type="button"
            onClick={resetSearch}
            className="absolute right-8 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <CloseIcon />
          </button>
        )}
        {searchQuery.trim().length >= 2 && (
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white"
          >
            <ChevronIcon />
          </button>
        )}
      </form>

      {/* AI badge */}
      {showCards && !error && (
        <div className="flex items-center gap-1 mb-2">
          <SparkleIcon />
          <span className="text-[10px] font-medium text-[var(--text-muted)]">Suggestion IA</span>
        </div>
      )}

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto discover-carousel scrollbar-hide -mx-6 px-6 mb-1"
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          cards.map((card, i) => (
            <RecommendationCardItem
              key={card.bottle_id ?? `reco-${i}`}
              card={card}
            />
          ))
        )}
      </div>

      {/* Dots */}
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

      {/* Error message (non-blocking, fallback cards are shown) */}
      {error && !loading && (
        <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3 card-shadow mb-3 text-center">
          <p className="text-[11px] text-[var(--text-muted)]">
            Le sommelier est momentanément indisponible. Suggestions par défaut affichées.
          </p>
        </div>
      )}

      {/* Quick tags */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => handleTagClick(tag)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              selectedTag === tag
                ? 'bg-[var(--red-wine)] border-[var(--red-wine)] text-white'
                : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
