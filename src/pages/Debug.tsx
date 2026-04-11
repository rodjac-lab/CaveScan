import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  setCrossSessionConfig,
  getMemoryDebugInfo,
  clearAllSessions,
} from '@/lib/crossSessionMemory'
import {
  DebugCelestinToolsPanel,
  DebugEnrichmentPanel,
  DebugHeader,
  DebugMemoryPanel,
} from '@/components/debug/DebugPanels'
import { useDebugCelestinTools } from '@/hooks/useDebugCelestinTools'

export default function Debug() {
  const navigate = useNavigate()
  const celestinTools = useDebugCelestinTools()

  const [memoryInfo, setMemoryInfo] = useState(() => getMemoryDebugInfo())
  const [maxSessions, setMaxSessions] = useState(String(memoryInfo.config.maxSessions))
  const [ttlDays, setTtlDays] = useState(String(memoryInfo.config.ttlDays))
  const [expandedSession, setExpandedSession] = useState<number | null>(null)

  const [enrichStatus, setEnrichStatus] = useState<string | null>(getEnrichBackfillState().status)
  const [enrichRunning, setEnrichRunning] = useState(getEnrichBackfillState().running)
  const [backfillStatus, setBackfillStatus] = useState<string | null>(getTastingTagsBackfillState().status)
  const [backfillRunning, setBackfillRunning] = useState(getTastingTagsBackfillState().running)
  const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(getEmbeddingBackfillState().status)
  const [embeddingRunning, setEmbeddingRunning] = useState(getEmbeddingBackfillState().running)

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DebugHeader onBack={() => navigate('/settings')} />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 scrollbar-hide">
        <DebugMemoryPanel
          memoryInfo={memoryInfo}
          maxSessions={maxSessions}
          ttlDays={ttlDays}
          setMaxSessions={setMaxSessions}
          setTtlDays={setTtlDays}
          expandedSession={expandedSession}
          setExpandedSession={setExpandedSession}
          onApplyConfig={handleApplyConfig}
          onClearMemory={handleClearMemory}
          formatRelativeDate={formatRelativeDate}
        />

        <DebugCelestinToolsPanel
          exportingFixture={celestinTools.exportingFixture}
          fixtureStatus={celestinTools.fixtureStatus}
          onExportFixture={celestinTools.handleExportCelestinFixture}
          analyzingMemories={celestinTools.analyzingMemories}
          memoryWeightStatus={celestinTools.memoryWeightStatus}
          memoryWeightReport={celestinTools.memoryWeightReport}
          onAnalyzeMemoryWeight={celestinTools.handleAnalyzeMemoryWeight}
          onPickEvalFixture={celestinTools.handlePickEvalFixture}
          runningEval={celestinTools.runningEval}
          evalProviders={celestinTools.evalProviders}
          setEvalProviders={celestinTools.setEvalProviders}
          userProfile={celestinTools.userProfile}
          userProfileStatus={celestinTools.userProfileStatus}
          compilingUserProfile={celestinTools.compilingUserProfile}
          onForceCompileUserProfile={celestinTools.handleForceCompileUserProfile}
          formatRelativeDate={formatRelativeDate}
          evalStatus={celestinTools.evalStatus}
          onRunCelestinEval={celestinTools.handleRunCelestinEval}
          currentUserId={celestinTools.currentUserId}
          auditingMemory={celestinTools.auditingMemory}
          onAuditMemoryFacts={celestinTools.handleAuditMemoryFacts}
          memoryAuditStatus={celestinTools.memoryAuditStatus}
          memoryAuditReport={celestinTools.memoryAuditReport}
          routingProbe={celestinTools.routingProbe}
          setRoutingProbe={celestinTools.setRoutingProbe}
          runningRoutingProbe={celestinTools.runningRoutingProbe}
          routingProbeStatus={celestinTools.routingProbeStatus}
          routingProbeResult={celestinTools.routingProbeResult}
          onRunRoutingProbe={celestinTools.handleRunRoutingProbe}
        />

        <DebugEnrichmentPanel
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
      </div>
    </div>
  )
}
