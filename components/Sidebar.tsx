'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUserSession } from '@/contexts/user-session'

const NAV = [
  { section: 'TỔNG QUAN',    mod: 'm:dashboard', href: '/dashboard',  icon: '⊞',  label: 'Tổng quan CEO' },
  { section: 'MODULE CHÍNH', mod: 'm:dashboard', href: '/ecosystem',  icon: '🌐', label: 'Hệ sinh thái' },
  { section: 'DỰ ÁN',        mod: 'm:project',   href: '/project',    icon: '🏗️', label: 'NOXH Nguyễn Trãi' },
  { section: 'VẬN HÀNH',     mod: 'm:tasks',     href: '/tasks',      icon: '✓',  label: 'Công việc' },
  { section: 'HỆ THỐNG',     mod: 'm:users',     href: '/users',      icon: '👤', label: 'Quản lý User' },
]

const ROLE_LABEL: Record<string, string> = { ceo: 'CEO', finance: 'CFO', admin: 'Admin', pm: 'PM', viewer: 'Viewer' }

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const { name, role, can } = useUserSession()

  // Group allowed items by section
  const allowed = NAV.filter(item => can(item.mod))

  // Group by section
  const sections = allowed.reduce<Record<string, typeof NAV>>((acc, item) => {
    acc[item.section] = [...(acc[item.section] ?? []), item]
    return acc
  }, {})

  return (
    <nav className={`sidebar${open ? ' open' : ''}`}>
      <div className="sb-brand">
        <button className="sb-close" onClick={onClose} aria-label="Đóng menu">✕</button>
        <div className="sb-logo">F</div>
        <div className="sb-name">Fire Portal</div>
        <div className="sb-sub">MANAGEMENT SYSTEM</div>
      </div>

      <div className="sb-nav">
        {Object.entries(sections).map(([section, items]) => (
          <div key={section}>
            <div className="sb-section">{section}</div>
            {items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`sb-item${pathname.startsWith(item.href) ? ' active' : ''}`}
              >
                <span className="sb-ic">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <div className="sb-avatar">{(name || '?').charAt(0).toUpperCase()}</div>
        <div>
          <div className="sb-uname">{name || 'Đang tải…'}</div>
          <div className="sb-urole">{ROLE_LABEL[role] ?? (role || '').toUpperCase()}</div>
        </div>
      </div>
    </nav>
  )
}
