import { useRef, useState, useEffect, useCallback, memo, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { useTasteProfile } from '@/hooks/useTasteProfile'
import { useZones } from '@/hooks/useZones'
import { useQuestionnaireProfile } from '@/hooks/useQuestionnaireProfile'
import { getCachedRecommendation, buildQueryKey } from '@/lib/recommendationStore'
import type { FWIScores, SensoryPreferences } from '@/lib/questionnaire-profile'
import type { RecommendationCard } from '@/lib/recommendationStore'
import { ProfileCard } from './QuestionnaireWidgets'
import { useInlineQuestionnaire } from './useInlineQuestionnaire'
import { fileToBase64 } from '@/lib/image'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import {
  buildCelestinMessageUpdate as buildSharedCelestinMessageUpdate,
  buildEncaveWineAction as buildSharedEncaveWineAction,
  buildGreeting as buildSharedGreeting,
  buildWelcomeChips as buildSharedWelcomeChips,
  type CelestinChatMessage,
  type WineActionData,
  volumeLabel as formatSharedVolumeLabel,
} from '@/lib/celestinConversation'
import {
  createSession,
  saveMessage as persistMessage,
  loadActiveMemoryFacts,
  extractInsights,
  type MemoryFact,
} from '@/lib/chatPersistence'
import {
  buildTranscriptSnapshot as buildSharedTranscriptSnapshot,
  extractCelestinErrorMessage,
  invokeCelestin,
  prepareCelestinRequest,
} from '@/lib/celestinChatRequest'
import { serializeMemoryFactsForPrompt } from '@/lib/memoryFactsSerializer'

// --- Types ---

interface ChatMessage extends CelestinChatMessage {
  actionChips?: string[]
  profileCard?: { fwi: FWIScores; sensory: SensoryPreferences; marketingProfile: string }
  questionLabel?: string
}

// --- Icons ---

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M8 0L9.5 5.5L15 7L9.5 8.5L8 14L6.5 8.5L1 7L6.5 5.5L8 0Z" />
    </svg>
  )
}

// --- Typing indicator ---

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 0.15, 0.3].map((delay, i) => (
        <span
          key={i}
          className="typing-dot w-[5px] h-[5px] rounded-full bg-[var(--text-muted)]"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}

// --- Constants ---

let nextMsgId = 1
function genMsgId(): string {
  return `msg-${nextMsgId++}`
}

function colorToBarClass(color: string | null | undefined): string {
  switch (color) {
    case 'rouge': return 'bg-[var(--red-wine)]'
    case 'blanc': return 'bg-[var(--white-wine)]'
    case 'rose': return 'bg-[var(--rose-wine)]'
    case 'bulles': return 'bg-[var(--champagne)]'
    default: return 'bg-[var(--accent)]'
  }
}

function badgeToClass(badge: string): string {
  switch (badge) {
    case 'De ta cave': return 'bg-[var(--accent)]'
    case 'Accord parfait': return 'bg-[var(--red-wine)]'
    case 'Audacieux': return 'bg-[var(--champagne)]'
    case 'Découverte': return 'bg-[var(--text-muted)]'
    default: return 'bg-[var(--accent)]'
  }
}


// --- Card sub-components ---

const TAP_THRESHOLD = 10

const LoadingCardSkeleton = memo(function LoadingCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="flex-shrink-0 w-[220px] h-[188px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden animate-pulse"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex h-full">
        <div className="w-[4px] bg-[var(--border-color)]" />
        <div className="flex-1 p-3">
          <div className="h-4 w-20 rounded-full bg-[var(--border-color)] mb-2" />
          <div className="h-4 w-4/5 rounded bg-[var(--border-color)] mb-2" />
          <div className="h-3 w-2/5 rounded bg-[var(--border-color)] mb-3" />
          <div className="h-3 w-full rounded bg-[var(--border-color)] mb-1.5" />
          <div className="h-3 w-5/6 rounded bg-[var(--border-color)]" />
        </div>
      </div>
    </div>
  )
})

