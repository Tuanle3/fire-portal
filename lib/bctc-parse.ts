import { BctcArApRow, BctcBsRow, BctcPeriodDoc, BctcPlRow, BctcReport, BctcRow, BctcTbRow } from './bctc-types'

type Cell = string | number | boolean | null
type Sheet = Cell[][]

// "SA.ĐT" → "SA_DT" — RTDB key không cho phép . $ # [ ] /
const DIACRITICS_RE = /[̀-ͯ]/g

export function slugifyDonVi(s: string): string {
  const noDiacritics = s
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/Đ/g, 'D').replace(/đ/g, 'd')
  return noDiacritics.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normHeader(s: Cell): string {
  return String(s ?? '')
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/Đ/g, 'D').replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findCol(headerRow: Cell[], pred: (norm: string) => boolean): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (pred(normHeader(headerRow[i]))) return i
  }
  return -1
}

const MONTH_RE = /^Th[aá]ng\s*\d{1,2}\/\d{4}$/

function periodFromHeader(cell: string): string {
  const m = /(\d{1,2})\/(\d{4})/.exec(cell)
  return m ? `${m[2]}-${m[1].padStart(2, '0')}` : ''
}

interface MonthCol { period: string; valueCol: number; noCol?: number; coCol?: number }
interface HeaderInfo { headerRow: number; dataStart: number; monthCols: MonthCol[] }

// Dò dòng header (chứa cell "Tháng MM/YYYY") và xác định layout 1 cột/tháng hay 2 cột (Nợ/Có)/tháng.
function detectHeader(sheet: Sheet): HeaderInfo | null {
  let headerRow = -1
  for (let r = 0; r < Math.min(sheet.length, 8); r++) {
    if ((sheet[r] ?? []).some(c => typeof c === 'string' && MONTH_RE.test(c.trim()))) { headerRow = r; break }
  }
  if (headerRow === -1) return null

  const row = sheet[headerRow]
  const starts: { col: number; period: string }[] = []
  row.forEach((c, col) => {
    if (typeof c === 'string' && MONTH_RE.test(c.trim())) starts.push({ col, period: periodFromHeader(c.trim()) })
  })
  if (starts.length === 0) return null

  const subRow = sheet[headerRow + 1] ?? []
  const isTwoCol = starts.some(s => {
    const a = String(subRow[s.col] ?? '').trim().toLowerCase()
    const b = String(subRow[s.col + 1] ?? '').trim().toLowerCase()
    return a === 'nợ' && b === 'có'
  })

  const monthCols: MonthCol[] = isTwoCol
    ? starts.map(s => ({ period: s.period, valueCol: s.col, noCol: s.col, coCol: s.col + 1 }))
    : starts.map(s => ({ period: s.period, valueCol: s.col }))

  return { headerRow, dataStart: headerRow + (isTwoCol ? 2 : 1), monthCols }
}

function num(v: Cell): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
}

// Dòng hợp lệ ⟺ cột A (Đơn vị) không rỗng — loại bỏ dòng tiêu đề block và dòng tổng ("Số dòng = ...")
function validRows(sheet: Sheet, dataStart: number): { rowIdx: number; donVi: string }[] {
  const out: { rowIdx: number; donVi: string }[] = []
  for (let r = dataStart; r < sheet.length; r++) {
    const donVi = String(sheet[r]?.[0] ?? '').trim()
    if (donVi) out.push({ rowIdx: r, donVi })
  }
  return out
}

function groupDocs(report: BctcReport, entries: { donVi: string; period: string; row: BctcRow }[]): BctcPeriodDoc[] {
  const map = new Map<string, BctcPeriodDoc>()
  for (const e of entries) {
    const donViKey = slugifyDonVi(e.donVi)
    const key = `${donViKey}__${e.period}`
    if (!map.has(key)) map.set(key, { donViKey, donVi: e.donVi, report, period: e.period, rows: [] })
    map.get(key)!.rows.push(e.row)
  }
  return [...map.values()]
}

function parsePL(sheet: Sheet): BctcPeriodDoc[] {
  const h = detectHeader(sheet)
  if (!h) return []
  const header = sheet[h.headerRow]
  const colCode   = findCol(header, n => n === 'code')
  const colChiTieu = findCol(header, n => n === 'sotaikhoan')
  const colMaSo   = findCol(header, n => n === 'maso')
  const colTMinh  = findCol(header, n => n.startsWith('tmi'))

  const entries: { donVi: string; period: string; row: BctcPlRow }[] = []
  for (const { rowIdx, donVi } of validRows(sheet, h.dataStart)) {
    const row = sheet[rowIdx]
    for (const mc of h.monthCols) {
      entries.push({
        donVi, period: mc.period,
        row: {
          code: colCode >= 0 ? String(row[colCode] ?? '').trim() : '',
          maSo: colMaSo >= 0 ? String(row[colMaSo] ?? '').trim() : '',
          chiTieu: colChiTieu >= 0 ? String(row[colChiTieu] ?? '').trim() : '',
          tMinh: colTMinh >= 0 ? String(row[colTMinh] ?? '').trim() : '',
          value: num(row[mc.valueCol]),
        },
      })
    }
  }
  return groupDocs('PL', entries)
}

