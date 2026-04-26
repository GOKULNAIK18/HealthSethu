'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, UserPlus, Brain, Users, Stethoscope,
  TrendingUp, HeartPulse, Shield, LogOut, Share2, Menu, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/auth-context'
import { canAccessPath } from '@/lib/role-access'
import type { AppRole } from '@/lib/role-access'
import { languageNames } from '@/lib/i18n/dictionaries'
import { useI18n } from '@/contexts/i18n-context'
import { useState } from 'react'

const navItems = [
  { href: '/',                  labelKey: 'nav.dashboard',        icon: LayoutDashboard, exact: true  },
  { href: '/user-input',        labelKey: 'nav.userInput',        icon: UserPlus,        exact: false },
  { href: '/ai-prediction',     labelKey: 'nav.aiDiagnosis',      icon: Brain,           exact: false },
  { href: '/asha-panel',        labelKey: 'nav.ashaPanel',        icon: Users,           exact: false },
  { href: '/doctor-panel',      labelKey: 'nav.doctorPanel',      icon: Stethoscope,     exact: false },
  { href: '/progress-tracking', labelKey: 'nav.progressTracking', icon: TrendingUp,      exact: false },
  { href: '/admin/federated',   label: 'Federated (Admin)',icon: Share2,           exact: false, adminOnly: true },
]

const roleColor: Record<string, string> = {
  admin:   'text-violet-400',
  doctor:  'text-amber-400',
  asha:    'text-emerald-400',
  patient: 'text-sky-400',
}

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { language, setLanguage, t } = useI18n()
  const [open, setOpen] = useState(false)

  if (pathname === '/login' || pathname === '/register') return null

  const sidebarContent = (
    <aside className="h-full flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20 flex-shrink-0">
            <HeartPulse className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">HealthSetu</h1>
            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">AI Healthcare System</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 pt-2 pb-1">{t('nav.modules')}</p>
        {navItems.filter(item => {
          if ('adminOnly' in item && item.adminOnly) return user?.role === 'admin'
          if (!user?.role) return false
          return canAccessPath(user.role as AppRole, item.href)
        }).map(({ href, label, labelKey, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              )}
            >
              <Icon className={clsx('w-4 h-4 flex-shrink-0', active ? 'text-sky-400' : 'text-slate-500')} aria-hidden="true" />
              {labelKey ? t(labelKey) : label}
            </Link>
          )
        })}
      </nav>

      {/* User + footer */}
      <div className="p-3 border-t border-white/8 space-y-2">
        {user && (
          <div className="rounded-xl bg-white/4 border border-white/8 overflow-hidden">
            <div className="px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
              <p className={`text-[10px] font-medium capitalize mt-0.5 ${roleColor[user.role] ?? 'text-slate-400'}`}>
                {user.role === 'asha' ? 'ASHA Worker' : user.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-300 bg-white/5 hover:bg-red-500/15 hover:text-red-300 border-t border-white/8 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              {t('common.logout')}
            </button>
          </div>
        )}
        <div className="rounded-xl bg-white/4 border border-white/8 p-2.5">
          <p className="text-[10px] text-slate-500 mb-1.5">{t('common.language')}</p>
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
          <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[10px] font-semibold text-emerald-400">{t('common.privacyProtected')}</p>
            <p className="text-[9px] text-slate-500">{t('common.federatedActive')}</p>
          </div>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-slate-900/95 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-sky-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <HeartPulse className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white">HealthSetu</span>
        </div>
        <button onClick={() => setOpen(v => !v)} className="text-slate-400 hover:text-white p-1">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div className={clsx(
        'md:hidden fixed top-0 left-0 h-full w-64 z-50 bg-slate-900/95 backdrop-blur-xl border-r border-white/8 transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block fixed left-0 top-0 h-screen w-64 bg-slate-900/90 backdrop-blur-xl border-r border-white/8 z-40">
        {sidebarContent}
      </div>
    </>
  )
}
