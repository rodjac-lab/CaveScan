// ── Questionnaire de profil Célestin ──
// Types, questions, scoring, transition messages

// --- Types ---

export interface FWIScores {
  connoisseur: number   // Séquence A (6 questions × 1-5 = 6-30)
  knowledge: number     // Séquence B
  provenance: number    // Séquence C
  total: number         // Sum of all three
  segment: 'enthusiast' | 'aspirant' | 'nofrills'
}

export interface SensoryPreferences {
  structure: 'puissance' | 'elegance'
  aromatique: 'fruits_murs' | 'fruits_frais'
  evolution: 'jeune' | 'tertiaire'
  elevage: 'bois' | 'mineral'
  acidite: 'tendu' | 'rond'
  regions: string[]
  neophilie: 'valeurs_sures' | 'decouverte'
}

export interface QuestionnaireProfile {
  fwi: FWIScores
  sensory: SensoryPreferences
  marketingProfile: string
  completedAt: string
  version: number
}

// --- Questions FWI ---

export interface FWIQuestion {
  id: string
  text: string
}

export const SEQUENCE_A: FWIQuestion[] = [
  { id: 'A1', text: 'Quand j\'ouvre une bouteille, j\'observe la robe, je prends le temps de sentir avant de goûter.' },
  { id: 'A2', text: 'Je fais attention à la température de service — un vin trop froid ou trop chaud me dérange.' },
  { id: 'A3', text: 'Il m\'arrive de décanter un vin avant de le servir.' },
  { id: 'A4', text: 'Je note mentalement ce que je ressens quand je déguste — les arômes, la texture, la longueur.' },
  { id: 'A5', text: 'Je choisis mes verres en fonction du vin que je sers.' },
  { id: 'A6', text: 'Je suis capable de sentir si un vin est encore jeune et fermé, ou s\'il a commencé à s\'ouvrir.' },
]

export const SEQUENCE_B: FWIQuestion[] = [
  { id: 'B1', text: 'Je connais les grandes régions viticoles françaises et ce qui les différencie.' },
  { id: 'B2', text: 'Je suis capable d\'associer un cépage à son profil aromatique — un pinot noir, un syrah, un riesling ne se ressemblent pas.' },
  { id: 'B3', text: 'Je comprends ce que le millésime change dans un vin.' },
  { id: 'B4', text: 'Je sais estimer si un vin est à son apogée ou s\'il mérite encore quelques années de cave.' },
  { id: 'B5', text: 'Je consulte des guides, des notes ou des avis avant d\'acheter une bouteille importante.' },
  { id: 'B6', text: 'Je m\'intéresse à comment le vin est fait — viticulture bio, élevage en fût, vendanges tardives...' },
]

export const SEQUENCE_C: FWIQuestion[] = [
  { id: 'C1', text: 'L\'appellation est un critère important quand je choisis un vin.' },
  { id: 'C2', text: 'Je fais attention au nom du domaine ou du vigneron, pas seulement à la région.' },
  { id: 'C3', text: 'La notion de terroir — ce que le sol, le climat, le lieu apportent au vin — a du sens pour moi.' },
  { id: 'C4', text: 'J\'ai des domaines ou des producteurs favoris que je suis avec fidélité.' },
  { id: 'C5', text: 'Je suis prêt à payer significativement plus cher pour une appellation que j\'estime supérieure.' },
  { id: 'C6', text: 'L\'origine géographique d\'un vin influence ma perception de sa qualité avant même de le goûter.' },
]

// --- Questions sensorielles ---

export interface SensoryQuestion {
  id: string
  text: string
  optionA: { label: string; value: string }
  optionB: { label: string; value: string }
  field: keyof SensoryPreferences
  multiSelect?: boolean
}

export const SENSORY_QUESTIONS: SensoryQuestion[] = [
  {
    id: 'S1',
    text: 'Quel style de vin te parle le plus ?',
    optionA: { label: 'Puissant et charnu', value: 'puissance' },
    optionB: { label: 'Fin et élégant', value: 'elegance' },
    field: 'structure',
  },
  {
    id: 'S2',
    text: 'Côté arômes, tu penches plutôt vers...',
    optionA: { label: 'Fruits mûrs et chaleureux', value: 'fruits_murs' },
    optionB: { label: 'Fruits frais et nerveux', value: 'fruits_frais' },
    field: 'aromatique',
  },
  {
    id: 'S3',
    text: 'Si tu devais choisir entre...',
    optionA: { label: 'Jeune et fruité', value: 'jeune' },
    optionB: { label: 'Évolué et complexe', value: 'tertiaire' },
    field: 'evolution',
  },
  {
    id: 'S4',
    text: 'En matière d\'élevage, tu préfères...',
    optionA: { label: 'Marqué par le bois', value: 'bois' },
    optionB: { label: 'Pur et minéral', value: 'mineral' },
    field: 'elevage',
  },
  {
    id: 'S5',
    text: 'Pour l\'équilibre en bouche...',
    optionA: { label: 'Tendu et acide', value: 'tendu' },
    optionB: { label: 'Rond et souple', value: 'rond' },
    field: 'acidite',
  },
  {
    id: 'S6',
    text: 'Quelles régions t\'attirent le plus ? (jusqu\'à 3)',
    optionA: { label: '', value: '' },
    optionB: { label: '', value: '' },
    field: 'regions',
    multiSelect: true,
  },
  {
    id: 'S7',
    text: 'En général, tu dirais que...',
    optionA: { label: 'Je reviens sur mes valeurs sûres', value: 'valeurs_sures' },
    optionB: { label: 'J\'aime découvrir l\'inconnu', value: 'decouverte' },
    field: 'neophilie',
  },
]

