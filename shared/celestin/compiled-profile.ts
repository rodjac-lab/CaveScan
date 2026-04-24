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

function buildTasteSection(input: CompiledProfileInput, nowMs: number): string[] {
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

  const preferences = pickTopFacts(facts, 'preference', nowMs)
  if (preferences.length > 0) {
    lines.push(...preferences.map((entry) => `- ${entry.text}`))
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

  const entourageLines = buildEntourageSection(input, nowMs)
  const contexteLines = buildContexteIntentionsSection(input, nowMs)

  const sections: string[] = [
    '## Profil gustatif',
    ...buildTasteSection(input, nowMs),
    '',
    '## Moments marquants',
    ...buildMomentsSection(input),
    '',
    '## Explorations en cours',
    ...buildExplorationsSection(input, nowMs),
  ]

  if (entourageLines.length > 0) {
    sections.push('', '## Entourage et partages', ...entourageLines)
  }

  if (contexteLines.length > 0) {
    sections.push('', '## Contexte et intentions', ...contexteLines)
  }

  sections.push('', '## Style de conversation', ...buildConversationStyleSection(input))

  return sections.join('\n').trim()
}
