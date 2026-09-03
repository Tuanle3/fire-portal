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

// Chấp nhận cả "Tháng 12/2025" và "12/2025" trơn (header thật trong sheet không có chữ "Tháng")
const MONTH_RE = /^(Th[aá]ng\s*)?\d{1,2}\/\d{4}$/

function periodFromHeader(cell: string): string {
  const m = /(\d{1,2})\/(\d{4})/.exec(cell)
  return m ? `${m[2]}-${m[1].padStart(2, '0')}` : ''
}

interface MonthCol { period: string; valueCol: number; noCol?: number; coCol?: number }
interface HeaderInfo { headerRow: number; labelRow: number; dataStart: number; monthCols: MonthCol[] }

// Dò dòng header (chứa cell "MM/YYYY" hoặc "Tháng MM/YYYY") và xác định layout 1 cột/tháng hay 2 cột (Nợ/Có)/tháng.
// Sheet Data_AR/Data_AP có 2 dòng header xếp chồng: dòng "Tháng MM/YYYY" (gộp ô) rồi tới dòng tên
// cột cố định (Đơn vị/Code/Mã KH.../TK Công nợ) + nhãn phụ mỗi tháng — nhãn phụ không phải "Nợ"/"Có"
// trơn mà ghép cả kỳ ("12/2025 - Nợ") nên so khớp tuyệt đối cũ luôn ra false → coi nhầm là layout 1
// cột, đẩy dataStart lệch 1 dòng (ăn luôn dòng tên cột làm dòng dữ liệu ảo) và Nợ/Có luôn đọc ra 0.
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
    return a.endsWith('nợ') && b.endsWith('có')
  })

  const monthCols: MonthCol[] = isTwoCol
    ? starts.map(s => ({ period: s.period, valueCol: s.col, noCol: s.col, coCol: s.col + 1 }))
    : starts.map(s => ({ period: s.period, valueCol: s.col }))

  // Tên cột cố định (Đơn vị/Code/Mã.../TK Công nợ) nằm cùng dòng với nhãn phụ Nợ/Có khi có 2 dòng
  // header — dòng "Tháng..." phía trên luôn để trống các cột này.
  const labelRow = isTwoCol ? headerRow + 1 : headerRow
  return { headerRow, labelRow, dataStart: headerRow + (isTwoCol ? 2 : 1), monthCols }
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
  const header = sheet[h.labelRow]
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
  const header = sheet[h.labelRow]
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
  const header = sheet[h.labelRow]
  const colCode        = findCol(header, n => n === 'code')
  // Sheet thực tế ghi tắt "Số TK" thay vì "Số Tài Khoản" đầy đủ — khớp cả 2 dạng
  const colSoTaiKhoan  = findCol(header, n => n === 'sotaikhoan' || n === 'sotk')
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
  const header = sheet[h.labelRow]
  // "Mã KH"/"Tên KH" (AR) và "Mã NCC"/"Tên NCC" (AP) đều viết tắt trong Sheet thật, không phải
  // "khách hàng"/"nhà cung cấp" đầy đủ — so khớp cả dạng rút gọn "kh"/"ncc".
  const colCode        = findCol(header, n => n === 'code')
  const colMaDoiTuong  = findCol(header, n => n.startsWith('ma') && (n.includes('kh') || n.includes('cungcap') || n.includes('ncc')))
  const colTenDoiTuong = findCol(header, n => n.startsWith('ten') && (n.includes('kh') || n.includes('cungcap') || n.includes('ncc')))
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

// Nhận diện tên tab theo 2 kiểu:
// - Kiểu mới: năm đứng TRƯỚC, vd "2026_TB", "2025_PL" (quy ước hiện tại trong Sheet BCTC_SAG)
// - Kiểu cũ: "Data_TB", hoặc có hậu tố năm ở CUỐI như "Data_PL_2025" — giữ để tương thích ngược.
// Period thật của từng dòng dữ liệu vẫn lấy từ header "MM/YYYY" trong sheet như cũ, không phụ
// thuộc vào năm đọc được từ tên tab — tên tab chỉ dùng để chọn đúng hàm parse theo loại báo cáo.
export function parseTab(tab: string, values: Sheet): BctcPeriodDoc[] {
  const newStyle = /^(\d{4})_(PL|BS|TB|AR|AP)$/.exec(tab)
  const base = newStyle ? `Data_${newStyle[2]}` : tab.replace(/_\d{4}$/, '')
  switch (base) {
    case 'Data_PL': return parsePL(values)
    case 'Data_BS': return parseBS(values)
    case 'Data_TB': return parseTB(values)
    case 'Data_AR': return parseArAp(values, 'AR')
    case 'Data_AP': return parseArAp(values, 'AP')
    default: return []
  }
}