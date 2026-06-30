'use client'
import { useState, Suspense, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import DashTabsBar from './DashTabsBar'
import { useUserSession, PATH_MODULE, firstAllowedPath } from '@/contexts/user-session'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { perms, loading } = useUserSession()
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    const mod = PATH_MODULE[pathname]
    if (mod && !perms.includes(mod)) {
      router.replace(firstAllowedPath(perms))
    }
  }, [loading, pathname, perms, router])

  return (
    <div className="app-shell">
      <div
        className={`sb-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <button
        className={`sb-pull-tab${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(o => !o)}
        aria-label={sidebarOpen ? 'Đóng menu' : 'Mở menu'}
      >
        {sidebarOpen ? '◀' : '▶'}
      </button>
      <div className="app-main">
        <Topbar onMenuToggle={() => setSidebarOpen(o => !o)} />
        <Suspense fallback={null}>
          <DashTabsBar />
        </Suspense>
        <div className="app-content">{children}</div>
      </div>
    </div>
  )
}
