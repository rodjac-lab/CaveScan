import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { useTasteProfile } from '@/hooks/useTasteProfile'
import { useZones } from '@/hooks/useZones'
import { useQuestionnaireProfile } from '@/hooks/useQuestionnaireProfile'
import { useCelestinTurn } from '@/hooks/useCelestinTurn'
import { useCeSoirSessionState } from '@/hooks/useCeSoirSessionState'
import { getCachedRecommendation, buildQueryKey, type RecommendationCard } from '@/lib/recommendationStore'
import { useInlineQuestionnaire } from '@/components/discover/useInlineQuestionnaire'
import { fileToBase64 } from '@/lib/image'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import {
  buildEncaveWineAction as buildSharedEncaveWineAction,
  type WineActionData,
} from '@/lib/celestinConversation'
import {
  appendCachedRecommendationMessages,
  appendCelestinTextMessage,
  appendPhotoOnlyPromptMessages,
  appendUserAndLoadingMessage,
  appendUserMessage,
  buildWineActionNavigation,
  isEncavagePhotoIntent,
  isQuestionnaireIntent,
  queryForStoredPhotoChip,
} from '@/lib/ceSoirFlow'
import type { CeSoirChatViewProps } from '@/components/discover/CeSoirChatView'
import type { ChatMessage } from '@/lib/ceSoirChatTypes'

let nextMsgId = 1
function genMsgId(): string {
  return `msg-${nextMsgId++}`
}

