import { supabase } from './supabase'

export function track(action: string, metadata?: Record<string, unknown>) {
  // Fire-and-forget: never blocks UX, fails silently
  supabase.from('events').insert({ action, metadata: metadata ?? {} }).then()
}
