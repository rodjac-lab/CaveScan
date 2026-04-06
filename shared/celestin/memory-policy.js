export const DEFAULT_MEMORY_POLICY_ID = 'balanced_v1'

/**
 * Memory layers that can be injected into the Celestin context.
 * The order matters and is controlled per turn profile.
 */
export const MEMORY_LAYER_KEYS = [
  'resolvedUserModel',
  'memoryFactsFallback',
  'retrievedConversation',
  'tastingMemories',
  'previousSessionText',
]

export const MEMORY_POLICIES = {
  balanced_v1: {
    id: 'balanced_v1',
    label: 'Balanced V1',
    description: 'Default policy: episodic memory for memory turns, taste/context support for recommendation turns.',
    turns: {
      greeting: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      social: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      wine_conversation: {
        layerPriority: ['resolvedUserModel', 'tastingMemories'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: true,
        includePreviousSessionText: false,
      },
      tasting_memory: {
        layerPriority: ['retrievedConversation', 'tastingMemories', 'previousSessionText', 'resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: true,
        includeTastingMemories: true,
        includePreviousSessionText: true,
      },
      recommendation: {
        layerPriority: ['resolvedUserModel', 'tastingMemories', 'previousSessionText'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: true,
        includePreviousSessionText: false,
      },
      encavage: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      cellar_lookup: {
        layerPriority: ['resolvedUserModel', 'previousSessionText'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: true,
      },
      restaurant_assistant: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
    },
  },
  lean_reco_v1: {
    id: 'lean_reco_v1',
    label: 'Lean Recommendation V1',
    description: 'Same as balanced, but tighter recommendation turns: no episodic memories or session carry-over during wine recommendations.',
    turns: {
      greeting: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      social: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      wine_conversation: {
        layerPriority: ['resolvedUserModel', 'tastingMemories'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: true,
        includePreviousSessionText: false,
      },
      tasting_memory: {
        layerPriority: ['retrievedConversation', 'tastingMemories', 'previousSessionText', 'resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: true,
        includeTastingMemories: true,
        includePreviousSessionText: true,
      },
      recommendation: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      encavage: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      cellar_lookup: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      restaurant_assistant: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
    },
  },
  episodic_first_v1: {
    id: 'episodic_first_v1',
    label: 'Episodic First V1',
    description: 'Aggressive memory policy used to test stronger episodic recall in memory-heavy turns.',
    turns: {
      greeting: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      social: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      wine_conversation: {
        layerPriority: ['tastingMemories', 'resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: true,
        includePreviousSessionText: false,
      },
      tasting_memory: {
        layerPriority: ['tastingMemories', 'retrievedConversation', 'previousSessionText', 'resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: true,
        includeTastingMemories: true,
        includePreviousSessionText: true,
      },
      recommendation: {
        layerPriority: ['resolvedUserModel', 'tastingMemories'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: true,
        includePreviousSessionText: false,
      },
      encavage: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
      cellar_lookup: {
        layerPriority: ['resolvedUserModel', 'previousSessionText'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: true,
      },
      restaurant_assistant: {
        layerPriority: ['resolvedUserModel'],
        includeResolvedUserModel: true,
        includeMemoryFactsFallback: true,
        includeRetrievedConversation: false,
        includeTastingMemories: false,
        includePreviousSessionText: false,
      },
    },
  },
}

export const MEMORY_POLICY_IDS = Object.keys(MEMORY_POLICIES)

function inferTurnProfileKey(interpretation, state) {
  const mode = interpretation?.cognitiveMode
  const inferredTaskType = interpretation?.inferredTaskType ?? state?.taskType ?? null

  if (mode === 'greeting') return 'greeting'
  if (mode === 'social') return 'social'
  if (mode === 'tasting_memory') return 'tasting_memory'
  if (mode === 'restaurant_assistant') return 'restaurant_assistant'
  if (mode === 'wine_conversation') return 'wine_conversation'

  if (mode === 'cellar_assistant') {
    if (inferredTaskType === 'recommendation') return 'recommendation'
    if (inferredTaskType === 'encavage') return 'encavage'
    return 'cellar_lookup'
  }

  return 'wine_conversation'
}

export function resolveMemoryPolicy(policyId) {
  return MEMORY_POLICIES[policyId] ?? MEMORY_POLICIES[DEFAULT_MEMORY_POLICY_ID]
}

export function resolveMemoryTurnProfile(policyId, interpretation, state) {
  const policy = resolveMemoryPolicy(policyId)
  const turnProfileKey = inferTurnProfileKey(interpretation, state)
  const turn = policy.turns[turnProfileKey] ?? policy.turns.wine_conversation

  return {
    policyId: policy.id,
    policyLabel: policy.label,
    turnProfileKey,
    ...turn,
  }
}
