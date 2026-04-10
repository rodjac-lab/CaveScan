import type { CelestinEvalScenario } from '@/lib/celestinEval'

const FORBIDDEN_PATTERNS_DEFAULT = ['Ah,', 'Ah ', 'Excellente question', 'Tu as tout à fait raison', "Salut l'ami", 'Absolument']

export const CELESTIN_EVAL_SCENARIOS: CelestinEvalScenario[] = [
  {
    id: 'reco_ce_soir',
    message: "Qu'est-ce que j'ouvre ce soir ?",
    notes: 'Reco ouverte sans contrainte. 3-5 cartes, vins de la cave.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'accord_sushi',
    message: 'Ce soir sushi',
    notes: 'Pas de rouge tannique. Priorite blanc/bulles.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      avoidColors: ['rouge'],
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'accord_osso_bucco',
    message: 'Osso bucco ce soir',
    notes: 'Souvenirs osso bucco utilises correctement. "passe son pic" != "pas aime".',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'fromage',
    message: 'Plateau de fromages',
    notes: 'Priorite au blanc.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'un_rouge',
    message: 'Un rouge pour ce soir',
    notes: 'Contexte suffisant, pas de relance.',
    expectations: {
      expectedUiActionKind: 'show_recommendations',
      expectRelay: false,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'relance_accord',
    message: 'Accord mets & vin',
    notes: 'Contexte incomplet. Doit poser une question ("Qu\'est-ce que tu manges ?").',
    expectations: {
      expectedUiActionKind: 'none',
      expectRelay: true,
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
      maxWordCount: 60,
    },
  },
  {
    id: 'relance_vague',
    message: 'Un bon vin',
    notes: 'Trop vague. Doit relancer ("Pour quelle occasion ?").',
    expectations: {
      expectedUiActionKind: 'none',
      expectRelay: true,
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
      maxWordCount: 60,
    },
  },
  {
    id: 'culture_vin',
    message: 'Quels domaines ont plante des cepages atypiques dans leur region ?',
    notes: 'Question culture vin. Reponse avec noms concrets, pas de renvoi vers la cave.',
    history: [],
    expectations: {
      expectedUiActionKind: 'none',
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
    },
  },
  {
    id: 'encavage_conversationnel',
    message: "J'ai achete un Crozes-Hermitage 2022",
    notes: 'Pas de prepare_add_wine immediat. Doit demander le domaine.',
    expectations: {
      expectedUiActionKind: 'none',
      expectRelay: true,
      maxCards: 0,
      forbiddenPatterns: FORBIDDEN_PATTERNS_DEFAULT,
      maxWordCount: 40,
    },
  },
  {
    id: 'souvenir_maturite',
    message: "Qu'est-ce que tu penses du Brunello ?",
    notes: 'Ne doit PAS dire "pas aime" ou "pas emballe". Maturite != jugement.',
    history: [
      {
        role: 'user',
        content: "On a ouvert le Brunello di Montalcino 2015 hier soir avec un osso bucco.",
      },
      {
        role: 'assistant',
        content: "Un Brunello 2015 avec un osso bucco, c'est un bel accord. Comment tu l'as trouve ?",
      },
      {
        role: 'user',
        content: "Excellent ! Mais il etait passe son pic, un peu fatigue sur la fin. Le nez etait superbe par contre.",
      },
    ],
    expectations: {
      expectedUiActionKind: 'none',
      maxCards: 0,
      forbiddenPatterns: [...FORBIDDEN_PATTERNS_DEFAULT, 'pas aime', 'pas emballe', "n'a pas plu", 'decu'],
    },
  },
]
