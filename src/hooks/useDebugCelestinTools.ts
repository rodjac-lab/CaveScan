import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { serializeProfileForPrompt } from '@/lib/taste-profile'
import { buildMemoryEvidenceBundle, selectRelevantMemories } from '@/lib/tastingMemories'
import { serializeMemoriesForPrompt } from '@/lib/tastingMemoryFormatting'
import { formatDrunkSummary, getDayOfWeek, getSeason } from '@/lib/contextHelpers'
import { CELESTIN_TASTING_MEMORY_LIMIT } from '@/lib/memoryConfig'
import {
  analyzeCelestinEvalResult,
  buildCelestinEvalRequest,
  CELESTIN_EVAL_SCENARIOS,
  renderCelestinEvalHtmlReport,
  type CelestinEvalFixture,
  type CelestinEvalResult,
} from '@/lib/celestinEval'
import { downloadBlob } from '@/lib/downloadBlob'
import { compileUserProfile, loadUserProfile, type UserProfileRow } from '@/lib/userProfiles'
import { loadActiveMemoryFacts } from '@/lib/chatPersistence'
import { buildMemoryAuditReport, buildMemoryWeightReport, type MemoryAuditReport, type MemoryWeightReport } from '@/lib/debugInsights'
import {
  clearCelestinRealTraces,
  isCelestinTraceEnabled,
  loadCelestinRealTraces,
  setCelestinTraceEnabled,
  type CelestinRealTraceEntry,
} from '@/lib/celestinTrace'
import type { Bottle, TasteProfile } from '@/lib/types'

export type RoutingProbePhase = 'idle_smalltalk' | 'post_task_ack' | 'collecting_info' | 'active_task' | 'disambiguation'
export type RoutingProbeTaskType = 'none' | 'recommendation' | 'encavage' | 'tasting'

export type RoutingProbeState = {
  message: string
  lastAssistantText: string
  phase: RoutingProbePhase
  taskType: RoutingProbeTaskType
  hasImage: boolean
  provider: string
  includeRealMemory: boolean
}

type RoutingCandidate = {
  intent?: string
  confidence?: number
  reasons?: string[]
}

type RoutingTrace = {
  scope?: string
  winner?: string
  reasons?: string[]
  candidates?: RoutingCandidate[]
}

export type RoutingProbeResult = {
  message: string
  uiActionKind: string
  turnType: string | null
  cognitiveMode: string | null
  memoryFocus: string | null
  memoryEvidenceMode: string | null
  memoriesInjected: number
  memoryPlanningQuery: string | null
  provider: string | null
  routing: RoutingTrace | null
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
  }) => Promise<FileSystemFileHandle[]>
}

