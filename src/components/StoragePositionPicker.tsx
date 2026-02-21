import { useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import type { Zone } from '@/lib/types'

const LAST_SLOT_KEY_PREFIX = 'cavescan:last-slot:'

function getStorageLabel(row: number, depth: number): string {
  return `Étagère ${row} · Profondeur ${depth}`
}

function getDepthButtonLabel(depth: number): string {
  if (depth === 1) return 'Avant'
  if (depth === 2) return 'Fond'
  return `Fond ${depth - 1}`
}

function parseStorageLabel(value: string): { row: number; depth: number } | null {
  const match = value.match(/Étagère\s+(\d+)\s+·\s+Profondeur\s+(\d+)/i)
  if (!match) return null
  const row = Number.parseInt(match[1], 10)
  const depth = Number.parseInt(match[2], 10)
  if (!Number.isFinite(row) || !Number.isFinite(depth) || row < 1 || depth < 1) return null
  return { row, depth }
}

interface StoragePositionPickerProps {
  zoneId: string
  zone?: Zone
  value: string
  onChange: (value: string) => void
}

export function StoragePositionPicker({ zoneId, zone, value, onChange }: StoragePositionPickerProps) {
  const maxRows = Math.max(1, zone?.rows ?? 4)
  const maxDepth = Math.max(1, Math.min(4, zone?.columns ?? 2))

  const currentPosition = useMemo(() => parseStorageLabel(value), [value])

  useEffect(() => {
    if (!zoneId) return

    if (!currentPosition) {
      const savedValue = window.localStorage.getItem(`${LAST_SLOT_KEY_PREFIX}${zoneId}`)
      const savedPosition = savedValue ? parseStorageLabel(savedValue) : null
      if (savedValue && savedPosition && savedPosition.row <= maxRows && savedPosition.depth <= maxDepth) {
        onChange(savedValue)
        return
      }

      onChange(getStorageLabel(1, 1))
      return
    }

    window.localStorage.setItem(`${LAST_SLOT_KEY_PREFIX}${zoneId}`, value)
  }, [zoneId, value, currentPosition, maxRows, maxDepth, onChange])

  if (!zoneId) {
    return <p className="text-xs text-muted-foreground">Choisissez d'abord une zone pour pré-remplir l'emplacement.</p>
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>Étagère</Label>
        <div className="mt-1 grid grid-cols-5 gap-2">
          {Array.from({ length: maxRows }, (_, i) => i + 1).map((row) => {
            const isActive = currentPosition?.row === row
            return (
              <button
                key={row}
                type="button"
                onClick={() => onChange(getStorageLabel(row, currentPosition?.depth ?? 1))}
                className={`rounded-md border px-2 py-1 text-sm transition-colors ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}
              >
                E{row}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label>Profondeur</Label>
        <div className="mt-1 flex gap-2">
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map((depth) => {
            const isActive = currentPosition?.depth === depth
            return (
              <button
                key={depth}
                type="button"
                onClick={() => onChange(getStorageLabel(currentPosition?.row ?? 1, depth))}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}
              >
                {getDepthButtonLabel(depth)}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{currentPosition ? getStorageLabel(currentPosition.row, currentPosition.depth) : 'Emplacement auto'}</p>
    </div>
  )
}
