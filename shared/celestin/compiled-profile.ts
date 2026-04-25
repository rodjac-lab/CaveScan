interface TagFrequencyLike {
  name?: string | null
  count?: number | null
}

interface TopStatLike {
  name?: string | null
  count?: number | null
  avgRating?: number | null
}

interface ComputedProfileLike {
  avgRating?: number | null
  topAppellations?: TopStatLike[]
  topDomaines?: TopStatLike[]
  topFoodPairings?: string[]
  recentTastings?: Array<{
    domaine?: string | null
    appellation?: string | null
    millesime?: number | null
    rating?: number | null
    drunkAt?: string | null
  }>
  livedPairings?: TagFrequencyLike[]
  userDescriptors?: TagFrequencyLike[]
}

interface QuestionnaireLike {
  marketingProfile?: string
  fwi?: {
    knowledge?: number
    connoisseur?: number
    provenance?: number
  }
  sensory?: {
    evolution?: string
    elevage?: string
    acidite?: string
    neophilie?: string
    regions?: string[]
  }
}

interface MemoryFactLike {
  category?: string | null
  fact?: string | null
  confidence?: number | null
  is_temporary?: boolean | null
  created_at?: string | null
  expires_at?: string | null
}

interface TastingLike {
  domaine?: string | null
  cuvee?: string | null
  appellation?: string | null
  millesime?: number | null
  drunk_at?: string | null
  rating?: number | null
  tasting_note?: string | null
  tasting_tags?: {
    sentiment?: string | null
  } | null
}

export interface CompiledProfileInput {
  computedProfile?: ComputedProfileLike | null
  questionnaireProfile?: QuestionnaireLike | null
  memoryFacts?: MemoryFactLike[]
  topTastings?: TastingLike[]
  recentTastings?: TastingLike[]
  nowIso?: string
}

type FactCategory =
  | 'preference'
  | 'aversion'
  | 'wine_knowledge'
  | 'life_event'
  | 'social'
  | 'cellar_intent'
  | 'context'

interface CategoryConfig {
  halfLifeDays: number
  quota: number
  allowTemporary: boolean
  minConfidence: number
}

const CATEGORY_CONFIG: Record<FactCategory, CategoryConfig> = {
  preference: { halfLifeDays: 365, quota: 5, allowTemporary: false, minConfidence: 0.7 },
  aversion: { halfLifeDays: 365, quota: 3, allowTemporary: false, minConfidence: 0.7 },
  wine_knowledge: { halfLifeDays: 180, quota: 3, allowTemporary: false, minConfidence: 0.6 },
  life_event: { halfLifeDays: 540, quota: 2, allowTemporary: false, minConfidence: 0.7 },
  social: { halfLifeDays: 270, quota: 3, allowTemporary: false, minConfidence: 0.65 },
  cellar_intent: { halfLifeDays: 90, quota: 2, allowTemporary: true, minConfidence: 0.7 },
  context: { halfLifeDays: 30, quota: 2, allowTemporary: true, minConfidence: 0.5 },
}

const DAY_MS = 1000 * 60 * 60 * 24