export const REGION_OPTIONS = [
  { label: 'Bourgogne', value: 'bourgogne' },
  { label: 'Bordeaux', value: 'bordeaux' },
  { label: 'Rhône', value: 'rhone' },
  { label: 'Loire', value: 'loire' },
  { label: 'Alsace', value: 'alsace' },
  { label: 'Champagne', value: 'champagne' },
  { label: 'Italie', value: 'italie' },
  { label: 'Espagne', value: 'espagne' },
  { label: 'Nouveau Monde', value: 'nouveau_monde' },
  { label: 'J\'explore tout', value: 'explore_tout' },
]

// --- Scoring ---

export function computeFWIScores(answers: Record<string, number>): FWIScores {
  const connoisseur = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].reduce((sum, id) => sum + (answers[id] ?? 3), 0)
  const knowledge = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].reduce((sum, id) => sum + (answers[id] ?? 3), 0)
  const provenance = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].reduce((sum, id) => sum + (answers[id] ?? 3), 0)
  const total = connoisseur + knowledge + provenance

  let segment: FWIScores['segment']
  if (total > 65) segment = 'enthusiast'
  else if (total >= 40) segment = 'aspirant'
  else segment = 'nofrills'

  return { connoisseur, knowledge, provenance, total, segment }
}

export function computeMarketingProfile(fwi: FWIScores, sensory: SensoryPreferences): string {
  // Rule 1: enthusiast + elegance + tertiaire + mineral → "Le Classique Exigeant"
  if (
    fwi.segment === 'enthusiast' &&
    sensory.structure === 'elegance' &&
    sensory.evolution === 'tertiaire' &&
    sensory.elevage === 'mineral'
  ) {
    return 'Le Classique Exigeant'
  }

  // Rule 2: enthusiast/aspirant + puissance + fruits_murs → "L'Hédoniste Solaire"
  if (
    (fwi.segment === 'enthusiast' || fwi.segment === 'aspirant') &&
    sensory.structure === 'puissance' &&
    sensory.aromatique === 'fruits_murs'
  ) {
    return "L'Hédoniste Solaire"
  }

  // Rule 3: neophilie=decouverte → "L'Explorateur Curieux"
  if (sensory.neophilie === 'decouverte') {
    return "L'Explorateur Curieux"
  }

  // Rule 4: enthusiast + valeurs_sures + provenance > 20 → "Le Bourguignon dans l'Âme"
  if (
    fwi.segment === 'enthusiast' &&
    sensory.neophilie === 'valeurs_sures' &&
    fwi.provenance > 20
  ) {
    return "Le Bourguignon dans l'Âme"
  }

  // Fallback profiles
  if (fwi.segment === 'nofrills') return 'Le Bon Vivant'
  if (fwi.segment === 'aspirant') return "L'Amateur Curieux"
  return "L'Enthusiast Éclectique"
}

// --- Transition messages (style Célestin : tutoiement, direct, pas de lyrisme) ---

export function getSequenceATransition(score: number): string {
  if (score >= 24) return 'Tu es quelqu\'un de méthodique et d\'attentif dans ta façon de déguster. Le genre qui ne se contente pas de boire — tu prends le temps de comprendre.'
  if (score >= 20) return 'Tu as de bons réflexes de dégustateur. Le nez, la température, le verre — tu fais attention sans te prendre la tête.'
  if (score >= 15) return 'Tu apprécies le vin sans te compliquer la vie — c\'est une belle façon de le vivre aussi.'
  return 'Le plaisir avant tout, pas de chichis. Ça se respecte.'
}

