import { useRef, useState, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { useBottles, useRecentlyDrunk } from '@/hooks/useBottles'
import { useTasteProfile } from '@/hooks/useTasteProfile'
import { serializeProfileForPrompt } from '@/lib/taste-profile'
import { rankCaveBottles } from '@/lib/recommendationRanking'
import { selectRelevantMemories, serializeMemoriesForPrompt } from '@/lib/tastingMemories'
import { getCachedRecommendation, buildQueryKey } from '@/lib/recommendationStore'
import { getSeason, getDayOfWeek, formatDrunkSummary, resolveBottleIds } from '@/lib/contextHelpers'
import type { RecommendationCard } from '@/lib/recommendationStore'
import type { WineColor, BottleVolumeOption } from '@/lib/types'

// --- Types ---

interface WineActionData {
  intent: 'encaver' | 'deguster'
  extraction: {
    domaine: string | null
    cuvee: string | null
    appellation: string | null
    millesime: number | null
    couleur: WineColor | null
    region: string | null
    quantity: number
    volume: BottleVolumeOption
    grape_varieties?: string[] | null
    serving_temperature?: string | null
    typical_aromas?: string[] | null
    food_pairings?: string[] | null
    character?: string | null
    purchase_price?: number | null
  }
  summary: string
}

interface ChatMessage {
  id: string
  role: 'celestin' | 'user'
  text: string
  cards?: RecommendationCard[]
  wineAction?: WineActionData
  isLoading?: boolean
  actionChips?: string[]
}

type CelestinUiAction =
  | { kind: 'show_recommendations'; payload: { cards: RecommendationCard[] } }
  | { kind: 'prepare_add_wine'; payload: { extraction: WineActionData['extraction'] } }
  | { kind: 'prepare_log_tasting'; payload: { extraction: WineActionData['extraction'] } }

interface CelestinResponse {
  message: string
  ui_action?: CelestinUiAction | null
  action_chips?: string[] | null
}

// --- Icons ---

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
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

const WELCOME_CHIPS: string[] = [
  'Ouvrir une bouteille',
  'Ajouter à ma cave',
  'Accord mets & vin',
]

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
  const hour = new Date().getHours()
  if (hour < 12) return 'Bonjour ! Comment puis-je t\'aider ?'
  if (hour < 18) return 'Bon après-midi ! Comment puis-je t\'aider ?'
  return 'Bonsoir ! Comment puis-je t\'aider ?'
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

function LoadingCardSkeleton({ index }: { index: number }) {
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
}

function RecommendationCardItem({ card, onTap }: { card: RecommendationCard; onTap: () => void }) {
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
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{card.appellation}</p>
          <p className="text-[12px] italic text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-3">
            {card.reason}
          </p>
        </div>
      </div>
    </div>
  )
}

// --- WineActionCard (extraction mode) ---

