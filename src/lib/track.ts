import { supabase } from './supabase'

export function track(action: string, metadata?: Record<string, unknown>) {
  // Fire-and-forget: never blocks UX
  supabase.from('events').insert({ action, metadata: metadata ?? {} }).then(({ error }) => {
    if (error) console.error('[track]', action, error.message)
  })
}
