'use client'

import { useEffect, useState, useCallback } from 'react'
import SeverityBadge from '@/components/severity-badge'
import StatusBadge from '@/components/status-badge'
import {
  Stethoscope, CheckCircle2, User, MapPin, Phone, Clock, ImageIcon, Brain, Edit3,
  Save, RotateCcw, Clipboard, Loader2, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import { apiFetch, apiUrl } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'

type DiagnosisMode = 'confirm' | 'override'
type CaseUiStatus = 'Ongoing' | 'Resolved'

interface CaseRow {
  id: number
  case_code: string
  patient_name: string
  condition: string
  severity: string
  status: string
}

interface FullCase extends CaseRow {
  age: number
  gender: string
  village: string
  district: string
  state?: string
  phone: string
  duration_days: number
  ai_disease: string
  ai_confidence: number
  assigned_asha: string
  doctor_notes?: string
  doctor_diagnosis?: string
  doctor_override?: number
  symptoms: string[]
  images: { id: number; filename: string; condition_score: number; label: string; uploaded_at: string }[]
  ai_reasoning?: string[] | string
}

function patientDisplayName(name?: string | null): string {
  const value = typeof name === 'string' ? name.trim() : ''
  return value || 'Unknown Patient'
}

function patientInitials(name?: string | null): string {
  const safeName = patientDisplayName(name)
  return safeName
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'UP'
}

function ImageTile({
  filename,
  score,
  date,
  label,
  active,
}: {
  filename: string
  score: number
  date: string
  label: string
  active?: boolean
}) {
  const hue = Math.max(0, 120 - score * 12)
  const isSeed = filename.startsWith('seed-')
  return (
    <div
      className={clsx(
        'rounded-xl overflow-hidden border flex-shrink-0 w-24 transition-all',
        active ? 'border-sky-500/50 ring-2 ring-sky-500/20' : 'border-white/8'
      )}
    >
      {!isSeed ? (
        <div className="relative h-20">
          <img src={apiUrl(`/uploads/${filename}`)} alt="" className="w-full h-20 object-cover bg-slate-800" />
          <span className="absolute bottom-1 right-1 text-[9px] font-bold text-white/80 bg-black/50 px-1 rounded">
            {score.toFixed(1)}
          </span>
        </div>
      ) : (
        <div
          className="h-20 flex items-center justify-center relative"
          style={{ background: `radial-gradient(circle, hsl(${hue},55%,25%), hsl(${hue},38%,12%))` }}
        >
          <ImageIcon className="w-5 h-5 opacity-25 text-white" />
          <span className="text-[10px] font-bold text-white/40 absolute">{score.toFixed(1)}</span>
        </div>
      )}
      <div className="bg-slate-900/70 px-1.5 py-1">
        <p className="text-[9px] text-slate-500 truncate">{date?.split('T')[0]}</p>
        <p className="text-[8px] text-slate-600 truncate">{label}</p>
      </div>
    </div>
  )
}

function reasoningLines(c: FullCase): string[] {
  const r = c.ai_reasoning
  if (!r) return []
  if (Array.isArray(r)) return r
  if (typeof r === 'string') {
    try {
      const p = JSON.parse(r)
      return Array.isArray(p) ? p : [r]
    } catch {
      return [r]
    }
  }
  return []
}

export default function DoctorPanel() {
  const { t } = useI18n()
  const [list, setList]       = useState<CaseRow[]>([])
  const [detail, setDetail]   = useState<FullCase | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [mode, setMode]       = useState<DiagnosisMode>('confirm')
  const [overrideDiagnosis, setOverride] = useState('')
  const [notes, setNotes]     = useState('')
  const [caseStatus, setCaseStatus] = useState<CaseUiStatus>('Ongoing')
  const [saved, setSaved]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await apiFetch('/api/cases?limit=500')
      const data = await res.json()
      const all = (data.cases ?? []) as CaseRow[]
      const doc = all.filter(c => c.status === 'Escalated' || c.severity === 'Severe')
      setList(doc)
      setSelectedId(prev => {
        if (doc.length === 0) return null
        if (prev != null && doc.some(x => x.id === prev)) return prev
        return doc[0].id
      })
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    apiFetch(`/api/cases/${selectedId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const c = d.case as FullCase
        setDetail(c)
        setNotes(c.doctor_notes ?? '')
        setOverride(c.doctor_diagnosis && c.doctor_override ? c.doctor_diagnosis : '')
        setMode(c.doctor_override ? 'override' : 'confirm')
        setCaseStatus(c.status === 'Resolved' ? 'Resolved' : 'Ongoing')
        setSaved(false)
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => { cancelled = true }
  }, [selectedId])

  async function handleSave() {
    if (!detail) return
    if (mode === 'override' && !overrideDiagnosis.trim()) {
      setToast('Enter a diagnosis when overriding AI.')
      setTimeout(() => setToast(null), 4000)
      return
    }
    setSaving(true)
    try {
      const nextStatus =
        caseStatus === 'Resolved'
          ? 'Resolved'
          : detail.status === 'Escalated'
            ? 'Escalated'
            : 'Active'

      const res = await apiFetch(`/api/cases/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_notes: notes,
          doctor_diagnosis: mode === 'override' ? overrideDiagnosis.trim() : detail.ai_disease,
          doctor_override: mode === 'override' ? 1 : 0,
          status: nextStatus,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setToast(`Case ${detail.case_code} updated.`)
      setTimeout(() => setToast(null), 4000)
      await loadList()
      const refreshed = await apiFetch(`/api/cases/${detail.id}`).then(r => r.json())
      setDetail(refreshed.case)
    } catch {
      setToast('Could not save. Try again.')
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  if (loadingList) {
    return (
      <div className="p-6 space-y-4">
        <div className="glass h-14 shimmer rounded-2xl" />
        <div className="flex gap-4">
          <div className="w-72 glass h-96 shimmer rounded-2xl" />
          <div className="flex-1 glass h-96 shimmer rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!list.length) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Stethoscope className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No escalated or severe cases at this time.</p>
          <button
            type="button"
            onClick={loadList}
            className="mt-4 text-sky-400 text-sm hover:underline cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  const patient = detail

  return (
    <div className="p-6 animate-fade-in-up h-[calc(100vh-0px)] flex flex-col gap-4">

      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('doctor.title')}</h1>
            <p className="text-slate-400 text-xs">{list.length} case{list.length !== 1 ? 's' : ''} in queue</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadList}
          className="text-slate-500 hover:text-slate-300 p-2 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">

        <div className="w-72 flex-shrink-0 glass p-3 overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2">Cases</p>
          <div className="space-y-1">
            {list.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={clsx(
                  'w-full text-left px-3 py-3 rounded-xl transition-all cursor-pointer',
                  selectedId === p.id
                    ? 'bg-sky-500/15 border border-sky-500/25'
                    : 'hover:bg-white/5 border border-transparent'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-white/8 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                    {patientInitials(p.patient_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-200 truncate">{patientDisplayName(p.patient_name)}</p>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{p.condition}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <SeverityBadge severity={p.severity as 'Early' | 'Moderate' | 'Severe'} size="sm" pulse />
                  <span className="text-[10px] text-slate-600">{p.case_code}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
          {loadingDetail && (
            <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading case…
            </div>
          )}

          {!loadingDetail && patient && (
            <>
              <div className="glass p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/25 to-red-500/25 border border-white/10 flex items-center justify-center text-lg font-bold text-slate-200">
                      {patientInitials(patient.patient_name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-lg font-bold text-white">{patientDisplayName(patient.patient_name)}</h2>
                        <SeverityBadge severity={patient.severity as 'Early' | 'Moderate' | 'Severe'} size="md" pulse />
                        <StatusBadge status={patient.status as 'Active' | 'Resolved' | 'Escalated'} />
                      </div>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {patient.age}y · {patient.gender} · {patient.condition}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {patient.village}, {patient.district}
                          {patient.state ? `, ${patient.state}` : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {patient.duration_days}d duration
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">ASHA Worker</p>
                    <p className="text-sm font-semibold text-slate-300">{patient.assigned_asha ?? '—'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-white/8">
                  {(patient.symptoms ?? []).map(s => (
                    <span key={s} className="text-[11px] bg-white/5 border border-white/8 px-2.5 py-1 rounded-full text-slate-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="glass p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-white">Image Timeline</h3>
                  <span className="text-xs text-slate-500">({patient.images?.length ?? 0} uploads)</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {(patient.images ?? []).map((img, i, arr) => (
                    <ImageTile
                      key={img.id ?? i}
                      filename={img.filename}
                      score={img.condition_score}
                      date={img.uploaded_at}
                      label={img.label}
                      active={i === arr.length - 1}
                    />
                  ))}
                </div>
                {(patient.images?.length ?? 0) >= 2 && (() => {
                  const imgs = patient.images!
                  const first = imgs[0].condition_score
                  const last = imgs.at(-1)!.condition_score
                  const diff = last - first
                  return (
                    <div
                      className={clsx(
                        'mt-3 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border',
                        diff > 0
                          ? 'bg-red-500/10 border-red-500/20 text-red-400'
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      )}
                    >
                      {diff > 0 ? '↑ Condition Worsening' : '↓ Condition Improving'}
                      <span className="font-bold">
                        ({diff > 0 ? '+' : ''}
                        {diff.toFixed(1)} score change)
                      </span>
                    </div>
                  )
                })()}
              </div>

              <div className="glass p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">{t('doctor.diagnosisReview')}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Predicted Disease</p>
                    <p className="text-sm font-bold text-white mt-1.5">{patient.ai_disease}</p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Confidence</span>
                        <span className="text-emerald-400 font-bold">{Math.round(patient.ai_confidence ?? 0)}%</span>
                      </div>
                      <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                          style={{ width: `${Math.min(100, patient.ai_confidence ?? 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/4 border border-white/8 rounded-xl p-4">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Severity</p>
                    <div className="mt-2">
                      <SeverityBadge severity={patient.severity as 'Early' | 'Moderate' | 'Severe'} size="lg" pulse />
                    </div>
                    <p className="text-xs text-slate-500 mt-3">
                      Decision engine output from symptoms, duration, and image-derived score.
                    </p>
                  </div>
                </div>
                {reasoningLines(patient).length > 0 && (
                  <ul className="mt-3 text-xs text-slate-500 space-y-1 list-disc list-inside border-t border-white/8 pt-3">
                    {reasoningLines(patient).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="glass p-5 space-y-5">
                <div className="flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Diagnosis & Review</h3>
                  {saved && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">AI Diagnosis Decision</p>
                  <div className="flex gap-2">
                    {(['confirm', 'override'] as DiagnosisMode[]).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setMode(m); setSaved(false) }}
                        className={clsx(
                          'flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-2',
                          mode === m
                            ? m === 'confirm'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-white/5 text-slate-500 border-white/8 hover:text-slate-300'
                        )}
                      >
                        {m === 'confirm' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm AI Diagnosis
                          </>
                        ) : (
                          <>
                            <Edit3 className="w-3.5 h-3.5" /> Override AI Diagnosis
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'override' && (
                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1.5">
                      Doctor&apos;s Diagnosis <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={overrideDiagnosis}
                      onChange={e => { setOverride(e.target.value); setSaved(false) }}
                      placeholder={`Override: ${patient.ai_disease}`}
                      className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Clinical Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => { setNotes(e.target.value); setSaved(false) }}
                    placeholder="Clinical observations, treatment, referrals…"
                    rows={4}
                    className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
                  />
                </div>

                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Case Status</p>
                  <div className="flex gap-2">
                    {(['Ongoing', 'Resolved'] as CaseUiStatus[]).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setCaseStatus(s); setSaved(false) }}
                        className={clsx(
                          'flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-2',
                          caseStatus === s
                            ? s === 'Resolved'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                            : 'bg-white/5 text-slate-500 border-white/8 hover:text-slate-300'
                        )}
                      >
                        {s === 'Ongoing' ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" /> Mark Ongoing
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('doctor.saveReview')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-800 border border-white/10 rounded-2xl px-5 py-3.5 shadow-2xl animate-fade-in-up">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-slate-200 font-medium">{toast}</p>
        </div>
      )}
    </div>
  )
}
