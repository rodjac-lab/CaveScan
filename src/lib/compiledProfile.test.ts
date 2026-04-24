import { describe, expect, it } from 'vitest'
import { buildCompiledProfileMarkdown } from '../../shared/celestin/compiled-profile.ts'

const NOW_ISO = '2026-04-24T12:00:00.000Z'
const NOW_MS = new Date(NOW_ISO).getTime()

function fact(overrides: Record<string, unknown> = {}) {
  return {
    category: 'preference',
    fact: 'Aime les blancs tendus',
    confidence: 0.8,
    is_temporary: false,
    created_at: new Date(NOW_MS - 1000 * 60 * 60 * 24 * 30).toISOString(),
    expires_at: null,
    ...overrides,
  }
}

describe('buildCompiledProfileMarkdown — baseline sections', () => {
  it('returns the four canonical section headings with a fallback gustatif when input is empty', () => {
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO })
    expect(md).toContain('## Profil gustatif')
    expect(md).toContain('## Moments marquants')
    expect(md).toContain('## Explorations en cours')
    expect(md).toContain('## Style de conversation')
    expect(md).toContain('Profil encore en construction')
  })

  it('produces deterministic output when nowIso is fixed', () => {
    const input = {
      nowIso: NOW_ISO,
      memoryFacts: [
        fact({ category: 'preference', fact: 'Aime les blancs tendus', confidence: 0.9 }),
      ],
    }
    const a = buildCompiledProfileMarkdown(input)
    const b = buildCompiledProfileMarkdown(input)
    expect(a).toBe(b)
  })
})

