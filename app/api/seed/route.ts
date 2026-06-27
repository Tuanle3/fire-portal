import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { ref, get, set } from 'firebase/database'

export const dynamic = 'force-dynamic'

// SHA-256 helper (Node.js)
async function sha256(msg: string) {
  const { createHash } = await import('crypto')
  return createHash('sha256').update(msg).digest('hex')
}

export async function GET(req: NextRequest) {
  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const password = req.nextUrl.searchParams.get('password') ?? 'Admin@123'

  // Kiểm tra user hiện có — chỉ block nếu không có ?force=true
  const snap = await get(ref(db, 'portal_users'))
  if (snap.exists() && !force) {
    return NextResponse.json({
      error: 'Đã có user. Dùng ?force=true để reset.',
      hint:  'localhost:3000/api/seed?force=true',
    }, { status: 403 })
  }

  // Xoá toàn bộ portal_users cũ rồi tạo lại
  const hash = await sha256(password)
  const id   = Date.now().toString()

  await set(ref(db, 'portal_users'), {
    [id]: {
      username:   'admin',
      hash,
      role:       'ceo',
      full_name:  'Admin',
      active:     true,
      created_at: new Date().toISOString(),
    },
  })

  return NextResponse.json({
    ok: true,
    message: `Tạo thành công! Đăng nhập: admin / ${password}`,
    username: 'admin',
    password,
    reset: force,
  })
}
