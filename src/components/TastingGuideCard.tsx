import type { BottleWithZone } from '@/lib/types'

interface TastingGuideCardProps {
  bottle: BottleWithZone
}

export function TastingGuideCard({ bottle }: TastingGuideCardProps) {
  const hasData =
    bottle.typical_aromas?.length ||
    bottle.food_pairings?.length ||
    bottle.serving_temperature ||
    bottle.character ||
    bottle.drink_from ||
    bottle.drink_until

  if (!hasData) return null

  const maturity =
    bottle.drink_from || bottle.drink_until
      ? [
          bottle.drink_from ? `Dès ${bottle.drink_from}` : null,
          bottle.drink_until ? `jusqu'à ${bottle.drink_until}` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : null

  return (
    <div className="mx-4 mt-[14px]">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <span className="section-divider-label">Repères</span>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
        {bottle.character && (
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
              Lecture du vin
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
              {bottle.character}
            </p>
          </div>
        )}

        {(bottle.serving_temperature || maturity) && (
          <div className="grid grid-cols-2 gap-0 border-b border-[var(--border-color)]">
            <div className="border-r border-[var(--border-color)] px-4 py-3">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
                Service
              </div>
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                {bottle.serving_temperature || '—'}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
                Maturité
              </div>
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                {maturity || '—'}
              </div>
            </div>
          </div>
        )}

        {bottle.typical_aromas && bottle.typical_aromas.length > 0 && (
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
              Aromatique
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bottle.typical_aromas.map((aroma, index) => (
                <span
                  key={index}
                  className="rounded-full border border-[rgba(184,134,11,0.08)] bg-[var(--accent-bg)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  {aroma}
                </span>
              ))}
            </div>
          </div>
        )}

        {bottle.food_pairings && bottle.food_pairings.length > 0 && (
          <div className="px-4 py-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
              Accords
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bottle.food_pairings.map((pairing, index) => (
                <span
                  key={index}
                  className="rounded-full border border-[rgba(184,134,11,0.08)] bg-[var(--accent-bg)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                >
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
