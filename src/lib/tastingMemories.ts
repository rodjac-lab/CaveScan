import type { Bottle } from '@/lib/types'
import { serializeMemoriesForPrompt } from '@/lib/tastingMemoryFormatting'
import {
  bottleMatchesExactFilters,
  buildFilterLabels,
  choosePlanningQuery,
  classifyMemoryEvidenceMode,
  hasAnyExactFilter,
} from '@/lib/tastingMemoryFilters'
import {
  selectRelevantMemoriesAsync,
  sortMemoriesForEvidence,
} from '@/lib/tastingMemoryRanking'
import type {
  MemoryEvidenceBundle,
  MemoryEvidenceMode,
  MemorySearchMessage,
  MemorySelectionOptions,
  MemorySelectionProfile,
} from '@/lib/tastingMemoryTypes'

export type {
  ExactMemoryFilters,
  MemoryEvidenceBundle,
  MemoryEvidenceMode,
  MemorySearchMessage,
  MemorySelectionOptions,
  MemorySelectionProfile,
} from '@/lib/tastingMemoryTypes'

export { selectRelevantMemories, selectRelevantMemoriesAsync } from '@/lib/tastingMemoryRanking'
export { buildContextualMemoryQuery } from '@/lib/tastingMemoryFilters'

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

  if (hasFilters) {
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
  }
}