const RecommendationCardItem = memo(function RecommendationCardItem({ card, onTap }: { card: RecommendationCard; onTap: () => void }) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  function handlePointerDown(e: ReactPointerEvent) {
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }

  function handlePointerUp(e: ReactPointerEvent) {
    if (!pointerStart.current) return
    const dx = Math.abs(e.clientX - pointerStart.current.x)
    const dy = Math.abs(e.clientY - pointerStart.current.y)
    pointerStart.current = null
    if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
      onTap()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onKeyDown={(e) => { if (e.key === 'Enter') onTap() }}
      className="flex-shrink-0 w-[220px] h-[188px] rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden cursor-pointer select-none"
    >
      <div className="flex h-full">
        <div className={`w-[4px] ${colorToBarClass(card.color)}`} />
        <div className="flex-1 p-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${badgeToClass(card.badge)} mb-2`}>
            {card.badge}
          </span>
          <p className="font-serif text-[15px] font-bold text-[var(--text-primary)] leading-tight">
            {card.name}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{[card.appellation, card.millesime].filter(Boolean).join(' · ')}</p>
          <p className="text-[12px] italic text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-3">
            {card.reason}
          </p>
        </div>
      </div>
    </div>
  )
})

// --- WineActionCard (extraction mode) ---

const WineActionCard = memo(function WineActionCard({ action, onValidate, onModify }: {
  action: WineActionData
  onValidate: () => void
  onModify: () => void
}) {
  const ext = action.extraction
  const wineName = [ext.domaine, ext.cuvee].filter(Boolean).join(' — ') || ext.appellation || 'Vin'
  const details = [ext.appellation, ext.millesime?.toString()].filter(Boolean).join(' ')
  const qtyLabel = `${ext.quantity} × ${formatSharedVolumeLabel(ext.volume)}`

  return (
    <div className="mt-2 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden">
      <div className="flex">
        <div className={`w-[4px] flex-shrink-0 ${colorToBarClass(ext.couleur)}`} />
        <div className="flex-1 p-3">
          <p className="font-serif text-[15px] font-bold text-[var(--text-primary)] leading-tight">
            {wineName}
          </p>
          {details && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{details}</p>
          )}
          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{qtyLabel}</p>

          {ext.character && (
            <p className="text-[11px] italic text-[var(--text-secondary)] mt-2 leading-relaxed">
              {ext.character}
            </p>
          )}

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onValidate}
              className="flex-1 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white text-[12px] font-semibold"
            >
              {action.intent === 'encaver' ? 'Valider' : 'Créer la fiche'}
            </button>
            <button
              type="button"
              onClick={onModify}
              className="flex-1 h-8 rounded-full border border-[var(--border-color)] text-[var(--text-secondary)] text-[12px] font-medium"
            >
              Modifier
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

// --- Chat sub-components ---

function ChatCarousel({ cards, isLoading, onCardTap }: {
  cards?: RecommendationCard[]
  isLoading?: boolean
  onCardTap: (card: RecommendationCard) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const items = cards ?? []

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    function handleScroll() {
      const cardWidth = 220 + 12
      const index = Math.round(node!.scrollLeft / cardWidth)
      setActiveIndex(Math.min(index, Math.max(items.length - 1, 0)))
    }
    node.addEventListener('scroll', handleScroll, { passive: true })
    return () => node.removeEventListener('scroll', handleScroll)
  }, [items.length])

  return (
    <div className="mt-2 -mx-6 px-6">
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide">
        {isLoading ? (
          <>
            <LoadingCardSkeleton index={0} />
            <LoadingCardSkeleton index={1} />
            <LoadingCardSkeleton index={2} />
          </>
        ) : (
          items.map((card, i) => (
            <RecommendationCardItem
              key={card.bottle_id ?? `reco-${i}`}
              card={card}
              onTap={() => onCardTap(card)}
            />
          ))
        )}
      </div>
      {!isLoading && items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {items.map((card, i) => (
            <div
              key={card.bottle_id ?? `dot-${i}`}
              className={`transition-all duration-200 ${
                i === activeIndex ? 'discover-dot-active' : 'discover-dot-inactive'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const CelestinBubble = memo(function CelestinBubble({ message, onCardTap, onWineValidate, onWineModify, onChipClick }: {
  message: ChatMessage
  onCardTap: (card: RecommendationCard) => void
  onWineValidate?: (action: WineActionData) => void
  onWineModify?: (action: WineActionData) => void
  onChipClick?: (chip: string) => void
}) {
  const hasCarousel = message.cards && message.cards.length > 0

  return (
    <div>
      <div className="flex gap-2 items-start">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] flex items-center justify-center text-white mt-0.5">
          <SparkleIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="max-w-full">
            <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
              Celestin{message.questionLabel && <span className="text-[var(--accent)]"> · {message.questionLabel}</span>}
            </p>
            <p className="font-serif italic text-[15px] text-[var(--text-primary)] leading-relaxed">
              {message.isLoading ? <TypingDots /> : message.text}
            </p>
          </div>
          {message.actionChips && message.actionChips.length > 0 && onChipClick && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.actionChips.map((chip, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChipClick(chip)}
                  className="h-8 inline-flex items-center rounded-full px-3.5 text-[13px] leading-none font-medium border bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          {message.wineAction && onWineValidate && onWineModify && (
            <WineActionCard
              action={message.wineAction}
              onValidate={() => onWineValidate(message.wineAction!)}
              onModify={() => onWineModify(message.wineAction!)}
            />
          )}
          {message.profileCard && (
            <ProfileCard
              fwi={message.profileCard.fwi}
              sensory={message.profileCard.sensory}
              marketingProfile={message.profileCard.marketingProfile}
            />
          )}
        </div>
      </div>
      {hasCarousel && (
        <ChatCarousel
          cards={message.cards}
          isLoading={message.isLoading}
          onCardTap={onCardTap}
        />
      )}
    </div>
  )
})

const UserBubble = memo(function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="bg-[var(--accent-bg)] border border-[var(--border-color)] rounded-[14px] rounded-tr-[4px] px-3.5 py-2.5 max-w-[80%]">
        {message.image && (
          <img
            src={`data:image/jpeg;base64,${message.image}`}
            alt=""
            className="max-h-40 rounded-lg mb-2"
          />
        )}
        {message.text && <p className="text-[15px] text-[var(--text-primary)]">{message.text}</p>}
      </div>
    </div>
  )
})

// --- Conversation persistence across tab switches ---
let persistedMessages: ChatMessage[] | null = null
let persistedConversationState: Record<string, unknown> | null = null

// --- Cross-session memory (uses shared module) ---
import {
  saveCurrentSession as saveCrossSession,
  rotateSessions,
  loadPreviousSessions,
  loadPreviousSessionsFromSupabase,
  loadPreviousSessionSummariesFromSupabase,
  getLocalPreviousSessionSummaries,
  serializePreviousSessionsForPrompt,
  type ConversationMemorySummary,
} from '@/lib/crossSessionMemory'

// --- Main Component ---

export default function CeSoirModule() {
  const navigate = useNavigate()

  // Data hooks
  const { bottles: caveBottles } = useBottles()
  const { bottles: drunkBottles } = useRecentlyDrunk()
  const { profile } = useTasteProfile()
  const { zones } = useZones()
  const { profile: questionnaireProfile, loading: questionnaireLoading, saveProfile: saveQuestionnaireProfile } = useQuestionnaireProfile()

  const questionnaireProfileRef = useRef(questionnaireProfile)
  questionnaireProfileRef.current = questionnaireProfile

  // Chat state — single source of truth, survives tab navigation
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (persistedMessages) return persistedMessages
    // New session: rotate previous → archive, current → previous
    rotateSessions()
    return [{ id: genMsgId(), role: 'celestin', text: buildSharedGreeting(), actionChips: buildSharedWelcomeChips() }]
  })
  useEffect(() => {
    persistedMessages = messages
    saveCrossSession(messages)
  }, [messages])
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Previous sessions context: local fallback immediately, Supabase summaries when ready
  const previousSessionContextRef = useRef<string | undefined>(
    serializePreviousSessionsForPrompt(loadPreviousSessions())
  )
  const previousSessionSummariesRef = useRef<ConversationMemorySummary[]>(
    getLocalPreviousSessionSummaries()
  )
  const [queryInput, setQueryInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedCard, setExpandedCard] = useState<RecommendationCard | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null) // base64
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Refs
  const threadRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const storedPhotoRef = useRef<{ base64: string; file: File | null } | null>(null)
  const caveRef = useRef(caveBottles)
  const drunkRef = useRef(drunkBottles)
  const profileRef = useRef(profile)
  caveRef.current = caveBottles
  drunkRef.current = drunkBottles
  profileRef.current = profile

  // Chat persistence (Supabase)
  const sessionIdRef = useRef<string | null>(null)
  const userTurnCountRef = useRef(0)
  const memoryFactsRef = useRef<string | undefined>(undefined)
  const memoryFactsRawRef = useRef<MemoryFact[]>([])

  // Initialize session + load memory facts on mount
  // Extract insights on unmount (user leaves chat tab or closes app)
  useEffect(() => {
    createSession().then(id => { sessionIdRef.current = id })
    loadActiveMemoryFacts().then(facts => {
      memoryFactsRawRef.current = facts
      memoryFactsRef.current = serializeMemoryFactsForPrompt(facts)
    })
    loadPreviousSessionsFromSupabase().then(context => {
      if (context) {
        previousSessionContextRef.current = context
      }
    })
    loadPreviousSessionSummariesFromSupabase().then(summaries => {
      if (summaries.length > 0) {
        previousSessionSummariesRef.current = summaries
      }
    })

    return () => {
      // Trigger extraction for any unprocessed messages when leaving the chat
      if (sessionIdRef.current && userTurnCountRef.current > 0) {
        const recent = (messagesRef.current ?? [])
          .filter(m => !m.isLoading && m.text.length > 1)
          .slice(-12)
          .map(m => ({ role: m.role === 'user' ? 'user' : 'celestin', content: m.text }))
        if (recent.length >= 2) {
          void extractInsights(sessionIdRef.current, recent, memoryFactsRawRef.current)
          }
      }
    }
  }, [])

  // Auto-scroll to bottom
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

  // --- Build context for the edge function ---

  function syncActiveMemoryFacts(facts: MemoryFact[]) {
    memoryFactsRawRef.current = facts
    memoryFactsRef.current = serializeMemoryFactsForPrompt(facts)
  }

  async function callCelestin(message: string, loadingMsgId: string, image?: string) {
    try {
      persistMessage(sessionIdRef.current, 'user', message, { hasImage: !!image })

      const body = await prepareCelestinRequest({
        message,
        image,
        cave: caveRef.current,
        drunk: drunkRef.current,
        profile: profileRef.current,
        questionnaireProfile: questionnaireProfileRef.current,
        messages: messagesRef.current,
        previousSession: previousSessionContextRef.current,
        previousSessionSummaries: previousSessionSummariesRef.current,
        zones: zones.map((zone) => zone.name),
        conversationState: persistedConversationState,
        memoryFacts: memoryFactsRef.current,
        memoryFactsRaw: memoryFactsRawRef.current,
      })

      const fullResponse = await invokeCelestin(body)
      const response = fullResponse

      if (fullResponse?._nextState) {
        persistedConversationState = fullResponse._nextState
      }

      const { update, navigateToBatchAdd } = buildSharedCelestinMessageUpdate(response, caveRef.current)

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
        const recentMessages = buildSharedTranscriptSnapshot(messagesRef.current, message, response.message)
        void extractInsights(sessionIdRef.current, recentMessages, memoryFactsRawRef.current)
          .then(syncActiveMemoryFacts)
      }
    } catch (err) {
      console.error('[CeSoirModule] celestin error:', err)
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
  }
  function submitMessage(text: string) {
    setIsLoading(true)
    const loadingMsgId = genMsgId()
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isLoading)
      return [
        ...filtered.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user' as const, text },
        { id: loadingMsgId, role: 'celestin' as const, text: '\u2026', isLoading: true },
      ]
    })
    scrollToBottom()
    void callCelestin(text, loadingMsgId)
  }

  function handleQuerySubmit() {
    const text = queryInput.trim()
    const photo = pendingPhoto
    const photoFile = pendingPhotoFile

    // Allow submit with photo only (no text required)
    if (!photo && text.length < 2) return
    if (isLoading) return

    setQueryInput('')
    setPendingPhoto(null)
    setPendingPhotoFile(null)
    if (textareaRef.current) textareaRef.current.style.height = ''

    // Detect questionnaire request in natural language
    if (!photo && !questionnaireProfile && !inlineQuestionnaire.qActive && /(?:profil|questionnaire|mieux.*conna[iî]tre|d[ée]couvrir.*profil)/i.test(text)) {
      setMessages(prev => [
        ...prev.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user', text },
      ])
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
    const isEncavage = /encav|ajoute|stock|range|met.*cave/i.test(text)

    if (text && isEncavage && photoFile) {
      // Flow extract-wine (encavage photo)
      handleExtractWineFlow(text, photo, photoFile)
    } else if (text) {
      // Flow celestin multimodal (photo + texte)
      submitMessageWithImage(text, photo)
    } else {
      // Flow "Celestin demande" (photo seule sans texte)
      handlePhotoOnlyFlow(photo, photoFile)
    }
  }

  function submitMessageWithImage(text: string, image: string) {
    setIsLoading(true)
    const loadingMsgId = genMsgId()
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isLoading)
      return [
        ...filtered.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user' as const, text, image },
        { id: loadingMsgId, role: 'celestin' as const, text: '\u2026', isLoading: true },
      ]
    })
    scrollToBottom()
    void callCelestin(text, loadingMsgId, image)
  }

  async function handleExtractWineFlow(text: string, photo: string, photoFile: File) {
    setIsLoading(true)
    const loadingMsgId = genMsgId()
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isLoading)
      return [
        ...filtered.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user' as const, text, image: photo },
        { id: loadingMsgId, role: 'celestin' as const, text: '\u2026', isLoading: true },
      ]
    })
    scrollToBottom()

    try {
      const parsed = await extractWineFromFile(photoFile)
      const extraction = parsed.bottles[0]
      const wineAction: WineActionData = buildSharedEncaveWineAction(extraction)
      const wineName = [extraction.domaine, extraction.cuvee, extraction.appellation].filter(Boolean).join(' ')
      setMessages(prev => prev.map(m =>
        m.id === loadingMsgId
          ? { ...m, text: `J'ai identifié ${wineName}. Voici la fiche :`, isLoading: false, wineAction }
          : m
      ))
    } catch (err) {
      console.error('[CeSoirModule] extract-wine error:', err)
      // Fallback: send to Celestin multimodal
      void callCelestin(text || 'Identifie ce vin', loadingMsgId, photo)
    } finally {
      setIsLoading(false)
      scrollToBottom()
    }
  }

  function handlePhotoOnlyFlow(photo: string, photoFile: File | null) {
    // Store photo in a ref so chip handlers can access it
    storedPhotoRef.current = { base64: photo, file: photoFile }

    setMessages(prev => {
      const filtered = prev.filter(m => !m.isLoading)
      return [
        ...filtered.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user' as const, text: '', image: photo },
        {
          id: genMsgId(), role: 'celestin' as const,
          text: 'Belle photo ! Qu\'est-ce que tu veux que j\'en fasse ?',
          actionChips: ['Encaver', 'Conseille-moi', 'Carte des vins'],
        },
      ]
    })
    scrollToBottom()
  }

  // --- Chip handler (welcome chips + LLM dynamic chips + questionnaire chips) ---

  function handleChipClick(chipLabel: string) {
    if (isLoading) return

    // Photo-specific chips (from handlePhotoOnlyFlow)
    const stored = storedPhotoRef.current
    if (stored && (chipLabel === 'Encaver' || chipLabel === 'Conseille-moi' || chipLabel === 'Carte des vins')) {
      storedPhotoRef.current = null // consume once
      if (chipLabel === 'Encaver' && stored.file) {
        handleExtractWineFlow('Encave cette bouteille', stored.base64, stored.file)
      } else {
        const query = chipLabel === 'Carte des vins'
          ? 'Lis cette carte des vins et recommande-moi quelque chose'
          : 'Conseille-moi sur cette photo'
        submitMessageWithImage(query, stored.base64)
      }
      return
    }

    // Questionnaire chips
    if (chipLabel === 'Allons-y !' || chipLabel === 'Découvrir mon profil') {
      if (inlineQuestionnaire.handleChip(chipLabel)) return
      return
    }

    if (chipLabel === 'Pas maintenant') {
      if (inlineQuestionnaire.handleChip(chipLabel)) return
      return
    }

    if (chipLabel === 'Ouvrir une bouteille') {
      // Try to show prefetched cards immediately
      const cached = getCachedRecommendation(buildQueryKey('generic', null))
      const cachedCards = cached?.cards
      const cachedText = cached?.text

      if (cachedCards && cachedCards.length > 0) {
        setMessages(prev => [
          ...prev.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
          { id: genMsgId(), role: 'user' as const, text: chipLabel },
          { id: genMsgId(), role: 'celestin' as const, text: cachedText || 'Voici mes suggestions\u00a0:', cards: cachedCards },
        ])
        scrollToBottom()
      } else {
        // No cache — ask Celestin
        setIsLoading(true)
        const loadingMsgId = genMsgId()
        setMessages(prev => [
          ...prev.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
          { id: genMsgId(), role: 'user' as const, text: chipLabel },
          { id: loadingMsgId, role: 'celestin' as const, text: '\u2026', isLoading: true },
        ])
        scrollToBottom()
        void callCelestin('Qu\'est-ce que j\'ouvre ce soir ?', loadingMsgId)
      }
    } else if (chipLabel === 'Ajouter à ma cave') {
      setIsLoading(true)
      const loadingMsgId = genMsgId()
      setMessages(prev => [
        ...prev.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user' as const, text: chipLabel },
        { id: loadingMsgId, role: 'celestin' as const, text: '\u2026', isLoading: true },
      ])
      scrollToBottom()
      void callCelestin('Je veux ajouter du vin à ma cave', loadingMsgId)
    } else if (chipLabel === 'Accord mets & vin') {
      setMessages(prev => [
        ...prev.map(m => m.actionChips ? { ...m, actionChips: undefined } : m),
        { id: genMsgId(), role: 'user' as const, text: chipLabel },
        { id: genMsgId(), role: 'celestin' as const, text: 'Qu\'est-ce que tu prépares ?' },
      ])
      scrollToBottom()
    } else {
      // LLM dynamic chips → treat as user message
      submitMessage(chipLabel)
    }
  }

  // --- Photo handler ---

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const base64 = await fileToBase64(file)
      setPendingPhoto(base64)
      setPendingPhotoFile(file)
    } catch (err) {
      console.error('[CeSoirModule] photo resize error:', err)
    }
  }

  // --- Wine action handlers ---

  function handleWineValidate(action: WineActionData) {
    const { quantity, volume, ...prefillExtraction } = action.extraction
    const route = action.intent === 'encaver' ? '/add' : '/remove'
    const state = action.intent === 'encaver'
      ? { prefillExtraction, prefillQuantity: quantity, prefillVolume: volume }
      : { prefillExtraction }
    navigate(route, { state })
  }

  // --- Progress bar ---
  const qProgress = inlineQuestionnaire.qProgress

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Questionnaire progress bar */}
      {qProgress && (
        <div className="flex-shrink-0 px-6 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[3px] rounded-full bg-[var(--border-color)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-300"
                style={{ width: `${(qProgress.current / qProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {qProgress.current}/{qProgress.total}
            </span>
          </div>
        </div>
      )}

      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-3 scrollbar-hide">
        <div className="space-y-5">
          {messages.map(msg =>
            msg.role === 'celestin' ? (
              <CelestinBubble
                key={msg.id}
                message={msg}
                onCardTap={setExpandedCard}
                onWineValidate={handleWineValidate}
                onWineModify={handleWineValidate}
                onChipClick={handleChipClick}
              />
            ) : (
              <UserBubble key={msg.id} message={msg} />
            )
          )}
        </div>
      </div>

      {/* Hidden file input for photo */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoSelect}
        className="hidden"
      />

      {/* Bottom bar */}
      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--background)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {inlineQuestionnaire.qActive ? (
          <div className="pt-1 pb-1">
            {inlineQuestionnaire.renderInput()}
          </div>
        ) : (
          <div>
            {/* Photo preview */}
            {pendingPhoto && (
              <div className="relative inline-block mb-2 ml-1">
                <img
                  src={`data:image/jpeg;base64,${pendingPhoto}`}
                  alt="Preview"
                  className="h-20 rounded-lg border border-[var(--border-color)]"
                />
                <button
                  type="button"
                  onClick={() => { setPendingPhoto(null); setPendingPhotoFile(null) }}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--background)] shadow-sm"
                >
                  <XIcon />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); handleQuerySubmit() }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isLoading}
                  className="absolute left-2.5 top-2.5 h-7 w-7 flex items-center justify-center rounded-full bg-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                >
                  <PlusIcon />
                </button>
                <textarea
                  ref={textareaRef}
                  value={queryInput}
                  onChange={(e) => {
                    setQueryInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleQuerySubmit()
                    }
                  }}
                  placeholder={pendingPhoto ? "Décris ce que tu veux faire..." : "Poulet rôti, envie de bulles..."}
                  enterKeyHint="send"
                  rows={1}
                  className="w-full min-h-[44px] rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-card)] pl-11 pr-4 py-3 text-[14px] placeholder:text-[var(--text-muted)] placeholder:italic resize-none leading-tight overflow-hidden"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-shrink-0 h-11 w-11 flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white shadow-sm disabled:opacity-50"
              >
                <SendIcon />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Expanded card dialog */}
      <Dialog open={!!expandedCard} onOpenChange={() => setExpandedCard(null)}>
        <DialogContent className="max-w-[340px] rounded-[var(--radius)] p-0 overflow-hidden">
          {expandedCard && (
            <div className="flex">
              <div className={`w-[5px] flex-shrink-0 ${colorToBarClass(expandedCard.color)}`} />
              <div className="flex-1 p-5">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white ${badgeToClass(expandedCard.badge)} mb-3`}>
                  {expandedCard.badge}
                </span>
                <p className="font-serif text-[20px] font-bold text-[var(--text-primary)] leading-tight">
                  {expandedCard.name}
                </p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">{expandedCard.appellation}</p>
                <p className="text-[13px] italic text-[var(--text-secondary)] mt-3 leading-relaxed">
                  {expandedCard.reason}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

