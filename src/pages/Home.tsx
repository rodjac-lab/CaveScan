import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, Loader2, SlidersHorizontal, Wine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBottles } from '@/hooks/useBottles'
import { useZones } from '@/hooks/useZones'
import { type WineColor, type BottleWithZone, type Zone, volumeLabel } from '@/lib/types'

type FilterType = WineColor | null

interface AdvancedFilters {
  location: string
}

interface FilterOption {
  value: string
  label: string
}

const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  location: '',
}

const COLOR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

const BULLES_TEXT_STYLE = 'text-[var(--champagne)]'

function countByColor(bottles: BottleWithZone[], color: WineColor): number {
  return bottles.reduce((sum, b) => sum + (b.couleur === color ? (b.quantity ?? 1) : 0), 0)
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
}

function normalizeFilterValue(value: string | number | null | undefined): string {
  return value == null ? '' : String(value).trim()
}

function getBottleLocationLabel(bottle: BottleWithZone): string {
  return normalizeFilterValue(bottle.zone?.name)
}

function uniqueTextOptions(values: Array<string | number | null | undefined>, sortDescending = false): FilterOption[] {
  const unique = Array.from(new Set(values.map(normalizeFilterValue).filter(Boolean)))
  unique.sort((a, b) => {
    if (sortDescending) return b.localeCompare(a, 'fr', { numeric: true, sensitivity: 'base' })
    return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
  })
  return unique.map((value) => ({ value, label: value }))
}

function buildLocationFilterOptions(zones: Zone[]): FilterOption[] {
  return uniqueTextOptions(zones.map((zone) => zone.name))
}

function hasActiveAdvancedFilters(filters: AdvancedFilters): boolean {
  return !!filters.location
}

function countActiveAdvancedFilters(filters: AdvancedFilters): number {
  return filters.location ? 1 : 0
}

function bottleMatchesAdvancedFilters(bottle: BottleWithZone, filters: AdvancedFilters): boolean {
  if (filters.location && getBottleLocationLabel(bottle) !== filters.location) return false
  return true
}

function getAdvancedFilterEntries(filters: AdvancedFilters): Array<{ key: keyof AdvancedFilters; label: string; value: string }> {
  return filters.location
    ? [{ key: 'location', label: 'Emplacement', value: filters.location }]
    : []
}

function buildAdvancedFilterOptions(zones: Zone[]): { location: FilterOption[] } {
  return {
    location: buildLocationFilterOptions(zones),
  }
}

interface StatCellProps {
  count: number
  label: string
  color: WineColor
  isActive: boolean
  onClick: () => void
  isSparkle?: boolean
}

