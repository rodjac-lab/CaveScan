import { NavLink, useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'

// Cave icon (house)
function CaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    </svg>
  )
}

// Cheers icon (smirk — mouth only, no eyes)
function CheersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
      {/* Smirk — shifted right, curves up */}
      <path d="M10 15.5 Q13 17 16.5 14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// Scanner icon (viewfinder)
function ScannerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 7V2h5" />
      <path d="M17 2h5v5" />
      <path d="M22 17v5h-5" />
      <path d="M7 22H2v-5" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  )
}

// Settings icon (gear)
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

const leftTabs = [
  { to: '/cave', icon: CaveIcon, label: 'Cave' },
  { to: '/degustations', icon: Calendar, label: 'Dégustations' },
]

const rightTabs = [
  { to: '/decouvrir', icon: CheersIcon, label: 'Celestin' },
  { to: '/settings', icon: SettingsIcon, label: 'Réglages' },
]

export default function BottomNav() {
  const navigate = useNavigate()

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-opacity duration-200 ${
      isActive
        ? 'opacity-100 text-[var(--accent)]'
        : 'opacity-40 text-[var(--text-primary)]'
    }`

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 border-t border-[var(--border-color)] nav-backdrop">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-4">
        {/* Left tabs */}
        {leftTabs.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={tabClass}>
            <Icon className="h-[22px] w-[22px]" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}

        {/* Center Scanner button */}
        <button
          onClick={() => navigate('/scanner')}
          className="flex-1 flex flex-col items-center justify-center gap-1 -mt-[22px]"
        >
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-white"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
              boxShadow: '0 4px 14px rgba(184,134,11,0.35)',
            }}
          >
            <ScannerIcon className="h-[24px] w-[24px]" />
          </div>
          <span className="text-[10px] font-medium text-[var(--accent)]">Scanner</span>
        </button>

        {/* Right tabs */}
        {rightTabs.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={tabClass}>
            <Icon className="h-[22px] w-[22px]" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
      {/* Safe area padding for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
