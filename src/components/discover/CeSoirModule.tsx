import { useRef, useState, useEffect, useCallback, memo, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { useTasteProfile } from '@/hooks/useTasteProfile'
import { useZones } from '@/hooks/useZones'
import { useQuestionnaireProfile } from '@/hooks/useQuestionnaireProfile'
import { buildMemoryEvidenceBundle, selectRelevantMemoriesAsync, serializeMemoriesForPrompt } from '@/lib/tastingMemories'
import { resolveBottleIds } from '@/lib/contextHelpers'
import { getCachedRecommendation, buildQueryKey } from '@/lib/recommendationStore'
import type { FWIScores, SensoryPreferences } from '@/lib/questionnaire-profile'
import type { RecommendationCard } from '@/lib/recommendationStore'
import { ProfileCard } from './QuestionnaireWidgets'
import { useInlineQuestionnaire } from './useInlineQuestionnaire'
import { fileToBase64 } from '@/lib/image'
import { extractWineFromFile } from '@/lib/wineExtractionService'
import {
  buildCelestinRequestBody,
  type CelestinChatMessage,
  type CelestinResponse,
  type WineActionData,
} from '@/lib/celestinConversation'
import {
  createSession,
  saveMessage as persistMessage,
  loadActiveMemoryFacts,
  extractInsights,
  searchRelevantSessions,
  loadSessionMessages,
  serializeConversationForPrompt,
  type MemoryFact,
} from '@/lib/chatPersistence'
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

function buildWelcomeChips(): string[] {
  const hour = new Date().getHours()
  const day = new Date().getDay()
  const isWeekend = day === 0 || day === 6
  const isFriday = day === 5

  if (hour < 11) {
    return ['Accord mets & vin', 'Ajouter une bouteille', 'Parle-moi d\'un cépage']
  }
  if (hour < 14) {
    return ['Accord pour ce midi', 'Que boire avec mon plat ?', 'Ajouter une bouteille']
  }
  if (hour < 17) {
    return ['Préparer le dîner', 'Ajouter une bouteille', 'Accord mets & vin']
  }
  // 17h+
  if (isFriday || isWeekend) {
    return ['Que boire ce soir ?', 'Accord mets & vin', 'Ouvrir une bouteille']
  }
  return ['Que boire ce soir ?', 'Accord mets & vin', 'Ajouter une bouteille']
}

// --- Helpers ---

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

function buildGreeting(): string {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay() // 0=dim, 6=sam
  const month = now.getMonth()
  const isWeekend = day === 0 || day === 6
  const isFriday = day === 5

  // Saison
  const season = month >= 2 && month <= 4 ? 'printemps'
    : month >= 5 && month <= 7 ? 'été'
    : month >= 8 && month <= 10 ? 'automne'
    : 'hiver'

  // Matin (avant 11h)
  if (hour < 11) {
    if (isWeekend) return 'Samedi matin, le moment idéal pour prévoir le dîner de ce soir.'
    if (isFriday) return 'Vendredi ! La semaine touche à sa fin, ça mérite une belle bouteille ce soir.'
    return season === 'hiver'
      ? 'Un matin d\'hiver, parfait pour penser aux plats qui réchauffent.'
      : 'La journée commence. On en reparle ce soir ?'
  }

  // Midi (11h-14h)
  if (hour < 14) {
    if (isWeekend) return 'Le déjeuner du week-end, c\'est sacré. Tu as prévu quelque chose de bon ?'
    return 'Pause déjeuner. Envie d\'un accord pour ce midi ?'
  }

  // Après-midi (14h-17h)
  if (hour < 17) {
    if (isWeekend) return 'L\'après-midi avance, le moment de penser au dîner approche.'
    return season === 'été'
      ? 'Après-midi d\'été, les rosés s\'impatientent.'
      : 'L\'après-midi file. On prépare la soirée ?'
  }

  // Apéro (17h-20h)
  if (hour < 20) {
    if (isFriday) return 'Vendredi soir, la cave t\'attend.'
    if (isWeekend) return 'Le soleil descend, l\'heure de choisir quelque chose de bien.'
    if (season === 'été') return 'Fin de journée, il fait encore bon. Bulles ou blanc frais ?'
    return 'La soirée commence. Envie de quelque chose en particulier ?'
  }

  // Soir (20h+)
  if (season === 'hiver') return 'Soirée d\'hiver, il fait bon ouvrir quelque chose de réconfortant.'
  if (isWeekend) return 'La soirée s\'installe. Qu\'est-ce qui te ferait plaisir ?'
  return 'Bonne soirée. Un verre en tête ?'
}

function volumeLabel(vol: string): string {
  if (vol === '0.375') return 'demi'
  if (vol === '1.5') return 'mag'
  return 'btl'
}

let nextMsgId = 1
function genMsgId(): string {
  return `msg-${nextMsgId++}`
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
  const qtyLabel = `${ext.quantity} × ${volumeLabel(ext.volume)}`

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
    return [{ id: genMsgId(), role: 'celestin', text: buildGreeting(), actionChips: buildWelcomeChips() }]
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

  function buildTranscriptSnapshot(
    pendingUserMessage: string,
    assistantMessage?: string,
  ): Array<{ role: string; content: string }> {
    const nextTurns = messagesRef.current
      .filter(m => !m.isLoading && m.text.length > 1)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'celestin', content: m.text }))

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

  function buildRequestBody(
    message: string,
    image?: string,
    memoriesOverride?: string,
    retrievedConversation?: string,
    memoriesQuery?: string,
    memoryEvidenceMode?: 'exact' | 'synthesis' | 'semantic',
  ) {
    return buildCelestinRequestBody({
      message,
      image,
      cave: caveRef.current,
      drunk: drunkRef.current,
      profile: profileRef.current,
      questionnaireProfile: questionnaireProfileRef.current,
      messages: messagesRef.current,
      previousSession: previousSessionContextRef.current,
      previousSessionSummaries: previousSessionSummariesRef.current,
      zones: zones.map((z) => z.name),
      memoriesOverride,
      memoriesQuery,
      memoryEvidenceMode,
      conversationState: persistedConversationState,
      memoryFacts: memoryFactsRef.current,
      memoryFactsRaw: memoryFactsRawRef.current,
      retrievedConversation,
    })
  }

  // --- Core submit handler ---

  // Patterns that indicate user is referencing a past conversation
  const PAST_REFERENCE_PATTERN = /(?:tu te souviens|la derni[eè]re fois|on avait parl[eé]|on avait bu|c'[eé]tait quoi le vin|tu m'avais (?:dit|recommand|conseill)|la fois o[uù]|dej[aà] discut)/i

  async function callCelestin(message: string, loadingMsgId: string, image?: string) {
    try {
      // Persist user message (fire-and-forget)
      persistMessage(sessionIdRef.current, 'user', message, { hasImage: !!image })

      const memoryMessages = messagesRef.current
        .filter((entry) => !entry.isLoading && entry.text.trim().length > 0)
        .map((entry) => ({ role: entry.role, text: entry.text }))

      const memoryEvidence = await buildMemoryEvidenceBundle({
        query: message,
        recentMessages: memoryMessages,
        drunkBottles: drunkRef.current,
      })

      const memoryQuery = memoryEvidence?.planningQuery ?? message

      // Try async semantic memory search, then fall back to sync keyword matching inside buildRequestBody
      let memoriesOverride: string | undefined = memoryEvidence?.serialized || undefined
      if (!memoriesOverride) {
        try {
          const asyncMemories = await selectRelevantMemoriesAsync('generic', memoryQuery, drunkRef.current)
          if (asyncMemories.length > 0) {
            memoriesOverride = serializeMemoriesForPrompt(asyncMemories) || undefined
          }
        } catch {
        // Semantic search failed — buildRequestBody will use keyword fallback
      }
      }

      // Retrieve past conversation if user references one
      let retrievedConversation: string | undefined
      if (PAST_REFERENCE_PATTERN.test(message)) {
        try {
          const sessions = await searchRelevantSessions(memoryQuery, 1)
          if (sessions.length > 0) {
            const msgs = await loadSessionMessages(sessions[0].id)
            if (msgs.length > 0) {
              retrievedConversation = serializeConversationForPrompt(msgs, sessions[0].started_at)
            }
          }
        } catch {
          // Retrieval failed — continue without it
        }
      }

      const body = buildRequestBody(
        message,
        image,
        memoryEvidence?.serialized || memoriesOverride,
        retrievedConversation,
        memoryQuery,
        memoryEvidence?.mode,
      )
      const { data, error } = await supabase.functions.invoke('celestin', { body })

      if (error) throw error

      const fullResponse = data as CelestinResponse & { _nextState?: Record<string, unknown> }
      const response = fullResponse

      // Update conversation state from backend
      if (fullResponse?._nextState) {
        persistedConversationState = fullResponse._nextState
      }

      // Resolve bottle IDs (short → full)
      const resolvedCards = response.ui_action?.kind === 'show_recommendations'
        ? resolveBottleIds(response.ui_action.payload.cards, caveRef.current)
        : undefined

      // Build the update for the loading bubble
      const update: Partial<ChatMessage> = { text: response.message, isLoading: false }

      // Dynamic chips from LLM
      if (response.action_chips && response.action_chips.length > 0) {
        update.actionChips = response.action_chips
      }

      if (response.ui_action?.kind === 'show_recommendations' && resolvedCards && resolvedCards.length > 0) {
        update.cards = resolvedCards
      } else if (response.ui_action?.kind === 'prepare_add_wines' && response.ui_action.payload.extractions?.length > 0) {
        // Batch add — navigate directly to AddBottle with batch extractions
        setMessages(prev => prev.map(m => m.id === loadingMsgId ? { ...m, ...update } : m))
        setIsLoading(false)
        scrollToBottom()
        navigate('/add', { state: { prefillBatchExtractions: response.ui_action.payload.extractions } })
        return
      } else if (
        (response.ui_action?.kind === 'prepare_add_wine' || response.ui_action?.kind === 'prepare_log_tasting')
        && response.ui_action.payload.extraction
      ) {
        update.wineAction = {
          intent: response.ui_action.kind === 'prepare_add_wine' ? 'encaver' : 'deguster',
          extraction: response.ui_action.payload.extraction,
          summary: response.message,
        }
      }

      setMessages(prev => prev.map(m => m.id === loadingMsgId ? { ...m, ...update } : m))

      // Persist Celestin response (fire-and-forget)
      const debugInfo = (fullResponse as unknown as Record<string, unknown>)?._debug as
        Record<string, unknown> | undefined
      persistMessage(sessionIdRef.current, 'celestin', response.message, {
        uiActionKind: response.ui_action?.kind,
        cognitiveMode: debugInfo?.cognitiveMode as string | undefined,
      })

      // Trigger insight extraction every 4 user turns
      userTurnCountRef.current++
      if (userTurnCountRef.current >= 4) {
        userTurnCountRef.current = 0
        const recentMessages = buildTranscriptSnapshot(message, response.message)
        void extractInsights(sessionIdRef.current, recentMessages, memoryFactsRawRef.current)
          .then(syncActiveMemoryFacts)
      }
    } catch (err) {
      console.error('[CeSoirModule] celestin error:', err)
      let debugMessage = err instanceof Error ? err.message : String(err)

      const maybeContext = (err as { context?: Response } | null)?.context
      if (maybeContext instanceof Response) {
        try {
          const raw = await maybeContext.text()
          debugMessage = `HTTP ${maybeContext.status}${raw ? `: ${raw}` : ''}`
        } catch {
          debugMessage = `HTTP ${maybeContext.status}`
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === loadingMsgId
          ? { ...m, text: `Debug Celestin UI: ${debugMessage}`, isLoading: false }
          : m
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
      const wineAction: WineActionData = {
        intent: 'encaver',
        extraction: {
          domaine: extraction.domaine,
          cuvee: extraction.cuvee,
          appellation: extraction.appellation,
          millesime: extraction.millesime,
          couleur: extraction.couleur,
          region: extraction.region,
          quantity: 1,
          volume: '0.75',
          grape_varieties: extraction.grape_varieties,
          serving_temperature: extraction.serving_temperature,
          typical_aromas: extraction.typical_aromas,
          food_pairings: extraction.food_pairings,
          character: extraction.character,
        },
        summary: [extraction.domaine, extraction.cuvee, extraction.appellation].filter(Boolean).join(' — '),
      }

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
