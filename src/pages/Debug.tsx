import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
import {
  setCrossSessionConfig,
  getMemoryDebugInfo,
  clearAllSessions,
  type SessionSummary,
} from '@/lib/crossSessionMemory'
import { buildCompositeText } from '@/lib/semanticMemory'
import type { Bottle, TasteProfile } from '@/lib/types'

// --- Memory weight types & helpers (moved from Settings) ---

type MemoryWeightReport = {
  noteCount: number
  rawChars: number
  rawTokens: number
  avgChars: number
  maxChars: number
  currentMemoryChars: number
  currentMemoryTokens: number
}

function estimateTokens(textOrChars: string | number): number {
  const chars = typeof textOrChars === 'number' ? textOrChars : textOrChars.length
  return Math.ceil(chars / 4)
}

// --- Enrich backfill (module-level state) ---

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
      .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, raw_extraction, grape_varieties, serving_temperature, typical_aromas, food_pairings, character, drink_from, drink_until')
    if (!bottles || bottles.length === 0) {
      enrichState = { status: 'Toutes les bouteilles sont deja enrichies !', running: false }
      onUpdate(enrichState)
      return
    }
    const bottlesToProcess = bottles.filter((b) => {
      const rawExtraction = b.raw_extraction as { country?: string | null; region?: string | null } | null
      const hasRawOrigin = Boolean(rawExtraction?.country || rawExtraction?.region)
      return !b.country || !b.region || !b.grape_varieties || !b.serving_temperature || !b.typical_aromas || !b.food_pairings || !b.character || hasRawOrigin
    })
    if (bottlesToProcess.length === 0) {
      enrichState = { status: 'Toutes les bouteilles ont deja pays, region et enrichissement.', running: false }
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
      if (!b.drink_from && data.drink_from) updates.drink_from = data.drink_from
      if (!b.drink_until && data.drink_until) updates.drink_until = data.drink_until
      if (Object.keys(updates).length > 0) {
        await supabase.from('bottles').update(updates).eq('id', b.id)
      }
      done++
    }
    enrichState = { status: `Termine ! ${done - errors} enrichies, ${errors} erreurs`, running: false }
  } catch (err) {
    enrichState = { status: `Erreur: ${err instanceof Error ? err.message : 'inconnue'}`, running: false }
  }
  onUpdate(enrichState)
}

// --- Embedding backfill (module-level state) ---

let embeddingState = { status: null as string | null, running: false }

async function runEmbeddingBackfill(onUpdate: (s: { status: string | null; running: boolean }) => void) {
  if (embeddingState.running) return
  embeddingState = { status: 'Chargement des bouteilles dégustées...', running: true }
  onUpdate(embeddingState)

  try {
    const { data: bottles } = await supabase
      .from('bottles')
      .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, tasting_note, tasting_tags, character, rating, drunk_at, rebuy, qpr, grape_varieties, food_pairings, serving_temperature, typical_aromas, status, added_at, updated_at, purchase_price, market_value, drink_from, drink_until, notes, tasting_photos, zone_id, shelf, photo_url, photo_url_back, raw_extraction, quantity, volume_l')
      .eq('status', 'drunk')
      .not('tasting_note', 'is', null)
      .is('embedding', null)

    if (!bottles || bottles.length === 0) {
      embeddingState = { status: 'Tous les embeddings sont déjà générés !', running: false }
      onUpdate(embeddingState)
      return
    }

    let done = 0
    let errors = 0
    for (const b of bottles) {
      const bottle = b as Bottle
      const text = buildCompositeText(bottle)
      if (!text || text.trim().length < 10) { done++; continue }

      embeddingState = { status: `${done}/${bottles.length} — ${b.domaine || b.appellation || 'vin'}...`, running: true }
      onUpdate(embeddingState)

      const { error: fnErr } = await supabase.functions.invoke('generate-embedding', {
        body: { text, bottle_id: b.id },
      })

      if (fnErr) {
        console.warn('[embedding-backfill] Error for', b.id, fnErr)
        errors++
        await new Promise(r => setTimeout(r, 2000))
      } else {
        await new Promise(r => setTimeout(r, 500))
      }
      done++
    }

    embeddingState = { status: `Terminé ! ${done - errors} embeddings, ${errors} erreurs`, running: false }
  } catch (err) {
    embeddingState = { status: `Erreur: ${err instanceof Error ? err.message : 'inconnue'}`, running: false }
  }
  onUpdate(embeddingState)
}

