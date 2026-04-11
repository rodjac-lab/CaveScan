import type { Bottle } from '@/lib/types'

export interface MemorySearchMessage {
  role: 'user' | 'celestin'
  text: string
}

export type MemoryEvidenceMode = 'exact' | 'synthesis'

export interface MemoryEvidenceBundle {
  mode: MemoryEvidenceMode
  planningQuery: string
  usedConversationContext: boolean
  matchedFilters: string[]
  memories: Bottle[]
  serialized: string
}

export type MemorySelectionProfile = 'default' | 'recommendation'

export interface MemorySelectionOptions {
  selectionProfile?: MemorySelectionProfile
  recentMessages?: MemorySearchMessage[]
  allowGenericFallback?: boolean
}

export interface ExactMemoryFilters {
  dates: string[]
  countries: string[]
  regions: string[]
  appellations: string[]
  domaines: string[]
  cuvees: string[]
}
