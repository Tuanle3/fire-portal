import { NextRequest, NextResponse } from 'next/server'
import { getUsers, updateUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get('fire_session')
    if (!cookie) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    const session = JSON.parse(cookie.value)

    const { oldHash, newHash } = await req.json()
    if (!oldHash || !newHash) return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })

    const users = await getUsers()
    const dbUser = users.find(u => String(u.id) === String(session.id))
      ?? users.find(u => u.username === session.username)
    if (!dbUser) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 })
    if (dbUser.hash !== oldHash) return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 401 })

    await updateUser(dbUser.id, { hash: newHash })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
