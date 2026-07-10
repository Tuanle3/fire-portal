'use client'
// ── Xuất Excel cho module Điện nước SA.ĐT ────────────────────────────────────
// Mỗi tab có 1 hàm export riêng, dựng workbook từ dữ liệu đã tải sẵn ở client
// (Firestore subscriptions) rồi tải xuống trực tiếp — không cần gọi API.
import * as XLSX from 'xlsx'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, BandKey,
  BAND_KEYS, BAND_LABELS, METER_UNIT, meterLabel,
  meterSubtotal, meterVat, meterTotal, meterAllocation,
  resolvePrice, resolveTimebandPoint, usageKwh, computeLightingSplit, isActiveInMonth, managementFeeOf, managementFeeBreakdown,
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

// ── Style chuyên nghiệp cho bảng tính (font Times New Roman, viền, tô nền) ────
type SStyle = Record<string, unknown>
type SCell = { v: Cell; s?: SStyle } | null
const FONT = 'Times New Roman'
const BD = { style: 'thin', color: { rgb: 'C7CED8' } }
const BOX = { top: BD, bottom: BD, left: BD, right: BD }
const ST: Record<string, SStyle> = {
  title:   { font: { bold: true, sz: 14, color: { rgb: '1C3557' }, name: FONT }, alignment: { vertical: 'center' } },
  sub:     { font: { italic: true, sz: 10, color: { rgb: '6B7280' }, name: FONT } },
  section: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' }, name: FONT }, fill: { fgColor: { rgb: '1C3557' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: BOX },
  colHead: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' }, name: FONT }, fill: { fgColor: { rgb: '2A4D7A' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BOX },
  label:   { font: { sz: 10, name: FONT }, alignment: { vertical: 'center' }, border: BOX },
  labelB:  { font: { bold: true, sz: 10, name: FONT }, alignment: { vertical: 'center' }, border: BOX },
  num:     { font: { sz: 10, name: FONT }, numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
  numK:    { font: { sz: 10, name: FONT }, numFmt: '#,##0.0', alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
  numP:    { font: { sz: 10, name: FONT }, numFmt: '#,##0.##', alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
  totalL:  { font: { bold: true, sz: 10, color: { rgb: '1C3557' }, name: FONT }, fill: { fgColor: { rgb: 'E0EDFA' } }, alignment: { vertical: 'center' }, border: BOX },
  totalN:  { font: { bold: true, sz: 10, color: { rgb: '1C3557' }, name: FONT }, fill: { fgColor: { rgb: 'E0EDFA' } }, numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
  sonAnL:  { font: { bold: true, sz: 10, color: { rgb: '8A5A12' }, name: FONT }, fill: { fgColor: { rgb: 'FFF4E0' } }, alignment: { vertical: 'center' }, border: BOX },
  sonAnN:  { font: { bold: true, sz: 10, color: { rgb: '8A5A12' }, name: FONT }, fill: { fgColor: { rgb: 'FFF4E0' } }, numFmt: '#,##0', alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
}

function styledSheet(rows: SCell[][], colW: number[], merges: XLSX.Range[] = []): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  let maxC = 0
  rows.forEach((row, R) => row.forEach((cell, C) => {
    if (!cell) return
    if (C > maxC) maxC = C
    const isNum = typeof cell.v === 'number'
    // numFmt qua `z` để bản cộng đồng của thư viện xlsx ghi được định dạng số (dấu phân cách nghìn…);
    // còn `.s` (màu/viền/font) chỉ hiển thị nếu dùng bản có hỗ trợ style — vẫn giữ để tương thích.
    const z = isNum && cell.s?.numFmt ? { z: cell.s.numFmt as string } : {}
    ws[XLSX.utils.encode_cell({ r: R, c: C })] = { v: cell.v, t: isNum ? 'n' : 's', ...z, ...(cell.s ? { s: cell.s } : {}) }
  }))
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: Math.max(maxC, colW.length - 1) } })
  ws['!cols'] = colW.map(wch => ({ wch }))
  if (merges.length) ws['!merges'] = merges
  return ws
}

// 12 tháng gần nhất của 1 đồng hồ, xếp cũ → mới.
function recentMonths(readings: MeterReading[], meterId: MeterId): MeterReading[] {
  return readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
}

// ── Bảng tính trình bày (Điện chiếu sáng / Điện máy lạnh) — tháng là các cột ──
function electricPresentation(meterId: MeterId, months: MeterReading[], customers: Customer[], usages: CustomerUsage[], label: string): XLSX.WorkSheet {
  const b1Bands: BandKey[] = meterId === 1 ? BAND_KEYS : ['caoDiem', 'thapDiem', 'binhThuong']
  const lastCol = months.length            // cột 0 = nhãn, cột 1..n = tháng
  const rows: SCell[][] = []
  const merges: XLSX.Range[] = []
  const mrow = (r: number) => merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } })
  const labelRow = (label: string, vals: Cell[], vs: SStyle = ST.num, ls: SStyle = ST.label): SCell[] => [{ v: label, s: ls }, ...vals.map(v => ({ v, s: vs }))]
  const section = (t: string) => { rows.push([{ v: t, s: ST.section }, ...months.map(() => ({ v: '', s: ST.section }))]); mrow(rows.length - 1) }
  const colHead = (first: string) => rows.push([{ v: first, s: ST.colHead }, ...months.map(m => ({ v: m.month, s: ST.colHead }))])

  rows.push([{ v: `BẢNG TÍNH TIỀN ${label.toUpperCase()}`, s: ST.title }]); mrow(0)
  rows.push([{ v: `Số liệu ${months.length} tháng gần nhất · Đơn vị: đồng (đ), kWh`, s: ST.sub }])
  rows.push([])

  // Bảng 1 — tiêu thụ từ điện lực
  section('BẢNG 1: THÔNG TIN TIÊU THỤ ĐIỆN (TỪ ĐIỆN LỰC)')
  colHead('Nội dung')
  for (const k of b1Bands) rows.push(labelRow(`Kwh · ${BAND_LABELS[k]}`, months.map(m => r2(m.bands[k].kwh)), ST.numK))
  for (const k of b1Bands) rows.push(labelRow(`Đơn giá · ${BAND_LABELS[k]}`, months.map(m => m.bands[k].donGia), ST.numP))
  rows.push(labelRow('Tổng tiền chưa VAT', months.map(m => r0(meterSubtotal(m.bands)))))
  rows.push(labelRow('Thuế VAT', months.map(m => r0(meterVat(m.bands, m.vatPercent)))))
  rows.push(labelRow('Tổng thanh toán', months.map(m => r0(meterTotal(m.bands, m.vatPercent))), ST.totalN, ST.totalL))
  rows.push([])

  if (meterId === 1) {
    // Bảng 2 — tách Sơn An thu hộ / Ban quản trị
    const splits = months.map(m => computeLightingSplit(m, customers, usages, m.bqtRatio ?? DEFAULT_BQT_RATIO))
    section('BẢNG 2: PHÂN BỔ TIỀN ĐIỆN')
    colHead('Nội dung')
    rows.push(labelRow('Tiền điện Sơn An thu hộ', splits.map(s => r0(s.sonAnTotal)), ST.sonAnN, ST.sonAnL))
    rows.push(labelRow('Tiền điện chung cư (Ban quản trị)', splits.map(s => r0(s.bqtTotal)), ST.num, ST.labelB))
    rows.push(labelRow('Tổng cộng', splits.map(s => r0(s.meterTotal)), ST.totalN, ST.totalL))
    rows.push([])
    section('CHI TIẾT PHẦN SƠN AN THU HỘ')
    colHead('Nội dung')
    rows.push(labelRow('Chung 3 tầng TM (kWh)', splits.map(s => r2(s.commonPoolKwh)), ST.numK))
    rows.push(labelRow('Công ty đồng hồ riêng (kWh)', splits.map(s => r2(s.companies.reduce((x, c) => x + c.total, 0))), ST.numK))
    const B3: [FloorBandKey, string][] = [['caoDiem', 'Cao điểm'], ['thapDiem', 'Thấp điểm'], ['binhThuong', 'Bình thường']]
    B3.forEach(([, lb], i) => rows.push(labelRow(`Sản lượng thu hộ · ${lb} (kWh)`, splits.map(s => r2(s.bands[i].kwh)), ST.numK)))
    B3.forEach(([, lb], i) => rows.push(labelRow(`Đơn giá · ${lb}`, splits.map(s => s.bands[i].price), ST.numP)))
    rows.push(labelRow('Tổng chưa VAT', splits.map(s => r0(s.sonAnSubtotal))))
    rows.push(labelRow('Thuế VAT', splits.map(s => r0(s.sonAnVat))))
    rows.push(labelRow('Sơn An thu hộ', splits.map(s => r0(s.sonAnTotal)), ST.sonAnN, ST.sonAnL))
  } else {
    // Đồng hồ 2 — phân bổ cho khách + Sơn An Group chịu
    const allocs = months.map(m => meterAllocation(m, customers, usages))
    const cmp = { numeric: true, sensitivity: 'base' } as const
    const priced = customers.filter(c => customerHasService(c, 'dh2') && subFor(c, 'dh2')?.chargeType !== 'remainder'
      && allocs.some(a => a.rows.some(x => x.customer.id === c.id)))
      .sort((a, b) => (a.floor?.trim() || '').localeCompare(b.floor?.trim() || '', 'vi', cmp) || a.name.localeCompare(b.name, 'vi', cmp))
    section('BẢNG 2: PHÂN BỔ CHO KHÁCH & SƠN AN GROUP')
    colHead('Khách hàng')
    for (const c of priced) rows.push(labelRow(c.name, allocs.map(a => r0(a.rows.find(x => x.customer.id === c.id)?.amount ?? 0))))
    rows.push(labelRow('Sơn An Group chịu (phần còn lại)', allocs.map(a => r0(a.remainderTotal)), ST.sonAnN, ST.sonAnL))
    rows.push(labelRow('Tổng cộng', allocs.map(a => r0(a.total)), ST.totalN, ST.totalL))
  }

  return styledSheet(rows, [30, ...months.map(() => 14)], merges)
}

