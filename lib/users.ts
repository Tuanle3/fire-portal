import { db } from './firebase'
import { ref, get, set, update, remove } from 'firebase/database'

export type UserRole = 'ceo' | 'admin' | 'finance' | 'pm' | 'viewer'

export interface PortalUser {
  id: string
  username: string
  hash: string
  role: UserRole
  full_name: string
  created_at: string
  active: boolean
  tabs?: string[] | null
  department?: string | null
  level?: string | null
  position?: string | null
}

export async function getUsers(): Promise<PortalUser[]> {
  const snap = await get(ref(db, 'portal_users'))
  if (!snap.exists()) return []
  const users: PortalUser[] = []
  snap.forEach(child => { users.push({ id: child.key!, ...child.val() }) })
  return users.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function getUserByCredentials(username: string, hash: string): Promise<PortalUser | null> {
  const users = await getUsers()
  return users.find(u => u.username === username && u.hash === hash && u.active) ?? null
}

export async function createUser(data: Omit<PortalUser, 'id' | 'created_at'>): Promise<PortalUser> {
  const users = await getUsers()
  if (users.find(u => u.username === data.username)) throw new Error('Username already exists')
  const id = Date.now().toString()
  const user: PortalUser = { ...data, id, created_at: new Date().toISOString() }
  await set(ref(db, `portal_users/${id}`), { ...data, created_at: user.created_at })
  return user
}

export async function updateUser(id: string, data: Partial<Omit<PortalUser, 'id' | 'created_at'>>): Promise<PortalUser | null> {
  if (data.username) {
    const users = await getUsers()
    if (users.find(u => u.username === data.username && u.id !== id)) throw new Error('Username already exists')
  }
  await update(ref(db, `portal_users/${id}`), data)
  const snap = await get(ref(db, `portal_users/${id}`))
  if (!snap.exists()) return null
  return { id, ...snap.val() } as PortalUser
}

export async function deleteUser(id: string): Promise<boolean> {
  await remove(ref(db, `portal_users/${id}`))
  return true
}
