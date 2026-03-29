export type ResolverMode =
  | 'greeting'
  | 'social'
  | 'wine_conversation'
  | 'cellar_assistant'
  | 'restaurant_assistant'
  | 'tasting_memory'

export type ResolverTurnType =
  | 'greeting'
  | 'prefetch'
  | 'social_ack'
  | 'smalltalk'
  | 'task_request'
  | 'task_continue'
  | 'task_cancel'
  | 'disambiguation_answer'
  | 'context_switch'
  | 'unknown'

export interface StructuredMemoryFact {
  id?: string
  category: string
  fact: string
  confidence?: number
  is_temporary?: boolean
  expires_at?: string | null
  created_at?: string | null
}

export interface ConversationSummaryInput {
  summary: string
  started_at: string
  turn_count?: number | null
  source?: 'supabase' | 'local'
}

export interface UserModelResolverInput {
  message: string
  cognitiveMode: ResolverMode
  turnType: ResolverTurnType
  facts?: StructuredMemoryFact[]
  previousSessions?: ConversationSummaryInput[]
}

export interface ResolvedUserModel {
  headline?: string
  stablePreferences: string[]
  evolvingTastes: string[]
  avoidNow: string[]
  progression: string[]
  relationshipStyle: string[]
  socialContext: string[]
  activeContexts: string[]
  currentIntents: string[]
  signatureMemories: string[]
  relevantThreads: string[]
  supportingSignals: string[]
}

type MemoryPolarity = 'positive' | 'negative' | 'neutral' | 'temporary'

interface TopicRule {
  key: string
  label: string
  patterns: string[]
}

interface ScoredSignal {
  raw: StructuredMemoryFact
  normalizedFact: string
  topicKey: string
  topicLabel: string
  polarity: MemoryPolarity
  tokens: string[]
  confidence: number
  createdAtMs: number
  ageDays: number
  queryMatches: number
  score: number
}

interface ScoredSession {
  summary: string
  started_at: string
  ageDays: number
  queryMatches: number
  score: number
}

const STOP_WORDS = new Set([
  'alors', 'apres', 'avec', 'avoir', 'bien', 'cette', 'cela', 'celui', 'celle', 'comme', 'comment',
  'dans', 'des', 'donc', 'elle', 'elles', 'encore', 'entre', 'faire', 'faut', 'leur', 'leurs',
  'mais', 'meme', 'mes', 'moins', 'nous', 'pour', 'plus', 'pas', 'par', 'parce', 'quand', 'que',
  'quel', 'quelle', 'quelles', 'quels', 'sans', 'sera', 'ses', 'son', 'sont', 'sur', 'tres', 'tout',
  'tous', 'une', 'des', 'les', 'aux', 'est', 'ete', 'etre', 'jai', 'cest', 'dans', 'vers', 'entre',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'votre', 'vos', 'leur', 'leurs', 'oui', 'non',
  'soir', 'jour', 'fois', 'aussi', 'plusieurs', 'plutot', 'juste', 'ainsi', 'cela', 'celui', 'celle',
])

const POSITIVE_CUES = [
  'j adore', 'adore', 'aime', 'apprecie', 'regal', 'sublime', 'excellent', 'superbe', 'magnifique',
  'reussi', 'beaucoup aime', 'fan', 'plaisir', 'seduit', 'convaincu',
]

const NEGATIVE_CUES = [
  'n aime pas', 'deteste', 'evite', 'fatigue', 'lasse', 'decu', 'decevant', 'trop', 'pas fan',
  'supporte mal', 'me derange', 'je fuis', 'moins envie', 'me gene',
]

const PROGRESSION_CUES = [
  'debute', 'debutant', 'progresse', 'progression', 'apprendre', 'apprend', 'approfondir',
  'comparer', 'comparaison', 'comprendre', 'style', 'terroir', 'difference', 'devient',
]

