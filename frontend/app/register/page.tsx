'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { HeartPulse, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/auth-context'
import { apiFetch, setToken } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'
import { languageNames } from '@/lib/i18n/dictionaries'
import { karnatakaDistricts } from '@/lib/mock-data'

type Role = 'patient' | 'asha' | 'doctor'

export default function RegisterPage() {
  const { t, language, setLanguage } = useI18n()
  const router = useRouter()
  const { refresh } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', village: '', district: '', state: 'Karnataka' })
  const [districtQuery, setDistrictQuery] = useState('')
  const [districtOpen, setDistrictOpen] = useState(false)
  const [role,    setRole]    = useState<Role>('patient')
  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const up = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError(''); setLoading(true)
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail ?? data.error ?? 'Registration failed'); return }
      if (data.token) setToken(data.token)
      await refresh()
      router.push('/')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const roles: { value: Role; label: string; desc: string; color: string }[] = [
    { value: 'patient',  label: 'Patient',     desc: 'Submit cases, track health', color: 'sky'    },
    { value: 'asha',     label: 'ASHA Worker', desc: 'Monitor assigned patients',  color: 'emerald' },
    { value: 'doctor',   label: 'Doctor',      desc: 'Review and validate cases',  color: 'amber'  },
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
          <h1 className="text-2xl font-bold text-white mt-3">{t('auth.createAccount')}</h1>
          <p className="text-slate-400 text-sm mt-1">Join the HealthSetu network</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Role selector */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2 text-center">I am a…</p>
            <div className="grid grid-cols-3 gap-2">
              {roles.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={clsx(
                    'relative p-3 rounded-xl border text-left transition-all cursor-pointer',
                    role === r.value
                      ? r.color === 'sky'     ? 'bg-sky-500/15 border-sky-500/40'
                        : r.color === 'emerald' ? 'bg-emerald-500/15 border-emerald-500/40'
                        :                        'bg-amber-500/15 border-amber-500/40'
                      : 'bg-white/5 border-white/8 hover:border-white/15'
                  )}
                >
                  {role === r.value && (
                    <CheckCircle2 className={clsx('w-3 h-3 absolute top-2 right-2',
                      r.color === 'sky' ? 'text-sky-400' : r.color === 'emerald' ? 'text-emerald-400' : 'text-amber-400'
                    )} />
                  )}
                  <p className={clsx('text-xs font-semibold',
                    role === r.value
                      ? r.color === 'sky' ? 'text-sky-400' : r.color === 'emerald' ? 'text-emerald-400' : 'text-amber-400'
                      : 'text-slate-300'
                  )}>{r.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Full Name *"    value={form.name}     onChange={up('name')}     placeholder="Priya Devi"      required col={2} />
              <Input label="Email *"        value={form.email}    onChange={up('email')}    placeholder="you@example.com" type="email" required col={2} />
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Password *</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required value={form.password}
                    onChange={up('password')}
                    placeholder="Min. 6 characters"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
                  />
                  <button type="button" onClick={() => setShow(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Input label="Phone"   value={form.phone}    onChange={up('phone')}    placeholder="9876543210" type="tel" />
              <Input label="Village" value={form.village}  onChange={up('village')}  placeholder="e.g. Rampur" />
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-400">District</label>
                <div className="relative">
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
                    placeholder="Search district…"
                    value={districtQuery || form.district}
                    onChange={e => { setDistrictQuery(e.target.value); setDistrictOpen(true); setForm(f => ({ ...f, district: e.target.value })) }}
                    onFocus={() => setDistrictOpen(true)}
                    onBlur={() => setTimeout(() => setDistrictOpen(false), 150)}
                    autoComplete="off"
                  />
                  {districtOpen && (
                    <ul className="absolute z-50 mt-1 w-full bg-slate-900 border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {karnatakaDistricts.filter(d => d.toLowerCase().includes(districtQuery.toLowerCase())).map(d => (
                        <li key={d} onMouseDown={() => { setForm(f => ({ ...f, district: d })); setDistrictQuery(d); setDistrictOpen(false) }}
                          className={`px-4 py-2 text-sm cursor-pointer transition-colors ${ form.district === d ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-white/8' }`}>
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <Input label="State" value={form.state} onChange={up('state')} placeholder="e.g. Karnataka" col={2} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500">
            {t('auth.haveAccount')}{' '}
            <Link href="/login" className="text-sky-400 hover:text-sky-300 font-medium transition-colors">{t('auth.signIn')}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Input({ label, col, ...props }: { label: string; col?: number } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={clsx('space-y-1.5', col === 2 && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-400">{label}</label>
      <input
        {...props}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
      />
    </div>
  )
}
