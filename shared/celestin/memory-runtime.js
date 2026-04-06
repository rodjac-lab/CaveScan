export const MEMORY_RUNTIME_IDS = [
  'legacy',
  'compiled_profile_v1',
]

export const DEFAULT_MEMORY_RUNTIME_ID = 'legacy'

export const MEMORY_RUNTIMES = {
  legacy: {
    id: 'legacy',
    label: 'Legacy',
    description: 'Pipeline mémoire historique',
  },
  compiled_profile_v1: {
    id: 'compiled_profile_v1',
    label: 'Compiled Profile V1',
    description: 'Profil compilé + runtime simplifié',
  },
}

export function resolveMemoryRuntime(id) {
  return MEMORY_RUNTIMES[id] ?? MEMORY_RUNTIMES[DEFAULT_MEMORY_RUNTIME_ID]
}
