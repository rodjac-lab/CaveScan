import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/track'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect')
      } else if (error.message.includes('Email not confirmed')) {
        setError('Veuillez confirmer votre email avant de vous connecter')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    track('login')
    navigate('/')
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#171513] px-6">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-[#722F37]/8 blur-[80px]" />
        <div className="absolute -right-16 top-1/3 h-56 w-56 rounded-full bg-[#B8860B]/6 blur-[60px]" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <p
            className="text-[11px] font-semibold tracking-[3px] text-[#B8860B]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            CELESTIN
          </p>
          <h1
            className="mt-4 text-[28px] font-bold text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Connexion
          </h1>
          <p className="mt-2 text-[14px] text-white/50">
            Connectez-vous pour accéder à votre cave
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#B8860B]/40" />
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-[#B8860B]/50">
            <path d="M7 0.5L8.3 5.2L13 7L8.3 8.8L7 13.5L5.7 8.8L1 7L5.7 5.2L7 0.5Z" fill="currentColor" />
          </svg>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#B8860B]/40" />
        </div>

        {/* Form */}
        <form onSubmit={handleEmailLogin} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-[13px] font-medium text-white/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[15px] text-white placeholder-white/30 outline-none backdrop-blur-sm transition-colors focus:border-[#B8860B]/50 focus:bg-white/[0.07]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-[13px] font-medium text-white/70">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              placeholder="Votre mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[15px] text-white placeholder-white/30 outline-none backdrop-blur-sm transition-colors focus:border-[#B8860B]/50 focus:bg-white/[0.07]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#B8860B] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all active:scale-[0.98] hover:bg-[#D4A843] disabled:opacity-50"
          >
            {loading && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            Se connecter
          </button>
        </form>

        <p className="text-center text-[13px] text-white/40">
          Pas encore de compte ?{' '}
          <Link to="/signup" className="font-medium text-[#B8860B] hover:text-[#D4A843]">
            S'inscrire
          </Link>
        </p>
      </div>
    </div>
  )
}
