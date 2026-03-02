import { useRef, useState, useEffect, useMemo, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useRecommendations } from '@/hooks/useRecommendations'
import type { RecommendationCard } from '@/lib/recommendationStore'
import { detectIntent, type ChatIntent } from '@/lib/intentDetection'
import { supabase } from '@/lib/supabase'
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
}

interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
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

// --- Constants ---

const PRIMARY_ACTIONS: Array<{ label: string; hint: string }> = [
  { label: 'Plus audacieux', hint: 'style plus audacieux, accords originaux' },
  { label: 'Plus classique', hint: 'style plus classique, valeur sure' },
  { label: 'Moins cher', hint: 'budget plus accessible, meilleur rapport qualite-prix' },
]

// --- Helpers (unchanged) ---

function buildRecommendationQuery(baseQuery: string | null, refinementHint: string | null): string | null {
  if (!baseQuery && !refinementHint) return null
  if (!baseQuery && refinementHint) return `Affinage sommelier: ${refinementHint}`
  if (!refinementHint) return baseQuery
  return `${baseQuery} | Contraintes: ${refinementHint}`
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
    case 'Decouverte': return 'bg-[var(--text-muted)]'
    default: return 'bg-[var(--accent)]'
  }
}

// --- Helpers (new) ---

function buildGreeting(): string {
  const hour = new Date().getHours()
  const day = new Date().toLocaleDateString('fr-FR', { weekday: 'long' })
  if (hour < 12) return `Bonjour ! C'est ${day}, qu'est-ce qui te ferait plaisir ce soir ?`
  if (hour < 18) return `Bon après-midi ! Envie de préparer quelque chose pour ce soir ?`
  return `Bonsoir ! Qu'est-ce qu'on ouvre ce soir ?`
}

function buildResponseText(query: string | null): string {
  if (query) return `Pour « ${query} », voici ce que je te recommande :`
  return `Voici mes suggestions pour ce soir :`
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

// --- WineActionCard (assistant mode) ---

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

function CelestinBubble({ message, onCardTap, onWineValidate, onWineModify }: {
  message: ChatMessage
  onCardTap: (card: RecommendationCard) => void
  onWineValidate?: (action: WineActionData) => void
  onWineModify?: (action: WineActionData) => void
}) {
  const hasCarousel = (message.cards && message.cards.length > 0) || message.isLoading

  return (
    <div>
      <div className="flex gap-2 items-start">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] flex items-center justify-center text-white mt-0.5">
          <SparkleIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-[14px] rounded-tl-[4px] px-3.5 py-2.5 inline-block max-w-full">
            <p className="font-serif italic text-[13px] text-[var(--text-primary)] leading-relaxed">
              {message.text}
            </p>
          </div>
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
        <p className="text-[13px] text-[var(--text-primary)]">{message.text}</p>
      </div>
    </div>
  )
}

// --- Main Component ---

