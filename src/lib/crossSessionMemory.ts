/**
 * Local cross-session fallback for Célestin.
 *
 * This module no longer feeds the runtime prompt. It only keeps a small
 * local history for debug and same-device continuity.
 */

// --- Configuration (adjustable at runtime for testing) ---

const CONFIG_KEY = 'celestin_memory_config'
const SESSIONS_KEY = 'celestin_sessions'

interface CrossSessionConfig {
  maxSessions: number
  ttlDays: number
}

const DEFAULT_CONFIG: CrossSessionConfig = {
  maxSessions: 4,
  ttlDays: 7,
}

export interface SessionSummary {
  turns: Array<{ role: 'user' | 'celestin'; text: string }>
  savedAt: string
}

// --- Config management ---

export function getCrossSessionConfig(): CrossSessionConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CrossSessionConfig>
      return {
        maxSessions: parsed.maxSessions ?? DEFAULT_CONFIG.maxSessions,
        ttlDays: parsed.ttlDays ?? DEFAULT_CONFIG.ttlDays,
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

export function setCrossSessionConfig(config: Partial<CrossSessionConfig>): void {
  const current = getCrossSessionConfig()
  const updated = { ...current, ...config }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated))
  } catch { /* ignore */ }
}

// --- Session storage ---

function getTtlMs(): number {
  return getCrossSessionConfig().ttlDays * 24 * 60 * 60 * 1000
}
export function loadSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []

    const sessions = JSON.parse(raw) as SessionSummary[]
    const ttlMs = getTtlMs()
    const now = Date.now()

    // Filter out expired sessions
    const valid = sessions.filter(s => {
      const age = now - new Date(s.savedAt).getTime()
      return age <= ttlMs
    })

    // Persist pruned list if we removed any
    if (valid.length !== sessions.length) {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(valid))
    }

    return valid
  } catch {
    return []
  }
}
export function saveCurrentSession(messages: Array<{ role: string; text: string; isLoading?: boolean; actionChips?: unknown }>): void {
  const meaningful = messages.filter(m => !m.isLoading && !m.actionChips && m.text.length > 1)
  if (meaningful.length < 2) return

  const turns = meaningful.slice(-12).map(m => ({
    role: m.role as 'user' | 'celestin',
    text: m.text.slice(0, 200),
  }))

  const newSession: SessionSummary = {
    turns,
    savedAt: new Date().toISOString(),
  }

  try {
    const sessions = loadSessions()
    const config = getCrossSessionConfig()

    if (sessions.length === 0) {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify([newSession]))
    } else {
      // Replace the last entry (current session)
      sessions[sessions.length - 1] = newSession
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-config.maxSessions)))
    }
  } catch { /* localStorage full or unavailable */ }
}
export function rotateSessions(): void {
  try {
    const sessions = loadSessions()
    const config = getCrossSessionConfig()

    if (sessions.length === 0) return

    const trimmed = sessions.slice(-(config.maxSessions - 1))
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed))
  } catch { /* ignore */ }
}
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(SESSIONS_KEY)
  } catch { /* ignore */ }
}
export function getMemoryDebugInfo(): {
  config: CrossSessionConfig
  sessions: SessionSummary[]
  totalTurns: number
  oldestDate: string | null
  newestDate: string | null
  storageSizeBytes: number
} {
  const config = getCrossSessionConfig()
  const sessions = loadSessions()
  const totalTurns = sessions.reduce((sum, s) => sum + s.turns.length, 0)

  let storageSizeBytes = 0
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (raw) storageSizeBytes = new Blob([raw]).size
  } catch { /* ignore */ }

  return {
    config,
    sessions,
    totalTurns,
    oldestDate: sessions.length > 0 ? sessions[0].savedAt : null,
    newestDate: sessions.length > 0 ? sessions[sessions.length - 1].savedAt : null,
    storageSizeBytes,
  }
}
