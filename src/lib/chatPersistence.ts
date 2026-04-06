/**
 * Chat persistence layer for Celestin.
 *
 * Stores conversations in Supabase (chat_sessions + chat_messages)
 * and manages memory facts extraction and retrieval.
 *
 * All write operations are fire-and-forget to avoid blocking the UI.
 */

import { supabase } from '@/lib/supabase'
import {
  findConflictingMemoryFacts,
  type StructuredMemoryFact,
} from '../../shared/celestin/memory-fact-conflicts.ts'

// === Types ===

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

export interface SessionRow {
  id: string
  started_at: string
  summary: string | null
  turn_count: number
}

interface PendingSessionRow {
  id: string
  turn_count: number
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
  summary: string
}

// === Session management ===

const FACT_CATEGORIES_REQUIRING_USER_QUOTE = new Set([
  'preference',
  'aversion',
  'context',
  'life_event',
  'wine_knowledge',
  'social',
  'cellar_intent',
])

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
  messages: Array<{ role: string; content: string }>,
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
  fact: InsightResponse['facts'][number],
  messages: Array<{ role: string; content: string }>,
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

function sanitizeExtractedFact(
  fact: InsightResponse['facts'][number],
): InsightResponse['facts'][number] | null {
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

function shouldPersistSummary(
  summary: string,
  messages: Array<{ role: string; content: string }>,
  savedFacts: MemoryFact[],
): boolean {
  const normalizedSummary = normalizeForHeuristics(summary)
  if (!normalizedSummary) return false

  const hasDurableSignal = savedFacts.some((fact) => !fact.is_temporary)
  if (hasDurableSignal) return true

  const combinedUserText = normalizeForHeuristics(
    messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join(' ')
  )

  const looksEphemeral =
    /\bce soir\b/.test(normalizedSummary)
    || /\bpoulet roti\b/.test(normalizedSummary)
    || /\brouge italien\b/.test(normalizedSummary)
    || /\bblanc italien\b/.test(normalizedSummary)
    || /\bbarolo\b/.test(normalizedSummary)
    || /\bbarbaresco\b/.test(normalizedSummary)

  const hasEventSignal =
    /\bvisite\b/.test(combinedUserText)
    || /\brestaurant\b/.test(combinedUserText)
    || /\brome\b/.test(combinedUserText)
    || /\bachete\b/.test(combinedUserText)
    || /\bachete du\b/.test(combinedUserText)
    || /\bavec ma femme\b/.test(combinedUserText)
    || /\bavec ma fille\b/.test(combinedUserText)

  return !(looksEphemeral && !hasEventSignal)
}

export async function createSession(): Promise<string | null> {
  try {
    // Extract insights from previous unprocessed session (if any)
    void extractPreviousSessionIfNeeded()

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({})
      .select('id')
      .single()

    if (error) {
      console.warn('[chatPersistence] Failed to create session:', error.message)
      return null
    }

    console.log('[chatPersistence] Session created:', data.id)
    return data.id
  } catch (err) {
    console.warn('[chatPersistence] Unexpected error creating session:', err)
    return null
  }
}

async function incrementSessionTurnCount(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_chat_session_turn_count', {
    target_session_id: sessionId,
  })

  if (error) {
    console.warn('[chatPersistence] Failed to increment turn count:', error.message)
  }
}

export function saveMessage(
  sessionId: string | null,
  role: 'user' | 'celestin',
  content: string,
  meta?: MessageMeta,
): void {
  if (!sessionId || !content.trim()) return

  ;(async () => {
    try {
      const { error } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role,
        content: content.slice(0, 10000), // safety cap
        has_image: meta?.hasImage ?? false,
        ui_action_kind: meta?.uiActionKind ?? null,
        cognitive_mode: meta?.cognitiveMode ?? null,
      })

      if (error) {
        console.warn('[chatPersistence] Failed to save message:', error.message)
        return
      }

      await incrementSessionTurnCount(sessionId)
    } catch (err) {
      console.warn('[chatPersistence] Unexpected error saving message:', err)
    }
  })()
}

export function endSession(sessionId: string | null): void {
  if (!sessionId) return

  ;(async () => {
    try {
      await supabase
        .from('chat_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId)
    } catch (err) {
      console.warn('[chatPersistence] Failed to end session:', err)
    }
  })()
}

// === Session retrieval ===

export async function loadRecentSessions(limit = 5): Promise<SessionRow[]> {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, started_at, summary, turn_count')
      .not('summary', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('[chatPersistence] Failed to load sessions:', error.message)
      return []
    }

    return (data ?? []) as SessionRow[]
  } catch {
    return []
  }
}

/**
 * Find a bounded backlog of recent sessions without a summary and extract insights from them.
 * Called at the start of a new session to catch up on unprocessed conversations.
 */
async function loadPendingSessionsForExtraction(limit = 3): Promise<PendingSessionRow[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, turn_count')
    .is('summary', null)
    .gte('turn_count', 2)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[chatPersistence] Failed to load pending sessions:', error.message)
    return []
  }

  return ((data ?? []) as PendingSessionRow[]).reverse()
}

