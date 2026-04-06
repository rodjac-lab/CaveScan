export interface StructuredMemoryFact {
  id?: string
  category: string
  fact: string
  confidence?: number
  is_temporary?: boolean
  expires_at?: string | null
  created_at?: string | null
}

type MemoryPolarity = 'positive' | 'negative' | 'neutral' | 'temporary'

interface TopicRule {
  key: string
  patterns: string[]
}

interface ScoredSignal {
  raw: StructuredMemoryFact
  normalizedFact: string
  topicKey: string
  polarity: MemoryPolarity
  tokens: string[]
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

const TOPIC_RULES: TopicRule[] = [
  { key: 'oak_style', patterns: ['boise', 'boisee', 'elevage', 'barrique', 'fut', 'oak'] },
  { key: 'freshness', patterns: ['fraicheur', 'frais', 'tendu', 'tension', 'vif'] },
  { key: 'elegance', patterns: ['elegant', 'elegance', 'fin', 'finesse', 'delicat', 'digeste'] },
  { key: 'power', patterns: ['puissant', 'puissance', 'charpente', 'massif', 'opulent', 'demonstratif'] },
  { key: 'bourgogne', patterns: ['bourgogne', 'meursault', 'puligny', 'chassagne', 'beaune', 'volnay', 'gevrey'] },
  { key: 'loire', patterns: ['loire', 'chenin', 'sancerre', 'vouvray', 'montlouis', 'saumur', 'chinon'] },
  { key: 'rhone', patterns: ['rhone', 'cornas', 'crozes', 'hermitage', 'gigondas', 'cote rotie'] },
  { key: 'bordeaux', patterns: ['bordeaux', 'pauillac', 'margaux', 'pomerol', 'saint emilion', 'medoc'] },
  { key: 'italy', patterns: ['italie', 'italien', 'barolo', 'brunello', 'nebbiolo', 'sangiovese', 'chianti'] },
  { key: 'bubbles', patterns: ['bulles', 'champagne', 'cremant', 'pet nat'] },
  { key: 'white_wines', patterns: ['vin blanc', 'blanc', 'chenin', 'riesling', 'chardonnay', 'sauvignon'] },
  { key: 'red_wines', patterns: ['vin rouge', 'rouge', 'pinot noir', 'syrah', 'gamay', 'cabernet', 'merlot'] },
  { key: 'budget', patterns: ['budget', 'prix', 'cher', 'abordable', 'semaine', 'moins de', 'euro'] },
  { key: 'learning_style', patterns: ['apprendre', 'comprendre', 'comparer', 'comparaison', 'explication', 'pedagog', 'simple', 'technique'] },
  { key: 'service_style', patterns: ['direct', 'franc', 'simple', 'sans jargon', 'comme un pote', 'court'] },
  { key: 'social_context', patterns: ['ami', 'amis', 'invite', 'invites', 'conjoint', 'conjointe', 'famille'] },
  { key: 'food_pairing', patterns: ['accord', 'plat', 'osso bucco', 'poisson', 'viande', 'fromage', 'apero'] },
  { key: 'cellar_management', patterns: ['cave', 'encaver', 'achat', 'acheter', 'ouvrir', 'maturite', 'stocker'] },
]

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

function hasAnyCue(text: string, cues: string[]): boolean {
  return cues.some((cue) => text.includes(cue))
}

function inferTopicKey(fact: StructuredMemoryFact): string {
  const normalized = normalizeText(fact.fact)

  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule.key
    }
  }

  const tokens = extractTokens(fact.fact).slice(0, 2)
  if (tokens.length > 0) {
    return `${fact.category}:${tokens.join('_')}`
  }

  return `${fact.category}:generic`
}

function inferPolarity(fact: StructuredMemoryFact, normalized: string): MemoryPolarity {
  if (fact.is_temporary || fact.category === 'context') return 'temporary'
  if (fact.category === 'preference') return 'positive'
  if (fact.category === 'aversion') return 'negative'
  if (hasAnyCue(normalized, POSITIVE_CUES)) return 'positive'
  if (hasAnyCue(normalized, NEGATIVE_CUES)) return 'negative'
  return 'neutral'
}

function isExpired(fact: StructuredMemoryFact): boolean {
  if (!fact.expires_at) return false
  const expiresAt = Date.parse(fact.expires_at)
  return Number.isFinite(expiresAt) ? expiresAt <= Date.now() : false
}

function toScoredSignal(fact: StructuredMemoryFact): ScoredSignal | null {
  const normalizedFact = normalizeText(fact.fact)
  if (!normalizedFact) return null

  return {
    raw: fact,
    normalizedFact,
    topicKey: inferTopicKey(fact),
    polarity: inferPolarity(fact, normalizedFact),
    tokens: extractTokens(fact.fact),
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
  const incoming = toScoredSignal(incomingFact)
  if (!incoming) return { duplicateIds: [], supersedeIds: [] }

  const duplicateIds: string[] = []
  const supersedeIds: string[] = []

  for (const existingFact of existingFacts) {
    if (!existingFact.id || isExpired(existingFact)) continue

    const existing = toScoredSignal(existingFact)
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
