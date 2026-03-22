import { Star } from 'lucide-react'

interface StarRatingProps {
  rating: number
  size?: string
}

export function StarRating({ rating, size = 'h-3 w-3' }: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        if (rating >= star) {
          return <Star key={star} className={`${size} fill-[var(--accent)] text-[var(--accent)]`} />
        }
        if (rating >= star - 0.5) {
          return (
            <div key={star} className={`relative ${size}`}>
              <Star className={`absolute inset-0 ${size} fill-none text-[var(--text-muted)]`} />
              <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                <Star className={`${size} fill-[var(--accent)] text-[var(--accent)]`} />
              </div>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
