/**
 * Capture des latences des tours Celestin pour debug.
 *
 * Stocke les 20 derniers tours en localStorage, lus depuis le panneau Debug.
 * Permet de mesurer les vraies latences en prod (mobile, cold starts, etc.)
 * vs les chiffres scorecard qui sont biaisés (ethernet stable, edges warm).
 */

const STORAGE_KEY = 'celestin_timings'
const MAX_ENTRIES = 20

export interface CelestinTimingEntry {
  timestamp: string
  messagePreview: string
  prepMs: number
  celestinMs: number
  totalMs: number
  prepBreakdown?: {
    memoryMs: number
    classifierMs: number
    compiledProfileMs: number
  }
  hadImage: boolean
  uiActionKind: string | null
}

export function recordCelestinTiming(entry: CelestinTimingEntry): void {
  if (typeof localStorage === 'undefined') return
  try {
    const existing = getCelestinTimings()
    const next = [entry, ...existing].slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* localStorage full or unavailable, swallow */
  }
}

export function getCelestinTimings(): CelestinTimingEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function clearCelestinTimings(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