export default function CeSoirModule() {
  const navigate = useNavigate()

  // Hook state — mode is always 'generic' (user intent is expressed via free text)
  const [queryInput, setQueryInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)
  const [activeRefinement, setActiveRefinement] = useState<string | null>(null)

  const refinementHint = useMemo(
    () => PRIMARY_ACTIONS.find((item) => item.label === activeRefinement)?.hint ?? activeRefinement,
    [activeRefinement]
  )

  const effectiveQuery = useMemo(
    () => buildRecommendationQuery(submittedQuery, refinementHint ?? null),
    [submittedQuery, refinementHint]
  )

  const { cards, loading, refreshing, error } = useRecommendations('generic', effectiveQuery)

  // Chat state
  const greeting = useMemo(() => buildGreeting(), [])
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: genMsgId(), role: 'celestin', text: greeting, isLoading: true }
  ])
  const [expandedCard, setExpandedCard] = useState<RecommendationCard | null>(null)

  // Assistant conversation state
  const conversationHistoryRef = useRef<ConversationTurn[]>([])
  const activeIntentRef = useRef<ChatIntent | null>(null)

  // Refs
  const threadRef = useRef<HTMLDivElement>(null)
  const isFirstLoad = useRef(true)

  // Auto-scroll to bottom of thread
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  // Reset assistant conversation state
  const resetAssistantConversation = useCallback(() => {
    conversationHistoryRef.current = []
    activeIntentRef.current = null
  }, [])

  // Helper: add user bubble + Celestin loading bubble in one batch
  function addLoadingResponse(userText: string, responseText: string) {
    setMessages(prev => {
      // Remove any existing loading bubbles (user changed their mind)
      const filtered = prev.filter(m => !m.isLoading)
      return [
        ...filtered,
        { id: genMsgId(), role: 'user' as const, text: userText },
        { id: genMsgId(), role: 'celestin' as const, text: responseText, isLoading: true },
      ]
    })
    scrollToBottom()
  }

  // Bridge: hook outputs → chat messages
  useEffect(() => {
    // First load: attach cards to greeting message
    if (isFirstLoad.current && !loading) {
      isFirstLoad.current = false
      setMessages(prev => prev.map((msg, i) =>
        i === 0
          ? { ...msg, cards: cards.length > 0 ? cards : undefined, isLoading: false }
          : msg
      ))
      scrollToBottom()
      return
    }

    // Still loading initial data
    if (isFirstLoad.current) return

    // When the hook has settled, replace any loading bubble with real cards
    if (!loading && !refreshing) {
      setMessages(prev => {
        const hasLoading = prev.some(m => m.isLoading)
        if (!hasLoading) return prev // no-op: avoids unnecessary re-render

        if (cards.length > 0) {
          return prev.map(m =>
            m.isLoading ? { ...m, cards, isLoading: false } : m
          )
        }
        if (error) {
          return prev.map(m =>
            m.isLoading
              ? { ...m, text: 'Le sommelier est momentanément indisponible. Réessaie dans quelques instants !', isLoading: false }
              : m
          )
        }
        return prev
      })
      scrollToBottom()
    }
  }, [cards, loading, refreshing, error, scrollToBottom])

  // --- Assistant handler ---

  async function handleAssistantSubmit(text: string, intent: 'encaver' | 'deguster') {
    // Add user bubble + loading bubble
    const loadingMsgId = genMsgId()
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isLoading)
      return [
        ...filtered,
        { id: genMsgId(), role: 'user' as const, text },
        { id: loadingMsgId, role: 'celestin' as const, text: 'Je regarde ça...' },
      ]
    })
    scrollToBottom()

    // Update conversation history
    conversationHistoryRef.current.push({ role: 'user', text })
    activeIntentRef.current = intent

    try {
      const { data, error: fnError } = await supabase.functions.invoke('celestin-assistant', {
        body: {
          message: text,
          history: conversationHistoryRef.current.slice(0, -1), // exclude current message (it's in `message`)
          intent,
        },
      })

      if (fnError) throw fnError

      const response = data as {
        type: 'extraction' | 'question'
        extraction?: WineActionData['extraction']
        question?: string
        summary?: string
      }

      if (response.type === 'question' && response.question) {
        // Celestin asks a follow-up question
        conversationHistoryRef.current.push({ role: 'assistant', text: response.question })
        setMessages(prev =>
          prev.map(m =>
            m.id === loadingMsgId
              ? { ...m, text: response.question! }
              : m
          )
        )
      } else if (response.type === 'extraction' && response.extraction) {
        // Celestin extracted wine data — show action card
        const summary = response.summary || 'Voici ce que j\'ai compris :'
        conversationHistoryRef.current.push({ role: 'assistant', text: summary })
        setMessages(prev =>
          prev.map(m =>
            m.id === loadingMsgId
              ? {
                  ...m,
                  text: summary,
                  wineAction: {
                    intent,
                    extraction: response.extraction!,
                    summary,
                  },
                }
              : m
          )
        )
      } else {
        // Unexpected response shape — show a generic error
        setMessages(prev =>
          prev.map(m =>
            m.id === loadingMsgId
              ? { ...m, text: "Désolé, je n'ai pas bien compris. Peux-tu reformuler ?" }
              : m
          )
        )
      }
    } catch (err) {
      console.error('Assistant error:', err)
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMsgId
            ? { ...m, text: "Désolé, je n'ai pas pu traiter ta demande. Réessaie !" }
            : m
        )
      )
    }

    scrollToBottom()
  }

  // --- Handlers ---

  function handleQuerySubmit() {
    const text = queryInput.trim()
    if (text.length < 2) return
    setQueryInput('')

    // If we're in an active assistant conversation, continue it
    const activeIntent = activeIntentRef.current
    if (conversationHistoryRef.current.length > 0 && (activeIntent === 'encaver' || activeIntent === 'deguster')) {
      void handleAssistantSubmit(text, activeIntent)
      return
    }

    // Detect intent
    const intent: ChatIntent = detectIntent(text)

    if (intent === 'encaver' || intent === 'deguster') {
      void handleAssistantSubmit(text, intent)
      return
    }

    // Sommelier flow (unchanged)
    if (text === submittedQuery) return // same query, skip
    const responseText = buildResponseText(text)
    addLoadingResponse(text, responseText)
    setSubmittedQuery(text)
    setActiveRefinement(null)
  }

  function toggleRefinement(label: string) {
    // Clicking a refinement chip resets assistant conversation
    resetAssistantConversation()
    const responseText = buildResponseText(submittedQuery)
    addLoadingResponse(label, responseText)
    setActiveRefinement(prev => prev === label ? null : label)
  }

  // --- Wine action handlers ---

  function handleWineValidate(action: WineActionData) {
    resetAssistantConversation()

    if (action.intent === 'encaver') {
      navigate('/add', {
        state: {
          prefillExtraction: {
            domaine: action.extraction.domaine,
            cuvee: action.extraction.cuvee,
            appellation: action.extraction.appellation,
            millesime: action.extraction.millesime,
            couleur: action.extraction.couleur,
            region: action.extraction.region,
            grape_varieties: action.extraction.grape_varieties,
            serving_temperature: action.extraction.serving_temperature,
            typical_aromas: action.extraction.typical_aromas,
            food_pairings: action.extraction.food_pairings,
            character: action.extraction.character,
          },
          prefillQuantity: action.extraction.quantity,
          prefillVolume: action.extraction.volume,
        },
      })
    } else {
      navigate('/remove', {
        state: {
          prefillExtraction: {
            domaine: action.extraction.domaine,
            cuvee: action.extraction.cuvee,
            appellation: action.extraction.appellation,
            millesime: action.extraction.millesime,
            couleur: action.extraction.couleur,
            region: action.extraction.region,
            grape_varieties: action.extraction.grape_varieties,
            serving_temperature: action.extraction.serving_temperature,
            typical_aromas: action.extraction.typical_aromas,
            food_pairings: action.extraction.food_pairings,
            character: action.extraction.character,
          },
        },
      })
    }
  }

  function handleWineModify(action: WineActionData) {
    // Same navigation but user lands on the form to edit
    handleWineValidate(action)
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-3 scrollbar-hide">
        <div className="space-y-4">
          {messages.map(msg =>
            msg.role === 'celestin' ? (
              <CelestinBubble
                key={msg.id}
                message={msg}
                onCardTap={setExpandedCard}
                onWineValidate={handleWineValidate}
                onWineModify={handleWineModify}
              />
            ) : (
              <UserBubble key={msg.id} message={msg} />
            )
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--background)] px-4 pt-2 pb-2">
        {/* Refinement chips */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
          {PRIMARY_ACTIONS.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={() => toggleRefinement(action.label)}
              className={`h-7 inline-flex items-center justify-center rounded-full px-3 text-[11px] leading-none font-medium border whitespace-nowrap transition-colors ${
                activeRefinement === action.label
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleQuerySubmit() }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <SearchIcon />
            </div>
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Poulet rôti, j'ai acheté du vin, envie de bulles..."
              enterKeyHint="send"
              className="w-full h-10 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] pl-9 pr-4 text-[13px] placeholder:text-[var(--text-muted)] placeholder:italic"
            />
          </div>
          <button
            type="submit"
            className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white shadow-sm"
          >
            <SendIcon />
          </button>
        </form>
      </div>

      {/* Expanded card dialog (unchanged) */}
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