function parseBS(sheet: Sheet): BctcPeriodDoc[] {
  const h = detectHeader(sheet)
  if (!h) return []
  const header = sheet[h.headerRow]
  const colCode    = findCol(header, n => n === 'code')
  const colChiTieu = findCol(header, n => n === 'chitieu')
  const colMaSo    = findCol(header, n => n.startsWith('ma') && !n.includes('khach') && !n.includes('cungcap') && !n.includes('ncc'))
  const colTMinh   = findCol(header, n => n.startsWith('tmi'))

  const entries: { donVi: string; period: string; row: BctcBsRow }[] = []
  for (const { rowIdx, donVi } of validRows(sheet, h.dataStart)) {
    const row = sheet[rowIdx]
    for (const mc of h.monthCols) {
      entries.push({
        donVi, period: mc.period,
        row: {
          code: colCode >= 0 ? String(row[colCode] ?? '').trim() : '',
          maSo: colMaSo >= 0 ? String(row[colMaSo] ?? '').trim() : '',
          chiTieu: colChiTieu >= 0 ? String(row[colChiTieu] ?? '').trim() : '',
          tMinh: colTMinh >= 0 ? String(row[colTMinh] ?? '').trim() : '',
          value: num(row[mc.valueCol]),
        },
      })
    }
  }
  return groupDocs('BS', entries)
}

function parseTB(sheet: Sheet): BctcPeriodDoc[] {
  const h = detectHeader(sheet)
  if (!h) return []
  const header = sheet[h.headerRow]
  const colCode        = findCol(header, n => n === 'code')
  const colSoTaiKhoan  = findCol(header, n => n === 'sotaikhoan')
  const colCap         = findCol(header, n => n === 'cap')
  const colTenTaiKhoan = findCol(header, n => n === 'tentaikhoan')

  const entries: { donVi: string; period: string; row: BctcTbRow }[] = []
  for (const { rowIdx, donVi } of validRows(sheet, h.dataStart)) {
    const row = sheet[rowIdx]
    for (const mc of h.monthCols) {
      entries.push({
        donVi, period: mc.period,
        row: {
          code: colCode >= 0 ? String(row[colCode] ?? '').trim() : '',
          soTaiKhoan: colSoTaiKhoan >= 0 ? String(row[colSoTaiKhoan] ?? '').trim() : '',
          cap: colCap >= 0 ? String(row[colCap] ?? '').trim() : '',
          tenTaiKhoan: colTenTaiKhoan >= 0 ? String(row[colTenTaiKhoan] ?? '').trim() : '',
          value: num(row[mc.valueCol]),
        },
      })
    }
  }
  return groupDocs('TB', entries)
}

function parseArAp(sheet: Sheet, report: 'AR' | 'AP'): BctcPeriodDoc[] {
  const h = detectHeader(sheet)
  if (!h) return []
  const header = sheet[h.headerRow]
  const colCode        = findCol(header, n => n === 'code')
  const colMaDoiTuong  = findCol(header, n => n.startsWith('ma') && (n.includes('khach') || n.includes('cungcap') || n.includes('ncc')))
  const colTenDoiTuong = findCol(header, n => n.startsWith('ten') && (n.includes('khach') || n.includes('cungcap') || n.includes('ncc')))
  const colTkCongNo    = findCol(header, n => n.includes('congno'))

  const entries: { donVi: string; period: string; row: BctcArApRow }[] = []
  for (const { rowIdx, donVi } of validRows(sheet, h.dataStart)) {
    const row = sheet[rowIdx]
    for (const mc of h.monthCols) {
      entries.push({
        donVi, period: mc.period,
        row: {
          code: colCode >= 0 ? String(row[colCode] ?? '').trim() : '',
          maDoiTuong: colMaDoiTuong >= 0 ? String(row[colMaDoiTuong] ?? '').trim() : '',
          tenDoiTuong: colTenDoiTuong >= 0 ? String(row[colTenDoiTuong] ?? '').trim() : '',
          tkCongNo: colTkCongNo >= 0 ? String(row[colTkCongNo] ?? '').trim() : '',
          no: mc.noCol !== undefined ? num(row[mc.noCol]) : 0,
          co: mc.coCol !== undefined ? num(row[mc.coCol]) : 0,
        },
      })
    }
  }
  return groupDocs(report, entries)
}

export function parseTab(tab: string, values: Sheet): BctcPeriodDoc[] {
  switch (tab) {
    case 'Data_PL': return parsePL(values)
    case 'Data_BS': return parseBS(values)
    case 'Data_TB': return parseTB(values)
    case 'Data_AR': return parseArAp(values, 'AR')
    case 'Data_AP': return parseArAp(values, 'AP')
    default: return []
  }
}
