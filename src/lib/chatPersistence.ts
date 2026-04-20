import { supabase } from '@/lib/supabase'
import {
  findConflictingMemoryFacts,
  type StructuredMemoryFact,
} from '../../shared/celestin/memory-fact-conflicts.ts'
import { raiseCandidateSignal } from '@/lib/profileSignals'

export interface MemoryFact {
  id: string
  category: string
  fact: string
  confidence: number
  is_temporary: boolean
  expires_at: string | null
  created_at: string
}

interface MessageMeta {
  hasImage?: boolean
  uiActionKind?: string
  cognitiveMode?: string
}

interface InsightResponse {
  facts: Array<{
    category: string
    fact: string
    confidence: number
    source_quote?: string
    is_temporary: boolean
    expires_in_hours?: number
  }>
}

const FACT_CATEGORIES_REQUIRING_USER_QUOTE = new Set([
  'preference',
  'aversion',
  'context',
  'life_event',
  'wine_knowledge',
  'social',
  'cellar_intent',
])

type TranscriptMessage = Array<{ role: string; content: string }>
type InsightFact = InsightResponse['facts'][number]

function warn(scope: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`[chatPersistence] ${scope}:`, message)
}

function runBackground(scope: string, task: () => Promise<void>): void {
  void task().catch((err) => warn(scope, err))
}

function normalizeMemoryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isGroundedInUserMessages(
  sourceQuote: string | null | undefined,
  messages: TranscriptMessage,
): boolean {
  if (!sourceQuote || sourceQuote.trim().length < 8) return false

  const normalizedQuote = normalizeMemoryText(sourceQuote)
  if (normalizedQuote.length < 8) return false

  const userMessages = messages
    .filter((message) => message.role === 'user')
    .map((message) => normalizeMemoryText(message.content))
    .filter((content) => content.length > 0)

  return userMessages.some((content) =>
    content.includes(normalizedQuote) || normalizedQuote.includes(content)
  )
}

function shouldPersistExtractedFact(
  fact: InsightFact,
  messages: TranscriptMessage,
): boolean {
  if (!FACT_CATEGORIES_REQUIRING_USER_QUOTE.has(fact.category)) {
    return true
  }

  return isGroundedInUserMessages(fact.source_quote, messages)
}

function normalizeForHeuristics(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function quoteLooksLikeEphemeralChoice(quote: string): boolean {
  return /^(plutot|plutot un|un|une)\s+(rouge|blanc|bulles?)\b/.test(quote)
    || /\bce soir\b/.test(quote)
    || /\bpour ce soir\b/.test(quote)
    || /\baujourd hui\b/.test(quote)
    || /\bpoulet roti\b/.test(quote)
}

function quoteLooksLikeGenericKnowledgeQuestion(quote: string): boolean {
  return /\bc est quoi la difference\b/.test(quote)
    || /\bquelle difference\b/.test(quote)
    || /\bbarolo\b.*\bbarbaresco\b/.test(quote)
    || /\bai je deja bu\b/.test(quote)
    || /\bdeja bu\b/.test(quote)
}

function quoteExpressesLearningStyle(quote: string): boolean {
  return /\bexplique\b/.test(quote)
    || /\bj aime comparer\b/.test(quote)
    || /\bpas trop technique\b/.test(quote)
    || /\bsimplement\b/.test(quote)
    || /\bguide moi\b/.test(quote)
    || /\bje veux comprendre\b/.test(quote)
    || /\bj aime comprendre\b/.test(quote)
}

function sanitizeExtractedFact(fact: InsightFact): InsightFact | null {
  const quote = normalizeForHeuristics(fact.source_quote)
  const normalizedFact = normalizeForHeuristics(fact.fact)

  if (fact.category === 'context') {
    return {
      ...fact,
      is_temporary: true,
      expires_in_hours: fact.expires_in_hours ?? 12,
    }
  }

  if (
    (fact.category === 'preference' || fact.category === 'aversion')
    && quoteLooksLikeEphemeralChoice(quote)
  ) {
    return null
  }

  if (
    fact.category === 'wine_knowledge'
    && quoteLooksLikeGenericKnowledgeQuestion(quote)
    && !quoteExpressesLearningStyle(quote)
  ) {
    return null
  }

  if (
    fact.category === 'preference'
    && /\brouge italien\b/.test(normalizedFact)
    && /\bje cherche un vin italien\b/.test(quote)
  ) {
    return null
  }

  return fact
}

export async function createSession(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({})
      .select('id')
      .single()

    if (error) {
      warn('Failed to create session', error)
      return null
    }

    return data.id
  } catch (err) {
    warn('Unexpected error creating session', err)
    return null
  }
}

async function incrementSessionTurnCount(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_chat_session_turn_count', {
    target_session_id: sessionId,
  })

  if (error) {
    warn('Failed to increment turn count', error)
  }
}

export function saveMessage(
  sessionId: string | null,
  role: 'user' | 'celestin',
  content: string,
  meta?: MessageMeta,
): void {
  if (!sessionId || !content.trim()) return

  runBackground('Unexpected error saving message', async () => {
    const { error } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role,
      content: content.slice(0, 10000),
      has_image: meta?.hasImage ?? false,
      ui_action_kind: meta?.uiActionKind ?? null,
      cognitive_mode: meta?.cognitiveMode ?? null,
    })

    if (error) {
      warn('Failed to save message', error)
      return
    }

    await incrementSessionTurnCount(sessionId)
  })
}

