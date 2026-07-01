import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GAS URL - update NEXT_PUBLIC_GAS_WRITE_URL in env after redeploying GAS with doPost support
const GAS_URL = process.env.NEXT_PUBLIC_GAS_WRITE_URL
  || 'https://script.google.com/macros/s/AKfycbzvGOlmdmiQkcXwp05RIrhtTAhw4lwPf3hO0u7ygjBerEwo0JGVLv22a0XLxX1Dsx4/exec'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Server-side POST to GAS — no CORS restriction, can read the response
    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'follow',
    })

    let result: unknown = {}
    const text = await gasRes.text()
    try { result = JSON.parse(text) } catch { result = { raw: text } }

    return NextResponse.json({ ok: true, gas: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
