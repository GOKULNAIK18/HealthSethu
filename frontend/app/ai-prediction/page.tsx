'use client'

import { useEffect, useState } from 'react'
import SeverityBadge from '@/components/severity-badge'
import StatusBadge from '@/components/status-badge'
import {
  Brain, ChevronDown, ImageIcon, Zap, CheckCircle2,
  AlertTriangle, Activity, ArrowRight, User, MapPin,
  Phone, Calendar, Clock, RefreshCw, Loader2,
} from 'lucide-react'
import clsx from 'clsx'
import { apiFetch, apiUrl } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'

interface Case {
  id: number; case_code: string; patient_id: number
  patient_name: string; age: number; gender: string
  village: string; district: string; phone: string
  condition: string; duration_days: number
  severity: string; status: string
  ai_disease: string; ai_confidence: number
  ai_openai_disease?: string; ai_openai_confidence?: number
  ai_condition_score: number; ai_reasoning: string[] | string
  assigned_asha: string; created_at: string
  doctor_notes?: string; doctor_diagnosis?: string
  symptoms: string[]
  images: { id:number; filename:string; condition_score:number; label:string; uploaded_at:string }[]
}

function ConfBar({ value }: { value: number }) {
  const color = value >= 85 ? 'from-emerald-600 to-emerald-400' : value >= 70 ? 'from-amber-600 to-amber-400' : 'from-red-600 to-red-400'
  const textColor = value >= 85 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-400">Confidence</span>
        <span className={`font-bold ${textColor}`}>{value}%</span>
      </div>
      <div className="h-2.5 bg-white/8 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${color}`} style={{ width:`${value}%` }} />
      </div>
    </div>
  )
}

function ImgTile({ filename, score, label, date }: { filename:string; score:number; label:string; date:string }) {
  const hue = Math.max(0, 120 - score * 12)
  const isSeed = filename.startsWith('seed-')
  return (
    <div className="rounded-xl overflow-hidden border border-white/8 flex-shrink-0 w-32">
      {!isSeed ? (
        <img src={apiUrl(`/uploads/${filename}`)} alt={label}
          className="w-full h-24 object-cover bg-slate-800" />
      ) : (
        <div className="h-24 flex items-center justify-center" style={{ background:`radial-gradient(circle,hsl(${hue},55%,22%),hsl(${hue},35%,10%))` }}>
          <ImageIcon className="w-6 h-6 opacity-20 text-white" />
          <span className="absolute text-xs font-bold text-white/30">{score.toFixed(1)}</span>
        </div>
      )}
      <div className="bg-slate-900/80 px-2 py-1.5">
        <p className="text-[10px] text-slate-400 truncate">{label}</p>
        <p className="text-[9px] text-slate-600">{date?.split('T')[0]}</p>
      </div>
    </div>
  )
}

