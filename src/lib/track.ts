import { supabase } from './supabase'

export function track(action: string, metadata?: Record<string, unknown>) {
  console.log('[track]', action, metadata)
  supabase.from('events').insert({ action, metadata: metadata ?? {} }).then(({ error }) => {
    if (error) console.error('[track] ERROR', action, error.message)
    else console.log('[track] OK', action)
  })
}
