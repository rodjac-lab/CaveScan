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
    title: 'Scanne ta cave',
    copy: 'Une photo suffit. Célestin reconnaît le vin et l\'ajoute à ta cave en quelques secondes.',
    image: '/Sceeenshot Landing/Ma Cave.png',
    alt: 'Ecran Ma Cave de Celestin',
  },
  {
    title: 'Garde la mémoire',
    copy: 'Tes dégustations, tes impressions, les moments qui comptent — tout est là.',
    image: '/Sceeenshot Landing/Dégustations.png',
    alt: 'Ecran Dégustations de Celestin',
  },
  {
    title: 'Laisse-toi guider',
    copy: 'Célestin connaît ta cave et tes goûts. Il te suggère la bonne bouteille au bon moment.',
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
            <p className="mt-0.5 text-sm text-white/60">Appuie sur les trois points en haut à droite</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">2</span>
          <div>
            <p className="font-semibold text-white">Installer l'application</p>
            <p className="mt-0.5 text-sm text-white/60">Choisis "Installer l'application" ou "Ajouter à l'écran d'accueil"</p>
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
              <p className="font-semibold text-white">Appuie sur Partager</p>
              <p className="mt-0.5 text-sm text-white/60">Le bouton en bas de Safari</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8860B] text-sm font-bold text-white">2</span>
            <div>
              <p className="font-semibold text-white">Sur l'écran d'accueil</p>
              <p className="mt-0.5 text-sm text-white/60">Sélectionne "Sur l'écran d'accueil"</p>
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
        Scanne ou visite <span className="font-medium text-white">www.MyCelestin.com</span>
      </p>
    </div>
  )
}

