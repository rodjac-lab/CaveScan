import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { SessionSummary } from '@/lib/crossSessionMemory'
import type { UserProfileRow } from '@/lib/userProfiles'
import { patchUserProfile } from '@/lib/userProfiles'
import {
  loadRecentCandidateSignals,
  loadRecentProfilePatches,
  type CandidateSignalRow,
  type ProfilePatchRow,
} from '@/lib/profilePatchesDebug'
import type { RoutingProbeResult, RoutingProbeState } from '@/hooks/useDebugCelestinTools'
import type { CelestinRealTraceEntry } from '@/lib/celestinTrace'
import { supabase } from '@/lib/supabase'
import { routeFactualQueryFromClassification, type SqlRetrievalResult } from '@/lib/sqlRetrievalRouter'
import { classifyFactualIntent, type ClassifiedIntent } from '@/lib/celestinIntentClassifier'
import type { Bottle } from '@/lib/types'

// === SHARED TYPES ===

type MemoryWeightReport = {
  noteCount: number
  rawChars: number
  rawTokens: number
  avgChars: number
  maxChars: number
  currentMemoryChars: number
  currentMemoryTokens: number
}

type MemoryAuditReport = {
  activeCount: number
  temporaryCount: number
  lowConfidenceCount: number
  duplicateClusters: Array<{ canonical: string; count: number; samples: string[] }>
  longFacts: Array<{ fact: string; chars: number; category: string }>
  categoryCounts: Record<string, number>
}

type CrossSessionMemoryInfo = {
  sessions: SessionSummary[]
  totalTurns: number
  oldestDate: string | null
  newestDate: string | null
  storageSizeBytes: number
  config: {
    maxSessions: number
    ttlDays: number
  }
}

type EvalProviders = Record<string, boolean>

// === HEADER ===

export function DebugHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex-shrink-0 px-6 pt-6 pb-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        Reglages
      </button>
      <p className="brand-text">Celestin</p>
      <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Debug</h1>
    </div>
  )
}

// ============================================================================
// Observabilité — regarder ce qui se passe dans le runtime
// ============================================================================

type RealTracesPanelProps = {
  realTraceEnabled: boolean
  realTraces: CelestinRealTraceEntry[]
  onToggleRealTrace: (enabled: boolean) => void
  onRefreshRealTraces: () => void
  onClearRealTraces: () => void
  formatRelativeDate: (value: string) => string
}

