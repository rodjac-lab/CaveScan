import { useState, useEffect, useRef, useCallback, memo } from 'react'
import {
  SEQUENCE_A,
  SEQUENCE_B,
  SEQUENCE_C,
  SENSORY_QUESTIONS,
  REGION_OPTIONS,
  computeFWIScores,
  computeMarketingProfile,
  buildProfileDescription,
  getSequenceATransition,
  getSequenceBTransition,
  getSequenceCTransition,
  type FWIScores,
  type SensoryPreferences,
  type QuestionnaireProfile,
} from '@/lib/questionnaire-profile'
import { track } from '@/lib/track'

// --- Types ---

type FlowPhase =
  | 'intro'
  | 'dismissed'
  | 'seqA_intro'
  | 'seqA'
  | 'seqA_transition'
  | 'seqB_intro'
  | 'seqB'
  | 'seqB_transition'
  | 'seqC_intro'
  | 'seqC'
  | 'seqC_transition'
  | 'sensory_intro'
  | 'sensory'
  | 'result'

interface QuestionnaireMessage {
  id: string
  role: 'celestin' | 'user'
  text: string
}

interface QuestionnaireFlowProps {
  onComplete: (profile: QuestionnaireProfile) => void
  onDismiss: () => void
}

// --- Icons ---

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M8 0L9.5 5.5L15 7L9.5 8.5L8 14L6.5 8.5L1 7L6.5 5.5L8 0Z" />
    </svg>
  )
}

// --- Sub-components ---

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

const CelestinBubble = memo(function CelestinBubble({ text, isTyping }: { text: string; isTyping?: boolean }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] flex items-center justify-center text-white mt-0.5">
        <SparkleIcon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">Celestin</p>
        <p className="font-serif italic text-[15px] text-[var(--text-primary)] leading-relaxed">
          {isTyping ? <TypingDots /> : text}
        </p>
      </div>
    </div>
  )
})

const UserBubble = memo(function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-[var(--accent-bg)] border border-[var(--border-color)] rounded-[14px] rounded-tr-[4px] px-3.5 py-2.5 max-w-[80%]">
        <p className="text-[15px] text-[var(--text-primary)]">{text}</p>
      </div>
    </div>
  )
})

// --- FWI Slider ---

function FWISlider({ onConfirm }: { onConfirm: (value: number) => void }) {
  const [value, setValue] = useState(3)

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>Pas du tout moi</span>
        <span>Tout à fait moi</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="questionnaire-slider w-full"
        />
        <div className="flex justify-between px-[2px] mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`text-[11px] font-medium transition-colors ${
                n === value ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onConfirm(value)}
        className="w-full h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white text-[14px] font-semibold"
      >
        Confirmer
      </button>
    </div>
  )
}

// --- Sensory Chips (binary choice) ---

