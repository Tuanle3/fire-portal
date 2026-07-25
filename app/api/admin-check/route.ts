import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

// CHẨN ĐOÁN TẠM — không trả về giá trị bí mật, chỉ trả metadata.
// Xóa file này sau khi sửa xong.
export async function GET() {
  const pk = process.env.FIREBASE_PRIVATE_KEY ?? ''
  const env = {
    has_FIREBASE_PROJECT_ID:   !!process.env.FIREBASE_PROJECT_ID,
    has_FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    has_FIREBASE_PRIVATE_KEY:  !!pk,
    projectId_value:           process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    clientEmail_domain:        (process.env.FIREBASE_CLIENT_EMAIL ?? '').split('@')[1] ?? null,
    privateKey_len:            pk.length,
    privateKey_startsOk:       pk.trim().replace(/^["']/, '').startsWith('-----BEGIN'),
    databaseURL:               process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? null,
  }

  let adminInit = 'ok'
  let readOk: boolean | string = false
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin')
    const db = getAdminDb()
    // Đặt giới hạn 5s để không treo hàm nếu key sai project (không kết nối được DB)
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_5s: không kết nối được database — key sai project hoặc thiếu quyền')), 5000))
    const snap: any = await Promise.race([db.ref('portal_users').get(), timeout])
    readOk = snap.exists() ? `OK - đọc được ${snap.numChildren()} user` : 'kết nối OK nhưng portal_users rỗng'
  } catch (e: any) {
    adminInit = `ERROR: ${e?.message || String(e)}`
  }

  return NextResponse.json({ env, adminInit, readOk })
}
