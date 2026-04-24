import { describe, expect, it } from 'vitest'
import {
  applyPatchToMarkdown,
  countBulletsInSection,
} from '../../shared/celestin/profile-patch.ts'

const BASE_MARKDOWN = `## Profil gustatif
- Aime les blancs tendus de Loire
- Apprécie les rouges italiens jeunes et fruités

## Moments marquants
- Barolo 2018 sur un osso bucco à Rome, moment parfait

## Explorations en cours
- Découvre le Jura

## Entourage et partages
- Son beau-père amateur de Bourgogne

## Contexte et intentions
- Veut étoffer sa cave en Nebbiolo

## Style de conversation
- Préfère un ton direct, sans jargon`

describe('applyPatchToMarkdown', () => {
  it('returns unchanged markdown for no_change', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, { action: 'no_change' })
    expect(result.changed).toBe(false)
    expect(result.markdown).toBe(BASE_MARKDOWN)
  })

  it('adds a bullet to the target section', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'add',
      section: 'moments_marquants',
      content: 'A adoré le Sangiovese de Montevertine 2019',
    })
    expect(result.changed).toBe(true)
    expect(result.markdown).toContain('- A adoré le Sangiovese de Montevertine 2019')
    expect(countBulletsInSection(result.markdown, 'moments_marquants')).toBe(2)
  })

  it('prepends a dash when content has none', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'add',
      section: 'profil_gustatif',
      content: 'Évite les vins trop boisés',
    })
    expect(result.markdown).toContain('- Évite les vins trop boisés')
  })

  it('rejects duplicates silently', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'add',
      section: 'profil_gustatif',
      content: 'Aime les blancs tendus de Loire',
    })
    expect(result.changed).toBe(false)
    expect(result.error).toBe('Duplicate bullet')
  })

  it('edits an existing bullet by content match', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'edit',
      section: 'explorations_en_cours',
      previous_content: 'Découvre le Jura',
      content: 'Explore le Jura et commence à aimer les vins de voile',
    })
    expect(result.changed).toBe(true)
    expect(result.markdown).toContain('- Explore le Jura et commence à aimer les vins de voile')
    expect(result.markdown).not.toContain('- Découvre le Jura\n')
  })

  it('removes a bullet by content match', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'remove',
      section: 'profil_gustatif',
      previous_content: 'Apprécie les rouges italiens jeunes et fruités',
    })
    expect(result.changed).toBe(true)
    expect(result.markdown).not.toContain('rouges italiens jeunes et fruités')
    expect(countBulletsInSection(result.markdown, 'profil_gustatif')).toBe(1)
  })

  it('errors when previous_content does not match', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'edit',
      section: 'moments_marquants',
      previous_content: 'Something that does not exist',
      content: 'Replacement',
    })
    expect(result.changed).toBe(false)
    expect(result.error).toBe('Previous bullet not found')
  })

  it('preserves section order and headings after a patch', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'add',
      section: 'style_de_conversation',
      content: 'Aime comprendre les arbitrages',
    })
    const headingsInOrder = [
      '## Profil gustatif',
      '## Moments marquants',
      '## Explorations en cours',
      '## Entourage et partages',
      '## Contexte et intentions',
      '## Style de conversation',
    ]
    let cursor = 0
    for (const heading of headingsInOrder) {
      const idx = result.markdown.indexOf(heading, cursor)
      expect(idx).toBeGreaterThan(-1)
      cursor = idx + heading.length
    }
  })

  it('adds a bullet to the entourage section', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'add',
      section: 'entourage_et_partages',
      content: 'Sa compagne préfère les rouges souples',
    })
    expect(result.changed).toBe(true)
    expect(result.markdown).toContain('- Sa compagne préfère les rouges souples')
    expect(countBulletsInSection(result.markdown, 'entourage_et_partages')).toBe(2)
  })

  it('edits a bullet in the contexte section', () => {
    const result = applyPatchToMarkdown(BASE_MARKDOWN, {
      action: 'edit',
      section: 'contexte_et_intentions',
      previous_content: 'Veut étoffer sa cave en Nebbiolo',
      content: 'Veut étoffer sa cave en Nebbiolo et Barolo grande garde',
    })
    expect(result.changed).toBe(true)
    expect(result.markdown).toContain('- Veut étoffer sa cave en Nebbiolo et Barolo grande garde')
  })
})

describe('countBulletsInSection', () => {
  it('counts only bulleted lines in the target section', () => {
    expect(countBulletsInSection(BASE_MARKDOWN, 'profil_gustatif')).toBe(2)
    expect(countBulletsInSection(BASE_MARKDOWN, 'moments_marquants')).toBe(1)
    expect(countBulletsInSection(BASE_MARKDOWN, 'explorations_en_cours')).toBe(1)
    expect(countBulletsInSection(BASE_MARKDOWN, 'entourage_et_partages')).toBe(1)
    expect(countBulletsInSection(BASE_MARKDOWN, 'contexte_et_intentions')).toBe(1)
  })
})