function StatCell({ count, label, color, isActive, onClick, isSparkle }: StatCellProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-3 transition-all duration-200 ${
        isActive ? 'bg-[rgba(184,134,11,0.08)]' : 'hover:bg-[rgba(184,134,11,0.04)]'
      }`}
    >
      {isSparkle ? (
        <SparkleIcon className={`h-2.5 w-2.5 ${BULLES_TEXT_STYLE}`} />
      ) : (
        <div className={`h-1.5 w-1.5 rounded-full ${COLOR_STYLES[color]}`} />
      )}
      <span className="mt-1.5 font-serif text-2xl font-bold text-[var(--text-primary)]">{count}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
    </button>
  )
}

// Group bottles by key fields and day
interface BottleGroup {
  key: string
  bottles: BottleWithZone[]
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: WineColor | null
  volumeL: number
  addedAt: Date
  quantity: number
}

function groupBottles(bottles: BottleWithZone[]): BottleGroup[] {
  const groups = new Map<string, BottleGroup>()

  for (const bottle of bottles) {
    const addedDate = bottle.added_at ? new Date(bottle.added_at) : new Date()
    const dayKey = addedDate.toISOString().split('T')[0]
    const groupKey = [
      dayKey,
      bottle.domaine || '',
      bottle.cuvee || '',
      bottle.appellation || '',
      bottle.millesime || '',
      bottle.couleur || '',
      bottle.volume_l || 0.75,
    ].join('|')

    const existing = groups.get(groupKey)
    if (existing) {
      existing.bottles.push(bottle)
      existing.quantity += bottle.quantity ?? 1
    } else {
      groups.set(groupKey, {
        key: groupKey,
        bottles: [bottle],
        domaine: bottle.domaine,
        cuvee: bottle.cuvee,
        appellation: bottle.appellation,
        millesime: bottle.millesime,
        couleur: bottle.couleur,
        volumeL: bottle.volume_l ?? 0.75,
        addedAt: addedDate,
        quantity: bottle.quantity ?? 1,
      })
    }
  }

  // Sort by addedAt descending
  return Array.from(groups.values()).sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
}

function searchBottles(
  bottles: BottleWithZone[],
  query: string,
  colorFilter: WineColor | null,
  advancedFilters: AdvancedFilters
): BottleWithZone[] {
  let results = bottles

  // Apply color filter
  if (colorFilter) {
    results = results.filter(b => b.couleur === colorFilter)
  }

  // Apply text search
  if (query.length >= 2) {
    const q = query.toLowerCase()
    results = results.filter(b =>
      b.domaine?.toLowerCase().includes(q) ||
      b.cuvee?.toLowerCase().includes(q) ||
      b.appellation?.toLowerCase().includes(q) ||
      b.millesime?.toString().includes(q) ||
      b.zone?.name.toLowerCase().includes(q) ||
      b.shelf?.toLowerCase().includes(q)
    )
  }

  if (hasActiveAdvancedFilters(advancedFilters)) {
    results = results.filter((bottle) => bottleMatchesAdvancedFilters(bottle, advancedFilters))
  }

  return results
}

interface FilterChipGroupProps {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}

function FilterChipGroup({ label, value, options, onChange }: FilterChipGroupProps) {
  return (
    <div>
      <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(value === option.value ? '' : option.value)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              value === option.value
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
            }`}
          >
            {option.label}
          </button>
        ))}
        {options.length === 0 && (
          <span className="text-[12px] text-[var(--text-muted)]">Aucune valeur disponible</span>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const { bottles, loading, error } = useBottles()
  const { zones } = useZones()
  const [colorFilter, setColorFilter] = useState<FilterType>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS)

  const filteredBottles = useMemo(
    () => searchBottles(bottles, searchQuery, colorFilter, advancedFilters),
    [bottles, searchQuery, colorFilter, advancedFilters]
  )

  const groupedBottles = useMemo(
    () => groupBottles(filteredBottles),
    [filteredBottles]
  )

  const filterOptions = useMemo(
    () => buildAdvancedFilterOptions(zones),
    [zones]
  )

  const stats = {
    total: bottles.reduce((sum, b) => sum + (b.quantity ?? 1), 0),
    rouge: countByColor(bottles, 'rouge'),
    blanc: countByColor(bottles, 'blanc'),
    rose: countByColor(bottles, 'rose'),
    bulles: countByColor(bottles, 'bulles'),
  }

  const handleColorFilter = (color: WineColor) => {
    setColorFilter(current => current === color ? null : color)
  }

  const handleLocationFilterChange = (value: string) => {
    setAdvancedFilters({ location: value })
    if (value) setFiltersOpen(false)
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setColorFilter(null)
    setAdvancedFilters(EMPTY_ADVANCED_FILTERS)
  }

  const activeAdvancedFilterCount = countActiveAdvancedFilters(advancedFilters)
  const hasFilters = searchQuery.length > 0 || !!colorFilter || activeAdvancedFilterCount > 0

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <div className="rounded-[var(--radius-sm)] bg-destructive/10 p-4 text-destructive">
          Erreur : {error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Page Header */}
      <div className="px-6 pt-4 pb-3">
        <p className="brand-text">Celestin</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Ma Cave</h1>
        <p className="text-[13px] font-light text-[var(--text-secondary)]">
          {zones.length} cave{zones.length > 1 ? 's' : ''} · {stats.total} bouteille{stats.total > 1 ? 's' : ''}
        </p>
      </div>

      {/* Stats Row */}
      <div className="mx-6 mb-4 grid grid-cols-4 divide-x divide-[var(--border-color)]">
        <StatCell
          count={stats.rouge}
          label="Rouges"
          color="rouge"
          isActive={colorFilter === 'rouge'}
          onClick={() => handleColorFilter('rouge')}
        />
        <StatCell
          count={stats.blanc}
          label="Blancs"
          color="blanc"
          isActive={colorFilter === 'blanc'}
          onClick={() => handleColorFilter('blanc')}
        />
        <StatCell
          count={stats.bulles}
          label="Bulles"
          color="bulles"
          isActive={colorFilter === 'bulles'}
          onClick={() => handleColorFilter('bulles')}
          isSparkle
        />
        <StatCell
          count={stats.rose}
          label="Rosés"
          color="rose"
          isActive={colorFilter === 'rose'}
          onClick={() => handleColorFilter('rose')}
        />
      </div>

      {/* Search and filters */}
      <div className="relative mx-6 mb-2">
        <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un vin, domaine, appellation..."
          className="h-10 rounded-[var(--radius-sm)] border-[var(--border-color)] bg-[var(--bg-card)] pl-10 pr-20 text-[13px] placeholder:text-[var(--text-muted)]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-11 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
          className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center text-[var(--accent)]"
          aria-expanded={filtersOpen}
          aria-label="Afficher les filtres"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeAdvancedFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] leading-none text-white">
              {activeAdvancedFilterCount}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div className="mx-6 mb-3 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--accent-bg)] p-3">
          <div className="space-y-3">
            <FilterChipGroup
              label="Emplacement"
              value={advancedFilters.location}
              options={filterOptions.location}
              onChange={handleLocationFilterChange}
            />
          </div>
          {activeAdvancedFilterCount > 0 && (
            <button
              type="button"
              onClick={() => setAdvancedFilters(EMPTY_ADVANCED_FILTERS)}
              className="mt-2 text-[11px] font-medium text-[var(--accent)]"
            >
              Effacer l'emplacement
            </button>
          )}
        </div>
      )}

      {hasFilters && (
        <div className="mx-6 mb-3 flex flex-wrap gap-1.5">
          {colorFilter && (
            <button
              type="button"
              onClick={() => setColorFilter(null)}
              className="rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
            >
              {colorFilter} ×
            </button>
          )}
          {getAdvancedFilterEntries(advancedFilters).map(({ key, label, value }) => {
            return (
              <button
                key={key}
                type="button"
                onClick={() => setAdvancedFilters((current) => ({ ...current, [key]: '' }))}
                className="rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
              >
                {label}: {value} ×
              </button>
            )
          })}
          <button
            type="button"
            onClick={handleClearFilters}
            className="px-1.5 py-1 text-[11px] font-medium text-[var(--accent)]"
          >
            Tout effacer
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="mx-6 mb-2 flex items-center justify-between">
        <h2 className="font-serif text-base font-semibold text-[var(--text-primary)]">
          {hasFilters ? 'Résultats' : 'Entrées récentes'}
        </h2>
        {filtersOpen && (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        )}
      </div>

      {/* Bottle List */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-20 scrollbar-hide">
        {bottles.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-4 rounded-[var(--radius)] bg-[var(--bg-card)] py-8 card-shadow">
            <Wine className="h-12 w-12 text-[var(--text-muted)]" />
            <p className="text-center text-[var(--text-secondary)]">
              Votre cave est vide.<br />Ajoutez votre première bouteille !
            </p>
            <Link to="/scanner">
              <Button className="bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white">
                Scanner une bouteille
              </Button>
            </Link>
          </div>
        ) : groupedBottles.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-4 rounded-[var(--radius)] bg-[var(--bg-card)] py-8 card-shadow">
            <SearchIcon className="h-12 w-12 text-[var(--text-muted)]" />
            <p className="text-center text-[var(--text-secondary)]">
              Aucun résultat
              {searchQuery && ` pour "${searchQuery}"`}
              {colorFilter && ` (${colorFilter})`}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {groupedBottles.map((group) => {
              const day = group.addedAt.getDate().toString().padStart(2, '0')
              const month = group.addedAt.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')

              return (
                <Link
                  key={group.key}
                  to={`/bottle/${group.bottles[0].id}`}
                  state={{ groupBottleIds: group.bottles.map((b) => b.id) }}
                >
                  <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2.5 pr-3 card-shadow transition-all duration-200 hover:bg-[var(--accent-bg)]">
                    {/* Date */}
                    <div className="w-9 flex-shrink-0 text-center">
                      <p className="font-serif text-[17px] font-bold leading-tight text-[var(--text-primary)]">{day}</p>
                      <p className="text-[9px] font-medium uppercase text-[var(--text-muted)]">{month}</p>
                    </div>

                    {/* Color Bar */}
                    <div
                      className={`h-8 w-[3px] flex-shrink-0 rounded-sm ${
                        group.couleur ? COLOR_STYLES[group.couleur] : 'bg-[var(--text-muted)]'
                      }`}
                    />

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                        {group.domaine || group.appellation || 'Vin inconnu'}
                      </p>
                      <p className="truncate text-[11px] font-light text-[var(--text-secondary)]">
                        {[group.appellation !== group.domaine ? group.appellation : null, group.millesime]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    {/* Quantity */}
                    <div className="flex-shrink-0 text-right">
                      <span className="font-serif text-[15px] font-semibold text-[var(--text-primary)]">{group.quantity}</span>
                      <span className="ml-0.5 text-[10px] text-[var(--text-muted)]">{volumeLabel(group.volumeL)}</span>
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
