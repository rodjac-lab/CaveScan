import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /Invalid Refresh Token|Refresh Token Not Found/i.test(error.message)
}

export function useAuth(): {
  session: Session | null
  loading: boolean
  error: string | null
  isAnonymous: boolean
  signOut: () => Promise<void>
} {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isAnonymous = session?.user?.is_anonymous ?? false

  useEffect(() => {
    let isMounted = true

    async function initAuth(): Promise<void> {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (isMounted) setSession(data.session)
      } catch (err) {
        if (isInvalidRefreshTokenError(err)) {
          await supabase.auth.signOut({ scope: 'local' })
          if (isMounted) {
            setSession(null)
            setError(null)
          }
          return
        }
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

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
  }

  return { session, loading, error, isAnonymous, signOut }
}
