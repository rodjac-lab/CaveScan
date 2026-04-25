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

describe('buildCompiledProfileMarkdown — deterministic sanitization (T3 layer)', () => {
  it('skips cellar_intent facts that are actually negative cellar state observations', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: "N'a aucune bouteille italienne dans sa cave", confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Veut renforcer son rayon Bourgogne', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('aucune bouteille italienne')
    expect(md).toContain('renforcer son rayon Bourgogne')
  })

  it('skips cellar_intent facts that are actually positive cellar inventory statements', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: 'Possède un Birichino Cinsault dans sa cave', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Cherche à découvrir le Jura', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('Birichino Cinsault')
    expect(md).toContain('découvrir le Jura')
  })

  it('skips wine_knowledge facts that are actually app feedback', () => {
    const facts = [
      fact({ category: 'wine_knowledge', fact: "S'attend à ce que Celestin puisse lire ses notes", confidence: 0.8 }),
      fact({ category: 'wine_knowledge', fact: 'Comprend le rôle du soutirage', confidence: 0.8 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('Celestin puisse lire')
    expect(md).toContain('soutirage')
  })

  it('keeps real cellar_intent facts about plans, budgets, and exploration goals', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: 'Veut etoffer sa cave en Nebbiolo pour la garde', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Cherche un budget de 200 euros pour son anniversaire', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('Nebbiolo pour la garde')
    expect(md).toContain('budget de 200 euros')
  })

  it('skips cellar_intent observations even when an adverb is inserted between possède and the count', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: 'Possède actuellement 108 bouteilles en cave sur 74 références.', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Possède désormais des Riesling allemands', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('108 bouteilles')
    expect(md).not.toContain('Riesling allemands')
  })

  it('skips wine_knowledge facts that capture a passing question rather than knowledge', () => {
    const facts = [
      fact({ category: 'wine_knowledge', fact: "L'utilisateur se demande s'il a déjà bu du Barolo", confidence: 0.8 }),
      fact({ category: 'wine_knowledge', fact: 'S’intéresse aux différences entre Barolo et Barbaresco', confidence: 0.8 }),
      fact({ category: 'wine_knowledge', fact: 'Comprend le rôle du soutirage', confidence: 0.8 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('a déjà bu du Barolo')
    expect(md).not.toContain('différences entre Barolo')
    expect(md).toContain('soutirage')
  })

  it('omits the Contexte section entirely when every cellar_intent is sanitized away', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: 'Possède un Birichino Cinsault dans sa cave', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: "N'a pas de Bordeaux", confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('## Contexte et intentions')
  })
})

describe('buildCompiledProfileMarkdown — entity matching with token overlap', () => {
  it('matches a long entity to a shorter tasting domaine via token overlap (Aloxe-Corton case)', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur a apprécié l'Aloxe-Corton Domaine Céline Perrin 2022 pour son fruité",
        confidence: 0.85,
      }),
    ]
    const md = buildCompiledProfileMarkdown({
      nowIso: NOW_ISO,
      memoryFacts: facts,
      topTastings: [
        { domaine: 'Domaine Céline Perrin', cuvee: null, appellation: 'Aloxe-Corton', millesime: 2022, drunk_at: null, rating: 4, tasting_note: null },
      ],
      computedProfile: {
        topDomaines: [{ name: 'Domaine Céline Perrin', count: 2, avgRating: 4 }],
      },
    })
    const profilIdx = md.indexOf('## Profil gustatif')
    const momentsIdx = md.indexOf('## Moments marquants')
    const profilBlock = md.slice(profilIdx, momentsIdx)
    expect(profilBlock).toContain('Aloxe-Corton')
    expect(md).not.toContain('## Découvertes à confirmer')
  })

  it('still routes a single-mention preference with no tasting to discoveries', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur a apprécié le domaine Inconnu",
        confidence: 0.85,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Découvertes à confirmer')
    expect(md).toContain('domaine Inconnu')
  })

  it('matches accented and unaccented entity tokens (Cuvée vs cuvee)', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur apprécie le domaine Prieuré Roch",
        confidence: 0.85,
      }),
    ]
    const md = buildCompiledProfileMarkdown({
      nowIso: NOW_ISO,
      memoryFacts: facts,
      topTastings: [
        { domaine: 'Prieure Roch', cuvee: null, appellation: 'Ladoix', millesime: 2019, drunk_at: null, rating: 4, tasting_note: null },
      ],
      computedProfile: {
        topDomaines: [{ name: 'Prieure Roch', count: 2, avgRating: 4 }],
      },
    })
    expect(md).not.toContain('## Découvertes à confirmer')
    const profilIdx = md.indexOf('## Profil gustatif')
    const momentsIdx = md.indexOf('## Moments marquants')
    expect(md.slice(profilIdx, momentsIdx)).toContain('Prieuré Roch')
  })

  it('does not match unrelated domaines that share only stop tokens', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur a apprécié le domaine Selosse",
        confidence: 0.85,
      }),
    ]
    const md = buildCompiledProfileMarkdown({
      nowIso: NOW_ISO,
      memoryFacts: facts,
      topTastings: [
        { domaine: 'Domaine Bollinger', cuvee: null, appellation: 'Champagne', millesime: 2018, drunk_at: null, rating: 4, tasting_note: null },
      ],
    })
    expect(md).toContain('## Découvertes à confirmer')
    const enviesIdx = md.indexOf('## Envies')
    const explorationsIdx = md.indexOf('## Explorations en cours')
    const blockEnd = enviesIdx > -1 ? enviesIdx : explorationsIdx
    const discoveryBlock = md.slice(md.indexOf('## Découvertes à confirmer'), blockEnd)
    expect(discoveryBlock).toContain('Selosse')
  })
})

