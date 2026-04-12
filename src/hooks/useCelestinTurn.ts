import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import {
  buildCelestinMessageUpdate as buildSharedCelestinMessageUpdate,
} from '@/lib/celestinConversation'
import {
  buildTranscriptSnapshot as buildSharedTranscriptSnapshot,
  extractCelestinErrorMessage,
  invokeCelestin,
  prepareCelestinRequest,
} from '@/lib/celestinChatRequest'
import {
  saveMessage as persistMessage,
  extractInsights,
  type MemoryFact,
} from '@/lib/chatPersistence'
import {
  appendCelestinRealTrace,
  buildCelestinRealTraceEntry,
  isCelestinTraceEnabled,
} from '@/lib/celestinTrace'
import type { ChatMessage } from '@/lib/ceSoirChatTypes'
import type { Bottle, TasteProfile } from '@/lib/types'

type MutableValue<T> = { current: T }

type UseCelestinTurnInput = {
  caveRef: RefObject<Bottle[]>
  drunkRef: RefObject<Bottle[]>
  profileRef: RefObject<TasteProfile | null>
  messagesRef: RefObject<ChatMessage[]>
  zones: string[]
  conversationStateRef: MutableValue<Record<string, unknown> | null>
  onConversationStateChange: (state: Record<string, unknown>) => void
  sessionIdRef: MutableValue<string | null>
  userTurnCountRef: MutableValue<number>
  memoryFactsRawRef: MutableValue<MemoryFact[]>
  syncActiveMemoryFacts: (facts: MemoryFact[]) => void
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setIsLoading: Dispatch<SetStateAction<boolean>>
  scrollToBottom: () => void
  navigate: NavigateFunction
}

export function useCelestinTurn({
  caveRef,
  drunkRef,
  profileRef,
  messagesRef,
  zones,
  conversationStateRef,
  onConversationStateChange,
  sessionIdRef,
  userTurnCountRef,
  memoryFactsRawRef,
  syncActiveMemoryFacts,
  setMessages,
  setIsLoading,
  scrollToBottom,
  navigate,
}: UseCelestinTurnInput) {
  return useCallback(async (message: string, loadingMsgId: string, image?: string) => {
    const traceEnabled = isCelestinTraceEnabled()
    let traceBody: Awaited<ReturnType<typeof prepareCelestinRequest>> | null = null

    try {
      persistMessage(sessionIdRef.current, 'user', message, { hasImage: !!image })

      const body = await prepareCelestinRequest({
        message,
        image,
        cave: caveRef.current ?? [],
        drunk: drunkRef.current ?? [],
        profile: profileRef.current ?? null,
        messages: messagesRef.current ?? [],
        zones,
        conversationState: conversationStateRef.current,
        debugTrace: traceEnabled,
      })
      traceBody = body

      const fullResponse = await invokeCelestin(body)
      const response = fullResponse

      if (traceEnabled) {
        appendCelestinRealTrace(buildCelestinRealTraceEntry({
          userMessage: message,
          body,
          response: fullResponse,
        }))
      }

      if (fullResponse?._nextState) {
        onConversationStateChange(fullResponse._nextState)
      }

      const { update, navigateToBatchAdd } = buildSharedCelestinMessageUpdate(response, caveRef.current ?? [])

      if (navigateToBatchAdd && navigateToBatchAdd.length > 0) {
        setMessages((prev) => prev.map((entry) => entry.id === loadingMsgId ? { ...entry, ...update } : entry))
        setIsLoading(false)
        scrollToBottom()
        navigate('/add', { state: { prefillBatchExtractions: navigateToBatchAdd } })
        return
      }

      setMessages((prev) => prev.map((entry) => entry.id === loadingMsgId ? { ...entry, ...update } : entry))

      const debugInfo = (fullResponse as unknown as Record<string, unknown>)?._debug as
        Record<string, unknown> | undefined
      persistMessage(sessionIdRef.current, 'celestin', response.message, {
        uiActionKind: response.ui_action?.kind,
        cognitiveMode: debugInfo?.cognitiveMode as string | undefined,
      })

      userTurnCountRef.current++
      if (userTurnCountRef.current >= 4) {
        userTurnCountRef.current = 0
        const recentMessages = buildSharedTranscriptSnapshot(messagesRef.current ?? [], message, response.message)
        void extractInsights(sessionIdRef.current, recentMessages, memoryFactsRawRef.current)
          .then(syncActiveMemoryFacts)
      }
    } catch (err) {
      console.error('[CeSoirModule] celestin error:', err)
      if (traceEnabled && traceBody) {
        appendCelestinRealTrace(buildCelestinRealTraceEntry({
          userMessage: message,
          body: traceBody,
          error: err,
        }))
      }
      const debugMessage = await extractCelestinErrorMessage(err)

      setMessages((prev) => prev.map((entry) =>
        entry.id === loadingMsgId
          ? { ...entry, text: `Debug Celestin UI: ${debugMessage}`, isLoading: false }
          : entry
      ))
    } finally {
      setIsLoading(false)
      scrollToBottom()
    }
  }, [
    caveRef,
    conversationStateRef,
    drunkRef,
    memoryFactsRawRef,
    messagesRef,
    navigate,
    onConversationStateChange,
    profileRef,
    scrollToBottom,
    sessionIdRef,
    setIsLoading,
    setMessages,
    syncActiveMemoryFacts,
    userTurnCountRef,
    zones,
  ])
}
