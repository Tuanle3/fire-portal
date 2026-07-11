'use client'
// ── Xuất Excel cho module Điện nước SA.ĐT ────────────────────────────────────
// Mỗi tab có 1 hàm export riêng, dựng workbook từ dữ liệu đã tải sẵn ở client
// (Firestore subscriptions) rồi tải xuống trực tiếp — không cần gọi API.
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, BandKey,
  BAND_KEYS, BAND_LABELS, METER_UNIT, meterLabel,
  meterSubtotal, meterVat, meterTotal, meterAllocation,
  resolvePrice, resolveTimebandPoint, usageKwh, computeLightingSplit, isActiveInMonth, feeStatus, managementFeeOf, managementFeeBreakdown,
  customerServices, customerHasService, subFor, findUsage, primaryService, paymentService,
  METER_SERVICE, serviceLabel,
  CHARGE_TYPE_LABELS, DEFAULT_BQT_RATIO,
  FloorBandKey,
} from './dien-nuoc-types'

const r0 = (n: number) => Math.round(n)                 // tiền: làm tròn đồng
const r2 = (n: number) => Math.round(n * 100) / 100     // kWh/m³: giữ 2 số lẻ

type Row = Record<string, string | number>
type Cell = string | number
type Aoa = Cell[][]

// ── Style: header đậm nền navy (bản community bỏ qua .s nhưng vẫn giữ cho nhất quán) ──
const HEADER_STYLE = {
  font:      { bold: true, color: { rgb: 'FFFFFF' }, name: 'Times New Roman', sz: 11 },
  fill:      { fgColor: { rgb: '1C3557' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}

function styleHeaderRow(ws: XLSX.WorkSheet, rowIdx: number) {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: C })
    if (ws[addr]) ws[addr].s = HEADER_STYLE
  }
}

function sheetFromRows(rows: Row[], cols?: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows)
  if (cols) ws['!cols'] = cols.map(wch => ({ wch }))
  styleHeaderRow(ws, 0)
  return ws
}

function sheetFromAoa(aoa: Aoa, cols?: number[], headerRows: number[] = []): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  if (cols) ws['!cols'] = cols.map(wch => ({ wch }))
  headerRows.forEach(r => styleHeaderRow(ws, r))
  return ws
}

// Tên sheet Excel không được chứa : \ / ? * [ ] và tối đa 31 ký tự
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
}
function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '-')
}

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, safeFileName(filename), { cellStyles: true })
}

// ── Style chuyên nghiệp cho bảng tính (exceljs: font Times New Roman, viền, tô nền) ──
type StyleKey = 'title' | 'sub' | 'guideH' | 'guide' | 'section' | 'colHead' | 'label' | 'labelB' | 'num' | 'numK' | 'numP' | 'totalL' | 'totalN' | 'sonAnL' | 'sonAnN' | 'note'
// f = công thức Excel (không có dấu "="); có f thì ô ghi công thức + kết quả (v) ⇒ người xem bấm vào thấy nguồn số.
type ECell = { v: Cell; k?: StyleKey; f?: string } | null
type EMerge = [number, number, number]  // [rowIdx0, colStart0, colEnd0]
interface SheetSpec { name: string; rows: ECell[][]; colW: number[]; merges: EMerge[] }

const FONT = 'Times New Roman'
const BD = { style: 'thin' as const, color: { argb: 'FFC7CED8' } }
const BOX = { top: BD, bottom: BD, left: BD, right: BD }
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
const EJS: Record<StyleKey, Partial<ExcelJS.Style>> = {
  title:   { font: { name: FONT, size: 14, bold: true, color: { argb: 'FF1C3557' } }, alignment: { vertical: 'middle' } },
  sub:     { font: { name: FONT, size: 10, italic: true, color: { argb: 'FF6B7280' } } },
  guideH:  { font: { name: FONT, size: 11, bold: true, color: { argb: 'FF8A5A12' } }, fill: fill('FFFFF4E0'), alignment: { vertical: 'middle' } },
  guide:   { font: { name: FONT, size: 10, color: { argb: 'FF3D3D3D' } }, fill: fill('FFFFFDF6'), alignment: { vertical: 'middle', wrapText: true } },
  section: { font: { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill('FF1C3557'), alignment: { horizontal: 'left', vertical: 'middle' }, border: BOX },
  colHead: { font: { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill('FF2A4D7A'), alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: BOX },
  label:   { font: { name: FONT, size: 10 }, alignment: { vertical: 'middle' }, border: BOX },
  labelB:  { font: { name: FONT, size: 10, bold: true }, alignment: { vertical: 'middle' }, border: BOX },
  num:     { font: { name: FONT, size: 10 }, numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'middle' }, border: BOX },
  numK:    { font: { name: FONT, size: 10 }, numFmt: '#,##0.0', alignment: { horizontal: 'right', vertical: 'middle' }, border: BOX },
  numP:    { font: { name: FONT, size: 10 }, numFmt: '#,##0.##', alignment: { horizontal: 'right', vertical: 'middle' }, border: BOX },
  totalL:  { font: { name: FONT, size: 10, bold: true, color: { argb: 'FF1C3557' } }, fill: fill('FFE0EDFA'), alignment: { vertical: 'middle' }, border: BOX },
  totalN:  { font: { name: FONT, size: 10, bold: true, color: { argb: 'FF1C3557' } }, fill: fill('FFE0EDFA'), numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'middle' }, border: BOX },
  sonAnL:  { font: { name: FONT, size: 10, bold: true, color: { argb: 'FF8A5A12' } }, fill: fill('FFFFF4E0'), alignment: { vertical: 'middle' }, border: BOX },
  sonAnN:  { font: { name: FONT, size: 10, bold: true, color: { argb: 'FF8A5A12' } }, fill: fill('FFFFF4E0'), numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'middle' }, border: BOX },
  note:    { font: { name: FONT, size: 9, italic: true, color: { argb: 'FF55606E' } }, alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }, border: BOX },
}

