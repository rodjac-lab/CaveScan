export type ChatIntent = 'encaver' | 'deguster' | 'sommelier'

const ENCAVER_KEYWORDS = [
  'acheté', 'acheter', 'achetée', 'achetées', 'achetés',
  'reçu', 'reçue', 'recevoir',
  'commandé', 'commandée', 'commander',
  'rentrer', 'rentré',
  'encaver', 'encavé',
  'ajouter', 'ajouté',
  'arrivé', 'arrivée',
  'livré', 'livrée', 'livraison',
  'ramené', 'ramenée',
  'stocker', 'stocké',
]

const DEGUSTER_KEYWORDS = [
  'dégusté', 'dégustée', 'déguster',
  'bu', 'bue', 'boire',
  'ouvert', 'ouverte', 'ouvrir',
  'goûté', 'goûtée', 'goûter',
  'hier soir', 'ce midi', 'ce soir',
  'dîner', 'déjeuner',
  'on a bu', 'on a ouvert',
  'j\'ai bu', 'j\'ai ouvert',
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function detectIntent(message: string): ChatIntent {
  const normalized = normalize(message)

  for (const kw of DEGUSTER_KEYWORDS) {
    if (normalized.includes(normalize(kw))) return 'deguster'
  }

  for (const kw of ENCAVER_KEYWORDS) {
    if (normalized.includes(normalize(kw))) return 'encaver'
  }

  return 'sommelier'
}