export async function loadActiveMemoryFacts(): Promise<MemoryFact[]> {
  try {
    const { data, error } = await supabase
      .from('user_memory_facts')
      .select('id, category, fact, confidence, is_temporary, expires_at, created_at')
      .is('superseded_by', null)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) {
      warn('Failed to load facts', error)
      return []
    }

    return (data ?? []) as MemoryFact[]
  } catch {
    return []
  }
}

function toStructuredMemoryFact(fact: MemoryFact): StructuredMemoryFact {
  return {
    id: fact.id,
    category: fact.category,
    fact: fact.fact,
    confidence: fact.confidence,
    is_temporary: fact.is_temporary,
    expires_at: fact.expires_at,
    created_at: fact.created_at,
  }
}

function buildFactInsertRow(sessionId: string, fact: InsightFact): Record<string, unknown> {
  const row: Record<string, unknown> = {
    session_id: sessionId,
    category: fact.category,
    fact: fact.fact,
    confidence: fact.confidence,
    source_quote: fact.source_quote ?? null,
    is_temporary: fact.is_temporary,
  }

  if (fact.is_temporary && fact.expires_in_hours) {
    const expires = new Date()
    expires.setHours(expires.getHours() + fact.expires_in_hours)
    row.expires_at = expires.toISOString()
  }

  return row
}

function buildCandidateFact(fact: InsightFact, row: Record<string, unknown>): StructuredMemoryFact {
  return {
    category: fact.category,
    fact: fact.fact,
    confidence: fact.confidence,
    is_temporary: fact.is_temporary,
    expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
    created_at: new Date().toISOString(),
  }
}

async function insertMemoryFact(row: Record<string, unknown>): Promise<MemoryFact | null> {
  const { data, error } = await supabase
    .from('user_memory_facts')
    .insert(row)
    .select('id, category, fact, confidence, is_temporary, expires_at, created_at')
    .single()

  if (error) {
    warn('Failed to save fact', error)
    return null
  }

  return data as MemoryFact
}

const MEMORY_FACT_DURABLE_CATEGORIES = new Set(['preference', 'aversion', 'life_event'])
const MEMORY_FACT_MIN_CONFIDENCE_FOR_SIGNAL = 0.7

function raiseSignalForSavedFact(fact: MemoryFact, supersededExisting: boolean, sessionId: string): void {
  if (fact.is_temporary) return
  if (fact.confidence < MEMORY_FACT_MIN_CONFIDENCE_FOR_SIGNAL) return
  if (!MEMORY_FACT_DURABLE_CATEGORIES.has(fact.category)) return

  raiseCandidateSignal({
    type: supersededExisting ? 'profile_contradiction' : 'new_general_preference',
    sessionId,
    payload: {
      fact_id: fact.id,
      category: fact.category,
      fact: fact.fact,
      confidence: fact.confidence,
    },
  })
}

async function supersedeFacts(savedFactId: string, supersedeIds: string[]): Promise<void> {
  if (supersedeIds.length === 0) return

  const { error } = await supabase
    .from('user_memory_facts')
    .update({ superseded_by: savedFactId })
    .in('id', supersedeIds)

  if (error) {
    warn('Failed to supersede facts', error)
  }
}

export async function extractInsights(
  sessionId: string | null,
  messages: TranscriptMessage,
  existingFacts: MemoryFact[],
): Promise<MemoryFact[]> {
  if (!sessionId || messages.length < 2) return existingFacts

  try {
    const existingFactStrings = existingFacts.map((fact) => `${fact.category}: ${fact.fact}`)

    const { data, error } = await supabase.functions.invoke('extract-chat-insights', {
      body: {
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        existing_facts: existingFactStrings.length > 0 ? existingFactStrings : undefined,
      },
    })

    if (error) {
      warn('Insight extraction failed', error)
      return existingFacts
    }

    const response = data as InsightResponse
    let activeFacts = [...existingFacts]
    for (const fact of response.facts ?? []) {
      const sanitizedFact = sanitizeExtractedFact(fact)
      if (!sanitizedFact) continue

      if (!shouldPersistExtractedFact(sanitizedFact, messages)) {
        warn('Skipping ungrounded fact', fact.fact)
        continue
      }

      const row = buildFactInsertRow(sessionId, sanitizedFact)
      const candidate = buildCandidateFact(sanitizedFact, row)

      const { duplicateIds, supersedeIds } = findConflictingMemoryFacts(
        activeFacts.map(toStructuredMemoryFact),
        candidate,
      )

      if (duplicateIds.length > 0) {
        continue
      }

      const savedFact = await insertMemoryFact(row)
      if (!savedFact) continue

      await supersedeFacts(savedFact.id, supersedeIds)
      if (supersedeIds.length > 0) {
        activeFacts = activeFacts.filter((existing) => !supersedeIds.includes(existing.id))
      }

      activeFacts = [savedFact, ...activeFacts]
      raiseSignalForSavedFact(savedFact, supersedeIds.length > 0, sessionId)
    }

    return activeFacts.slice(0, 40)
  } catch (err) {
    warn('Unexpected error extracting insights', err)
    return existingFacts
  }
}
