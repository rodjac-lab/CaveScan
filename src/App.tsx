import { Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { loadRoute, preloadPrimaryRoutes } from '@/lib/routePreload'
import BottomNav from './components/BottomNav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader2 } from 'lucide-react'

// Lazy-loaded pages — only downloaded when the route is visited
const Home = lazyWithRetry(() => loadRoute('/cave'))
const AddBottle = lazyWithRetry(() => loadRoute('/add'))
const EditBottle = lazyWithRetry(() => import('./pages/EditBottle'))
const RemoveBottle = lazyWithRetry(() => loadRoute('/remove'))
const BottlePage = lazyWithRetry(() => import('./pages/BottlePage'))
const Settings = lazyWithRetry(() => loadRoute('/settings'))
const Login = lazyWithRetry(() => loadRoute('/login'))
const Signup = lazyWithRetry(() => loadRoute('/signup'))
const Landing = lazyWithRetry(() => loadRoute('/'))
const Scanner = lazyWithRetry(() => loadRoute('/scanner'))
const Degustations = lazyWithRetry(() => loadRoute('/degustations'))
const Decouvrir = lazyWithRetry(() => loadRoute('/decouvrir'))
const Debug = lazyWithRetry(() => loadRoute('/debug'))

function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
    </div>
  )
}

function AppLayout() {
  const location = useLocation()

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const isLanding = location.pathname === '/'
  const isScanner = location.pathname === '/scanner'

  useEffect(() => {
    if (!isAuthPage && !isLanding) preloadPrimaryRoutes()
  }, [isAuthPage, isLanding])

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
