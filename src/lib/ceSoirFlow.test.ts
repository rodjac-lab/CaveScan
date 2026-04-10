import { describe, expect, it } from 'vitest'
import {
  appendCachedRecommendationMessages,
  appendCelestinTextMessage,
  appendPhotoOnlyPromptMessages,
  appendUserAndLoadingMessage,
  buildWineActionNavigation,
  clearActionChips,
  isEncavagePhotoIntent,
  isQuestionnaireIntent,
  queryForStoredPhotoChip,
} from '@/lib/ceSoirFlow'
import type { ChatMessage } from '@/lib/ceSoirChatTypes'
import type { RecommendationCard } from '@/lib/recommendationStore'
import type { WineActionData } from '@/lib/celestinConversation'

function ids() {
  let next = 1
  return () => `id-${next++}`
}

describe('ceSoirFlow', () => {
  it('clears action chips without changing other message content', () => {
    const messages = [
      { id: '1', role: 'celestin', text: 'Salut', actionChips: ['A'] },
      { id: '2', role: 'user', text: 'Ok' },
    ] as ChatMessage[]

    expect(clearActionChips(messages)).toEqual([
      { id: '1', role: 'celestin', text: 'Salut', actionChips: undefined },
      { id: '2', role: 'user', text: 'Ok' },
    ])
  })

  it('appends user and loading messages after removing stale loading entries', () => {
    const messages = [
      { id: 'old', role: 'celestin', text: '...', isLoading: true },
      { id: 'chip', role: 'celestin', text: 'Choisis', actionChips: ['A'] },
    ] as ChatMessage[]

    expect(appendUserAndLoadingMessage(messages, ids(), 'loading', { text: 'Poulet rôti' })).toEqual([
      { id: 'chip', role: 'celestin', text: 'Choisis', actionChips: undefined },
      { id: 'id-1', role: 'user', text: 'Poulet rôti' },
      { id: 'loading', role: 'celestin', text: '\u2026', isLoading: true },
    ])
  })

  it('detects questionnaire and encavage intents', () => {
    expect(isQuestionnaireIntent('Je veux faire le questionnaire')).toBe(true)
    expect(isQuestionnaireIntent('Poulet rôti')).toBe(false)
    expect(isEncavagePhotoIntent('Encave cette bouteille')).toBe(true)
    expect(isEncavagePhotoIntent('Lis cette carte')).toBe(false)
  })

  it('maps stored photo chips to follow-up prompts', () => {
    expect(queryForStoredPhotoChip('Carte des vins')).toBe('Lis cette carte des vins et recommande-moi quelque chose')
    expect(queryForStoredPhotoChip('Conseille-moi')).toBe('Conseille-moi sur cette photo')
    expect(queryForStoredPhotoChip('Encaver')).toBeNull()
  })

  it('builds the photo-only prompt exchange', () => {
    const result = appendPhotoOnlyPromptMessages([], ids(), 'base64')

    expect(result).toEqual([
      { id: 'id-1', role: 'user', text: '', image: 'base64' },
      {
        id: 'id-2',
        role: 'celestin',
        text: 'Belle photo ! Qu\'est-ce que tu veux que j\'en fasse ?',
        actionChips: ['Encaver', 'Conseille-moi', 'Carte des vins'],
      },
    ])
  })

  it('builds cached recommendation and simple text exchanges', () => {
    const card = { bottle_id: 'b1', name: 'Rayas', badge: 'De ta cave' } as RecommendationCard

    expect(appendCachedRecommendationMessages([], ids(), 'Ouvrir une bouteille', [card])).toEqual([
      { id: 'id-1', role: 'user', text: 'Ouvrir une bouteille' },
      { id: 'id-2', role: 'celestin', text: 'Voici mes suggestions\u00a0:', cards: [card] },
    ])

    expect(appendCelestinTextMessage([], ids(), 'Accord mets & vin', 'Qu\'est-ce que tu prépares ?')).toEqual([
      { id: 'id-1', role: 'user', text: 'Accord mets & vin' },
      { id: 'id-2', role: 'celestin', text: 'Qu\'est-ce que tu prépares ?' },
    ])
  })

  it('builds navigation state for wine actions', () => {
    const action = {
      intent: 'encaver',
      extraction: {
        domaine: 'Rayas',
        quantity: 2,
        volume: '0.75',
      },
    } as WineActionData

    expect(buildWineActionNavigation(action)).toEqual({
      route: '/add',
      state: {
        prefillExtraction: { domaine: 'Rayas' },
        prefillQuantity: 2,
        prefillVolume: '0.75',
      },
    })
  })
})