// Cột số → chữ cái Excel (1→A, 2→B…) để dựng công thức tham chiếu ô.
function colLetter(n: number): string {
  let s = '', x = n
  while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26) }
  return s
}

// Dựng & tải workbook bằng exceljs (giữ đầy đủ màu/viền/font + công thức) — chạy phía client bằng Blob.
async function downloadWorkbook(specs: SheetSpec[], filename: string) {
  const wb = new ExcelJS.Workbook()
  for (const spec of specs) {
    const ws = wb.addWorksheet(safeSheetName(spec.name))
    ws.columns = spec.colW.map(w => ({ width: w }))
    spec.rows.forEach((row, R) => {
      let hasNote = false, hasGuide = false
      row.forEach((cell, C) => {
        if (!cell) return
        const c = ws.getCell(R + 1, C + 1)
        if (cell.f) c.value = { formula: cell.f, result: typeof cell.v === 'number' ? cell.v : undefined }
        else c.value = cell.v === '' ? null : cell.v
        const st = cell.k ? EJS[cell.k] : undefined
        if (st) {
          if (st.font) c.font = st.font
          if (st.fill) c.fill = st.fill
          if (st.border) c.border = st.border
          if (st.alignment) c.alignment = st.alignment
          if (st.numFmt) c.numFmt = st.numFmt
        }
        if (cell.k === 'note') hasNote = true
        if (cell.k === 'guide') hasGuide = true
      })
      // Dòng có ghi chú dài / hướng dẫn ⇒ cao hơn để chữ xuống dòng đọc được.
      if (hasGuide) ws.getRow(R + 1).height = 30
      else if (hasNote) ws.getRow(R + 1).height = 28
    })
    for (const [r, c1, c2] of spec.merges) ws.mergeCells(r + 1, c1 + 1, r + 1, c2 + 1)
  }
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = safeFileName(filename); a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// 12 tháng gần nhất của 1 đồng hồ, xếp cũ → mới.
function recentMonths(readings: MeterReading[], meterId: MeterId): MeterReading[] {
  return readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
}

// ── Bảng tính trình bày (Điện chiếu sáng / Điện máy lạnh) — tháng là các cột ──
// Có: ① khối "Cách đọc bảng" (lời văn dễ hiểu), ② cột "Cách tính" giải thích từng dòng,
// ③ công thức Excel thật ở các ô tổng ⇒ người xem bấm vào ô là thấy số lấy từ đâu.
function electricPresentation(meterId: MeterId, months: MeterReading[], customers: Customer[], usages: CustomerUsage[], label: string): SheetSpec {
  const b1Bands: BandKey[] = meterId === 1 ? BAND_KEYS : ['caoDiem', 'thapDiem', 'binhThuong']
  const nCols = months.length
  const noteCol = nCols + 1                  // cột 0 nhãn · 1..n tháng · n+1 "Cách tính"
  const rows: ECell[][] = []
  const merges: EMerge[] = []
  const colL = (j: number) => colLetter(j + 2)                 // tháng j (0-based) → chữ cột Excel
  const push = (cells: ECell[]) => (rows.push(cells), rows.length)   // trả về số dòng Excel (1-based)
  const full = (r1: number) => merges.push([r1 - 1, 0, noteCol])
  const nc = (t: string): ECell => ({ v: t, k: 'note' })
  const dataRow = (lbl: string, cells: ECell[], note: string, lk: StyleKey = 'label'): ECell[] => [{ v: lbl, k: lk }, ...cells, nc(note)]
  const valCells = (fn: (m: MeterReading, j: number) => Cell, vk: StyleKey): ECell[] => months.map((m, j) => ({ v: fn(m, j), k: vk }))
  const fCells = (fn: (m: MeterReading, j: number) => Cell, ff: (L: string, m: MeterReading, j: number) => string, vk: StyleKey): ECell[] =>
    months.map((m, j) => ({ v: fn(m, j), k: vk, f: ff(colL(j), m, j) }))
  const section = (t: string) => full(push([{ v: t, k: 'section' }]))
  const colHead = (first: string) => push([{ v: first, k: 'colHead' }, ...months.map(m => ({ v: m.month, k: 'colHead' as StyleKey })), { v: 'Cách tính', k: 'colHead' }])

  full(push([{ v: `BẢNG TÍNH TIỀN ${label.toUpperCase()}`, k: 'title' }]))
  push([{ v: `Số liệu ${months.length} tháng gần nhất · Đơn vị: đồng (đ), kWh`, k: 'sub' }])
  push([])
  full(push([{ v: '📖 CÁCH ĐỌC BẢNG (đọc là hiểu — không cần là người làm)', k: 'guideH' }]))
  const guide = meterId === 1 ? [
    '① BẢNG 1 = hoá đơn điện lực: mỗi tháng dùng bao nhiêu "số điện" (kWh) theo từng loại giờ × "giá 1 số điện", cộng lại + thuế 8% = tiền phải trả cho điện lực.',
    '② BẢNG 2 chia số tiền đó làm 2 phần: "Sơn An thu hộ" (Sơn An thu giúp các cửa hàng + công ty) và "Ban quản trị" (điện phần chung của cư dân). QUY TẮC VÀNG: Ban quản trị = Tổng cộng − Sơn An thu hộ.',
    '③ Phần CHI TIẾT cho biết "Sơn An thu hộ" ở đâu ra: điện chung 3 tầng thương mại + điện các công ty có đồng hồ riêng, nhân giá rồi cộng thuế.',
    '★ Cách tra cứu: bấm vào ô số có nền xanh/vàng (các dòng tổng) sẽ thấy CÔNG THỨC (ví dụ = ô này × ô kia). Cột "Cách tính" ngoài cùng bên phải giải thích từng dòng bằng lời.',
  ] : [
    '① BẢNG 1 = hoá đơn điện máy lạnh trung tâm từ điện lực: số điện (kWh) theo từng loại giờ × giá + thuế 8% = tiền phải trả.',
    '② BẢNG 2 chia tiền đó cho từng khách dùng máy lạnh (theo cách tính riêng của khách); phần chưa chia cho ai gọi là "Sơn An Group chịu" = Tổng cộng − tổng các khách.',
    '★ Cách tra cứu: bấm vào ô số nền xanh/vàng để xem CÔNG THỨC; cột "Cách tính" bên phải giải thích từng dòng bằng lời.',
  ]
  for (const line of guide) full(push([{ v: line, k: 'guide' }]))
  push([])

  // Bảng 1 — tiêu thụ từ điện lực
  section('BẢNG 1: THÔNG TIN TIÊU THỤ ĐIỆN (TỪ ĐIỆN LỰC)')
  colHead('Nội dung')
  const rKwh: Partial<Record<BandKey, number>> = {}
  for (const k of b1Bands) rKwh[k] = push(dataRow(`Kwh · ${BAND_LABELS[k]}`, valCells(m => r2(m.bands[k].kwh), 'numK'), `Số điện dùng loại "${BAND_LABELS[k]}" trong tháng (theo hoá đơn điện lực).`))
  const rDg: Partial<Record<BandKey, number>> = {}
  for (const k of b1Bands) rDg[k] = push(dataRow(`Đơn giá · ${BAND_LABELS[k]}`, valCells(m => m.bands[k].donGia, 'numP'), `Giá tiền cho 1 số điện loại "${BAND_LABELS[k]}" (điện lực quy định).`))
  const subF1 = (L: string) => b1Bands.map(k => `${L}${rKwh[k]}*${L}${rDg[k]}`).join('+')
  const rSub1 = push(dataRow('Tổng tiền chưa VAT', fCells(m => r0(meterSubtotal(m.bands)), L => `ROUND(${subF1(L)},0)`, 'num'), 'Cộng tất cả (Số điện × Giá) của các loại giờ phía trên.'))
  const rVat1 = push(dataRow('Thuế VAT', fCells(m => r0(meterVat(m.bands, m.vatPercent)), (L, m) => `ROUND(${L}${rSub1}*${(m.vatPercent || 0) / 100},0)`, 'num'), 'Thuế giá trị gia tăng = Tổng chưa VAT × 8%.'))
  const rTot1 = push(dataRow('Tổng thanh toán', fCells(m => r0(meterTotal(m.bands, m.vatPercent)), L => `${L}${rSub1}+${L}${rVat1}`, 'totalN'), 'Tổng chưa VAT + Thuế VAT = số tiền phải trả cho điện lực.', 'totalL'))
  push([])

  if (meterId === 1) {
    const splits = months.map(m => computeLightingSplit(m, customers, usages, m.bqtRatio ?? DEFAULT_BQT_RATIO))
    section('BẢNG 2: PHÂN BỔ TIỀN ĐIỆN')
    colHead('Nội dung')
    const sonAn2 = fCells((m, j) => r0(splits[j].sonAnTotal), () => '', 'sonAnN')   // công thức gắn sau khi biết dòng CHI TIẾT
    const rSonAn2 = push(dataRow('Tiền điện Sơn An thu hộ', sonAn2, 'Tiền điện Sơn An thu giúp cho ki-ốt + công ty. Cách tính xem bảng "CHI TIẾT PHẦN SƠN AN THU HỘ" bên dưới.', 'sonAnL'))
    push(dataRow('Tiền điện chung cư (Ban quản trị)', fCells((m, j) => r0(splits[j].bqtTotal), L => `${L}${rTot1}-${L}${rSonAn2}`, 'num'), 'QUY TẮC VÀNG = Tổng cộng − Sơn An thu hộ. Đây là tiền điện phần chung của cư dân (BQT) chịu.', 'labelB'))
    push(dataRow('Tổng cộng', fCells((m, j) => r0(splits[j].meterTotal), L => `${L}${rTot1}`, 'totalN'), '= Tổng thanh toán ở Bảng 1 (đúng bằng tiền điện lực).', 'totalL'))
    push([])
    section('CHI TIẾT PHẦN SƠN AN THU HỘ')
    colHead('Nội dung')
    push(dataRow('Chung 3 tầng TM (kWh)', valCells((m, j) => r2(splits[j].commonPoolKwh), 'numK'), 'Tổng số điện của 3 tầng thương mại (các khu đánh dấu "chung"). Nhập trong phần mềm.'))
    push(dataRow('Công ty đồng hồ riêng (kWh)', valCells((m, j) => r2(splits[j].companies.reduce((x, c) => x + c.total, 0)), 'numK'), 'Tổng số điện các công ty có đồng hồ riêng (VIN, PLT, Meta…).'))
    const B3: [FloorBandKey, string][] = [['caoDiem', 'Cao điểm'], ['thapDiem', 'Thấp điểm'], ['binhThuong', 'Bình thường']]
    const rSl: Partial<Record<FloorBandKey, number>> = {}
    B3.forEach(([bk, lb], i) => { rSl[bk] = push(dataRow(`Sản lượng thu hộ · ${lb} (kWh)`, valCells((m, j) => r2(splits[j].bands[i].kwh), 'numK'), `= (Chung 3 tầng TM × tỷ lệ giờ ${lb}) + phần công ty dùng giờ ${lb}.`)) })
    const rDg2: Partial<Record<FloorBandKey, number>> = {}
    B3.forEach(([bk, lb], i) => { rDg2[bk] = push(dataRow(`Đơn giá · ${lb}`, valCells((m, j) => splits[j].bands[i].price, 'numP'), `Giá 1 số điện giờ ${lb} (lấy theo giá điện lực ở Bảng 1).`)) })
    const subF2 = (L: string) => B3.map(([bk]) => `${L}${rSl[bk]}*${L}${rDg2[bk]}`).join('+')
    const rSub2 = push(dataRow('Tổng chưa VAT', fCells((m, j) => r0(splits[j].sonAnSubtotal), L => `ROUND(${subF2(L)},0)`, 'num'), 'Cộng (Sản lượng thu hộ × Giá) của 3 loại giờ.'))
    const rVat2 = push(dataRow('Thuế VAT', fCells((m, j) => r0(splits[j].sonAnVat), (L, m) => `ROUND(${L}${rSub2}*${(m.vatPercent || 0) / 100},0)`, 'num'), '= Tổng chưa VAT × 8%.'))
    const rSonAnDetail = push(dataRow('Sơn An thu hộ', fCells((m, j) => r0(splits[j].sonAnTotal), L => `${L}${rSub2}+${L}${rVat2}`, 'sonAnN'), '= Tổng chưa VAT + Thuế VAT. Số này được đưa lên Bảng 2.', 'sonAnL'))
    // Gắn công thức cho "Sơn An thu hộ" ở Bảng 2 = trỏ tới dòng tổng của bảng CHI TIẾT.
    sonAn2.forEach((cell, j) => { if (cell) cell.f = `${colL(j)}${rSonAnDetail}` })
  } else {
    const allocs = months.map(m => meterAllocation(m, customers, usages))
    const cmp = { numeric: true, sensitivity: 'base' } as const
    const priced = customers.filter(c => customerHasService(c, 'dh2') && subFor(c, 'dh2')?.chargeType !== 'remainder'
      && allocs.some(a => a.rows.some(x => x.customer.id === c.id)))
      .sort((a, b) => (a.floor?.trim() || '').localeCompare(b.floor?.trim() || '', 'vi', cmp) || a.name.localeCompare(b.name, 'vi', cmp))
    section('BẢNG 2: PHÂN BỔ CHO KHÁCH & SƠN AN GROUP')
    colHead('Khách hàng')
    const custRows: number[] = []
    for (const c of priced) custRows.push(push(dataRow(c.name, valCells((m, j) => r0(allocs[j].rows.find(x => x.customer.id === c.id)?.amount ?? 0), 'num'), `Tiền điện máy lạnh của khách "${c.name}" (theo cách tính riêng của khách).`)))
    const sumRef = custRows.length ? (L: string) => `${L}${rTot1}-SUM(${L}${custRows[0]}:${L}${custRows[custRows.length - 1]})` : (L: string) => `${L}${rTot1}`
    push(dataRow('Sơn An Group chịu (phần còn lại)', fCells((m, j) => r0(allocs[j].remainderTotal), sumRef, 'sonAnN'), '= Tổng tiền đồng hồ − tổng đã tính cho các khách ở trên (phần Sơn An Group chịu).', 'sonAnL'))
    push(dataRow('Tổng cộng', fCells((m, j) => r0(allocs[j].total), L => `${L}${rTot1}`, 'totalN'), '= Tổng thanh toán ở Bảng 1.', 'totalL'))
  }

  return { name: label, rows, colW: [30, ...months.map(() => 14), 46], merges }
}

// ── Bảng tiêu thụ nước — tháng là các cột ────────────────────────────────────
function waterPresentation(months: MeterReading[], label: string): SheetSpec {
  const nCols = months.length
  const noteCol = nCols + 1
  const rows: ECell[][] = []
  const merges: EMerge[] = []
  const colL = (j: number) => colLetter(j + 2)
  const push = (cells: ECell[]) => (rows.push(cells), rows.length)
  const full = (r1: number) => merges.push([r1 - 1, 0, noteCol])
  const nc = (t: string): ECell => ({ v: t, k: 'note' })
  const dataRow = (lbl: string, cells: ECell[], note: string, lk: StyleKey = 'label'): ECell[] => [{ v: lbl, k: lk }, ...cells, nc(note)]
  const valCells = (fn: (m: MeterReading) => Cell, vk: StyleKey): ECell[] => months.map(m => ({ v: fn(m), k: vk }))
  const fCells = (fn: (m: MeterReading) => Cell, ff: (L: string, m: MeterReading) => string, vk: StyleKey): ECell[] => months.map((m, j) => ({ v: fn(m), k: vk, f: ff(colL(j), m) }))

  full(push([{ v: `BẢNG TÍNH TIỀN ${label.toUpperCase()}`, k: 'title' }]))
  push([{ v: `Số liệu ${months.length} tháng gần nhất · Đơn vị: đồng (đ), m³`, k: 'sub' }])
  push([])
  full(push([{ v: '📖 CÁCH ĐỌC BẢNG', k: 'guideH' }]))
  full(push([{ v: '① Mỗi tháng dùng bao nhiêu m³ nước × đơn giá 1 m³ = tiền chưa thuế; cộng thuế 8% = tiền nước phải trả.', k: 'guide' }]))
  full(push([{ v: '★ Bấm vào ô số nền xanh để xem CÔNG THỨC; cột "Cách tính" bên phải giải thích từng dòng.', k: 'guide' }]))
  push([])
  push([{ v: 'Nội dung', k: 'colHead' }, ...months.map(m => ({ v: m.month, k: 'colHead' as StyleKey })), { v: 'Cách tính', k: 'colHead' }])
  const rSl = push(dataRow('Sản lượng (m³)', valCells(m => r2(m.bands.toanThoiGian.kwh), 'numK'), 'Số nước dùng trong tháng (m³) = chỉ số mới − chỉ số cũ.'))
  const rDg = push(dataRow('Đơn giá (đ/m³)', valCells(m => m.bands.toanThoiGian.donGia, 'numP'), 'Giá tiền cho 1 m³ nước.'))
  const rSub = push(dataRow('Tổng tiền chưa VAT', fCells(m => r0(meterSubtotal(m.bands)), L => `ROUND(${L}${rSl}*${L}${rDg},0)`, 'num'), '= Sản lượng × Đơn giá.'))
  const rVat = push(dataRow('Thuế VAT', fCells(m => r0(meterVat(m.bands, m.vatPercent)), (L, m) => `ROUND(${L}${rSub}*${(m.vatPercent || 0) / 100},0)`, 'num'), '= Tổng chưa VAT × 8%.'))
  push(dataRow('Tổng thanh toán', fCells(m => r0(meterTotal(m.bands, m.vatPercent)), L => `${L}${rSub}+${L}${rVat}`, 'totalN'), '= Tổng chưa VAT + Thuế VAT.', 'totalL'))
  return { name: label, rows, colW: [26, ...months.map(() => 14), 46], merges }
}

// ── Sheet dữ liệu chi tiết theo khách (chỉ các cột cần) ───────────────────────
function customerDetailSheet(meterId: MeterId, months: MeterReading[], customers: Customer[], usages: CustomerUsage[], unit: string): SheetSpec | null {
  const service = METER_SERVICE[meterId]
  const isElec = meterId !== 3
  const bandCols: [BandKey, string][] = [['caoDiem', 'CĐ'], ['thapDiem', 'TĐ'], ['binhThuong', 'BT']]
  const cmp = { numeric: true, sensitivity: 'base' } as const
  const mCustomers = customers.filter(c => customerHasService(c, service) && c.active).sort((a, b) =>
    (a.floor?.trim() || '').localeCompare(b.floor?.trim() || '', 'vi', cmp)
    || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', cmp)
    || a.name.localeCompare(b.name, 'vi', cmp))
  if (!mCustomers.length || !months.length) return null

  const amtByMonth = new Map(months.map(r => [r.month, new Map(meterAllocation(r, customers, usages).rows.map(x => [x.customer.id, x.amount]))]))
  const usageOf = (c: Customer, m: string) => findUsage(usages, c.id, service, m, primaryService(c))

  const header: string[] = ['Khách hàng', 'Nhóm', 'Tầng', 'Mã ki-ốt', 'Cách tính tiền', 'Tháng']
  if (isElec) bandCols.forEach(([, lb]) => header.push(`${lb} kWh`))
  header.push(`Sản lượng (${unit})`, 'Đơn giá (đ)', 'Thành tiền (đ)')

  // Dòng hướng dẫn (gộp ô) + dòng tiêu đề cột.
  const guideText = isElec
    ? 'Bảng dữ liệu theo từng khách × từng tháng. kWh CĐ/TĐ/BT = số điện từng giờ (khách theo khung giờ: chỉ số mới − cũ; khách giá cố định: chia theo tỷ lệ giờ). Thành tiền tính theo cách tính riêng của mỗi khách.'
    : 'Bảng dữ liệu theo từng khách × từng tháng. Sản lượng = chỉ số mới − cũ. Thành tiền tính theo cách tính riêng của mỗi khách.'
  const rows: ECell[][] = [
    [{ v: guideText, k: 'guide' }],
    header.map(h => ({ v: h, k: 'colHead' as StyleKey })),
  ]
  const merges: EMerge[] = [[0, 0, header.length - 1]]
  for (const c of mCustomers) {
    const sub = subFor(c, service)!
    const ct = sub.chargeType
    for (const r of months) {
      const u = usageOf(c, r.month)
      const amount = amtByMonth.get(r.month)?.get(c.id) ?? 0
      const row: ECell[] = [
        { v: c.name, k: 'label' }, { v: c.group?.trim() || '', k: 'label' }, { v: c.floor || '', k: 'label' },
        { v: c.kioskCode || '', k: 'label' }, { v: CHARGE_TYPE_LABELS[ct], k: 'label' }, { v: r.month, k: 'label' },
      ]
      if (isElec) {
        const ratio = r.bqtRatio ?? DEFAULT_BQT_RATIO
        const ratioSum = (ratio.caoDiem || 0) + (ratio.thapDiem || 0) + (ratio.binhThuong || 0)
        const flatTotal = usageKwh(sub, u)
        bandCols.forEach(([k]) => {
          let kwh: Cell = ''
          if (ct === 'timeband_excl_vat') {
            const oldI = u?.bandsIndexOld?.[k], newI = u?.bandsIndexNew?.[k]
            kwh = (oldI != null || newI != null) ? r2(Math.max(0, (newI ?? 0) - (oldI ?? 0))) : (u?.bandsKwh?.[k] != null ? r2(u.bandsKwh[k]!) : '')
          } else if (ct === 'flat_vat_incl' && meterId === 1) {
            kwh = r2(ratioSum > 0 ? flatTotal * (ratio[k as FloorBandKey] || 0) / ratioSum : (k === 'binhThuong' ? flatTotal : 0))
          }
          row.push({ v: kwh, k: 'numK' })
        })
      }
      const sl: Cell = (ct === 'flat_vat_incl' || ct === 'timeband_excl_vat') ? r2(usageKwh(sub, u)) : ''
      const dg: Cell = ct === 'flat_vat_incl' ? resolvePrice(sub.flatPriceHistory, sub.flatUnitPrice ?? 0, r.month)
        : ct === 'fixed_area' ? resolvePrice(sub.areaPriceHistory, sub.pricePerM2 ?? 0, r.month) : ''
      row.push({ v: sl, k: 'numK' }, { v: dg, k: 'numP' }, { v: r0(amount), k: 'num' })
      rows.push(row)
    }
  }
  const colW = [24, 14, 10, 12, 22, 10, ...(isElec ? [10, 10, 10] : []), 14, 14, 16]
  return { name: 'Chi tiet khach hang', rows, colW, merges }
}

// ── Tab: Đồng hồ (Nhập chỉ số) — 1 file/đồng hồ, trình bày như bảng tính Excel ──
export async function exportMeter(
  meterId: MeterId, month: string,
  readings: MeterReading[], customers: Customer[], usages: CustomerUsage[],
  meterNames: Record<number, string>,
) {
  const label = meterLabel(meterNames, meterId)
  const unit = METER_UNIT[meterId]
  const months = recentMonths(readings, meterId)

  if (months.length === 0) {
    await downloadWorkbook([{ name: label, rows: [[{ v: 'Chưa có dữ liệu tháng nào cho đồng hồ này.', k: 'label' }]], colW: [50], merges: [] }], `dien-nuoc_${label}_${month}.xlsx`)
    return
  }

  const presentation = meterId === 3 ? waterPresentation(months, label) : electricPresentation(meterId, months, customers, usages, label)
  const detail = customerDetailSheet(meterId, months, customers, usages, unit)
  const specs = detail ? [presentation, detail] : [presentation]
  await downloadWorkbook(specs, `dien-nuoc_${label}_${month}.xlsx`)
}

// ── Tab: Tổng quan ───────────────────────────────────────────────────────────
export function exportTongQuan(
  readings: MeterReading[], customers: Customer[], usages: CustomerUsage[], payments: Payment[],
  month: string, meterNames: Record<number, string>,
) {
  const monthReadings = readings.filter(r => r.month === month)
  const allAlloc = ([1, 2, 3] as MeterId[]).map(id => ({ id, r: monthReadings.find(x => x.meterId === id) }))
  const paidOf = (cid: string) => payments.filter(p => p.customerId === cid && p.month === month).reduce((s, p) => s + p.amount, 0)

  const totalBill = monthReadings.reduce((s, r) => s + meterTotal(r.bands, r.vatPercent), 0)
  const allRows = monthReadings.flatMap(r => meterAllocation(r, customers, usages).rows)
  const managementDue = customers.reduce((s, c) => s + managementFeeOf(c, month), 0)
  const totalDue = allRows.reduce((s, r) => s + r.amount, 0) + managementDue
  const totalPaid = payments.filter(p => p.month === month).reduce((s, p) => s + p.amount, 0)

  const wb = XLSX.utils.book_new()

  // Sheet 1 — KPI + tổng hợp theo đồng hồ
  const s1: Aoa = [
    [`Tổng quan điện nước — tháng ${month}`], [],
    ['Chỉ tiêu', 'Giá trị (đ)'],
    ['Tổng tiền điện nước tháng', r0(totalBill)],
    ['Đã thu', r0(totalPaid)],
    ['Công nợ còn lại', r0(Math.max(0, totalDue - totalPaid))],
    ['Tổng phải thu', r0(totalDue)],
    ['Số khách hàng đang hoạt động', customers.filter(c => c.active).length],
    [],
    ['Đồng hồ', 'Tổng tiền (đ)', 'Đã phân bổ khách (đ)', 'Còn lại - BQT/gánh (đ)'],
  ]
  allAlloc.forEach(({ id, r }) => {
    if (!r) { s1.push([meterLabel(meterNames, id), '(chưa nhập chỉ số)', '', '']); return }
    const a = meterAllocation(r, customers, usages)
    s1.push([meterLabel(meterNames, id), r0(a.total), r0(a.allocated), r0(a.remainderTotal)])
  })
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(s1, [30, 20, 22, 24], [2, 9]), safeSheetName(`Tong quan ${month}`))

  // Sheet 2 — Chi tiết khách hàng (mọi đồng hồ)
  const rows: Row[] = []
  allAlloc.forEach(({ id, r }) => {
    if (!r) return
    meterAllocation(r, customers, usages).rows.forEach(({ customer: c, amount }) => {
      const paid = paidOf(c.id)
      rows.push({
        'Đồng hồ':    meterLabel(meterNames, id),
        'Khách hàng': c.name,
        'Nhóm':       c.group?.trim() || '',
        'Phải trả (đ)': r0(amount),
        'Đã thu (đ)':   r0(paid),
        'Còn nợ (đ)':   r0(Math.max(0, amount - paid)),
      })
    })
  })
  if (rows.length === 0) rows.push({ 'Đồng hồ': '(Chưa có dữ liệu tháng này)' } as Row)
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, [26, 26, 18, 16, 16, 16]), 'Chi tiet khach hang')

  download(wb, `dien-nuoc_tong-quan_${month}.xlsx`)
}

