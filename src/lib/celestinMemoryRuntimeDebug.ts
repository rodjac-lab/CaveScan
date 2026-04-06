const STORAGE_KEY = 'celestin:debug:memory-runtime-id'

export function getDebugMemoryRuntimeId(): string | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value && value.trim().length > 0 ? value : null
}

export function setDebugMemoryRuntimeId(runtimeId: string | null) {
  if (typeof window === 'undefined') return
  if (!runtimeId) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }
  window.localStorage.setItem(STORAGE_KEY, runtimeId)
}
