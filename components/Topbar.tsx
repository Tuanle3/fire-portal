'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { useUserSession } from '@/contexts/user-session'

const MODULE_TITLE: Record<string, { name: string; icon: string; breadcrumb?: string }> = {
  '/tasks':     { name: 'Quản trị công việc',  icon: '✓' },
  '/users':     { name: 'Quản lý người dùng',  icon: '👥' },
  '/dashboard': { name: 'Tổng quan',            icon: '⊞' },
  '/assets':    { name: 'Tài sản đảm bảo',      icon: '🏦' },
  '/data':      { name: 'Nhật ký dòng tiền',    icon: '💰' },
  '/ccn-pricing': { name: 'Tính giá cho thuê CCN', icon: '🏭' },
}

const ROLE_LABEL: Record<string, string> = { ceo: 'CEO', finance: 'CFO', admin: 'Admin', pm: 'PM', viewer: 'Viewer' }

export default function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { info } = useTopbarInfo()
  const { name, role } = useUserSession()
  const user = { name: name || 'Admin', role: ROLE_LABEL[role] ?? (role || '').toUpperCase() }

  function handleLogout() {
    document.cookie = 'fire_session=; path=/; max-age=0'
    router.push('/login')
  }

  const module = MODULE_TITLE[pathname] ?? { name: 'Fire Portal', icon: 'F' }

  return (
    <header className="topbar">
      <button className="menu-toggle" onClick={onMenuToggle} aria-label="Mở menu">☰</button>
      <div className="topbar-brand">
        {module.breadcrumb && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginRight: 6 }}>
            {module.breadcrumb} ›
          </span>
        )}
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
