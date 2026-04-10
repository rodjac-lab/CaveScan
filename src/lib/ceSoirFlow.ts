import type { RecommendationCard } from '@/lib/recommendationStore'
import type { WineActionData } from '@/lib/celestinConversation'
import type { ChatMessage } from '@/lib/ceSoirChatTypes'

type CreateMessageId = () => string

export function clearActionChips(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => message.actionChips ? { ...message, actionChips: undefined } : message)
}

export function activeMessages(messages: ChatMessage[]): ChatMessage[] {
  return clearActionChips(messages.filter((message) => !message.isLoading))
}

export function appendUserAndLoadingMessage(
  messages: ChatMessage[],
  createMessageId: CreateMessageId,
  loadingMsgId: string,
  userMessage: Pick<ChatMessage, 'text' | 'image'>,
): ChatMessage[] {
  return [
    ...activeMessages(messages),
    { id: createMessageId(), role: 'user', ...userMessage },
    { id: loadingMsgId, role: 'celestin', text: '\u2026', isLoading: true },
  ]
}

export function appendUserMessage(
  messages: ChatMessage[],
  createMessageId: CreateMessageId,
  userMessage: Pick<ChatMessage, 'text' | 'image'>,
): ChatMessage[] {
  return [
    ...clearActionChips(messages),
    { id: createMessageId(), role: 'user', ...userMessage },
  ]
}

export function isQuestionnaireIntent(text: string): boolean {
  return /(?:profil|questionnaire|mieux.*conna[iî]tre|d[ée]couvrir.*profil)/i.test(text)
}

export function isEncavagePhotoIntent(text: string): boolean {
  return /encav|ajoute|stock|range|met.*cave/i.test(text)
}

export function queryForStoredPhotoChip(chipLabel: string): string | null {
  if (chipLabel === 'Carte des vins') return 'Lis cette carte des vins et recommande-moi quelque chose'
  if (chipLabel === 'Conseille-moi') return 'Conseille-moi sur cette photo'
  return null
}

export function appendPhotoOnlyPromptMessages(
  messages: ChatMessage[],
  createMessageId: CreateMessageId,
  photo: string,
): ChatMessage[] {
  return [
    ...activeMessages(messages),
    { id: createMessageId(), role: 'user', text: '', image: photo },
    {
      id: createMessageId(),
      role: 'celestin',
      text: 'Belle photo ! Qu\'est-ce que tu veux que j\'en fasse ?',
      actionChips: ['Encaver', 'Conseille-moi', 'Carte des vins'],
    },
  ]
}

export function appendCachedRecommendationMessages(
  messages: ChatMessage[],
  createMessageId: CreateMessageId,
  chipLabel: string,
  cards: RecommendationCard[],
  text?: string,
): ChatMessage[] {
  return [
    ...clearActionChips(messages),
    { id: createMessageId(), role: 'user', text: chipLabel },
    { id: createMessageId(), role: 'celestin', text: text || 'Voici mes suggestions\u00a0:', cards },
  ]
}

export function appendCelestinTextMessage(
  messages: ChatMessage[],
  createMessageId: CreateMessageId,
  userText: string,
  celestinText: string,
): ChatMessage[] {
  return [
    ...clearActionChips(messages),
    { id: createMessageId(), role: 'user', text: userText },
    { id: createMessageId(), role: 'celestin', text: celestinText },
  ]
}

export function buildWineActionNavigation(action: WineActionData) {
  const { quantity, volume, ...prefillExtraction } = action.extraction
  return action.intent === 'encaver'
    ? { route: '/add', state: { prefillExtraction, prefillQuantity: quantity, prefillVolume: volume } }
    : { route: '/remove', state: { prefillExtraction } }
}
