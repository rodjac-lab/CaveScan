import { useRef, useState, useEffect, useCallback, useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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

const SOMMELIER_ACTIONS: Array<{ label: string; hint: string; reply: string }> = [
  { label: 'Plus audacieux', hint: 'style plus audacieux, accords originaux', reply: 'Parfait, je pousse des accords plus originaux avec un peu plus de caractere.' },
  { label: 'Plus classique', hint: 'style plus classique, valeur sure', reply: 'Compris, je reste sur des references tres sures et consensuelles.' },
  { label: 'Moins cher', hint: 'budget plus accessible, meilleur rapport qualite-prix', reply: 'Je vais privilegier des options avec un meilleur rapport plaisir/prix.' },
  { label: 'Accord parfait', hint: 'priorite precision de l accord mets-vin', reply: 'Je vise la precision maximale accord mets-vin pour ce contexte.' },
  { label: 'Autre style', hint: 'proposer un autre style de vin', reply: 'On change de registre pour ouvrir une alternative differente.' },
]

const REFINEMENT_HINTS = SOMMELIER_ACTIONS.reduce<Record<string, string>>((acc, action) => {
  acc[action.label] = action.hint
  return acc
}, {})

function buildRecommendationQuery(baseQuery: string | null, refinements: string[]): string | null {
  if (!baseQuery && refinements.length === 0) return null
  const refinementHints = refinements.map((item) => REFINEMENT_HINTS[item] ?? item)
  if (!baseQuery) return `Affinage sommelier: ${refinementHints.join(', ')}`
  if (refinementHints.length === 0) return baseQuery
  return `${baseQuery} | Contraintes: ${refinementHints.join(', ')}`
}

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

const TAP_THRESHOLD = 10 // px — below this, it's a tap, not a swipe

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

// --- Main component ---

export default function CeSoirModule() {
  const [mode, setMode] = useState<Mode>('food')
  const [expandedCard, setExpandedCard] = useState<RecommendationCard | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [refinementInput, setRefinementInput] = useState('')
  const [activeRefinements, setActiveRefinements] = useState<string[]>([])
  const [sommelierReply, setSommelierReply] = useState('Je peux affiner en un clic: style, budget, audace.')
  const scrollRef = useRef<HTMLDivElement>(null)

  const baseQuery = selectedTag ?? submittedQuery
  const effectiveQuery = useMemo(
    () => buildRecommendationQuery(baseQuery, activeRefinements),
    [baseQuery, activeRefinements]
  )
  const { cards, loading, refreshing, error } = useRecommendations(mode, effectiveQuery)

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
    resetRefinements()
  }

  function handleSearchChange(value: string): void {
    setSearchQuery(value)
    setSelectedTag(null)
    setSubmittedQuery(null)
  }

  function addRefinement(value: string, reply?: string): void {
    const token = value.trim()
    if (!token) return
    setActiveRefinements((prev) => [token, ...prev.filter((item) => item !== token)].slice(0, 4))
    if (reply) {
      setSommelierReply(reply)
    } else {
      setSommelierReply(`Bien vu. Je prends "${token}" pour affiner les recommandations.`)
    }
  }

  function handleRefinementSubmit(): void {
    if (refinementInput.trim().length < 2) return
    addRefinement(refinementInput)
    setRefinementInput('')
  }

  function resetRefinements(): void {
    setActiveRefinements([])
    setSommelierReply('Je peux affiner en un clic: style, budget, audace.')
  }

  const showCards = !loading && cards.length > 0

  return (
    <div>
      {/* Section title + AI badge */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <div className="flex items-center gap-1.5">
          <SparkleIcon />
          <span className="section-divider-label">Ce soir</span>
        </div>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      {/* 1. Carousel — content first */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto discover-carousel scrollbar-hide -mx-6 px-6 mb-1"
      >
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

      {/* 2. Quick tags — refine */}
      <div className="flex flex-wrap gap-1.5 mb-3">
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

      {/* 3. Mode toggle + search — deep search */}
      <div className="flex items-center gap-2 mb-2">
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

      <form
        onSubmit={(e) => { e.preventDefault(); handleSearchSubmit() }}
        className="relative"
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

      {/* 4. Micro-dialogue (UI prototype) */}
      <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3 card-shadow mt-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">Affiner avec le sommelier</p>
          {activeRefinements.length > 0 && (
            <button
              type="button"
              onClick={resetRefinements}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {SOMMELIER_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => addRefinement(action.label, action.reply)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                activeRefinements.includes(action.label)
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        {activeRefinements.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {activeRefinements.map((refinement) => (
              <span
                key={refinement}
                className="inline-flex items-center rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
              >
                {refinement}
              </span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[var(--text-secondary)] italic mb-2">
          {sommelierReply}
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); handleRefinementSubmit() }}
          className="relative"
        >
          <input
            value={refinementInput}
            onChange={(e) => setRefinementInput(e.target.value)}
            placeholder="Ex: sans tanins, budget 20-30€, pour apero..."
            className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] px-3 pr-12 text-[12px] placeholder:text-[var(--text-muted)] placeholder:italic"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white"
          >
            <ChevronIcon />
          </button>
        </form>

        <p className="text-[10px] text-[var(--text-muted)] mt-1">
          Les raffinements sont appliques en direct aux recommandations.
        </p>
      </div>

      {/* Expanded card dialog */}
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



