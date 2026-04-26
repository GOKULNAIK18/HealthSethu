'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, setToken, clearToken, apiUrl } from '@/lib/api'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'patient' | 'asha' | 'doctor' | 'admin'
  phone?: string | null
  village?: string | null
  district?: string | null
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, logout: async () => {}, refresh: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const refresh = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('hs_token') : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(apiUrl('/api/auth/me'), { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.token) setToken(data.token)
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    clearToken()
    setUser(null)
    router.push('/login')
  }

  return <Ctx.Provider value={{ user, loading, logout, refresh }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
