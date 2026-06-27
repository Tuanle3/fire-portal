'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { section: 'TỔNG QUAN', items: [
    { href: '/dashboard', icon: '⊞', label: 'Tổng quan CEO' },
  ]},
  { section: 'VẬN HÀNH', items: [
    { href: '/tasks', icon: '✓', label: 'Công việc' },
  ]},
  { section: 'HỆ THỐNG', items: [
    { href: '/users', icon: '👤', label: 'Quản lý User' },
  ]},
]

const ROLE_LABEL: Record<string, string> = { ceo: 'CEO', finance: 'CFO', admin: 'Admin', pm: 'PM', viewer: 'Viewer' }

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const [user, setUser] = useState({ name: '...', role: '' })

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(sess => {
        if (!sess) return
        setUser({
          name: sess.full_name || 'Admin',
          role: ROLE_LABEL[sess.role] ?? (sess.role || '').toUpperCase(),
        })
      }).catch(() => {})
  }, [])

  return (
    <nav className={`sidebar${open ? ' open' : ''}`}>
      <div className="sb-brand">
        <button className="sb-close" onClick={onClose} aria-label="Đóng menu">✕</button>
        <div className="sb-logo">F</div>
        <div className="sb-name">Fire Portal</div>
        <div className="sb-sub">MANAGEMENT SYSTEM</div>
      </div>

      <div className="sb-nav">
        {NAV.map(group => (
          <div key={group.section}>
            <div className="sb-section">{group.section}</div>
            {group.items.map(item => (
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
        <div className="sb-avatar">{user.name.charAt(0).toUpperCase()}</div>
        <div>
          <div className="sb-uname">{user.name}</div>
          <div className="sb-urole">{user.role}</div>
        </div>
      </div>
    </nav>
  )
}
