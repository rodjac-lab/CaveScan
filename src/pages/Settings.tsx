import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Loader2, MapPin, LogOut, Send, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useZones } from '@/hooks/useZones'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/track'
import type { Zone } from '@/lib/types'

// Module-level state so backfill survives page navigation
let enrichPromise: Promise<void> | null = null
let enrichState = { status: null as string | null, running: false }

async function runEnrichBackfill(onUpdate: (s: { status: string | null; running: boolean }) => void) {
  if (enrichState.running) return
  enrichState = { status: 'Chargement des bouteilles...', running: true }
  onUpdate(enrichState)

  try {
    const { data: bottles } = await supabase
      .from('bottles')
      .select('id, domaine, cuvee, appellation, millesime, couleur, grape_varieties, serving_temperature, typical_aromas, food_pairings, character')
      .is('typical_aromas', null)
    if (!bottles || bottles.length === 0) {
      enrichState = { status: 'Toutes les bouteilles sont déjà enrichies !', running: false }
      onUpdate(enrichState)
      return
    }
    let done = 0
    let errors = 0
    for (const b of bottles) {
      enrichState = { status: `${done}/${bottles.length} — ${b.domaine || b.appellation || 'vin'}...`, running: true }
      onUpdate(enrichState)
      const { data, error: fnErr } = await supabase.functions.invoke('enrich-wine', {
        body: { domaine: b.domaine, cuvee: b.cuvee, appellation: b.appellation, millesime: b.millesime, couleur: b.couleur },
      })
      if (fnErr || !data || data.error) { errors++; done++; continue }
      const updates: Record<string, unknown> = {}
      if (!b.grape_varieties) updates.grape_varieties = data.grape_varieties || null
      if (!b.serving_temperature) updates.serving_temperature = data.serving_temperature || null
      if (!b.typical_aromas) updates.typical_aromas = data.typical_aromas || null
      if (!b.food_pairings) updates.food_pairings = data.food_pairings || null
      if (!b.character) updates.character = data.character || null
      if (Object.keys(updates).length > 0) {
        await supabase.from('bottles').update(updates).eq('id', b.id)
      }
      done++
    }
    enrichState = { status: `Terminé ! ${done - errors} enrichies, ${errors} erreurs`, running: false }
  } catch (err) {
    enrichState = { status: `Erreur: ${err instanceof Error ? err.message : 'inconnue'}`, running: false }
  }
  onUpdate(enrichState)
  enrichPromise = null
}

