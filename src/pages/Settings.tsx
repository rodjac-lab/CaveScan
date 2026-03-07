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
import { serializeProfileForPrompt } from '@/lib/taste-profile'
import { selectRelevantMemories, serializeMemoriesForPrompt } from '@/lib/tastingMemories'
import { formatDrunkSummary, getDayOfWeek, getSeason } from '@/lib/contextHelpers'
import {
  analyzeCelestinEvalResult,
  buildCelestinEvalRequest,
  CELESTIN_EVAL_SCENARIOS,
  renderCelestinEvalHtmlReport,
  type CelestinEvalFixture,
  type CelestinEvalResult,
} from '@/lib/celestinEval'
import type { Bottle, TasteProfile, Zone } from '@/lib/types'

// Module-level state so backfill survives page navigation
let enrichState = { status: null as string | null, running: false }

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
  }) => Promise<FileSystemFileHandle[]>
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

async function runEnrichBackfill(onUpdate: (s: { status: string | null; running: boolean }) => void) {
  if (enrichState.running) return
  enrichState = { status: 'Chargement des bouteilles...', running: true }
  onUpdate(enrichState)

  try {
    const { data: bottles } = await supabase
      .from('bottles')
      .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, raw_extraction, grape_varieties, serving_temperature, typical_aromas, food_pairings, character')
    if (!bottles || bottles.length === 0) {
      enrichState = { status: 'Toutes les bouteilles sont déjà enrichies !', running: false }
      onUpdate(enrichState)
      return
    }
    const bottlesToProcess = bottles.filter((b) => {
      const rawExtraction = b.raw_extraction as { country?: string | null; region?: string | null } | null
      const hasRawOrigin = Boolean(rawExtraction?.country || rawExtraction?.region)
      return !b.country || !b.region || !b.grape_varieties || !b.serving_temperature || !b.typical_aromas || !b.food_pairings || !b.character || hasRawOrigin
    })
    if (bottlesToProcess.length === 0) {
      enrichState = { status: 'Toutes les bouteilles ont déjà pays, région et enrichissement.', running: false }
      onUpdate(enrichState)
      return
    }
    let done = 0
    let errors = 0
    for (const b of bottlesToProcess) {
      enrichState = { status: `${done}/${bottlesToProcess.length} — ${b.domaine || b.appellation || 'vin'}...`, running: true }
      onUpdate(enrichState)
      const rawExtraction = b.raw_extraction as { country?: string | null; region?: string | null } | null
      const { data, error: fnErr } = await supabase.functions.invoke('enrich-wine', {
        body: { domaine: b.domaine, cuvee: b.cuvee, appellation: b.appellation, millesime: b.millesime, couleur: b.couleur },
      })
      if (fnErr || !data || data.error) {
        errors++; done++
        // Wait 2s before retry to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      const updates: Record<string, unknown> = {}
      if (!b.country) updates.country = rawExtraction?.country || data.country || null
      if (!b.region) updates.region = rawExtraction?.region || data.region || null
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
  const [exportingFixture, setExportingFixture] = useState(false)
  const [fixtureStatus, setFixtureStatus] = useState<string | null>(null)
  const [fixtureHandle, setFixtureHandle] = useState<FileSystemFileHandle | null>(null)
  const [resultsDirHandle, setResultsDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [runningEval, setRunningEval] = useState(false)
  const [evalStatus, setEvalStatus] = useState<string | null>(null)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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
      title: 'Celestin',
      text: '🍷 Mon carnet de cave intelligent et vivant.\n\n📸 Je scanne mes bouteilles\n🤝 Je partage mes dégustations\n✨ Celestin m\'aide à choisir, comprendre et mémoriser mes vins\n\nDécouvre Celestin :\nhttps://MyCelestin.com',
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

  const handleExportCelestinFixture = async () => {
    setExportingFixture(true)
    setFixtureStatus('Preparation de la fixture...')

    try {
      const [{ data: cave, error: caveError }, { data: drunk, error: drunkError }, { data: profileRow, error: profileError }] = await Promise.all([
        supabase
          .from('bottles')
          .select('id, domaine, cuvee, appellation, millesime, couleur, quantity, volume_l')
          .eq('status', 'in_stock')
          .order('added_at', { ascending: false }),
        supabase
          .from('bottles')
          .select('id, domaine, cuvee, appellation, millesime, couleur, tasting_note, tasting_tags, rating, drunk_at')
          .eq('status', 'drunk')
          .order('drunk_at', { ascending: false })
          .limit(30),
        supabase
          .from('user_taste_profiles')
          .select('computed_profile, explicit_preferences, computed_at')
          .maybeSingle(),
      ])

      if (caveError) throw caveError
      if (drunkError) throw drunkError
      if (profileError) throw profileError

      const profile: TasteProfile | null = profileRow?.computed_profile
        ? {
            computed: profileRow.computed_profile,
            explicit: profileRow.explicit_preferences ?? {},
            computedAt: profileRow.computed_at ?? '',
          }
        : null

      const drunkBottles = (drunk ?? []) as Bottle[]
      const memories = selectRelevantMemories('generic', null, drunkBottles)
      const fixture = {
        name: 'celestin-fixture',
        description: 'Export de fixture depuis la session authentifiee de Celestin',
        exportedAt: new Date().toISOString(),
        history: [],
        cave: (cave ?? []).map((bottle) => ({
          id: String(bottle.id).substring(0, 8),
          domaine: bottle.domaine,
          cuvee: bottle.cuvee,
          appellation: bottle.appellation,
          millesime: bottle.millesime,
          couleur: bottle.couleur,
          quantity: bottle.quantity ?? 1,
          volume: bottle.volume_l?.toString() ?? '0.75',
          local_score: 0,
        })),
        profile: profile ? serializeProfileForPrompt(profile) : null,
        memories: serializeMemoriesForPrompt(memories) || null,
        context: {
          dayOfWeek: getDayOfWeek(),
          season: getSeason(),
          recentDrunk: drunkBottles.slice(0, 5).map(formatDrunkSummary),
        },
      }

      const blob = new Blob([JSON.stringify(fixture, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `celestin-fixture-${date}.json`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setFixtureStatus(`Fixture exportee (${fixture.cave.length} bouteilles en cave)`)
    } catch (err) {
      setFixtureStatus(`Erreur export fixture: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setExportingFixture(false)
    }
  }

  const handlePickEvalFixture = async () => {
    const picker = window as PickerWindow
    if (!picker.showOpenFilePicker) {
      setEvalStatus('Choix de fichier non supporte dans ce navigateur. Utilise Chrome desktop.')
      return
    }

    try {
      const [handle] = await picker.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: true,
        types: [
          {
            description: 'Fixture Celestin',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })

      if (!handle) return
      setFixtureHandle(handle)
      setEvalStatus(`Fixture selectionnee: ${handle.name}`)
    } catch {
      // User cancelled
    }
  }

  const handlePickEvalResultsDir = async () => {
    const picker = window as PickerWindow
    if (!picker.showDirectoryPicker) {
      setEvalStatus('Choix de dossier non supporte dans ce navigateur. Utilise Chrome desktop.')
      return
    }

    try {
      const handle = await picker.showDirectoryPicker()
      setResultsDirHandle(handle)
      setEvalStatus(`Dossier des resultats: ${handle.name}`)
    } catch {
      // User cancelled
    }
  }

  const handleRunCelestinEval = async () => {
    if (!fixtureHandle) {
      setEvalStatus('Choisis d abord une fixture JSON.')
      return
    }
    if (!resultsDirHandle) {
      setEvalStatus('Choisis d abord le dossier evals/results.')
      return
    }

    setRunningEval(true)
    setEvalStatus('Lecture de la fixture...')

    try {
      if (!session?.access_token) {
        throw new Error('Session utilisateur absente pour lancer l eval.')
      }
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Configuration Supabase manquante.')
      }

      const fixtureFile = await fixtureHandle.getFile()
      const fixture = JSON.parse(await fixtureFile.text()) as CelestinEvalFixture
      const results: CelestinEvalResult[] = []

      for (const scenario of CELESTIN_EVAL_SCENARIOS) {
        setEvalStatus(`Evaluation ${scenario.id}...`)
        const body = buildCelestinEvalRequest(fixture, scenario)
        const startedAt = Date.now()
        const response = await fetch(`${supabaseUrl}/functions/v1/celestin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify(body),
        })
        const elapsedMs = Date.now() - startedAt
        const rawText = await response.text()

        let data: Record<string, unknown> | null = null
        try {
          data = rawText ? JSON.parse(rawText) as Record<string, unknown> : null
        } catch {
          data = null
        }

        if (!response.ok || !data || data.error) {
          const errorResponse = {
            type: 'error',
            text: !response.ok
              ? `HTTP ${response.status}${rawText ? `: ${rawText}` : ''}`
              : typeof data?.error === 'string'
                ? data.error
                : rawText || 'Erreur inconnue',
            cards: [],
          }
          results.push({
            id: scenario.id,
            elapsedMs: null,
            request: body,
            response: errorResponse,
            analysis: analyzeCelestinEvalResult(scenario, errorResponse),
          })
          continue
        }

        results.push({
          id: scenario.id,
          elapsedMs,
          request: body,
          response: data,
          analysis: analyzeCelestinEvalResult(scenario, data),
        })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const report = {
        fixture,
        scenarios: CELESTIN_EVAL_SCENARIOS,
        results,
      }
      const html = renderCelestinEvalHtmlReport(results, fixture, CELESTIN_EVAL_SCENARIOS)

      const jsonHandle = await resultsDirHandle.getFileHandle(`celestin-eval-${timestamp}.json`, { create: true })
      const jsonWritable = await jsonHandle.createWritable()
      await jsonWritable.write(JSON.stringify(report, null, 2))
      await jsonWritable.close()

      const htmlHandle = await resultsDirHandle.getFileHandle(`celestin-eval-${timestamp}.html`, { create: true })
      const htmlWritable = await htmlHandle.createWritable()
      await htmlWritable.write(html)
      await htmlWritable.close()

      setEvalStatus(`Rapports ecrits dans ${resultsDirHandle.name}`)
    } catch (err) {
      setEvalStatus(`Erreur eval Celestin: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setRunningEval(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Page Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <p className="brand-text">Celestin</p>
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
                Partagez Celestin avec les amateurs de vin autour de vous
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
          Celestin v1.0.0 · Reconnaissance d'étiquettes
        </p>

        {/* Backfill enriched wine fields (temporary) */}
        <section className="mb-4">
          <button
            onClick={handleExportCelestinFixture}
            disabled={exportingFixture}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            {exportingFixture ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Exporter la fixture Celestin
          </button>
          {fixtureStatus && (
            <p className="mb-2 text-center text-[11px] text-[var(--text-muted)]">{fixtureStatus}</p>
          )}

          <button
            onClick={handlePickEvalFixture}
            disabled={runningEval}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            Choisir une fixture pour l'eval
          </button>

          <button
            onClick={handlePickEvalResultsDir}
            disabled={runningEval}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            Choisir le dossier evals/results
          </button>

          <button
            onClick={handleRunCelestinEval}
            disabled={runningEval}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            {runningEval ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Lancer l'eval Celestin
          </button>
          {evalStatus && (
            <p className="mb-2 text-center text-[11px] text-[var(--text-muted)]">{evalStatus}</p>
          )}

          <button
            onClick={() => runEnrichBackfill(enrichUpdater)}
            disabled={enrichRunning}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
          >
            {enrichRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Enrichir les fiches vin (pays, région, arômes, accords, température)
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
