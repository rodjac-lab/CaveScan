import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
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

function AppLayout() {
  const location = useLocation()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'

  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    )
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col overflow-hidden">
        <main className="flex flex-1 flex-col min-h-0 pb-20">
          <Routes>
            <Route path="/" element={<Navigate to="/remove" replace />} />
            <Route path="/cave" element={<Home />} />
            <Route path="/add" element={<AddBottle />} />
            <Route path="/remove" element={<RemoveBottle />} />
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
