/**
 * Cross-session memory for Célestin.
 *
 * Primary source: Supabase chat_sessions (persistent, multi-device).
 * Fallback: localStorage (offline, same-device).
 *
 * Configurable via setCrossSessionConfig() — useful for testing
 * different retention strategies from the Debug page.
 */

import { loadRecentSessions } from '@/lib/chatPersistence'

// --- Configuration (adjustable at runtime for testing) ---

const CONFIG_KEY = 'celestin_memory_config'
const SESSIONS_KEY = 'celestin_sessions'

// Legacy keys (migration from old single-session system)
const LEGACY_PREVIOUS_KEY = 'celestin_previous_session'
const LEGACY_CURRENT_KEY = 'celestin_current_session'

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

/** Migrate from old current/previous system to the new array-based system */
function migrateLegacy(): void {
  try {
    const legacyPrev = localStorage.getItem(LEGACY_PREVIOUS_KEY)
    const legacyCurr = localStorage.getItem(LEGACY_CURRENT_KEY)
    const existingSessions = localStorage.getItem(SESSIONS_KEY)

    // Only migrate if legacy data exists and new system is empty
    if (!existingSessions && (legacyPrev || legacyCurr)) {
      const sessions: SessionSummary[] = []
      if (legacyPrev) {
        try { sessions.push(JSON.parse(legacyPrev) as SessionSummary) } catch { /* skip */ }
      }
      if (legacyCurr) {
        try { sessions.push(JSON.parse(legacyCurr) as SessionSummary) } catch { /* skip */ }
      }
      if (sessions.length > 0) {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
      }
      localStorage.removeItem(LEGACY_PREVIOUS_KEY)
      localStorage.removeItem(LEGACY_CURRENT_KEY)
    }
  } catch { /* ignore */ }
}

/** Load all stored sessions, pruning expired ones */
export function loadSessions(): SessionSummary[] {
  migrateLegacy()

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

/** Load previous sessions (all except the current one, most recent first) */
export function loadPreviousSessions(): SessionSummary[] {
  const all = loadSessions()
  // The last entry is the "current" session being built — return the rest
  return all.slice(0, -1).reverse()
}

/** Save/update the current session (latest entry in the array) */
export function saveCurrentSession(messages: Array<{ role: string; text: string; isLoading?: boolean; actionChips?: unknown }>): void {
  const meaningful = messages.filter(m => !m.isLoading && !m.actionChips && m.text.length > 1)
  if (meaningful.length < 2) return // need at least 1 exchange

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

/** Rotate: mark the current session as "done" and start a new slot */
export function rotateSessions(): void {
  try {
    const sessions = loadSessions()
    const config = getCrossSessionConfig()

    if (sessions.length === 0) return

    // The last session is the one just completed — add a new empty slot
    // (it will be overwritten by saveCurrentSession as messages come in)
    // Trim to max sessions
    const trimmed = sessions.slice(-(config.maxSessions - 1))
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed))
  } catch { /* ignore */ }
}

/** Serialize previous sessions for the Célestin prompt */
export function serializePreviousSessionsForPrompt(sessions: SessionSummary[]): string | undefined {
  if (sessions.length === 0) return undefined

  const blocks = sessions.map(session => {
    const lines = session.turns.map(t =>
      `${t.role === 'user' ? 'Utilisateur' : 'Celestin'} : ${t.text}`
    )
    const date = new Date(session.savedAt)
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    return `Conversation du ${dateStr} :\n${lines.join('\n')}`
  })

  return `Resume des conversations precedentes :\n\n${blocks.join('\n\n---\n\n')}`
}

/**
 * Load previous sessions from Supabase (summaries only).
 * Returns a compact format that replaces the raw turns with 1-line summaries.
 * Falls back to localStorage if Supabase is unavailable.
 */
export async function loadPreviousSessionsFromSupabase(): Promise<string | undefined> {
  try {
    const sessions = await loadRecentSessions(5)
    if (sessions.length === 0) {
      // Fallback to localStorage
      const localSessions = loadPreviousSessions()
      return serializePreviousSessionsForPrompt(localSessions)
    }

    const lines = sessions
      .filter(s => s.summary)
      .map(s => {
        const date = new Date(s.started_at)
        const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        return `- ${dateStr} : ${s.summary}`
      })

    if (lines.length === 0) {
      const localSessions = loadPreviousSessions()
      return serializePreviousSessionsForPrompt(localSessions)
    }

    return `Conversations recentes :\n${lines.join('\n')}`
  } catch {
    // Fallback to localStorage
    const localSessions = loadPreviousSessions()
    return serializePreviousSessionsForPrompt(localSessions)
  }
}

/** Clear all session memory (for debug/testing) */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(SESSIONS_KEY)
    localStorage.removeItem(LEGACY_PREVIOUS_KEY)
    localStorage.removeItem(LEGACY_CURRENT_KEY)
  } catch { /* ignore */ }
}

/** Get debug info about current memory state */
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
