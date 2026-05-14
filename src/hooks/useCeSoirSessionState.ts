import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSession,
  extractInsights,
  loadActiveMemoryFacts,
  type MemoryFact,
} from '@/lib/chatPersistence'
import { getCompiledUserProfileCached, invalidateCompiledUserProfileCache } from '@/lib/userProfiles'
import { clearRecommendationCache } from '@/lib/recommendationStore'
import {
  saveCurrentSession as saveCrossSession,
  rotateSessions,
} from '@/lib/debug/crossSessionMemory'
import {
  buildGreeting as buildSharedGreeting,
  buildWelcomeChips as buildSharedWelcomeChips,
} from '@/lib/celestinConversation'
import type { ChatMessage } from '@/lib/ceSoirChatTypes'

let persistedMessages: ChatMessage[] | null = null
let persistedConversationState: Record<string, unknown> | null = null

type PersistedSessionState = {
  messages: ChatMessage[]
  conversationState: Record<string, unknown> | null
}

const persistedByUser = new Map<string, PersistedSessionState>()

function initialMessages(createMessageId: () => string): ChatMessage[] {
  return [{ id: createMessageId(), role: 'celestin', text: buildSharedGreeting(), actionChips: buildSharedWelcomeChips() }]
}

function persistForUser(userKey: string, messages: ChatMessage[], conversationState: Record<string, unknown> | null): void {
  persistedByUser.set(userKey, { messages, conversationState })
}

export function clearPersistedCeSoirSessionState(): void {
  persistedMessages = null
  persistedConversationState = null
  persistedByUser.clear()
}

export function useCeSoirSessionState(createMessageId: () => string, userId?: string | null) {
  const userKey = userId ?? 'anonymous'
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const persisted = persistedByUser.get(userKey)?.messages ?? (userId ? null : persistedMessages)
    if (persisted) return persisted
    rotateSessions(userKey)
    return initialMessages(createMessageId)
  })

  useEffect(() => {
    const conversationState = persistedByUser.get(userKey)?.conversationState ?? (userId ? null : persistedConversationState)
    persistForUser(userKey, messages, conversationState)
    if (!userId) persistedMessages = messages
    saveCrossSession(messages, userKey)
  }, [messages, userId, userKey])

  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const sessionIdRef = useRef<string | null>(null)
  const userTurnCountRef = useRef(0)
  const memoryFactsRawRef = useRef<MemoryFact[]>([])
  const conversationStateRef = useRef<Record<string, unknown> | null>(
    persistedByUser.get(userKey)?.conversationState ?? (userId ? null : persistedConversationState),
  )

  const syncActiveMemoryFacts = useCallback((facts: MemoryFact[]) => {
    memoryFactsRawRef.current = facts
  }, [])

  const syncConversationState = useCallback((nextState: Record<string, unknown>) => {
    persistForUser(userKey, messagesRef.current, nextState)
    if (!userId) persistedConversationState = nextState
    conversationStateRef.current = nextState
  }, [userId, userKey])

  useEffect(() => {
    invalidateCompiledUserProfileCache()
    clearRecommendationCache()
  }, [userKey])

  useEffect(() => {
    createSession().then((id) => { sessionIdRef.current = id })
    loadActiveMemoryFacts().then(syncActiveMemoryFacts)
    void getCompiledUserProfileCached()

    return () => {
      const sessionId = sessionIdRef.current
      // Read latest mutable count on unmount to decide whether to extract final insights.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const userTurnCount = userTurnCountRef.current

      if (sessionId && userTurnCount > 0) {
        const recent = (messagesRef.current ?? [])
          .filter((message) => !message.isLoading && message.text.length > 1)
          .slice(-12)
          .map((message) => ({ role: message.role === 'user' ? 'user' : 'celestin', content: message.text }))
        if (recent.length >= 2) {
          void extractInsights(sessionId, recent, memoryFactsRawRef.current)
        }
      }
    }
  }, [syncActiveMemoryFacts, userKey])

  return {
    messages,
    setMessages,
    messagesRef,
    sessionIdRef,
    userTurnCountRef,
    memoryFactsRawRef,
    conversationStateRef,
    syncActiveMemoryFacts,
    syncConversationState,
  }
}
