'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import DashTabsBar from './DashTabsBar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        <DashTabsBar />
        <div className="app-content">{children}</div>
      </div>
    </div>
  )
}
