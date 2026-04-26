import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSession,
  extractInsights,
  loadActiveMemoryFacts,
  type MemoryFact,
} from '@/lib/chatPersistence'
import { getCompiledUserProfileCached } from '@/lib/userProfiles'
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

export function useCeSoirSessionState(createMessageId: () => string) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (persistedMessages) return persistedMessages
    rotateSessions()
    return [{ id: createMessageId(), role: 'celestin', text: buildSharedGreeting(), actionChips: buildSharedWelcomeChips() }]
  })

  useEffect(() => {
    persistedMessages = messages
    saveCrossSession(messages)
  }, [messages])

  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const sessionIdRef = useRef<string | null>(null)
  const userTurnCountRef = useRef(0)
  const memoryFactsRawRef = useRef<MemoryFact[]>([])
  const conversationStateRef = useRef<Record<string, unknown> | null>(persistedConversationState)

  const syncActiveMemoryFacts = useCallback((facts: MemoryFact[]) => {
    memoryFactsRawRef.current = facts
  }, [])

  const syncConversationState = useCallback((nextState: Record<string, unknown>) => {
    persistedConversationState = nextState
    conversationStateRef.current = nextState
  }, [])

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
  }, [syncActiveMemoryFacts])

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
