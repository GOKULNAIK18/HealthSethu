'use client'

import { useEffect, useState } from 'react'
import SeverityBadge from '@/components/severity-badge'
import StatusBadge from '@/components/status-badge'
import {
  TrendingUp, TrendingDown, Minus, ImageIcon,
  ChevronDown, Activity, Calendar, AlertTriangle, RefreshCw,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import clsx from 'clsx'
import { apiFetch, apiUrl } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'

const THRESHOLD_MOD = 4
const THRESHOLD_SEV = 7

const scoreColor  = (s: number) => s >= THRESHOLD_SEV ? '#EF4444' : s >= THRESHOLD_MOD ? '#F59E0B' : '#10B981'
const scoreLabel  = (s: number) => s >= THRESHOLD_SEV ? 'Critical' : s >= THRESHOLD_MOD ? 'Moderate' : 'Healthy'

interface CaseImage {
  id: number
  filename: string
  condition_score: number
  label: string
  uploaded_at: string
}
interface Case {
  id:number; case_code:string; patient_name:string; age:number; gender:string
  village:string; district:string; condition:string; severity:string; status:string
  images: CaseImage[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const score = payload[0].value as number
    return (
      <div className="bg-slate-800 border border-white/10 rounded-xl px-4 py-3 shadow-xl">
        <p className="text-xs text-slate-400 mb-1">{payload[0].payload.date}</p>
        <p className="text-sm font-bold" style={{ color: scoreColor(score) }}>
          Score: {score.toFixed(1)} — {scoreLabel(score)}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{payload[0].payload.label}</p>
      </div>
    )
  }
  return null
}

function ImgTile({ filename, condition_score: score, label, uploaded_at }: CaseImage) {
  const hue   = Math.max(0, 120 - score * 12)
  const color = scoreColor(score)
  const isSeed= filename.startsWith('seed-')
  const date = uploaded_at
  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 flex-shrink-0 w-36">
      {!isSeed ? (
        <img src={apiUrl(`/uploads/${filename}`)} alt={label} className="w-full h-28 object-cover bg-slate-800" />
      ) : (
        <div className="h-28 flex flex-col items-center justify-center gap-1 relative"
          style={{ background:`radial-gradient(circle at 50% 40%,hsl(${hue},55%,22%),hsl(${hue},35%,10%))` }}>
          <ImageIcon className="w-6 h-6 opacity-20 text-white" />
          <span className="text-2xl font-black" style={{ color, textShadow:`0 0 20px ${color}40` }}>{score.toFixed(1)}</span>
        </div>
      )}
      <div className="bg-slate-900/80 px-3 py-2 space-y-0.5">
        <p className="text-xs text-slate-300 font-medium truncate">{label}</p>
        <p className="text-[10px] text-slate-500">{date?.split('T')[0]}</p>
        <p className="text-[10px] font-semibold" style={{ color }}>{scoreLabel(score)}</p>
      </div>
    </div>
  )
}

