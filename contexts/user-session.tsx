'use client'
import { createContext, useContext, useEffect, useState } from 'react'

const ALL_MODULES = ['m:dashboard', 'm:tasks', 'm:finance', 'm:assets', 'm:data', 'm:users', 'm:ccn-pricing', 'm:noxh', 'm:dien-nuoc']

const DEFAULT_PERMS: Record<string, string[]> = {
  ceo:    ALL_MODULES,
  admin:  ALL_MODULES,
  viewer: ['m:dashboard'],
}

function resolvePerms(role: string, tabs: string[] | null | undefined): string[] {
  if (!tabs || tabs.length === 0) return DEFAULT_PERMS[role] ?? ['m:tasks']
  return tabs
}

interface Session {
  name: string
  role: string
  perms: string[]
  loading: boolean
  can: (mod: string) => boolean
}

const Ctx = createContext<Session>({
  name: '', role: '', perms: [], loading: true, can: () => true,
})

export function UserSessionProvider({ children }: { children: React.ReactNode }) {
  const [sess, setSess] = useState<Session>({
    name: '', role: '', perms: [], loading: true, can: () => true,
  })

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (!s) { setSess({ name: '', role: '', perms: [], loading: false, can: () => false }); return }
        const perms = resolvePerms(s.role, s.tabs)
        setSess({ name: s.full_name || '', role: s.role || '', perms, loading: false, can: (m) => perms.includes(m) })
      })
      .catch(() => setSess({ name: '', role: '', perms: [], loading: false, can: () => false }))
  }, [])

  return <Ctx.Provider value={sess}>{children}</Ctx.Provider>
}

export const useUserSession = () => useContext(Ctx)

// Path → module mapping
export const PATH_MODULE: Record<string, string> = {
  '/dashboard': 'm:dashboard',
  '/cocau':     'm:dashboard',
  '/suckhoe':   'm:dashboard',
  '/baocao':    'm:dashboard',
  '/ecosystem': 'm:dashboard',
  '/assets':    'm:assets',
  '/data':      'm:data',
  '/tasks':     'm:tasks',
  '/users':     'm:users',
  '/ccn-pricing': 'm:ccn-pricing',
  '/noxh-nguyen-trai': 'm:noxh',
  '/dien-nuoc-sadt': 'm:dien-nuoc',
}

// First accessible path for a user given their perms
export function firstAllowedPath(perms: string[]): string {
  const order = ['/tasks', '/dashboard', '/assets', '/data', '/users']
  const modOrder = order.map(p => PATH_MODULE[p])
  for (const mod of modOrder) {
    if (perms.includes(mod)) {
      return order[modOrder.indexOf(mod)]
    }
  }
  return '/tasks'
}
