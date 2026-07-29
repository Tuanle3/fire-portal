import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { parseTab } from '@/lib/bctc-parse'

export const dynamic = 'force-dynamic'

// Nhận dữ liệu thô từ Apps Script gắn trong Google Sheet BCTC (xem nút "🔄 Đồng bộ Firebase"
// trong Sheet). Bảo vệ bằng TAICHINH_SYNC_SECRET giống pattern SEED_SECRET ở app/api/seed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { secret?: string; tab?: string; values?: unknown[][] } | null
  if (!body) return NextResponse.json({ error: 'Body JSON không hợp lệ' }, { status: 400 })

  const secret = process.env.TAICHINH_SYNC_SECRET
  if (secret && body.secret !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tab, values } = body
  if (!tab || !Array.isArray(values)) {
    return NextResponse.json({ error: 'Thiếu tab hoặc values' }, { status: 400 })
  }

  const docs = parseTab(tab, values as (string | number | boolean | null)[][])
  if (docs.length === 0) {
    return NextResponse.json({ ok: true, tab, wrote: 0, note: 'Không tìm được dòng dữ liệu hợp lệ trong tab này' })
  }

  const updates: Record<string, unknown> = {}
  for (const d of docs) {
    updates[`data_bctc/${d.donViKey}/${d.report}/${d.period}`] = {
      donVi: d.donVi,
      report: d.report,
      period: d.period,
      rows: d.rows,
      updatedAt: new Date().toISOString(),
      source: 'sheet-sync',
    }
  }

  await getAdminDb().ref().update(updates)

  return NextResponse.json({ ok: true, tab, wrote: Object.keys(updates).length })
}
