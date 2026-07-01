import { NextRequest, NextResponse } from 'next/server'
import { fetchSheetCSV, parseCSV, writeToGAS } from '@/lib/gasClient'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sheet = searchParams.get('sheet') ?? 'Chung_Tu'
  try {
    const csv  = await fetchSheetCSV(sheet)
    const rows = parseCSV(csv)
    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await writeToGAS(body)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
