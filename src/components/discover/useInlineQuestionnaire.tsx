import { useEffect, useRef, useState } from 'react'
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
  type QuestionnaireProfile,
  type FWIScores,
  type SensoryPreferences,
} from '@/lib/questionnaire-profile'
import { track } from '@/lib/track'
import { FWISlider, SensoryChips, RegionChips } from './QuestionnaireWidgets'

type QPhase = 'seqA' | 'seqB' | 'seqC' | 'sensory' | 'done'

type ChatMessageLike = {
  id: string
  role: 'celestin' | 'user'
  text: string
  actionChips?: string[]
  isLoading?: boolean
  questionLabel?: string
  profileCard?: { fwi: FWIScores; sensory: SensoryPreferences; marketingProfile: string }
}

type SetMessages<T extends ChatMessageLike> = React.Dispatch<React.SetStateAction<T[]>>

interface UseInlineQuestionnaireArgs<T extends ChatMessageLike> {
  questionnaireLoading: boolean
  questionnaireProfile: QuestionnaireProfile | null
  saveQuestionnaireProfile: (profile: QuestionnaireProfile) => Promise<void>
  setMessages: SetMessages<T>
  scrollToBottom: () => void
  createMessageId: () => string
}

export function useInlineQuestionnaire<T extends ChatMessageLike>({
  questionnaireLoading,
  questionnaireProfile,
  saveQuestionnaireProfile,
  setMessages,
  scrollToBottom,
  createMessageId,
}: UseInlineQuestionnaireArgs<T>) {
  const [qActive, setQActive] = useState(false)
  const [qPhase, setQPhase] = useState<QPhase>('seqA')
  const [qIndex, setQIndex] = useState(0)
  const [qFwiAnswers, setQFwiAnswers] = useState<Record<string, number>>({})
  const [qSensoryAnswers, setQSensoryAnswers] = useState<Partial<SensoryPreferences>>({})
  const [qTyping, setQTyping] = useState(false)
  const qProposedRef = useRef(false)

  useEffect(() => {
    if (questionnaireLoading || questionnaireProfile || qProposedRef.current || qActive) return
    qProposedRef.current = true
    const dismissed = sessionStorage.getItem('questionnaire_dismissed')

    if (dismissed) {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.role === 'celestin' && m.actionChips && m.actionChips.length > 0)
        if (idx >= 0 && !prev[idx].actionChips!.includes('Découvrir mon profil')) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], actionChips: [...updated[idx].actionChips!, 'Découvrir mon profil'] }
          return updated
        }
        return prev
      })
      return
    }

    const timer = setTimeout(() => {
      setMessages((prev) => [...prev, {
        id: createMessageId(),
        role: 'celestin',
        text: 'J\'aimerais mieux te connaître — quelques questions rapides pour que mes recommandations soient vraiment adaptées à toi.',
        actionChips: ['Allons-y !', 'Pas maintenant'],
      } as T])
      scrollToBottom()
    }, 1500)

    return () => clearTimeout(timer)
  }, [createMessageId, qActive, questionnaireLoading, questionnaireProfile, scrollToBottom, setMessages])

  function addQMsg(text: string, extras?: Partial<T>, keepTyping = false): Promise<void> {
    return new Promise((resolve) => {
      const id = createMessageId()
      setQTyping(true)
      setMessages((prev) => [...prev, { id, role: 'celestin', text: '…', isLoading: true } as T])
      scrollToBottom()
      setTimeout(() => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text, isLoading: false, ...extras } : m)))
        if (!keepTyping) setQTyping(false)
        scrollToBottom()
        resolve()
      }, 500)
    })
  }

  function addQUserMsg(text: string) {
    setMessages((prev) => [
      ...prev.map((m) => (m.actionChips ? { ...m, actionChips: undefined } : m)),
      { id: createMessageId(), role: 'user', text } as T,
    ])
    scrollToBottom()
  }

  function getQLabel(phase: QPhase, index: number): string {
    if (phase === 'seqA' || phase === 'seqB' || phase === 'seqC') return `Question ${index + 1}/6`
    if (phase === 'sensory') return `Question ${index + 1}/7`
    return ''
  }

  async function startQSequence(phase: QPhase) {
    const intros: Record<'seqA' | 'seqB' | 'seqC' | 'sensory', string> = {
      seqA: 'Commençons par comment tu vis le moment de la dégustation...',
      seqB: 'Maintenant, parlons de ce que tu sais sur le vin...',
      seqC: 'Et enfin, ce que l\'origine d\'un vin représente pour toi...',
      sensory: 'Dernière étape — tes préférences de goût. Deux choix à chaque fois, tape sur celui qui te correspond le mieux.',
    }

    await addQMsg(intros[phase as keyof typeof intros], undefined, true)
    setQPhase(phase)
    setQIndex(0)

    const seqs: Record<'seqA' | 'seqB' | 'seqC', { text: string }[]> = { seqA: SEQUENCE_A, seqB: SEQUENCE_B, seqC: SEQUENCE_C }
    if (phase in seqs) {
      const typedPhase = phase as 'seqA' | 'seqB' | 'seqC'
      await addQMsg(seqs[typedPhase][0].text, { questionLabel: getQLabel(phase, 0) } as Partial<T>)
    } else {
      await addQMsg(SENSORY_QUESTIONS[0].text, { questionLabel: getQLabel(phase, 0) } as Partial<T>)
    }
  }

  async function startQuestionnaire() {
    setQActive(true)
    setQFwiAnswers({})
    setQSensoryAnswers({})
    await addQMsg('Je vais te proposer des affirmations — positionne-toi de 1 (pas du tout toi) à 5 (tout à fait toi). Simple et rapide.', undefined, true)
    await startQSequence('seqA')
  }

  function handleQFWIAnswer(value: number) {
    const seq = qPhase === 'seqA' ? SEQUENCE_A : qPhase === 'seqB' ? SEQUENCE_B : SEQUENCE_C
    const q = seq[qIndex]
    if (!q) return

    const labelMap: Record<number, string> = { 1: 'Pas du tout moi', 2: 'Plutôt pas moi', 3: 'Neutre', 4: 'Plutôt moi', 5: 'Tout à fait moi' }
    addQUserMsg(labelMap[value] ?? String(value))

    const newAnswers = { ...qFwiAnswers, [q.id]: value }
    setQFwiAnswers(newAnswers)

    const nextIdx = qIndex + 1
    if (nextIdx >= seq.length) {
      const score = seq.map((item) => newAnswers[item.id] ?? 3).reduce((a, b) => a + b, 0)
      const transitionFn = qPhase === 'seqA' ? getSequenceATransition : qPhase === 'seqB' ? getSequenceBTransition : getSequenceCTransition
      const nextPhase: QPhase = qPhase === 'seqA' ? 'seqB' : qPhase === 'seqB' ? 'seqC' : 'sensory'
      const continueText = nextPhase === 'sensory' ? ' Allez, dernière ligne droite !' : ' On enchaîne !'

      void addQMsg(transitionFn(score) + continueText, undefined, true).then(() => startQSequence(nextPhase))
      return
    }

    setQIndex(nextIdx)
    void addQMsg(seq[nextIdx].text, { questionLabel: getQLabel(qPhase, nextIdx) } as Partial<T>)
  }

  function finishQuestionnaire(finalSensory: Record<string, string>) {
    const fwi = computeFWIScores(qFwiAnswers)
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
    const description = buildProfileDescription(fwi, sensory)

    const qProfile: QuestionnaireProfile = {
      fwi,
      sensory,
      marketingProfile,
      completedAt: new Date().toISOString(),
      version: 1,
    }

    void addQMsg(description, { profileCard: { fwi, sensory, marketingProfile } } as Partial<T>).then(() => {
      setQActive(false)
      setQPhase('done')
      track('questionnaire_completed', { segment: fwi.segment, profile: marketingProfile })
      void saveQuestionnaireProfile(qProfile)
    })
  }

  function handleQSensoryAnswer(value: string) {
    const q = SENSORY_QUESTIONS[qIndex]
    if (!q) return

    const label = q.optionA.value === value ? q.optionA.label : q.optionB.label
    addQUserMsg(label)

    const newAnswers = { ...qSensoryAnswers, [q.field]: value }
    setQSensoryAnswers(newAnswers)

    const nextIdx = qIndex + 1
    if (nextIdx >= SENSORY_QUESTIONS.length) {
      finishQuestionnaire(newAnswers as Record<string, string>)
      return
    }

    setQIndex(nextIdx)
    void addQMsg(SENSORY_QUESTIONS[nextIdx].text, { questionLabel: getQLabel('sensory', nextIdx) } as Partial<T>)
  }

  function handleQRegionConfirm(regions: string[]) {
    const regionLabels = regions.map((r) => REGION_OPTIONS.find((ro) => ro.value === r)?.label ?? r)
    addQUserMsg(regionLabels.join(', '))

    const newAnswers = { ...qSensoryAnswers, regions }
    setQSensoryAnswers(newAnswers)

    const nextIdx = qIndex + 1
    if (nextIdx >= SENSORY_QUESTIONS.length) {
      finishQuestionnaire(newAnswers as Record<string, unknown> as Record<string, string>)
      return
    }

    setQIndex(nextIdx)
    void addQMsg(SENSORY_QUESTIONS[nextIdx].text, { questionLabel: getQLabel('sensory', nextIdx) } as Partial<T>)
  }

  function getQProgress(): { current: number; total: number } | null {
    if (!qActive || qPhase === 'done') return null
    if (qPhase === 'seqA') return { current: qIndex + 1, total: 18 }
    if (qPhase === 'seqB') return { current: 6 + qIndex + 1, total: 18 }
    if (qPhase === 'seqC') return { current: 12 + qIndex + 1, total: 18 }
    if (qPhase === 'sensory') return { current: qIndex + 1, total: 7 }
    return null
  }

  function renderInput() {
    if (qTyping) return null

    if (qPhase === 'seqA' || qPhase === 'seqB' || qPhase === 'seqC') {
      const seq = qPhase === 'seqA' ? SEQUENCE_A : qPhase === 'seqB' ? SEQUENCE_B : SEQUENCE_C
      const q = seq[qIndex]
      if (q) return <FWISlider key={q.id} onConfirm={handleQFWIAnswer} />
    }

    if (qPhase === 'sensory') {
      const q = SENSORY_QUESTIONS[qIndex]
      if (q) {
        if (q.multiSelect) return <RegionChips key={q.id} onConfirm={handleQRegionConfirm} />
        return <SensoryChips key={q.id} optionA={q.optionA} optionB={q.optionB} onSelect={handleQSensoryAnswer} />
      }
    }

    return null
  }

  function handleChip(chipLabel: string): boolean {
    if (chipLabel === 'Allons-y !' || chipLabel === 'Découvrir mon profil') {
      addQUserMsg(chipLabel)
      void startQuestionnaire()
      return true
    }

    if (chipLabel === 'Pas maintenant') {
      addQUserMsg('Pas maintenant')
      sessionStorage.setItem('questionnaire_dismissed', '1')
      void addQMsg('Pas de souci ! Tu pourras me demander quand tu voudras.')
      return true
    }

    return false
  }

  return {
    qActive,
    qProgress: getQProgress(),
    renderInput,
    startQuestionnaire,
    handleChip,
  }
}