const CELLAR_OBSERVATION_PATTERNS: RegExp[] = [
  /\bn['’]a\s+(aucun|aucune|pas\s+de|plus\s+de)\b/i,
  /\bne\s+poss[eè]de\s+(pas|plus|aucun|aucune)\b/i,
  /\bposs[eè]de(\s+\S+){0,2}\s+(un|une|des|deux|trois|quatre|\d+)\b/i,
  /\b(a|avait)\s+(un|une|des|deux|trois|quatre|\d+)\s+\S+.*\b(dans\s+sa\s+cave|en\s+cave)\b/i,
  /\bil\s+y\s+a\s+(un|une|des|\d+)\b/i,
  /\bdans\s+sa\s+cave\b/i,
  /\b(en\s+cave\s+sur)\b/i,
]

const APP_FEEDBACK_PATTERNS: RegExp[] = [
  /\bcelestin\b/i,
  /\bl['’]app(lication)?\b/i,
  /\bla\s+fonctionnalit[eé]\b/i,
  /\bs['’]attend\s+(à|a)\s+ce\s+que\b/i,
  /\b(souhaite|aimerait|voudrait)\s+que\s+l['’]app/i,
]

const WINE_KNOWLEDGE_QUESTION_PATTERNS: RegExp[] = [
  /\bse\s+demande\s+(si|s['’]il|comment|pourquoi|ce\s+que|quel)\b/i,
  /\bs['’]int[eé]resse\s+(à|a|aux)\s+(la\s+)?diff[eé]rence/i,
  /\bse\s+questionne\s+sur\b/i,
  /\b(a|s['’])\s*pos[eé]\s+(la\s+)?question\b/i,
  /\bdemande\s+(à|a)\s+celestin\b/i,
]

const ENVIE_PATTERNS: RegExp[] = [
  /\baimerait\s+(essayer|go[uû]ter|d[eé]couvrir|boire|tester|conna[iî]tre)\b/i,
  /\bvoudrait\s+(essayer|go[uû]ter|d[eé]couvrir|boire|tester)\b/i,
  /\bsouhaiterait\s+(essayer|go[uû]ter|d[eé]couvrir|boire)\b/i,
  /\ba\s+envie\s+(de|d['’])\s*(essayer|go[uû]ter|boire|d[eé]couvrir|tester)\b/i,
  /\br[eê]ve\s+(de|d['’])\s*(go[uû]ter|essayer|boire|d[eé]couvrir)\b/i,
  /\bn['’]a\s+pas\s+encore\s+(go[uû]t[eé]|bu|essay[eé])\b/i,
  /\bveut\s+(essayer|go[uû]ter|d[eé]couvrir|tester|conna[iî]tre)\b/i,
  /\b(il\s+)?(faudrait|faut)\s+(qu['’]il|que\s+l['’]utilisateur)\s+(go[uû]te|essaie)\b/i,
]

const ENTITY_STOP_WORDS = new Set<string>([
  'L', 'Le', 'La', 'Les', 'Un', 'Une', 'Des', 'De', 'Du', 'Au', 'Aux',
  'Et', 'Ou', 'Mais', 'Pour', 'Par', 'Avec', 'Sans', 'Sur', 'Sous',
  'Ce', 'Cette', 'Ces', 'Son', 'Sa', 'Ses', 'Mon', 'Ma', 'Mes',
  'Celestin', 'Apprécie', 'Aime', 'Adore', 'Déteste',
  'Aimerait', 'Voudrait', 'Souhaite', 'Souhaiterait', 'Veut', 'Cherche',
  'Bourgogne', 'Bordeaux', 'Champagne', 'Loire', 'Rhône', 'Rhone', 'Alsace', 'Jura',
  'Provence', 'Beaujolais', 'Languedoc', 'Roussillon', 'Savoie',
  'Italie', 'Espagne', 'France', 'Allemagne', 'Portugal',
  'Italien', 'Italienne', 'Italiens', 'Italiennes',
  'Pinot', 'Chardonnay', 'Riesling', 'Cabernet', 'Merlot', 'Syrah', 'Grenache', 'Chenin',
  'Savagnin', 'Trousseau', 'Poulsard', 'Aligoté', 'Aligote', 'Gamay', 'Sauvignon', 'Viognier',
  'Mourvèdre', 'Carignan', 'Cinsault', 'Nebbiolo', 'Sangiovese', 'Tempranillo',
])

function stripUtilisateurPrefix(text: string): string {
  return text.replace(/^L['’]utilisateur\s+(a\s+|s['’]\w+\s+|appr[eé]cie\s+|aime\s+|adore\s+|aimerait\s+|voudrait\s+|veut\s+)?/i, '')
}

function extractWineEntities(text: string): string[] {
  const cleaned = stripUtilisateurPrefix(text)
  const entities: string[] = []
  const seen = new Set<string>()
  const stopFirstWord = (entity: string) => ENTITY_STOP_WORDS.has(entity.split(/[\s-]+/)[0])

  // 1) "domaine X" / "chez X" / "maison X" / "château X" / "clos X"
  const introRegex = /\b(?:domaine|chez|maison|ch[âa]teau|clos)\s+([A-ZÀ-Ÿ][\wÀ-ÿ'’-]*(?:[\s-][A-ZÀ-Ÿ][\wÀ-ÿ'’-]*)*)/gi
  for (const match of cleaned.matchAll(introRegex)) {
    const entity = match[1].trim()
    if (!entity || stopFirstWord(entity)) continue
    const key = entity.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entities.push(entity)
  }

  // 2) Sequences de ≥ 2 mots capitalisés (Coche-Dury, Prieuré Roch, Côte Rôtie Sereine Noire)
  const multiCapsRegex = /\b([A-ZÀ-Ÿ][\wÀ-ÿ'’-]+(?:[\s-][A-ZÀ-Ÿ][\wÀ-ÿ'’-]+)+)\b/g
  for (const match of cleaned.matchAll(multiCapsRegex)) {
    const entity = match[1].trim()
    if (!entity || stopFirstWord(entity)) continue
    const key = entity.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entities.push(entity)
  }

  return entities
}

function countEvidenceForPreference(
  factText: string,
  factEntities: string[],
  allFacts: MemoryFactLike[],
  computed: ComputedProfileLike | null | undefined,
  topTastings: TastingLike[],
  recentTastings: TastingLike[],
): number {
  // No entity → unmeasurable; default to pillar via Infinity threshold.
  if (factEntities.length === 0) return Number.POSITIVE_INFINITY

  const lowerEntities = factEntities.map((entity) => entity.toLowerCase())
  const factLower = factText.toLowerCase()
  let evidence = 0

  const tastings = [...(topTastings ?? []), ...(recentTastings ?? [])]
  for (const tasting of tastings) {
    const haystack = `${tasting.domaine ?? ''} ${tasting.cuvee ?? ''}`.toLowerCase()
    if (haystack.trim() && lowerEntities.some((entity) => haystack.includes(entity))) {
      evidence++
    }
  }

  const matchedTopDomaine = (computed?.topDomaines ?? []).some((domaine) => {
    const name = (domaine.name ?? '').toLowerCase()
    return name.length > 0 && lowerEntities.some((entity) => name.includes(entity))
  })
  if (matchedTopDomaine) evidence++

  const hasOtherFact = allFacts.some((other) => {
    const otherText = (other.fact ?? '').toLowerCase().trim()
    if (!otherText || otherText === factLower) return false
    return lowerEntities.some((entity) => otherText.includes(entity))
  })
  if (hasOtherFact) evidence++

  return evidence
}

const PILLAR_EVIDENCE_THRESHOLD = 2

interface PreferenceClassification {
  pillars: ScoredFact[]
  discoveries: ScoredFact[]
  envies: ScoredFact[]
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function sanitizeFacts(facts: MemoryFactLike[]): MemoryFactLike[] {
  const result: MemoryFactLike[] = []
  for (const fact of facts) {
    const text = (fact.fact ?? '').trim()
    if (!text) continue

    if (fact.category === 'cellar_intent' && matchesAny(text, CELLAR_OBSERVATION_PATTERNS)) {
      continue
    }

    if (fact.category === 'wine_knowledge' && matchesAny(text, APP_FEEDBACK_PATTERNS)) {
      continue
    }

    if (fact.category === 'wine_knowledge' && matchesAny(text, WINE_KNOWLEDGE_QUESTION_PATTERNS)) {
      continue
    }

    result.push(fact)
  }
  return result
}

function trimSentence(text: string, max = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max).trim()}...`
}

function formatBottleIdentity(tasting: TastingLike): string {
  return [tasting.domaine, tasting.cuvee, tasting.appellation, tasting.millesime]
    .filter(Boolean)
    .join(' · ')
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (!normalized) continue
    if (seen.has(normalized.toLowerCase())) continue
    seen.add(normalized.toLowerCase())
    result.push(normalized)
  }
  return result
}

function resolveNowMs(nowIso?: string): number {
  if (nowIso) {
    const parsed = new Date(nowIso).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now()
}

function scoreFact(fact: MemoryFactLike, nowMs: number, halfLifeDays: number): number {
  const confidence = typeof fact.confidence === 'number' ? fact.confidence : 0
  const createdMs = fact.created_at ? new Date(fact.created_at).getTime() : nowMs
  const ageDays = Math.max(0, (nowMs - (Number.isFinite(createdMs) ? createdMs : nowMs)) / DAY_MS)
  const recency = halfLifeDays > 0 ? Math.pow(0.5, ageDays / halfLifeDays) : 1
  return confidence * (0.6 + 0.4 * recency)
}

interface ScoredFact {
  fact: MemoryFactLike
  score: number
  text: string
}

function pickTopFacts(
  memoryFacts: MemoryFactLike[],
  category: FactCategory,
  nowMs: number,
): ScoredFact[] {
  const config = CATEGORY_CONFIG[category]
  const seen = new Set<string>()
  const scored: ScoredFact[] = []

  for (const fact of memoryFacts) {
    if (fact.category !== category) continue
    if (!fact.fact) continue
    const text = fact.fact.trim()
    if (!text) continue

    const confidence = typeof fact.confidence === 'number' ? fact.confidence : 0
    if (confidence < config.minConfidence) continue

    const isTemporary = !!fact.is_temporary
    if (isTemporary && !config.allowTemporary) continue
    if (isTemporary && fact.expires_at) {
      const expiresMs = new Date(fact.expires_at).getTime()
      if (Number.isFinite(expiresMs) && expiresMs <= nowMs) continue
    }

    const dedupKey = text.toLowerCase()
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    scored.push({
      fact,
      score: scoreFact(fact, nowMs, config.halfLifeDays),
      text,
    })
  }

  scored.sort((left, right) => right.score - left.score)
  return scored.slice(0, config.quota)
}

function formatContextLine(entry: ScoredFact): string {
  const prefix = entry.fact.is_temporary ? '[contexte récent] ' : ''
  return `- ${prefix}${entry.text}`
}

function classifyPreferences(input: CompiledProfileInput, nowMs: number): PreferenceClassification {
  const config = CATEGORY_CONFIG.preference
  const facts = input.memoryFacts ?? []
  const seen = new Set<string>()

  const enviesAll: ScoredFact[] = []
  const pillarsAll: ScoredFact[] = []
  const discoveriesAll: ScoredFact[] = []

  for (const fact of facts) {
    if (fact.category !== 'preference') continue
    if (!fact.fact) continue
    const text = fact.fact.trim()
    if (!text) continue

    const confidence = typeof fact.confidence === 'number' ? fact.confidence : 0
    if (confidence < config.minConfidence) continue
    if (fact.is_temporary) continue

    const dedupKey = text.toLowerCase()
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    const entry: ScoredFact = {
      fact,
      score: scoreFact(fact, nowMs, config.halfLifeDays),
      text,
    }

    if (matchesAny(text, ENVIE_PATTERNS)) {
      enviesAll.push(entry)
      continue
    }

    const entities = extractWineEntities(text)
    const evidence = countEvidenceForPreference(
      text,
      entities,
      facts,
      input.computedProfile,
      input.topTastings ?? [],
      input.recentTastings ?? [],
    )

    if (evidence >= PILLAR_EVIDENCE_THRESHOLD) {
      pillarsAll.push(entry)
    } else {
      discoveriesAll.push(entry)
    }
  }

  const sortByScore = (arr: ScoredFact[]) => arr.sort((a, b) => b.score - a.score)

  return {
    pillars: sortByScore(pillarsAll).slice(0, config.quota),
    discoveries: sortByScore(discoveriesAll).slice(0, 3),
    envies: sortByScore(enviesAll).slice(0, 3),
  }
}

function buildTasteSection(
  input: CompiledProfileInput,
  nowMs: number,
  pillars: ScoredFact[],
): string[] {
  const lines: string[] = []
  const computed = input.computedProfile
  const questionnaire = input.questionnaireProfile
  const facts = input.memoryFacts ?? []

  if (computed?.topAppellations?.length) {
    lines.push(`- Appellations qui reviennent souvent : ${computed.topAppellations.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ')}.`)
  }

  if (computed?.topDomaines?.length) {
    lines.push(`- Domaines saillants : ${computed.topDomaines.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ')}.`)
  }

  const pairings = dedupeStrings([
    ...(computed?.livedPairings?.slice(0, 3).map((item) => item.name) ?? []),
    ...(computed?.topFoodPairings?.slice(0, 3) ?? []),
  ])
  if (pairings.length > 0) {
    lines.push(`- Accords vécus récurrents : ${pairings.join(', ')}.`)
  }

  const descriptors = dedupeStrings(computed?.userDescriptors?.slice(0, 4).map((item) => item.name) ?? [])
  if (descriptors.length > 0) {
    lines.push(`- Descripteurs récurrents dans ses notes : ${descriptors.join(', ')}.`)
  }

  if (pillars.length > 0) {
    lines.push(...pillars.map((entry) => `- ${entry.text}`))
  }

  const aversions = pickTopFacts(facts, 'aversion', nowMs)
  if (aversions.length > 0) {
    lines.push(`- Points de vigilance : ${aversions.map((entry) => entry.text).join(' | ')}.`)
  }

  const nuances: string[] = []
  if (questionnaire?.sensory?.evolution === 'tertiaire') {
    nuances.push('Le questionnaire initial l\'oriente vers les vins évolués et complexes.')
  }
  if (questionnaire?.sensory?.acidite === 'tendu') {
    nuances.push('Le questionnaire initial signale une attirance pour les profils tendus.')
  }
  if (questionnaire?.sensory?.elevage === 'mineral') {
    nuances.push('Le questionnaire initial valorise la pureté et le minéral plus que le bois.')
  }

  if (nuances.length > 0) {
    lines.push(`- Questionnaire bootstrap : ${nuances.join(' ')}`)
  }

  if (lines.length === 0) {
    lines.push('- Profil encore en construction. Préférer les faits précis aux généralisations.')
  }

  return lines
}

function buildMomentsSection(input: CompiledProfileInput): string[] {
  const tastings = (input.topTastings ?? [])
    .filter((tasting) => tasting.tasting_note && tasting.tasting_note.trim().length > 0)
    .slice(0, 8)

  const lines = tastings.map((tasting) => {
    const identity = formatBottleIdentity(tasting)
    const note = trimSentence(tasting.tasting_note ?? '', 400)
    const stars = tasting.rating != null ? ` (${tasting.rating}/5)` : ''
    return `- ${identity}${stars} — ${note}`
  })

  return lines.length > 0
    ? lines
    : ['- Aucun moment marquant compilé pour le moment.']
}

function buildExplorationsSection(input: CompiledProfileInput, nowMs: number): string[] {
  const recent = input.recentTastings ?? []
  const recentNames = dedupeStrings(
    recent.slice(0, 6).map((tasting) => tasting.appellation || tasting.domaine)
  )
  const learningFacts = pickTopFacts(input.memoryFacts ?? [], 'wine_knowledge', nowMs)
  const lifeEvents = pickTopFacts(input.memoryFacts ?? [], 'life_event', nowMs)

  const lines: string[] = []
  if (recentNames.length > 0) {
    lines.push(`- Pistes récentes dans les dégustations : ${recentNames.join(', ')}.`)
  }
  if (learningFacts.length > 0) {
    lines.push(...learningFacts.map((entry) => `- ${entry.text}`))
  }
  if (lifeEvents.length > 0) {
    lines.push(...lifeEvents.map((entry) => `- Jalon personnel : ${entry.text}`))
  }
  if (lines.length === 0) {
    lines.push('- Pas encore d’exploration durable clairement identifiée.')
  }
  return lines
}

function renderFactList(entries: ScoredFact[]): string[] {
  return entries.map((entry) => `- ${entry.text}`)
}

function buildEntourageSection(input: CompiledProfileInput, nowMs: number): string[] {
  const socialFacts = pickTopFacts(input.memoryFacts ?? [], 'social', nowMs)
  if (socialFacts.length === 0) return []
  return socialFacts.map((entry) => `- ${entry.text}`)
}

function buildContexteIntentionsSection(input: CompiledProfileInput, nowMs: number): string[] {
  const contextFacts = pickTopFacts(input.memoryFacts ?? [], 'context', nowMs)
  const intentFacts = pickTopFacts(input.memoryFacts ?? [], 'cellar_intent', nowMs)

  const lines: string[] = [
    ...contextFacts.map(formatContextLine),
    ...intentFacts.map((entry) => `- ${entry.text}`),
  ]
  return lines
}

function buildConversationStyleSection(input: CompiledProfileInput): string[] {
  const questionnaire = input.questionnaireProfile
  const lines: string[] = []

  const knowledge = questionnaire?.fwi?.knowledge ?? null
  const connoisseur = questionnaire?.fwi?.connoisseur ?? null

  if (knowledge != null && knowledge <= 12) {
    lines.push('- Être pédagogue, concret, sans jargon inutile.')
  } else if (knowledge != null && knowledge >= 22) {
    lines.push('- Peut aller dans le détail technique si cela apporte quelque chose.')
  } else {
    lines.push('- Garder un ton clair et naturel, avec juste assez de précision technique.')
  }

  if (connoisseur != null && connoisseur >= 22) {
    lines.push('- Peut assumer un ton plus affirmé et plus sommelier.')
  } else {
    lines.push('- Rester direct, chaleureux et jamais professoral.')
  }

  lines.push('- Préférer les souvenirs rares et justes aux rappels décoratifs.')

  return lines
}

export function buildCompiledProfileMarkdown(input: CompiledProfileInput): string {
  const nowMs = resolveNowMs(input.nowIso)
  const sanitizedInput: CompiledProfileInput = {
    ...input,
    memoryFacts: sanitizeFacts(input.memoryFacts ?? []),
  }

  const preferenceBuckets = classifyPreferences(sanitizedInput, nowMs)
  const entourageLines = buildEntourageSection(sanitizedInput, nowMs)
  const contexteLines = buildContexteIntentionsSection(sanitizedInput, nowMs)

  const sections: string[] = [
    '## Profil gustatif',
    ...buildTasteSection(sanitizedInput, nowMs, preferenceBuckets.pillars),
    '',
    '## Moments marquants',
    ...buildMomentsSection(sanitizedInput),
  ]

  if (preferenceBuckets.discoveries.length > 0) {
    sections.push('', '## Découvertes à confirmer', ...renderFactList(preferenceBuckets.discoveries))
  }

  if (preferenceBuckets.envies.length > 0) {
    sections.push('', '## Envies', ...renderFactList(preferenceBuckets.envies))
  }

  sections.push('', '## Explorations en cours', ...buildExplorationsSection(sanitizedInput, nowMs))

  if (entourageLines.length > 0) {
    sections.push('', '## Entourage et partages', ...entourageLines)
  }

  if (contexteLines.length > 0) {
    sections.push('', '## Contexte et intentions', ...contexteLines)
  }

  sections.push('', '## Style de conversation', ...buildConversationStyleSection(sanitizedInput))

  return sections.join('\n').trim()
}
