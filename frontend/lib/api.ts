export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://healthsethu.onrender.com'

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE_URL}${path}`
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), { credentials: 'include', ...init })
}