const RELATIONSHIP_CUES = [
  'simple', 'claire', 'clairement', 'pas trop technique', 'sans jargon', 'comme un pote',
  'direct', 'franc', 'comparaison', 'guide', 'accompagne', 'pedagog',
]

const SOCIAL_CUES = [
  'ami', 'amis', 'invite', 'invites', 'conjoint', 'conjointe', 'femme', 'mari', 'famille',
  'parents', 'copains', 'copines', 'enfants',
]

const TOPIC_RULES: TopicRule[] = [
  { key: 'oak_style', label: 'Rapport au boise', patterns: ['boise', 'boisee', 'elevage', 'barrique', 'fut', 'oak'] },
  { key: 'freshness', label: 'Recherche de fraicheur', patterns: ['fraicheur', 'frais', 'frais', 'tendu', 'tension', 'vif'] },
  { key: 'elegance', label: 'Recherche d elegance', patterns: ['elegant', 'elegance', 'fin', 'finesse', 'delicat', 'digeste'] },
  { key: 'power', label: 'Rapport a la puissance', patterns: ['puissant', 'puissance', 'charpente', 'massif', 'opulent', 'demonstratif'] },
  { key: 'bourgogne', label: 'Affinite Bourgogne', patterns: ['bourgogne', 'meursault', 'puligny', 'chassagne', 'beaune', 'volnay', 'gevrey'] },
  { key: 'loire', label: 'Affinite Loire', patterns: ['loire', 'chenin', 'sancerre', 'vouvray', 'montlouis', 'saumur', 'chinon'] },
  { key: 'rhone', label: 'Affinite Rhone', patterns: ['rhone', 'cornas', 'crozes', 'hermitage', 'gigondas', 'cote rotie'] },
  { key: 'bordeaux', label: 'Affinite Bordeaux', patterns: ['bordeaux', 'pauillac', 'margaux', 'pomerol', 'saint emilion', 'medoc'] },
  { key: 'italy', label: 'Affinite vins italiens', patterns: ['italie', 'italien', 'barolo', 'brunello', 'nebbiolo', 'sangiovese', 'chianti'] },
  { key: 'bubbles', label: 'Rapport aux bulles', patterns: ['bulles', 'champagne', 'cremant', 'pet nat'] },
  { key: 'white_wines', label: 'Rapport aux blancs', patterns: ['vin blanc', 'blanc', 'chenin', 'riesling', 'chardonnay', 'sauvignon'] },
  { key: 'red_wines', label: 'Rapport aux rouges', patterns: ['vin rouge', 'rouge', 'pinot noir', 'syrah', 'gamay', 'cabernet', 'merlot'] },
  { key: 'budget', label: 'Sensibilite budget', patterns: ['budget', 'prix', 'cher', 'abordable', 'semaine', 'moins de', 'euro'] },
  { key: 'learning_style', label: 'Style d apprentissage', patterns: ['apprendre', 'comprendre', 'comparer', 'comparaison', 'explication', 'pedagog', 'simple', 'technique'] },
  { key: 'service_style', label: 'Style de relation', patterns: ['direct', 'franc', 'simple', 'sans jargon', 'comme un pote', 'court'] },
  { key: 'social_context', label: 'Contexte social', patterns: ['ami', 'amis', 'invite', 'invites', 'conjoint', 'conjointe', 'famille'] },
  { key: 'food_pairing', label: 'Accords et plats', patterns: ['accord', 'plat', 'osso bucco', 'poisson', 'viande', 'fromage', 'apero'] },
  { key: 'cellar_management', label: 'Gestion de cave', patterns: ['cave', 'encaver', 'achat', 'acheter', 'ouvrir', 'maturite', 'stocker'] },
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function nowMs(): number {
  return Date.now()
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
}

function uniqueLines(lines: string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines) {
    const key = normalizeText(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(line)
    if (result.length >= limit) break
  }

  return result
}

function hasAnyCue(text: string, cues: string[]): boolean {
  return cues.some((cue) => text.includes(cue))
}

function inferTopic(fact: StructuredMemoryFact): { key: string; label: string } {
  const normalized = normalizeText(fact.fact)

  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return { key: rule.key, label: rule.label }
    }
  }

  const tokens = extractTokens(fact.fact).slice(0, 2)
  if (tokens.length > 0) {
    const label = tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(' ')
    return { key: `${fact.category}:${tokens.join('_')}`, label }
  }

  return { key: `${fact.category}:generic`, label: fact.category }
}