describe('buildCompiledProfileMarkdown — fuzzy dedupe', () => {
  it('collapses two cellar_intent facts that differ only by a trailing temporal adverb', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: 'Trouve les vins de Macle difficiles à trouver et chers.', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Trouve les vins de Macle difficiles à trouver et chers actuellement.', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    const macleMentions = md.match(/Macle/g)?.length ?? 0
    expect(macleMentions).toBe(1)
  })

  it('collapses two preference facts that differ only by trailing punctuation', () => {
    const facts = [
      fact({ category: 'preference', fact: 'Aime les blancs tendus', confidence: 0.85 }),
      fact({ category: 'preference', fact: 'Aime les blancs tendus.', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    const mentions = md.match(/Aime les blancs tendus/g)?.length ?? 0
    expect(mentions).toBe(1)
  })

  it('keeps facts that genuinely differ (not just trailing noise)', () => {
    const facts = [
      fact({ category: 'preference', fact: 'Aime les blancs tendus', confidence: 0.85 }),
      fact({ category: 'preference', fact: 'Aime les rouges tendus', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('Aime les blancs tendus')
    expect(md).toContain('Aime les rouges tendus')
  })

  it('collapses stacks of trailing adverbs and punctuation', () => {
    const facts = [
      fact({ category: 'cellar_intent', fact: 'Cherche du Champagne pour les fêtes', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Cherche du Champagne pour les fêtes désormais.', confidence: 0.85 }),
      fact({ category: 'cellar_intent', fact: 'Cherche du Champagne pour les fêtes en ce moment !', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    const mentions = md.match(/Cherche du Champagne/g)?.length ?? 0
    expect(mentions).toBe(1)
  })
})

describe('buildCompiledProfileMarkdown — funnel piliers / découvertes / envies', () => {
  it('places a preference with no identifiable wine entity in Profil gustatif (pillar by default)', () => {
    const facts = [fact({ category: 'preference', fact: 'Aime les blancs tendus', confidence: 0.85 })]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('Aime les blancs tendus')
    expect(md).not.toContain('## Découvertes à confirmer')
    expect(md).not.toContain('## Envies')
  })

  it('classifies a single-tasting preference as a discovery', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur a apprécié le domaine Prieuré Roch",
        confidence: 0.85,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Découvertes à confirmer')
    expect(md).toContain('Prieuré Roch')
    const profilIdx = md.indexOf('## Profil gustatif')
    const discoveryIdx = md.indexOf('## Découvertes à confirmer')
    const profilBlock = md.slice(profilIdx, discoveryIdx)
    expect(profilBlock).not.toContain('Prieuré Roch')
  })

  it('promotes a preference to a pillar when it has at least 2 evidence sources', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur apprécie le domaine Macle",
        confidence: 0.9,
      }),
    ]
    const md = buildCompiledProfileMarkdown({
      nowIso: NOW_ISO,
      memoryFacts: facts,
      topTastings: [
        { domaine: 'Domaine MACLE', cuvee: null, appellation: 'Côtes du Jura', millesime: 2016, drunk_at: null, rating: 4, tasting_note: 'Belle bouteille' },
        { domaine: 'Domaine Macle', cuvee: null, appellation: 'Côtes du Jura', millesime: 2018, drunk_at: null, rating: 4, tasting_note: null },
      ],
      computedProfile: {
        topDomaines: [{ name: 'Domaine Macle', count: 3, avgRating: 4 }],
      },
    })
    const profilIdx = md.indexOf('## Profil gustatif')
    const nextSectionIdx = md.indexOf('## Moments marquants', profilIdx)
    const profilBlock = md.slice(profilIdx, nextSectionIdx)
    expect(profilBlock).toContain('Macle')
    expect(md).not.toContain('## Découvertes à confirmer')
  })

  it('places preferences with a future-tense verb in the Envies section', () => {
    const facts = [
      fact({
        category: 'preference',
        fact: "L'utilisateur aimerait essayer Coche-Dury",
        confidence: 0.8,
      }),
      fact({
        category: 'preference',
        fact: "L'utilisateur a envie de goûter un Barolo de Giacomo Conterno",
        confidence: 0.8,
      }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).toContain('## Envies')
    expect(md).toContain('Coche-Dury')
    expect(md).toContain('Giacomo Conterno')
    const enviesIdx = md.indexOf('## Envies')
    const enviesBlock = md.slice(enviesIdx)
    expect(enviesBlock).toContain('aimerait essayer')
    expect(enviesBlock).toContain('a envie de goûter')
  })

  it('puts the three new sections in the order Découvertes → Envies → Explorations', () => {
    const facts = [
      fact({ category: 'preference', fact: "L'utilisateur a apprécié le domaine Prieuré Roch", confidence: 0.85 }),
      fact({ category: 'preference', fact: "L'utilisateur aimerait essayer Coche-Dury", confidence: 0.8 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    const momentsIdx = md.indexOf('## Moments marquants')
    const discoveriesIdx = md.indexOf('## Découvertes à confirmer')
    const enviesIdx = md.indexOf('## Envies')
    const explorationsIdx = md.indexOf('## Explorations en cours')
    expect(momentsIdx).toBeGreaterThan(-1)
    expect(discoveriesIdx).toBeGreaterThan(momentsIdx)
    expect(enviesIdx).toBeGreaterThan(discoveriesIdx)
    expect(explorationsIdx).toBeGreaterThan(enviesIdx)
  })

  it('omits Découvertes and Envies sections entirely when no preference fits them', () => {
    const facts = [
      fact({ category: 'preference', fact: 'Aime les blancs tendus', confidence: 0.85 }),
    ]
    const md = buildCompiledProfileMarkdown({ nowIso: NOW_ISO, memoryFacts: facts })
    expect(md).not.toContain('## Découvertes à confirmer')
    expect(md).not.toContain('## Envies')
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
