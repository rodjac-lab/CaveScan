import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import AddBottle from './pages/AddBottle'
import RemoveBottle from './pages/RemoveBottle'
import BottlePage from './pages/BottlePage'
import Search from './pages/Search'
import Settings from './pages/Settings'

function App() {
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
