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
import { ensureCompiledUserProfile, loadUserProfile } from '@/lib/userProfiles'
import type { Bottle, TasteProfile } from '@/lib/types'

const RECOMMENDATION_PATTERN = /(?:qu['’]est-ce que j['’]ouvre|que boire|j['’]ai envie d['’]un|je cherche un vin|ce soir c['’]est|avec quoi|pour ce soir|plut[oô]t un rouge|plut[oô]t un blanc|vin italien|italien|poulet r[oô]ti|osso bucco|raclette|pizza|sushi)/i

interface PrepareCelestinRequestInput {
  message: string
  image?: string
  cave: Bottle[]
  drunk: Bottle[]
  profile: TasteProfile | null
  messages: CelestinChatMessage[]
  zones: string[]
  conversationState?: Record<string, unknown> | null
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

  let compiledProfileMarkdown: string | undefined
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

  return buildCelestinRequestBody({
    message: input.message,
    image: input.image,
    cave: input.cave,
    drunk: input.drunk,
    profile: input.profile,
    messages: input.messages,
    zones: input.zones,
    memoriesOverride: memoryEvidence?.serialized || memoriesOverride,
    memoriesQuery: memoryQuery,
    memoryEvidenceMode: memoryEvidence?.mode,
    conversationState: input.conversationState,
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
