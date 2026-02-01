import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search as SearchIcon, Wine, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useBottles } from '@/hooks/useBottles'
import { getWineColorLabel, type WineColor, type BottleWithZone } from '@/lib/types'

const COLOR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-red-900/30 text-red-300',
  blanc: 'bg-amber-100/30 text-amber-200',
  rose: 'bg-pink-300/30 text-pink-300',
  bulles: 'bg-yellow-200/30 text-yellow-200',
}

export default function Search() {
  const { bottles, loading } = useBottles()
  const [query, setQuery] = useState('')
  const [colorFilter, setColorFilter] = useState<WineColor | null>(null)

  const results = searchBottles(bottles, query, colorFilter)

  const handleClear = () => {
    setQuery('')
    setColorFilter(null)
  }

  return (
    <div className="flex-1 p-4">
      <h1 className="text-2xl font-bold mb-4">Rechercher</h1>

      {/* Search input */}
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Domaine, cuvée, appellation, millésime..."
          className="pl-10 pr-10"
          autoFocus
        />
        {(query || colorFilter) && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Color filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['rouge', 'blanc', 'rose', 'bulles'] as WineColor[]).map((color) => (
          <Button
            key={color}
            size="sm"
            variant={colorFilter === color ? 'default' : 'outline'}
            onClick={() => setColorFilter(colorFilter === color ? null : color)}
            className={colorFilter === color ? COLOR_STYLES[color] : ''}
          >
            {getWineColorLabel(color)}
          </Button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-center text-muted-foreground">Chargement...</p>
      ) : query.length === 0 && !colorFilter ? (
        <div className="mt-8 text-center">
          <SearchIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            Tapez pour rechercher dans votre cave
          </p>
        </div>
      ) : results.length === 0 ? (
        <p className="text-center text-muted-foreground mt-8">
          Aucun résultat pour "{query}"
          {colorFilter && ` (${getWineColorLabel(colorFilter)})`}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-2">
            {results.length} résultat{results.length > 1 ? 's' : ''}
          </p>
          {results.map((bottle) => (
            <Link key={bottle.id} to={`/bottle/${bottle.id}`}>
              <Card className="transition-colors hover:bg-card/80">
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      bottle.couleur ? COLOR_STYLES[bottle.couleur] : 'bg-muted'
                    }`}
                  >
                    <Wine className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {bottle.domaine || bottle.appellation || 'Vin inconnu'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[bottle.appellation, bottle.millesime].filter(Boolean).join(' · ')}
                    </p>
                    {bottle.cuvee && (
                      <p className="truncate text-xs text-muted-foreground">
                        {bottle.cuvee}
                      </p>
                    )}
                  </div>
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
