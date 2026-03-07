import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

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

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const showcaseCards = [
  {
    title: 'Scannez votre cave',
    copy: "Ajoutez une bouteille en quelques secondes. Une photo suffit pour retrouver l'essentiel du vin.",
    image: '/Sceeenshot Landing/Ma Cave.png',
    alt: 'Ecran Ma Cave de Celestin',
  },
  {
    title: 'Mémorisez vos dégustations',
    copy: 'Gardez la trace des bouteilles ouvertes, de vos impressions et des moments qui comptent.',
    image: '/Sceeenshot Landing/Dégustations.png',
    alt: 'Ecran Dégustations de Celestin',
  },
  {
    title: 'Laissez Célestin vous guider',
    copy: 'Choisissez plus juste, comprenez mieux vos vins et profitez davantage de votre cave.',
    image: '/Sceeenshot Landing/Celestin.png',
    alt: 'Ecran Celestin',
  },
]

function AndroidInstall({ deferredPrompt }: { deferredPrompt: BeforeInstallPromptEvent | null }) {
  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
  }

  if (deferredPrompt) {
    return (
      <button
        onClick={handleInstall}
        className="w-full max-w-xs rounded-2xl bg-[#B8860B] px-8 py-4 text-lg font-semibold text-white shadow-lg transition-transform active:scale-95"
      >
        Installer Celestin
      </button>
    )
  }

  return (
    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">1</span>
          <div>
            <p className="font-semibold text-white">Menu Chrome</p>
            <p className="mt-0.5 text-sm text-white/60">Appuyez sur les trois points en haut à droite</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">2</span>
          <div>
            <p className="font-semibold text-white">Installer l'application</p>
            <p className="mt-0.5 text-sm text-white/60">Choisissez "Installer l'application" ou "Ajouter à l'écran d'accueil"</p>
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
              <p className="mt-0.5 text-sm text-white/60">Le bouton en bas de Safari</p>
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
    </div>
  )
}