/* ─── Decorative divider ─── */
function WineDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#B8860B]/40" />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#B8860B]/50">
        <path d="M7 0.5L8.3 5.2L13 7L8.3 8.8L7 13.5L5.7 8.8L1 7L5.7 5.2L7 0.5Z" fill="currentColor" />
      </svg>
      <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#B8860B]/40" />
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
      <div className="flex min-h-screen items-center justify-center bg-[#171513]">
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
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes revealLine {
          from { width: 0; }
          to { width: 100%; }
        }
        .anim-fade-1 { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
        .anim-fade-2 { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both; }
        .anim-fade-3 { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both; }
        .anim-fade-4 { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.55s both; }
        .anim-fade-5 { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.7s both; }
        .anim-float { animation: float 6s ease-in-out infinite; }
        .anim-float-slow { animation: float 7.5s ease-in-out infinite; }
        .anim-float-slower { animation: float 9s ease-in-out infinite; }
        .tagline-shimmer {
          background: linear-gradient(
            90deg,
            #B8860B 0%,
            #D4A843 25%,
            #F0D78C 50%,
            #D4A843 75%,
            #B8860B 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 4s linear infinite;
        }
        .hero-line {
          animation: revealLine 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both;
        }
        .showcase-phone {
          transform: perspective(800px) rotateY(-2deg) rotateX(1deg);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .showcase-phone:hover {
          transform: perspective(800px) rotateY(0deg) rotateX(0deg);
        }
      `}</style>

      {/* ─── Ambient background ─── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Soft glows */}
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-[#722F37]/8 blur-[80px]" />
        <div className="absolute -right-16 top-32 h-56 w-56 rounded-full bg-[#B8860B]/6 blur-[60px]" />
        <div className="absolute left-1/2 top-[50%] h-64 w-64 -translate-x-1/2 rounded-full bg-[#722F37]/5 blur-[100px]" />

        {/* Floating orbs */}
        <div className="anim-float absolute -left-6 top-28 h-16 w-16 rounded-full bg-[#722F37]/12" />
        <div className="anim-float-slow absolute -right-3 top-24 h-10 w-10 rounded-full bg-[#DAC17C]/14" />
        <div className="anim-float-slower absolute left-4 top-[30rem] h-8 w-8 rounded-full bg-[#D4917A]/12" />
        <div className="anim-float absolute right-8 top-[44rem] h-14 w-14 rounded-full bg-[#722F37]/10" />
        <div className="anim-float-slow absolute -left-2 top-[58rem] h-10 w-10 rounded-full bg-[#DAC17C]/12" />
        <div className="anim-float-slower absolute right-4 top-[72rem] h-6 w-6 rounded-full bg-[#D4917A]/14" />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-col px-6 pb-24">

        {/* ─── Brand mark ─── */}
        <header className="anim-fade-1 pt-14 pb-6 text-center" style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top))' }}>
          <p
            className="text-[11px] font-semibold tracking-[3px] text-[#B8860B]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            CELESTIN
          </p>
        </header>

        {/* ─── Hero ─── */}
        <section className="anim-fade-2 mb-4 text-center">
          <h1
            className="tagline-shimmer mb-1 text-[38px] font-bold leading-[1.1]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Fais parler
          </h1>
          <h1
            className="tagline-shimmer mb-4 text-[38px] font-bold leading-[1.1]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            ta cave.
          </h1>
        </section>

        {/* Gold line */}
        <div className="anim-fade-2 mx-auto mb-5 flex justify-center">
          <div className="hero-line h-px w-16 bg-gradient-to-r from-transparent via-[#B8860B]/60 to-transparent" />
        </div>

        {/* Subline */}
        <section className="anim-fade-3 mb-10 text-center">
          <p className="mx-auto max-w-[300px] text-[15px] leading-relaxed text-white/65">
            Célestin connaît ta cave et tes goûts pour t'aider à choisir, découvrir et partager les meilleurs moments de vin.
          </p>
        </section>

        {/* ─── Hero screenshot ─── */}
        <section className="anim-fade-3 relative mb-14 flex justify-center">
          <div className="relative">
            {/* Glow behind phone */}
            <div className="absolute inset-0 scale-90 rounded-[32px] bg-[#B8860B]/8 blur-2xl" />
            <div
              className="showcase-phone relative w-[250px] overflow-hidden rounded-[26px] border border-white/8 shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
            >
              <img
                src={showcaseCards[2].image}
                alt={showcaseCards[2].alt}
                className="block w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* ─── Complementary phrase ─── */}
        <section className="anim-fade-4 mb-14 text-center">
          <p
            className="text-[17px] font-medium italic leading-snug text-white/50"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Ton sommelier personnel,
            <br />
            directement dans ta cave.
          </p>
        </section>

        {/* ─── Showcase cards ─── */}
        <section className="anim-fade-4 mb-14">
          <WineDivider className="mb-10" />

          <div className="flex flex-col gap-10">
            {showcaseCards.map((card, i) => (
              <div key={card.title} className="relative">
                {/* Number */}
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="text-[32px] font-bold text-[#B8860B]/20"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="h-px flex-1 bg-white/6" />
                </div>

                <div className="mb-4">
                  <h2
                    className="mb-1.5 text-[19px] font-semibold text-white"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {card.title}
                  </h2>
                  <p className="max-w-[280px] text-[13.5px] leading-relaxed text-white/50">
                    {card.copy}
                  </p>
                </div>

                <div className="mx-auto w-[255px] overflow-hidden rounded-[22px] border border-white/6 shadow-[0_14px_40px_rgba(0,0,0,0.3)]">
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

        {/* ─── Value props ─── */}
        <section className="anim-fade-5 mb-14">
          <WineDivider className="mb-8" />

          <p
            className="mb-6 text-center text-[10px] font-semibold tracking-[2.5px] text-white/30"
          >
            POURQUOI CELESTIN
          </p>

          <div className="flex flex-col gap-3">
            {[
              {
                label: 'Choisir plus juste',
                text: 'Retrouve ce que tu as, laisse Célestin te guider, ouvre la bonne bouteille au bon moment.',
                color: '#722F37',
              },
              {
                label: 'Garder la mémoire',
                text: 'Conserve tes dégustations, tes repères et les bouteilles qui comptent vraiment.',
                color: '#C8B560',
              },
              {
                label: 'Partager facilement',
                text: 'Envoie une dégustation, une belle bouteille ou une recommandation en quelques secondes.',
                color: '#D4917A',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="group relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-white/[0.025] p-4 transition-colors hover:bg-white/[0.04]"
              >
                {/* Subtle color accent bar */}
                <div
                  className="absolute left-0 top-0 h-full w-[3px] rounded-l-[16px]"
                  style={{ background: `linear-gradient(180deg, ${item.color}80, ${item.color}20)` }}
                />
                <p className="mb-1 pl-2 text-[11px] font-medium uppercase tracking-[1.4px] text-[#B8860B]">
                  {item.label}
                </p>
                <p className="pl-2 text-[13px] leading-relaxed text-white/55">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Install CTA ─── */}
        <section className="anim-fade-5 w-full">
          <WineDivider className="mb-8" />

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

            <p className="text-center text-xs text-white/30">
              Gratuit · Léger · Prêt en 30 secondes
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
