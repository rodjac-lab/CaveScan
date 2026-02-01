import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wine, MapPin, Calendar, Loader2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { getWineColorLabel, type WineColor, type BottleWithZone } from '@/lib/types'

const COLOR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-red-900/30 text-red-300',
  blanc: 'bg-amber-100/30 text-amber-200',
  rosé: 'bg-pink-300/30 text-pink-300',
  bulles: 'bg-yellow-200/30 text-yellow-200',
}

type FilterType = WineColor | 'all'

interface FilterButtonProps {
  filter: FilterType
  currentFilter: FilterType
  count: number
  label: string
  activeClassName: string
  onFilterChange: (filter: FilterType) => void
}

function FilterButton({
  filter,
  currentFilter,
  count,
  label,
  activeClassName,
  onFilterChange,
}: FilterButtonProps) {
  const isActive = currentFilter === filter
  return (
    <Button
      size="sm"
      variant={isActive ? 'default' : 'outline'}
      onClick={() => onFilterChange(filter)}
      className={isActive ? activeClassName : ''}
    >
      {label} ({count})
    </Button>
  )
}

function countByColor(bottles: BottleWithZone[], color: WineColor): number {
  return bottles.filter(b => b.couleur === color).length
}

export default function Home() {
  const { bottles, loading, error } = useBottles()
  const { bottles: recentlyDrunk, loading: drunkLoading } = useRecentlyDrunk()
  const [filter, setFilter] = useState<FilterType>('all')

  const filteredBottles = filter === 'all'
    ? bottles
    : bottles.filter(b => b.couleur === filter)

  const stats = {
    total: bottles.length,
    rouge: countByColor(bottles, 'rouge'),
    blanc: countByColor(bottles, 'blanc'),
    rose: countByColor(bottles, 'rosé'),
    bulles: countByColor(bottles, 'bulles'),
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-4">
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          Erreur : {error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      {/* Recently drunk section */}
      {!drunkLoading && recentlyDrunk.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            Sorties récentes
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {recentlyDrunk.slice(0, 5).map((bottle) => (
              <Link
                key={bottle.id}
                to={`/bottle/${bottle.id}`}
                className="flex-shrink-0"
              >
                <Card className="w-32 bg-card/50">
                  <CardContent className="p-2 text-center">
                    <p className="truncate text-xs font-medium">
                      {bottle.domaine || bottle.appellation || 'Vin'}
                    </p>
                    {bottle.millesime && (
                      <p className="text-xs text-muted-foreground">{bottle.millesime}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          Ma Cave
          <span className="ml-2 text-lg font-normal text-muted-foreground">
            {stats.total} bouteille{stats.total > 1 ? 's' : ''}
          </span>
        </h1>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        <FilterButton
          filter="all"
          currentFilter={filter}
          count={stats.total}
          label="Tous"
          activeClassName="bg-wine-900 hover:bg-wine-800"
          onFilterChange={setFilter}
        />
        <FilterButton
          filter="rouge"
          currentFilter={filter}
          count={stats.rouge}
          label="Rouge"
          activeClassName="bg-red-900 hover:bg-red-800"
          onFilterChange={setFilter}
        />
        <FilterButton
          filter="blanc"
          currentFilter={filter}
          count={stats.blanc}
          label="Blanc"
          activeClassName="bg-amber-700 hover:bg-amber-600"
          onFilterChange={setFilter}
        />
        <FilterButton
          filter="rosé"
          currentFilter={filter}
          count={stats.rose}
          label="Rosé"
          activeClassName="bg-pink-700 hover:bg-pink-600"
          onFilterChange={setFilter}
        />
        <FilterButton
          filter="bulles"
          currentFilter={filter}
          count={stats.bulles}
          label="Bulles"
          activeClassName="bg-yellow-700 hover:bg-yellow-600"
          onFilterChange={setFilter}
        />
      </div>

      {/* Bottle list */}
      {filteredBottles.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Wine className="h-12 w-12 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              {bottles.length === 0
                ? 'Votre cave est vide. Ajoutez votre première bouteille !'
                : 'Aucune bouteille ne correspond au filtre.'}
            </p>
            {bottles.length === 0 && (
              <Link to="/add">
                <Button className="bg-wine-900 hover:bg-wine-800">
                  Ajouter une bouteille
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredBottles.map((bottle) => (
            <Link key={bottle.id} to={`/bottle/${bottle.id}`}>
              <Card className="transition-colors hover:bg-card/80">
                <CardContent className="flex items-center gap-3 p-3">
                  {/* Color indicator */}
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      bottle.couleur ? COLOR_STYLES[bottle.couleur] : 'bg-muted'
                    }`}
                  >
                    <Wine className="h-5 w-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {bottle.domaine || bottle.appellation || 'Vin inconnu'}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {bottle.appellation && bottle.domaine && (
                        <span className="truncate">{bottle.appellation}</span>
                      )}
                      {bottle.millesime && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {bottle.millesime}
                        </span>
                      )}
                      {bottle.zone && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3" />
                          {bottle.zone.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Color badge */}
                  {bottle.couleur && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${COLOR_STYLES[bottle.couleur]}`}
                    >
                      {getWineColorLabel(bottle.couleur)}
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
