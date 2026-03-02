import { useRef } from 'react'
import { Wine, Calendar, Euro, MapPin } from 'lucide-react'
import { formatBottleVolume, getWineColorLabel, type BottleWithZone } from '@/lib/types'

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric'
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
  const displayDate = displayDateStr ? formatDateShort(displayDateStr) : '—'
  const dateInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="identity-card-anim mx-4 mt-3 rounded-[var(--radius)] bg-[var(--bg-card)] shadow-[var(--shadow-md)] overflow-hidden">
      {/* Identity Top: photo + info */}
      <div className="flex gap-[14px] p-[14px]">
        {/* Photo thumbnail */}
        {bottle.photo_url ? (
          <img
            src={bottle.photo_url}
            alt="Étiquette"
            className="w-[90px] h-[120px] rounded-lg object-cover shrink-0 cursor-pointer bg-[#e8e3da] hover:scale-[1.02] transition-transform"
            onClick={() => onZoom(bottle.photo_url!, 'Avant')}
          />
        ) : (
          <div className="w-[90px] h-[120px] rounded-lg shrink-0 bg-[#e8e3da] flex items-center justify-center">
            <Wine className="h-6 w-6 text-[var(--text-muted)]" />
          </div>
        )}

        {/* Info zone */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="font-serif text-[20px] font-bold leading-tight text-[var(--text-primary)]">
            {bottle.domaine || bottle.cuvee || bottle.appellation || 'Vin'}
          </div>
          {bottle.appellation && (
            <div className="text-[13px] text-[var(--text-secondary)] mt-px">
              {bottle.appellation}
            </div>
          )}
          {bottle.cuvee && bottle.domaine && (
            <div className="text-[13px] text-[var(--text-secondary)]">
              {bottle.cuvee}
            </div>
          )}
          {/* Tags: millesime + couleur */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {bottle.millesime && (
              <span className="font-serif text-xs font-semibold text-[var(--text-primary)] bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.06)] rounded-full px-2.5 py-0.5">
                {bottle.millesime}
              </span>
            )}
            <span className="text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.06)] rounded-full px-2.5 py-0.5">
              {formatBottleVolume(bottle.volume_l)}
            </span>
            {bottle.couleur && (
              <span className="text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--accent-bg)] border border-[rgba(184,134,11,0.06)] rounded-full px-2.5 py-0.5">
                {getWineColorLabel(bottle.couleur)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Identity Details bar */}
      <div className="flex items-center border-t border-[var(--border-color)]">
        {/* Date — clickable for drunk bottles */}
        <div
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-[var(--border-color)] relative ${isDrunk && onDateChange ? 'cursor-pointer active:bg-[var(--accent-bg)]' : ''}`}
          onClick={() => isDrunk && onDateChange && dateInputRef.current?.showPicker()}
        >
          <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
            {displayDate}
          </span>
          {isDrunk && onDateChange && (
            <input
              ref={dateInputRef}
              type="date"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              value={bottle.drunk_at ? new Date(bottle.drunk_at).toISOString().split('T')[0] : ''}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value)
              }}
            />
          )}
        </div>
        {/* Prix */}
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-[var(--border-color)]">
          <Euro className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
            {bottle.purchase_price ? `${bottle.purchase_price.toFixed(2)} €` : '—'}
          </span>
        </div>
        {/* Lieu */}
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
          <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
            {bottle.zone?.name || 'Cave'}
          </span>
        </div>
      </div>
    </div>
  )
}
