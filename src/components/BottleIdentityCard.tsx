import { useRef } from 'react'
import { Wine, Calendar, Euro, MapPin } from 'lucide-react'
import { formatBottleVolume, getWineColorLabel, type BottleWithZone } from '@/lib/types'

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

interface BottleIdentityCardProps {
  bottle: BottleWithZone
  onZoom: (src: string, label?: string) => void
  onDateChange?: (newDate: string) => void
}

export function BottleIdentityCard({ bottle, onZoom, onDateChange }: BottleIdentityCardProps) {
  const isDrunk = bottle.status === 'drunk'
  const displayDateStr = (isDrunk && bottle.drunk_at) || bottle.added_at
  const displayDate = displayDateStr ? formatDateShort(displayDateStr) : '-'
  const dateInputRef = useRef<HTMLInputElement>(null)
  const grapeDetails = bottle.grape_varieties?.filter(Boolean).join(', ') || ''
  const originDetails = [bottle.country, bottle.region, grapeDetails].filter(Boolean).join(' · ')

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
            <div className="mt-1 text-[12px] text-[var(--text-muted)]">
              {originDetails}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bottle.millesime && (
              <span className="rounded-full border border-[rgba(184,134,11,0.06)] bg-[var(--accent-bg)] px-2.5 py-0.5 font-serif text-xs font-semibold text-[var(--text-primary)]">
                {bottle.millesime}
              </span>
            )}
            <span className="rounded-full border border-[rgba(184,134,11,0.06)] bg-[var(--accent-bg)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              {formatBottleVolume(bottle.volume_l)}
            </span>
            {bottle.couleur && (
              <span className="rounded-full border border-[rgba(184,134,11,0.06)] bg-[var(--accent-bg)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                {getWineColorLabel(bottle.couleur)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center border-t border-[var(--border-color)]">
        <div
          className={`relative flex flex-1 items-center justify-center gap-1.5 border-r border-[var(--border-color)] px-2 py-2.5 ${isDrunk && onDateChange ? 'cursor-pointer active:bg-[var(--accent-bg)]' : ''}`}
          onClick={() => isDrunk && onDateChange && dateInputRef.current?.showPicker()}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
            {displayDate}
          </span>
          {isDrunk && onDateChange && (
            <input
              ref={dateInputRef}
              type="date"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={bottle.drunk_at ? new Date(bottle.drunk_at).toISOString().split('T')[0] : ''}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value)
              }}
            />
          )}
        </div>
        <div className="flex flex-1 items-center justify-center gap-1.5 border-r border-[var(--border-color)] px-2 py-2.5">
          <Euro className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
            {bottle.purchase_price ? `${bottle.purchase_price.toFixed(2)} EUR` : '-'}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
            {bottle.zone?.name || 'Cave'}
          </span>
        </div>
      </div>
    </div>
  )
}
