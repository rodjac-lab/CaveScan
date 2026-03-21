import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { type BottleWithZone } from '@/lib/types'

interface PastTastingsSectionProps {
  bottle: BottleWithZone
}

export function PastTastingsSection({ bottle }: PastTastingsSectionProps) {
  const navigate = useNavigate()
  const [pastTastings, setPastTastings] = useState<BottleWithZone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false

    async function fetchPastTastings() {
      setLoading(true)

      const tastingsQuery = supabase
        .from('bottles')
        .select('*, zone:zones(*)')
        .eq('status', 'drunk')
        .neq('id', bottle.id)

      if (bottle.domaine) tastingsQuery.eq('domaine', bottle.domaine)
      else tastingsQuery.is('domaine', null)
      if (bottle.appellation) tastingsQuery.eq('appellation', bottle.appellation)
      else tastingsQuery.is('appellation', null)
      if (bottle.millesime) tastingsQuery.eq('millesime', bottle.millesime)
      else tastingsQuery.is('millesime', null)

      const { data } = await tastingsQuery
        .order('drunk_at', { ascending: false })
        .limit(20)

      if (isCancelled) return

      setPastTastings((data as BottleWithZone[] | null) ?? [])
      setLoading(false)
    }

    void fetchPastTastings()

    return () => {
      isCancelled = true
    }
  }, [bottle.id, bottle.domaine, bottle.appellation, bottle.millesime])

  if (!loading && pastTastings.length === 0) return null

  return (
    <div className="mx-4 mt-[14px]">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <span className="section-divider-label">Dégustations précédentes</span>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      {loading ? (
        <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-5 text-center text-[13px] italic text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
          Chargement...
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pastTastings.map((item) => {
            const drunkDate = item.drunk_at ? new Date(item.drunk_at) : null
            const tastingMeta: string[] = []
            if (item.rating != null) tastingMeta.push(`${item.rating % 1 === 0 ? item.rating : item.rating.toFixed(1)}/5`)
            if (item.rebuy) tastingMeta.push('A racheter')

            return (
              <button
                key={item.id}
                className="rounded-[var(--radius-sm)] bg-[var(--bg-card)] px-3.5 py-3 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
                onClick={() => navigate(`/bottle/${item.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 shrink-0 text-center">
                    <div className="font-serif text-[17px] font-bold leading-none text-[var(--text-primary)]">
                      {drunkDate ? drunkDate.getDate().toString().padStart(2, '0') : '-'}
                    </div>
                    <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      {drunkDate ? drunkDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : ''}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-muted)]">
                        {drunkDate
                          ? drunkDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                          : 'Dégustation'}
                      </span>
                      {tastingMeta.length > 0 && (
                        <span className="shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">
                          {tastingMeta.join(' · ')}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-[13px] leading-snug text-[var(--text-secondary)]">
                      {item.tasting_note || 'Pas de note enregistrée.'}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
