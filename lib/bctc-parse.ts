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

// Cột "Loại BC" (Nội bộ / Ngân hàng...) — CHỈ nhận khi header ghi đúng "Loại BC". Không fallback
// đoán vị trí cột, vì các tab cũ (VD sheet 2025) chưa từng có cột này — đoán bừa sẽ vơ nhầm cột
// khác (VD "Chỉ tiêu") khiến mọi dòng có loaiBC riêng biệt, không khớp filter, làm mất trắng dữ
// liệu của cả năm đó. Không tìm thấy → trả về -1 → mỗi row có loaiBC: '' → luôn hiển thị bất kể
// đang lọc loại nào (xem filterDocsByLoaiBC).
function findLoaiBCCol(headerRow: Cell[]): number {
  return findCol(headerRow, n => n === 'loaibc')
}

// FIX: Chấp nhận 3 dạng header:
//   1. "Tháng 12/2025" hoặc "12/2025"  — có năm đầy đủ
//   2. "Tháng 1" ... "Tháng 12"        — chỉ có số tháng, không có năm (dùng fallbackYear từ tên tab)
const MONTH_RE = /^(Th[aá]ng\s*)?(\d{1,2})(\/\d{4})?$/

// FIX: Thêm fallbackYear để xử lý dạng "Tháng 1" không có năm
function periodFromHeader(cell: string, fallbackYear?: string): string {
  // Dạng có năm: "12/2025" hoặc "Tháng 12/2025"
  const withYear = /(\d{1,2})\/(\d{4})/.exec(cell)
  if (withYear) return `${withYear[2]}-${withYear[1].padStart(2, '0')}`

  // Dạng không có năm: "Tháng 1" ... "Tháng 12" — dùng năm từ tên tab
  const monthOnly = /^(?:Th[aá]ng\s*)?(\d{1,2})$/.exec(cell.trim())
  if (monthOnly && fallbackYear) return `${fallbackYear}-${monthOnly[1].padStart(2, '0')}`

  return ''
}

interface MonthCol { period: string; valueCol: number; noCol?: number; coCol?: number }
interface HeaderInfo { headerRow: number; labelRow: number; dataStart: number; monthCols: MonthCol[] }

// FIX: Thêm tham số fallbackYear để truyền xuống periodFromHeader
// Kiểm tra một cell có phải header tháng không (string "Tháng 1" hoặc number 1..12)
function isMonthCell(c: Cell): boolean {
  if (typeof c === 'string') return MONTH_RE.test(c.trim())
  if (typeof c === 'number') return Number.isInteger(c) && c >= 1 && c <= 12
  return false
}

// Chuyển cell header tháng → chuỗi để periodFromHeader xử lý
function monthCellToStr(c: Cell): string {
  if (typeof c === 'number') return String(c)
  return String(c ?? '').trim()
}

