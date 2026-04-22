import type { ConversationState } from "./conversation-state.ts"

export interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
  image?: string
}

export interface CaveBottle {
  id: string
  domaine: string | null
  appellation: string | null
  millesime: number | null
  couleur: string | null
  character: string | null
  cuvee: string | null
  quantity?: number
  volume?: string
  local_score?: number
}

export interface RequestBody {
  message: string
  history: ConversationTurn[]
  cave: CaveBottle[]
  profile?: string
  memories?: string
  memoryEvidenceMode?: 'exact' | 'synthesis'
  memoryTrace?: Record<string, unknown>
  sqlRetrieval?: string
  sqlRetrievalTrace?: Record<string, unknown>
  provider?: string
  debugTrace?: boolean
  image?: string
  conversationState?: ConversationState
  compiledProfileMarkdown?: string
  context?: {
    dayOfWeek: string
    season: string
    recentDrunk?: string[]
  }
}

export type UiActionKind = 'show_recommendations' | 'prepare_add_wine' | 'prepare_add_wines' | 'prepare_log_tasting'

export interface WineExtraction {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: 'rouge' | 'blanc' | 'rose' | 'bulles' | null
  country: string | null
  region: string | null
  quantity: number
  volume: '0.375' | '0.75' | '1.5'
  grape_varieties?: string[] | null
  serving_temperature?: string | null
  typical_aromas?: string[] | null
  food_pairings?: string[] | null
  character?: string | null
  purchase_price?: number | null
}

export interface RecommendationCard {
  bottle_id?: string
  name: string
  appellation: string
  millesime?: number | null
  badge: string
  reason: string
  color: 'rouge' | 'blanc' | 'rose' | 'bulles'
}

export type CelestinUiAction =
  | { kind: 'show_recommendations'; payload: { cards: RecommendationCard[] } }
  | { kind: 'prepare_add_wine'; payload: { extraction: WineExtraction } }
  | { kind: 'prepare_add_wines'; payload: { extractions: WineExtraction[] } }
  | { kind: 'prepare_log_tasting'; payload: { extraction: WineExtraction } }

export interface CelestinResponse {
  message: string
  ui_action?: CelestinUiAction | null
  action_chips?: string[] | null
}
