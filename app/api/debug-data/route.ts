import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const snap = await getAdminDb().ref('data_quy').get()
  if (!snap.exists()) return NextResponse.json({ error: 'no data' })

  const val = snap.val()
  const keys = Object.keys(val)
  const sample = keys.slice(0, 5).map(k => val[k])

  // Count records with each field
  const fieldCount: Record<string, number> = {}
  keys.forEach(k => {
    const row = val[k]
    if (typeof row === 'object' && row !== null) {
      Object.keys(row).forEach(f => {
        fieldCount[f] = (fieldCount[f] ?? 0) + 1
      })
    }
  })

  return NextResponse.json({
    total: keys.length,
    fieldCount,
    sample,
  }, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
