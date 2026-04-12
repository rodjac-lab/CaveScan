import type { Bottle } from '@/lib/types'
import { serializeMemoriesForPrompt } from '@/lib/tastingMemoryFormatting'
import {
  bottleMatchesExactFilters,
  buildFilterLabels,
  choosePlanningQuery,
  classifyMemoryEvidenceMode,
  hasAnyExactFilter,
  hasUnmatchedProducerHint,
} from '@/lib/tastingMemoryFilters'
import {
  selectRelevantMemoriesAsync,
  sortMemoriesForEvidence,
} from '@/lib/tastingMemoryRanking'
import type {
  MemoryEvidenceBundle,
  MemoryEvidenceTrace,
  MemoryEvidenceMode,
  MemorySearchMessage,
  MemorySelectionOptions,
  MemorySelectionProfile,
} from '@/lib/tastingMemoryTypes'

export type {
  ExactMemoryFilters,
  MemoryEvidenceBundle,
  MemoryEvidenceTrace,
  MemoryEvidenceMode,
  MemorySearchMessage,
  MemorySelectionOptions,
  MemorySelectionProfile,
} from '@/lib/tastingMemoryTypes'

export { selectRelevantMemories, selectRelevantMemoriesAsync } from '@/lib/tastingMemoryRanking'
export { buildContextualMemoryQuery } from '@/lib/tastingMemoryFilters'

function summarizeTraceMemory(bottle: Bottle): MemoryEvidenceTrace['selectedMemories'][number] {
  return {
    id: bottle.id,
    domaine: bottle.domaine,
    cuvee: bottle.cuvee,
    appellation: bottle.appellation,
    millesime: bottle.millesime,
    rating: bottle.rating,
    drunk_at: bottle.drunk_at,
    has_note: !!bottle.tasting_note?.trim(),
  }
}

function buildEvidenceTrace(input: {
  query: string
  planningQuery: string
  mode: MemoryEvidenceMode
  selectionProfile: MemorySelectionProfile
  usedConversationContext: boolean
  matchedFilters: string[]
  drunkBottles: Bottle[]
  candidateCount: number
  memories: Bottle[]
  decision: MemoryEvidenceTrace['decision']
}): MemoryEvidenceTrace {
  return {
    query: input.query,
    planningQuery: input.planningQuery,
    mode: input.mode,
    selectionProfile: input.selectionProfile,
    usedConversationContext: input.usedConversationContext,
    matchedFilters: input.matchedFilters,
    sourceBottleCount: input.drunkBottles.length,
    sourceNoteCount: input.drunkBottles.filter((bottle) => bottle.tasting_note?.trim()).length,
    candidateCount: input.candidateCount,
    selectedCount: input.memories.length,
    selectedMemories: input.memories.map(summarizeTraceMemory),
    decision: input.decision,
  }
}

function serializeEvidenceBundle(
  mode: MemoryEvidenceMode,
  query: string,
  matchedFilters: string[],
  usedConversationContext: boolean,
  memories: Bottle[],
): string {
  const noteCount = memories.filter((bottle) => bottle.tasting_note && bottle.tasting_note.trim().length > 0).length
  const lines: string[] = []

  if (mode === 'exact') {
    lines.push('Inventaire exact de degustation.')
    lines.push('N ajoute aucun autre vin que ceux fournis ci-dessous.')
    lines.push('Si la degustation demandee n apparait pas ci-dessous avec sa note ou son verbatim, reponds que tu ne la retrouves pas.')
  } else {
    lines.push('Base exacte de synthese sur degustations passees.')
    lines.push('Ne generalise pas au dela des vins fournis ci-dessous.')
  }

  lines.push(`Question actuelle : ${query.trim()}`)
  if (matchedFilters.length > 0) {
    lines.push(`Filtres reconnus : ${matchedFilters.join(', ')}`)
  }
  if (usedConversationContext) {
    lines.push('Le sujet a ete complete avec le contexte recent de la conversation.')
  }
  lines.push(`Degustations fournies : ${memories.length}${mode === 'synthesis' ? ` (${noteCount} avec note exploitable)` : ''}.`)

  if (memories.length === 0) {
    lines.push('Aucun resultat exact trouve parmi les bouteilles marquees comme bues.')
    return lines.join('\n')
  }

  return `${lines.join('\n')}\n\n${serializeMemoriesForPrompt(memories)}`
}