function ActionCard({ severity }: { severity: string }) {
  const cfg = {
    Early:    { title:'Self-Monitoring Enabled',    icon:Activity,     color:'text-emerald-400', bg:'bg-emerald-500/10', border:'border-emerald-500/20', steps:['Apply prescribed topical treatment','Maintain wound hygiene','Upload daily progress photos','Contact ASHA if worsening'] },
    Moderate: { title:'ASHA Worker Assigned',       icon:CheckCircle2, color:'text-amber-400',   bg:'bg-amber-500/10',   border:'border-amber-500/20',   steps:['ASHA worker notified automatically','In-person visit within 24 hours','Oral medications prescribed','Doctor review if no improvement in 7 days'] },
    Severe:   { title:'Immediate Doctor Alert',     icon:AlertTriangle,color:'text-red-400',     bg:'bg-red-500/10',     border:'border-red-500/20',     steps:['Doctor alerted via SMS + platform','Patient directed to nearest facility','ASHA worker to escort patient','Case flagged critical on dashboard'] },
  }[severity] ?? { title:'Care Assigned', icon:Activity, color:'text-sky-400', bg:'bg-sky-500/10', border:'border-sky-500/20', steps:[] }
  const Icon = cfg.icon
  return (
    <div className={`rounded-2xl ${cfg.bg} border ${cfg.border} p-4 space-y-3`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center border ${cfg.border}`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div>
          <p className={`text-sm font-bold ${cfg.color}`}>{cfg.title}</p>
          <p className="text-[10px] text-slate-500">Action taken by HealthSetu</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {cfg.steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className={`w-4 h-4 rounded-full border ${cfg.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <span className={`text-[9px] font-bold ${cfg.color}`}>{i+1}</span>
            </div>
            <p className="text-xs text-slate-300">{s}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AIDiagnosisPage() {
  const { t } = useI18n()
  const [cases,    setCases]   = useState<Case[]>([])
  const [selId,    setSelId]   = useState<number | null>(null)
  const [detail,   setDetail]  = useState<Case | null>(null)
  const [loadList, setLoadList]= useState(true)
  const [loadDetail,setLoadDetail]=useState(false)

  useEffect(() => {
    apiFetch('/api/cases')
      .then(r => r.json())
      .then(d => {
        setCases(d.cases ?? [])
        if (d.cases?.length) setSelId(d.cases[0].id)
      })
      .finally(() => setLoadList(false))
  }, [])

  useEffect(() => {
    if (!selId) return
    setLoadDetail(true)
    apiFetch(`/api/cases/${selId}`)
      .then(r => r.json())
      .then(d => {
        const c = d.case
        if (c.ai_reasoning && typeof c.ai_reasoning === 'string') {
          try { c.ai_reasoning = JSON.parse(c.ai_reasoning) } catch { c.ai_reasoning = [c.ai_reasoning] }
        }
        setDetail(c)
      })
      .finally(() => setLoadDetail(false))
  }, [selId])

  if (loadList) return (
    <div className="p-6 space-y-4">
      <div className="glass h-14 shimmer rounded-2xl" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="glass h-80 shimmer rounded-2xl" />)}
      </div>
    </div>
  )

  const c = detail
  const reasoning: string[] = Array.isArray(c?.ai_reasoning) ? c.ai_reasoning : c?.ai_reasoning ? [c.ai_reasoning as string] : []

  return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('aiDiagnosis.title')}</h1>
            <p className="text-slate-400 text-xs">Trained skin classifier + OpenAI co-pilot decision support</p>
          </div>
        </div>

        <div className="relative">
          <select value={selId ?? ''} onChange={e=>setSelId(Number(e.target.value))}
            className="appearance-none bg-white/8 border border-white/12 text-slate-200 text-sm px-4 py-2.5 pr-9 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 cursor-pointer min-w-[240px]">
            {cases.map(c2 => (
              <option key={c2.id} value={c2.id} className="bg-slate-900">
                {c2.case_code} · {c2.patient_name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {loadDetail && <div className="glass h-64 shimmer rounded-2xl" />}

      {!loadDetail && c && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {/* Patient info */}
            <div className="glass p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-white/8 pb-3">
                <User className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-white">Patient Profile</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/30 to-emerald-500/30 border border-white/10 flex items-center justify-center text-base font-bold text-slate-300">
                  {c.patient_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{c.patient_name}</p>
                  <p className="text-xs text-slate-500">{c.age}y · {c.gender}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { icon:MapPin,   v:`${c.village}, ${c.district}` },
                  { icon:Phone,    v:c.phone },
                  { icon:Calendar, v:new Date(c.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) },
                  { icon:Clock,    v:`${c.duration_days} days` },
                ].map(({icon:Icon,v},i)=>(
                  <div key={i} className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                    <span className="text-slate-400">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <SeverityBadge severity={c.severity as any} size="sm" pulse />
                <StatusBadge   status={c.status   as any} size="sm" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Symptoms</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.symptoms?.map(s=>(
                    <span key={s} className="text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-slate-400">{s}</span>
                  ))}
                </div>
              </div>
              <div className="text-xs text-slate-500 border-t border-white/8 pt-2">
                Case: <strong className="text-slate-300">{c.case_code}</strong>
              </div>
            </div>

            {/* Diagnosis */}
            <div className="glass p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-white/8 pb-3">
                <Zap className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-white">{t('aiDiagnosis.mlResult')}</h2>
              </div>

              {c.images?.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Latest Upload</p>
                  <ImgTile
                    filename={c.images.at(-1)!.filename}
                    score={c.images.at(-1)!.condition_score}
                    label={c.images.at(-1)!.label}
                    date={c.images.at(-1)!.uploaded_at}
                  />
                </div>
              )}

              <div className="bg-white/5 border border-white/8 rounded-xl p-4 space-y-3">
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('aiDiagnosis.diagnosedCondition')}</p>
                <p className="text-base font-bold text-white leading-tight">{c.ai_disease ?? 'Pending analysis'}</p>
                {c.ai_confidence && <ConfBar value={c.ai_confidence} />}
                <p className="text-[10px] text-slate-500">Model: EfficientNet skin classifier</p>
              </div>

              <div className="bg-white/5 border border-white/8 rounded-xl p-4 space-y-3">
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('aiDiagnosis.openaiDiagnosis')}</p>
                <p className="text-base font-bold text-white leading-tight">{c.ai_openai_disease ?? 'Unavailable'}</p>
                {c.ai_openai_confidence ? <ConfBar value={c.ai_openai_confidence} /> : (
                  <p className="text-xs text-slate-500">OpenAI diagnosis unavailable (missing key or request error).</p>
                )}
                <p className="text-[10px] text-slate-500">Model: OpenAI dermatology triage assistant</p>
              </div>

              <div className="flex items-center justify-between bg-white/5 border border-white/8 rounded-xl px-4 py-3">
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Decision Engine</p>
                  <p className="text-sm font-semibold text-slate-200 mt-1">Severity Classification</p>
                </div>
                <SeverityBadge severity={c.severity as any} size="lg" pulse />
              </div>

              {reasoning.length > 0 && (
                <div className="bg-white/3 border border-white/5 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">AI Reasoning</p>
                  {reasoning.map((r,i)=>(
                    <p key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                      <span className="text-sky-500 mt-0.5">•</span>{r}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Care pathway */}
            <div className="glass p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-white/8 pb-3">
                <ArrowRight className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-white">Care Pathway</h2>
              </div>
              <div className="space-y-2">
                {[
                  { label:'AI Image Analysis',        note:`${c.ai_confidence ?? 0}% confidence` },
                  { label:'Symptom Scoring',           note:`${c.symptoms?.length ?? 0} symptoms` },
                  { label:'Duration Weighting',        note:`${c.duration_days} days`            },
                  { label:'Severity Classification',   note:c.severity                            },
                  { label:'Care Pathway Assigned',     note:c.status                              },
                ].map(({label,note})=>(
                  <div key={label} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-emerald-500/20 border border-emerald-500/30">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-300">{label}</p>
                      <p className="text-[10px] text-slate-500">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <ActionCard severity={c.severity} />
              {c.assigned_asha && (
                <div className="text-xs text-slate-500 border-t border-white/8 pt-2">
                  ASHA Worker: <strong className="text-slate-300">{c.assigned_asha}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Image timeline */}
          {c.images?.length > 0 && (
            <div className="glass p-5">
              <div className="flex items-center gap-2 border-b border-white/8 pb-3 mb-4">
                <Calendar className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-white">Image Upload Timeline</h2>
                <span className="text-xs text-slate-500">({c.images.length} uploads)</span>
              </div>
              <div className="flex gap-3 flex-wrap">
                {c.images.map((img,i)=>(
                  <ImgTile key={i} filename={img.filename} score={img.condition_score} label={img.label} date={img.uploaded_at} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
