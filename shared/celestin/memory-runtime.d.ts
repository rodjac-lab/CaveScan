export type MemoryRuntimeId = 'legacy' | 'compiled_profile_v1'

export interface MemoryRuntimeConfig {
  id: MemoryRuntimeId
  label: string
  description: string
}

export const MEMORY_RUNTIME_IDS: MemoryRuntimeId[]
export const DEFAULT_MEMORY_RUNTIME_ID: MemoryRuntimeId
export const MEMORY_RUNTIMES: Record<MemoryRuntimeId, MemoryRuntimeConfig>
export function resolveMemoryRuntime(id?: string | null): MemoryRuntimeConfig
