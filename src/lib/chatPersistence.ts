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
} from '../../shared/celestin/user-model-resolver.ts'

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

interface MessageRow {
  role: string
  content: string
  created_at: string
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

      // Increment turn count
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('turn_count')
        .eq('id', sessionId)
        .single()

      if (session) {
        await supabase
          .from('chat_sessions')
          .update({ turn_count: (session.turn_count ?? 0) + 1 })
          .eq('id', sessionId)
      }
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
 * Find the most recent session without a summary and extract insights from it.
 * Called at the start of a new session to catch up on unprocessed conversations.
 */
function extractPreviousSessionIfNeeded(): void {
  ;(async () => {
    try {
      // Find the most recent session that has messages but no summary
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, turn_count')
        .is('summary', null)
        .gte('turn_count', 2)
        .order('started_at', { ascending: false })
        .limit(1)

      if (!sessions || sessions.length === 0) return

      const sessionId = sessions[0].id

      // Load messages from that session
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (!messages || messages.length < 2) return

      console.log(`[chatPersistence] Extracting insights from previous session ${sessionId} (${messages.length} messages)`)

      const formatted = messages.map(m => ({ role: m.role, content: m.content }))

      // Load existing facts to avoid duplicates
      const existingFacts = await loadActiveMemoryFacts()
      void extractInsights(sessionId, formatted, existingFacts)
    } catch (err) {
      console.warn('[chatPersistence] Failed to extract previous session:', err)
    }
  })()
}

export async function loadSessionMessages(sessionId: string): Promise<MessageRow[]> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[chatPersistence] Failed to load messages:', error.message)
      return []
    }

    return (data ?? []) as MessageRow[]
  } catch {
    return []
  }
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
    let savedCount = 0

    if (response.facts && response.facts.length > 0) {
      for (const fact of response.facts) {
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

        const candidate: StructuredMemoryFact = {
          category: fact.category,
          fact: fact.fact,
          confidence: fact.confidence,
          is_temporary: fact.is_temporary,
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
        savedCount += 1
      }

      console.log(`[chatPersistence] Saved ${savedCount} facts`)
    }

    if (response.summary) {
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

    return loadActiveMemoryFacts()
  } catch (err) {
    console.warn('[chatPersistence] Unexpected error extracting insights:', err)
    return existingFacts
  }
}

// === Semantic session search (for conversation retrieval) ===

export async function searchRelevantSessions(
  query: string,
  limit = 2,
): Promise<Array<{ id: string; summary: string; started_at: string }>> {
  try {
    // Step 1: Get query embedding
    const { data: embData, error: embError } = await supabase.functions.invoke(
      'generate-embedding',
      { body: { query } },
    )

    if (embError || !embData?.embedding) {
      console.warn('[chatPersistence] Failed to generate query embedding:', embError)
      return []
    }

    // Step 2: Search via RPC
    const { data: results, error: rpcError } = await supabase.rpc('search_sessions', {
      query_embedding: JSON.stringify(embData.embedding),
      match_count: limit,
      similarity_threshold: 0.35,
    })

    if (rpcError) {
      console.warn('[chatPersistence] Session search failed:', rpcError.message)
      return []
    }

    return (results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      summary: r.summary as string,
      started_at: r.started_at as string,
    }))
  } catch {
    return []
  }
}

// === Serialize retrieved conversation for prompt ===

export function serializeConversationForPrompt(
  messages: MessageRow[],
  sessionDate: string,
): string {
  if (messages.length === 0) return ''

  const date = new Date(sessionDate)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const lines = messages.map(m => {
    const label = m.role === 'user' ? 'Utilisateur' : 'Celestin'
    return `${label} : ${m.content.slice(0, 300)}`
  })

  return `Conversation du ${dateStr} :\n${lines.join('\n')}`
}