// ── Bảng tiêu thụ nước — tháng là các cột ────────────────────────────────────
function waterPresentation(months: MeterReading[], label: string): XLSX.WorkSheet {
  const lastCol = months.length
  const rows: SCell[][] = []
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }]
  const labelRow = (label: string, vals: Cell[], vs: SStyle = ST.num, ls: SStyle = ST.label): SCell[] => [{ v: label, s: ls }, ...vals.map(v => ({ v, s: vs }))]
  rows.push([{ v: `BẢNG TÍNH TIỀN ${label.toUpperCase()}`, s: ST.title }])
  rows.push([{ v: `Số liệu ${months.length} tháng gần nhất · Đơn vị: đồng (đ), m³`, s: ST.sub }])
  rows.push([])
  rows.push([{ v: 'Nội dung', s: ST.colHead }, ...months.map(m => ({ v: m.month, s: ST.colHead }))])
  rows.push(labelRow('Sản lượng (m³)', months.map(m => r2(m.bands.toanThoiGian.kwh)), ST.numK))
  rows.push(labelRow('Đơn giá (đ/m³)', months.map(m => m.bands.toanThoiGian.donGia), ST.numP))
  rows.push(labelRow('Tổng tiền chưa VAT', months.map(m => r0(meterSubtotal(m.bands)))))
  rows.push(labelRow('Thuế VAT', months.map(m => r0(meterVat(m.bands, m.vatPercent)))))
  rows.push(labelRow('Tổng thanh toán', months.map(m => r0(meterTotal(m.bands, m.vatPercent))), ST.totalN, ST.totalL))
  return styledSheet(rows, [26, ...months.map(() => 14)], merges)
}

