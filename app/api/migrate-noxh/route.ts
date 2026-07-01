import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SHEET_ID = '15shx_icL1B07iVP-Ho7U8Ixu3fyotMTynKhkevmFk7I'

function parseVND(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(/,/g, '.')) || 0
}

function parseDate(s: string): string {
  // dd/MM/yyyy → yyyy-MM-dd
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return s
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
}

async function fetchCSV(sheetParam?: string): Promise<string[][]> {
  const url = sheetParam
    ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetParam)}`
    : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`
  const res = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  return text.trim().split('\n').map(line => {
    // Parse CSV line respecting quotes
    const cols: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else cur += c
    }
    cols.push(cur.trim())
    return cols
  })
}

export async function GET() {
  try {
    const [thuRows, chiRows] = await Promise.all([
      fetchCSV(),       // first sheet = Thu
      fetchCSV('Chi'),  // Chi sheet
    ])

    const result: any[] = []

    // Thu sheet: row 0 = total, row 1 = headers, row 2+ = data
    // Cols: [Đơn vị, Date, Nội dung, Amount, Mã CT, Ghi chú, Link]
    for (const row of thuRows.slice(2)) {
      if (!row[0] || row[0] === 'Đơn vị') continue
      const amt = parseVND(row[3] ?? '')
      if (!amt) continue
      result.push({
        loai:        'Thu',
        don_vi:      row[0] ?? '',
        ngay:        parseDate(row[1] ?? ''),
        mo_ta:       row[2] ?? '',
        so_tien:     amt,
        chung_tu_so: row[4] ?? '',
        ghi_chu:     row[5] ?? '',
        link_file:   row[6] ?? '',
        nhom:        row[5]?.includes('Vốn CSH') ? 'Vốn góp' : 'Thu khác',
        trang_thai:  'da_xac_nhan',
      })
    }

    // Chi sheet: same structure
    for (const row of chiRows.slice(2)) {
      if (!row[0] || row[0] === 'Đơn vị') continue
      const amt = parseVND(row[3] ?? '')
      if (!amt) continue
      result.push({
        loai:        'Chi',
        don_vi:      row[0] ?? '',
        ngay:        parseDate(row[1] ?? ''),
        mo_ta:       row[2] ?? '',
        so_tien:     amt,
        chung_tu_so: row[4] ?? '',
        ghi_chu:     row[5] ?? '',
        link_file:   row[6] ?? '',
        nhom:        classifyExpense(row[2] ?? ''),
        trang_thai:  'da_thanh_toan',
      })
    }

    return NextResponse.json({ ok: true, count: result.length, rows: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

function classifyExpense(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('vốn') || d.includes('ký quỹ') || d.includes('bảo lãnh')) return 'Chi góp vốn'
  if (d.includes('tư vấn') || d.includes('thiết kế') || d.includes('đtxd') || d.includes('ksđc')) return 'Chi nhà thầu'
  if (d.includes('ncc') || d.includes('nhà cung cấp')) return 'Chi trả NCC'
  if (d.includes('quảng cáo') || d.includes('truyền thông') || d.includes('sự kiện') || d.includes('marketing')) return 'Chi hoạt động'
  if (d.includes('thuế') || d.includes('lệ phí') || d.includes('đo đạc') || d.includes('văn phòng đăng ký')) return 'Chi hoạt động'
  return 'Chi khác'
}
