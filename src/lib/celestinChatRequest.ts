import { supabase } from '@/lib/supabase'
import {
  buildMemoryEvidenceBundle,
  type MemorySelectionProfile,
  selectRelevantMemoriesAsync,
  serializeMemoriesForPrompt,
} from '@/lib/tastingMemories'
import {
  buildCelestinRequestBody,
  type CelestinChatMessage,
  type CelestinResponse,
} from '@/lib/celestinConversation'
import {
  loadSessionMessages,
  searchRelevantSessions,
  serializeConversationForPrompt,
  type MemoryFact,
} from '@/lib/chatPersistence'
import { getDebugMemoryPolicyId } from '@/lib/celestinMemoryPolicyDebug'
import { getDebugMemoryRuntimeId } from '@/lib/celestinMemoryRuntimeDebug'
import { ensureCompiledUserProfile, loadUserProfile } from '@/lib/userProfiles'
import type { ConversationMemorySummary } from '@/lib/crossSessionMemory'
import type { QuestionnaireProfile } from '@/lib/questionnaire-profile'
import type { Bottle, TasteProfile } from '@/lib/types'
import type { MemoryRuntimeId } from '../../shared/celestin/memory-runtime.js'
import { DEFAULT_MEMORY_RUNTIME_ID } from '../../shared/celestin/memory-runtime.js'

