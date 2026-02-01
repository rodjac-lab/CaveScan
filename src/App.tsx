import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import AddBottle from './pages/AddBottle'
import RemoveBottle from './pages/RemoveBottle'
import BottlePage from './pages/BottlePage'
import Search from './pages/Search'
import Settings from './pages/Settings'
import { useAuth } from './hooks/useAuth'
import { Loader2 } from 'lucide-react'

function App() {
  const { loading, error } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-wine-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-4 text-sm text-destructive">
          Auth error: {error}
          <div className="mt-2 text-muted-foreground">
            Vérifiez que l'auth anonyme est activée dans Supabase.
          </div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 pb-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/add" element={<AddBottle />} />
            <Route path="/remove" element={<RemoveBottle />} />
            <Route path="/bottle/:id" element={<BottlePage />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}

export default App