export function useCeSoirChatFlow(): CeSoirChatViewProps {
  const navigate = useNavigate()

  const { bottles: caveBottles } = useBottles()
  const { bottles: drunkBottles } = useRecentlyDrunk()
  const { profile } = useTasteProfile()
  const { zones } = useZones()
  const { profile: questionnaireProfile, loading: questionnaireLoading, saveProfile: saveQuestionnaireProfile } = useQuestionnaireProfile()

  const [queryInput, setQueryInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedCard, setExpandedCard] = useState<RecommendationCard | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)

  const {
    messages,
    setMessages,
    messagesRef,
    sessionIdRef,
    userTurnCountRef,
    memoryFactsRawRef,
    conversationStateRef,
    syncActiveMemoryFacts,
    syncConversationState,
  } = useCeSoirSessionState(genMsgId)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const storedPhotoRef = useRef<{ base64: string; file: File | null } | null>(null)
  const caveRef = useRef(caveBottles)
  const drunkRef = useRef(drunkBottles)
  const profileRef = useRef(profile)
  caveRef.current = caveBottles
  drunkRef.current = drunkBottles
  profileRef.current = profile

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const inlineQuestionnaire = useInlineQuestionnaire<ChatMessage>({
    questionnaireLoading,
    questionnaireProfile,
    saveQuestionnaireProfile,
    setMessages,
    scrollToBottom,
    createMessageId: genMsgId,
  })

  const callCelestin = useCelestinTurn({
    caveRef,
    drunkRef,
    profileRef,
    messagesRef,
    zones: zones.map((zone) => zone.name),
    conversationStateRef,
    onConversationStateChange: syncConversationState,
    sessionIdRef,
    userTurnCountRef,
    memoryFactsRawRef,
    syncActiveMemoryFacts,
    setMessages,
    setIsLoading,
    scrollToBottom,
    navigate,
  })

  function submitMessage(text: string) {
    setIsLoading(true)
    const loadingMsgId = genMsgId()
    setMessages((prev) => appendUserAndLoadingMessage(prev, genMsgId, loadingMsgId, { text }))
    scrollToBottom()
    void callCelestin(text, loadingMsgId)
  }

  function handleQuerySubmit() {
    const text = queryInput.trim()
    const photo = pendingPhoto
    const photoFile = pendingPhotoFile

    if (!photo && text.length < 2) return
    if (isLoading) return

    setQueryInput('')
    setPendingPhoto(null)
    setPendingPhotoFile(null)
    if (textareaRef.current) textareaRef.current.style.height = ''

    if (!photo && !questionnaireProfile && !inlineQuestionnaire.qActive && isQuestionnaireIntent(text)) {
      setMessages((prev) => appendUserMessage(prev, genMsgId, { text }))
      scrollToBottom()
      void inlineQuestionnaire.startQuestionnaire()
      return
    }

    if (photo) {
      handlePhotoSubmit(text, photo, photoFile)
    } else {
      submitMessage(text)
    }
  }

  function handlePhotoSubmit(text: string, photo: string, photoFile: File | null) {
    if (text && isEncavagePhotoIntent(text) && photoFile) {
      handleExtractWineFlow(text, photo, photoFile)
    } else if (text) {
      submitMessageWithImage(text, photo)
    } else {
      handlePhotoOnlyFlow(photo, photoFile)
    }
  }

  function submitMessageWithImage(text: string, image: string) {
    setIsLoading(true)
    const loadingMsgId = genMsgId()
    setMessages((prev) => appendUserAndLoadingMessage(prev, genMsgId, loadingMsgId, { text, image }))
    scrollToBottom()
    void callCelestin(text, loadingMsgId, image)
  }

  async function handleExtractWineFlow(text: string, photo: string, photoFile: File) {
    setIsLoading(true)
    const loadingMsgId = genMsgId()
    setMessages((prev) => appendUserAndLoadingMessage(prev, genMsgId, loadingMsgId, { text, image: photo }))
    scrollToBottom()

    try {
      const parsed = await extractWineFromFile(photoFile)
      const extraction = parsed.bottles[0]
      const wineAction: WineActionData = buildSharedEncaveWineAction(extraction)
      const wineName = [extraction.domaine, extraction.cuvee, extraction.appellation].filter(Boolean).join(' ')
      setMessages((prev) => prev.map((message) =>
        message.id === loadingMsgId
          ? { ...message, text: `J'ai identifié ${wineName}. Voici la fiche :`, isLoading: false, wineAction }
          : message
      ))
    } catch (err) {
      console.error('[CeSoirModule] extract-wine error:', err)
      void callCelestin(text || 'Identifie ce vin', loadingMsgId, photo)
    } finally {
      setIsLoading(false)
      scrollToBottom()
    }
  }

  function handlePhotoOnlyFlow(photo: string, photoFile: File | null) {
    storedPhotoRef.current = { base64: photo, file: photoFile }
    setMessages((prev) => appendPhotoOnlyPromptMessages(prev, genMsgId, photo))
    scrollToBottom()
  }

  function handleChipClick(chipLabel: string) {
    if (isLoading) return

    const stored = storedPhotoRef.current
    if (stored && (chipLabel === 'Encaver' || chipLabel === 'Conseille-moi' || chipLabel === 'Carte des vins')) {
      storedPhotoRef.current = null
      if (chipLabel === 'Encaver' && stored.file) {
        handleExtractWineFlow('Encave cette bouteille', stored.base64, stored.file)
      } else {
        const query = queryForStoredPhotoChip(chipLabel)
        if (query) submitMessageWithImage(query, stored.base64)
      }
      return
    }

    if (chipLabel === 'Allons-y !' || chipLabel === 'Découvrir mon profil') {
      if (inlineQuestionnaire.handleChip(chipLabel)) return
      return
    }

    if (chipLabel === 'Pas maintenant') {
      if (inlineQuestionnaire.handleChip(chipLabel)) return
      return
    }

    if (chipLabel === 'Ouvrir une bouteille') {
      const cached = getCachedRecommendation(buildQueryKey('generic', null))
      const cachedCards = cached?.cards
      const cachedText = cached?.text

      if (cachedCards && cachedCards.length > 0) {
        setMessages((prev) => appendCachedRecommendationMessages(prev, genMsgId, chipLabel, cachedCards, cachedText ?? undefined))
        scrollToBottom()
      } else {
        setIsLoading(true)
        const loadingMsgId = genMsgId()
        setMessages((prev) => appendUserAndLoadingMessage(prev, genMsgId, loadingMsgId, { text: chipLabel }))
        scrollToBottom()
        void callCelestin('Qu\'est-ce que j\'ouvre ce soir ?', loadingMsgId)
      }
    } else if (chipLabel === 'Ajouter à ma cave') {
      setIsLoading(true)
      const loadingMsgId = genMsgId()
      setMessages((prev) => appendUserAndLoadingMessage(prev, genMsgId, loadingMsgId, { text: chipLabel }))
      scrollToBottom()
      void callCelestin('Je veux ajouter du vin à ma cave', loadingMsgId)
    } else if (chipLabel === 'Accord mets & vin') {
      setMessages((prev) => appendCelestinTextMessage(prev, genMsgId, chipLabel, 'Qu\'est-ce que tu prépares ?'))
      scrollToBottom()
    } else {
      submitMessage(chipLabel)
    }
  }

  async function handlePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const base64 = await fileToBase64(file)
      setPendingPhoto(base64)
      setPendingPhotoFile(file)
    } catch (err) {
      console.error('[CeSoirModule] photo resize error:', err)
    }
  }

  function handleWineValidate(action: WineActionData) {
    const { route, state } = buildWineActionNavigation(action)
    navigate(route, { state })
  }

  return {
    qProgress: inlineQuestionnaire.qProgress,
    threadRef,
    messages,
    expandedCard,
    onExpandedCardChange: setExpandedCard,
    pendingPhoto,
    onClearPendingPhoto: () => {
      setPendingPhoto(null)
      setPendingPhotoFile(null)
    },
    photoInputRef,
    onPhotoSelect: handlePhotoSelect,
    isQuestionnaireActive: inlineQuestionnaire.qActive,
    questionnaireInput: inlineQuestionnaire.renderInput(),
    queryInput,
    onQueryInputChange: setQueryInput,
    textareaRef,
    onQuerySubmit: handleQuerySubmit,
    isLoading,
    onWineValidate: handleWineValidate,
    onWineModify: handleWineValidate,
    onChipClick: handleChipClick,
  }
}
