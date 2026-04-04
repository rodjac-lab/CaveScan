import { supabase } from '@/lib/supabase'
import {
  buildMemoryEvidenceBundle,
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
import type { ConversationMemorySummary } from '@/lib/crossSessionMemory'
import type { QuestionnaireProfile } from '@/lib/questionnaire-profile'
import type { Bottle, TasteProfile } from '@/lib/types'

const PAST_REFERENCE_PATTERN = /(?:tu te souviens|la derni[eè]re fois|on avait parl[eé]|on avait bu|c'[eé]tait quoi le vin|tu m'avais (?:dit|recommand|conseill)|la fois o[uù]|dej[aà] discut)/i

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
  const memoryEvidence = await buildMemoryEvidenceBundle({
    query: input.message,
    recentMessages: toMemoryMessages(input.messages),
    drunkBottles: input.drunk,
  })

  const memoryQuery = memoryEvidence?.planningQuery ?? input.message
  let memoriesOverride = memoryEvidence?.serialized || undefined

  if (!memoriesOverride) {
    try {
      const asyncMemories = await selectRelevantMemoriesAsync('generic', memoryQuery, input.drunk)
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
