import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Euro, Loader2, Plus, Minus, Wine, Tag, Grid2x2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { type BottleWithZone } from '@/lib/types'
import { triggerProfileRecompute } from '@/lib/taste-profile'
import { openBottle } from '@/lib/bottleActions'

const COLOR_CSS_VARS: Record<string, string> = {
  rouge: 'red-wine',
  blanc: 'white-wine',
  rose: 'rose-wine',
  bulles: 'champagne',
}

interface CaveSectionProps {
  bottle: BottleWithZone
  onRefetch: () => Promise<void>
}

export function CaveSection({ bottle, onRefetch }: CaveSectionProps) {
  const navigate = useNavigate()
  const [pastTastings, setPastTastings] = useState<BottleWithZone[]>([])
  const [updatingQuantity, setUpdatingQuantity] = useState(false)
  const [removing, setRemoving] = useState(false)

  // Fetch past tastings for in_stock bottles
  useEffect(() => {
    async function fetchPastTastings() {
      const tastingsQuery = supabase
        .from('bottles')
        .select('*, zone:zones(*)')
        .eq('status', 'drunk')

      if (bottle.domaine) tastingsQuery.eq('domaine', bottle.domaine)
      else tastingsQuery.is('domaine', null)
      if (bottle.appellation) tastingsQuery.eq('appellation', bottle.appellation)
      else tastingsQuery.is('appellation', null)
      if (bottle.millesime) tastingsQuery.eq('millesime', bottle.millesime)
      else tastingsQuery.is('millesime', null)

      const { data: tastings } = await tastingsQuery
        .order('drunk_at', { ascending: false })
        .limit(20)

      setPastTastings(tastings ?? [])
    }

    fetchPastTastings()
  }, [bottle.id, bottle.status])

  const handleUpdateQuantity = async (newQuantity: number) => {
    if (newQuantity < 1 || newQuantity > 99) return
    setUpdatingQuantity(true)
    const { error } = await supabase
      .from('bottles')
      .update({ quantity: newQuantity })
      .eq('id', bottle.id)
    if (!error) {
      await onRefetch()
    } else {
      console.error('Update quantity error:', error)
    }
    setUpdatingQuantity(false)
  }

  const handleMarkAsDrunk = async () => {
    setRemoving(true)
    try {
      await openBottle(bottle)
      triggerProfileRecompute()
      await onRefetch()
    } catch (err) {
      console.error('Mark as drunk error:', err)
    }
    setRemoving(false)
  }

  return (
    <>
      {/* --- Section "Ma cave" --- */}
      <div className="cave-section-anim mx-4 mt-[14px]">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="flex-1 h-px bg-[var(--border-color)]" />
          <span className="section-divider-label">Ma cave</span>
          <div className="flex-1 h-px bg-[var(--border-color)]" />
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] overflow-hidden">
          {/* Quantité */}
          <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
            <Tag className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
            <span className="text-xs text-[var(--text-muted)] flex-1">Quantité</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-30"
                onClick={() => handleUpdateQuantity((bottle.quantity ?? 1) - 1)}
                disabled={updatingQuantity || (bottle.quantity ?? 1) <= 1}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="font-serif text-[17px] font-bold text-[var(--text-primary)] w-6 text-center">
                {bottle.quantity ?? 1}
              </span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-30"
                onClick={() => handleUpdateQuantity((bottle.quantity ?? 1) + 1)}
                disabled={updatingQuantity || (bottle.quantity ?? 1) >= 99}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-[var(--text-muted)]">btl</span>
            </div>
          </div>
          {/* Emplacement */}
          <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
            <Grid2x2 className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
            <span className="text-xs text-[var(--text-muted)] flex-1">Emplacement</span>
            <span className="text-[13px] font-medium text-[var(--text-primary)] text-right">
              {bottle.zone?.name
                ? `${bottle.zone.name}${bottle.shelf ? ` · ${bottle.shelf}` : ''}`
                : '—'}
            </span>
          </div>
          {/* Entrée en cave */}
          <div className="flex items-center px-4 py-3 border-b border-[var(--border-color)]">
            <Calendar className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
            <span className="text-xs text-[var(--text-muted)] flex-1">Entrée en cave</span>
            <span className="text-[13px] font-medium text-[var(--text-primary)] text-right">
              {bottle.added_at
                ? new Date(bottle.added_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}
            </span>
          </div>
          {/* Prix d'achat */}
          <div className="flex items-center px-4 py-3">
            <Euro className="h-4 w-4 text-[var(--text-muted)] shrink-0 mr-3" />
            <span className="text-xs text-[var(--text-muted)] flex-1">Prix d'achat</span>
            <span className="text-[13px] font-medium text-[var(--text-primary)] text-right">
              {bottle.purchase_price ? `${bottle.purchase_price.toFixed(2)} €` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* --- Section "Dégustations passées" --- */}
      <div className="history-section-anim mx-4 mt-[14px]">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="flex-1 h-px bg-[var(--border-color)]" />
          <span className="section-divider-label">Dégustations passées</span>
          <div className="flex-1 h-px bg-[var(--border-color)]" />
        </div>

        {pastTastings.length === 0 ? (
          <p className="text-center text-[13px] text-[var(--text-muted)] italic py-5">
            Aucune dégustation enregistrée pour ce vin.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pastTastings.map((item) => {
              const drunkDate = item.drunk_at ? new Date(item.drunk_at) : null
              return (
                <button
                  key={item.id}
                  className="flex gap-3 bg-[var(--bg-card)] p-3 px-3.5 rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] text-left transition-shadow hover:shadow-[var(--shadow-md)]"
                  onClick={() => navigate(`/bottle/${item.id}`)}
                >
                  {/* Date block */}
                  <div className="shrink-0 w-9 text-center">
                    <div className="font-serif text-[17px] font-bold leading-none text-[var(--text-primary)]">
                      {drunkDate ? drunkDate.getDate().toString().padStart(2, '0') : '—'}
                    </div>
                    <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)] font-medium mt-0.5">
                      {drunkDate ? drunkDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : ''}
                    </div>
                  </div>
                  {/* Color bar */}
                  {item.couleur && (
                    <div
                      className="w-[3px] h-8 rounded-full shrink-0 self-center"
                      style={{ backgroundColor: `var(--${COLOR_CSS_VARS[item.couleur] ?? 'champagne'})` }}
                    />
                  )}
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {item.tasting_note ? (
                      <p className="text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-2">
                        {item.tasting_note}
                      </p>
                    ) : (
                      <p className="text-[13px] text-[var(--text-muted)] italic">
                        Pas de note
                      </p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      Enregistrée
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* --- CTA "Ouvrir cette bouteille" --- */}
      <div className="cta-section-anim mx-4 mt-4">
        <button
          className="w-full h-12 flex items-center justify-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--red-wine)] text-white text-[15px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
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