function inferPolarity(fact: StructuredMemoryFact, normalized: string): MemoryPolarity {
  if (fact.is_temporary || fact.category === 'context') return 'temporary'
  if (fact.category === 'preference') return 'positive'
  if (fact.category === 'aversion') return 'negative'
  if (hasAnyCue(normalized, POSITIVE_CUES)) return 'positive'
  if (hasAnyCue(normalized, NEGATIVE_CUES)) return 'negative'
  return 'neutral'
}

function computeQueryMatches(tokens: string[], queryTokens: string[]): number {
  if (tokens.length === 0 || queryTokens.length === 0) return 0
  const tokenSet = new Set(tokens)
  return queryTokens.reduce((count, token) => count + (tokenSet.has(token) ? 1 : 0), 0)
}

function computeAgeDays(dateMs: number): number {
  const diff = Math.max(0, nowMs() - dateMs)
  return diff / (1000 * 60 * 60 * 24)
}

function computeRecencyWeight(ageDays: number): number {
  if (ageDays <= 14) return 1.35
  if (ageDays <= 45) return 1.2
  if (ageDays <= 120) return 1.05
  if (ageDays <= 240) return 0.9
  return 0.75
}

function computeStrengthBoost(normalized: string): number {
  if (normalized.includes('j adore') || normalized.includes('deteste')) return 0.25
  if (normalized.includes('regal') || normalized.includes('fatigue')) return 0.18
  if (normalized.includes('beaucoup')) return 0.1
  return 0
}

function isExpired(fact: StructuredMemoryFact): boolean {
  if (!fact.expires_at) return false
  const expiresMs = new Date(fact.expires_at).getTime()
  return Number.isFinite(expiresMs) && expiresMs <= nowMs()
}

function toScoredSignal(fact: StructuredMemoryFact, queryTokens: string[]): ScoredSignal | null {
  if (!fact.fact?.trim() || isExpired(fact)) return null

  const normalizedFact = normalizeText(fact.fact)
  const tokens = extractTokens(fact.fact)
  const { key, label } = inferTopic(fact)
  const polarity = inferPolarity(fact, normalizedFact)
  const confidence = clamp(fact.confidence ?? 0.8, 0.1, 1)
  const createdAtMs = fact.created_at ? new Date(fact.created_at).getTime() : nowMs()
  const safeCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : nowMs()
  const ageDays = computeAgeDays(safeCreatedAtMs)
  const queryMatches = computeQueryMatches(tokens, queryTokens)

  let score = computeRecencyWeight(ageDays) * (0.6 + confidence * 0.8)
  score += Math.min(queryMatches, 3) * 0.22
  score += computeStrengthBoost(normalizedFact)
  if (polarity === 'temporary') score += 0.18
  if (fact.category === 'life_event' || fact.category === 'social') score += 0.08

  return {
    raw: fact,
    normalizedFact,
    topicKey: key,
    topicLabel: label,
    polarity,
    tokens,
    confidence,
    createdAtMs: safeCreatedAtMs,
    ageDays,
    queryMatches,
    score,
  }
}

