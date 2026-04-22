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
  trace: MemoryEvidenceTrace
}

export interface MemoryEvidenceTrace {
  query: string
  planningQuery: string
  mode: MemoryEvidenceMode
  selectionProfile: MemorySelectionProfile
  usedConversationContext: boolean
  matchedFilters: string[]
  sourceBottleCount: number
  sourceNoteCount: number
  candidateCount: number
  selectedCount: number
  selectedMemories: MemoryEvidenceTraceMemory[]
  decision:
    | 'exact_filters'
    | 'exact_filters_blocked_unmatched_producer'
    | 'ranked_relevance'
    | 'no_memory_available'
}

export interface MemoryEvidenceTraceMemory {
  id: string
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  rating: number | null
  drunk_at: string | null
  has_note: boolean
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
  millesimes: number[]
}