// ── Tab: Khách hàng ──────────────────────────────────────────────────────────
export function exportKhachHang(customers: Customer[], meterNames: Record<number, string>, month: string) {
  const priceInfo = (c: Customer): string => {
    if (c.chargeType === 'flat_vat_incl') return `${c.flatUnitPrice} đ/đơn vị (gồm VAT)`
    if (c.chargeType === 'fixed_area')     return `${c.areaM2} m² × ${c.pricePerM2} đ/m²`
    if (c.chargeType === 'timeband_excl_vat') {
      const pt = resolveTimebandPoint(c.timebandPriceHistory, '9999-12')
      return pt ? `CĐ ${pt.caoDiem} · TĐ ${pt.thapDiem} · BT ${pt.binhThuong}` : 'Theo giá đồng hồ'
    }
    return ''
  }
  const rows: Row[] = customers.map((c, i) => ({
    'STT':            i + 1,
    'Tên khách hàng': c.name,
    'Nhóm':           c.group?.trim() || '',
    'Tầng':           c.floor || '',
    'Mã ki-ốt':       c.kioskCode || '',
    'Chủ ki-ốt':      c.kioskOwner || '',
    'Khách hàng thuê': c.tenantName || '',
    'Loại sử dụng':   customerServices(c).map(s => serviceLabel(s.service, meterNames)).join(', '),
    'Cách tính tiền': CHARGE_TYPE_LABELS[c.chargeType],
    'Thông số giá':   priceInfo(c),
    [`Trạng thái (${month})`]: !c.active ? 'Ngừng' : isActiveInMonth(c, month) ? 'Đang thuê' : 'Trống',
    'Ghi chú':        c.note || '',
  }))
  if (rows.length === 0) rows.push({ 'STT': '', 'Tên khách hàng': '(Chưa có khách hàng nào)' } as Row)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, [5, 26, 18, 12, 12, 18, 18, 22, 24, 30, 12, 24]), 'Khach hang')
  download(wb, `dien-nuoc_khach-hang.xlsx`)
}