function scoreSessions(
  sessions: ConversationSummaryInput[] | undefined,
  queryTokens: string[],
): ScoredSession[] {
  return (sessions ?? [])
    .filter((session) => session.summary?.trim())
    .map((session) => {
      const summary = session.summary.trim()
      const tokens = extractTokens(summary)
      const startedAtMs = new Date(session.started_at).getTime()
      const safeStartedAtMs = Number.isFinite(startedAtMs) ? startedAtMs : nowMs()
      const ageDays = computeAgeDays(safeStartedAtMs)
      const queryMatches = computeQueryMatches(tokens, queryTokens)
      const score = computeRecencyWeight(ageDays) + Math.min(queryMatches, 4) * 0.28

      return {
        summary,
        started_at: session.started_at,
        ageDays,
        queryMatches,
        score,
      }
    })
    .sort((left, right) => right.score - left.score)
}

function buildHeadline(model: ResolvedUserModel): string | undefined {
  const pieces: string[] = []

  if (model.progression[0]) {
    pieces.push(model.progression[0])
  }
  if (model.evolvingTastes[0]) {
    pieces.push(model.evolvingTastes[0])
  } else if (model.stablePreferences[0]) {
    pieces.push(model.stablePreferences[0])
  }
  if (model.avoidNow[0]) {
    pieces.push(`Point d attention: ${model.avoidNow[0]}`)
  }

  if (pieces.length === 0) return undefined
  return pieces.slice(0, 3).join(' | ')
}

function buildEvolutionLine(latest: ScoredSignal, previous: ScoredSignal): string {
  return `${latest.topicLabel}: ${latest.raw.fact}. Ancien repere: ${previous.raw.fact}.`
}

function resolveUserModel(input: UserModelResolverInput): ResolvedUserModel {
  const queryTokens = extractTokens(input.message)
  const signals = (input.facts ?? [])
    .map((fact) => toScoredSignal(fact, queryTokens))
    .filter((signal): signal is ScoredSignal => signal !== null)
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.score - left.score)

  const groups = new Map<string, ScoredSignal[]>()
  for (const signal of signals) {
    const list = groups.get(signal.topicKey) ?? []
    list.push(signal)
    groups.set(signal.topicKey, list)
  }

  const stablePreferences: string[] = []
  const evolvingTastes: string[] = []
  const avoidNow: string[] = []
  const progression: string[] = []
  const relationshipStyle: string[] = []
  const socialContext: string[] = []
  const activeContexts: string[] = []
  const currentIntents: string[] = []
  const signatureMemories: string[] = []
  const supportingSignals: string[] = []

  for (const groupSignals of groups.values()) {
    const ordered = [...groupSignals].sort((left, right) => right.createdAtMs - left.createdAtMs || right.score - left.score)
    const latest = ordered[0]
    const positives = ordered.filter((signal) => signal.polarity === 'positive')
    const negatives = ordered.filter((signal) => signal.polarity === 'negative')
    const temporaries = ordered.filter((signal) => signal.polarity === 'temporary')

    if (temporaries.length > 0 && latest.polarity === 'temporary') {
      activeContexts.push(latest.raw.fact)
    }

    if (latest.raw.category === 'social' || hasAnyCue(latest.normalizedFact, SOCIAL_CUES)) {
      socialContext.push(latest.raw.fact)
    }

    if (latest.raw.category === 'cellar_intent') {
      currentIntents.push(latest.raw.fact)
    }

    if (latest.raw.category === 'life_event') {
      signatureMemories.push(latest.raw.fact)
    }

    if (
      latest.raw.category === 'wine_knowledge'
      || latest.topicKey === 'learning_style'
      || hasAnyCue(latest.normalizedFact, PROGRESSION_CUES)
    ) {
      progression.push(latest.raw.fact)
    }

    if (
      latest.raw.category === 'wine_knowledge'
      || latest.topicKey === 'learning_style'
      || latest.topicKey === 'service_style'
      || hasAnyCue(latest.normalizedFact, RELATIONSHIP_CUES)
    ) {
      relationshipStyle.push(latest.raw.fact)
    }

    const supportingCandidate =
      latest.queryMatches > 0
      || latest.raw.category === 'life_event'
      || latest.raw.category === 'social'
      || latest.ageDays <= 45
    if (supportingCandidate) {
      supportingSignals.push(latest.raw.fact)
    }

    const previousOpposite =
      latest.polarity === 'positive'
        ? negatives[0]
        : latest.polarity === 'negative'
          ? positives[0]
          : undefined

    if (
      previousOpposite
      && latest.polarity !== 'neutral'
      && latest.polarity !== 'temporary'
      && latest.createdAtMs > previousOpposite.createdAtMs
      && (latest.ageDays <= 240 || latest.queryMatches > 0)
    ) {
      evolvingTastes.push(buildEvolutionLine(latest, previousOpposite))
      if (latest.polarity === 'negative') {
        avoidNow.push(latest.raw.fact)
      }
      continue
    }

    if (latest.polarity === 'positive') {
      const positiveSupport = positives.reduce((sum, signal) => sum + signal.score, 0)
      const negativeSupport = negatives.reduce((sum, signal) => sum + signal.score, 0)
      if (positiveSupport >= Math.max(1.2, negativeSupport * 1.1)) {
        stablePreferences.push(latest.raw.fact)
      }
      continue
    }

    if (latest.polarity === 'negative') {
      avoidNow.push(latest.raw.fact)
    }
  }

  const relevantThreads = scoreSessions(input.previousSessions, queryTokens)
    .filter((session, index) => session.queryMatches > 0 || index < 2 || session.ageDays <= 30)
    .map((session) => session.summary)

  const model: ResolvedUserModel = {
    headline: undefined,
    stablePreferences: uniqueLines(stablePreferences, 5),
    evolvingTastes: uniqueLines(evolvingTastes, 4),
    avoidNow: uniqueLines(avoidNow, 4),
    progression: uniqueLines(progression, 3),
    relationshipStyle: uniqueLines(relationshipStyle, 3),
    socialContext: uniqueLines(socialContext, 3),
    activeContexts: uniqueLines(activeContexts, 4),
    currentIntents: uniqueLines(currentIntents, 3),
    signatureMemories: uniqueLines([...signatureMemories, ...relevantThreads], 4),
    relevantThreads: uniqueLines(relevantThreads, 3),
    supportingSignals: uniqueLines(supportingSignals, 4),
  }

  model.headline = buildHeadline(model)
  return model
}