// --- Helper: format relative time ---

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'il y a moins d\'1h'
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  return `il y a ${days} jours`
}

// --- Component ---

export default function Debug() {
  const navigate = useNavigate()

  // Cross-session memory state
  const [memoryInfo, setMemoryInfo] = useState(() => getMemoryDebugInfo())
  const [maxSessions, setMaxSessions] = useState(String(memoryInfo.config.maxSessions))
  const [ttlDays, setTtlDays] = useState(String(memoryInfo.config.ttlDays))
  const [expandedSession, setExpandedSession] = useState<number | null>(null)

  // Enrich backfill
  const [enrichStatus, setEnrichStatus] = useState<string | null>(enrichState.status)
  const [enrichRunning, setEnrichRunning] = useState(enrichState.running)
  const enrichUpdater = (s: { status: string | null; running: boolean }) => {
    setEnrichStatus(s.status)
    setEnrichRunning(s.running)
  }

  // Tasting tags backfill
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null)
  const [backfillRunning, setBackfillRunning] = useState(false)

  // Embedding backfill
  const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(embeddingState.status)
  const [embeddingRunning, setEmbeddingRunning] = useState(embeddingState.running)
  const embeddingUpdater = (s: { status: string | null; running: boolean }) => {
    setEmbeddingStatus(s.status)
    setEmbeddingRunning(s.running)
  }

  // Fixture / eval
  const [exportingFixture, setExportingFixture] = useState(false)
  const [fixtureStatus, setFixtureStatus] = useState<string | null>(null)
  const [fixtureHandle, setFixtureHandle] = useState<FileSystemFileHandle | null>(null)
  const [runningEval, setRunningEval] = useState(false)
  const [evalStatus, setEvalStatus] = useState<string | null>(null)
  const [evalProviders, setEvalProviders] = useState<Record<string, boolean>>({
    claude: true,
    openai: true,
    gemini: false,
    mistral: false,
  })

  // Memory weight analysis
  const [analyzingMemories, setAnalyzingMemories] = useState(false)
  const [memoryWeightStatus, setMemoryWeightStatus] = useState<string | null>(null)
  const [memoryWeightReport, setMemoryWeightReport] = useState<MemoryWeightReport | null>(null)

  // --- Cross-session memory handlers ---

  function handleApplyConfig() {
    const newMax = Math.max(1, Math.min(10, parseInt(maxSessions, 10) || 4))
    const newTtl = Math.max(1, Math.min(90, parseInt(ttlDays, 10) || 7))
    setCrossSessionConfig({ maxSessions: newMax, ttlDays: newTtl })
    setMaxSessions(String(newMax))
    setTtlDays(String(newTtl))
    setMemoryInfo(getMemoryDebugInfo())
  }

  function handleClearMemory() {
    if (!confirm('Effacer toute la memoire conversationnelle de Celestin ?')) return
    clearAllSessions()
    setMemoryInfo(getMemoryDebugInfo())
  }

  // --- Fixture / eval handlers (moved from Settings) ---

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
        types: [{ description: 'Fixture Celestin', accept: { 'application/json': ['.json'] } }],
      })
      if (!handle) return
      setFixtureHandle(handle)
      setEvalStatus(`Fixture selectionnee: ${handle.name}`)
    } catch { /* User cancelled */ }
  }

  const handleRunCelestinEval = async () => {
    if (!fixtureHandle) { setEvalStatus('Choisis d abord une fixture JSON.'); return }

    const selectedProviders = Object.entries(evalProviders).filter(([, v]) => v).map(([k]) => k)
    if (selectedProviders.length === 0) { setEvalStatus('Selectionne au moins un provider.'); return }

    setRunningEval(true)
    setEvalStatus('Lecture de la fixture...')

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      let activeSession = sessionData.session
      const expiresAtMs = activeSession?.expires_at ? activeSession.expires_at * 1000 : null
      const shouldRefresh = !activeSession || (expiresAtMs != null && expiresAtMs <= Date.now() + 60_000)

      if (shouldRefresh) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) throw refreshError
        activeSession = refreshedData.session
      }

      if (!activeSession?.access_token) {
        throw new Error('Session utilisateur absente ou expirée pour lancer l eval.')
      }

      const fixtureFile = await fixtureHandle.getFile()
      const fixture = JSON.parse(await fixtureFile.text()) as CelestinEvalFixture
      const results: CelestinEvalResult[] = []
      const totalSteps = CELESTIN_EVAL_SCENARIOS.length * selectedProviders.length
      let currentStep = 0

      for (const scenario of CELESTIN_EVAL_SCENARIOS) {
        for (const provider of selectedProviders) {
          currentStep++
          setEvalStatus(`[${currentStep}/${totalSteps}] ${scenario.id} — ${provider}...`)
          const body = buildCelestinEvalRequest(fixture, scenario, provider)
          const startedAt = Date.now()
          const { data, error: fnErr, response } = await supabase.functions.invoke<Record<string, unknown>>('celestin', {
            body,
          })
          const elapsedMs = Date.now() - startedAt
          let rawText = ''
          if (response && !response.ok) {
            try {
              rawText = await response.clone().text()
            } catch {
              rawText = ''
            }
          }

          if (fnErr || !data || data.error) {
            const errorResponse = {
              message: response && !response.ok
                ? `HTTP ${response.status}${rawText ? `: ${rawText}` : ''}`
                : typeof data?.error === 'string'
                  ? data.error
                  : fnErr instanceof Error
                    ? fnErr.message
                    : rawText || 'Erreur inconnue',
              ui_action: null,
            }
            results.push({
              id: scenario.id,
              provider,
              elapsedMs: null,
              request: body,
              response: errorResponse,
              analysis: analyzeCelestinEvalResult(scenario, errorResponse, provider),
            })
            continue
          }

          results.push({
            id: scenario.id,
            provider,
            elapsedMs,
            request: body,
            response: data,
            analysis: analyzeCelestinEvalResult(scenario, data, provider),
          })
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const providerSuffix = selectedProviders.join('-vs-')
      const report = { fixture, scenarios: CELESTIN_EVAL_SCENARIOS, providers: selectedProviders, results }
      const html = renderCelestinEvalHtmlReport(results, fixture, CELESTIN_EVAL_SCENARIOS)
      const baseName = `celestin-eval-${providerSuffix}-${timestamp}`

      // Download via <a download> — no filesystem permission needed
      function downloadBlob(content: string, filename: string, type: string) {
        const blob = new Blob([content], { type })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      downloadBlob(JSON.stringify(report, null, 2), `${baseName}.json`, 'application/json')
      downloadBlob(html, `${baseName}.html`, 'text/html')

      setEvalStatus(`Rapports telecharges (${selectedProviders.join(' vs ')})`)
    } catch (err) {
      setEvalStatus(`Erreur eval Celestin: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setRunningEval(false)
    }
  }

  // Memory weight analysis
  const handleAnalyzeMemoryWeight = async () => {
    setAnalyzingMemories(true)
    setMemoryWeightStatus('Analyse des notes de degustation...')
    setMemoryWeightReport(null)

    try {
      const { data, error } = await supabase
        .from('bottles')
        .select('id, domaine, appellation, millesime, tasting_note, tasting_tags, rating, drunk_at')
        .eq('status', 'drunk')
        .not('tasting_note', 'is', null)
        .order('drunk_at', { ascending: false })

      if (error) throw error

      const bottles = ((data ?? []) as Bottle[])
        .filter((bottle) => bottle.tasting_note && bottle.tasting_note.trim().length > 0)

      if (bottles.length === 0) {
        setMemoryWeightStatus('Aucune note de degustation a analyser.')
        return
      }

      const rawChars = bottles.reduce((sum, bottle) => sum + (bottle.tasting_note?.trim().length ?? 0), 0)
      const maxChars = bottles.reduce((max, bottle) => Math.max(max, bottle.tasting_note?.trim().length ?? 0), 0)
      const avgChars = Math.round(rawChars / bottles.length)

      const selectedMemories = selectRelevantMemories('generic', null, bottles, 5)
      const currentMemoryText = serializeMemoriesForPrompt(selectedMemories)

      setMemoryWeightReport({
        noteCount: bottles.length,
        rawChars,
        rawTokens: estimateTokens(rawChars),
        avgChars,
        maxChars,
        currentMemoryChars: currentMemoryText.length,
        currentMemoryTokens: estimateTokens(currentMemoryText),
      })
      setMemoryWeightStatus(`Analyse terminee (${bottles.length} notes).`)
    } catch (err) {
      setMemoryWeightStatus(`Erreur analyse memoire: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setAnalyzingMemories(false)
    }
  }

  // --- Render helpers ---

  function renderSessionCard(session: SessionSummary, index: number) {
    const date = new Date(session.savedAt)
    const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    const relativeStr = formatRelativeDate(session.savedAt)
    const turnCount = session.turns.length
    const isExpanded = expandedSession === index

    return (
      <div key={`session-${index}`} className="border-b border-[var(--border-color)] last:border-b-0">
        <button
          onClick={() => setExpandedSession(isExpanded ? null : index)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        >
          <div>
            <p className="text-[12px] font-medium text-[var(--text-primary)]">
              {dateStr} a {timeStr}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {relativeStr} · {turnCount} messages
            </p>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">{isExpanded ? '▼' : '▶'}</span>
        </button>
        {isExpanded && (
          <div className="px-3 pb-3 space-y-1">
            {session.turns.map((turn, ti) => (
              <p key={`turn-${ti}`} className="text-[11px] text-[var(--text-secondary)]">
                <span className={`font-medium ${turn.role === 'user' ? 'text-blue-600' : 'text-amber-700'}`}>
                  {turn.role === 'user' ? 'Toi' : 'Celestin'}
                </span>
                {' : '}{turn.text}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Reglages
        </button>
        <p className="brand-text">Celestin</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Debug</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 scrollbar-hide">

        {/* ===== 1. MEMOIRE CELESTIN ===== */}
        <section className="mb-8">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">
            Memoire conversationnelle
          </h2>

          {/* Config */}
          <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm mb-3">
            <p className="text-[12px] font-medium text-[var(--text-primary)] mb-3">Configuration</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] text-[var(--text-muted)] block mb-1">Sessions max</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxSessions}
                  onChange={(e) => setMaxSessions(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] block mb-1">TTL (jours)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={ttlDays}
                  onChange={(e) => setTtlDays(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApplyConfig}
                className="flex-1 rounded-[10px] bg-[#B8860B] px-4 py-2 text-[12px] font-semibold text-white"
              >
                Appliquer
              </button>
              <button
                onClick={handleClearMemory}
                className="flex items-center gap-1 rounded-[10px] border border-red-300 px-4 py-2 text-[12px] font-medium text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Purger
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm mb-3">
            <p className="text-[12px] font-medium text-[var(--text-primary)] mb-2">Etat actuel</p>
            <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
              <p>{memoryInfo.sessions.length} session(s) en memoire (max {memoryInfo.config.maxSessions})</p>
              <p>{memoryInfo.totalTurns} messages au total</p>
              <p>TTL : {memoryInfo.config.ttlDays} jours</p>
              {memoryInfo.oldestDate && (
                <p>Plus ancienne : {formatRelativeDate(memoryInfo.oldestDate)}</p>
              )}
              {memoryInfo.newestDate && (
                <p>Plus recente : {formatRelativeDate(memoryInfo.newestDate)}</p>
              )}
              <p>Taille localStorage : {memoryInfo.storageSizeBytes} octets</p>
            </div>
          </div>

          {/* Session list */}
          {memoryInfo.sessions.length > 0 && (
            <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
              <p className="text-[12px] font-medium text-[var(--text-primary)] px-3 pt-3 pb-1">
                Sessions ({memoryInfo.sessions.length})
              </p>
              {memoryInfo.sessions.map((s, i) => renderSessionCard(s, i))}
            </div>
          )}

          {memoryInfo.sessions.length === 0 && (
            <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] py-6 text-center text-[12px] text-[var(--text-muted)] shadow-sm">
              Aucune session en memoire
            </div>
          )}
        </section>

        {/* ===== 2. OUTILS CELESTIN ===== */}
        <section className="mb-8">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">
            Outils Celestin
          </h2>

          <div className="space-y-2">
            {/* Export fixture */}
            <button
              onClick={handleExportCelestinFixture}
              disabled={exportingFixture}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              {exportingFixture && <Loader2 className="h-4 w-4 animate-spin" />}
              Exporter la fixture Celestin
            </button>
            {fixtureStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{fixtureStatus}</p>}

            {/* Memory weight */}
            <button
              onClick={handleAnalyzeMemoryWeight}
              disabled={analyzingMemories}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              {analyzingMemories && <Loader2 className="h-4 w-4 animate-spin" />}
              Analyser le poids memoire des degustations
            </button>
            {memoryWeightStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{memoryWeightStatus}</p>}
            {memoryWeightReport && (
              <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-3 text-[11px] text-[var(--text-secondary)]">
                <p>{memoryWeightReport.noteCount} notes | moyenne {memoryWeightReport.avgChars} car. | max {memoryWeightReport.maxChars}</p>
                <p>Corpus brut : {memoryWeightReport.rawChars} car. (~{memoryWeightReport.rawTokens} tokens)</p>
                <p>Memoire envoyee : {memoryWeightReport.currentMemoryChars} car. (~{memoryWeightReport.currentMemoryTokens} tokens)</p>
              </div>
            )}

            {/* Eval */}
            <button
              onClick={handlePickEvalFixture}
              disabled={runningEval}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              Choisir une fixture pour l'eval
            </button>

            {/* Provider checkboxes */}
            <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
              <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Providers a tester</p>
              <div className="flex gap-4 flex-wrap">
                {([
                  { key: 'claude', label: 'Claude Haiku' },
                  { key: 'openai', label: 'GPT-4.1 mini' },
                  { key: 'gemini', label: 'Gemini Flash' },
                  { key: 'mistral', label: 'Mistral Small' },
                ] as const).map((p) => (
                  <label key={p.key} className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={evalProviders[p.key]}
                      onChange={(e) => setEvalProviders((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                      className="rounded"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleRunCelestinEval}
              disabled={runningEval}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              {runningEval && <Loader2 className="h-4 w-4 animate-spin" />}
              Lancer l'eval Celestin
            </button>
            {evalStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{evalStatus}</p>}
          </div>
        </section>

        {/* ===== 3. ENRICHISSEMENT BASE ===== */}
        <section className="mb-8">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">
            Enrichissement base
          </h2>

          <div className="space-y-2">
            <button
              onClick={() => runEnrichBackfill(enrichUpdater)}
              disabled={enrichRunning}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              {enrichRunning && <Loader2 className="h-4 w-4 animate-spin" />}
              Enrichir les fiches vin (pays, region, aromes, accords)
            </button>
            {enrichStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{enrichStatus}</p>}

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
                    setBackfillStatus('Aucune note a traiter')
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
                  setBackfillStatus(`Termine ! ${done - errors} OK, ${errors} erreurs`)
                } catch (err) {
                  setBackfillStatus(`Erreur: ${err instanceof Error ? err.message : 'inconnue'}`)
                }
                setBackfillRunning(false)
              }}
              disabled={backfillRunning}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              {backfillRunning && <Loader2 className="h-4 w-4 animate-spin" />}
              Re-extraire les tags de degustation
            </button>
            {backfillStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{backfillStatus}</p>}

            <button
              onClick={() => runEmbeddingBackfill(embeddingUpdater)}
              disabled={embeddingRunning}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
            >
              {embeddingRunning && <Loader2 className="h-4 w-4 animate-spin" />}
              Générer les embeddings (mémoire sémantique)
            </button>
            {embeddingStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{embeddingStatus}</p>}
          </div>
        </section>

      </div>
    </div>
  )
}
