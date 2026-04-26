export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!API_BASE_URL) return path
  return `${API_BASE_URL}${path}`
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), { credentials: 'include', ...init })
}