// ── Sheet dữ liệu chi tiết theo khách (chỉ các cột cần) ───────────────────────
function customerDetailSheet(meterId: MeterId, months: MeterReading[], customers: Customer[], usages: CustomerUsage[], unit: string): XLSX.WorkSheet | null {
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

  const rows: SCell[][] = [header.map(h => ({ v: h, s: ST.colHead }))]
  for (const c of mCustomers) {
    const sub = subFor(c, service)!
    const ct = sub.chargeType
    for (const r of months) {
      const u = usageOf(c, r.month)
      const amount = amtByMonth.get(r.month)?.get(c.id) ?? 0
      const row: SCell[] = [
        { v: c.name, s: ST.label }, { v: c.group?.trim() || '', s: ST.label }, { v: c.floor || '', s: ST.label },
        { v: c.kioskCode || '', s: ST.label }, { v: CHARGE_TYPE_LABELS[ct], s: ST.label }, { v: r.month, s: ST.label },
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
          row.push({ v: kwh, s: ST.numK })
        })
      }
      const sl: Cell = (ct === 'flat_vat_incl' || ct === 'timeband_excl_vat') ? r2(usageKwh(sub, u)) : ''
      const dg: Cell = ct === 'flat_vat_incl' ? resolvePrice(sub.flatPriceHistory, sub.flatUnitPrice ?? 0, r.month)
        : ct === 'fixed_area' ? resolvePrice(sub.areaPriceHistory, sub.pricePerM2 ?? 0, r.month) : ''
      row.push({ v: sl, s: ST.numK }, { v: dg, s: ST.numP }, { v: r0(amount), s: ST.num })
      rows.push(row)
    }
  }
  const colW = [24, 14, 10, 12, 22, 10, ...(isElec ? [10, 10, 10] : []), 14, 14, 16]
  return styledSheet(rows, colW)
}

// ── Tab: Đồng hồ (Nhập chỉ số) — 1 file/đồng hồ, trình bày như bảng tính Excel ──
export function exportMeter(
  meterId: MeterId, month: string,
  readings: MeterReading[], customers: Customer[], usages: CustomerUsage[],
  meterNames: Record<number, string>,
) {
  const label = meterLabel(meterNames, meterId)
  const unit = METER_UNIT[meterId]
  const months = recentMonths(readings, meterId)
  const wb = XLSX.utils.book_new()

  // Sheet 1 — bảng tính trình bày (tháng là cột)
  const presentation = meterId === 3 ? waterPresentation(months, label) : electricPresentation(meterId, months, customers, usages, label)
  XLSX.utils.book_append_sheet(wb, presentation, safeSheetName(label))

  // Sheet 2 — dữ liệu chi tiết theo khách (chỉ cột cần)
  const detail = customerDetailSheet(meterId, months, customers, usages, unit)
  if (detail) XLSX.utils.book_append_sheet(wb, detail, 'Chi tiet khach hang')

  if (months.length === 0) {
    XLSX.utils.book_append_sheet(wb, styledSheet([[{ v: 'Chưa có dữ liệu tháng nào cho đồng hồ này.', s: ST.label }]], [50]), 'Trong')
  }
  download(wb, `dien-nuoc_${label}_${month}.xlsx`)
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
      [`Trạng thái (${month})`]: !c.active ? 'Ngừng' : isActiveInMonth(c, month) ? 'Có thu' : 'Không thu',
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