const PAST_REFERENCE_PATTERN = /(?:tu te souviens|la derni[eè]re fois|on avait parl[eé]|on avait bu|c'[eé]tait quoi le vin|tu m'avais (?:dit|recommand|conseill)|la fois o[uù]|dej[aà] discut)/i
const RECOMMENDATION_PATTERN = /(?:qu['’]est-ce que j['’]ouvre|que boire|j['’]ai envie d['’]un|je cherche un vin|ce soir c['’]est|avec quoi|pour ce soir|plut[oô]t un rouge|plut[oô]t un blanc|vin italien|italien|poulet r[oô]ti|osso bucco|raclette|pizza|sushi)/i

interface PrepareCelestinRequestInput {
  message: string
  image?: string
  cave: Bottle[]
  drunk: Bottle[]
  profile: TasteProfile | null
  questionnaireProfile: QuestionnaireProfile | null
  messages: CelestinChatMessage[]
  previousSession?: string
  previousSessionSummaries?: ConversationMemorySummary[]
  zones: string[]
  conversationState?: Record<string, unknown> | null
  memoryFacts?: string
  memoryFactsRaw?: MemoryFact[]
  memoryPolicyId?: string
  memoryRuntimeVersion?: MemoryRuntimeId
}

function toMemoryMessages(messages: CelestinChatMessage[]) {
  return messages
    .filter((entry) => !entry.isLoading && entry.text.trim().length > 0)
    .map((entry) => ({ role: entry.role, text: entry.text }))
}

export function buildTranscriptSnapshot(
  messages: CelestinChatMessage[],
  pendingUserMessage: string,
  assistantMessage?: string,
): Array<{ role: string; content: string }> {
  const nextTurns = messages
    .filter((entry) => !entry.isLoading && entry.text.length > 1)
    .map((entry) => ({ role: entry.role === 'user' ? 'user' : 'celestin', content: entry.text }))

  const lastTurn = nextTurns[nextTurns.length - 1]
  if (!lastTurn || lastTurn.role !== 'user' || lastTurn.content !== pendingUserMessage) {
    nextTurns.push({ role: 'user', content: pendingUserMessage })
  }

  if (assistantMessage && assistantMessage.length > 1) {
    const lastAssistantTurn = nextTurns[nextTurns.length - 1]
    if (!lastAssistantTurn || lastAssistantTurn.role !== 'celestin' || lastAssistantTurn.content !== assistantMessage) {
      nextTurns.push({ role: 'celestin', content: assistantMessage })
    }
  }

  return nextTurns.slice(-12)
}

export async function prepareCelestinRequest(input: PrepareCelestinRequestInput) {
  const debugMemoryPolicyId = getDebugMemoryPolicyId()
  const debugMemoryRuntimeId = getDebugMemoryRuntimeId()
  const memoryRuntimeVersion = input.memoryRuntimeVersion ?? (debugMemoryRuntimeId as MemoryRuntimeId | null) ?? DEFAULT_MEMORY_RUNTIME_ID
  const memorySelectionProfile: MemorySelectionProfile =
    input.conversationState && (input.conversationState as { taskType?: string | null }).taskType === 'recommendation'
      ? 'recommendation'
      : RECOMMENDATION_PATTERN.test(input.message)
        ? 'recommendation'
        : 'default'
  const memoryEvidence = await buildMemoryEvidenceBundle({
    query: input.message,
    recentMessages: toMemoryMessages(input.messages),
    drunkBottles: input.drunk,
    selectionProfile: memorySelectionProfile,
  })

  const memoryQuery = memoryEvidence?.planningQuery ?? input.message
  let memoriesOverride = memoryEvidence?.serialized || undefined

  if (!memoriesOverride) {
    try {
      const asyncMemories = await selectRelevantMemoriesAsync('generic', memoryQuery, input.drunk, 5, {
        selectionProfile: memorySelectionProfile,
        recentMessages: toMemoryMessages(input.messages),
      })
      if (asyncMemories.length > 0) {
        memoriesOverride = serializeMemoriesForPrompt(asyncMemories) || undefined
      }
    } catch {
      // Fall back to keyword memories inside buildCelestinRequestBody.
    }
  }

  let retrievedConversation: string | undefined
  if (PAST_REFERENCE_PATTERN.test(input.message)) {
    try {
      const sessions = await searchRelevantSessions(memoryQuery, 1)
      if (sessions.length > 0) {
        const sessionMessages = await loadSessionMessages(sessions[0].id)
        if (sessionMessages.length > 0) {
          retrievedConversation = serializeConversationForPrompt(sessionMessages, sessions[0].started_at)
        }
      }
    } catch {
      // Continue without retrieved conversation context.
    }
  }

  let compiledProfileMarkdown: string | undefined
  if (memoryRuntimeVersion === 'compiled_profile_v1') {
    try {
      const userProfile = await ensureCompiledUserProfile('auto_runtime_bootstrap')
      compiledProfileMarkdown = userProfile?.compiled_markdown ?? undefined
    } catch {
      try {
        const userProfile = await loadUserProfile()
        compiledProfileMarkdown = userProfile?.compiled_markdown ?? undefined
      } catch {
        // Continue without compiled profile.
      }
    }
  }

  return buildCelestinRequestBody({
    message: input.message,
    image: input.image,
    cave: input.cave,
    drunk: input.drunk,
    profile: input.profile,
    questionnaireProfile: input.questionnaireProfile,
    messages: input.messages,
    previousSession: input.previousSession,
    previousSessionSummaries: input.previousSessionSummaries,
    zones: input.zones,
    memoriesOverride: memoryEvidence?.serialized || memoriesOverride,
    memoriesQuery: memoryQuery,
    memoryEvidenceMode: memoryEvidence?.mode,
    conversationState: input.conversationState,
    memoryFacts: input.memoryFacts,
    memoryFactsRaw: input.memoryFactsRaw,
    retrievedConversation,
    memoryPolicyId: input.memoryPolicyId ?? debugMemoryPolicyId ?? undefined,
    memoryRuntimeVersion,
    compiledProfileMarkdown,
  })
}

export async function invokeCelestin(body: ReturnType<typeof buildCelestinRequestBody>) {
  const { data, error } = await supabase.functions.invoke('celestin', { body })

  if (error) throw error

  return data as CelestinResponse & { _nextState?: Record<string, unknown>; _debug?: Record<string, unknown> }
}

export async function extractCelestinErrorMessage(err: unknown) {
  const maybeContext = (err as { context?: Response } | null)?.context
  if (maybeContext instanceof Response) {
    try {
      const raw = await maybeContext.text()
      return `HTTP ${maybeContext.status}${raw ? `: ${raw}` : ''}`
    } catch {
      return `HTTP ${maybeContext.status}`
    }
  }

  return err instanceof Error ? err.message : String(err)
}