function extractPreviousSessionIfNeeded(): void {
  ;(async () => {
    try {
      const sessions = await loadPendingSessionsForExtraction()
      if (sessions.length === 0) return

      let activeFacts = await loadActiveMemoryFacts()

      for (const session of sessions) {
        const { data: messages } = await supabase
          .from('chat_messages')
          .select('role, content')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true })

        if (!messages || messages.length < 2) {
          continue
        }

        console.log(`[chatPersistence] Extracting insights from previous session ${session.id} (${messages.length} messages)`)

        const formatted = messages.map(message => ({ role: message.role, content: message.content }))
        activeFacts = await extractInsights(session.id, formatted, activeFacts)
      }
    } catch (err) {
      console.warn('[chatPersistence] Failed to extract previous session:', err)
    }
  })()
}

// === Memory facts ===

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
      console.warn('[chatPersistence] Failed to load facts:', error.message)
      return []
    }

    return (data ?? []) as MemoryFact[]
  } catch {
    return []
  }
}

// === Insight extraction ===

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

export async function extractInsights(
  sessionId: string | null,
  messages: Array<{ role: string; content: string }>,
  existingFacts: MemoryFact[],
): Promise<MemoryFact[]> {
  if (!sessionId || messages.length < 2) return existingFacts

  try {
    const existingFactStrings = existingFacts.map(f => `${f.category}: ${f.fact}`)

    const { data, error } = await supabase.functions.invoke('extract-chat-insights', {
      body: {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        existing_facts: existingFactStrings.length > 0 ? existingFactStrings : undefined,
      },
    })

    if (error) {
      console.warn('[chatPersistence] Insight extraction failed:', error)
      return existingFacts
    }

    const response = data as InsightResponse
    let activeFacts = [...existingFacts]
    const sessionSavedFacts: MemoryFact[] = []
    let savedCount = 0

    if (response.facts && response.facts.length > 0) {
      for (const fact of response.facts) {
        const sanitizedFact = sanitizeExtractedFact(fact)
        if (!sanitizedFact) {
          continue
        }

        if (!shouldPersistExtractedFact(sanitizedFact, messages)) {
          console.warn('[chatPersistence] Skipping ungrounded fact:', fact.fact)
          continue
        }

        const row: Record<string, unknown> = {
          session_id: sessionId,
          category: sanitizedFact.category,
          fact: sanitizedFact.fact,
          confidence: sanitizedFact.confidence,
          source_quote: sanitizedFact.source_quote ?? null,
          is_temporary: sanitizedFact.is_temporary,
        }

        if (sanitizedFact.is_temporary && sanitizedFact.expires_in_hours) {
          const expires = new Date()
          expires.setHours(expires.getHours() + sanitizedFact.expires_in_hours)
          row.expires_at = expires.toISOString()
        }

        const candidate: StructuredMemoryFact = {
          category: sanitizedFact.category,
          fact: sanitizedFact.fact,
          confidence: sanitizedFact.confidence,
          is_temporary: sanitizedFact.is_temporary,
          expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
          created_at: new Date().toISOString(),
        }

        const { duplicateIds, supersedeIds } = findConflictingMemoryFacts(
          activeFacts.map(toStructuredMemoryFact),
          candidate,
        )

        if (duplicateIds.length > 0) {
          continue
        }

        const { data: insertedFact, error: insertError } = await supabase
          .from('user_memory_facts')
          .insert(row)
          .select('id, category, fact, confidence, is_temporary, expires_at, created_at')
          .single()

        if (insertError) {
          console.warn('[chatPersistence] Failed to save fact:', insertError.message)
          continue
        }

        const savedFact = insertedFact as MemoryFact

        if (supersedeIds.length > 0) {
          const { error: supersedeError } = await supabase
            .from('user_memory_facts')
            .update({ superseded_by: savedFact.id })
            .in('id', supersedeIds)

          if (supersedeError) {
            console.warn('[chatPersistence] Failed to supersede facts:', supersedeError.message)
          } else {
            activeFacts = activeFacts.filter(existing => !supersedeIds.includes(existing.id))
          }
        }

        activeFacts = [savedFact, ...activeFacts]
        sessionSavedFacts.push(savedFact)
        savedCount += 1
      }

      console.log(`[chatPersistence] Saved ${savedCount} facts`)
    }

    if (response.summary && shouldPersistSummary(response.summary, messages, sessionSavedFacts)) {
      await supabase
        .from('chat_sessions')
        .update({ summary: response.summary })
        .eq('id', sessionId)

      supabase.functions
        .invoke('generate-embedding', {
          body: { text: response.summary, session_id: sessionId },
        })
        .then(({ error: embError }) => {
          if (embError) {
            console.warn('[chatPersistence] Summary embedding failed:', embError)
          } else {
            console.log('[chatPersistence] Summary embedding saved')
          }
        })
        .catch(() => {})
    }

    return activeFacts.slice(0, 40)
  } catch (err) {
    console.warn('[chatPersistence] Unexpected error extracting insights:', err)
    return existingFacts
  }
}
