import { describe, expect, it } from 'vitest'
import {
  isObviousSocialMessage,
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
})
