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

function topFactLines(memoryFacts: MemoryFactLike[], category: string, limit: number): string[] {
  return memoryFacts
    .filter((fact) => fact.category === category && !fact.is_temporary && fact.fact)
    .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))
    .map((fact) => fact.fact!.trim())
    .filter(Boolean)
    .filter((fact, index, array) => array.findIndex((entry) => entry.toLowerCase() === fact.toLowerCase()) === index)
    .slice(0, limit)
}

function buildTasteSection(input: CompiledProfileInput): string[] {
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

  const preferences = topFactLines(facts, 'preference', 3)
  if (preferences.length > 0) {
    lines.push(...preferences.map((fact) => `- ${fact}`))
  }

  const aversions = topFactLines(facts, 'aversion', 3)
  if (aversions.length > 0) {
    lines.push(`- Points de vigilance : ${aversions.join(' | ')}.`)
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
    const note = trimSentence(tasting.tasting_note ?? '')
    const stars = tasting.rating != null ? ` (${tasting.rating}/5)` : ''
    return `- ${identity}${stars} — ${note}`
  })

  return lines.length > 0
    ? lines
    : ['- Aucun moment marquant compilé pour le moment.']
}

function buildExplorationsSection(input: CompiledProfileInput): string[] {
  const recent = input.recentTastings ?? []
  const recentNames = dedupeStrings(
    recent.slice(0, 6).map((tasting) => tasting.appellation || tasting.domaine)
  )
  const learningFacts = topFactLines(input.memoryFacts ?? [], 'wine_knowledge', 3)

  const lines: string[] = []
  if (recentNames.length > 0) {
    lines.push(`- Pistes récentes dans les dégustations : ${recentNames.join(', ')}.`)
  }
  if (learningFacts.length > 0) {
    lines.push(...learningFacts.map((fact) => `- ${fact}`))
  }
  if (lines.length === 0) {
    lines.push('- Pas encore d’exploration durable clairement identifiée.')
  }
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
  const sections = [
    '## Profil gustatif',
    ...buildTasteSection(input),
    '',
    '## Moments marquants',
    ...buildMomentsSection(input),
    '',
    '## Explorations en cours',
    ...buildExplorationsSection(input),
    '',
    '## Style de conversation',
    ...buildConversationStyleSection(input),
  ]

  return sections.join('\n').trim()
}
