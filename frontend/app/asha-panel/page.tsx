'use client'

import { useEffect, useState } from 'react'
import SeverityBadge from '@/components/severity-badge'
import StatusBadge from '@/components/status-badge'
import {
  Users, AlertTriangle, Clock, MapPin, Phone,
  ChevronUp, ArrowRight, Bell, Filter, X, CheckCircle2, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'

type SeverityFilter = 'All' | 'Early' | 'Moderate' | 'Severe'

interface Case {
  id: number; case_code: string; patient_name: string; age: number; gender: string
  village: string; district: string; phone: string; condition: string
  duration_days: number; severity: string; status: string
  ai_disease: string; ai_confidence: number; assigned_asha: string; created_at: string
  doctor_notes?: string
  doctor_diagnosis?: string
  updated_at?: string
  images: { condition_score: number; uploaded_at: string; label: string }[]
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export default function AshaPanel() {
  const { t } = useI18n()
  const [cases, setCases]   = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<SeverityFilter>('All')
  const [confirm, setConfirm] = useState<{ open: boolean; c: Case | null }>({ open: false, c: null })
  const [toast, setToast]     = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await apiFetch('/api/cases')
      const data = await res.json()
      // ASHA panel shows all non-resolved cases
      setCases((data.cases ?? []).filter((c: Case) => c.status !== 'Resolved'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function doEscalate(c: Case) {
    setSaving(true)
    try {
      await apiFetch(`/api/cases/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Escalated' }),
      })
      setCases(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Escalated' } : x))
      setConfirm({ open: false, c: null })
      setToast(`${c.patient_name} escalated to doctor panel.`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  const pool     = cases
  const filtered = filter === 'All' ? pool : pool.filter(c => c.severity === filter)
  const severe   = pool.filter(c => c.severity === 'Severe').length

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="glass h-14 shimmer rounded-2xl" />
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="glass h-16 shimmer rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="glass h-64 shimmer rounded-2xl" />)}
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('asha.title')}</h1>
            <p className="text-slate-400 text-xs">{t('asha.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {severe > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/25 px-3 py-2 rounded-xl">
              <Bell className="w-3.5 h-3.5 text-red-400 animate-pulse" />
              <span className="text-xs text-red-400 font-semibold">{severe} severe alert{severe > 1 ? 's' : ''}</span>
            </div>
          )}
          <button onClick={load} className="text-slate-500 hover:text-slate-300 p-2 rounded-xl hover:bg-white/5 transition-all cursor-pointer" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Assigned',    value: pool.length,                                       color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20'     },
          { label: 'Early Stage',       value: pool.filter(c => c.severity === 'Early').length,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'Moderate',          value: pool.filter(c => c.severity === 'Moderate').length, color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
          { label: 'Severe / Escalated',value: severe,                                             color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'     },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`glass px-4 py-3.5 border ${border}`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs text-slate-500 mr-1">Filter:</span>
        {(['All', 'Early', 'Moderate', 'Severe'] as SeverityFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'text-xs px-4 py-1.5 rounded-full border font-medium transition-all cursor-pointer',
              filter === f
                ? f === 'All'      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : f === 'Early'    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : f === 'Moderate' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                   : 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-white/5 text-slate-500 border-white/8 hover:text-slate-300 hover:border-white/15'
            )}
          >
            {f} {f !== 'All' && `(${pool.filter(c => c.severity === f).length})`}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">{filtered.length} case{filtered.length !== 1 ? 's' : ''} shown</span>
      </div>

      {/* Patient Cards Grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(c => {
          const isEscalated = c.status === 'Escalated'
          const days        = daysSince(c.created_at)
          const imgs        = c.images ?? []
          const first       = imgs[0]?.condition_score
          const last        = imgs.at(-1)?.condition_score
          const diff        = (first != null && last != null) ? last - first : null

          return (
            <div
              key={c.id}
              className={clsx(
                'glass p-5 space-y-4 transition-all duration-200 hover:border-white/15',
                c.severity === 'Severe' && !isEscalated && 'border-red-500/20'
              )}
            >
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-white/8 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
                    {c.patient_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-100">{c.patient_name}</p>
                    <p className="text-xs text-slate-500">{c.age}y · {c.gender}</p>
                  </div>
                </div>
                <SeverityBadge severity={c.severity as any} size="sm" pulse={c.severity === 'Severe'} />
              </div>

              {/* Condition */}
              <div className="bg-white/4 rounded-xl px-3 py-2.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">Condition</span>
                  <StatusBadge status={c.status as any} size="sm" />
                </div>
                <p className="text-xs font-semibold text-slate-200">{c.condition}</p>
                <p className="text-[10px] text-slate-500 truncate">{c.ai_disease ?? '—'} · {c.ai_confidence ?? 0}% conf.</p>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{c.village}, {c.district}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Phone className="w-3 h-3 flex-shrink-0" />
                  <span>{c.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span>{days === 0 ? 'Today' : `${days}d ago`} · {c.duration_days}d symptom duration</span>
                </div>
              </div>

              {/* ASHA worker + trend */}
              <div className="flex items-center justify-between text-xs border-t border-white/8 pt-3">
                <span className="text-slate-500">ASHA: <span className="text-slate-300 font-medium">{c.assigned_asha ?? '—'}</span></span>
                {diff !== null && Math.abs(diff) >= 0.1 && (
                  <div className={clsx('flex items-center gap-1 font-medium', diff > 0 ? 'text-red-400' : 'text-emerald-400')}>
                    <ChevronUp className={clsx('w-3 h-3', diff < 0 && 'rotate-180')} />
                    {Math.abs(diff).toFixed(1)} {diff > 0 ? 'worsening' : 'improving'}
                  </div>
                )}
              </div>

              {/* Doctor -> ASHA communication */}
              {(c.doctor_diagnosis || c.doctor_notes || isEscalated) && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">{t('asha.doctorReview')}</p>
                    {c.updated_at && (
                      <p className="text-[10px] text-amber-500/80">
                        {new Date(c.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </div>

                  {c.doctor_diagnosis ? (
                    <p className="text-xs text-slate-200">
                      <span className="text-slate-400">Diagnosis: </span>
                      <span className="font-semibold">{c.doctor_diagnosis}</span>
                    </p>
                  ) : null}

                  {c.doctor_notes ? (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <span className="text-slate-400">Notes: </span>
                      {c.doctor_notes}
                    </p>
                  ) : null}

                  {!c.doctor_diagnosis && !c.doctor_notes && isEscalated ? (
                    <p className="text-xs text-amber-300">{t('asha.waitingDoctorReview')}</p>
                  ) : null}
                </div>
              )}

              {/* Escalate button */}
              {isEscalated ? (
                <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs font-semibold text-orange-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('asha.alreadyEscalated')}
                </div>
              ) : (
                <button
                  onClick={() => setConfirm({ open: true, c })}
                  className={clsx(
                    'w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer',
                    c.severity === 'Severe'
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/25'
                      : 'bg-white/8 hover:bg-white/12 text-slate-300 border border-white/8'
                  )}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {t('asha.escalate')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="glass p-12 text-center">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No {filter !== 'All' ? filter.toLowerCase() : ''} cases found</p>
        </div>
      )}

      {/* Confirm Escalate Modal */}
      {confirm.open && confirm.c && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-white/12">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Escalate to Doctor?</p>
                <p className="text-xs text-slate-500">This will notify the doctor panel</p>
              </div>
              <button onClick={() => setConfirm({ open: false, c: null })} className="ml-auto text-slate-500 hover:text-slate-300 transition-colors cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Escalating <strong className="text-slate-200">{confirm.c.patient_name}</strong>'s case (<strong className="text-slate-200">{confirm.c.condition}</strong>) to the doctor panel for immediate medical review.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm({ open: false, c: null })} className="flex-1 bg-white/8 hover:bg-white/12 text-slate-300 text-sm py-2.5 rounded-xl transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => doEscalate(confirm.c!)}
                disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {saving ? 'Saving…' : 'Confirm Escalate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-800 border border-white/10 rounded-2xl px-5 py-3.5 shadow-2xl animate-fade-in-up">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-slate-200 font-medium">{toast}</p>
        </div>
      )}

    </div>
  )
}
