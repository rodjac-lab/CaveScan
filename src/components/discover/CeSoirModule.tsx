import { useRef, useState, useEffect } from 'react'

type Mode = 'food' | 'wine'

interface SuggestionResult {
  name: string
  appellation: string
  explanation: string
}

interface CarouselCard {
  id: string
  name: string
  appellation: string
  badge: string
  badgeColor: string
  reason: string
  barColor: string
}

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

// --- Data ---

const FOOD_TAGS = ['Poulet rôti', 'Poisson', 'Fromage', 'Viande rouge', 'Pâtes', 'Sushi', 'Charcuterie', 'Dessert']
const WINE_TAGS = ['Rouge', 'Blanc', 'Rosé', 'Bulles', 'Léger', 'Corsé']

const FOOD_KEYWORDS: Record<string, string> = {
  'poulet': 'Poulet rôti', 'volaille': 'Poulet rôti', 'dinde': 'Poulet rôti', 'pintade': 'Poulet rôti',
  'poisson': 'Poisson', 'saumon': 'Poisson', 'cabillaud': 'Poisson', 'bar': 'Poisson', 'dorade': 'Poisson', 'truite': 'Poisson', 'thon': 'Poisson',
  'fromage': 'Fromage', 'comté': 'Fromage', 'brie': 'Fromage', 'camembert': 'Fromage', 'roquefort': 'Fromage', 'chèvre': 'Fromage',
  'boeuf': 'Viande rouge', 'steak': 'Viande rouge', 'entrecôte': 'Viande rouge', 'filet': 'Viande rouge', 'côte': 'Viande rouge', 'agneau': 'Viande rouge', 'gibier': 'Viande rouge', 'canard': 'Viande rouge',
  'pâtes': 'Pâtes', 'pasta': 'Pâtes', 'spaghetti': 'Pâtes', 'lasagne': 'Pâtes', 'risotto': 'Pâtes', 'pizza': 'Pâtes',
  'sushi': 'Sushi', 'maki': 'Sushi', 'sashimi': 'Sushi', 'japonais': 'Sushi',
  'charcuterie': 'Charcuterie', 'saucisson': 'Charcuterie', 'jambon': 'Charcuterie', 'rillettes': 'Charcuterie', 'pâté': 'Charcuterie', 'terrine': 'Charcuterie',
  'dessert': 'Dessert', 'gâteau': 'Dessert', 'tarte': 'Dessert', 'chocolat': 'Dessert', 'crème': 'Dessert', 'fruits': 'Dessert',
}

const WINE_KEYWORDS: Record<string, string> = {
  'rouge': 'Rouge', 'cabernet': 'Rouge', 'merlot': 'Rouge', 'syrah': 'Rouge', 'malbec': 'Rouge', 'grenache': 'Rouge',
  'blanc': 'Blanc', 'chardonnay': 'Blanc', 'sauvignon': 'Blanc', 'riesling': 'Blanc', 'viognier': 'Blanc', 'chablis': 'Blanc',
  'rosé': 'Rosé', 'provence': 'Rosé',
  'bulles': 'Bulles', 'champagne': 'Bulles', 'crémant': 'Bulles', 'prosecco': 'Bulles', 'brut': 'Bulles', 'mousseux': 'Bulles', 'pétillant': 'Bulles',
  'léger': 'Léger', 'pinot': 'Léger', 'gamay': 'Léger', 'beaujolais': 'Léger',
  'corsé': 'Corsé', 'puissant': 'Corsé', 'tannique': 'Corsé', 'bordeaux': 'Corsé', 'cahors': 'Corsé', 'madiran': 'Corsé',
}

const FOOD_TO_WINE: Record<string, SuggestionResult> = {
  'Poulet rôti': { name: 'Bourgogne Chardonnay', appellation: 'Bourgogne', explanation: 'Un blanc rond et beurré qui épouse la tendreté du poulet rôti, sans le dominer.' },
  'Poisson': { name: 'Muscadet Sèvre et Maine', appellation: 'Loire', explanation: 'Sa fraîcheur minérale et ses notes d\'agrumes subliment les poissons grillés ou en sauce légère.' },
  'Fromage': { name: 'Sauternes', appellation: 'Bordeaux', explanation: 'L\'accord classique sucré-salé : la douceur du Sauternes contre le caractère du fromage.' },
  'Viande rouge': { name: 'Cahors Malbec', appellation: 'Sud-Ouest', explanation: 'Les tanins puissants et les arômes de fruits noirs tiennent tête à une belle pièce de boeuf.' },
  'Pâtes': { name: 'Chianti Classico', appellation: 'Toscane', explanation: 'L\'acidité du Sangiovese répond parfaitement à la sauce tomate des pâtes italiennes.' },
  'Sushi': { name: 'Champagne Brut', appellation: 'Champagne', explanation: 'L\'effervescence et la fraîcheur du Champagne nettoient le palais entre chaque bouchée.' },
  'Charcuterie': { name: 'Beaujolais', appellation: 'Beaujolais', explanation: 'Un rouge léger et fruité, tout en souplesse, idéal avec saucisson et rillettes.' },
  'Dessert': { name: 'Muscat de Beaumes-de-Venise', appellation: 'Rhône', explanation: 'Ses arômes de fruits confits et de miel accompagnent les desserts fruités à merveille.' },
}