function formatList(label: string, values: string[]): string | undefined {
  if (values.length === 0) return undefined
  return `${label}: ${values.join(' ; ')}`
}

function serializeSections(lines: Array<string | undefined>): string | undefined {
  const filtered = lines.filter((line): line is string => Boolean(line?.trim()))
  if (filtered.length === 0) return undefined
  return [
    'Portrait utilisateur actuel (prioritaire sur les notes brutes) :',
    ...filtered.map((line) => `- ${line}`),
    '- Regle: les evolutions recentes et les contextes temporaires priment sur les souvenirs plus anciens si tension.',
  ].join('\n')
}

function serializeGreetingView(model: ResolvedUserModel): string | undefined {
  return serializeSections([
    model.headline ? `Lecture generale: ${model.headline}` : undefined,
    formatList('Tonalite utile', model.relationshipStyle.slice(0, 2)),
    formatList('Fil recent', model.relevantThreads.slice(0, 1)),
  ])
}

function serializeConversationView(model: ResolvedUserModel): string | undefined {
  return serializeSections([
    model.headline ? `Cap actuel: ${model.headline}` : undefined,
    formatList('Gouts stables', model.stablePreferences),
    formatList('Evolutions recentes', model.evolvingTastes),
    formatList('Niveau et progression', model.progression),
    formatList('Style de guidage', model.relationshipStyle),
    formatList('Souvenirs mobilisables', model.signatureMemories),
  ])
}

