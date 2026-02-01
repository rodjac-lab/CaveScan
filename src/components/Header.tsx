import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <h1 className="text-lg font-semibold text-wine-600">CaveScan</h1>
        <Link
          to="/search"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Rechercher"
        >
          <Search className="h-5 w-5" />
        </Link>
      </div>
    </header>
  )
}
