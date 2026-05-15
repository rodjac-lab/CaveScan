import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { SessionSummary } from '@/lib/debug/crossSessionMemory'
import { clearCelestinTimings, getCelestinTimings, type CelestinTimingEntry } from '@/lib/debug/celestinTimings'
import type { UserProfileRow } from '@/lib/userProfiles'
import { patchUserProfile } from '@/lib/userProfiles'
import { downloadBlob } from '@/lib/downloadBlob'
import {
  loadRecentCandidateSignals,
  loadRecentProfilePatches,
  type CandidateSignalRow,
  type ProfilePatchRow,
} from '@/lib/profilePatchesDebug'
import type { RoutingProbeResult, RoutingProbeState } from '@/hooks/useDebugCelestinTools'
import type { CelestinRealTraceEntry } from '@/lib/celestinTrace'
import {
  formatSupabaseError,
  loadAdminCelestinObservability,
  type AdminCelestinObservabilitySnapshot,
} from '@/lib/adminCelestinObservability'

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

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('fr-FR')
}

function formatCompactUserId(value: string | null): string {
  if (!value) return 'anonyme'
  return value.slice(0, 8)
}

export function AdminCelestinObservabilityPanel() {
  const [snapshot, setSnapshot] = useState<AdminCelestinObservabilitySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await loadAdminCelestinObservability())
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const today = snapshot?.daily[0] ?? null

  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-[var(--text-primary)]">Observabilité admin Celestin</p>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-[8px] border border-[var(--border-color)] px-2 py-1 text-[10px] text-[var(--text-secondary)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Rafraîchir'}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Données persistées en base, consultables par vues SQL admin. Les coûts sont suivis en tokens/cache; les prix fournisseur restent à appliquer séparément.
      </p>

      {error && (
        <p className="mb-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </p>
      )}

      {today && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
          <div className="rounded-[8px] border border-[var(--border-color)] px-3 py-2">
            <p className="text-[var(--text-muted)]">Tours aujourd'hui</p>
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">{formatNumber(today.turns)}</p>
            <p>{formatNumber(today.failed_turns)} erreur(s)</p>
          </div>
          <div className="rounded-[8px] border border-[var(--border-color)] px-3 py-2">
            <p className="text-[var(--text-muted)]">Latence ressentie</p>
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">p95 {formatNumber(today.frontend_total_p95_ms ?? today.edge_p95_ms)}ms</p>
            <p>function p95 {formatNumber(today.edge_function_p95_ms ?? today.edge_p95_ms)}ms</p>
            <p>LLM p95 {formatNumber(today.llm_p95_ms)}ms</p>
          </div>
          <div className="rounded-[8px] border border-[var(--border-color)] px-3 py-2">
            <p className="text-[var(--text-muted)]">Tokens</p>
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">{formatNumber(today.input_tokens + today.output_tokens)}</p>
            <p>cache read {formatNumber(today.cache_read_input_tokens)}</p>
          </div>
          <div className="rounded-[8px] border border-[var(--border-color)] px-3 py-2">
            <p className="text-[var(--text-muted)]">Cold/overhead</p>
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">{formatNumber(today.cold_start_turns)} cold</p>
            <p>overhead p95 {formatNumber(today.browser_overhead_p95_ms)}ms</p>
          </div>
        </div>
      )}

      {snapshot?.costByUser.length ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-[11px] text-[var(--text-secondary)]">Top users par volume tokens</summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full text-[10px] text-[var(--text-secondary)]">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="text-left">User</th>
                  <th className="text-right">Tours</th>
                  <th className="text-right">Tokens</th>
                  <th className="text-right">Cache read</th>
                  <th className="text-right">p95</th>
                  <th className="text-right">Err.</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.costByUser.map((row) => (
                  <tr key={row.user_id ?? 'anon'} className="border-t border-[var(--border-color)]">
                    <td>{formatCompactUserId(row.user_id)}</td>
                    <td className="text-right tabular-nums">{row.turns}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.input_tokens + row.output_tokens)}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.cache_read_input_tokens)}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.edge_p95_ms)}ms</td>
                    <td className="text-right tabular-nums">{row.failed_turns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {snapshot?.capabilityHealth.length ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-[11px] text-[var(--text-secondary)]">Santé par capacité</summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full text-[10px] text-[var(--text-secondary)]">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="text-left">Version</th>
                  <th className="text-left">Capacité</th>
                  <th className="text-right">Tours</th>
                  <th className="text-right">Cartes</th>
                  <th className="text-right">Fallback</th>
                  <th className="text-right">Conf.</th>
                  <th className="text-right">fn p50</th>
                  <th className="text-right">LLM p50</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.capabilityHealth.slice(0, 16).map((row) => (
                  <tr key={`${row.day}-${row.orchestration_version}-${row.capability}`} className="border-t border-[var(--border-color)]">
                    <td>{row.orchestration_version}</td>
                    <td>{row.capability}</td>
                    <td className="text-right tabular-nums">{row.turns}</td>
                    <td className="text-right tabular-nums">{row.recommendation_card_turns}</td>
                    <td className="text-right tabular-nums">{row.fallback_turns}</td>
                    <td className="text-right tabular-nums">{row.avg_confidence == null ? '—' : row.avg_confidence.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.edge_function_p50_ms)}ms</td>
                    <td className="text-right tabular-nums">{formatNumber(row.llm_p50_ms)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {snapshot?.slowTurns.length ? (
        <details>
          <summary className="cursor-pointer text-[11px] text-[var(--text-secondary)]">Tours les plus lents</summary>
          <div className="mt-2 max-h-56 overflow-y-auto">
            <table className="w-full text-[10px] text-[var(--text-secondary)]">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="text-left">Heure</th>
                  <th className="text-right">total</th>
                  <th className="text-right">fn</th>
                  <th className="text-right">LLM</th>
                  <th className="text-right">ovh</th>
                  <th className="text-right">cold</th>
                  <th className="text-right">prep</th>
                  <th className="text-left pl-2">Cap.</th>
                  <th className="text-left pl-2">Route</th>
                  <th className="text-left pl-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.slowTurns.map((row) => (
                  <tr key={row.turn_id} className="border-t border-[var(--border-color)]">
                    <td>{new Date(row.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.frontend_total_ms)}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.edge_function_ms ?? row.edge_ms)}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.llm_ms)}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.browser_overhead_ms)}</td>
                    <td className="text-right tabular-nums">{row.edge_cold_start ? 'oui' : '—'}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.frontend_prep_ms)}</td>
                    <td className="pl-2">{row.capability ?? '—'}</td>
                    <td className="pl-2">{row.route ?? '—'}</td>
                    <td className="pl-2 text-[var(--text-muted)]">{row.message_preview ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  )
}

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
              {trace.response?.providerTrace && (
                <div className="mt-2 rounded-lg border border-[var(--border-color)] px-2 py-2">
                  <p className="font-medium text-[var(--text-primary)]">Provider runtime</p>
                  <p>
                    Path: {trace.response.providerTrace.providerPath ?? '—'} · cache Claude create={trace.response.providerTrace.claudeCache?.creationInputTokens ?? 0} · read={trace.response.providerTrace.claudeCache?.readInputTokens ?? 0}
                  </p>
                  {trace.response.providerTrace.attempts.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {trace.response.providerTrace.attempts.map((attempt, index) => (
                        <p key={`${trace.id}-provider-${index}`}>
                          {attempt.provider ?? 'provider'} · {attempt.status ?? '—'} · {attempt.durationMs ?? '—'}ms
                          {attempt.error ? ` · erreur: ${attempt.error}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  {trace.response.providerTrace.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="font-medium text-[var(--text-primary)]">Tools</p>
                      {trace.response.providerTrace.toolCalls.map((tool, index) => (
                        <p key={`${trace.id}-tool-${index}`} className="whitespace-pre-wrap">
                          {tool.name ?? 'tool'} · {tool.durationMs ?? '—'}ms · rows={tool.totalRows ?? '—'} · listed={tool.listedRows ?? '—'}
                          {tool.totalQuantity != null ? ` · qty=${tool.totalQuantity}` : ''}
                          {tool.input ? ` · input=${JSON.stringify(tool.input)}` : ''}
                          {tool.error ? ` · erreur: ${tool.error}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {trace.response?.providerErrors && trace.response.providerErrors.length > 0 && (
                <p className="mt-2 text-[#a15c00]">Provider errors: {trace.response.providerErrors.join(' | ')}</p>
              )}
              {trace.response?.policy && trace.response.policy.strippedUiAction && (
                <p className="text-[#a15c00]">
                  Policy: ui_action retiree ({trace.response.policy.rawUiActionKind} {'->'} {trace.response.policy.finalUiActionKind})
                </p>
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
  const markdown = userProfile?.compiled_markdown ?? ''
  const version = userProfile?.version ?? null
  const versionLabel = version ?? '?'

  const handleDownloadMarkdown = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadBlob(markdown, `compiled-profile-v${version ?? 'unknown'}-${stamp}.md`, 'text/markdown;charset=utf-8')
  }

  const handleCopyMarkdown = () => {
    navigator.clipboard?.writeText(markdown)
  }

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
      {markdown.trim() && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Voir le Markdown compilé
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 text-[11px] leading-relaxed text-[var(--text-primary)]">
            {markdown}
          </pre>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="rounded-[8px] border border-[var(--border-color)] bg-transparent px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Télécharger v{versionLabel}
            </button>
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="rounded-[8px] border border-[var(--border-color)] bg-transparent px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Copier
            </button>
          </div>
        </details>
      )}
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

export function CelestinTimingsPanel() {
  const [entries, setEntries] = useState<CelestinTimingEntry[]>(() => getCelestinTimings())

  const refresh = () => setEntries(getCelestinTimings())

  const stats = useMemo(() => {
    if (entries.length === 0) return null
    const totals = entries.map((e) => e.totalMs).sort((a, b) => a - b)
    const preps = entries.map((e) => e.prepMs).sort((a, b) => a - b)
    const cels = entries.map((e) => e.celestinMs).sort((a, b) => a - b)
    const median = (arr: number[]) => arr[Math.floor(arr.length / 2)]
    const p95 = (arr: number[]) => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))]
    const withBreakdown = entries.filter((e) => e.prepBreakdown)
    const memoryMs = withBreakdown.map((e) => e.prepBreakdown!.memoryMs).sort((a, b) => a - b)
    const classifierMs = withBreakdown.map((e) => e.prepBreakdown!.classifierMs).sort((a, b) => a - b)
    const profileMs = withBreakdown.map((e) => e.prepBreakdown!.compiledProfileMs).sort((a, b) => a - b)
    const withClassifierBreakdown = withBreakdown.filter((e) => e.prepBreakdown!.classifierGeminiMs !== undefined)
    const geminiMs = withClassifierBreakdown.map((e) => e.prepBreakdown!.classifierGeminiMs!).sort((a, b) => a - b)
    const overheadMs = withClassifierBreakdown.map((e) => e.prepBreakdown!.classifierMs - (e.prepBreakdown!.classifierServerMs ?? 0)).sort((a, b) => a - b)
    const serverOverheadMs = withClassifierBreakdown.map((e) => (e.prepBreakdown!.classifierServerMs ?? 0) - (e.prepBreakdown!.classifierGeminiMs ?? 0)).sort((a, b) => a - b)
    return {
      count: entries.length,
      total: { p50: median(totals), p95: p95(totals), max: totals[totals.length - 1] },
      prep: { p50: median(preps), p95: p95(preps) },
      celestin: { p50: median(cels), p95: p95(cels) },
      breakdown: withBreakdown.length > 0 ? {
        count: withBreakdown.length,
        memory: { p50: median(memoryMs), p95: p95(memoryMs) },
        classifier: { p50: median(classifierMs), p95: p95(classifierMs) },
        profile: { p50: median(profileMs), p95: p95(profileMs) },
      } : null,
      classifierBreakdown: withClassifierBreakdown.length > 0 ? {
        count: withClassifierBreakdown.length,
        gemini: { p50: median(geminiMs), p95: p95(geminiMs) },
        serverOverhead: { p50: median(serverOverheadMs), p95: p95(serverOverheadMs) },
        networkOverhead: { p50: median(overheadMs), p95: p95(overheadMs) },
      } : null,
    }
  }, [entries])

  return (
    <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-[var(--text-primary)]">Latences Celestin (20 derniers tours)</p>
        <button
          onClick={refresh}
          className="rounded-[8px] border border-[var(--border-color)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
        >
          Rafraîchir
        </button>
      </div>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">
        Mesure end-to-end côté client. <strong>prep</strong> = Promise.all(memory + classifier + compiledProfile). <strong>celestin</strong> = appel edge function (Claude). Total = ce que l'utilisateur ressent.
      </p>

      {stats ? (
        <div className="mb-3 space-y-1 text-[11px] text-[var(--text-secondary)]">
          <p>{stats.count} tour(s) capturé(s)</p>
          <p>
            <strong>Total</strong> p50 {stats.total.p50}ms · p95 {stats.total.p95}ms · max {stats.total.max}ms
          </p>
          <p>
            <strong>prep</strong> p50 {stats.prep.p50}ms · p95 {stats.prep.p95}ms
          </p>
          <p>
            <strong>celestin</strong> p50 {stats.celestin.p50}ms · p95 {stats.celestin.p95}ms
          </p>
          {stats.breakdown && (
            <>
              <p className="mt-2 text-[var(--text-muted)]">Décomposition prep ({stats.breakdown.count} tour(s)) :</p>
              <p className="pl-3">
                <strong>memory</strong> p50 {stats.breakdown.memory.p50}ms · p95 {stats.breakdown.memory.p95}ms
              </p>
              <p className="pl-3">
                <strong>classifier</strong> p50 {stats.breakdown.classifier.p50}ms · p95 {stats.breakdown.classifier.p95}ms
              </p>
              <p className="pl-3">
                <strong>compiledProfile</strong> p50 {stats.breakdown.profile.p50}ms · p95 {stats.breakdown.profile.p95}ms
              </p>
            </>
          )}
          {stats.classifierBreakdown && (
            <>
              <p className="mt-2 text-[var(--text-muted)]">Décomposition classifier ({stats.classifierBreakdown.count} tour(s)) :</p>
              <p className="pl-3">
                <strong>gemini</strong> (LLM seul) p50 {stats.classifierBreakdown.gemini.p50}ms · p95 {stats.classifierBreakdown.gemini.p95}ms
              </p>
              <p className="pl-3">
                <strong>server overhead</strong> (Deno boot + JSON validation) p50 {stats.classifierBreakdown.serverOverhead.p50}ms · p95 {stats.classifierBreakdown.serverOverhead.p95}ms
              </p>
              <p className="pl-3">
                <strong>network overhead</strong> (TLS + Supabase Functions invoke) p50 {stats.classifierBreakdown.networkOverhead.p50}ms · p95 {stats.classifierBreakdown.networkOverhead.p95}ms
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">Aucune donnée. Envoie quelques messages à Celestin et reviens ici.</p>
      )}

      {entries.length > 0 && (
        <details className="mb-3">
          <summary className="cursor-pointer text-[11px] text-[var(--text-secondary)]">Détail tour par tour</summary>
          <div className="mt-2 max-h-64 overflow-y-auto">
            <table className="w-full text-[10px] text-[var(--text-secondary)]">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="text-left">Heure</th>
                  <th className="text-right" title="Memory evidence (DB queries + embeddings)">mem</th>
                  <th className="text-right" title="Classifier (Gemini Flash-Lite)">cls</th>
                  <th className="text-right" title="Compiled profile (DB query)">prof</th>
                  <th className="text-right">prep</th>
                  <th className="text-right">celestin</th>
                  <th className="text-right">total</th>
                  <th className="text-left pl-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t border-[var(--border-color)]">
                    <td>{new Date(e.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td className="text-right tabular-nums text-[var(--text-muted)]">{e.prepBreakdown?.memoryMs ?? '–'}</td>
                    <td className="text-right tabular-nums text-[var(--text-muted)]">{e.prepBreakdown?.classifierMs ?? '–'}</td>
                    <td className="text-right tabular-nums text-[var(--text-muted)]">{e.prepBreakdown?.compiledProfileMs ?? '–'}</td>
                    <td className="text-right tabular-nums">{e.prepMs}</td>
                    <td className="text-right tabular-nums">{e.celestinMs}</td>
                    <td className="text-right tabular-nums font-medium">{e.totalMs}</td>
                    <td className="pl-2 text-[var(--text-muted)]">{e.messagePreview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <button
        onClick={() => {
          clearCelestinTimings()
          refresh()
        }}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-red-300 px-4 py-2 text-[12px] font-medium text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Purger les latences
      </button>
    </div>
  )
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
