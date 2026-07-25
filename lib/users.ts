import { getAdminDb } from './firebase-admin'

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

// portal_users chỉ truy cập qua Admin SDK (server) — client bị security rules chặn hoàn toàn.
export async function getUsers(): Promise<PortalUser[]> {
  const snap = await getAdminDb().ref('portal_users').get()
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
  const db = getAdminDb()
  const users = await getUsers()
  if (users.find(u => u.username === data.username)) throw new Error('Username already exists')
  const id = Date.now().toString()
  const user: PortalUser = { ...data, id, created_at: new Date().toISOString() }
  await db.ref(`portal_users/${id}`).set({ ...data, created_at: user.created_at })
  return user
}

export async function updateUser(id: string, data: Partial<Omit<PortalUser, 'id' | 'created_at'>>): Promise<PortalUser | null> {
  const db = getAdminDb()
  if (data.username) {
    const users = await getUsers()
    if (users.find(u => u.username === data.username && u.id !== id)) throw new Error('Username already exists')
  }
  await db.ref(`portal_users/${id}`).update(data)
  const snap = await db.ref(`portal_users/${id}`).get()
  if (!snap.exists()) return null
  return { id, ...snap.val() } as PortalUser
}

export async function deleteUser(id: string): Promise<boolean> {
  await getAdminDb().ref(`portal_users/${id}`).remove()
  return true
}