export default function Settings() {
  const navigate = useNavigate()
  const { zones, loading, error, refetch } = useZones()
  const { session, isAnonymous, signOut } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null)
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState<string | null>(enrichState.status)
  const [enrichRunning, setEnrichRunning] = useState(enrichState.running)

  // Sync module-level state back to component when remounting
  const enrichUpdater = (s: { status: string | null; running: boolean }) => {
    setEnrichStatus(s.status)
    setEnrichRunning(s.running)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    await signOut()
    navigate('/login')
  }
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [isAddingZone, setIsAddingZone] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [zoneDescription, setZoneDescription] = useState('')
  const [zoneRows, setZoneRows] = useState('4')
  const [zoneDepth, setZoneDepth] = useState('2')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showCopiedToast, setShowCopiedToast] = useState(false)

  const handleOpenAdd = () => {
    setZoneName('')
    setZoneDescription('')
    setZoneRows('4')
    setZoneDepth('2')
    setIsAddingZone(true)
  }

  const handleOpenEdit = (zone: Zone) => {
    setEditingZone(zone)
    setZoneName(zone.name)
    setZoneDescription(zone.description || '')
    setZoneRows(String(zone.rows || 4))
    setZoneDepth(String(zone.columns || 2))
  }

  const handleClose = () => {
    setIsAddingZone(false)
    setEditingZone(null)
    setZoneName('')
    setZoneDescription('')
    setZoneRows('4')
    setZoneDepth('2')
  }

  const handleSave = async () => {
    if (!zoneName.trim()) return

    setSaving(true)
    const rows = Math.max(1, Math.min(30, Number.parseInt(zoneRows, 10) || 4))
    const columns = Math.max(1, Math.min(4, Number.parseInt(zoneDepth, 10) || 2))

    if (editingZone) {
      // Update existing zone
      const { error } = await supabase
        .from('zones')
        .update({
          name: zoneName.trim(),
          description: zoneDescription.trim() || null,
          rows,
          columns,
        })
        .eq('id', editingZone.id)

      if (!error) {
        await refetch()
        handleClose()
      }
    } else {
      // Create new zone
      const { error } = await supabase.from('zones').insert({
        name: zoneName.trim(),
        description: zoneDescription.trim() || null,
        rows,
        columns,
        position: zones.length,
      })

      if (!error) {
        track('zone_created')
        await refetch()
        handleClose()
      }
    }

    setSaving(false)
  }

  const handleDelete = async (zoneId: string) => {
    if (!confirm('Supprimer cette zone ? Les bouteilles associées ne seront pas supprimées.')) {
      return
    }

    setDeleting(zoneId)

    const { error } = await supabase.from('zones').delete().eq('id', zoneId)

    if (!error) {
      await refetch()
    }

    setDeleting(null)
  }

  const handleInvite = async () => {
    const shareData = {
      title: 'CaveScan',
      text: '🍷 Je gère ma cave avec CaveScan !\n\n📸 Photo de l\'étiquette → le vin est identifié\n📦 Entrées et sorties en un geste\n⭐ Notes de dégustation à partager\n\nEssaie, c\'est gratuit 👇\nhttps://cavescan.vercel.app',
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
        track('invite_sent')
      } catch {
        // User cancelled — ignore
      }
    } else {
      // Fallback: copy to clipboard
      const fallbackText = shareData.text
      await navigator.clipboard.writeText(fallbackText)
      track('invite_sent')
      setShowCopiedToast(true)
      setTimeout(() => setShowCopiedToast(false), 2000)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Page Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Réglages</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 scrollbar-hide">

        {/* 1. Invite section */}
        <section className="mb-8">
          <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full shadow-md"
                   style={{ background: 'linear-gradient(135deg, #B8860B 0%, #D4A843 100%)' }}>
                <Send className="h-[22px] w-[22px] text-white" />
              </div>
              <p className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
                Invitez vos amis
              </p>
              <p className="text-[13px] font-light text-[var(--text-secondary)]">
                Partagez CaveScan avec les amateurs de vin autour de vous
              </p>
              <button
                onClick={handleInvite}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#B8860B] px-5 py-3 text-[14px] font-semibold text-white active:scale-95 transition-transform"
              >
                <Share className="h-[18px] w-[18px]" />
                Envoyer une invitation
              </button>
            </div>
          </div>
        </section>

        {/* 2. Zones section (unchanged logic) */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-[18px] w-[18px] text-[var(--text-secondary)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Zones de stockage</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-destructive">{error}</p>
          ) : zones.length === 0 ? (
            <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] py-8 text-center text-[13px] text-[var(--text-muted)] shadow-sm">
              Aucune zone configurée
            </div>
          ) : (
            <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
              {zones.map((zone, i) => (
                <div key={zone.id} className={`flex items-center px-4 py-3 ${i < zones.length - 1 ? 'border-b border-[var(--border-color)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{zone.name}</p>
                    {zone.description && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{zone.description}</p>
                    )}
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {zone.rows} étagères · profondeur {zone.columns}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenEdit(zone)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)]"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(zone.id)}
                      disabled={deleting === zone.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      {deleting === zone.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-600" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleOpenAdd}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-[var(--border-color)] bg-transparent px-3 py-2.5 text-[12px] font-medium text-[var(--text-muted)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une zone
          </button>
        </section>

        {/* 3. About compact */}
        <div className="flex justify-center gap-1 mb-1">
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-color)]" />
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-color)]" />
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-color)]" />
        </div>
        <p className="mb-8 text-center text-[11px] text-[var(--text-muted)]">
          CaveScan v1.0.0 · Reconnaissance d'étiquettes
        </p>

        {/* Backfill enriched wine fields (temporary) */}
        <section className="mb-4">
          <button
            onClick={() => {
              if (!enrichPromise) {
                enrichPromise = runEnrichBackfill(enrichUpdater)
              }
            }}
            disabled={enrichRunning}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            {enrichRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Enrichir les fiches vin (arômes, accords, température)
          </button>
          {enrichStatus && (
            <p className="mt-1.5 text-center text-[11px] text-[var(--text-muted)]">{enrichStatus}</p>
          )}
        </section>

        {/* Backfill tasting tags (temporary) */}
        <section className="mb-4">
          <button
            onClick={async () => {
              setBackfillRunning(true)
              setBackfillStatus('Chargement des notes...')
              try {
                const { data: bottles } = await supabase
                  .from('bottles')
                  .select('id, domaine, cuvee, appellation, millesime, couleur, tasting_note')
                  .not('tasting_note', 'is', null)
                if (!bottles || bottles.length === 0) {
                  setBackfillStatus('Aucune note à traiter')
                  setBackfillRunning(false)
                  return
                }
                let done = 0
                let errors = 0
                for (const b of bottles) {
                  setBackfillStatus(`${done}/${bottles.length} — ${b.domaine || 'vin'}...`)
                  const context = [b.domaine, b.cuvee, b.appellation, b.millesime, b.couleur].filter(Boolean).join(', ')
                  const { data: tags, error: fnErr } = await supabase.functions.invoke('extract-tasting-tags', {
                    body: { tasting_note: b.tasting_note, bottle_context: context },
                  })
                  if (fnErr || !tags) { errors++; done++; continue }
                  await supabase.from('bottles').update({ tasting_tags: tags }).eq('id', b.id)
                  done++
                }
                setBackfillStatus(`Terminé ! ${done - errors} OK, ${errors} erreurs`)
              } catch (err) {
                setBackfillStatus(`Erreur: ${err instanceof Error ? err.message : 'inconnue'}`)
              }
              setBackfillRunning(false)
            }}
            disabled={backfillRunning}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            {backfillRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Re-extraire les tags de dégustation
          </button>
          {backfillStatus && (
            <p className="mt-1.5 text-center text-[11px] text-[var(--text-muted)]">{backfillStatus}</p>
          )}
        </section>

        {/* 4. Logout at bottom */}
        <section className="mb-4">
          <p className="mb-2 text-center text-[11px] text-[var(--text-muted)]">
            {isAnonymous ? 'Utilisateur anonyme' : session?.user?.email || 'Non connecté'}
          </p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--border-color)] bg-transparent px-4 py-3 text-[13px] font-medium text-[var(--text-secondary)]"
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Se déconnecter
          </button>
        </section>

      </div>

      {/* Copied toast */}
      {showCopiedToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm text-white shadow-lg">
          Lien copié !
        </div>
      )}

      {/* Add/Edit Zone Dialog */}
      <Dialog open={isAddingZone || !!editingZone} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingZone ? 'Modifier la zone' : 'Nouvelle zone'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="zone-name">Nom</Label>
              <Input
                id="zone-name"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="ex: Cave principale"
              />
            </div>
            <div>
              <Label htmlFor="zone-desc">Description (optionnel)</Label>
              <Input
                id="zone-desc"
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                placeholder="ex: Rouges de garde"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="zone-rows">Nombre d'étagères</Label>
                <Input
                  id="zone-rows"
                  inputMode="numeric"
                  value={zoneRows}
                  onChange={(e) => setZoneRows(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="ex: 6"
                />
              </div>
              <div>
                <Label htmlFor="zone-depth">Profondeur (Nombre)</Label>
                <Input
                  id="zone-depth"
                  inputMode="numeric"
                  value={zoneDepth}
                  onChange={(e) => setZoneDepth(e.target.value.replace(/\D/g, '').slice(0, 1))}
                  placeholder="ex: 2"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={!zoneName.trim() || saving}
              className="bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingZone ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