function serializeRecommendationView(model: ResolvedUserModel): string | undefined {
  return serializeSections([
    model.headline ? `Lecture generale: ${model.headline}` : undefined,
    formatList('Gouts a privilegier', model.stablePreferences),
    formatList('Evolutions recentes a prendre en compte', model.evolvingTastes),
    formatList('A eviter maintenant', model.avoidNow),
    formatList('Contexte temporaire actif', model.activeContexts),
    formatList('Contexte social', model.socialContext),
    formatList('Intentions utiles', model.currentIntents),
    formatList('Souvenirs utiles', model.signatureMemories),
  ])
}

function serializeRestaurantView(model: ResolvedUserModel): string | undefined {
  return serializeSections([
    model.headline ? `Lecture generale: ${model.headline}` : undefined,
    formatList('Preferences utiles a table', model.stablePreferences),
    formatList('A eviter', model.avoidNow),
    formatList('Contexte social', model.socialContext),
    formatList('Style de guidage', model.relationshipStyle),
  ])
}

function serializeMemoryView(model: ResolvedUserModel): string | undefined {
  return serializeSections([
    model.headline ? `Lecture generale: ${model.headline}` : undefined,
    formatList('Souvenirs signature', model.signatureMemories),
    formatList('Fils recents', model.relevantThreads),
    formatList('Evolutions recentes', model.evolvingTastes),
    formatList('Reperes stables', model.stablePreferences.slice(0, 3)),
  ])
}

export function buildResolvedUserModel(input: UserModelResolverInput): string | undefined {
  if ((input.facts?.length ?? 0) === 0 && (input.previousSessions?.length ?? 0) === 0) {
    return undefined
  }

  const model = resolveUserModel(input)

  switch (input.cognitiveMode) {
    case 'greeting':
    case 'social':
      return serializeGreetingView(model)
    case 'wine_conversation':
      return serializeConversationView(model)
    case 'restaurant_assistant':
      return serializeRestaurantView(model)
    case 'tasting_memory':
      return serializeMemoryView(model)
    case 'cellar_assistant':
    default:
      return serializeRecommendationView(model)
  }
}

function overlapRatio(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0
  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  let intersection = 0

  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1
  }

  return intersection / Math.max(leftSet.size, rightSet.size)
}

export function findConflictingMemoryFacts(
  existingFacts: StructuredMemoryFact[],
  incomingFact: StructuredMemoryFact,
): { duplicateIds: string[]; supersedeIds: string[] } {
  const incoming = toScoredSignal(incomingFact, [])
  if (!incoming) return { duplicateIds: [], supersedeIds: [] }

  const duplicateIds: string[] = []
  const supersedeIds: string[] = []

  for (const existingFact of existingFacts) {
    if (!existingFact.id || isExpired(existingFact)) continue

    const existing = toScoredSignal(existingFact, [])
    if (!existing) continue
    if (existing.topicKey !== incoming.topicKey) continue

    const ratio = overlapRatio(existing.tokens, incoming.tokens)
    const samePolarity = existing.polarity === incoming.polarity
    const opposingPolarity =
      (existing.polarity === 'positive' && incoming.polarity === 'negative')
      || (existing.polarity === 'negative' && incoming.polarity === 'positive')

    if (
      samePolarity
      && (existing.normalizedFact === incoming.normalizedFact || ratio >= 0.82)
    ) {
      duplicateIds.push(existingFact.id)
      continue
    }

    if (
      opposingPolarity
      || (existing.polarity === 'temporary' && incoming.polarity === 'temporary')
      || (
        samePolarity
        && existing.raw.category === 'cellar_intent'
        && incoming.raw.category === 'cellar_intent'
        && ratio >= 0.5
      )
    ) {
      supersedeIds.push(existingFact.id)
    }
  }

  return {
    duplicateIds: Array.from(new Set(duplicateIds)),
    supersedeIds: Array.from(new Set(supersedeIds)),
  }
}
