'use client'

/**
 * use-role.ts — Lấy vai trò người đang đăng nhập từ /api/me (đã có sẵn
 * trong hệ thống — xem app/users/page.tsx, biến `myRole` / `canManage`).
 * ─────────────────────────────────────────────────────────────
 * Định nghĩa "admin" dùng chung cho toàn app: role là 'ceo' hoặc 'admin'
 * (đúng theo cách trang Quản lý User đang xét quyền `canManage`).
 * Dùng lại định nghĩa này ở mọi nơi để nhất quán, không tự chế thêm.
 * ─────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react'

export type PortalRole = 'ceo' | 'admin' | 'finance' | 'pm' | 'viewer' | ''

// Các role được coi là "toàn quyền" trong app — khớp với `canManage` ở trang Quản lý User
const ADMIN_ROLES: PortalRole[] = ['ceo', 'admin']

let cachedRole: PortalRole | null = null
let inFlight: Promise<PortalRole> | null = null

async function fetchRole(): Promise<PortalRole> {
  if (cachedRole !== null) return cachedRole
  if (!inFlight) {
    inFlight = fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        const role = (s?.role as PortalRole) ?? ''
        cachedRole = role
        return role
      })
      .catch(() => {
        cachedRole = ''
        return '' as PortalRole
      })
  }
  return inFlight
}

/** Vai trò của người đang đăng nhập ('ceo' | 'admin' | 'finance' | 'pm' | 'viewer' | '' lúc đang tải) */
export function useRole(): PortalRole {
  const [role, setRole] = useState<PortalRole>(cachedRole ?? '')

  useEffect(() => {
    let alive = true
    fetchRole().then(r => { if (alive) setRole(r) })
    return () => { alive = false }
  }, [])

  return role
}

/** true nếu người đang đăng nhập có quyền quản trị (role 'ceo' hoặc 'admin') */
export function useIsAdmin(): boolean {
  const role = useRole()
  return ADMIN_ROLES.includes(role)
}
