import { NextRequest, NextResponse } from 'next/server'
import { getUserByCredentials } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { username, hash } = await req.json()
    const user = await getUserByCredentials(username, hash)
    if (!user) {
      return NextResponse.json({ error: 'Tài khoản hoặc mật khẩu không đúng' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true })
    res.cookies.set('fire_session', JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
    }), {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
