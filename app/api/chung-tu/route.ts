import { NextRequest, NextResponse } from 'next/server'
import { writeToGAS } from '@/lib/gasClient'
import { fetchChungTu } from '@/lib/sheets-chung-tu'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sheetId = searchParams.get('sheetId')
  if (!sheetId) return NextResponse.json({ error: 'missing sheetId' }, { status: 400 })
  try {
    const { thu, chi } = await fetchChungTu(sheetId)
    return NextResponse.json({ thu, chi })
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