describe('buildCompiledProfileMarkdown — preferences', () => {
  it('includes up to 5 preference facts sorted by scoring', () => {
    const preferences = [
      fact({ category: 'preference', fact: 'P1 high conf recent', confidence: 0.95 }),
      fact({ category: 'preference', fact: 'P2 high', confidence: 0.9 }),
      fact({ category: 'preference', fact: 'P3 mid', confidence: 0.85 }),
      fact({ category: 'preference', fact: 'P4 mid', confidence: 0.8 }),
      fact({ category: 'preference', fact: 'P5 mid', confidence: 0.75 }),
      fact({ category: 'preference', fact: 'P6 mid', confidence: 0.72 }),
      fact({ category: 'preference', fact: 'P7 mid', confidence: 0.71 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: preferences })
    expect(md).toContain('- P1 high conf recent')
    expect(md).toContain('- P2 high')
    expect(md).toContain('- P3 mid')
    expect(md).toContain('- P4 mid')
    expect(md).toContain('- P5 mid')
    expect(md).not.toContain('- P6 mid')
    expect(md).not.toContain('- P7 mid')
  })

  it('filters out preferences below the category minimum confidence', () => {
    const preferences = [
      fact({ category: 'preference', fact: 'Strong preference', confidence: 0.85 }),
      fact({ category: 'preference', fact: 'Weak inference from single tasting', confidence: 0.5 }),
      fact({ category: 'preference', fact: 'Below threshold', confidence: 0.68 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: preferences })
    expect(md).toContain('- Strong preference')
    expect(md).not.toContain('- Weak inference')
    expect(md).not.toContain('- Below threshold')
  })

  it('filters out temporary preferences even when not expired', () => {
    const facts = [
      fact({ category: 'preference', fact: 'Durable', is_temporary: false }),
      fact({ category: 'preference', fact: 'Ephemere', is_temporary: true }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('- Durable')
    expect(md).not.toContain('- Ephemere')
  })
})

describe('buildCompiledProfileMarkdown — aversions', () => {
  it('renders aversions in a single condensed line', () => {
    const facts = [
      fact({ category: 'aversion', fact: 'Pas de California Cab riche', confidence: 0.9 }),
      fact({ category: 'aversion', fact: 'Evite le bois marque', confidence: 0.8 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toMatch(/Points de vigilance : .*California Cab.*\|.*bois marque/)
  })
})

describe('buildCompiledProfileMarkdown — new sections', () => {
  it('adds a "Contexte et intentions" section when a cellar_intent exists', () => {
    const facts = [
      fact({
        category: 'cellar_intent',
        fact: 'Veut etoffer sa cave en Nebbiolo pour la garde',
        confidence: 0.9,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Contexte et intentions')
    expect(md).toContain('- Veut etoffer sa cave en Nebbiolo pour la garde')
  })

  it('adds a "Entourage et partages" section when a social fact exists', () => {
    const facts = [
      fact({
        category: 'social',
        fact: 'Son beau-pere adore la Bourgogne',
        confidence: 0.85,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Entourage et partages')
    expect(md).toContain('Son beau-pere adore la Bourgogne')
  })

  it('includes non-expired temporary context facts prefixed with [contexte récent]', () => {
    const future = new Date(NOW_MS + 1000 * 60 * 60 * 24 * 3).toISOString()
    const facts = [
      fact({
        category: 'context',
        fact: 'Part a Rome ce weekend',
        confidence: 0.7,
        is_temporary: true,
        expires_at: future,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Contexte et intentions')
    expect(md).toContain('[contexte récent]')
    expect(md).toContain('Part a Rome ce weekend')
  })

  it('includes life_event facts inside Explorations en cours section', () => {
    const facts = [
      fact({
        category: 'life_event',
        fact: 'Premiere cave sommelier lors d un voyage en Italie 2024',
        confidence: 0.8,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    const explorationsIdx = md.indexOf('## Explorations en cours')
    const nextSectionIdx = md.indexOf('## Entourage et partages', explorationsIdx)
    const explorations = md.slice(
      explorationsIdx,
      nextSectionIdx > -1 ? nextSectionIdx : md.indexOf('## Style de conversation', explorationsIdx),
    )
    expect(explorations).toContain('Premiere cave sommelier')
  })

  it('omits entourage/contexte sections entirely when there is no data for them', () => {
    const facts = [
      fact({ category: 'preference', fact: 'Aime les blancs tendus' }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('## Entourage et partages')
    expect(md).not.toContain('## Contexte et intentions')
  })

  it('covers the six sections when every category has at least one fact', () => {
    const facts = [
      fact({ category: 'preference', fact: 'Aime les blancs tendus' }),
      fact({ category: 'aversion', fact: 'Pas de California Cab' }),
      fact({ category: 'wine_knowledge', fact: 'Comprend le role du soutirage' }),
      fact({ category: 'life_event', fact: 'Voyage initiatique en Toscane 2023' }),
      fact({ category: 'social', fact: 'Son beau-pere amateur de Bourgogne' }),
      fact({ category: 'cellar_intent', fact: 'Veut etoffer en Nebbiolo' }),
      fact({
        category: 'context',
        fact: 'Part a Rome ce weekend',
        is_temporary: true,
        expires_at: new Date(NOW_MS + 1000 * 60 * 60 * 24 * 3).toISOString(),
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Profil gustatif')
    expect(md).toContain('## Moments marquants')
    expect(md).toContain('## Explorations en cours')
    expect(md).toContain('## Entourage et partages')
    expect(md).toContain('## Contexte et intentions')
    expect(md).toContain('## Style de conversation')
  })
})

describe('buildCompiledProfileMarkdown — scoring confidence x recency', () => {
  it('prefers a very recent medium-confidence fact over an old high-confidence fact after enough decay', () => {
    // cellar_intent quota = 2, half-life = 90d. With these numbers:
    // ANCIEN (conf 0.95, age 730d): recency ~0.0036, score ~0.571
    // RECENT (conf 0.70, age 1d):   recency ~0.992, score ~0.698
    // AUTRE  (conf 0.80, age 5d):   recency ~0.962, score ~0.788
    // Top 2 = AUTRE, RECENT. ANCIEN excluded.
    const oldFact = fact({
      category: 'cellar_intent',
      fact: 'ANCIEN projet abandonne',
      confidence: 0.95,
      created_at: new Date(NOW_MS - 1000 * 60 * 60 * 24 * 730).toISOString(),
    })
    const recentFact = fact({
      category: 'cellar_intent',
      fact: 'RECENT projet actif',
      confidence: 0.7,
      created_at: new Date(NOW_MS - 1000 * 60 * 60 * 24 * 1).toISOString(),
    })
    const otherFact = fact({
      category: 'cellar_intent',
      fact: 'AUTRE projet en cours',
      confidence: 0.8,
      created_at: new Date(NOW_MS - 1000 * 60 * 60 * 24 * 5).toISOString(),
    })
    const md = buildCompiledProfileMarkdown({
      nowIso: NOW_ISO,
      memoryFacts: [oldFact, recentFact, otherFact],
    })
    const contextIdx = md.indexOf('## Contexte et intentions')
    const contextBlock = md.slice(contextIdx)
    expect(contextBlock).toContain('RECENT projet actif')
    expect(contextBlock).toContain('AUTRE projet en cours')
    expect(contextBlock).not.toContain('ANCIEN projet abandonne')
  })

  it('keeps confidence dominant for recently-created facts with similar age', () => {
    const baseCreated = new Date(NOW_MS - 1000 * 60 * 60 * 24 * 7).toISOString()
    const facts = [
      fact({ category: 'preference', fact: 'Z conf 0.95', confidence: 0.95, created_at: baseCreated }),
      fact({ category: 'preference', fact: 'Y conf 0.88', confidence: 0.88, created_at: baseCreated }),
      fact({ category: 'preference', fact: 'X conf 0.82', confidence: 0.82, created_at: baseCreated }),
      fact({ category: 'preference', fact: 'W conf 0.78', confidence: 0.78, created_at: baseCreated }),
      fact({ category: 'preference', fact: 'V conf 0.72', confidence: 0.72, created_at: baseCreated }),
      fact({ category: 'preference', fact: 'U conf 0.65', confidence: 0.65, created_at: baseCreated }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('- Z conf 0.95')
    expect(md).toContain('- V conf 0.72')
    expect(md).not.toContain('- U conf 0.65')
    const zIdx = md.indexOf('- Z conf 0.95')
    const vIdx = md.indexOf('- V conf 0.72')
    expect(zIdx).toBeLessThan(vIdx)
  })
})