export function RealTracesPanel({
  realTraceEnabled,
  realTraces,
  onToggleRealTrace,
  onRefreshRealTraces,
  onClearRealTraces,
  formatRelativeDate,
}: RealTracesPanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Traces reelles Celestin</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Capture locale automatique des 30 derniers tours Celestin. Reviens ici apres un bug pour analyser routing, retrieval, prompt et policy.
      </p>

      <label className="mb-3 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={realTraceEnabled}
          onChange={(event) => onToggleRealTrace(event.target.checked)}
        />
        Capture automatique active
      </label>

      <div className="mb-3 flex gap-2">
        <button
          onClick={onRefreshRealTraces}
          className="flex-1 rounded-[10px] border border-[var(--border-color)] bg-transparent px-3 py-2 text-[12px] font-medium text-[var(--text-muted)]"
        >
          Actualiser
        </button>
        <button
          onClick={onClearRealTraces}
          className="flex items-center justify-center gap-1 rounded-[10px] border border-[var(--border-color)] bg-transparent px-3 py-2 text-[12px] font-medium text-[var(--text-muted)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Effacer
        </button>
      </div>

      {realTraces.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">Aucune trace reelle locale.</p>
      ) : (
        <div className="space-y-2">
          {realTraces.map((trace) => (
            <details
              key={trace.id}
              className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
            >
              <summary className="cursor-pointer text-[var(--text-primary)]">
                {formatRelativeDate(trace.createdAt)} · {trace.response?.routing?.winner ?? 'route inconnue'} · {trace.userMessage.slice(0, 70)}
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#2f4f3f] px-2 py-0.5 text-white">winner: {trace.response?.routing?.winner ?? '—'}</span>
                <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">mode: {trace.response?.cognitiveMode ?? '—'}</span>
                <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">turn: {trace.response?.turnType ?? '—'}</span>
                <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">ui: {trace.response?.uiActionKind ?? '—'}</span>
                <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">mem: {trace.request.memoryEvidenceMode ?? '—'} · {trace.request.memoriesChars} car.</span>
                {trace.request.retrieval && (
                  <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">retrieval: {trace.request.retrieval.decision ?? '—'}</span>
                )}
              </div>
              <p className="mt-2">Message: {trace.userMessage}</p>
              <p>State: {trace.request.conversationPhase ?? '—'} · task={trace.request.taskType ?? '—'} · focus={trace.request.memoryFocus ?? '—'}</p>
              <p>Contexte: history={trace.request.historyTurns} · cave={trace.request.caveCount} · provider={trace.response?.provider ?? trace.request.provider ?? 'fallback'}</p>
              {trace.response?.state && (
                <p>
                  State apres: {trace.response.state.afterPhase ?? '—'} · task={trace.response.state.afterTask ?? '—'} · focus={trace.response.state.afterMemoryFocus ?? '—'}
                </p>
              )}
              {trace.response?.prompt && (
                <p>
                  Prompt: system={trace.response.prompt.systemChars ?? '—'} car. · user={trace.response.prompt.userChars ?? '—'} car. · context={trace.response.prompt.contextChars ?? '—'} car.
                  {' '}History provider={trace.response.prompt.providerHistoryTurns ?? trace.response.prompt.historyTurns ?? '—'}/{trace.response.prompt.historyTurns ?? '—'}
                </p>
              )}
              {trace.response?.policy && trace.response.policy.strippedUiAction && (
                <p className="text-[#a15c00]">
                  Policy: ui_action retiree ({trace.response.policy.rawUiActionKind} {'->'} {trace.response.policy.finalUiActionKind})
                </p>
              )}
              {trace.request.sqlRetrieval && (
                <div className="mt-2 rounded-lg border border-[var(--border-color)] px-2 py-2">
                  <p className="font-medium text-[var(--text-primary)]">SQL retrieval (factuel)</p>
                  {trace.request.sqlRetrieval.trace && (
                    <>
                      <p>Intents: {trace.request.sqlRetrieval.trace.detectedIntents.join(', ') || '—'}</p>
                      {trace.request.sqlRetrieval.trace.matchedFilters.length > 0 && (
                        <p>Filtres: {trace.request.sqlRetrieval.trace.matchedFilters.join(', ')}</p>
                      )}
                      {trace.request.sqlRetrieval.trace.blocks.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {trace.request.sqlRetrieval.trace.blocks.map((block, index) => (
                            <p key={`${trace.id}-sql-block-${index}`}>
                              [{block.intent}] {block.label} → {block.resultCount} résultat(s)
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {trace.request.sqlRetrieval.preview && (
                    <p className="mt-2 whitespace-pre-wrap">Bloc injecté: {trace.request.sqlRetrieval.preview}</p>
                  )}
                </div>
              )}
              {trace.request.retrieval && (
                <div className="mt-2 rounded-lg border border-[var(--border-color)] px-2 py-2">
                  <p className="font-medium text-[var(--text-primary)]">Retrieval</p>
                  <p>Planning query: {trace.request.retrieval.planningQuery ?? '—'}</p>
                  <p>Decision: {trace.request.retrieval.decision ?? '—'} · profile={trace.request.retrieval.selectionProfile ?? '—'}</p>
                  <p>Sources: {trace.request.retrieval.sourceBottleCount ?? '—'} bues · {trace.request.retrieval.sourceNoteCount ?? '—'} notes · candidates={trace.request.retrieval.candidateCount ?? '—'} · selection={trace.request.retrieval.selectedCount ?? '—'}</p>
                  {trace.request.retrieval.matchedFilters.length > 0 && (
                    <p>Filtres: {trace.request.retrieval.matchedFilters.join(', ')}</p>
                  )}
                  {trace.request.retrieval.selectedMemories.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {trace.request.retrieval.selectedMemories.map((memory, index) => (
                        <p key={`${trace.id}-memory-${memory.id ?? index}`}>
                          [{index + 1}] {[memory.domaine, memory.cuvee, memory.appellation, memory.millesime].filter(Boolean).join(' · ') || memory.id} · note={memory.rating ?? '—'} · verbatim={memory.has_note ? 'oui' : 'non'}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {trace.response?.routing?.reasons && trace.response.routing.reasons.length > 0 && (
                <p>Raisons: {trace.response.routing.reasons.join(', ')}</p>
              )}
              {trace.response?.routing?.candidates && trace.response.routing.candidates.length > 0 && (
                <div className="mt-2 space-y-1">
                  {trace.response.routing.candidates.slice(0, 4).map((candidate, index) => (
                    <p key={`${trace.id}-${candidate.intent}-${index}`}>
                      {candidate.intent ?? 'unknown'} · {candidate.confidence ?? 0} · {(candidate.reasons ?? []).join(', ')}
                    </p>
                  ))}
                </div>
              )}
              {trace.request.memoriesPreview && (
                <p className="mt-2 whitespace-pre-wrap">Memoire injectee: {trace.request.memoriesPreview}</p>
              )}
              {trace.response?.messagePreview && (
                <p className="mt-2 whitespace-pre-wrap">Reponse: {trace.response.messagePreview}</p>
              )}
              {trace.error && (
                <p className="mt-2 text-red-500">Erreur: {trace.error}</p>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

type RoutingProbePanelProps = {
  routingProbe: RoutingProbeState
  setRoutingProbe: Dispatch<SetStateAction<RoutingProbeState>>
  runningRoutingProbe: boolean
  routingProbeStatus: string | null
  routingProbeResult: RoutingProbeResult | null
  onRunRoutingProbe: () => void
}

export function RoutingProbePanel({
  routingProbe,
  setRoutingProbe,
  runningRoutingProbe,
  routingProbeStatus,
  routingProbeResult,
  onRunRoutingProbe,
}: RoutingProbePanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Probe routing manuel</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Outil bas niveau pour tester un message isole. Pour un vrai probleme conversationnel, utilise plutot les traces reelles ci-dessus.
      </p>

      <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Message utilisateur</label>
      <textarea
        value={routingProbe.message}
        onChange={(event) => setRoutingProbe((previous) => ({ ...previous, message: event.target.value }))}
        rows={2}
        className="mb-3 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-[12px] text-[var(--text-primary)]"
      />

      <label className="mb-1 block text-[11px] text-[var(--text-muted)]">Dernier message Celestin simulé</label>
      <textarea
        value={routingProbe.lastAssistantText}
        onChange={(event) => setRoutingProbe((previous) => ({ ...previous, lastAssistantText: event.target.value }))}
        rows={2}
        className="mb-3 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-[12px] text-[var(--text-primary)]"
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="text-[11px] text-[var(--text-muted)]">
          Phase
          <select
            value={routingProbe.phase}
            onChange={(event) => setRoutingProbe((previous) => ({ ...previous, phase: event.target.value as RoutingProbeState['phase'] }))}
            className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-[12px] text-[var(--text-primary)]"
          >
            <option value="idle_smalltalk">idle_smalltalk</option>
            <option value="post_task_ack">post_task_ack</option>
            <option value="collecting_info">collecting_info</option>
            <option value="active_task">active_task</option>
            <option value="disambiguation">disambiguation</option>
          </select>
        </label>
        <label className="text-[11px] text-[var(--text-muted)]">
          Task
          <select
            value={routingProbe.taskType}
            onChange={(event) => setRoutingProbe((previous) => ({ ...previous, taskType: event.target.value as RoutingProbeState['taskType'] }))}
            className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-[12px] text-[var(--text-primary)]"
          >
            <option value="none">none</option>
            <option value="recommendation">recommendation</option>
            <option value="encavage">encavage</option>
            <option value="tasting">tasting</option>
          </select>
        </label>
        <label className="text-[11px] text-[var(--text-muted)]">
          Provider
          <select
            value={routingProbe.provider}
            onChange={(event) => setRoutingProbe((previous) => ({ ...previous, provider: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-[12px] text-[var(--text-primary)]"
          >
            <option value="">fallback</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={routingProbe.hasImage}
            onChange={(event) => setRoutingProbe((previous) => ({ ...previous, hasImage: event.target.checked }))}
          />
          Photo jointe
        </label>
        <label className="col-span-2 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={routingProbe.includeRealMemory}
            onChange={(event) => setRoutingProbe((previous) => ({ ...previous, includeRealMemory: event.target.checked }))}
          />
          Injecter cave, degustations et memoire reelles
        </label>
      </div>

      <button
        onClick={onRunRoutingProbe}
        disabled={runningRoutingProbe}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        {runningRoutingProbe && <Loader2 className="h-4 w-4 animate-spin" />}
        Tester le routing
      </button>
      {routingProbeStatus && <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">{routingProbeStatus}</p>}

      {routingProbeResult?.routing && (
        <div className="mt-3 rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-3 text-[11px] text-[var(--text-secondary)]">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#2f4f3f] px-2 py-0.5 text-white">winner: {routingProbeResult.routing.winner ?? '—'}</span>
            <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">scope: {routingProbeResult.routing.scope ?? '—'}</span>
            <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">turn: {routingProbeResult.turnType ?? '—'}</span>
            <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">mode: {routingProbeResult.cognitiveMode ?? '—'}</span>
            <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">ui: {routingProbeResult.uiActionKind}</span>
            <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5">memories: {routingProbeResult.memoriesInjected}</span>
          </div>
          {routingProbeResult.memoryPlanningQuery && (
            <p className="mb-2">Planning query: {routingProbeResult.memoryPlanningQuery}</p>
          )}
          {routingProbeResult.memoryFocus && (
            <p className="mb-2">Memory focus: {routingProbeResult.memoryFocus}</p>
          )}
          {routingProbeResult.memoryEvidenceMode && (
            <p className="mb-2">Memory evidence: {routingProbeResult.memoryEvidenceMode}</p>
          )}
          {routingProbeResult.routing.reasons && routingProbeResult.routing.reasons.length > 0 && (
            <p className="mb-2">Raisons: {routingProbeResult.routing.reasons.join(', ')}</p>
          )}
          <p className="mb-1 font-medium text-[var(--text-primary)]">Candidates</p>
          <div className="space-y-1">
            {(routingProbeResult.routing.candidates ?? []).map((candidate, index) => (
              <div key={`${candidate.intent}-${index}`} className="rounded-lg border border-[var(--border-color)] px-2 py-1">
                <p className="font-medium text-[var(--text-primary)]">
                  {candidate.intent ?? 'unknown'} · {candidate.confidence ?? 0}
                </p>
                {candidate.reasons && candidate.reasons.length > 0 && (
                  <p>{candidate.reasons.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 font-medium text-[var(--text-primary)]">Réponse</p>
          <p className="mt-1 whitespace-pre-wrap">{routingProbeResult.message}</p>
        </div>
      )}
    </div>
  )
}

type MemoryAuditPanelProps = {
  currentUserId: string | null
  auditingMemory: boolean
  memoryAuditStatus: string | null
  memoryAuditReport: MemoryAuditReport | null
  onAuditMemoryFacts: () => void
}

export function MemoryAuditPanel({
  currentUserId,
  auditingMemory,
  memoryAuditStatus,
  memoryAuditReport,
  onAuditMemoryFacts,
}: MemoryAuditPanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Audit de ma memoire</p>
      <p className="text-[11px] text-[var(--text-muted)] mb-3">
        User ID: {currentUserId ?? 'non charge'}
      </p>
      <button
        onClick={onAuditMemoryFacts}
        disabled={auditingMemory}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        {auditingMemory && <Loader2 className="h-4 w-4 animate-spin" />}
        Auditer les user_memory_facts actives
      </button>
      {memoryAuditStatus && <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">{memoryAuditStatus}</p>}
      {memoryAuditReport && (
        <div className="mt-3 rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-3 text-[11px] text-[var(--text-secondary)]">
          <p>{memoryAuditReport.activeCount} facts actives</p>
          <p>{memoryAuditReport.temporaryCount} temporaires · {memoryAuditReport.lowConfidenceCount} confidence &lt; 0.65</p>
          <p className="mt-2 font-medium text-[var(--text-primary)]">Categories</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(memoryAuditReport.categoryCounts).map(([category, count]) => (
              <span key={category} className="rounded-full border border-[var(--border-color)] px-2 py-0.5">
                {category}: {count}
              </span>
            ))}
          </div>
          {memoryAuditReport.duplicateClusters.length > 0 && (
            <>
              <p className="mt-3 font-medium text-[var(--text-primary)]">Doublons potentiels</p>
              <div className="mt-1 space-y-1">
                {memoryAuditReport.duplicateClusters.map((cluster) => (
                  <p key={cluster.canonical}>
                    {cluster.count}× {cluster.samples.join(' | ')}
                  </p>
                ))}
              </div>
            </>
          )}
          {memoryAuditReport.longFacts.length > 0 && (
            <>
              <p className="mt-3 font-medium text-[var(--text-primary)]">Facts trop longues</p>
              <div className="mt-1 space-y-1">
                {memoryAuditReport.longFacts.map((fact) => (
                  <p key={`${fact.category}-${fact.fact.slice(0, 16)}`}>
                    [{fact.category}] {fact.chars} car. — {fact.fact}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

type SqlPanelStatus = 'idle' | 'running' | 'done'

export function SqlRetrievalPanel() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [drunkBottles, setDrunkBottles] = useState<Bottle[]>([])
  const [caveBottles, setCaveBottles] = useState<Bottle[]>([])
  const [result, setResult] = useState<SqlRetrievalResult | null>(null)
  const [classified, setClassified] = useState<ClassifiedIntent | null>(null)
  const [status, setStatus] = useState<SqlPanelStatus>('idle')

  useEffect(() => {
    async function loadData() {
      try {
        const [drunkRes, caveRes] = await Promise.all([
          supabase.from('bottles').select('*').eq('status', 'drunk').order('drunk_at', { ascending: false }).limit(300),
          supabase.from('bottles').select('*').eq('status', 'in_stock').order('added_at', { ascending: false }).limit(500),
        ])
        setDrunkBottles((drunkRes.data as Bottle[]) ?? [])
        setCaveBottles((caveRes.data as Bottle[]) ?? [])
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [])

  const drunkMonthBreakdown = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const bottle of drunkBottles) {
      if (!bottle.drunk_at) continue
      const d = new Date(bottle.drunk_at)
      if (Number.isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return Array.from(buckets.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)
  }, [drunkBottles])

  async function handleRun() {
    const trimmed = query.trim()
    if (!trimmed) {
      setResult(null)
      setClassified(null)
      setStatus('done')
      return
    }
    setStatus('running')
    try {
      const classification = await classifyFactualIntent({
        query: trimmed,
        cave: caveBottles,
        drunk: drunkBottles,
      })
      setClassified(classification)
      setResult(routeFactualQueryFromClassification(classification, drunkBottles, caveBottles))
    } finally {
      setStatus('done')
    }
  }

  return (
    <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--card-background)] p-5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">SQL Retrieval Router (factuel)</h3>
      <p className="mb-4 text-[12px] text-[var(--text-muted)]">
        Testeur manuel : classifier LLM (edge function <span className="font-mono">classify-celestin-intent</span>) → builders déterministes (temporel, géographique, quantitatif, classement, inventaire) → bloc texte injecté dans le prompt Celestin.
      </p>

      <div className="mb-3 text-[11px] text-[var(--text-muted)]">
        {loading ? (
          'Chargement des bouteilles…'
        ) : (
          <>
            Source : {drunkBottles.length} bouteille(s) bue(s) · {caveBottles.length} fiche(s) en cave.
          </>
        )}
      </div>

      {!loading && drunkMonthBreakdown.length > 0 && (
        <details className="mb-3 text-[11px] text-[var(--text-muted)]">
          <summary className="cursor-pointer">Distribution des dégustations par mois (12 derniers mois présents)</summary>
          <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {drunkMonthBreakdown.map(([month, count]) => (
              <li key={month} className="rounded border border-[var(--border-color)] px-2 py-1">
                <span className="font-mono">{month}</span> : {count}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRun() }}
          placeholder="ex : les vins bus en mars / mes meilleurs Brunello / combien de Barolo en cave"
          className="flex-1 rounded-[8px] border border-[var(--border-color)] bg-transparent px-3 py-2 text-[12px] text-[var(--text-primary)]"
          disabled={loading}
        />
        <button
          onClick={() => { void handleRun() }}
          disabled={loading || status === 'running'}
          className="rounded-[10px] border border-[var(--border-color)] bg-transparent px-4 py-2 text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50"
        >
          {status === 'running' ? 'Classification…' : 'Tester'}
        </button>
      </div>

      {status === 'done' && classified && (
        <div className="mb-3 rounded-[8px] border border-[var(--border-color)] p-2 text-[11px] text-[var(--text-muted)]">
          <p className="mb-1 font-medium text-[var(--text-primary)]">Classifier output</p>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
{JSON.stringify(classified, null, 2)}
          </pre>
        </div>
      )}

      {status === 'done' && !result && (
        <p className="text-[11px] italic text-[var(--text-muted)]">
          {!classified || classified.isFactual === false
            ? 'Query classée non-factuelle. Celestin répond sans bloc SQL.'
            : 'Classification reçue mais aucun bloc SQL produit (intent inattendu ou filtres incomplets).'}
        </p>
      )}

      {result && (
        <div className="space-y-3 text-[11px] text-[var(--text-muted)]">
          <div className="rounded-[8px] border border-[var(--border-color)] p-2">
            <p className="font-medium text-[var(--text-primary)]">Trace</p>
            <p>Intents détectés : {result.trace.detectedIntents.join(', ')}</p>
            {result.trace.matchedFilters.length > 0 && <p>Filtres : {result.trace.matchedFilters.join(', ')}</p>}
          </div>

          <div>
            <p className="mb-1 font-medium text-[var(--text-primary)]">Blocs produits ({result.blocks.length})</p>
            <ul className="space-y-1">
              {result.blocks.map((block, idx) => (
                <li key={`${block.intent}-${idx}`} className="rounded border border-[var(--border-color)] px-2 py-1">
                  [{block.intent}] {block.label} → <strong>{block.resultCount}</strong> résultat(s)
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 font-medium text-[var(--text-primary)]">Bloc exact injecté dans le prompt LLM</p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border-color)] bg-[var(--bg-card)] p-2 font-mono text-[10px]">
{result.serialized}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export function ProfilePatchesPanel() {
  const [signals, setSignals] = useState<CandidateSignalRow[]>([])
  const [patches, setPatches] = useState<ProfilePatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([loadRecentCandidateSignals(20), loadRecentProfilePatches(20)])
      setSignals(s)
      setPatches(p)
    } catch (err) {
      console.warn('[ProfilePatchesPanel] refresh failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleRunCheck() {
    setRunning(true)
    setStatus(null)
    try {
      const result = await patchUserProfile('manual_debug_check')
      if (!result.success) {
        setStatus(`Erreur : ${result.error ?? 'unknown'}`)
      } else if (result.action === 'no_change') {
        setStatus(`Aucun patch (${result.signals_consumed ?? 0} signaux vérifiés)`)
      } else {
        setStatus(`Patch ${result.action} ${result.section ? `sur ${result.section}` : ''} (v${result.version})`)
      }
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--card-background)] p-5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Profil — signaux & patchs</h3>
      <p className="mb-4 text-[12px] text-[var(--text-muted)]">
        Signaux candidats levés récemment et historique des patchs appliqués au profil compilé.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={handleRunCheck}
          disabled={running}
          className="flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-2 text-[12px] font-medium text-[var(--text-muted)]"
        >
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          Lancer un check léger maintenant
        </button>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-[10px] border border-[var(--border-color)] bg-transparent px-3 py-2 text-[11px] text-[var(--text-muted)]"
        >
          {loading ? 'Chargement…' : 'Rafraîchir'}
        </button>
      </div>
      {status && <p className="mb-3 text-[11px] text-[var(--text-muted)]">{status}</p>}

      <h4 className="mb-2 text-[12px] font-semibold text-[var(--text-primary)]">Derniers signaux ({signals.length})</h4>
      <ul className="mb-5 space-y-2 text-[11px] text-[var(--text-muted)]">
        {signals.length === 0 && <li className="italic">Aucun signal.</li>}
        {signals.map((signal) => (
          <li key={signal.id} className="rounded-[8px] border border-[var(--border-color)] p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] text-[var(--text-primary)]">{signal.signal_type}</span>
              <span className="text-[10px]">{new Date(signal.created_at).toLocaleString('fr-FR')}</span>
            </div>
            <div className="mt-1 text-[10px]">
              {signal.consumed_at ? `Consommé ${new Date(signal.consumed_at).toLocaleString('fr-FR')}` : 'En attente'}
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] opacity-70">
              {JSON.stringify(signal.payload, null, 2)}
            </pre>
          </li>
        ))}
      </ul>

      <h4 className="mb-2 text-[12px] font-semibold text-[var(--text-primary)]">Derniers patchs ({patches.length})</h4>
      <ul className="space-y-2 text-[11px] text-[var(--text-muted)]">
        {patches.length === 0 && <li className="italic">Aucun patch.</li>}
        {patches.map((patch) => (
          <li key={patch.id} className="rounded-[8px] border border-[var(--border-color)] p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] text-[var(--text-primary)]">
                {patch.action}
                {patch.section ? ` · ${patch.section}` : ''}
              </span>
              <span className="text-[10px]">
                v{patch.profile_version_before} → v{patch.profile_version_after} · {new Date(patch.applied_at).toLocaleString('fr-FR')}
              </span>
            </div>
            {patch.content && <div className="mt-1 text-[10px]">Contenu : {patch.content}</div>}
            {patch.reason && <div className="mt-1 text-[10px] opacity-70">Raison : {patch.reason}</div>}
            {patch.llm_model && <div className="mt-1 text-[10px] opacity-70">Modèle : {patch.llm_model}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// Tests & évaluations
// ============================================================================

type ExportFixturePanelProps = {
  exportingFixture: boolean
  fixtureStatus: string | null
  onExportFixture: () => void
}

export function ExportFixturePanel({ exportingFixture, fixtureStatus, onExportFixture }: ExportFixturePanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Fixture Celestin</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Exporte la cave, les dégustations et le profil compilé en JSON pour alimenter le harness d'eval.
      </p>
      <button
        onClick={onExportFixture}
        disabled={exportingFixture}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        {exportingFixture && <Loader2 className="h-4 w-4 animate-spin" />}
        Exporter la fixture Celestin
      </button>
      {fixtureStatus && <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">{fixtureStatus}</p>}
    </div>
  )
}

type RunEvalPanelProps = {
  onPickEvalFixture: () => void
  evalProviders: EvalProviders
  setEvalProviders: Dispatch<SetStateAction<EvalProviders>>
  runningEval: boolean
  evalStatus: string | null
  onRunCelestinEval: () => void
}

export function RunEvalPanel({
  onPickEvalFixture,
  evalProviders,
  setEvalProviders,
  runningEval,
  evalStatus,
  onRunCelestinEval,
}: RunEvalPanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Lancer l'eval</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Choisis une fixture exportée, sélectionne les providers à comparer, lance l'eval. Le rapport s'ouvre en téléchargement.
      </p>

      <button
        onClick={onPickEvalFixture}
        disabled={runningEval}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        Choisir une fixture pour l'eval
      </button>

      <div className="mb-3 rounded-[10px] border border-[var(--border-color)] px-4 py-3">
        <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Providers a tester</p>
        <div className="flex gap-4 flex-wrap">
          {([
            { key: 'claude', label: 'Claude Haiku' },
            { key: 'openai', label: 'GPT-4.1 mini' },
            { key: 'gemini', label: 'Gemini Flash' },
          ] as const).map((provider) => (
            <label key={provider.key} className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={evalProviders[provider.key]}
                onChange={(event) => setEvalProviders((previous) => ({ ...previous, [provider.key]: event.target.checked }))}
                className="rounded"
              />
              {provider.label}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={onRunCelestinEval}
        disabled={runningEval}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        {runningEval && <Loader2 className="h-4 w-4 animate-spin" />}
        Lancer l'eval Celestin
      </button>
      {evalStatus && <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">{evalStatus}</p>}
    </div>
  )
}

// ============================================================================
// Maintenance & données
// ============================================================================

type MemoryWeightPanelProps = {
  analyzingMemories: boolean
  memoryWeightStatus: string | null
  memoryWeightReport: MemoryWeightReport | null
  onAnalyzeMemoryWeight: () => void
}

export function MemoryWeightPanel({
  analyzingMemories,
  memoryWeightStatus,
  memoryWeightReport,
  onAnalyzeMemoryWeight,
}: MemoryWeightPanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Poids mémoire des dégustations</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Stats agrégées sur les notes de dégustation (taille moyenne, tokens estimés, part injectée dans le prompt).
      </p>
      <button
        onClick={onAnalyzeMemoryWeight}
        disabled={analyzingMemories}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        {analyzingMemories && <Loader2 className="h-4 w-4 animate-spin" />}
        Analyser le poids
      </button>
      {memoryWeightStatus && <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">{memoryWeightStatus}</p>}
      {memoryWeightReport && (
        <div className="mt-3 rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-3 text-[11px] text-[var(--text-secondary)]">
          <p>{memoryWeightReport.noteCount} notes | moyenne {memoryWeightReport.avgChars} car. | max {memoryWeightReport.maxChars}</p>
          <p>Corpus brut : {memoryWeightReport.rawChars} car. (~{memoryWeightReport.rawTokens} tokens)</p>
          <p>Memoire envoyee : {memoryWeightReport.currentMemoryChars} car. (~{memoryWeightReport.currentMemoryTokens} tokens)</p>
        </div>
      )}
    </div>
  )
}

type ForceCompileProfilePanelProps = {
  userProfile: UserProfileRow | null
  userProfileStatus: string | null
  compilingUserProfile: boolean
  onForceCompileUserProfile: () => void
  formatRelativeDate: (value: string) => string
}

export function ForceCompileProfilePanel({
  userProfile,
  userProfileStatus,
  compilingUserProfile,
  onForceCompileUserProfile,
  formatRelativeDate,
}: ForceCompileProfilePanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Profil compilé</p>
      <div className="text-[11px] text-[var(--text-muted)] space-y-1">
        <p>Version: {userProfile?.version ?? 'absente'}</p>
        <p>Status: {userProfile?.compilation_status ?? 'absent'}</p>
        <p>Raison: {userProfile?.last_compilation_reason ?? '—'}</p>
        <p>Dernière compilation: {userProfile?.updated_at ? formatRelativeDate(userProfile.updated_at) : 'jamais'}</p>
      </div>
      <button
        onClick={onForceCompileUserProfile}
        disabled={compilingUserProfile}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
      >
        {compilingUserProfile && <Loader2 className="h-4 w-4 animate-spin" />}
        Compiler le profil maintenant
      </button>
      {userProfileStatus && <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">{userProfileStatus}</p>}
    </div>
  )
}

type EnrichmentBackfillsPanelProps = {
  enrichRunning: boolean
  enrichStatus: string | null
  onRunEnrichBackfill: () => void
  backfillRunning: boolean
  backfillStatus: string | null
  onRunTastingTagsBackfill: () => void
  embeddingRunning: boolean
  embeddingStatus: string | null
  onRunEmbeddingBackfill: () => void
}

export function EnrichmentBackfillsPanel({
  enrichRunning,
  enrichStatus,
  onRunEnrichBackfill,
  backfillRunning,
  backfillStatus,
  onRunTastingTagsBackfill,
  embeddingRunning,
  embeddingStatus,
  onRunEmbeddingBackfill,
}: EnrichmentBackfillsPanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Backfills base</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Ré-enrichir les bouteilles existantes quand le pipeline a évolué ou quand des champs manquent (cas Sanlorenzo historique).
      </p>
      <div className="space-y-2">
        <button
          onClick={onRunEnrichBackfill}
          disabled={enrichRunning}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
        >
          {enrichRunning && <Loader2 className="h-4 w-4 animate-spin" />}
          Enrichir les fiches vin (pays, region, aromes, accords)
        </button>
        {enrichStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{enrichStatus}</p>}

        <button
          onClick={onRunTastingTagsBackfill}
          disabled={backfillRunning}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
        >
          {backfillRunning && <Loader2 className="h-4 w-4 animate-spin" />}
          Re-extraire les tags de degustation
        </button>
        {backfillStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{backfillStatus}</p>}

        <button
          onClick={onRunEmbeddingBackfill}
          disabled={embeddingRunning}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-color)] bg-transparent px-4 py-3 text-[12px] font-medium text-[var(--text-muted)]"
        >
          {embeddingRunning && <Loader2 className="h-4 w-4 animate-spin" />}
          Générer les embeddings (mémoire sémantique)
        </button>
        {embeddingStatus && <p className="text-center text-[11px] text-[var(--text-muted)]">{embeddingStatus}</p>}
      </div>
    </div>
  )
}

type CrossSessionCleanupPanelProps = {
  memoryInfo: CrossSessionMemoryInfo
  onClearMemory: () => void
  formatRelativeDate: (value: string) => string
}

export function CrossSessionCleanupPanel({
  memoryInfo,
  onClearMemory,
  formatRelativeDate,
}: CrossSessionCleanupPanelProps) {
  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">Mémoire cross-session (localStorage)</p>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Config figée à {memoryInfo.config.maxSessions} sessions max / TTL {memoryInfo.config.ttlDays}j. Purge manuelle ci-dessous si besoin.
      </p>

      <div className="mb-3 space-y-1 text-[11px] text-[var(--text-secondary)]">
        <p>{memoryInfo.sessions.length} session(s) en mémoire · {memoryInfo.totalTurns} messages au total</p>
        {memoryInfo.oldestDate && <p>Plus ancienne : {formatRelativeDate(memoryInfo.oldestDate)}</p>}
        {memoryInfo.newestDate && <p>Plus récente : {formatRelativeDate(memoryInfo.newestDate)}</p>}
        <p>Taille localStorage : {memoryInfo.storageSizeBytes} octets</p>
      </div>

      <button
        onClick={onClearMemory}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-red-300 px-4 py-2 text-[12px] font-medium text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Purger toutes les sessions
      </button>
    </div>
  )
}
