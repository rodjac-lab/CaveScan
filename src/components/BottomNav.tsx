import { NavLink } from 'react-router-dom'
import { Home, PlusCircle, Wine, Settings } from 'lucide-react'

const navItems = [
  { to: '/', icon: Home, label: 'Cave' },
  { to: '/add', icon: PlusCircle, label: 'Ajouter' },
  { to: '/remove', icon: Wine, label: 'Déguster' },
  { to: '/settings', icon: Settings, label: 'Réglages' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs transition-colors ${
                isActive
                  ? 'text-wine-600'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Icon className="h-6 w-6" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
      {/* Safe area padding for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
