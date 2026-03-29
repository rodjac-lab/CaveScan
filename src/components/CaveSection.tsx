import { useEffect, useRef, useState } from 'react'
import { Calendar, Euro, Grid2x2, Loader2, Minus, Plus, Tag, Wine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { openBottle } from '@/lib/bottleActions'
import { showToast } from '@/lib/toast'
import { type BottleWithZone, volumeLabel } from '@/lib/types'
import { triggerProfileRecompute } from '@/lib/taste-profile'

interface CaveSectionProps {
  bottle: BottleWithZone
  onRefetch: () => Promise<void>
  groupBottleIds?: string[]
}

export function CaveSection({ bottle, onRefetch, groupBottleIds }: CaveSectionProps) {
  const [groupInStock, setGroupInStock] = useState<BottleWithZone[]>([])
  const [updatingQuantity, setUpdatingQuantity] = useState(false)
  const [removing, setRemoving] = useState(false)
  const addedAtInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let isCancelled = false

    async function fetchGroupInStock() {
      if (!groupBottleIds || groupBottleIds.length === 0) {
        setGroupInStock([bottle])
        return
      }

      const { data } = await supabase
        .from('bottles')
        .select('*, zone:zones(*)')
        .eq('status', 'in_stock')
        .in('id', groupBottleIds)

      if (isCancelled) return

      setGroupInStock((data as BottleWithZone[] | null) ?? [bottle])
    }

    void fetchGroupInStock()

    return () => {
      isCancelled = true
    }
  }, [bottle, groupBottleIds])

  const totalQuantity = (groupInStock.length > 0 ? groupInStock : [bottle]).reduce(
    (sum, item) => sum + (item.quantity ?? 1),
    0,
  )

  const handleUpdateQuantity = async (delta: 1 | -1) => {
    setUpdatingQuantity(true)

    try {
      if (delta === 1) {
        const { error } = await supabase
          .from('bottles')
          .update({ quantity: (bottle.quantity ?? 1) + 1 })
          .eq('id', bottle.id)
        if (error) throw error
      } else {
        if (totalQuantity <= 1) {
          setUpdatingQuantity(false)
          return
        }

        const rows = groupInStock.length > 0 ? groupInStock : [bottle]
        let target = rows.find((row) => row.id === bottle.id && (row.quantity ?? 1) > 1)
        if (!target) target = rows.find((row) => row.id !== bottle.id && (row.quantity ?? 1) > 1)
        if (!target) target = rows.find((row) => row.id !== bottle.id)
        if (!target) {
          setUpdatingQuantity(false)
          return
        }

        if ((target.quantity ?? 1) > 1) {
          const { error } = await supabase
            .from('bottles')
            .update({ quantity: (target.quantity ?? 1) - 1 })
            .eq('id', target.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('bottles')
            .delete()
            .eq('id', target.id)
          if (error) throw error
        }
      }

      await onRefetch()
    } catch (error) {
      console.error('Update quantity error:', error)
      showToast('Erreur lors de la mise à jour de la quantité')
    }

    setUpdatingQuantity(false)
  }

  const handleAddedAtChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (!value) return
    const newDate = new Date(value + 'T12:00:00').toISOString()
    const { error } = await supabase
      .from('bottles')
      .update({ added_at: newDate })
      .eq('id', bottle.id)
    if (!error) await onRefetch()
  }

  const handleMarkAsDrunk = async () => {
    setRemoving(true)
    try {
      await openBottle(bottle)
      triggerProfileRecompute()
      await onRefetch()
    } catch (err) {
      console.error('Mark as drunk error:', err)
      showToast('Erreur lors du marquage comme bu')
    }
    setRemoving(false)
  }

  return (
    <>
      <div className="cave-section-anim mx-4 mt-[14px]">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="flex-1 h-px bg-[var(--border-color)]" />
          <span className="section-divider-label">Gestion de cave</span>
          <div className="flex-1 h-px bg-[var(--border-color)]" />
        </div>

        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]">
          <div className="flex items-center border-b border-[var(--border-color)] px-4 py-3">
            <Tag className="mr-3 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="flex-1 text-xs text-[var(--text-muted)]">Quantité</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-color)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30"
                onClick={() => handleUpdateQuantity(-1)}
                disabled={updatingQuantity || totalQuantity <= 1}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center font-serif text-[17px] font-bold text-[var(--text-primary)]">
                {totalQuantity}
              </span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-color)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30"
                onClick={() => handleUpdateQuantity(1)}
                disabled={updatingQuantity || totalQuantity >= 99}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-[var(--text-muted)]">{volumeLabel(bottle.volume_l)}</span>
            </div>
          </div>

          <div className="flex items-center border-b border-[var(--border-color)] px-4 py-3">
            <Grid2x2 className="mr-3 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="flex-1 text-xs text-[var(--text-muted)]">Emplacement</span>
            <span className="text-right text-[13px] font-medium text-[var(--text-primary)]">
              {bottle.zone?.name
                ? `${bottle.zone.name}${bottle.shelf ? ` · ${bottle.shelf}` : ''}`
                : '—'}
            </span>
          </div>

          <div className="flex items-center border-b border-[var(--border-color)] px-4 py-3">
            <Calendar className="mr-3 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="flex-1 text-xs text-[var(--text-muted)]">Entrée en cave</span>
            <input
              ref={addedAtInputRef}
              type="date"
              className="sr-only"
              value={bottle.added_at ? new Date(bottle.added_at).toISOString().slice(0, 10) : ''}
              onChange={handleAddedAtChange}
            />
            <button
              type="button"
              onClick={() => addedAtInputRef.current?.showPicker()}
              className="text-right text-[13px] font-medium text-[var(--text-primary)]"
            >
              {bottle.added_at
                ? new Date(bottle.added_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}
            </button>
          </div>

          <div className="flex items-center px-4 py-3">
            <Euro className="mr-3 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="flex-1 text-xs text-[var(--text-muted)]">Prix d'achat</span>
            <span className="text-right text-[13px] font-medium text-[var(--text-primary)]">
              {bottle.purchase_price ? `${bottle.purchase_price.toFixed(2)} €` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="cta-section-anim mx-4 mt-4">
        <button
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--red-wine)] text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleMarkAsDrunk}
          disabled={removing}
        >
          {removing ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <Wine className="h-[18px] w-[18px]" />
          )}
          Ouvrir cette bouteille
        </button>
      </div>
    </>
  )
}
