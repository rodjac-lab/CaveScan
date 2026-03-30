import { serializeProfileForPrompt } from '@/lib/taste-profile'
import { rankCaveBottles } from '@/lib/recommendationRanking'
import { selectRelevantMemories, serializeMemoriesForPrompt } from '@/lib/tastingMemories'
import { getSeason, getDayOfWeek, formatDrunkSummary, resolveBottleIds } from '@/lib/contextHelpers'
import { serializeQuestionnaireForPrompt, type QuestionnaireProfile } from '@/lib/questionnaire-profile'
import type { RecommendationCard } from '@/lib/recommendationStore'
import type { MemoryFact } from '@/lib/chatPersistence'
import type { ConversationMemorySummary } from '@/lib/crossSessionMemory'
import type { Bottle, BottleVolumeOption, TasteProfile, WineColor, WineExtraction } from '@/lib/types'

export interface WineActionData {
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

export interface CelestinChatMessage {
  id: string
  role: 'celestin' | 'user'
  text: string
  image?: string
  cards?: RecommendationCard[]
  wineAction?: WineActionData
  isLoading?: boolean
  actionChips?: string[]
}

export type CelestinUiAction =
  | { kind: 'show_recommendations'; payload: { cards: RecommendationCard[] } }
  | { kind: 'prepare_add_wine'; payload: { extraction: WineActionData['extraction'] } }
  | { kind: 'prepare_add_wines'; payload: { extractions: WineActionData['extraction'][] } }
  | { kind: 'prepare_log_tasting'; payload: { extraction: WineActionData['extraction'] } }

export interface CelestinResponse {
  message: string
  ui_action?: CelestinUiAction | null
  action_chips?: string[] | null
}

export function buildWelcomeChips(now = new Date()): string[] {
  const hour = now.getHours()
  const day = now.getDay()
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
  if (isFriday || isWeekend) {
    return ['Que boire ce soir ?', 'Accord mets & vin', 'Ouvrir une bouteille']
  }
  return ['Que boire ce soir ?', 'Accord mets & vin', 'Ajouter une bouteille']
}

export function buildGreeting(now = new Date()): string {
  const hour = now.getHours()
  const day = now.getDay()
  const month = now.getMonth()
  const isWeekend = day === 0 || day === 6
  const isFriday = day === 5

  const season = month >= 2 && month <= 4 ? 'printemps'
    : month >= 5 && month <= 7 ? 'été'
    : month >= 8 && month <= 10 ? 'automne'
    : 'hiver'

  if (hour < 11) {
    if (isWeekend) return 'Samedi matin, le moment idéal pour prévoir le dîner de ce soir.'
    if (isFriday) return 'Vendredi ! La semaine touche à sa fin, ça mérite une belle bouteille ce soir.'
    return season === 'hiver'
      ? 'Un matin d\'hiver, parfait pour penser aux plats qui réchauffent.'
      : 'La journée commence. On en reparle ce soir ?'
  }

  if (hour < 14) {
    if (isWeekend) return 'Le déjeuner du week-end, c\'est sacré. Tu as prévu quelque chose de bon ?'
    return 'Pause déjeuner. Envie d\'un accord pour ce midi ?'
  }

  if (hour < 17) {
    if (isWeekend) return 'L\'après-midi avance, le moment de penser au dîner approche.'
    return season === 'été'
      ? 'Après-midi d\'été, les rosés s\'impatientent.'
      : 'L\'après-midi file. On prépare la soirée ?'
  }

  if (hour < 20) {
    if (isFriday) return 'Vendredi soir, la cave t\'attend.'
    if (isWeekend) return 'Le soleil descend, l\'heure de choisir quelque chose de bien.'
    if (season === 'été') return 'Fin de journée, il fait encore bon. Bulles ou blanc frais ?'
    return 'La soirée commence. Envie de quelque chose en particulier ?'
  }

  if (season === 'hiver') return 'Soirée d\'hiver, il fait bon ouvrir quelque chose de réconfortant.'
  if (isWeekend) return 'La soirée s\'installe. Qu\'est-ce qui te ferait plaisir ?'
  return 'Bonne soirée. Un verre en tête ?'
}

export function volumeLabel(vol: string): string {
  if (vol === '0.375') return 'demi'
  if (vol === '1.5') return 'mag'
  return 'btl'
}

function buildHistory(messages: CelestinChatMessage[]) {
  const rawHistory = messages
    .filter((m, i) => !m.isLoading && !(i === 0 && m.role === 'celestin' && !m.cards && !m.wineAction))
    .map((m) => {
      let text = m.text || (m.image ? '(photo jointe)' : '')
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
        ...(m.image ? { image: m.image } : {}),
      }
    })

