import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { prefetchDefaultRecommendations } from '@/hooks/useRecommendations'
import BottomNav from './components/BottomNav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader2 } from 'lucide-react'

// Lazy-loaded pages — only downloaded when the route is visited
const Home = lazy(() => import('./pages/Home'))
const AddBottle = lazy(() => import('./pages/AddBottle'))
const EditBottle = lazy(() => import('./pages/EditBottle'))
const RemoveBottle = lazy(() => import('./pages/RemoveBottle'))
const BottlePage = lazy(() => import('./pages/BottlePage'))
const Settings = lazy(() => import('./pages/Settings'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Landing = lazy(() => import('./pages/Landing'))
const Scanner = lazy(() => import('./pages/Scanner'))
const Degustations = lazy(() => import('./pages/Degustations'))
const Decouvrir = lazy(() => import('./pages/Decouvrir'))
const Debug = lazy(() => import('./pages/Debug'))

function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
    </div>
  )
}

function AppLayout() {
  const location = useLocation()

  // Pre-fetch default recommendations on app start (fire-and-forget)
  useEffect(() => { prefetchDefaultRecommendations() }, [])

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const isLanding = location.pathname === '/'
  const isScanner = location.pathname === '/scanner'

  if (isAuthPage) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </Suspense>
    )
  }

  if (isLanding) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
        </Routes>
      </Suspense>
    )
  }

  // Scanner: fullscreen, no nav, no padding
  if (isScanner) {
    return (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/scanner" element={<Scanner />} />
          </Routes>
        </Suspense>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col overflow-hidden">
        <main className="flex flex-1 flex-col min-h-0 pb-20 pt-[env(safe-area-inset-top)]">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/cave" element={<Home />} />
                <Route path="/add" element={<AddBottle />} />
                <Route path="/remove" element={<RemoveBottle />} />
                <Route path="/degustations" element={<Degustations />} />
                <Route path="/decouvrir" element={<Decouvrir />} />
                <Route path="/bottle/:id" element={<BottlePage />} />
                <Route path="/bottle/:id/edit" element={<EditBottle />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/debug" element={<Debug />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <BottomNav />
      </div>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
      <ToastContainer />
    </BrowserRouter>
  )
}

export default App