const WINE_TO_FOOD: Record<string, SuggestionResult> = {
  'Rouge': { name: 'Entrecôte grillée', appellation: 'Classique', explanation: 'La viande rouge grillée reste le compagnon idéal d\'un bon rouge charpenté.' },
  'Blanc': { name: 'Coquilles Saint-Jacques', appellation: 'Fruits de mer', explanation: 'La finesse des Saint-Jacques s\'accorde avec la minéralité d\'un blanc sec.' },
  'Rosé': { name: 'Salade niçoise', appellation: 'Méditerranéen', explanation: 'Le rosé frais et fruité est le partenaire naturel de la cuisine méditerranéenne estivale.' },
  'Bulles': { name: 'Gougères au comté', appellation: 'Apéritif', explanation: 'Les bulles et le fromage chaud : un accord d\'apéritif incontournable.' },
  'Léger': { name: 'Terrine de campagne', appellation: 'Bistrot', explanation: 'Un vin léger et fruité équilibre le gras de la terrine sans l\'écraser.' },
  'Corsé': { name: 'Daube provençale', appellation: 'Mijoté', explanation: 'Un vin corsé résiste à la puissance d\'un plat longuement mijoté.' },
}

const MOCK_CARDS: CarouselCard[] = [
  { id: '1', name: 'Château Margaux 2015', appellation: 'Margaux', badge: 'À boire', badgeColor: 'bg-[var(--red-wine)]', reason: 'Ce millésime approche son apogée. C\'est le moment idéal pour l\'ouvrir.', barColor: 'bg-[var(--red-wine)]' },
  { id: '2', name: 'Pouilly-Fumé 2023', appellation: 'Loire', badge: 'Saison', badgeColor: 'bg-[var(--white-wine)]', reason: 'Un blanc vif parfait pour les soirées de fin d\'hiver, sur un poisson au four.', barColor: 'bg-[var(--white-wine)]' },
  { id: '3', name: 'Champagne Brut Rosé', appellation: 'Champagne', badge: 'Favori', badgeColor: 'bg-[var(--accent)]', reason: 'Votre plus haute note. Pourquoi ne pas célébrer ce soir\u00a0?', barColor: 'bg-[var(--champagne)]' },
  { id: '4', name: 'Côtes du Rhône 2021', appellation: 'Rhône', badge: 'À boire', badgeColor: 'bg-[var(--red-wine)]', reason: 'Ce vin généreux n\'attend que vous. Idéal avec un plat mijoté.', barColor: 'bg-[var(--red-wine)]' },
  { id: '5', name: 'Bandol Rosé 2024', appellation: 'Provence', badge: 'Saison', badgeColor: 'bg-[var(--rose-wine)]', reason: 'La fraîcheur provençale pour accompagner vos plats méditerranéens.', barColor: 'bg-[var(--rose-wine)]' },
]

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'food', label: 'Ce soir je mange...' },
  { value: 'wine', label: 'Ce soir je bois...' },
]

// --- Helpers ---

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function matchQueryToTag(query: string, mode: Mode): string | null {
  const normalized = stripAccents(query.toLowerCase())
  const keywords = mode === 'food' ? FOOD_KEYWORDS : WINE_KEYWORDS
  for (const [keyword, tag] of Object.entries(keywords)) {
    if (normalized.includes(stripAccents(keyword))) return tag
  }
  return null
}

