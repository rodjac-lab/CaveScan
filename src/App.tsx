import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { prefetchDefaultRecommendations } from '@/hooks/useRecommendations'
import BottomNav from './components/BottomNav'
import { ProtectedRoute } from './components/ProtectedRoute'
import Home from './pages/Home'
import AddBottle from './pages/AddBottle'
import EditBottle from './pages/EditBottle'
import RemoveBottle from './pages/RemoveBottle'
import BottlePage from './pages/BottlePage'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Landing from './pages/Landing'
import Scanner from './pages/Scanner'
import Cheers from './pages/Cheers'
import Decouvrir from './pages/Decouvrir'

function AppLayout() {
  const location = useLocation()

  // Pre-fetch default recommendations on app start (fire-and-forget)
  useEffect(() => { prefetchDefaultRecommendations() }, [])

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const isLanding = location.pathname === '/'
  const isScanner = location.pathname === '/scanner'

  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    )
  }

  if (isLanding) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    )
  }

  // Scanner: fullscreen, no nav, no padding
  if (isScanner) {
    return (
      <ProtectedRoute>
        <Routes>
          <Route path="/scanner" element={<Scanner />} />
        </Routes>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col overflow-hidden">
        <main className="flex flex-1 flex-col min-h-0 pb-20">
          <Routes>
            <Route path="/cave" element={<Home />} />
            <Route path="/add" element={<AddBottle />} />
            <Route path="/remove" element={<RemoveBottle />} />
            <Route path="/cheers" element={<Cheers />} />
            <Route path="/decouvrir" element={<Decouvrir />} />
            <Route path="/bottle/:id" element={<BottlePage />} />
            <Route path="/bottle/:id/edit" element={<EditBottle />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
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
    </BrowserRouter>
  )
}

export default App
