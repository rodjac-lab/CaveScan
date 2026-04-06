export type MemoryPolicyTurnConfig = {
  layerPriority: string[]
  includeResolvedUserModel: boolean
  includeMemoryFactsFallback: boolean
  includeRetrievedConversation: boolean
  includeTastingMemories: boolean
  includePreviousSessionText: boolean
}

export type MemoryPolicyConfig = {
  id: string
  label: string
  description: string
  turns: Record<string, MemoryPolicyTurnConfig>
}

export declare const DEFAULT_MEMORY_POLICY_ID: string
export declare const MEMORY_LAYER_KEYS: string[]
export declare const MEMORY_POLICIES: Record<string, MemoryPolicyConfig>
export declare const MEMORY_POLICY_IDS: string[]
export declare function resolveMemoryPolicy(policyId?: string): MemoryPolicyConfig
export declare function resolveMemoryTurnProfile(
  policyId: string | undefined,
  interpretation: unknown,
  state: unknown,
): MemoryPolicyTurnConfig & { policyId: string; policyLabel: string; turnProfileKey: string }
