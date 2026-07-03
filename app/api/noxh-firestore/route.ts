import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED_PREFIXES = ['NOXH_NT_']

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('fire_session')
  if (!cookie) return NextResponse.json({ data: null, error: 'unauthorized' }, { status: 401 })

  const table = req.nextUrl.searchParams.get('table') ?? ''
  const isAllowed = /^[A-Za-z0-9_]+$/.test(table) && ALLOWED_PREFIXES.some(pfx => table.startsWith(pfx))
  if (!isAllowed) return NextResponse.json({ data: null, error: 'invalid table' }, { status: 400 })

  try {
    const { noxhFirestore } = await import('@/lib/firebase-admin-noxh')
    const snap = await noxhFirestore().collection(table).get()
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ data, error: null })
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e?.message ?? String(e) }, { status: 500 })
  }
}