  const userImageIndices = rawHistory
    .map((t, i) => (t.role === 'user' && t.image ? i : -1))
    .filter((i) => i >= 0)
  const keepImageFrom = new Set(userImageIndices.slice(-2))

  return rawHistory.map((t, i) =>
    t.image && !keepImageFrom.has(i) ? { ...t, image: undefined } : t
  )
}

export function buildCelestinRequestBody(input: {
  message: string
  image?: string
  cave: Bottle[]
  drunk: Bottle[]
  profile: TasteProfile | null
  questionnaireProfile: QuestionnaireProfile | null
  messages: CelestinChatMessage[]
  previousSession?: string
  zones: string[]
  memoriesOverride?: string
  memoriesQuery?: string
  memoryEvidenceMode?: 'exact' | 'synthesis' | 'semantic'
  conversationState?: Record<string, unknown> | null
  memoryFacts?: string
  memoryFactsRaw?: MemoryFact[]
  retrievedConversation?: string
  previousSessionSummaries?: ConversationMemorySummary[]
}) {
  const ranked = rankCaveBottles('generic', input.message, input.cave, input.drunk, input.profile, input.cave.length)
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

  const profileStr = input.profile ? serializeProfileForPrompt(input.profile) : undefined
  const questionnaireStr = input.questionnaireProfile ? serializeQuestionnaireForPrompt(input.questionnaireProfile) : undefined
  const memoriesQuery = input.memoriesQuery ?? input.message
  const memoriesStr = input.memoriesOverride !== undefined
    ? (input.memoriesOverride || undefined)
    : (serializeMemoriesForPrompt(selectRelevantMemories('generic', memoriesQuery, input.drunk)) || undefined)
  const recentDrunk = input.drunk.slice(0, 5).map(formatDrunkSummary)

  return {
    message: input.message,
    history: buildHistory(input.messages),
    cave: caveSummary,
    profile: profileStr,
    questionnaireProfile: questionnaireStr,
    memories: memoriesStr,
    context: {
      dayOfWeek: getDayOfWeek(),
      season: getSeason(),
      recentDrunk: recentDrunk.length > 0 ? recentDrunk : undefined,
    },
    previousSession: input.previousSession,
    zones: input.zones.length > 0 ? input.zones : undefined,
    ...(input.memoryEvidenceMode ? { memoryEvidenceMode: input.memoryEvidenceMode } : {}),
    ...(input.conversationState ? { conversationState: input.conversationState } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.memoryFacts ? { memoryFacts: input.memoryFacts } : {}),
    ...(input.memoryFactsRaw && input.memoryFactsRaw.length > 0 ? { memoryFactsRaw: input.memoryFactsRaw } : {}),
    ...(input.retrievedConversation ? { retrievedConversation: input.retrievedConversation } : {}),
    ...(input.previousSessionSummaries && input.previousSessionSummaries.length > 0
      ? { previousSessionSummaries: input.previousSessionSummaries }
      : {}),
  }
}

export function buildEncaveWineAction(extraction: WineExtraction): WineActionData {
  return {
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
}

export function buildCelestinMessageUpdate(
  response: CelestinResponse,
  cave: Bottle[]
): {
  update: Partial<CelestinChatMessage>
  navigateToBatchAdd?: WineActionData['extraction'][]
} {
  const update: Partial<CelestinChatMessage> = { text: response.message, isLoading: false }

  if (response.action_chips && response.action_chips.length > 0) {
    update.actionChips = response.action_chips
  }

  if (response.ui_action?.kind === 'show_recommendations') {
    const resolvedCards = resolveBottleIds(response.ui_action.payload.cards, cave)
    if (resolvedCards.length > 0) {
      update.cards = resolvedCards
    }
  } else if (response.ui_action?.kind === 'prepare_add_wines' && response.ui_action.payload.extractions?.length > 0) {
    return { update, navigateToBatchAdd: response.ui_action.payload.extractions }
  } else if (
    (response.ui_action?.kind === 'prepare_add_wine' || response.ui_action?.kind === 'prepare_log_tasting') &&
    response.ui_action.payload.extraction
  ) {
    update.wineAction = {
      intent: response.ui_action.kind === 'prepare_add_wine' ? 'encaver' : 'deguster',
      extraction: response.ui_action.payload.extraction,
      summary: response.message,
    }
  }

  return { update }
}
