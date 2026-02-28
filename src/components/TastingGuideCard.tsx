import type { BottleWithZone } from '@/lib/types'

interface TastingGuideCardProps {
  bottle: BottleWithZone
}

export function TastingGuideCard({ bottle }: TastingGuideCardProps) {
  const hasData = bottle.typical_aromas?.length || bottle.food_pairings?.length || bottle.serving_temperature || bottle.character
  if (!hasData) return null

  return (
    <div className="mx-4 mt-[14px]">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <span className="section-divider-label">Repères de dégustation</span>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] overflow-hidden">
        {/* Temperature */}
        {bottle.serving_temperature && (
          <div className="flex items-center px-4 py-2.5 border-b border-[var(--border-color)]">
            <span className="text-[12px] text-[var(--text-muted)] flex-1">Température</span>
            <span className="text-[13px] font-medium text-[var(--text-primary)]">{bottle.serving_temperature}</span>
          </div>
        )}

        {/* Aromas */}
        {bottle.typical_aromas && bottle.typical_aromas.length > 0 && (
          <div className="px-4 py-2.5 border-b border-[var(--border-color)]">
            <span className="text-[12px] text-[var(--text-muted)] block mb-1.5">Arômes typiques</span>
            <div className="flex flex-wrap gap-1.5">
              {bottle.typical_aromas.map((aroma, i) => (
                <span key={i} className="rounded-full bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  {aroma}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Character */}
        {bottle.character && (
          <div className="px-4 py-2.5 border-b border-[var(--border-color)]">
            <span className="text-[12px] text-[var(--text-muted)] block mb-1">Caractère</span>
            <p className="text-[13px] italic text-[var(--text-secondary)] leading-relaxed">{bottle.character}</p>
          </div>
        )}

        {/* Food pairings */}
        {bottle.food_pairings && bottle.food_pairings.length > 0 && (
          <div className="px-4 py-2.5">
            <span className="text-[12px] text-[var(--text-muted)] block mb-1.5">Accords mets</span>
            <div className="flex flex-wrap gap-1.5">
              {bottle.food_pairings.map((pairing, i) => (
                <span key={i} className="rounded-full bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  {pairing}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