function detectHeader(sheet: Sheet, fallbackYear?: string): HeaderInfo | null {
  let headerRow = -1
  for (let r = 0; r < Math.min(sheet.length, 8); r++) {
    if ((sheet[r] ?? []).some(c => isMonthCell(c))) { headerRow = r; break }
  }
  if (headerRow === -1) return null

  const row = sheet[headerRow]
  const starts: { col: number; period: string }[] = []
  row.forEach((c, col) => {
    if (isMonthCell(c)) {
      const period = periodFromHeader(monthCellToStr(c), fallbackYear)
      if (period) starts.push({ col, period })
    }
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

  const labelRow = isTwoCol ? headerRow + 1 : headerRow
  return { headerRow, labelRow, dataStart: headerRow + (isTwoCol ? 2 : 1), monthCols }
}

function num(v: Cell): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
}

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

// FIX: Tất cả hàm parse nhận thêm tham số year? và truyền vào detectHeader
function parsePL(sheet: Sheet, year?: string): BctcPeriodDoc[] {
  const h = detectHeader(sheet, year)
  if (!h) return []
  const header = sheet[h.labelRow]
  // FIX: Sheet Data_PL thật không có cột tên "Code" riêng — cột "TM" dùng chung cho cả số hiệu
  // thuyết minh của dòng chính (VD "VI.1", "VI.2") lẫn code breakdown của các dòng thuyết minh chi
  // tiết bên dưới (VD "TM_DT_SP", "TM_GV_SP") — đây chính là cột breakdownByCode()/codeMatches()
  // cần đọc. Trước đây tìm đúng chữ "code" nên luôn ra -1, khiến toàn bộ khối thuyết minh (doanh
  // thu/giá vốn/lãi gộp theo sản phẩm, cấu trúc chi phí...) bị mất trắng khỏi báo cáo.
  const colCode    = findCol(header, n => n === 'code' || n === 'tm')
  // FIX: cột nhãn chỉ tiêu tên thật là "Chỉ tiêu" (chitieu) — trước đây tìm nhầm "sotaikhoan" (copy
  // sót từ parseTB) nên mọi dòng PL luôn có chiTieu rỗng, làm hỏng luôn việc gộp theo tên sản phẩm.
  const colChiTieu = findCol(header, n => n === 'chitieu')
  const colMaSo    = findCol(header, n => n === 'maso')
  const colTMinh   = findCol(header, n => n.startsWith('tmi'))
  const colLoaiBC  = findLoaiBCCol(header)

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
          loaiBC: colLoaiBC >= 0 ? String(row[colLoaiBC] ?? '').trim() : '',
        },
      })
    }
  }
  return groupDocs('PL', entries)
}

function parseBS(sheet: Sheet, year?: string): BctcPeriodDoc[] {
  const h = detectHeader(sheet, year)
  if (!h) return []
  const header = sheet[h.labelRow]
  // Đồng bộ với fix ở parsePL: header thật ghi "TM" chứ không phải "Code".
  const colCode    = findCol(header, n => n === 'code' || n === 'tm')
  const colChiTieu = findCol(header, n => n === 'chitieu')
  const colMaSo    = findCol(header, n => n.startsWith('ma') && !n.includes('khach') && !n.includes('cungcap') && !n.includes('ncc'))
  const colTMinh   = findCol(header, n => n.startsWith('tmi'))
  const colLoaiBC  = findLoaiBCCol(header)

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
          loaiBC: colLoaiBC >= 0 ? String(row[colLoaiBC] ?? '').trim() : '',
        },
      })
    }
  }
  return groupDocs('BS', entries)
}

function parseTB(sheet: Sheet, year?: string): BctcPeriodDoc[] {
  const h = detectHeader(sheet, year)
  if (!h) return []
  const header = sheet[h.labelRow]
  const colCode        = findCol(header, n => n === 'code')
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

function parseArAp(sheet: Sheet, report: 'AR' | 'AP', year?: string): BctcPeriodDoc[] {
  const h = detectHeader(sheet, year)
  if (!h) return []
  const header = sheet[h.labelRow]
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

// FIX: Trích year từ tên tab (vd "2025_TB" → "2025") và truyền vào hàm parse tương ứng
export function parseTab(tab: string, values: Sheet): BctcPeriodDoc[] {
  const newStyle = /^(\d{4})_(PL|BS|TB|AR|AP)$/.exec(tab)
  const year = newStyle ? newStyle[1] : undefined                     // ← lấy năm từ tên tab
  const base = newStyle ? `Data_${newStyle[2]}` : tab.replace(/_\d{4}$/, '')

  switch (base) {
    case 'Data_PL': return parsePL(values, year)
    case 'Data_BS': return parseBS(values, year)
    case 'Data_TB': return parseTB(values, year)
    case 'Data_AR': return parseArAp(values, 'AR', year)
    case 'Data_AP': return parseArAp(values, 'AP', year)
    default: return []
  }
}