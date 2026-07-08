'use client'
// ── Xuất Excel cho module Điện nước SA.ĐT ────────────────────────────────────
// Mỗi tab có 1 hàm export riêng, dựng workbook từ dữ liệu đã tải sẵn ở client
// (Firestore subscriptions) rồi tải xuống trực tiếp — không cần gọi API.
import * as XLSX from 'xlsx'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, BandKey,
  BAND_KEYS, BAND_LABELS, METER_UNIT, meterLabel,
  meterSubtotal, meterVat, meterTotal, meterAllocation,
  resolvePrice, resolveTimebandPoint, usageKwh, computeBqt, isActiveInMonth,
  CHARGE_TYPE_LABELS, DEFAULT_BQT_RATIO,
  FloorBandKey, normalizeFloor, floorBandKwh, floorTotalKwh,
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

// ── Tab: Đồng hồ (Nhập chỉ số) — 1 file/đồng hồ ──────────────────────────────
export function exportMeter(
  meterId: MeterId, month: string,
  readings: MeterReading[], customers: Customer[], usages: CustomerUsage[],
  meterNames: Record<number, string>,
) {
  const label = meterLabel(meterNames, meterId)
  const unit = METER_UNIT[meterId]
  const isWater = meterId === 3
  const visibleBands: BandKey[] = isWater ? ['toanThoiGian'] : BAND_KEYS
  const wb = XLSX.utils.book_new()

  // Sheet 1 — Chỉ số tháng hiện tại (Bảng 1)
  const cur = readings.find(r => r.meterId === meterId && r.month === month)
  const s1: Aoa = [[`Chỉ số ${label} — tháng ${month}`], []]
  s1.push(['Khung giờ', `Sản lượng (${unit})`, 'Đơn giá (đ)', 'Thành tiền (đ)'])
  if (cur) {
    for (const k of visibleBands) {
      s1.push([isWater ? 'Sử dụng trong tháng' : BAND_LABELS[k], r2(cur.bands[k].kwh), cur.bands[k].donGia, r0(cur.bands[k].kwh * cur.bands[k].donGia)])
    }
    s1.push(['Tổng tiền chưa VAT', '', '', r0(meterSubtotal(cur.bands))])
    s1.push([`Thuế VAT (${cur.vatPercent || 0}%)`, '', '', r0(meterVat(cur.bands, cur.vatPercent))])
    s1.push(['Tổng thanh toán', '', '', r0(meterTotal(cur.bands, cur.vatPercent))])
    if (cur.note) s1.push([], ['Ghi chú:', cur.note])
  } else {
    s1.push(['(Chưa nhập chỉ số tháng này)'])
  }
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(s1, [26, 16, 16, 18], [2]), safeSheetName(`Chi so ${month}`))

  // Sheet 2 — Lịch sử 12 tháng (Bảng 2)
  const months = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
  const header: Cell[] = ['Tháng']
  for (const k of visibleBands) header.push(isWater ? `Sản lượng (${unit})` : `${BAND_LABELS[k]} SL`, isWater ? 'Đơn giá' : `${BAND_LABELS[k]} giá`)
  header.push('Tổng chưa VAT', 'VAT', 'Tổng thanh toán')
  const s2: Aoa = [header]
  for (const r of months) {
    const row: Cell[] = [r.month]
    for (const k of visibleBands) row.push(r2(r.bands[k].kwh), r.bands[k].donGia)
    row.push(r0(meterSubtotal(r.bands)), r0(meterVat(r.bands, r.vatPercent)), r0(meterTotal(r.bands, r.vatPercent)))
    s2.push(row)
  }
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(s2, header.map((_, i) => i === 0 ? 10 : 15), [0]), 'Lich su 12 thang')

  // Sheet 3 — Sản lượng & tiền khách hàng tháng hiện tại
  if (cur) {
    const alloc = meterAllocation(cur, customers, usages)
    const usageByCustomer = new Map(usages.filter(u => u.month === month).map(u => [u.customerId, u]))
    const rows: Row[] = alloc.rows.map(({ customer: c, amount }) => ({
      'Khách hàng':    c.name,
      'Nhóm':          c.group?.trim() || '',
      'Tầng':          c.floor || '',
      'Mã ki-ốt':      c.kioskCode || '',
      'Cách tính tiền': CHARGE_TYPE_LABELS[c.chargeType],
      [`Sản lượng (${unit})`]: c.chargeType === 'remainder' ? '' : r2(usageKwh(c, usageByCustomer.get(c.id))),
      'Thành tiền (đ)': r0(amount),
    }))
    if (rows.length === 0) rows.push({ 'Khách hàng': '(Chưa có khách hàng gán cho đồng hồ này)' } as Row)
    XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, [26, 18, 12, 12, 26, 16, 18]), safeSheetName(`Khach hang ${month}`))
  }

  // Sheet 3b — Chi tiết sản lượng từng khách theo TỪNG THÁNG (chỉ số cũ/mới, sản lượng, tiền)
  {
    const isElec = meterId !== 3
    const bandCols: [BandKey, string][] = [['caoDiem', 'CĐ'], ['thapDiem', 'TĐ'], ['binhThuong', 'BT']]
    const cmp = { numeric: true, sensitivity: 'base' } as const
    const mCustomers = customers.filter(c => c.meterId === meterId && c.active).sort((a, b) =>
      (a.floor?.trim() || '').localeCompare(b.floor?.trim() || '', 'vi', cmp)
      || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', cmp)
      || a.name.localeCompare(b.name, 'vi', cmp))
    const dMonths = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
      .sort((a, b) => a.month.localeCompare(b.month))
    // Tiền từng tháng lấy qua meterAllocation để đúng cả khách "gánh phần còn lại"
    const amtByMonth = new Map(dMonths.map(r => [r.month, new Map(meterAllocation(r, customers, usages).rows.map(x => [x.customer.id, x.amount]))]))
    const usageOf = (cid: string, m: string) => usages.find(u => u.customerId === cid && u.month === m)

    const header: Cell[] = ['Khách hàng', 'Nhóm', 'Tầng', 'Mã ki-ốt', 'Cách tính tiền', 'Tháng', 'Chỉ số cũ', 'Chỉ số mới']
    if (isElec) bandCols.forEach(([, lb]) => header.push(`${lb} cũ`, `${lb} mới`))
    header.push(`Sản lượng (${unit})`, 'Đơn giá (đ)', 'Thành tiền (đ)')

    const detail: Aoa = [header]
    for (const c of mCustomers) {
      for (const r of dMonths) {
        const u = usageOf(c.id, r.month)
        const amount = amtByMonth.get(r.month)?.get(c.id) ?? 0
        const row: Cell[] = [c.name, c.group?.trim() || '', c.floor || '', c.kioskCode || '', CHARGE_TYPE_LABELS[c.chargeType], r.month]
        row.push(c.chargeType === 'flat_vat_incl' ? (u?.indexOld ?? '') : '', c.chargeType === 'flat_vat_incl' ? (u?.indexNew ?? '') : '')
        if (isElec) bandCols.forEach(([k]) => {
          if (c.chargeType === 'timeband_excl_vat') row.push(u?.bandsIndexOld?.[k] ?? '', u?.bandsIndexNew?.[k] ?? '')
          else row.push('', '')
        })
        const sl: Cell = (c.chargeType === 'flat_vat_incl' || c.chargeType === 'timeband_excl_vat') ? r2(usageKwh(c, u)) : ''
        const dg: Cell = c.chargeType === 'flat_vat_incl' ? resolvePrice(c.flatPriceHistory, c.flatUnitPrice, r.month)
          : c.chargeType === 'fixed_area' ? resolvePrice(c.areaPriceHistory, c.pricePerM2, r.month) : ''
        row.push(sl, dg, r0(amount))
        detail.push(row)
      }
    }
    if (mCustomers.length && dMonths.length) {
      XLSX.utils.book_append_sheet(wb, sheetFromAoa(detail, header.map((_, i) => i === 0 ? 24 : i < 6 ? 14 : 12), [0]), 'Chi tiet SL theo thang')
    }
  }

  // Sheet 4 & 5 — chỉ đồng hồ 1: BQT
  if (meterId === 1 && cur) {
    const calc = computeBqt(cur, customers, usages, cur.bqtRatio ?? DEFAULT_BQT_RATIO)
    const sb: Aoa = [[`Tính tiền điện Ban quản trị (BQT) — tháng ${month}`], []]
    sb.push(['Khu (Nhóm KH)', `Ghi tầng (${'kWh'})`, 'Khách dùng (kWh)', 'BQT (kWh)'])
    calc.floors.forEach(f => sb.push([f.group, r2(f.floorKwh), r2(f.customerKwh), r2(f.bqtKwh)]))
    sb.push([])
    sb.push(['Tổng ghi các tầng (kWh)', r2(calc.sumFloorKwh)])
    sb.push(['Đồng hồ chính C+T+B (kWh)', r2(calc.mainMeterKwh)])
    sb.push(['Chênh lệch → BQT (kWh)', r2(calc.discrepancy)])
    sb.push(['Tổng kWh BQT phải chịu', r2(calc.bqtTotalKwh)])
    sb.push([])
    sb.push(['Khung giờ', 'Tỷ lệ %', 'kWh', 'Đơn giá (đ)', 'Thành tiền (đ)'])
    calc.bands.forEach(b => sb.push([BAND_LABELS[b.key], b.ratioPct, r2(b.kwh), b.price, r0(b.amount)]))
    sb.push(['Tổng chưa VAT', '', '', '', r0(calc.subtotal)])
    sb.push([`VAT (${cur.vatPercent || 0}%)`, '', '', '', r0(calc.vat)])
    sb.push(['Tổng thanh toán BQT', '', '', '', r0(calc.total)])
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(sb, [26, 14, 16, 14, 18], [2]), safeSheetName(`BQT ${month}`))

    // Lịch sử BQT 12 tháng
    const m1 = readings.filter(r => r.meterId === 1).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
      .sort((a, b) => a.month.localeCompare(b.month))
    const hb: Aoa = [['Tháng', 'Tổng ghi tầng (kWh)', 'Đồng hồ chính (kWh)', 'Chênh lệch (kWh)', 'Tổng kWh BQT', 'Chưa VAT', 'VAT', 'Tổng TT BQT']]
    m1.forEach(r => {
      const c = computeBqt(r, customers, usages, r.bqtRatio ?? DEFAULT_BQT_RATIO)
      hb.push([r.month, r2(c.sumFloorKwh), r2(c.mainMeterKwh), r2(c.discrepancy), r2(c.bqtTotalKwh), r0(c.subtotal), r0(c.vat), r0(c.total)])
    })
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(hb, [10, 18, 18, 16, 14, 14, 12, 16], [0]), 'BQT lich su')

    // Sheet 6 — Chỉ số ghi điện TỪNG TẦNG theo tháng: số đầu/số cuối × từng khung giờ
    const fMonths = readings.filter(r => r.meterId === 1).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
      .sort((a, b) => a.month.localeCompare(b.month))
    const perMonth = fMonths.map(r => ({ month: r.month, floors: (r.floorReadings ?? []).map(normalizeFloor) }))
    const groupOrder: string[] = []
    perMonth.forEach(mf => mf.floors.forEach(f => { const g = (f.group || '').trim(); if (g && !groupOrder.includes(g)) groupOrder.push(g) }))
    if (groupOrder.length) {
      const bandCols: [FloorBandKey, string][] = [['caoDiem', 'CĐ'], ['thapDiem', 'TĐ'], ['binhThuong', 'BT']]
      const fh: Cell[] = ['Tầng (khu)', 'Tháng']
      bandCols.forEach(([, lb]) => fh.push(`${lb} số đầu`, `${lb} số cuối`, `${lb} kWh`))
      fh.push('Tổng kWh tầng')
      const fa: Aoa = [fh]
      for (const g of groupOrder) {
        for (const mf of perMonth) {
          const f = mf.floors.find(x => (x.group || '').trim() === g)
          const row: Cell[] = [g, mf.month]
          bandCols.forEach(([k]) => {
            const b = f?.bands[k]
            row.push(b?.indexOld ?? '', b?.indexNew ?? '', b ? r2(floorBandKwh(b)) : 0)
          })
          row.push(f ? r2(floorTotalKwh(f)) : 0)
          fa.push(row)
        }
      }
      XLSX.utils.book_append_sheet(wb, sheetFromAoa(fa, fh.map((_, i) => i === 0 ? 20 : i === 1 ? 10 : 11), [0]), 'Ghi dien tung tang')
    }
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
  const totalDue = allRows.reduce((s, r) => s + r.amount, 0)
  const totalPaid = allRows.reduce((s, r) => s + paidOf(r.customer.id), 0)

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
    'Đồng hồ':        meterLabel(meterNames, c.meterId),
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

// ── Tab: Công nợ & Thu tiền ──────────────────────────────────────────────────
export function exportCongNo(
  readings: MeterReading[], customers: Customer[], usages: CustomerUsage[], payments: Payment[],
  month: string, meterNames: Record<number, string>,
) {
  const monthReadings = readings.filter(r => r.month === month)
  const paidOf = (cid: string) => payments.filter(p => p.customerId === cid && p.month === month).reduce((s, p) => s + p.amount, 0)
  const wb = XLSX.utils.book_new()

  // Sheet 1 — Tổng hợp theo nhóm
  const allRows = monthReadings.flatMap(r => meterAllocation(r, customers, usages).rows)
  const groups = new Map<string, { due: number; paid: number; count: number }>()
  for (const r of allRows) {
    const g = r.customer.group?.trim() || 'Chưa phân nhóm'
    const cur = groups.get(g) ?? { due: 0, paid: 0, count: 0 }
    cur.due += r.amount; cur.paid += paidOf(r.customer.id); cur.count += 1
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
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, [26, 26, 18, 16, 16, 16]), safeSheetName(`Chi tiet ${month}`))

  download(wb, `dien-nuoc_cong-no_${month}.xlsx`)
}