export default function ProgressTrackingPage() {
  const { t } = useI18n()
  const [cases,   setCases]   = useState<Case[]>([])
  const [selId,   setSelId]   = useState<number|null>(null)
  const [c,       setC]       = useState<Case|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/cases')
      .then(r=>r.json())
      .then(d=>{
        const list = d.cases ?? []
        setCases(list)
        if (list.length) setSelId(list[0].id)
      })
      .finally(()=>setLoading(false))
  }, [])

  useEffect(()=>{
    if (!selId) return
    apiFetch(`/api/cases/${selId}`)
      .then(r=>r.json())
      .then(d=>setC(d.case))
  }, [selId])

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="glass h-14 shimmer rounded-2xl" />
      <div className="glass h-72 shimmer rounded-2xl" />
    </div>
  )

  const imgs  = c?.images ?? []
  const first = imgs[0]?.condition_score ?? 0
  const last  = imgs.at(-1)?.condition_score ?? 0
  const min   = imgs.length ? Math.min(...imgs.map(i=>i.condition_score)) : 0
  const max   = imgs.length ? Math.max(...imgs.map(i=>i.condition_score)) : 0
  const diff  = last - first

  const chartData = imgs.map(img => ({
    date:  img.uploaded_at?.split('T')[0],
    score: img.condition_score,
    label: img.label,
  }))

  const gradId = `grad-${selId}`

  return (
    <div className="p-6 space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('progress.title')}</h1>
            <p className="text-slate-400 text-xs">{t('progress.subtitle')}</p>
          </div>
        </div>
        <div className="relative">
          <select value={selId??''} onChange={e=>setSelId(Number(e.target.value))}
            className="appearance-none bg-white/8 border border-white/12 text-slate-200 text-sm px-4 py-2.5 pr-9 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 cursor-pointer min-w-[260px]">
            {cases.map(c2=>(
              <option key={c2.id} value={c2.id} className="bg-slate-900">
                {c2.case_code} · {c2.patient_name} [{c2.severity}]
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {c && (
        <>
          {/* Patient banner */}
          <div className="glass p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-sky-500/20 border border-white/10 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
                {c.patient_name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-white">{c.patient_name}</h2>
                  <SeverityBadge severity={c.severity as any} size="sm" pulse />
                  <StatusBadge   status={c.status   as any} size="sm" />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {c.age}y · {c.gender} · {c.village}, {c.district} · {c.condition}
                </p>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0">
                {[
                  { label:'Start Score',  value:first.toFixed(1), color:scoreColor(first) },
                  { label:'Latest Score', value:last.toFixed(1),  color:scoreColor(last)  },
                  { label:'Peak Score',   value:max.toFixed(1),   color:scoreColor(max)   },
                  { label:'Uploads',      value:String(imgs.length), color:'#94A3B8'      },
                ].map(({label,value,color})=>(
                  <div key={label} className="text-center">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-xl font-bold mt-0.5" style={{color}}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="glass p-4 flex flex-col justify-between">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('progress.overallTrend')}</p>
              <div className="mt-2">
                {Math.abs(diff) < 0.2 ? (
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-sm"><Minus className="w-4 h-4"/><span>Stable</span></div>
                ) : diff > 0 ? (
                  <div className="flex items-center gap-1.5 text-red-400 font-semibold text-sm"><TrendingUp className="w-4 h-4"/><span>Deteriorating</span></div>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-sm"><TrendingDown className="w-4 h-4"/><span>Improving</span></div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {first.toFixed(1)} → {last.toFixed(1)} over {imgs.length} upload{imgs.length!==1?'s':''}
              </p>
            </div>
            {[
              { label:'Score Range', primary:`${min.toFixed(1)}–${max.toFixed(1)}`, sub:`Δ ${(max-min).toFixed(1)}`, icon:Activity, color:'text-sky-400' },
              { label:'Current Status', primary:scoreLabel(last), sub:`Score ${last.toFixed(1)}/10`, icon:AlertTriangle, color:last>=7?'text-red-400':last>=4?'text-amber-400':'text-emerald-400' },
              { label:'Total Uploads', primary:String(imgs.length), sub:`Since ${imgs[0]?.uploaded_at?.split('T')[0]??'—'}`, icon:Calendar, color:'text-violet-400' },
            ].map(({label,primary,sub,icon:Icon,color})=>(
              <div key={label} className="glass p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
                </div>
                <p className={`text-2xl font-bold ${color}`}>{primary}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <div className="glass p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-white">Condition Score Over Time</h2>
                  <p className="text-xs text-slate-500 mt-0.5">1=Healthy · 10=Critical · Threshold lines shown</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {[['#10B981','Early (<4)'],['#F59E0B','Moderate (4–7)'],['#EF4444','Severe (≥7)']].map(([c2,l])=>(
                    <div key={l} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{background:c2}} />
                      <span className="text-slate-500">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{top:10,right:20,left:0,bottom:0}}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={scoreColor(last)} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={scoreColor(last)} stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'rgba(255,255,255,0.08)'}} tickLine={false} />
                  <YAxis domain={[0,10]} tick={{fill:'#64748B',fontSize:11}} axisLine={{stroke:'rgba(255,255,255,0.08)'}} tickLine={false} width={32} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={THRESHOLD_MOD} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.5} label={{value:'Moderate',fill:'#F59E0B',fontSize:10,position:'right'}} />
                  <ReferenceLine y={THRESHOLD_SEV} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.5} label={{value:'Severe',fill:'#EF4444',fontSize:10,position:'right'}} />
                  <Area type="monotone" dataKey="score" stroke={scoreColor(last)} strokeWidth={2.5} fill={`url(#${gradId})`}
                    dot={{fill:scoreColor(last),strokeWidth:0,r:4}}
                    activeDot={{r:6,strokeWidth:2,stroke:scoreColor(last),fill:'#0F172A'}} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Image timeline */}
          {imgs.length > 0 && (
            <div className="glass p-5">
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="w-4 h-4 text-pink-400" />
                <h2 className="text-sm font-semibold text-white">{t('progress.visualTimeline')}</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {imgs.map((img,i)=><ImgTile key={img.id ?? i} {...img} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