function inferBarColor(name: string, appellation: string): string {
  const text = stripAccents(`${name} ${appellation}`.toLowerCase())
  const redKeys = ['rouge', 'malbec', 'cahors', 'chianti', 'beaujolais', 'rhone', 'corse', 'entrecote', 'daube', 'viande', 'terrine', 'sangiovese']
  const whiteKeys = ['blanc', 'muscadet', 'loire', 'chardonnay', 'saint-jacques', 'bourgogne', 'coquilles']
  const roseKeys = ['rose', 'provence', 'salade', 'mediterraneen', 'nicoise']
  const champKeys = ['champagne', 'bulles', 'sauternes', 'muscat', 'gougeres', 'aperitif', 'brut']

  if (champKeys.some(k => text.includes(k))) return 'bg-[var(--champagne)]'
  if (roseKeys.some(k => text.includes(k))) return 'bg-[var(--rose-wine)]'
  if (whiteKeys.some(k => text.includes(k))) return 'bg-[var(--white-wine)]'
  if (redKeys.some(k => text.includes(k))) return 'bg-[var(--red-wine)]'
  return 'bg-[var(--accent)]'
}

function buildSuggestionCards(tag: string, mode: Mode): CarouselCard[] {
  const lookup = mode === 'food' ? FOOD_TO_WINE : WINE_TO_FOOD
  const mainSuggestion = lookup[tag]
  if (!mainSuggestion) return MOCK_CARDS

  const cards: CarouselCard[] = []

  // Card 1: the matched suggestion
  cards.push({
    id: `suggestion-${tag}`,
    name: mainSuggestion.name,
    appellation: mainSuggestion.appellation,
    badge: 'Suggestion IA',
    badgeColor: 'bg-[var(--accent)]',
    reason: mainSuggestion.explanation,
    barColor: inferBarColor(mainSuggestion.name, mainSuggestion.appellation),
  })

  // Cards 2+: other entries from the same mapping
  for (const [otherTag, suggestion] of Object.entries(lookup)) {
    if (otherTag === tag) continue
    cards.push({
      id: `accord-${otherTag}`,
      name: suggestion.name,
      appellation: suggestion.appellation,
      badge: 'Accord',
      badgeColor: 'bg-[var(--text-muted)]',
      reason: suggestion.explanation,
      barColor: inferBarColor(suggestion.name, suggestion.appellation),
    })
  }

  return cards
}

// --- Component ---

export default function CeSoirModule() {
  const [mode, setMode] = useState<Mode>('food')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchNotFound, setSearchNotFound] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const tags = mode === 'food' ? FOOD_TAGS : WINE_TAGS
  const placeholder = mode === 'food' ? 'Ex: Magret de canard...' : 'Ex: Pinot Noir...'
  const cards = selectedTag ? buildSuggestionCards(selectedTag, mode) : MOCK_CARDS
  const hasActiveSearch = searchQuery.trim().length > 0 || selectedTag !== null || searchNotFound

  function resetSearch(): void {
    setSelectedTag(null)
    setSearchQuery('')
    setSearchNotFound(false)
  }

  // Carousel scroll tracking
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function handleScroll() {
      const cardWidth = 220 + 12
      const index = Math.round(el!.scrollLeft / cardWidth)
      setActiveIndex(Math.min(index, cards.length - 1))
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [cards.length])

  // Reset scroll to first card when suggestion changes
  useEffect(() => {
    if (selectedTag && scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' })
      setActiveIndex(0)
    }
  }, [selectedTag])

  function handleTagClick(tag: string): void {
    setSelectedTag(selectedTag === tag ? null : tag)
    setSearchQuery('')
    setSearchNotFound(false)
  }

  function handleSearchSubmit(): void {
    if (searchQuery.trim().length < 2) return
    const matched = matchQueryToTag(searchQuery, mode)
    if (matched) {
      setSelectedTag(matched)
      setSearchNotFound(false)
    } else {
      setSelectedTag(null)
      setSearchNotFound(true)
    }
  }

  function handleModeSwitch(newMode: Mode): void {
    setMode(newMode)
    resetSearch()
  }

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
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setSelectedTag(null)
            setSearchNotFound(false)
          }}
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

      {/* Carousel — always visible */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto discover-carousel scrollbar-hide -mx-6 px-6 mb-1"
      >
        {cards.map((card) => (
          <div
            key={card.id}
            className="flex-shrink-0 w-[220px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden"
          >
            <div className="flex">
              <div className={`w-[4px] ${card.barColor}`} />
              <div className="flex-1 p-3">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${card.badgeColor} mb-2`}>
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
        ))}
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5 mb-3">
        {cards.map((card, i) => (
          <div
            key={card.id}
            className={`transition-all duration-200 ${
              i === activeIndex ? 'discover-dot-active' : 'discover-dot-inactive'
            }`}
          />
        ))}
      </div>

      {/* Not found message */}
      {searchNotFound && (
        <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] p-4 card-shadow mb-3 text-center">
          <p className="text-[13px] text-[var(--text-secondary)]">
            Pas de suggestion pour cette recherche.
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Essayez un des tags ci-dessous ou un terme plus générique.
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
