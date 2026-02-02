import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Wine, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBottles } from '@/hooks/useBottles'
import { useZones } from '@/hooks/useZones'
import { type WineColor, type BottleWithZone } from '@/lib/types'

type FilterType = WineColor | null

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

const COLOR_DOT_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'text-[var(--champagne)]',
}

function countByColor(bottles: BottleWithZone[], color: WineColor): number {
  return bottles.filter(b => b.couleur === color).length
}

// Sparkle/star SVG for Bulles
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

// Search icon SVG
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
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
        <SparkleIcon className={`h-2.5 w-2.5 ${COLOR_DOT_STYLES[color]}`} />
      ) : (
        <div className={`h-1.5 w-1.5 rounded-full ${COLOR_DOT_STYLES[color]}`} />
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
    ].join('|')

    const existing = groups.get(groupKey)
    if (existing) {
      existing.bottles.push(bottle)
      existing.quantity++
    } else {
      groups.set(groupKey, {
        key: groupKey,
        bottles: [bottle],
        domaine: bottle.domaine,
        cuvee: bottle.cuvee,
        appellation: bottle.appellation,
        millesime: bottle.millesime,
        couleur: bottle.couleur,
        addedAt: addedDate,
        quantity: 1,
      })
    }
  }

  // Sort by addedAt descending
  return Array.from(groups.values()).sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
}

function searchBottles(
  bottles: BottleWithZone[],
  query: string,
  colorFilter: WineColor | null
): BottleWithZone[] {
  let results = bottles

  // Apply color filter
  if (colorFilter) {
    results = results.filter(b => b.couleur === colorFilter)
  }

  // Apply text search
  if (query.length >= 2) {
    const q = query.toLowerCase()
    results = results.filter(b => {
      return (
        b.domaine?.toLowerCase().includes(q) ||
        b.cuvee?.toLowerCase().includes(q) ||
        b.appellation?.toLowerCase().includes(q) ||
        b.millesime?.toString().includes(q) ||
        b.zone?.name.toLowerCase().includes(q) ||
        b.shelf?.toLowerCase().includes(q)
      )
    })
  }

  return results
}

export default function Home() {
  const { bottles, loading, error } = useBottles()
  const { zones } = useZones()
  const [colorFilter, setColorFilter] = useState<FilterType>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredBottles = useMemo(
    () => searchBottles(bottles, searchQuery, colorFilter),
    [bottles, searchQuery, colorFilter]
  )

  const groupedBottles = useMemo(
    () => groupBottles(filteredBottles),
    [filteredBottles]
  )

  const stats = {
    total: bottles.length,
    rouge: countByColor(bottles, 'rouge'),
    blanc: countByColor(bottles, 'blanc'),
    rose: countByColor(bottles, 'rose'),
    bulles: countByColor(bottles, 'bulles'),
  }

  const handleColorFilter = (color: WineColor) => {
    setColorFilter(current => current === color ? null : color)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setColorFilter(null)
  }

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
    <div className="flex flex-1 flex-col">
      {/* Page Header */}
      <div className="px-6 pt-4 pb-3">
        <p className="brand-text">CaveScan</p>
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

      {/* Search Bar */}
      <div className="relative mx-6 mb-4">
        <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un vin, domaine, appellation..."
          className="h-10 rounded-[var(--radius-sm)] border-[var(--border-color)] bg-[var(--bg-card)] pl-10 pr-10 text-[13px] placeholder:text-[var(--text-muted)]"
        />
        {(searchQuery || colorFilter) && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Section Header */}
      <div className="mx-6 mb-2 flex items-center justify-between">
        <h2 className="font-serif text-base font-semibold text-[var(--text-primary)]">Entrées récentes</h2>
        <button className="text-xs font-medium text-[var(--accent)]">Filtrer →</button>
      </div>

      {/* Bottle List */}
      <div className="flex-1 overflow-y-auto px-6 pb-20 scrollbar-hide">
        {bottles.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-4 rounded-[var(--radius)] bg-[var(--bg-card)] py-8 card-shadow">
            <Wine className="h-12 w-12 text-[var(--text-muted)]" />
            <p className="text-center text-[var(--text-secondary)]">
              Votre cave est vide.<br />Ajoutez votre première bouteille !
            </p>
            <Link to="/add">
              <Button className="bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white">
                Ajouter une bouteille
              </Button>
            </Link>
          </div>
        ) : groupedBottles.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-4 rounded-[var(--radius)] bg-[var(--bg-card)] py-8 card-shadow">
            <SearchIcon className="h-12 w-12 text-[var(--text-muted)]" />
            <p className="text-center text-[var(--text-secondary)]">
              Aucun résultat pour "{searchQuery}"
              {colorFilter && ` (${colorFilter})`}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {groupedBottles.map((group) => {
              const day = group.addedAt.getDate().toString().padStart(2, '0')
              const month = group.addedAt.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')

              return (
                <Link key={group.key} to={`/bottle/${group.bottles[0].id}`}>
                  <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2.5 pr-3 card-shadow transition-all duration-200 hover:bg-[var(--accent-bg)]">
                    {/* Date */}
                    <div className="w-9 flex-shrink-0 text-center">
                      <p className="font-serif text-[17px] font-bold leading-tight text-[var(--text-primary)]">{day}</p>
                      <p className="text-[9px] font-medium uppercase text-[var(--text-muted)]">{month}</p>
                    </div>

                    {/* Color Bar */}
                    <div
                      className={`h-8 w-[3px] flex-shrink-0 rounded-sm ${
                        group.couleur ? COLOR_BAR_STYLES[group.couleur] : 'bg-[var(--text-muted)]'
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
                    {group.quantity > 0 && (
                      <div className="flex-shrink-0 text-right">
                        <span className="font-serif text-[15px] font-semibold text-[var(--text-primary)]">{group.quantity}</span>
                        <span className="ml-0.5 text-[10px] text-[var(--text-muted)]">btl</span>
                      </div>
                    )}
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
