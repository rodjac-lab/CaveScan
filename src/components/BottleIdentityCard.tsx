import { Wine } from 'lucide-react'
import { formatBottleVolume, getWineColorLabel, type BottleWithZone } from '@/lib/types'

interface BottleIdentityCardProps {
  bottle: BottleWithZone
  onZoom: (src: string, label?: string) => void
}

export function BottleIdentityCard({ bottle, onZoom }: BottleIdentityCardProps) {
  const grapeDetails = bottle.grape_varieties?.filter(Boolean).join(', ') || ''
  const originDetails = [grapeDetails, bottle.region, bottle.country].filter(Boolean).join(' · ')

  return (
    <div className="identity-card-anim mx-4 mt-3 overflow-hidden rounded-[var(--radius)] bg-[var(--bg-card)] shadow-[var(--shadow-md)]">
      <div className="flex gap-[14px] p-[14px]">
        {bottle.photo_url ? (
          <img
            src={bottle.photo_url}
            alt="Etiquette"
            className="h-[120px] w-[90px] shrink-0 cursor-pointer rounded-lg bg-[#e8e3da] object-cover transition-transform hover:scale-[1.02]"
            onClick={() => onZoom(bottle.photo_url!, 'Avant')}
          />
        ) : (
          <div className="flex h-[120px] w-[90px] shrink-0 items-center justify-center rounded-lg bg-[#e8e3da]">
            <Wine className="h-6 w-6 text-[var(--text-muted)]" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <div className="font-serif text-[20px] font-bold leading-tight text-[var(--text-primary)]">
            {bottle.domaine || bottle.cuvee || bottle.appellation || 'Vin'}
          </div>

          {bottle.appellation && (
            <div className="mt-px text-[13px] text-[var(--text-secondary)]">
              {bottle.appellation}
            </div>
          )}

          {bottle.cuvee && bottle.domaine && (
            <div className="text-[13px] text-[var(--text-secondary)]">
              {bottle.cuvee}
            </div>
          )}

          {originDetails && (
            <div className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
              {originDetails}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-[var(--border-color)]">
        <div className="border-r border-[var(--border-color)] px-2 py-2.5 text-center">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
            Millésime
          </div>
          <div className="font-serif text-[12px] font-semibold text-[var(--text-primary)]">
            {bottle.millesime || '—'}
          </div>
        </div>

        <div className="border-r border-[var(--border-color)] px-2 py-2.5 text-center">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
            Couleur
          </div>
          <div className="text-[12px] font-medium text-[var(--text-secondary)]">
            {getWineColorLabel(bottle.couleur)}
          </div>
        </div>

        <div className="px-2 py-2.5 text-center">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
            Volume
          </div>
          <div className="text-[12px] font-medium text-[var(--text-secondary)]">
            {formatBottleVolume(bottle.volume_l)}
          </div>
        </div>
      </div>
    </div>
  )
}
