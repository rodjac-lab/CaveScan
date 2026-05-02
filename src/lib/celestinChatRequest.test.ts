import { describe, expect, it } from 'vitest'
import {
  isObviousSocialMessage,
  resolveLegacyMemorySelectionProfile,
  shouldUseBackendManagedContext,
  shouldSkipLegacyMemoryRetrieval,
} from '@/lib/celestinChatRequest'

describe('celestinChatRequest routing guards', () => {
  it('skips legacy memory retrieval for obvious greetings, including one typo', () => {
    expect(isObviousSocialMessage('Salut, ca va?')).toBe(true)
    expect(isObviousSocialMessage('Slaut!')).toBe(true)
    expect(isObviousSocialMessage('Hello!')).toBe(true)
  })

  it('does not treat arbitrary short wine text as social greeting', () => {
    expect(isObviousSocialMessage('Selosse!')).toBe(false)
    expect(isObviousSocialMessage('Sancerre')).toBe(false)
  })

  it('lets Celestin tools handle exact tasting inventory questions', () => {
    expect(shouldSkipLegacyMemoryRetrieval('J ai combien de degustations de Champagne ?')).toBe(true)
    expect(shouldSkipLegacyMemoryRetrieval('Est-ce que j ai deja bu Caillez Lemaire ?')).toBe(true)
  })

  it('keeps specific tasting note lookups eligible for legacy memory evidence', () => {
    expect(shouldSkipLegacyMemoryRetrieval('Tu retrouves ma note sur le Caillez Lemaire ?')).toBe(false)
    expect(shouldSkipLegacyMemoryRetrieval('C etait comment le 2014 ?')).toBe(false)
  })

  it('does not infer recommendation memory profile from frontend lexical rules', () => {
    expect(resolveLegacyMemorySelectionProfile(null)).toBe('default')
    expect(resolveLegacyMemorySelectionProfile({ taskType: null })).toBe('default')
    expect(resolveLegacyMemorySelectionProfile({ taskType: 'cellar_lookup' })).toBe('default')
  })

  it('keeps recommendation memory profile for an active recommendation thread', () => {
    expect(resolveLegacyMemorySelectionProfile({ taskType: 'recommendation' })).toBe('recommendation')
  })

  it('uses backend-managed context only for low-risk legacy-source skips', () => {
    expect(shouldUseBackendManagedContext({ message: 'Salut' })).toBe(true)
    expect(shouldUseBackendManagedContext({ message: 'J ai combien de bouteilles en cave ?' })).toBe(true)
    expect(shouldUseBackendManagedContext({ message: 'J ai combien de degustations de Champagne ?' })).toBe(true)
    expect(shouldUseBackendManagedContext({
      message: 'J ai combien de degustations de Champagne ?',
      conversationState: { taskType: 'recommendation' },
    })).toBe(false)
    expect(shouldUseBackendManagedContext({ message: 'Que boire avec une pizza ?' })).toBe(false)
    expect(shouldUseBackendManagedContext({ message: 'Combien de bouteilles de Champagne ai-je ?' })).toBe(false)
  })
})
