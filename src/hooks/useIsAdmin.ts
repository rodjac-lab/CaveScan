import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { emailIsAdmin } from '@/lib/adminAccess'

export function useIsAdmin(): { loading: boolean; isAdmin: boolean } {
  const { session, loading: authLoading } = useAuth()
  const email = session?.user?.email ?? null
  const [state, setState] = useState<{ loading: boolean; isAdmin: boolean }>({ loading: true, isAdmin: false })

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    emailIsAdmin(email).then((isAdmin) => {
      if (cancelled) return
      setState({ loading: false, isAdmin })
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, email])

  return state
}