// ── Tab: Phí quản lý ─────────────────────────────────────────────────────────
export function exportPhiQuanLy(customers: Customer[], month: string) {
  const feeCustomers = customers.filter(c => c.hasManagementFee)
  const rows: Row[] = feeCustomers.map((c, i) => {
    const bd = managementFeeBreakdown(c, month)
    return {
      'STT':            i + 1,
      'Khách hàng':     c.name,
      'Nhóm':           c.group?.trim() || '',
      'Tầng':           c.floor || '',
      'Mã ki-ốt':       c.kioskCode || '',
      'Khách thuê':     c.tenantName || c.kioskOwner || '',
      'Cách tính':      bd.isArea ? 'Theo diện tích' : 'Cố định',
      'Diện tích (m²)': bd.isArea ? bd.areaM2 : '',
      'Đơn giá':        r0(bd.unitPrice),   // đ/m²/tháng nếu theo diện tích, ngược lại đ/tháng
      [`Phải thu (${month}) (đ)`]: r0(bd.total),
      [`Trạng thái (${month})`]: feeStatus(c, month) === 'none' ? 'Không tính phí' : feeStatus(c, month) === 'accrue' ? 'Tính dồn (thu bù)' : 'Có tính phí',
    }
  })
  const total = feeCustomers.reduce((s, c) => s + managementFeeOf(c, month), 0)
  if (rows.length === 0) rows.push({ 'STT': '', 'Khách hàng': '(Chưa có khách nào bật phí quản lý)' } as Row)
  else rows.push({ 'Khách hàng': 'TỔNG CỘNG', [`Phải thu (${month}) (đ)`]: r0(total) } as Row)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, [5, 26, 18, 12, 12, 20, 14, 12, 16, 20, 16]), safeSheetName(`Phi quan ly ${month}`))
  download(wb, `dien-nuoc_phi-quan-ly_${month}.xlsx`)
}

