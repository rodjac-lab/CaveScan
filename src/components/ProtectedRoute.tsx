import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
      </div>
    )
  }

  if (!session) {
    const hasAccount = localStorage.getItem('cavescan_has_account')
    return <Navigate to={hasAccount ? '/login' : '/signup'} replace />
  }

  // Remember that this user has an account for future visits
  localStorage.setItem('cavescan_has_account', 'true')

  return <>{children}</>
}
