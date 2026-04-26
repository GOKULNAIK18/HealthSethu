import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/sidebar'
import { AuthProvider } from '@/contexts/auth-context'
import { I18nProvider } from '@/contexts/i18n-context'

export const metadata: Metadata = {
  title: 'HealthSetu – AI Healthcare System',
  description: 'AI-powered healthcare assistance for early disease detection in rural India.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0F172A] text-slate-100 min-h-screen">
        <AuthProvider>
          <I18nProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <main className="flex-1 md:ml-64 min-h-screen overflow-x-hidden pt-14 md:pt-0">
                {children}
              </main>
            </div>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
