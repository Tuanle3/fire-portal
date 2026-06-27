import { NextRequest, NextResponse } from 'next/server'
import { getUsers, createUser } from '@/lib/users'
import { syncStaffUser } from '@/lib/staff-sync'

export const dynamic = 'force-dynamic'

async function getSession(req: NextRequest) {
  const cookie = req.cookies.get('fire_session')
  if (!cookie) return null
  try { return JSON.parse(cookie.value) } catch { return null }
}

export async function GET(req: NextRequest) {
  try {
    const sess = await getSession(req)
    if (!sess) return NextResponse.json([], { status: 401 })
    const users = await getUsers()
    const safe = users.map(({ hash: _, ...u }) => u)
    return NextResponse.json(safe)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sess = await getSession(req)
    if (!sess || !['ceo', 'admin'].includes(sess.role))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const body = await req.json()
    const { username, password, full_name, role, tabs, department, level, position } = body
    if (!username || !password || !full_name || !role)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    const hash = await hashPassword(password)
    const user = await createUser({
      username, hash, full_name, role, active: true, tabs: tabs ?? null,
      department: department ?? null, level: level ?? null, position: position ?? null,
    })
    const { hash: _, ...safe } = user

    // sync to Firestore staff_users for task RBAC
    if (department || level) {
      await syncStaffUser(safe.id, { name: full_name, email: username, department, level, position }).catch(console.error)
    }

    return NextResponse.json(safe)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: msg === 'Username already exists' ? 409 : 500 })
  }
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}
