import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'

type DeviceContext = 'ios' | 'android' | 'desktop'

function getDeviceContext(): DeviceContext {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
}

// --- Install zone components ---

function AndroidInstall({ deferredPrompt }: { deferredPrompt: BeforeInstallPromptEvent | null }) {
  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
  }

  if (deferredPrompt) {
    return (
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={handleInstall}
          className="w-full max-w-xs rounded-2xl bg-[#B8860B] px-8 py-4 text-lg font-semibold text-white shadow-lg transition-transform active:scale-95"
        >
          Installer CaveScan
        </button>
      </div>
    )
  }

  // Fallback: show Chrome-specific instructions
  return <AndroidManualInstall />
}

function AndroidManualInstall() {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">1</span>
            <div>
              <p className="font-semibold text-white">Menu Chrome</p>
              <p className="mt-0.5 text-sm text-white/60">Appuyez sur <MoreVertIcon /> en haut à droite</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">2</span>
            <div>
              <p className="font-semibold text-white">Installer l'application</p>
              <p className="mt-0.5 text-sm text-white/60">Sélectionnez "Installer l'application" ou "Ajouter à l'écran d'accueil"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function IOSInstall() {
  return (
    <div className="relative flex flex-col items-center gap-5">
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">1</span>
            <div>
              <p className="font-semibold text-white">Appuyez sur Partager</p>
              <p className="mt-0.5 text-sm text-white/60">Le bouton <ShareIcon /> en bas de Safari</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">2</span>
            <div>
              <p className="font-semibold text-white">Sur l'écran d'accueil</p>
              <p className="mt-0.5 text-sm text-white/60">Sélectionnez "Sur l'écran d'accueil"</p>
            </div>
          </div>
        </div>
      </div>
      {/* Pulsating arrow pointing down to Safari share button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 animate-[pulse_2s_ease-in-out_infinite]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8860B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      </div>
    </div>
  )
}

function MoreVertIcon() {
  return (
    <svg className="inline-block h-4 w-4 align-text-bottom" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

function Share2Icon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg className="inline-block h-4 w-4 align-text-bottom" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function DesktopInstall() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-2xl bg-white p-6 shadow-lg">
        <img src="/qr-cavescan.svg" alt="QR Code CaveScan" className="h-48 w-48" />
      </div>
      <p className="text-sm text-white/60">
        Scannez ou visitez <span className="font-medium text-white">cavescan.vercel.app</span>
      </p>
    </div>
  )
}

// --- Feature card data ---

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    title: 'Scannez l\'étiquette',
    description: 'Prenez une photo, l\'IA identifie votre bouteille instantanément.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    title: 'Gérez votre cave',
    description: 'Ajoutez, retirez et organisez vos bouteilles en un geste.',
  },
  {
    icon: <Share2Icon />,
    title: 'Partagez vos dégustations',
    description: 'Notez vos vins et partagez vos impressions avec vos proches.',
  },
]

// --- BeforeInstallPromptEvent type ---

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// --- Main component ---

export default function Landing() {
  const { session, loading } = useAuth()
  const [device] = useState<DeviceContext>(getDeviceContext)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Redirect if standalone or authenticated
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1a1a1a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#B8860B]" />
      </div>
    )
  }

  if (isStandalone() || session) {
    return <Navigate to="/cave" replace />
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .anim-fade-1 { animation: fadeUp 0.6s ease-out 0.2s both; }
        .anim-fade-2 { animation: fadeUp 0.6s ease-out 0.4s both; }
        .anim-fade-3 { animation: fadeUp 0.6s ease-out 0.6s both; }
        .anim-fade-4 { animation: fadeUp 0.6s ease-out 0.7s both; }
        .anim-fade-5 { animation: fadeUp 0.6s ease-out 0.9s both; }
        .anim-float { animation: float 6s ease-in-out infinite; }
        .anim-float-slow { animation: float 7s ease-in-out infinite; }
        .anim-float-slower { animation: float 8s ease-in-out infinite; }
      `}</style>

      <div className="mx-auto flex max-w-md flex-col items-center px-6 pb-24">

        {/* A. Header Brand */}
        <header className="anim-fade-1 pt-12 pb-8 text-center" style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}>
          <h1
            className="text-xs font-semibold tracking-[3px] text-[#B8860B]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            CAVESCAN
          </h1>
        </header>

        {/* B. Hero with screenshot */}
        <section className="anim-fade-2 relative mb-10 w-full">
          {/* Decorative circles */}
          <div className="anim-float absolute -left-6 top-8 h-24 w-24 rounded-full bg-red-800/15" />
          <div className="anim-float-slow absolute -right-4 top-20 h-16 w-16 rounded-full bg-amber-200/15" />
          <div className="anim-float-slower absolute -left-2 bottom-4 h-12 w-12 rounded-full bg-rose-400/15" />

          {/* Phone mockup */}
          <div
            className="relative mx-auto w-[260px] overflow-hidden rounded-[28px] shadow-md"
            style={{ perspective: '800px' }}
          >
            <div style={{ transform: 'rotateY(-2deg) rotateX(1deg)' }}>
              <img
                src="/Screenshot_cave.png"
                alt="Aperçu de CaveScan"
                className="block w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* C. Value proposition */}
        <section className="anim-fade-3 mb-12 text-center">
          <h2
            className="mb-3 text-2xl font-bold text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Scannez, encavez, <em className="text-[#B8860B]">partagez.</em>
          </h2>
          <p className="text-base leading-relaxed text-white/60" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Vos entrées et sorties de cave en un geste.
          </p>
        </section>

        {/* D. How it works */}
        <section className="anim-fade-4 mb-12 w-full">
          <p className="mb-5 text-center text-[10px] font-semibold tracking-[2px] text-white/40">
            COMMENT &Ccedil;A MARCHE
          </p>
          <div className="flex flex-col gap-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#B8860B]/15 text-[#B8860B]">
                  {f.icon}
                </div>
                <div>
                  <h3
                    className="mb-0.5 text-sm font-semibold text-white"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {f.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-white/50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {f.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* E. Install zone */}
        <section className="anim-fade-5 w-full">
          <div className="flex flex-col items-center gap-6">
            {device === 'android' && <AndroidInstall deferredPrompt={deferredPrompt} />}
            {device === 'ios' && <IOSInstall />}
            {device === 'desktop' && (
              <>
                <DesktopInstall />
                <Link
                  to="/signup"
                  className="w-full max-w-xs rounded-2xl border-2 border-[#B8860B] px-8 py-4 text-center text-lg font-semibold text-[#B8860B] transition-all active:scale-95 hover:bg-[#B8860B] hover:text-white"
                >
                  Créer mon compte
                </Link>
              </>
            )}

            {/* Reassurance line */}
            <p className="text-center text-xs text-white/40">
              Gratuit &middot; L&eacute;ger &middot; Pr&ecirc;t en 30 secondes
            </p>
          </div>
        </section>

      </div>
    </div>
  )
}