export function getSequenceBTransition(score: number): string {
  if (score >= 24) return 'Tu en sais clairement beaucoup sur le vin. Cépages, millésimes, régions — tu maîtrises ton sujet.'
  if (score >= 20) return 'Tu as de solides bases. Pas un expert sur tout, mais tu sais de quoi tu parles quand tu choisis une bouteille.'
  if (score >= 15) return 'Tu es en train de construire ta culture vin. C\'est exactement pour ça que je suis là.'
  return 'Le vin, tu le bois d\'abord avec le plaisir. La théorie viendra avec le temps — et je serai là pour t\'accompagner.'
}

export function getSequenceCTransition(score: number): string {
  if (score >= 24) return 'Le terroir, l\'appellation, le vigneron — c\'est central pour toi. Tu ne choisis pas un vin au hasard.'
  if (score >= 20) return 'L\'origine compte pour toi, même si ce n\'est pas le seul critère. Un bon équilibre.'
  if (score >= 15) return 'Tu t\'intéresses à l\'origine sans en faire une obsession. C\'est une approche pragmatique.'
  return 'L\'étiquette ne fait pas tout pour toi — c\'est ce qu\'il y a dans le verre qui compte.'
}

// --- Final profile description (style Célestin) ---

export function buildProfileDescription(fwi: FWIScores, sensory: SensoryPreferences, _marketingProfile: string): string {
  const parts: string[] = []

  // Opening
  parts.push('J\'en sais maintenant beaucoup plus sur toi.')

  // FWI segment description
  if (fwi.segment === 'enthusiast') {
    parts.push('Tu es un amateur exigeant, le genre qui prend le vin au sérieux sans se prendre au sérieux.')
  } else if (fwi.segment === 'aspirant') {
    parts.push('Tu es en pleine montée en puissance dans ta passion du vin.')
  } else {
    parts.push('Tu vis le vin sans prise de tête — le plaisir d\'abord.')
  }

  // Sensory preferences
  const styleParts: string[] = []
  if (sensory.structure === 'elegance') {
    styleParts.push('la finesse et l\'élégance')
  } else {
    styleParts.push('la puissance et la générosité')
  }

  if (sensory.evolution === 'tertiaire') {
    styleParts.push('les vins qui ont eu le temps de s\'exprimer')
  } else {
    styleParts.push('la fraîcheur et le fruit')
  }

  if (sensory.elevage === 'mineral') {
    styleParts.push('la pureté minérale')
  } else {
    styleParts.push('la complexité du bois')
  }

  parts.push(`Tu aimes ${styleParts.join(', ')}.`)

  // Regions
  if (sensory.regions.length > 0) {
    const regionLabels = sensory.regions.map(r => {
      const found = REGION_OPTIONS.find(ro => ro.value === r)
      return found?.label ?? r
    })
    if (regionLabels.length === 1 && regionLabels[0] === 'J\'explore tout') {
      parts.push('Côté régions, tu es ouvert à tout — c\'est ce qui rend les recommandations intéressantes.')
    } else {
      parts.push(`${regionLabels.join(', ')} — ${regionLabels.length > 1 ? 'ce sont clairement tes terres' : 'c\'est clairement ton terrain'} de prédilection.`)
    }
  }

  return parts.join(' ')
}

// --- Serialize for Célestin system prompt ---

export function serializeQuestionnaireForPrompt(q: QuestionnaireProfile): string {
  const lines: string[] = [
    '# Profil questionnaire utilisateur',
    `Profil : ${q.marketingProfile}`,
    `Segment FWI : ${q.fwi.segment} (total ${q.fwi.total}/90)`,
    `  Sensibilité : ${q.fwi.connoisseur}/30`,
    `  Savoir : ${q.fwi.knowledge}/30`,
    `  Terroir : ${q.fwi.provenance}/30`,
  ]

  const sensoryLabels: Record<string, Record<string, string>> = {
    structure: { puissance: 'Puissant et charnu', elegance: 'Fin et élégant' },
    aromatique: { fruits_murs: 'Fruits mûrs', fruits_frais: 'Fruits frais' },
    evolution: { jeune: 'Jeune et fruité', tertiaire: 'Évolué et complexe' },
    elevage: { bois: 'Marqué par le bois', mineral: 'Pur et minéral' },
    acidite: { tendu: 'Tendu et acide', rond: 'Rond et souple' },
    neophilie: { valeurs_sures: 'Valeurs sûres', decouverte: 'Découverte' },
  }

  lines.push('Préférences sensorielles :')
  for (const [key, map] of Object.entries(sensoryLabels)) {
    const val = q.sensory[key as keyof SensoryPreferences] as string
    lines.push(`  ${key} : ${map[val] ?? val}`)
  }

  if (q.sensory.regions.length > 0) {
    const regionLabels = q.sensory.regions.map(r => REGION_OPTIONS.find(ro => ro.value === r)?.label ?? r)
    lines.push(`  Régions favorites : ${regionLabels.join(', ')}`)
  }

  return lines.join('\n')
}
