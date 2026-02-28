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
    <div className="flex flex-col items-center gap-2 px-1">
      <div className="flex gap-1.5">
        {itemStatuses.map((saved, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onNavigate(i)}
            className={`h-2 rounded-full transition-colors ${
              saved
                ? 'bg-green-500 w-6'
                : i === currentIndex
                  ? 'bg-[var(--accent)] w-8'
                  : 'bg-muted w-6'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--text-muted)]">
        {currentIndex + 1} / {totalItems}
      </span>
    </div>
  )
}
