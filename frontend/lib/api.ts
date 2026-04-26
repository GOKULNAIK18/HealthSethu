export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://healthsethu.onrender.com'

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE_URL}${path}`
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('hs_token')
}

export function setToken(token: string) {
  localStorage.setItem('hs_token', token)
}

export function clearToken() {
  localStorage.removeItem('hs_token')
}

export function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(apiUrl(path), { ...init, headers })
}
