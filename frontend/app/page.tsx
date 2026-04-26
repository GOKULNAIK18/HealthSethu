'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SeverityBadge from '@/components/severity-badge'
import StatusBadge from '@/components/status-badge'
import {
  UserPlus, Brain, Users, Stethoscope, TrendingUp,
  AlertTriangle, Activity, CheckCircle, Users2,
  ArrowRight, Clock, MapPin, Zap, RefreshCw, Sparkles,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useAuth } from '@/contexts/auth-context'
import { canAccessPath } from '@/lib/role-access'
import type { AppRole } from '@/lib/role-access'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/contexts/i18n-context'

interface Stats {
  total: number; active: number; resolved: number; critical: number
  early: number; moderate: number; severe: number; escalated: number
}
interface RecentCase {
  id: number
  case_code: string
  condition?: string
  severity: string
  status: string
  created_at: string
  patient_name: string
  age: number
  gender: string
  village: string
  district: string
}

const SEVERITY_COLORS = { Early: '#10B981', Moderate: '#F59E0B', Severe: '#EF4444' }

const CustomTooltip = ({ active, payload, total }: any) => {
  if (active && payload?.length) {
    const d = payload[0]
    return (
      <div className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm shadow-xl">
        <p className="font-semibold text-white">{d.name}</p>
        <p className="text-slate-300">{d.value} cases ({Math.round((d.value / total) * 100)}%)</p>
      </div>
    )
  }
  return null
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const quickNav = [
  { href: '/user-input',        label: 'User Input',       desc: 'Register new patient case',    icon: UserPlus,    from: 'from-sky-600',     to: 'to-sky-400',    glow: 'shadow-sky-500/20'    },
  { href: '/ai-prediction',     label: 'AI Diagnosis',     desc: 'View ML disease diagnosis',    icon: Brain,       from: 'from-violet-600',  to: 'to-violet-400', glow: 'shadow-violet-500/20' },
  { href: '/asha-panel',        label: 'ASHA Panel',       desc: 'Manage assigned patients',     icon: Users,       from: 'from-emerald-600', to: 'to-emerald-400',glow: 'shadow-emerald-500/20'},
  { href: '/doctor-panel',      label: 'Doctor Panel',     desc: 'Review and validate cases',    icon: Stethoscope, from: 'from-amber-600',   to: 'to-amber-400',  glow: 'shadow-amber-500/20'  },
  { href: '/progress-tracking', label: 'Progress Tracking',desc: 'Monitor patient recovery',     icon: TrendingUp,  from: 'from-pink-600',    to: 'to-pink-400',   glow: 'shadow-pink-500/20'   },
]

const ROLE_DASHBOARD: Record<AppRole, { title: string; subtitle: string }> = {
  patient: {
    title: 'My dashboard',
    subtitle: 'Your personal care — only cases linked to you',
  },
  asha: {
    title: 'ASHA dashboard',
    subtitle: 'Community cases you created or are assigned to',
  },
  doctor: {
    title: 'Clinical dashboard',
    subtitle: 'Hospital-wide cases for triage and validation',
  },
  admin: {
    title: 'System dashboard',
    subtitle: 'Full analytics and federated learning oversight',
  },
}

function actionHref(role: AppRole | undefined): string {
  switch (role) {
    case 'patient':
      return '/progress-tracking'
    case 'asha':
      return '/asha-panel'
    case 'doctor':
    case 'admin':
      return '/doctor-panel'
    default:
      return '/progress-tracking'
  }
}

/** Patient-facing copy for modules (not staff wording). */
const PATIENT_QUICK_COPY: Record<string, { label: string; desc: string }> = {
  '/user-input': {
    label: 'Report a case',
    desc: 'Submit symptoms and photos for triage and follow-up',
  },
  '/ai-prediction': {
    label: 'AI guidance',
    desc: 'View triage insights for your own cases',
  },
  '/progress-tracking': {
    label: 'My progress',
    desc: 'Track recovery timelines and next steps',
  },
}

export default function Dashboard() {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const role = user?.role as AppRole | undefined
  const dash = role ? ROLE_DASHBOARD[role] : { title: 'Dashboard', subtitle: 'Overview' }
  const quickFiltered = role
    ? quickNav.filter(q => canAccessPath(role, q.href))
    : quickNav
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [recent,  setRecent]  = useState<RecentCase[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res  = await apiFetch('/api/dashboard/stats')
      const data = await res.json()
      setStats(data.stats)
      setRecent(data.recent ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }
    load()
  }, [authLoading, user, router])

  const severityData = stats ? [
    { name: 'Early',    value: stats.early,    color: SEVERITY_COLORS.Early    },
    { name: 'Moderate', value: stats.moderate, color: SEVERITY_COLORS.Moderate },
    { name: 'Severe',   value: stats.severe,   color: SEVERITY_COLORS.Severe   },
  ] : []

  if (authLoading || loading) return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className={`grid gap-4 ${user?.role === 'patient' ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {Array.from({ length: user?.role === 'patient' ? 3 : 4 }).map((_, i) => (
          <div key={i} className="glass p-5 h-28 shimmer rounded-2xl" />
        ))}
      </div>
      <div className="glass p-6 h-64 shimmer rounded-2xl" />
    </div>
  )

  /* ─── Patient: personal care view only (not facility-wide metrics) ─── */
  if (role === 'patient') {
    const patientStats = [
      { label: 'My cases', value: stats?.total ?? 0, icon: Users2, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', sub: 'Submitted or linked to you' },
      { label: 'In progress', value: stats?.active ?? 0, icon: Activity, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', sub: 'Active or escalated care' },
      { label: 'Completed', value: stats?.resolved ?? 0, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', sub: 'Resolved on your record' },
    ]

    return (
      <div className="p-6 space-y-6 animate-fade-in-up max-w-5xl mx-auto">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{dash.title}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {user ? `${user.name} — your personal care summary` : 'Your care summary'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={load} className="text-slate-500 hover:text-slate-300 p-2 rounded-xl hover:bg-white/5 transition-all cursor-pointer" aria-label="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {stats && stats.critical > 0 && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/25 rounded-2xl px-5 py-3.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-red-300 font-semibold text-sm">
                {stats.critical} of your case{stats.critical > 1 ? 's need' : ' needs'} urgent follow-up
              </p>
              <p className="text-red-400/70 text-xs mt-0.5">Please review progress tracking or contact your ASHA / clinic.</p>
            </div>
            <Link href="/progress-tracking" className="flex items-center gap-1.5 text-red-400 text-xs font-semibold hover:text-red-300 transition-colors">
              Open <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {patientStats.map(({ label, value, icon: Icon, color, bg, border, sub }) => (
            <div key={label} className={`glass p-5 border ${border}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">{label}</p>
                  <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
                  <p className="text-xs text-slate-600 mt-1">{sub}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {stats && stats.total === 0 ? (
          <div className="glass rounded-2xl p-8 border border-sky-500/15 bg-gradient-to-br from-sky-500/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-7 h-7 text-sky-400" />
              </div>
              <div className="flex-1 space-y-2">
                <h2 className="text-lg font-semibold text-white">No cases on your record yet</h2>
                <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
                  This page only shows health cases that you submit yourself or that are linked to your account — not anyone else&apos;s data.
                  When you report a concern, it will appear here with status and follow-up.
                </p>
                <Link
                  href="/user-input"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold transition-colors"
                >
                  Report a case <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 glass p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Your triage mix</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Severity for your cases only</p>
                </div>
                <Zap className="w-4 h-4 text-slate-500" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={4} dataKey="value" stroke="none">
                    {severityData.map(e => <Cell key={e.name} fill={e.color} opacity={0.9} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip total={stats?.total ?? 1} />} />
                  <Legend formatter={v => <span className="text-xs text-slate-300 font-medium">{v}</span>} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {severityData.map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      <span className="text-xs text-slate-400">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-white/8 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${stats?.total ? (value / stats.total) * 100 : 0}%`, background: color }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-300 w-4 text-right">{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3 glass p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">Your cases</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Newest first — visible only to you</p>
                </div>
                <Link href="/progress-tracking" className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 transition-colors">
                  Full timeline <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[320px] pr-1">
                {recent.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 hover:bg-white/5 transition-colors border border-white/5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500/30 to-emerald-500/30 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                      {c.patient_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200 truncate">{c.condition || 'Case'}</span>
                        <span className="text-[10px] text-slate-600 font-mono">{c.case_code}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        <span className="text-xs text-slate-500 truncate">{c.village}, {c.district}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <SeverityBadge severity={c.severity as any} size="sm" />
                      <StatusBadge status={c.status as any} size="sm" />
                    </div>
                    <div className="flex items-center gap-1 text-slate-600 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">{daysSince(c.created_at)}d</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">What you can do</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 max-w-3xl">
            {quickFiltered.map(({ href, label, desc, icon: Icon, from, to, glow }) => {
              const pc = PATIENT_QUICK_COPY[href]
              return (
                <Link
                  key={href}
                  href={href}
                  className="group glass p-4 hover:bg-white/8 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-white/15"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${from} ${to} flex items-center justify-center mb-3 shadow-lg ${glow} group-hover:scale-105 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{pc?.label ?? label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{pc?.desc ?? desc}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-slate-600 group-hover:text-sky-400 transition-colors">
                    Open <ArrowRight className="w-3 h-3" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ─── Staff / clinical dashboard ─── */
  return (
    <div className="p-6 space-y-6 animate-fade-in-up">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{dash.title}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {user
              ? `${dash.subtitle} · ${user.name} (${user.role === 'asha' ? 'ASHA Worker' : user.role})`
              : 'Real-time overview'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-slate-500 hover:text-slate-300 p-2 rounded-xl hover:bg-white/5 transition-all cursor-pointer" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/5 border border-white/8 px-3 py-2 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live · {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Critical alert */}
      {stats && stats.critical > 0 && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/25 rounded-2xl px-5 py-3.5">
          <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-red-300 font-semibold text-sm">
              {stats.critical} Critical Case{stats.critical > 1 ? 's' : ''} Require Immediate Attention
            </p>
            <p className="text-red-400/70 text-xs mt-0.5">Severe patients flagged — coordinate with ASHA and referral where needed.</p>
          </div>
          <Link href={actionHref(role)} className="flex items-center gap-1.5 text-red-400 text-xs font-semibold hover:text-red-300 transition-colors">
            View <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('dashboard.totalCases'),     value: stats?.total    ?? 0, icon: Users2,       color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     sub: 'All registered patients' },
          { label: t('dashboard.activeCases'),    value: stats?.active   ?? 0, icon: Activity,     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   sub: 'Ongoing + escalated'     },
          { label: t('dashboard.resolvedCases'),  value: stats?.resolved ?? 0, icon: CheckCircle,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', sub: 'Successfully treated'    },
          { label: t('dashboard.criticalAlerts'), value: stats?.critical ?? 0, icon: AlertTriangle,color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     sub: 'Severe, unresolved'      },
        ].map(({ label, value, icon: Icon, color, bg, border, sub }) => (
          <div key={label} className={`glass p-5 border ${border}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
                <p className="text-xs text-slate-600 mt-1">{sub}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Recent */}
      <div className="grid grid-cols-5 gap-4">

        {/* Donut chart */}
        <div className="col-span-2 glass p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Severity Distribution</h2>
              <p className="text-xs text-slate-500 mt-0.5">{stats?.total ?? 0} total cases</p>
            </div>
            <Zap className="w-4 h-4 text-slate-500" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={4} dataKey="value" stroke="none">
                {severityData.map(e => <Cell key={e.name} fill={e.color} opacity={0.9} />)}
              </Pie>
              <Tooltip content={<CustomTooltip total={stats?.total ?? 1} />} />
              <Legend formatter={v => <span className="text-xs text-slate-300 font-medium">{v}</span>} iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {severityData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-slate-400">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${stats?.total ? (value/stats.total)*100 : 0}%`, background: color }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-300 w-4 text-right">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent cases */}
        <div className="col-span-3 glass p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Recent Cases</h2>
              <p className="text-xs text-slate-500 mt-0.5">Latest 10 registrations (live from DB)</p>
            </div>
            <Link href={actionHref(role)} className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[320px] pr-1">
            {recent.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 hover:bg-white/5 transition-colors border border-white/5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500/30 to-emerald-500/30 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                  {c.patient_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200 truncate">{c.patient_name}</span>
                    <span className="text-xs text-slate-600">{c.age}y · {c.gender?.[0]}</span>
                    <span className="text-[10px] text-slate-700">{c.case_code}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <MapPin className="w-3 h-3 text-slate-600 flex-shrink-0" />
                    <span className="text-xs text-slate-500 truncate">{c.village}, {c.district}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <SeverityBadge severity={c.severity as any} size="sm" />
                  <StatusBadge   status={c.status   as any} size="sm" />
                </div>
                <div className="flex items-center gap-1 text-slate-600 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  <span className="text-[10px]">{daysSince(c.created_at)}d</span>
                </div>
              </div>
            ))}
            {recent.length === 0 && <p className="text-slate-500 text-sm text-center py-8">No cases yet.</p>}
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">{t('dashboard.quickAccess')}</h2>
        <div className={`grid gap-3 ${quickFiltered.length <= 2 ? 'grid-cols-2 max-w-xl' : quickFiltered.length <= 3 ? 'grid-cols-3' : quickFiltered.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-5'}`}>
          {quickFiltered.map(({ href, label, desc, icon: Icon, from, to, glow }) => (
            <Link key={href} href={href}
              className="group glass p-4 hover:bg-white/8 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-white/15">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${from} ${to} flex items-center justify-center mb-3 shadow-lg ${glow} group-hover:scale-105 transition-transform`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{desc}</p>
              <div className="flex items-center gap-1 mt-3 text-xs text-slate-600 group-hover:text-sky-400 transition-colors">
                Open <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
