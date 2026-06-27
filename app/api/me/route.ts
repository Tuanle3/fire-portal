import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('fire_session')
  if (!cookie) return NextResponse.json(null, { status: 401, headers: NO_STORE })
  try {
    const session = JSON.parse(cookie.value)
    const { getUsers } = await import('@/lib/users')
    const users = await getUsers()
    const dbUser = users.find(u => String(u.id) === String(session.id))
      ?? users.find(u => u.username === session.username)
    return NextResponse.json({
      username:  session.username ?? '',
      role:      dbUser?.role ?? session.role ?? '',
      full_name: session.full_name ?? '',
      tabs:      dbUser?.tabs ?? null,
    }, { headers: NO_STORE })
  } catch {
    return NextResponse.json(null, { status: 401, headers: NO_STORE })
  }
}
