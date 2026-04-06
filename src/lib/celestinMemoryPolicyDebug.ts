const STORAGE_KEY = 'celestin:debug:memory-policy-id'

export function getDebugMemoryPolicyId(): string | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value && value.trim().length > 0 ? value : null
}

export function setDebugMemoryPolicyId(policyId: string | null) {
  if (typeof window === 'undefined') return
  if (!policyId) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }
  window.localStorage.setItem(STORAGE_KEY, policyId)
}
