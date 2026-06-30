import { NextRequest, NextResponse } from 'next/server'
import { updateUser, deleteUser, getUsers } from '@/lib/users'
import { syncStaffUser, removeStaffUser } from '@/lib/staff-sync'

export const dynamic = 'force-dynamic'

async function getSession(req: NextRequest) {
  const cookie = req.cookies.get('fire_session')
  if (!cookie) return null
  try {
    const sess = JSON.parse(cookie.value)
    // Always fetch current role from DB to avoid stale cookie
    const users = await getUsers()
    const dbUser = users.find(u => String(u.id) === String(sess.id))
      ?? users.find(u => u.username === sess.username)
    if (!dbUser) return null
    return { ...sess, role: dbUser.role, id: dbUser.id }
  } catch { return null }
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sess = await getSession(req)
    if (!sess || !['ceo', 'admin'].includes(sess.role))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { password, ...rest } = body

    const updateData: Record<string, unknown> = { ...rest }
    if (password) updateData.hash = await hashPassword(password)

    const user = await updateUser(id, updateData)
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const { hash: _, ...safe } = user

    // sync to Firestore staff_users
    if (body.department !== undefined || body.level !== undefined || body.full_name !== undefined) {
      await syncStaffUser(id, {
        name:       safe.full_name,
        email:      safe.username,
        department: safe.department ?? null,
        level:      safe.level      ?? null,
        position:   safe.position   ?? null,
      }).catch(console.error)
    }

    return NextResponse.json(safe)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sess = await getSession(req)
    if (!sess || !['ceo', 'admin'].includes(sess.role))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { id } = await params
    if (sess.id === id)
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })

    await deleteUser(id)
    await removeStaffUser(id).catch(console.error)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
