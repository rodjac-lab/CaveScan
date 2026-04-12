import type { CognitiveMode } from './turn-types.ts'

export interface RoutingSignals {
  lower: string
  hadRecentReco: boolean
  isInventoryQuestion: boolean
  isTastingMemoryFollowUp: boolean
  isSocialAck: boolean
  isCancel: boolean
  isRefinement: boolean
  isMemoryGuidedRecommendation: boolean
  isExploratoryRecoPivot: boolean
  isWineCulture: boolean
  isQuestion: boolean
  isRecommendationRequest: boolean
  isEncavageRequest: boolean
  isTastingReference: boolean
  isMemoryReference: boolean
  isRestaurantImage: boolean
  isImageWineQuestion: boolean
}

const SOCIAL_ACK = [
  /^(merci|super|ok|d'accord|parfait|genial|cool|top|nice|bien|bonne idee|ah ok|je vois|compris|entendu|c'est bon|haha|mdr|lol)[.! ]*$/i,
]

const CANCEL = [
  /^(non merci|pas pour moi|ca ira|laisse tomber|tant pis|on oublie|rien|non c'est bon|non rien)[.! ]*$/i,
  /\b(laisse tomber|tant pis|on oublie)\b/i,
]

const RECOMMENDATION = [
  /\b(que? boire|recommande|propose|ce soir|pour accompagner|ouvre[- ]moi|quel vin|avec (ce|le|du|des|mon|ma|mes|un|une)|accord|accords mets)\b/i,
  /\b(pour aller avec|pour manger|pour diner|pour le repas)\b/i,
  /\b(qu.est-ce que j.ouvr|je pourrais ouvrir|quelque chose a ouvrir|qu.est-ce qu.on ouvre|on ouvre quoi|quoi ouvrir)\b/i,
]

const REFINEMENT = [
  /\b(en blanc|en rouge|en rose|en bulles|un blanc|un rouge|une bulle|autre chose|une autre|plutot un|sinon)\b/i,
  /\b(tu en as|t.en as|d.autres?|en as[- ]tu)\b/i,
]

const MEMORY_GUIDED_RECOMMENDATION = [
  /\b(dans l[' ]esprit|dans la veine|comme ce qu[' ]on avait aime|comme ce qu[' ]on avait aime|comme ce qu[' ]on avait aimé|dans le style de|quelque chose qui rappelle)\b/i,
  /\b(ce qu[' ]on avait aime avec|ce qu[' ]on avait aimé avec)\b/i,
]

const EXPLORATORY_RECO_PIVOT = [
  /^(et si je veux|et si je cherche|et si je prends)\b/i,
]

const ENCAVAGE = [
  /\b(achete|recu|commande|encave[rz]?|ajoute[rz]?|arrive|livre|ramene|stocke[rz]?|j'ai pris|j'ai achete)(?:\s|$|[.,!?])/i,
]

const TASTING = [
  /\b(deguste|goute)(?:\s|$|[.,!?])/i,
  /\b(bu |ouvert |hier soir|on a bu|note ca|degustation)\b/i,
]

const MEMORY = [
  /\b(tu te souviens|la derniere fois|chez \w+|on avait bu|rappelle|souvenir)\b/i,
  /\b(ai[- ]je deja bu|deja bu|deja goute|deja ouvert)\b/i,
  /\bdeja\b.*\b(note|noté|notee|notée|degustation|dégustation)\b/i,
  /\b(retrouve|retrouver|retrouverais|retrouvera?is|retrouveras)\b.*\b(note|degustation|dégustation|souvenir)\b/i,
  /\bje l[' ]?ai\b.*\b(note|noté|notee|notée|deguste|dégusté|goute|goûté|bu)\b/i,
]

const CELLAR_LOOKUP = [
  /\b(dans|de|en)\s+ma cave\b/i,
  /\ben cave\b/i,
  /\b(parle[- ]moi de ma cave|ma cave)\b/i,
  /\b(est-ce que j'ai|ai[- ]je|j'ai)\s+(du|de la|de l'|des|un|une)\b/i,
  /\b(combien\s+(j'ai|ai[- ]je)?\s*de?\s*bouteilles?)\b/i,
  /\b(quelles?\s+sont\s+les?\s+bouteilles?)\b/i,
  /\b(quels?\s+vins?\s+(j'ai|ai[- ]je|y a-t-il))\b/i,
  /\b(qu'est-ce que j'ai|j'ai quoi)\b/i,
]

const WINE_CULTURE = [
  /\b(c'est quoi|qu'est-ce qu|difference entre|les terroirs|parle[- ]moi|explique|raconte|dis[- ]moi)\b/i,
  /^(le |la |les |un |une |du )?(pinot|chardonnay|merlot|cabernet|syrah|grenache|gamay|chenin|riesling|sauvignon|malbec|nebbiolo|sangiovese|tempranillo)\b/i,
]

const QUESTION = [
  /^(pourquoi|comment|quoi|c'est quoi|qu'est-ce qu|est-ce que|tu (aimes?|connais|preferes|penses|sais|crois))/i,
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function normalizeForRouting(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isCellarFollowUp(text: string, lastAssistantText?: string): boolean {
  if (!lastAssistantText) return false

  const normalizedText = normalizeForRouting(text)
  const normalizedAssistantText = normalizeForRouting(lastAssistantText)

  const assistantWasTalkingAboutCellar =
    /\b(cave|bouteilles?|enregistre|enregistree|enregistres|tu n'as|tu as)\b/i.test(normalizedAssistantText)

  if (!assistantWasTalkingAboutCellar) return false

  return /\b(c'est pas du|c'en est pas|tu en as pas)\b/i.test(normalizedText)
}

function isMemoryFollowUp(text: string, lastAssistantText?: string): boolean {
  if (!lastAssistantText) return false

  const normalizedText = normalizeForRouting(text)
  const normalizedAssistantText = normalizeForRouting(lastAssistantText)

  const assistantWasTalkingAboutMemory =
    /\b(souvenir|on avait|tu avais|tu l'avais|l'avais|avait eu|la derniere fois|ce soir-la|degust|bue?s?\b|ouvert|millesime|etoiles?|notes?)\b/i.test(normalizedAssistantText)

  if (!assistantWasTalkingAboutMemory) return false

  return (
    /^(et|et le|et la|et les|et lui|et elle)\b/i.test(normalizedText)
    || /\b(c'etait comment|c.etait comment|c'etait quoi|c.etait quoi)\b/i.test(normalizedText)
    || /\b(quel millesime|quelle note|combien d'etoiles|combien etoiles|quelle impression)\b/i.test(normalizedText)
    || /\bon avait\b.*\b(note|notes|etoiles?)\b/i.test(normalizedText)
    || /^c'est tout[?! ]*$/i.test(normalizedText)
  )
}

export function detectCognitiveMode(lower: string): CognitiveMode {
  if (matchesAny(lower, MEMORY) || matchesAny(lower, TASTING)) return 'tasting_memory'
  if (matchesAny(lower, CELLAR_LOOKUP) || matchesAny(lower, RECOMMENDATION) || matchesAny(lower, ENCAVAGE)) {
    return 'cellar_assistant'
  }
  return 'wine_conversation'
}

export function buildRoutingSignals(message: string, lastAssistantText?: string): RoutingSignals {
  const lower = normalizeForRouting(message)
  const normalizedAssistant = lastAssistantText ? normalizeForRouting(lastAssistantText) : ''
  const hadRecentReco = normalizedAssistant
    ? normalizedAssistant.includes('[vins proposes')
      || /\b(je te propose|voici .*pistes?|trois pistes?|recommandations?|je partirais sur|shortlist)\b/i.test(normalizedAssistant)
    : false
  const isQuestion = matchesAny(lower, QUESTION)
  const isWineCulture = matchesAny(lower, WINE_CULTURE)

  return {
    lower,
    hadRecentReco,
    isInventoryQuestion: matchesAny(lower, CELLAR_LOOKUP) || isCellarFollowUp(lower, lastAssistantText),
    isTastingMemoryFollowUp: isMemoryFollowUp(lower, lastAssistantText),
    isSocialAck: matchesAny(lower, SOCIAL_ACK),
    isCancel: matchesAny(lower, CANCEL),
    isRefinement: matchesAny(lower, REFINEMENT),
    isMemoryGuidedRecommendation: matchesAny(lower, MEMORY_GUIDED_RECOMMENDATION),
    isExploratoryRecoPivot: matchesAny(lower, EXPLORATORY_RECO_PIVOT),
    isWineCulture,
    isQuestion,
    isRecommendationRequest: matchesAny(lower, RECOMMENDATION),
    isEncavageRequest: matchesAny(lower, ENCAVAGE),
    isTastingReference: matchesAny(lower, TASTING),
    isMemoryReference: matchesAny(lower, MEMORY),
    isRestaurantImage: /\b(carte|resto|restaurant|menu|ardoise)\b/i.test(lower),
    isImageWineQuestion: isQuestion || isWineCulture || /\b(penses|avis|tu connais|c'est bien|c'est bon)\b/i.test(lower),
  }
}
