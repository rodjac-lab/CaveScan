import { ChevronLeft, ChevronRight } from 'lucide-react'

interface BatchNavHeaderProps {
  currentIndex: number
  totalItems: number
  itemStatuses: boolean[]
  onNavigate: (index: number) => void
}

export function BatchNavHeader({
  currentIndex,
  totalItems,
  itemStatuses,
  onNavigate,
}: BatchNavHeaderProps) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => currentIndex > 0 && onNavigate(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="p-1 rounded-full transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
        <span className="text-sm font-medium">
          Fiche {currentIndex + 1} sur {totalItems}
        </span>
        <button
          type="button"
          onClick={() => currentIndex < totalItems - 1 && onNavigate(currentIndex + 1)}
          disabled={currentIndex === totalItems - 1}
          className="p-1 rounded-full transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      </div>
      <div className="flex gap-1">
        {itemStatuses.map((saved, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onNavigate(i)}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              saved
                ? 'bg-green-500'
                : i === currentIndex
                  ? 'bg-[var(--accent)]'
                  : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