function DesktopInstall() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-2xl bg-white p-6 shadow-lg">
        <img src="/qr-mycelestin.svg" alt="QR Code Celestin" className="h-48 w-48" />
      </div>
      <p className="text-sm text-white/60">
        Scannez ou visitez <span className="font-medium text-white">www.MyCelestin.com</span>
      </p>
    </div>
  )
}

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
    <div className="min-h-screen overflow-x-hidden bg-[#171513] text-white">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .anim-fade-1 { animation: fadeUp 0.6s ease-out 0.15s both; }
        .anim-fade-2 { animation: fadeUp 0.6s ease-out 0.3s both; }
        .anim-fade-3 { animation: fadeUp 0.6s ease-out 0.45s both; }
        .anim-fade-4 { animation: fadeUp 0.6s ease-out 0.6s both; }
        .anim-float { animation: float 6s ease-in-out infinite; }
        .anim-float-slow { animation: float 7s ease-in-out infinite; }
        .anim-float-slower { animation: float 8s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="anim-float absolute -left-10 top-24 h-24 w-24 rounded-full bg-[#722F37]/18" />
        <div className="anim-float-slow absolute -right-4 top-20 h-16 w-16 rounded-full bg-[#DAC17C]/20" />
        <div className="anim-float-slower absolute left-2 top-[26rem] h-12 w-12 rounded-full bg-[#D4917A]/18" />
        <div className="anim-float absolute right-6 top-[40rem] h-20 w-20 rounded-full bg-[#722F37]/16" />
        <div className="anim-float-slow absolute -left-3 top-[54rem] h-14 w-14 rounded-full bg-[#DAC17C]/18" />
        <div className="anim-float-slower absolute right-10 top-[68rem] h-10 w-10 rounded-full bg-[#D4917A]/20" />

        <div className="absolute -left-16 top-16 h-40 w-40 rounded-full bg-[#722F37]/10 blur-3xl" />
        <div className="absolute right-[-2rem] top-48 h-32 w-32 rounded-full bg-[#B8860B]/10 blur-3xl" />
        <div className="absolute left-[-1.5rem] top-[42rem] h-28 w-28 rounded-full bg-white/6 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-col px-6 pb-24">
        <header className="anim-fade-1 pt-12 pb-8 text-center" style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}>
          <p
            className="text-xs font-semibold tracking-[3px] text-[#B8860B]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            CELESTIN
          </p>
        </header>

        <section className="anim-fade-2 mb-10 text-center">
          <h1
            className="mb-3 text-[34px] font-bold leading-tight text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            <span className="text-white">Choisissez,</span>{' '}
            <span className="text-[#D4A843]">mémorisez,</span>{' '}
            <span className="text-white">partagez.</span>
          </h1>
          <p className="mx-auto max-w-md text-[15px] leading-relaxed text-white/70">
            Le carnet de cave intelligent et vivant qui vous aide à mieux choisir vos vins, garder la mémoire de vos dégustations et les partager.
          </p>
        </section>

        <section className="anim-fade-3 relative mb-12 w-full">
          <div className="anim-float absolute -left-6 top-8 h-24 w-24 rounded-full bg-[#722F37]/16" />
          <div className="anim-float-slow absolute -right-4 top-20 h-16 w-16 rounded-full bg-[#DAC17C]/20" />
          <div className="anim-float-slower absolute -left-2 bottom-4 h-12 w-12 rounded-full bg-[#D4917A]/18" />

          <div
            className="relative mx-auto w-[260px] overflow-hidden rounded-[28px] shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
            style={{ perspective: '800px' }}
          >
            <div style={{ transform: 'rotateY(-2deg) rotateX(1deg)' }}>
              <img
                src={showcaseCards[2].image}
                alt={showcaseCards[2].alt}
                className="block w-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="anim-fade-3 mb-12">
          <div className="grid gap-4">
            {showcaseCards.map((card) => (
              <div key={card.title} className="relative text-center">
                <div className="anim-float absolute -left-4 top-[7.5rem] h-14 w-14 rounded-full bg-[#722F37]/14" />
                <div className="anim-float-slow absolute -right-2 top-[4.5rem] h-10 w-10 rounded-full bg-[#DAC17C]/18" />
                <div className="mb-3">
                  <h2
                    className="mb-1 text-[18px] font-semibold text-white"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {card.title}
                  </h2>
                  <p className="mx-auto max-w-[300px] text-[13px] leading-relaxed text-white/58">
                    {card.copy}
                  </p>
                </div>
                <div className="mx-auto w-[260px] overflow-hidden rounded-[22px] border border-white/8 bg-[#ece7df] shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
                  <img
                    src={card.image}
                    alt={card.alt}
                    className="block w-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="anim-fade-4 mb-12 rounded-[24px] border border-white/8 bg-white/[0.035] p-5 backdrop-blur-sm">
          <p className="mb-4 text-center text-[10px] font-semibold tracking-[2px] text-white/40">
            POURQUOI CELESTIN
          </p>
          <div className="grid gap-3">
            <div className="rounded-[16px] border border-white/6 bg-white/[0.02] p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[1.4px] text-[#B8860B]">Choisir plus juste</p>
              <p className="text-[13px] leading-relaxed text-white/65">Retrouvez ce que vous avez, laissez Celestin vous guider, ouvrez la bonne bouteille au bon moment.</p>
            </div>
            <div className="rounded-[16px] border border-white/6 bg-white/[0.02] p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[1.4px] text-[#B8860B]">Garder la mémoire</p>
              <p className="text-[13px] leading-relaxed text-white/65">Conservez vos dégustations, vos repères et les bouteilles qui comptent vraiment pour vous.</p>
            </div>
            <div className="rounded-[16px] border border-white/6 bg-white/[0.02] p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[1.4px] text-[#B8860B]">Partager facilement</p>
              <p className="text-[13px] leading-relaxed text-white/65">Diffusez une dégustation, une belle bouteille ou une recommandation en quelques secondes.</p>
            </div>
          </div>
        </section>

        <section className="anim-fade-4 w-full">
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

            <p className="text-center text-xs text-white/40">
              Gratuit · Léger · Prêt en 30 secondes
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
