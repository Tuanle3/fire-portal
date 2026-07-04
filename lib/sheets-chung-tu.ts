// Fetch & parse chứng từ từ Google Sheets public CSV
// Sheet phải được share "Anyone with the link – Viewer"

export interface ChungTuRow {
  donVi:     string
  ngay:      string
  noiDung:   string
  soTien:    number
  maChungTu: string
  ghiChu:    string
  drive:     string
}

// Parse một ô CSV (bỏ dấu nháy ngoài, unescape nháy đôi)
function parseCell(raw: string): string {
  const s = raw.trim()
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"')
  }
  return s
}

// Tách dòng CSV có xử lý nháy kép
function parseLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      cells.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}

function parseSoTien(raw: string): number {
  // Xử lý định dạng số Việt Nam: 5.077.750.000 hoặc 5,077,750,000
  const cleaned = raw.replace(/[^0-9]/g, '')
  return cleaned ? parseInt(cleaned, 10) : 0
}

function csvUrl(sheetId: string, sheetName: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
}

async function fetchSheet(sheetId: string, sheetName: string): Promise<ChungTuRow[]> {
  const res = await fetch(csvUrl(sheetId, sheetName), {
    next: { revalidate: 300 }, // ISR: refresh mỗi 5 phút trên Vercel
  })
  if (!res.ok) return []

  const text = await res.text()
  const lines = text.split('\n').filter(l => l.trim())

  // Tìm dòng header (chứa "Đơn vị" hoặc "Don vi")
  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes('đơn vị') ||
    l.toLowerCase().includes('don vi') ||
    l.toLowerCase().includes('noi dung') ||
    l.toLowerCase().includes('nội dung')
  )
  if (headerIdx < 0) return []

  const rows: ChungTuRow[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseLine(lines[i])
    const donVi = parseCell(cells[0] ?? '')
    if (!donVi) continue // bỏ dòng trống

    rows.push({
      donVi,
      ngay:      parseCell(cells[1] ?? ''),
      noiDung:   parseCell(cells[2] ?? ''),
      soTien:    parseSoTien(parseCell(cells[3] ?? '')),
      maChungTu: parseCell(cells[4] ?? ''),
      ghiChu:    parseCell(cells[5] ?? ''),
      drive:     parseCell(cells[6] ?? ''),
    })
  }
  return rows
}

export async function fetchChungTu(sheetId: string) {
  const [thu, chi] = await Promise.all([
    fetchSheet(sheetId, 'Thu'),
    fetchSheet(sheetId, 'Chi'),
  ])
  return { thu, chi }
}
