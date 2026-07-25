import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// CHẨN ĐOÁN TẠM — không trả về giá trị bí mật, chỉ trả metadata.
// Xóa file này sau khi sửa xong.
export async function GET() {
  const pk = process.env.FIREBASE_PRIVATE_KEY ?? ''
  const env = {
    has_FIREBASE_PROJECT_ID:   !!process.env.FIREBASE_PROJECT_ID,
    has_FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    has_FIREBASE_PRIVATE_KEY:  !!pk,
    projectId_value:           process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    clientEmail_endsWith:      (process.env.FIREBASE_CLIENT_EMAIL ?? '').slice(-30),
    privateKey_len:            pk.length,
    privateKey_startsOk:       pk.trimStart().startsWith('-----BEGIN'),
    privateKey_hasLiteralBackslashN: pk.includes('\\n'),
    privateKey_hasRealNewline: pk.includes('\n'),
    databaseURL:               process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? null,
  }

  let adminInit = 'ok'
  let readOk: boolean | string = false
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin')
    const snap = await getAdminDb().ref('portal_users').get()
    readOk = snap.exists() ? `exists (${snap.numChildren()} users)` : 'empty'
  } catch (e: any) {
    adminInit = `ERROR: ${e?.message || String(e)}`
  }

  return NextResponse.json({ env, adminInit, readOk })
}