function SensoryChips({ optionA, optionB, onSelect }: {
  optionA: { label: string; value: string }
  optionB: { label: string; value: string }
  onSelect: (value: string) => void
}) {
  return (
    <div className="flex gap-3">
      {[optionA, optionB].map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className="flex-1 py-3 px-3 rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] active:bg-[var(--accent)] active:text-white active:border-[var(--accent)] transition-colors"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// --- Region Multi-Select ---

function RegionChips({ onConfirm }: { onConfirm: (regions: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([])

  function toggle(value: string) {
    if (value === 'explore_tout') {
      setSelected(['explore_tout'])
      return
    }
    setSelected(prev => {
      const without = prev.filter(v => v !== 'explore_tout')
      if (without.includes(value)) {
        return without.filter(v => v !== value)
      }
      if (without.length >= 3) return without
      return [...without, value]
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {REGION_OPTIONS.map((opt) => {
          const isSelected = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`py-2 px-3.5 rounded-full text-[13px] font-medium border transition-colors ${
                isSelected
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-color)]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          className="w-full h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white text-[14px] font-semibold"
        >
          Confirmer
        </button>
      )}
    </div>
  )
}

// --- Profile Result Card ---

function ProfileCard({ fwi, sensory, marketingProfile }: {
  fwi: FWIScores
  sensory: SensoryPreferences
  marketingProfile: string
}) {
  const sensoryLabels: Record<string, string> = {
    puissance: 'Puissant',
    elegance: 'Élégant',
    fruits_murs: 'Fruits mûrs',
    fruits_frais: 'Fruits frais',
    jeune: 'Jeune',
    tertiaire: 'Évolué',
    bois: 'Boisé',
    mineral: 'Minéral',
    tendu: 'Tendu',
    rond: 'Rond',
    valeurs_sures: 'Classique',
    decouverte: 'Explorateur',
  }

  const regionLabels = sensory.regions.map(r => REGION_OPTIONS.find(ro => ro.value === r)?.label ?? r)

  const tags = [
    sensoryLabels[sensory.structure],
    sensoryLabels[sensory.aromatique],
    sensoryLabels[sensory.evolution],
    sensoryLabels[sensory.elevage],
    sensoryLabels[sensory.acidite],
    sensoryLabels[sensory.neophilie],
    ...regionLabels,
  ].filter(Boolean)

  function GaugeBar({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = Math.min(100, (value / max) * 100)
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--text-secondary)] font-medium">{label}</span>
          <span className="text-[var(--text-muted)]">{value}/{max}</span>
        </div>
        <div className="h-[6px] rounded-full bg-[var(--border-color)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Profile name */}
        <h3 className="font-serif text-[20px] font-bold text-[var(--text-primary)] leading-tight">
          {marketingProfile}
        </h3>

        {/* FWI Gauges */}
        <div className="space-y-2.5">
          <GaugeBar label="Connoisseur" value={fwi.connoisseur} max={30} />
          <GaugeBar label="Knowledge" value={fwi.knowledge} max={30} />
          <GaugeBar label="Provenance" value={fwi.provenance} max={30} />
        </div>

        {/* Sensory tags */}
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full px-2.5 py-1 text-[11px] font-medium bg-[var(--accent)] text-white"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- ID generator ---
let nextId = 1
function genId(): string {
  return `q-${nextId++}`
}

// --- Main Component ---

export default function QuestionnaireFlow({ onComplete, onDismiss }: QuestionnaireFlowProps) {
  const [phase, setPhase] = useState<FlowPhase>('intro')
  const [messages, setMessages] = useState<QuestionnaireMessage[]>([])
  const [fwiAnswers, setFwiAnswers] = useState<Record<string, number>>({})
  const [sensoryAnswers, setSensoryAnswers] = useState<Partial<SensoryPreferences>>({})
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [resultProfile, setResultProfile] = useState<QuestionnaireProfile | null>(null)

  const threadRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  // Add a Célestin message with typing animation
  const addCelestinMessage = useCallback((text: string, delay = 600) => {
    return new Promise<void>((resolve) => {
      setIsTyping(true)
      setMessages(prev => [...prev, { id: genId(), role: 'celestin', text: '…' }])
      setTimeout(() => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], text }
          return updated
        })
        setIsTyping(false)
        resolve()
      }, delay)
    })
  }, [])

  const addUserMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: genId(), role: 'user', text }])
  }, [])

  // Scroll on messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom, isTyping])

  // --- Phase: Intro ---
  useEffect(() => {
    if (phase === 'intro' && messages.length === 0) {
      void addCelestinMessage(
        'Avant de commencer, j\'aimerais mieux te connaître — quelques questions pour que mes recommandations soient vraiment adaptées à toi. Ça prendra environ 5 minutes. On y va ?',
        800
      )
    }
  }, [phase, messages.length, addCelestinMessage])

  // --- Phase transitions with intro messages ---
  useEffect(() => {
    if (phase === 'seqA_intro') {
      void addCelestinMessage('Commençons par comment tu vis le moment de la dégustation...', 700).then(() => {
        setPhase('seqA')
        setCurrentQuestionIndex(0)
      })
    }
    if (phase === 'seqB_intro') {
      void addCelestinMessage('Maintenant, parlons de ce que tu sais sur le vin...', 700).then(() => {
        setPhase('seqB')
        setCurrentQuestionIndex(0)
      })
    }
    if (phase === 'seqC_intro') {
      void addCelestinMessage('Et enfin, ce que l\'origine d\'un vin représente pour toi...', 700).then(() => {
        setPhase('seqC')
        setCurrentQuestionIndex(0)
      })
    }
    if (phase === 'sensory_intro') {
      void addCelestinMessage('Dernière étape — tes préférences de goût. Deux choix à chaque fois, tu tapes sur celui qui te correspond le mieux.', 700).then(() => {
        setPhase('sensory')
        setCurrentQuestionIndex(0)
      })
    }
  }, [phase, addCelestinMessage])

  // --- Phase: Show current FWI question ---
  useEffect(() => {
    if ((phase === 'seqA' || phase === 'seqB' || phase === 'seqC') && !isTyping) {
      const seq = phase === 'seqA' ? SEQUENCE_A : phase === 'seqB' ? SEQUENCE_B : SEQUENCE_C
      const q = seq[currentQuestionIndex]
      if (q) {
        // Check if this question is already displayed
        const alreadyShown = messages.some(m => m.role === 'celestin' && m.text === q.text)
        if (!alreadyShown) {
          void addCelestinMessage(q.text, 500)
        }
      }
    }
  }, [phase, currentQuestionIndex, isTyping, messages, addCelestinMessage])

  // --- Phase: Show current sensory question ---
  useEffect(() => {
    if (phase === 'sensory' && !isTyping) {
      const q = SENSORY_QUESTIONS[currentQuestionIndex]
      if (q) {
        const alreadyShown = messages.some(m => m.role === 'celestin' && m.text === q.text)
        if (!alreadyShown) {
          void addCelestinMessage(q.text, 400)
        }
      }
    }
  }, [phase, currentQuestionIndex, isTyping, messages, addCelestinMessage])

  // --- FWI transition phases ---
  useEffect(() => {
    if (phase === 'seqA_transition') {
      const score = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].reduce((s, id) => s + (fwiAnswers[id] ?? 3), 0)
      void addCelestinMessage(getSequenceATransition(score), 800).then(() => {
        setPhase('seqB_intro')
      })
    }
    if (phase === 'seqB_transition') {
      const score = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].reduce((s, id) => s + (fwiAnswers[id] ?? 3), 0)
      void addCelestinMessage(getSequenceBTransition(score), 800).then(() => {
        setPhase('seqC_intro')
      })
    }
    if (phase === 'seqC_transition') {
      const score = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].reduce((s, id) => s + (fwiAnswers[id] ?? 3), 0)
      void addCelestinMessage(getSequenceCTransition(score), 800).then(() => {
        setPhase('sensory_intro')
      })
    }
  }, [phase, fwiAnswers, addCelestinMessage])

  // --- Handlers ---

  function handleIntroChoice(choice: 'go' | 'later') {
    if (choice === 'go') {
      addUserMessage('Allons-y !')
      setPhase('seqA_intro')
    } else {
      addUserMessage('Pas maintenant')
      void addCelestinMessage('Pas de souci. Je serai là quand tu seras prêt. Tu pourras relancer le questionnaire depuis les Réglages.', 600)
      setPhase('dismissed')
      onDismiss()
    }
  }

  function handleFWIAnswer(questionId: string, value: number) {
    const labelMap: Record<number, string> = { 1: 'Pas du tout moi', 2: 'Plutôt pas moi', 3: 'Neutre', 4: 'Plutôt moi', 5: 'Tout à fait moi' }
    addUserMessage(labelMap[value] ?? String(value))
    setFwiAnswers(prev => ({ ...prev, [questionId]: value }))

    const seq = phase === 'seqA' ? SEQUENCE_A : phase === 'seqB' ? SEQUENCE_B : SEQUENCE_C
    const nextIndex = currentQuestionIndex + 1

    if (nextIndex >= seq.length) {
      // End of sequence → transition
      if (phase === 'seqA') setPhase('seqA_transition')
      else if (phase === 'seqB') setPhase('seqB_transition')
      else setPhase('seqC_transition')
    } else {
      setCurrentQuestionIndex(nextIndex)
    }
  }

  function handleSensoryAnswer(value: string) {
    const q = SENSORY_QUESTIONS[currentQuestionIndex]
    if (!q) return

    // Find label for user bubble
    const label = q.optionA.value === value ? q.optionA.label : q.optionB.label
    addUserMessage(label)

    setSensoryAnswers(prev => ({ ...prev, [q.field]: value }))

    const nextIndex = currentQuestionIndex + 1
    if (nextIndex >= SENSORY_QUESTIONS.length) {
      // Compute final result
      finishQuestionnaire({ ...sensoryAnswers, [q.field]: value } as Record<string, string>)
    } else {
      setCurrentQuestionIndex(nextIndex)
    }
  }

  function handleRegionConfirm(regions: string[]) {
    const regionLabels = regions.map(r => REGION_OPTIONS.find(ro => ro.value === r)?.label ?? r)
    addUserMessage(regionLabels.join(', '))

    setSensoryAnswers(prev => ({ ...prev, regions }))

    const nextIndex = currentQuestionIndex + 1
    if (nextIndex >= SENSORY_QUESTIONS.length) {
      finishQuestionnaire({ ...sensoryAnswers, regions } as Record<string, unknown> as Record<string, string>)
    } else {
      setCurrentQuestionIndex(nextIndex)
    }
  }

  function finishQuestionnaire(finalSensory: Record<string, string>) {
    const fwi = computeFWIScores(fwiAnswers)
    const sensory: SensoryPreferences = {
      structure: (finalSensory.structure as SensoryPreferences['structure']) ?? 'elegance',
      aromatique: (finalSensory.aromatique as SensoryPreferences['aromatique']) ?? 'fruits_frais',
      evolution: (finalSensory.evolution as SensoryPreferences['evolution']) ?? 'jeune',
      elevage: (finalSensory.elevage as SensoryPreferences['elevage']) ?? 'mineral',
      acidite: (finalSensory.acidite as SensoryPreferences['acidite']) ?? 'tendu',
      regions: (finalSensory.regions as unknown as string[]) ?? [],
      neophilie: (finalSensory.neophilie as SensoryPreferences['neophilie']) ?? 'decouverte',
    }
    const marketingProfile = computeMarketingProfile(fwi, sensory)
    const description = buildProfileDescription(fwi, sensory, marketingProfile)

    const profile: QuestionnaireProfile = {
      fwi,
      sensory,
      marketingProfile,
      completedAt: new Date().toISOString(),
      version: 1,
    }

    setResultProfile(profile)

    void addCelestinMessage(description, 1000).then(() => {
      setPhase('result')
      track('questionnaire_completed', { segment: fwi.segment, profile: marketingProfile })
      onComplete(profile)
    })
  }

  // --- Render input area ---

  function renderInputArea() {
    // Intro chips
    if (phase === 'intro' && !isTyping && messages.length > 0 && messages[messages.length - 1].text !== '…') {
      return (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleIntroChoice('go')}
            className="flex-1 h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white text-[14px] font-semibold"
          >
            Allons-y !
          </button>
          <button
            type="button"
            onClick={() => handleIntroChoice('later')}
            className="flex-1 h-10 rounded-full border border-[var(--border-color)] text-[var(--text-secondary)] text-[14px] font-medium"
          >
            Pas maintenant
          </button>
        </div>
      )
    }

    // FWI Slider
    if ((phase === 'seqA' || phase === 'seqB' || phase === 'seqC') && !isTyping) {
      const seq = phase === 'seqA' ? SEQUENCE_A : phase === 'seqB' ? SEQUENCE_B : SEQUENCE_C
      const q = seq[currentQuestionIndex]
      if (q) {
        return <FWISlider key={q.id} onConfirm={(v) => handleFWIAnswer(q.id, v)} />
      }
    }

    // Sensory chips
    if (phase === 'sensory' && !isTyping) {
      const q = SENSORY_QUESTIONS[currentQuestionIndex]
      if (q) {
        if (q.multiSelect) {
          return <RegionChips key={q.id} onConfirm={handleRegionConfirm} />
        }
        return (
          <SensoryChips
            key={q.id}
            optionA={q.optionA}
            optionB={q.optionB}
            onSelect={handleSensoryAnswer}
          />
        )
      }
    }

    // Result — show profile card
    if (phase === 'result' && resultProfile) {
      return (
        <ProfileCard
          fwi={resultProfile.fwi}
          sensory={resultProfile.sensory}
          marketingProfile={resultProfile.marketingProfile}
        />
      )
    }

    return null
  }

  // --- Progress indicator ---
  function getProgress(): { current: number; total: number } | null {
    if (phase === 'seqA') return { current: currentQuestionIndex + 1, total: 18 }
    if (phase === 'seqB') return { current: 6 + currentQuestionIndex + 1, total: 18 }
    if (phase === 'seqC') return { current: 12 + currentQuestionIndex + 1, total: 18 }
    if (phase === 'sensory') return { current: currentQuestionIndex + 1, total: 7 }
    return null
  }

  const progress = getProgress()

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Progress bar */}
      {progress && (
        <div className="flex-shrink-0 px-6 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[3px] rounded-full bg-[var(--border-color)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {progress.current}/{progress.total}
            </span>
          </div>
        </div>
      )}

      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-3 scrollbar-hide">
        <div className="space-y-5">
          {messages.map(msg =>
            msg.role === 'celestin' ? (
              <CelestinBubble key={msg.id} text={msg.text} isTyping={msg.text === '…'} />
            ) : (
              <UserBubble key={msg.id} text={msg.text} />
            )
          )}
        </div>
      </div>

      {/* Input area — replaces text input during questionnaire */}
      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--background)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {renderInputArea()}
      </div>
    </div>
  )
}
