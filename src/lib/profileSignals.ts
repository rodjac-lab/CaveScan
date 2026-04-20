import { supabase } from '@/lib/supabase'
import type { Bottle } from '@/lib/types'
import { patchUserProfile } from '@/lib/userProfiles'

export type CandidateSignalType =
  | 'rated_tasting_with_comment'
  | 'explicit_reco_feedback'
  | 'new_general_preference'
  | 'profile_contradiction'
  | 'long_topic_exploration'
  | 'new_topic_first_seen'

export interface RaiseSignalInput {
  type: CandidateSignalType
  payload: Record<string, unknown>
  sessionId?: string | null
}

const MIN_NOTE_LENGTH_FOR_COMMENT = 20
const NOTE_EXCERPT_MAX_LENGTH = 1500

// Debounce the patch run so multiple signals in a short window consume together.
const PATCH_DEBOUNCE_MS = 5_000
const PATCH_MIN_INTERVAL_MS = 30_000

let patchTimer: ReturnType<typeof setTimeout> | null = null
let lastPatchRunAt = 0

function runBackground(label: string, task: () => Promise<unknown>): void {
  task().catch((error) => {
    console.warn(`[profileSignals] ${label}`, error)
  })
}

function schedulePatchRun(reason: string): void {
  if (patchTimer) return

  const sinceLast = Date.now() - lastPatchRunAt
  const delay = Math.max(PATCH_DEBOUNCE_MS, PATCH_MIN_INTERVAL_MS - sinceLast)

  patchTimer = setTimeout(() => {
    patchTimer = null
    lastPatchRunAt = Date.now()
    runBackground(`patchUserProfile ${reason}`, async () => {
      const result = await patchUserProfile(reason)
      if (!result.success) {
        console.warn('[profileSignals] patch run failed', result.error)
        return
      }
      if (result.changed) {
        console.log(`[profileSignals] profile patched (${result.action} on ${result.section ?? '-'})`)
      }
    })
  }, delay)
}

export function raiseCandidateSignal(input: RaiseSignalInput): void {
  runBackground(`raiseCandidateSignal ${input.type}`, async () => {
    const { error } = await supabase.from('profile_candidate_signals').insert({
      signal_type: input.type,
      payload: input.payload,
      session_id: input.sessionId ?? null,
    })

    if (error) {
      console.warn('[profileSignals] insert failed', error)
      return
    }

    schedulePatchRun(`signal_${input.type}`)
  })
}

export function signalRatedTastingWithComment(bottle: Bottle): void {
  const rating = typeof bottle.rating === 'number' ? bottle.rating : null
  const note = (bottle.tasting_note ?? '').trim()

  if (rating == null || note.length < MIN_NOTE_LENGTH_FOR_COMMENT) return

  raiseCandidateSignal({
    type: 'rated_tasting_with_comment',
    payload: {
      bottle_id: bottle.id,
      rating,
      note_excerpt: note.slice(0, NOTE_EXCERPT_MAX_LENGTH),
      domaine: bottle.domaine ?? null,
      cuvee: bottle.cuvee ?? null,
      appellation: bottle.appellation ?? null,
      millesime: bottle.millesime ?? null,
    },
  })
}
