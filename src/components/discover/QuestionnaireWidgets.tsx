import { useState, memo } from 'react'
import {
  REGION_OPTIONS,
  type FWIScores,
  type SensoryPreferences,
} from '@/lib/questionnaire-profile'

// --- FWI Slider ---

export function FWISlider({ onConfirm }: { onConfirm: (value: number) => void }) {
  const [value, setValue] = useState(3)

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>Pas du tout moi</span>
        <span>Tout à fait moi</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="questionnaire-slider w-full"
        />
        <div className="flex justify-between px-[2px] mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`text-[11px] font-medium transition-colors ${
                n === value ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onConfirm(value)}
        className="w-full h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white text-[14px] font-semibold"
      >
        Confirmer
      </button>
    </div>
  )
}

// --- Sensory Chips (binary choice) ---

export function SensoryChips({ optionA, optionB, onSelect }: {
  optionA: { label: string; value: string }
  optionB: { label: string; value: string }
  onSelect: (value: string) => void
}) {
  return (
    <div className="flex gap-3">
      {[optionA, optionB].map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className="flex-1 py-3 px-3 rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] active:bg-[var(--accent)] active:text-white active:border-[var(--accent)] transition-colors"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// --- Region Multi-Select ---

export function RegionChips({ onConfirm }: { onConfirm: (regions: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([])

  function toggle(value: string) {
    if (value === 'explore_tout') {
      setSelected(['explore_tout'])
      return
    }
    setSelected(prev => {
      const without = prev.filter(v => v !== 'explore_tout')
      if (without.includes(value)) {
        return without.filter(v => v !== value)
      }
      if (without.length >= 3) return without
      return [...without, value]
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {REGION_OPTIONS.map((opt) => {
          const isSelected = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`py-2 px-3.5 rounded-full text-[13px] font-medium border transition-colors ${
                isSelected
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-color)]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          className="w-full h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white text-[14px] font-semibold"
        >
          Confirmer
        </button>
      )}
    </div>
  )
}

function GaugeBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-[var(--text-secondary)] font-medium">{label}</span>
        <span className="text-[var(--text-muted)]">{value}/{max}</span>
      </div>
      <div className="h-[6px] rounded-full bg-[var(--border-color)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// --- Profile Result Card ---

export const ProfileCard = memo(function ProfileCard({ fwi, sensory, marketingProfile }: {
  fwi: FWIScores
  sensory: SensoryPreferences
  marketingProfile: string
}) {
  const sensoryLabels: Record<string, string> = {
    puissance: 'Puissant',
    elegance: 'Élégant',
    fruits_murs: 'Fruits mûrs',
    fruits_frais: 'Fruits frais',
    jeune: 'Jeune',
    tertiaire: 'Évolué',
    bois: 'Boisé',
    mineral: 'Minéral',
    tendu: 'Tendu',
    rond: 'Rond',
    valeurs_sures: 'Classique',
    decouverte: 'Explorateur',
  }

  const regionLabels = sensory.regions.map(r => REGION_OPTIONS.find(ro => ro.value === r)?.label ?? r)

  const tags = [
    sensoryLabels[sensory.structure],
    sensoryLabels[sensory.aromatique],
    sensoryLabels[sensory.evolution],
    sensoryLabels[sensory.elevage],
    sensoryLabels[sensory.acidite],
    sensoryLabels[sensory.neophilie],
    ...regionLabels,
  ].filter(Boolean)

  return (
    <div className="mt-2 rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
      <div className="p-4 space-y-4">
        <h3 className="font-serif text-[20px] font-bold text-[var(--text-primary)] leading-tight">
          {marketingProfile}
        </h3>
        <div className="space-y-2.5">
          <GaugeBar label="Sensibilité" value={fwi.connoisseur} max={30} />
          <GaugeBar label="Savoir" value={fwi.knowledge} max={30} />
          <GaugeBar label="Terroir" value={fwi.provenance} max={30} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full px-2.5 py-1 text-[11px] font-medium bg-[var(--accent)] text-white"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
})