export function useDebugCelestinTools() {
  const [exportingFixture, setExportingFixture] = useState(false)
  const [fixtureStatus, setFixtureStatus] = useState<string | null>(null)
  const [fixtureHandle, setFixtureHandle] = useState<FileSystemFileHandle | null>(null)
  const [runningEval, setRunningEval] = useState(false)
  const [evalStatus, setEvalStatus] = useState<string | null>(null)
  const [evalProviders, setEvalProviders] = useState<Record<string, boolean>>({
    claude: true,
    openai: true,
    gemini: false,
  })
  const [analyzingMemories, setAnalyzingMemories] = useState(false)
  const [memoryWeightStatus, setMemoryWeightStatus] = useState<string | null>(null)
  const [memoryWeightReport, setMemoryWeightReport] = useState<MemoryWeightReport | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [auditingMemory, setAuditingMemory] = useState(false)
  const [memoryAuditStatus, setMemoryAuditStatus] = useState<string | null>(null)
  const [memoryAuditReport, setMemoryAuditReport] = useState<MemoryAuditReport | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfileRow | null>(null)
  const [userProfileStatus, setUserProfileStatus] = useState<string | null>(null)
  const [compilingUserProfile, setCompilingUserProfile] = useState(false)
  const [routingProbe, setRoutingProbe] = useState<RoutingProbeState>({
    message: 'Et si je veux plutôt un italien ?',
    lastAssistantText: 'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
    phase: 'post_task_ack',
    taskType: 'recommendation',
    hasImage: false,
    provider: 'gemini',
    includeRealMemory: true,
  })
  const [runningRoutingProbe, setRunningRoutingProbe] = useState(false)
  const [routingProbeStatus, setRoutingProbeStatus] = useState<string | null>(null)
  const [routingProbeResult, setRoutingProbeResult] = useState<RoutingProbeResult | null>(null)
  const [realTraceEnabled, setRealTraceEnabledState] = useState(isCelestinTraceEnabled)
  const [realTraces, setRealTraces] = useState<CelestinRealTraceEntry[]>(loadCelestinRealTraces)

  useEffect(() => {
    let cancelled = false

    async function loadCurrentUser() {
      const { data } = await supabase.auth.getUser()
      if (!cancelled) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }

    async function loadCompiledProfile() {
      try {
        const profile = await loadUserProfile()
        if (!cancelled) setUserProfile(profile)
      } catch (err) {
        if (!cancelled) {
          setUserProfile(null)
          setUserProfileStatus(`Erreur profil compilé: ${err instanceof Error ? err.message : 'inconnue'}`)
        }
      }
    }

    void loadCurrentUser()
    void loadCompiledProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const handleExportCelestinFixture = async () => {
    setExportingFixture(true)
    setFixtureStatus('Preparation de la fixture...')

    try {
      const [
        { data: cave, error: caveError },
        { data: drunk, error: drunkError },
        { data: profileRow, error: profileError },
        initialCompiledProfileRow,
      ] = await Promise.all([
        supabase
          .from('bottles')
          .select('id, domaine, cuvee, appellation, millesime, couleur, quantity, volume_l')
          .eq('status', 'in_stock')
          .order('added_at', { ascending: false }),
        supabase
          .from('bottles')
          .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, raw_extraction, zone_id, shelf, photo_url, photo_url_back, status, added_at, drunk_at, updated_at, tasting_note, purchase_price, market_value, drink_from, drink_until, notes, tasting_photos, rating, rebuy, qpr, grape_varieties, serving_temperature, typical_aromas, food_pairings, character, quantity, volume_l, tasting_tags')
          .eq('status', 'drunk')
          .order('drunk_at', { ascending: false }),
        supabase
          .from('user_taste_profiles')
          .select('computed_profile, explicit_preferences, computed_at')
          .maybeSingle(),
        loadUserProfile(),
      ])

      if (caveError) throw caveError
      if (drunkError) throw drunkError
      if (profileError) throw profileError

      let compiledProfileRow = initialCompiledProfileRow
      if (!compiledProfileRow?.compiled_markdown?.trim()) {
        compiledProfileRow = await compileUserProfile('fixture_export_bootstrap')
        setUserProfile(compiledProfileRow)
      }

      const profile: TasteProfile | null = profileRow?.computed_profile
        ? {
            computed: profileRow.computed_profile,
            explicit: profileRow.explicit_preferences ?? {},
            computedAt: profileRow.computed_at ?? '',
          }
        : null

      const drunkBottles = (drunk ?? []) as Bottle[]
      const memories = selectRelevantMemories(null, drunkBottles, 12)
      const fixture: CelestinEvalFixture = {
        name: 'celestin-fixture',
        description: 'Export de fixture depuis la session authentifiee de Celestin avec memoire structuree',
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
        drunk: drunkBottles,
        profile: profile ? serializeProfileForPrompt(profile) : null,
        memories: serializeMemoriesForPrompt(memories) || null,
        compiledProfileMarkdown: compiledProfileRow?.compiled_markdown ?? null,
        context: {
          dayOfWeek: getDayOfWeek(),
          season: getSeason(),
          recentDrunk: drunkBottles.slice(0, 5).map(formatDrunkSummary),
        },
      }

      const date = new Date().toISOString().slice(0, 10)
      downloadBlob(JSON.stringify(fixture, null, 2), `celestin-fixture-${date}.json`, 'application/json')

      setFixtureStatus(
        `Fixture exportee (${fixture.cave?.length ?? 0} bouteilles en cave, ${fixture.drunk?.length ?? 0} degustees, profil compilé ${fixture.compiledProfileMarkdown ? 'oui' : 'non'})`
      )
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
    } catch {
      // User cancelled
    }
  }

  const handleRunCelestinEval = async () => {
    if (!fixtureHandle) {
      setEvalStatus('Choisis d abord une fixture JSON.')
      return
    }

    const selectedProviders = Object.entries(evalProviders).filter(([, enabled]) => enabled).map(([provider]) => provider)
    if (selectedProviders.length === 0) {
      setEvalStatus('Selectionne au moins un provider.')
      return
    }

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
          const body = await buildCelestinEvalRequest(fixture, scenario, provider)
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
      const report = { fixture, scenarios: CELESTIN_EVAL_SCENARIOS, providers: selectedProviders, memoryRuntime: 'compiled_profile_v1', results }
      const html = renderCelestinEvalHtmlReport(results, fixture, CELESTIN_EVAL_SCENARIOS)
      const baseName = `celestin-eval-${providerSuffix}-compiled_profile_v1-${timestamp}`

      downloadBlob(JSON.stringify(report, null, 2), `${baseName}.json`, 'application/json')
      downloadBlob(html, `${baseName}.html`, 'text/html')

      setEvalStatus(`Rapports telecharges (${selectedProviders.join(' vs ')}) • runtime compiled_profile_v1`)
    } catch (err) {
      setEvalStatus(`Erreur eval Celestin: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setRunningEval(false)
    }
  }

  const handleForceCompileUserProfile = async () => {
    setCompilingUserProfile(true)
    setUserProfileStatus('Compilation du profil utilisateur...')

    try {
      const profile = await compileUserProfile('debug_manual_force')
      setUserProfile(profile)
      setUserProfileStatus(`Profil compilé v${profile.version} • ${profile.compilation_status}`)
    } catch (err) {
      setUserProfileStatus(`Erreur compilation profil: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setCompilingUserProfile(false)
    }
  }

  const handleAuditMemoryFacts = async () => {
    setAuditingMemory(true)
    setMemoryAuditStatus('Audit des user_memory_facts...')
    setMemoryAuditReport(null)

    try {
      const facts = await loadActiveMemoryFacts()
      setMemoryAuditReport(buildMemoryAuditReport(facts))
      setMemoryAuditStatus(`Audit termine (${facts.length} facts actives).`)
    } catch (err) {
      setMemoryAuditStatus(`Erreur audit memoire: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setAuditingMemory(false)
    }
  }

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

      const report = buildMemoryWeightReport((data ?? []) as Bottle[])
      if (!report) {
        setMemoryWeightStatus('Aucune note de degustation a analyser.')
        return
      }

      setMemoryWeightReport(report)
      setMemoryWeightStatus(`Analyse terminee (${report.noteCount} notes).`)
    } catch (err) {
      setMemoryWeightStatus(`Erreur analyse memoire: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setAnalyzingMemories(false)
    }
  }

  const handleRunRoutingProbe = async () => {
    const message = routingProbe.message.trim()
    if (!message) {
      setRoutingProbeStatus('Saisis un message a router.')
      return
    }

    setRunningRoutingProbe(true)
    setRoutingProbeStatus('Appel Celestin debug...')
    setRoutingProbeResult(null)

    try {
      const lastAssistantText = routingProbe.lastAssistantText.trim()
      const history = lastAssistantText
        ? [{ role: 'assistant', text: routingProbe.lastAssistantText.trim() }]
        : []
      const [caveResult, drunkResult, profileResult] = routingProbe.includeRealMemory
        ? await Promise.all([
            supabase.from('bottles').select('id, domaine, cuvee, appellation, millesime, couleur, quantity, volume_l').eq('status', 'in_stock'),
            supabase
              .from('bottles')
              .select('id, domaine, cuvee, appellation, millesime, couleur, country, region, raw_extraction, zone_id, shelf, photo_url, photo_url_back, status, added_at, drunk_at, updated_at, tasting_note, purchase_price, market_value, drink_from, drink_until, notes, tasting_photos, rating, rebuy, qpr, grape_varieties, serving_temperature, typical_aromas, food_pairings, character, quantity, volume_l, tasting_tags')
              .eq('status', 'drunk')
              .order('drunk_at', { ascending: false })
              .limit(CELESTIN_TASTING_MEMORY_LIMIT),
            supabase.from('user_taste_profiles').select('computed_profile, explicit_preferences, computed_at').maybeSingle(),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: null, error: null },
          ]

      if (caveResult.error) throw caveResult.error
      if (drunkResult.error) throw drunkResult.error
      if (profileResult.error) throw profileResult.error

      const cave = (caveResult.data ?? []) as Pick<Bottle, 'id' | 'domaine' | 'cuvee' | 'appellation' | 'millesime' | 'couleur' | 'quantity' | 'volume_l'>[]
      const drunk = (drunkResult.data ?? []) as Bottle[]
      const profileRow = profileResult.data as { computed_profile?: TasteProfile['computed']; explicit_preferences?: TasteProfile['explicit']; computed_at?: string } | null
      const profile: TasteProfile | null = profileRow?.computed_profile
        ? {
            computed: profileRow.computed_profile,
            explicit: profileRow.explicit_preferences ?? {},
            computedAt: profileRow.computed_at ?? '',
          }
        : null
      const recentMessages = [
        ...(lastAssistantText ? [{ role: 'celestin' as const, text: lastAssistantText }] : []),
      ]
      const memoryEvidence = routingProbe.includeRealMemory
        ? await buildMemoryEvidenceBundle({
            query: message,
            recentMessages,
            drunkBottles: drunk,
            selectionProfile: routingProbe.taskType === 'recommendation' ? 'recommendation' : 'default',
          })
        : null
      const body = {
        message,
        history,
        cave: cave.map((bottle) => ({
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
        profile: profile ? serializeProfileForPrompt(profile) : undefined,
        memories: memoryEvidence?.serialized || undefined,
        memoryEvidenceMode: memoryEvidence?.mode,
        memoryTrace: memoryEvidence?.trace,
        compiledProfileMarkdown: userProfile?.compiled_markdown ?? undefined,
        debugTrace: true,
        ...(routingProbe.provider ? { provider: routingProbe.provider } : {}),
        ...(routingProbe.hasImage ? { image: 'data:image/png;base64,iVBORw0KGgo=' } : {}),
        conversationState: {
          phase: routingProbe.phase,
          taskType: routingProbe.taskType === 'none' ? null : routingProbe.taskType,
          lastUiActionKind: routingProbe.taskType === 'recommendation' ? 'show_recommendations' : null,
          turnsSinceLastAction: 0,
          memoryFocus: null,
        },
        context: {
          dayOfWeek: getDayOfWeek(),
          season: getSeason(),
          recentDrunk: [],
        },
      }

      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>('celestin', { body })
      if (error) throw error
      if (!data) throw new Error('Reponse Celestin vide.')

      const debug = data._debug as Record<string, unknown> | undefined
      const routing = (debug?.routing ?? null) as RoutingTrace | null
      setRoutingProbeResult({
        message: typeof data.message === 'string' ? data.message : '',
        uiActionKind: ((data.ui_action as { kind?: string } | null | undefined)?.kind) ?? 'none',
        turnType: typeof debug?.turnType === 'string' ? debug.turnType : null,
        cognitiveMode: typeof debug?.cognitiveMode === 'string' ? debug.cognitiveMode : null,
        memoryFocus: typeof debug?.memoryFocus === 'string' ? debug.memoryFocus : null,
        memoryEvidenceMode: typeof debug?.memoryEvidenceMode === 'string' ? debug.memoryEvidenceMode : null,
        memoriesInjected: memoryEvidence?.memories.length ?? 0,
        memoryPlanningQuery: memoryEvidence?.planningQuery ?? null,
        provider: typeof debug?.provider === 'string' ? debug.provider : null,
        routing,
      })
      setRoutingProbeStatus(`Route: ${routing?.winner ?? 'inconnue'} • ui_action=${((data.ui_action as { kind?: string } | null | undefined)?.kind) ?? 'none'} • memories=${memoryEvidence?.memories.length ?? 0}`)
    } catch (err) {
      setRoutingProbeStatus(`Erreur routing probe: ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setRunningRoutingProbe(false)
    }
  }

  const handleToggleRealTrace = (enabled: boolean) => {
    setCelestinTraceEnabled(enabled)
    setRealTraceEnabledState(enabled)
  }

  const handleRefreshRealTraces = () => {
    setRealTraces(loadCelestinRealTraces())
  }

  const handleClearRealTraces = () => {
    clearCelestinRealTraces()
    setRealTraces([])
  }

  return {
    exportingFixture,
    fixtureStatus,
    runningEval,
    evalStatus,
    evalProviders,
    setEvalProviders,
    analyzingMemories,
    memoryWeightStatus,
    memoryWeightReport,
    currentUserId,
    auditingMemory,
    memoryAuditStatus,
    memoryAuditReport,
    userProfile,
    userProfileStatus,
    compilingUserProfile,
    routingProbe,
    setRoutingProbe,
    runningRoutingProbe,
    routingProbeStatus,
    routingProbeResult,
    realTraceEnabled,
    realTraces,
    handleExportCelestinFixture,
    handlePickEvalFixture,
    handleRunCelestinEval,
    handleForceCompileUserProfile,
    handleAuditMemoryFacts,
    handleAnalyzeMemoryWeight,
    handleRunRoutingProbe,
    handleToggleRealTrace,
    handleRefreshRealTraces,
    handleClearRealTraces,
  }
}
