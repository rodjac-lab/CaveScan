import { supabase } from '@/lib/supabase'
import {
  buildMemoryEvidenceBundle,
  type MemorySelectionProfile,
} from '@/lib/tastingMemories'
import {
  buildCelestinRequestBody,
  type CelestinChatMessage,
  type CelestinResponse,
} from '@/lib/celestinConversation'
import { getCompiledUserProfileCached } from '@/lib/userProfiles'
import type { Bottle, TasteProfile } from '@/lib/types'
interface PrepareCelestinRequestInput {
  message: string
  image?: string
  cave: Bottle[]
  drunk: Bottle[]
  profile: TasteProfile | null
  messages: CelestinChatMessage[]
  zones: string[]
  conversationState?: Record<string, unknown> | null
  debugTrace?: boolean
  sessionId?: string | null
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

async function loadCompiledProfileMarkdown(): Promise<string | undefined> {
  const userProfile = await getCompiledUserProfileCached()
  return userProfile?.compiled_markdown ?? undefined
}

export interface PrepTimings {
  memoryMs: number
  classifierMs: number
  compiledProfileMs: number
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now()
  const result = await fn()
  return { result, ms: Math.round(performance.now() - t0) }
}

export function shouldSkipLegacyMemoryRetrieval(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const asksBroadTastingInventory =
    /\b(combien|nombre|liste|inventaire|quels?|quelles?)\b.*\b(degustations?|deguste|goute|bu)\b/.test(normalized)
    || /\b(degustations?|deguste|goute|bu)\b.*\b(combien|nombre|liste|inventaire|quels?|quelles?)\b/.test(normalized)
    || /\bpas de\b.*\b(degustations?|deguste|goute|bu)\b/.test(normalized)
    || /\b(ai[- ]?je|j ai|est[- ]?ce que j ai)\b.*\b(deja|déjà)?\s*(bu|goute|deguste|ouvert)\b/.test(normalized)

  const asksSpecificNote =
    /\b(note|verbatim|commentaire|souvenir|etoiles?|millesime|c'etait comment|c etait comment)\b/.test(normalized)

  return asksBroadTastingInventory && !asksSpecificNote
}

export function isObviousSocialMessage(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const withoutCaVa = normalized.replace(/\s+ca va$/, '')
  const greetings = ['salut', 'bonjour', 'bonsoir', 'hello', 'coucou']
  const isGreeting = greetings.some((greeting) => editDistanceAtMostOne(withoutCaVa, greeting))

  return isGreeting
    || /^(merci|ok|d accord|parfait|super|top|cool|bonne soiree)$/.test(normalized)
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false

  if (a.length === b.length) {
    const diffs: number[] = []
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) diffs.push(index)
    }
    if (diffs.length === 2) {
      const [first, second] = diffs
      return second === first + 1 && a[first] === b[second] && a[second] === b[first]
    }
  }

  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }

  return edits + (a.length - i) + (b.length - j) <= 1
}

export function resolveLegacyMemorySelectionProfile(
  conversationState?: Record<string, unknown> | null,
): MemorySelectionProfile {
  return conversationState && (conversationState as { taskType?: string | null }).taskType === 'recommendation'
    ? 'recommendation'
    : 'default'
}

export function shouldUseBackendManagedContext(input: {
  message: string
  image?: string
  conversationState?: Record<string, unknown> | null
}): boolean {
  if (input.image) return false

  const taskType = (input.conversationState as { taskType?: string | null } | null | undefined)?.taskType
  if (taskType === 'encavage' || taskType === 'tasting') return false

  return true
}

export async function prepareCelestinRequest(input: PrepareCelestinRequestInput): Promise<{
  body: ReturnType<typeof buildCelestinRequestBody>
  prepTimings: PrepTimings
}> {
  const memorySelectionProfile = resolveLegacyMemorySelectionProfile(input.conversationState)
  const backendManagedContext = shouldUseBackendManagedContext(input)

  const shouldSkipMemoryRetrieval =
    backendManagedContext
    || shouldSkipLegacyMemoryRetrieval(input.message)
    || isObviousSocialMessage(input.message)

  const [memoryEvidenceT, compiledProfileT] = await Promise.all([
    timed(() => shouldSkipMemoryRetrieval
      ? Promise.resolve(null)
      : buildMemoryEvidenceBundle({
          query: input.message,
          recentMessages: toMemoryMessages(input.messages),
          drunkBottles: input.drunk,
          selectionProfile: memorySelectionProfile,
        })),
    timed(() => backendManagedContext ? Promise.resolve(undefined) : loadCompiledProfileMarkdown()),
  ])

  const memoryEvidence = memoryEvidenceT.result
  const compiledProfileMarkdown = compiledProfileT.result

  const body = buildCelestinRequestBody({
    message: input.message,
    image: input.image,
    cave: input.cave,
    drunk: input.drunk,
    profile: input.profile,
    messages: input.messages,
    zones: input.zones,
    memoriesOverride: memoryEvidence?.serialized || undefined,
    memoryEvidenceMode: memoryEvidence?.mode,
    memoryTrace: input.debugTrace ? memoryEvidence?.trace : undefined,
    conversationState: input.conversationState,
    compiledProfileMarkdown,
    debugTrace: input.debugTrace,
    requestSource: 'chat',
    sessionId: input.sessionId,
    backendManagedContext,
  })

  return {
    body,
    prepTimings: {
      memoryMs: memoryEvidenceT.ms,
      classifierMs: 0,
      compiledProfileMs: compiledProfileT.ms,
    },
  }
}

export async function invokeCelestin(body: ReturnType<typeof buildCelestinRequestBody>) {
  const { data, error } = await supabase.functions.invoke('celestin', { body })

  if (error) throw error

  return data as CelestinResponse & { _nextState?: Record<string, unknown>; _turnId?: string; _debug?: Record<string, unknown> }
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