// ── Tab: Công nợ & Thu tiền ──────────────────────────────────────────────────
export function exportCongNo(
  readings: MeterReading[], customers: Customer[], usages: CustomerUsage[], payments: Payment[],
  month: string, meterNames: Record<number, string>,
) {
  const monthReadings = readings.filter(r => r.month === month)
  const paidOf = (cid: string) => payments.filter(p => p.customerId === cid && p.month === month).reduce((s, p) => s + p.amount, 0)
  const wb = XLSX.utils.book_new()

  // Sheet 1 — Tổng hợp theo nhóm (gộp tiền đồng hồ + phí quản lý)
  const dueByCustomer = new Map<string, number>()
  for (const r of monthReadings) for (const row of meterAllocation(r, customers, usages).rows) {
    dueByCustomer.set(row.customer.id, (dueByCustomer.get(row.customer.id) ?? 0) + row.amount)
  }
  for (const c of customers) { const fee = managementFeeOf(c, month); if (fee > 0) dueByCustomer.set(c.id, (dueByCustomer.get(c.id) ?? 0) + fee) }
  const custById = new Map(customers.map(c => [c.id, c]))
  const groups = new Map<string, { due: number; paid: number; count: number }>()
  for (const [cid, due] of dueByCustomer) {
    const g = custById.get(cid)?.group?.trim() || 'Chưa phân nhóm'
    const cur = groups.get(g) ?? { due: 0, paid: 0, count: 0 }
    cur.due += due; cur.paid += paidOf(cid); cur.count += 1
    groups.set(g, cur)
  }
  const gRows = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi'))
  const s1: Aoa = [['Nhóm', 'Số KH', 'Phải trả (đ)', 'Đã thu (đ)', 'Còn nợ (đ)']]
  gRows.forEach(([g, v]) => s1.push([g, v.count, r0(v.due), r0(v.paid), r0(Math.max(0, v.due - v.paid))]))
  const totDue = gRows.reduce((s, [, v]) => s + v.due, 0)
  const totPaid = gRows.reduce((s, [, v]) => s + v.paid, 0)
  if (gRows.length > 0) s1.push(['Tổng cộng', '', r0(totDue), r0(totPaid), r0(Math.max(0, totDue - totPaid))])
  if (gRows.length === 0) s1.push(['(Chưa có dữ liệu tháng này)'])
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(s1, [26, 10, 16, 16, 16], [0]), safeSheetName(`Tong hop nhom ${month}`))

  // Sheet 2 — Chi tiết theo đồng hồ
  const rows: Row[] = []
  ;([1, 2, 3] as MeterId[]).forEach(id => {
    const r = monthReadings.find(x => x.meterId === id)
    if (!r) return
    meterAllocation(r, customers, usages).rows.forEach(({ customer: c, amount }) => {
      const paid = payments.filter(p => p.customerId === c.id && p.month === month && paymentService(p, primaryService(c)) === METER_SERVICE[id]).reduce((s, p) => s + p.amount, 0)
      rows.push({
        'Đồng hồ':    meterLabel(meterNames, id),
        'Khách hàng': c.name,
        'Nhóm':       c.group?.trim() || '',
        'Phải trả (đ)': r0(amount),
        'Đã thu (đ)':   r0(paid),
        'Còn nợ (đ)':   r0(Math.max(0, amount - paid)),
      })
    })
  })
  // Phí quản lý (đã thu chỉ tính khoản kind='management')
  customers.filter(c => managementFeeOf(c, month) > 0).forEach(c => {
    const due = managementFeeOf(c, month)
    const paid = payments.filter(p => p.customerId === c.id && p.month === month && paymentService(p, primaryService(c)) === 'phiql').reduce((s, p) => s + p.amount, 0)
    rows.push({
      'Đồng hồ':    'Phí quản lý',
      'Khách hàng': c.name,
      'Nhóm':       c.group?.trim() || '',
      'Phải trả (đ)': r0(due),
      'Đã thu (đ)':   r0(paid),
      'Còn nợ (đ)':   r0(Math.max(0, due - paid)),
    })
  })
  if (rows.length === 0) rows.push({ 'Đồng hồ': '(Chưa có dữ liệu tháng này)' } as Row)
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, [26, 26, 18, 16, 16, 16]), safeSheetName(`Chi tiet ${month}`))

  download(wb, `dien-nuoc_cong-no_${month}.xlsx`)
}
