'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { HeartPulse, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'
import { languageNames } from '@/lib/i18n/dictionaries'

export default function LoginPage() {
  const { t, language, setLanguage } = useI18n()
  const router = useRouter()
  const { refresh } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Login failed'); return }
      await refresh()
      router.push('/')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const demos = [
    { label: 'Admin',        email: 'admin@healthsetu.in',   pw: 'Admin@123',   color: 'text-violet-400' },
    { label: 'Doctor',       email: 'doctor@healthsetu.in',  pw: 'Doctor@123',  color: 'text-amber-400'  },
    { label: 'ASHA Worker',  email: 'asha@healthsetu.in',    pw: 'Asha@123',    color: 'text-emerald-400' },
    { label: 'Patient',      email: 'patient@healthsetu.in', pw: 'Patient@123', color: 'text-sky-400'    },
  ]

  return (
    <div className="min-h-screen bg-[#0F172A] flex justify-center items-start md:items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4 mx-auto">
        <div className="flex justify-end">
          <div className="rounded-xl bg-white/5 border border-white/10 px-2.5 py-2 min-w-36">
            <p className="text-[10px] text-slate-500 mb-1">{t('common.language')}</p>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as 'kn' | 'hi' | 'en')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="kn">{languageNames.kn}</option>
              <option value="hi">{languageNames.hi}</option>
              <option value="en">{languageNames.en}</option>
            </select>
          </div>
        </div>

        {/* Brand */}
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-sky-500/25">
            <HeartPulse className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mt-3">HealthSetu</h1>
          <p className="text-slate-400 text-sm mt-1">AI-powered rural healthcare system</p>
        </div>

        {/* Form card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white text-center">{t('auth.signIn')}</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('auth.email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('auth.password')}</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500">
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
              {t('auth.register')}
            </Link>
          </p>
        </div>

        {/* Demo credentials */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
            {t('auth.demoCredentials')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {demos.map(d => (
              <button
                key={d.label}
                type="button"
                onClick={() => { setEmail(d.email); setPassword(d.pw) }}
                className="flex flex-col items-center text-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-2 py-2.5 transition-all cursor-pointer min-w-0"
              >
                <p className={`text-xs font-semibold ${d.color}`}>{d.label}</p>
                <p className="text-[10px] text-slate-500 mt-1 w-full break-all leading-tight">{d.email}</p>
                <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{d.pw}</p>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
