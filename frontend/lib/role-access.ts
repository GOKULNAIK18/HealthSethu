/**
 * Which app routes each role may open (pathname from Next.js).
 * Admin may access everything including /admin/*.
 */

export type AppRole = 'patient' | 'asha' | 'doctor' | 'admin'

/** Strip suffix like " (ASHA)" for matching `assigned_asha` text from seed data. */
export function displayNameForAshaMatch(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

export function canAccessPath(role: AppRole | string | undefined, pathname: string): boolean {
  if (!role) return false
  if (role === 'admin') return true
  if (pathname.startsWith('/admin')) return false

  const r = role as Exclude<AppRole, 'admin'>
  const routes = ROLE_ALLOWED[r]
  if (!routes) return false

  return routes.some(route => {
    if (route === '/') return pathname === '/'
    return pathname === route || pathname.startsWith(`${route}/`)
  })
}

const ROLE_ALLOWED: Record<Exclude<AppRole, 'admin'>, string[]> = {
  patient: ['/', '/user-input', '/ai-prediction', '/progress-tracking'],
  asha: ['/', '/user-input', '/ai-prediction', '/asha-panel', '/progress-tracking'],
  doctor: ['/', '/user-input', '/ai-prediction', '/doctor-panel', '/progress-tracking'],
}
