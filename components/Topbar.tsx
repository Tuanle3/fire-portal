'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTopbarInfo } from '@/contexts/topbar-info'

const MODULE_TITLE: Record<string, { name: string; icon: string }> = {
  '/tasks':     { name: 'Quản trị công việc',  icon: '✓' },
  '/users':     { name: 'Quản lý người dùng',  icon: '👥' },
  '/dashboard': { name: 'Tổng quan',            icon: '⊞' },
  '/assets':    { name: 'Tài sản đảm bảo',      icon: '🏦' },
  '/data':      { name: 'Nhật ký dòng tiền',    icon: '💰' },
}

export default function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { info } = useTopbarInfo()
  const [user, setUser] = useState({ name: 'Admin', role: '' })

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(sess => {
        if (!sess) return
        const roles: Record<string, string> = { ceo: 'CEO', finance: 'CFO', admin: 'Admin', pm: 'PM', viewer: 'Viewer' }
        setUser({ name: sess.full_name || 'Admin', role: roles[sess.role] ?? (sess.role || '').toUpperCase() })
      }).catch(() => {})
  }, [])

  function handleLogout() {
    document.cookie = 'fire_session=; path=/; max-age=0'
    router.push('/login')
  }

  const module = MODULE_TITLE[pathname] ?? { name: 'Fire Portal', icon: 'F' }

  return (
    <header className="topbar">
      <button className="menu-toggle" onClick={onMenuToggle} aria-label="Mở menu">☰</button>
      <div className="topbar-brand">
        <span className="topbar-brand-name">{module.name}</span>
      </div>

      <div className="topbar-right">
        {info && (
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {info}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{user.name}</span>
        <button className="logout-btn" onClick={handleLogout}>Đăng xuất</button>
      </div>
    </header>
  )
}
