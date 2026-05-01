import { supabase } from '@/lib/supabase'
import type { PrepTimings } from '@/lib/celestinChatRequest'

export type CelestinClientTimingPayload = {
  turnId: string
  prepMs: number
  celestinMs: number
  totalMs: number
  prepBreakdown?: PrepTimings
}

export async function recordCelestinClientTiming(payload: CelestinClientTimingPayload): Promise<void> {
  const { error } = await supabase.functions.invoke('record-celestin-client-timing', {
    body: {
      turnId: payload.turnId,
      prepMs: payload.prepMs,
      celestinMs: payload.celestinMs,
      totalMs: payload.totalMs,
      memoryMs: payload.prepBreakdown?.memoryMs,
      compiledProfileMs: payload.prepBreakdown?.compiledProfileMs,
      classifierMs: payload.prepBreakdown?.classifierMs,
    },
  })

  if (error) throw error
}
