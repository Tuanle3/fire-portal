'use client'
import { useRouter } from 'next/navigation'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { useUserSession } from '@/contexts/user-session'

const ROLE_LABEL: Record<string, string> = { ceo: 'CEO', finance: 'CFO', admin: 'Admin', pm: 'PM', viewer: 'Viewer' }

export default function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router   = useRouter()
  const { info } = useTopbarInfo()
  const { name, role } = useUserSession()
  const user = { name: name || 'Admin', role: ROLE_LABEL[role] ?? (role || '').toUpperCase() }

  function handleLogout() {
    document.cookie = 'fire_session=; path=/; max-age=0'
    router.push('/login')
  }

  return (
    <header className="topbar">
      <button className="menu-toggle" onClick={onMenuToggle} aria-label="Mở menu">☰</button>

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
