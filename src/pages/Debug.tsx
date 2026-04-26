import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { formatRelativeDate } from '@/lib/debugInsights'
import {
  getEmbeddingBackfillState,
  getEnrichBackfillState,
  getTastingTagsBackfillState,
  runEmbeddingBackfill,
  runEnrichBackfill,
  runTastingTagsBackfill,
} from '@/lib/debugBackfills'
import {
  getMemoryDebugInfo,
  clearAllSessions,
} from '@/lib/debug/crossSessionMemory'
import {
  CrossSessionCleanupPanel,
  DebugHeader,
  EnrichmentBackfillsPanel,
  ExportFixturePanel,
  ForceCompileProfilePanel,
  MemoryAuditPanel,
  MemoryWeightPanel,
  ProfilePatchesPanel,
  RealTracesPanel,
  RoutingProbePanel,
  RunEvalPanel,
  SqlRetrievalPanel,
} from '@/components/debug/DebugPanels'
import { DebugSection } from '@/components/debug/sections/DebugSection'
import { useDebugCelestinTools } from '@/hooks/useDebugCelestinTools'

export default function Debug() {
  const navigate = useNavigate()
  const { loading: adminLoading, isAdmin } = useIsAdmin()
  const celestinTools = useDebugCelestinTools()

  const [memoryInfo, setMemoryInfo] = useState(() => getMemoryDebugInfo())

  const [enrichStatus, setEnrichStatus] = useState<string | null>(getEnrichBackfillState().status)
  const [enrichRunning, setEnrichRunning] = useState(getEnrichBackfillState().running)
  const [backfillStatus, setBackfillStatus] = useState<string | null>(getTastingTagsBackfillState().status)
  const [backfillRunning, setBackfillRunning] = useState(getTastingTagsBackfillState().running)
  const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(getEmbeddingBackfillState().status)
  const [embeddingRunning, setEmbeddingRunning] = useState(getEmbeddingBackfillState().running)

  useEffect(() => {
    if (adminLoading) return
    if (!isAdmin) navigate('/', { replace: true })
  }, [adminLoading, isAdmin, navigate])

  if (adminLoading) return null
  if (!isAdmin) return null

  const enrichUpdater = (state: { status: string | null; running: boolean }) => {
    setEnrichStatus(state.status)
    setEnrichRunning(state.running)
  }

  const tastingTagsUpdater = (state: { status: string | null; running: boolean }) => {
    setBackfillStatus(state.status)
    setBackfillRunning(state.running)
  }

  const embeddingUpdater = (state: { status: string | null; running: boolean }) => {
    setEmbeddingStatus(state.status)
    setEmbeddingRunning(state.running)
  }

  function handleClearMemory() {
    if (!confirm('Effacer toute la memoire conversationnelle de Celestin ?')) return
    clearAllSessions()
    setMemoryInfo(getMemoryDebugInfo())
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DebugHeader onBack={() => navigate('/settings')} />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 scrollbar-hide">
        <DebugSection title="Observabilité" icon="🔍" subtitle="regarder le runtime">
          <SqlRetrievalPanel />
          <RealTracesPanel
            realTraceEnabled={celestinTools.realTraceEnabled}
            realTraces={celestinTools.realTraces}
            onToggleRealTrace={celestinTools.handleToggleRealTrace}
            onRefreshRealTraces={celestinTools.handleRefreshRealTraces}
            onClearRealTraces={celestinTools.handleClearRealTraces}
            formatRelativeDate={formatRelativeDate}
          />
          <RoutingProbePanel
            routingProbe={celestinTools.routingProbe}
            setRoutingProbe={celestinTools.setRoutingProbe}
            runningRoutingProbe={celestinTools.runningRoutingProbe}
            routingProbeStatus={celestinTools.routingProbeStatus}
            routingProbeResult={celestinTools.routingProbeResult}
            onRunRoutingProbe={celestinTools.handleRunRoutingProbe}
          />
          <MemoryAuditPanel
            currentUserId={celestinTools.currentUserId}
            auditingMemory={celestinTools.auditingMemory}
            memoryAuditStatus={celestinTools.memoryAuditStatus}
            memoryAuditReport={celestinTools.memoryAuditReport}
            onAuditMemoryFacts={celestinTools.handleAuditMemoryFacts}
          />
          <ProfilePatchesPanel />
        </DebugSection>

        <DebugSection title="Tests & évaluations" icon="🧪" subtitle="vérifier avant de ship">
          <ExportFixturePanel
            exportingFixture={celestinTools.exportingFixture}
            fixtureStatus={celestinTools.fixtureStatus}
            onExportFixture={celestinTools.handleExportCelestinFixture}
          />
          <RunEvalPanel
            onPickEvalFixture={celestinTools.handlePickEvalFixture}
            evalProviders={celestinTools.evalProviders}
            setEvalProviders={celestinTools.setEvalProviders}
            runningEval={celestinTools.runningEval}
            evalStatus={celestinTools.evalStatus}
            onRunCelestinEval={celestinTools.handleRunCelestinEval}
          />
        </DebugSection>

        <DebugSection title="Maintenance & données" icon="⚙️" subtitle="usage rare" defaultOpen={false}>
          <MemoryWeightPanel
            analyzingMemories={celestinTools.analyzingMemories}
            memoryWeightStatus={celestinTools.memoryWeightStatus}
            memoryWeightReport={celestinTools.memoryWeightReport}
            onAnalyzeMemoryWeight={celestinTools.handleAnalyzeMemoryWeight}
          />
          <ForceCompileProfilePanel
            userProfile={celestinTools.userProfile}
            userProfileStatus={celestinTools.userProfileStatus}
            compilingUserProfile={celestinTools.compilingUserProfile}
            onForceCompileUserProfile={celestinTools.handleForceCompileUserProfile}
            formatRelativeDate={formatRelativeDate}
          />
          <EnrichmentBackfillsPanel
            enrichRunning={enrichRunning}
            enrichStatus={enrichStatus}
            onRunEnrichBackfill={() => runEnrichBackfill(enrichUpdater)}
            backfillRunning={backfillRunning}
            backfillStatus={backfillStatus}
            onRunTastingTagsBackfill={() => runTastingTagsBackfill(tastingTagsUpdater)}
            embeddingRunning={embeddingRunning}
            embeddingStatus={embeddingStatus}
            onRunEmbeddingBackfill={() => runEmbeddingBackfill(embeddingUpdater)}
          />
          <CrossSessionCleanupPanel
            memoryInfo={memoryInfo}
            onClearMemory={handleClearMemory}
            formatRelativeDate={formatRelativeDate}
          />
        </DebugSection>
      </div>
    </div>
  )
}
