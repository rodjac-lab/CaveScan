import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function useAuth(): {
  session: Session | null
  loading: boolean
  error: string | null
} {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function initAuth(): Promise<void> {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (isMounted) setSession(data.session)

        if (!data.session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously()
          if (anonError) throw anonError
          if (isMounted) setSession(anonData.session)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Auth error')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) setSession(newSession)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  return { session, loading, error }
}