export async function buildMemoryEvidenceBundle(input: {
  query: string
  recentMessages: MemorySearchMessage[]
  drunkBottles: Bottle[]
  limit?: number
  selectionProfile?: MemorySelectionProfile
}): Promise<MemoryEvidenceBundle | null> {
  const { query, recentMessages, drunkBottles, limit = 7, selectionProfile = 'default' } = input
  if (!query.trim() || drunkBottles.length === 0) return null

  const planning = choosePlanningQuery(query, recentMessages, drunkBottles)
  const hasFilters = hasAnyExactFilter(planning.filters)
  const mode = classifyMemoryEvidenceMode(query, hasFilters)
  const matchedFilters = buildFilterLabels(planning.filters)
  const unmatchedProducerHint = mode === 'exact' && hasUnmatchedProducerHint(planning.planningQuery, planning.filters)

  if (hasFilters) {
    if (unmatchedProducerHint) {
      const memories: Bottle[] = []
      return {
        mode,
        planningQuery: planning.planningQuery,
        usedConversationContext: planning.usedConversationContext,
        matchedFilters,
        memories,
        serialized: serializeEvidenceBundle(
          mode,
          query,
          matchedFilters,
          planning.usedConversationContext,
          memories,
        ),
        trace: buildEvidenceTrace({
          query,
          planningQuery: planning.planningQuery,
          mode,
          selectionProfile,
          usedConversationContext: planning.usedConversationContext,
          matchedFilters,
          drunkBottles,
          candidateCount: 0,
          memories,
          decision: 'exact_filters_blocked_unmatched_producer',
        }),
      }
    }

    const exactMatches = sortMemoriesForEvidence(
      drunkBottles.filter((bottle) => bottleMatchesExactFilters(bottle, planning.filters)),
      mode,
    )
    const memories = mode === 'exact' ? exactMatches : exactMatches.slice(0, limit)

    return {
      mode,
      planningQuery: planning.planningQuery,
      usedConversationContext: planning.usedConversationContext,
      matchedFilters,
      memories,
      serialized: serializeEvidenceBundle(
        mode,
        query,
        matchedFilters,
        planning.usedConversationContext,
        memories,
      ),
      trace: buildEvidenceTrace({
        query,
        planningQuery: planning.planningQuery,
        mode,
        selectionProfile,
        usedConversationContext: planning.usedConversationContext,
        matchedFilters,
        drunkBottles,
        candidateCount: exactMatches.length,
        memories,
        decision: 'exact_filters',
      }),
    }
  }

  const memories = sortMemoriesForEvidence(
    await selectRelevantMemoriesAsync(planning.planningQuery, drunkBottles, limit, {
      selectionProfile,
      recentMessages,
      allowGenericFallback: mode !== 'exact',
    } satisfies MemorySelectionOptions),
    mode,
  )

  return {
    mode,
    planningQuery: planning.planningQuery,
    usedConversationContext: planning.usedConversationContext,
    matchedFilters,
    memories,
    serialized: serializeEvidenceBundle(
      mode,
      query,
      matchedFilters,
      planning.usedConversationContext,
      memories,
    ),
    trace: buildEvidenceTrace({
      query,
      planningQuery: planning.planningQuery,
      mode,
      selectionProfile,
      usedConversationContext: planning.usedConversationContext,
      matchedFilters,
      drunkBottles,
      candidateCount: memories.length,
      memories,
      decision: memories.length > 0 ? 'ranked_relevance' : 'no_memory_available',
    }),
  }
}
