import { ChevronLeft, ChevronRight } from 'lucide-react'

export function getProgressDotColor(index: number, currentIndex: number): string {
  if (index === currentIndex) return 'bg-[var(--accent)]'
  if (index < currentIndex) return 'bg-green-500'
  return 'bg-muted'
}

interface BatchDrinkProgressProps {
  currentIndex: number
  totalItems: number
}

export function BatchDrinkProgress({ currentIndex, totalItems }: BatchDrinkProgressProps) {
  return (
    <div className="flex items-center justify-between px-1 mb-4">
      <div className="flex items-center gap-2">
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          Fiche {currentIndex + 1} sur {totalItems}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: totalItems }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors ${getProgressDotColor(i, currentIndex)}`}
          />
        ))}
      </div>
    </div>
  )
}