function WineActionCard({ action, onValidate, onModify }: {
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
}

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

function CelestinBubble({ message, onCardTap, onWineValidate, onWineModify, onChipClick }: {
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
            <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">Celestin</p>
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
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="bg-[var(--accent-bg)] border border-[var(--border-color)] rounded-[14px] rounded-tr-[4px] px-3.5 py-2.5 max-w-[80%]">
        <p className="text-[15px] text-[var(--text-primary)]">{message.text}</p>
      </div>
    </div>
  )
}

// --- Conversation persistence across tab switches ---
let persistedMessages: ChatMessage[] | null = null

// --- Cross-session memory (uses shared module) ---
import {
  saveCurrentSession as saveCrossSession,
  rotateSessions,
  loadPreviousSessions,
  serializePreviousSessionsForPrompt,
} from '@/lib/crossSessionMemory'

// --- Main Component ---

export default function CeSoirModule() {
  const navigate = useNavigate()

  // Data hooks
  const { bottles: caveBottles } = useBottles()
  const { bottles: drunkBottles } = useRecentlyDrunk()
  const { profile } = useTasteProfile()

  // Chat state — single source of truth, survives tab navigation
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (persistedMessages) return persistedMessages
    // New session: rotate previous → archive, current → previous
    rotateSessions()
    return [{ id: genMsgId(), role: 'celestin', text: buildGreeting(), actionChips: WELCOME_CHIPS }]
  })
  useEffect(() => {
    persistedMessages = messages
    saveCrossSession(messages)
  }, [messages])

  // Previous sessions context (loaded once)
  const previousSessionsRef = useRef(loadPreviousSessions())
  const [queryInput, setQueryInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedCard, setExpandedCard] = useState<RecommendationCard | null>(null)

  // Refs
  const threadRef = useRef<HTMLDivElement>(null)
  const caveRef = useRef(caveBottles)
  const drunkRef = useRef(drunkBottles)
  const profileRef = useRef(profile)
  caveRef.current = caveBottles
  drunkRef.current = drunkBottles
  profileRef.current = profile

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  // --- Build context for the edge function ---

  function buildRequestBody(message: string) {
    const cave = caveRef.current
    const drunk = drunkRef.current
    const prof = profileRef.current

    // Rank cave bottles locally for the LLM (send all, ranked by relevance to message)
    const ranked = rankCaveBottles('generic', message, cave, drunk, prof, cave.length)
    const caveSummary = ranked.map(({ bottle, score }) => ({
      id: bottle.id.substring(0, 8),
      domaine: bottle.domaine,
      appellation: bottle.appellation,
      millesime: bottle.millesime,
      couleur: bottle.couleur,
      cuvee: bottle.cuvee,
      quantity: bottle.quantity ?? 1,
      volume: bottle.volume_l ?? '0.75',
      local_score: Math.round(score * 100) / 100,
    }))

    // Build conversation history from messages, enriched with ui_action context
    // Exclude loading messages and the initial welcome greeting (index 0)
    const history = messages
      .filter((m, i) => !m.isLoading && !(i === 0 && m.role === 'celestin' && !m.cards && !m.wineAction))
      .map(m => {
        let text = m.text
        // Enrich Celestin messages with card summaries so LLM knows what it recommended
        if (m.role === 'celestin' && m.cards && m.cards.length > 0) {
          const cardList = m.cards.map((c, i) => `[${i + 1}] ${c.name} (${c.appellation})`).join(', ')
          text += `\n[Vins proposés : ${cardList}]`
        }
        if (m.role === 'celestin' && m.wineAction) {
          const ext = m.wineAction.extraction
          const wineName = [ext.domaine, ext.cuvee, ext.appellation].filter(Boolean).join(' ')
          text += `\n[Fiche ${m.wineAction.intent === 'encaver' ? 'encavage' : 'dégustation'} : ${wineName}]`
        }
        return {
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          text,
        }
      })

    // Profile
    const profileStr = prof ? serializeProfileForPrompt(prof) : undefined

    // Memories
    const memories = selectRelevantMemories('generic', message, drunk)
    const memoriesStr = serializeMemoriesForPrompt(memories) || undefined

    // Context
    const recentDrunk = drunk.slice(0, 5).map(formatDrunkSummary)
    const context = {
      dayOfWeek: getDayOfWeek(),
      season: getSeason(),
      recentDrunk: recentDrunk.length > 0 ? recentDrunk : undefined,
    }

    // Previous sessions summary (cross-session memory)
    const previousSession = serializePreviousSessionsForPrompt(previousSessionsRef.current)

    return {
      message,
      history,
      cave: caveSummary,
      profile: profileStr,
      memories: memoriesStr,
      context,
      previousSession,
    }
  }

  // --- Core submit handler ---

  async function callCelestin(message: string, loadingMsgId: string) {
    try {
      const body = buildRequestBody(message)
      const { data, error } = await supabase.functions.invoke('celestin', { body })

      if (error) throw error

      const response = data as CelestinResponse

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
    if (text.length < 2 || isLoading) return
    setQueryInput('')
    submitMessage(text)
  }

  // --- Chip handler (welcome chips + LLM dynamic chips) ---

  function handleChipClick(chipLabel: string) {
    if (isLoading) return

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

  // --- Wine action handlers ---

  function handleWineValidate(action: WineActionData) {
    const { quantity, volume, ...prefillExtraction } = action.extraction
    const route = action.intent === 'encaver' ? '/add' : '/remove'
    const state = action.intent === 'encaver'
      ? { prefillExtraction, prefillQuantity: quantity, prefillVolume: volume }
      : { prefillExtraction }
    navigate(route, { state })
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
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

      {/* Bottom bar */}
      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--background)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleQuerySubmit() }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute left-3 top-3 text-[var(--text-muted)]">
              <SearchIcon />
            </div>
            <textarea
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
              placeholder="Poulet rôti, envie de bulles..."
              enterKeyHint="send"
              rows={1}
              className="w-full min-h-[44px] rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-4 py-3 text-[14px] placeholder:text-[var(--text-muted)] placeholder:italic resize-none leading-tight"
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
