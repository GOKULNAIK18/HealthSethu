'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { dictionaries } from '@/lib/i18n/dictionaries'
import type { Language } from '@/lib/i18n/types'

type I18nContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const STORAGE_KEY = 'healthsetu.lang'

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('kn')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null
    if (saved && (saved === 'kn' || saved === 'hi' || saved === 'en')) {
      setLanguageState(saved)
    }
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }

  const t = (key: string): string => {
    return dictionaries[language][key] ?? dictionaries.kn[key] ?? key
  }

  const value = useMemo(() => ({ language, setLanguage, t }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
