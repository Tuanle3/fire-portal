'use client'

/**
 * ke-hoach-dong-tien-excel-export.ts
 * ─────────────────────────────────────────────────────────────
 * Xuất Excel cho Tab "Kế hoạch dòng tiền" (gộp Ngắn hạn + Dài hạn) —
 * dùng để đại ca copy thẳng vào file kế hoạch dòng tiền chung của SAG.
 *
 * 3 sheet:
 *   1. "Chi tiết"              — 1 dòng / 1 kỳ thu-trả, đủ thông tin
 *   2. "Tổng hợp theo tháng"   — pivot theo tháng (để nhìn dòng tiền ra
 *                                 theo thời gian)
 *   3. "Tổng hợp theo NH"      — pivot theo ngân hàng (để cân đối hạn
 *                                 mức / quan hệ tín dụng từng NH)
 * ─────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx'

export interface DongTienRow {
  ngay:        string          // ISO date — ngày thu/trả kế hoạch
  loaiVay:     'Ngắn hạn' | 'Dài hạn'
  entity:      string          // pháp nhân
  nganHang:    string
  chiNhanh?:   string
  soHopDong:   string          // số hợp đồng
  soBoHoSo?:   string          // số bộ hồ sơ giải ngân (nếu có)
  loaiKy:      string          // 'Gốc + Lãi' | 'Lãi' | 'Gốc'
  goc:         number
  lai:         number
  tong:        number
  trangThai:   string
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' })
}

function safeSheetName(name: string, usedNames: Set<string>): string {
  let base = (name || 'Sheet').replace(/[:\\/?*\[\]]/g, '-').trim().slice(0, 31) || 'Sheet'
  let final = base
  let i = 2
  while (usedNames.has(final)) {
    const suffix = `-${i}`
    final = base.slice(0, 31 - suffix.length) + suffix
    i++
  }
  usedNames.add(final)
  return final
}

function autoWidth(aoa: (string | number | null | undefined)[][]): { wch: number }[] {
  const widths: number[] = []
  aoa.forEach(row => {
    row.forEach((cell, i) => {
      const len = cell == null ? 0 : String(cell).length
      widths[i] = Math.max(widths[i] ?? 8, Math.min(len + 2, 42))
    })
  })
  return widths.map(w => ({ wch: w }))
}

function sheetFromAoa(aoa: (string | number | null | undefined)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = autoWidth(aoa)
  return ws
}

const todayFile = () => new Date().toISOString().slice(0, 10)

/** Cột có thể ẩn/hiện ở màn hình (khớp ColKey của LichDongTienTongHop) */
export type ExportColKey = 'ngay' | 'loaiVay' | 'phapNhan' | 'nganHang' | 'soHopDong' | 'soBoHoSo' | 'loaiKy' | 'goc' | 'lai' | 'tong' | 'trangThai'

export interface ExportOpts {
  /** Dòng của sheet "Chi tiết" — đúng như bảng đang hiển thị (đã gộp theo cột đang hiện). Không có → dùng rows */
  detailRows?: DongTienRow[]
  /** Các cột đang bật ở nút "Cột hiển thị". Không có → xuất đủ cột */
  cols?: Set<ExportColKey>
  /** Nhóm theo (ô "Sắp xếp / nhóm theo"). 'ngay' hoặc không có → không nhóm */
  groupBy?: 'ngay' | 'loai-vay' | 'ngan-hang' | 'phap-nhan'
  /** Mô tả bộ lọc đang chọn, in ở dòng đầu sheet Chi tiết */
  locText?: string
}

export function exportKeHoachDongTienExcel(
  rows: DongTienRow[],
  tuThang: string,
  denThang: string,
  opts: ExportOpts = {},
) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  // ── Sheet 1: Chi tiết — theo đúng cột / gộp dòng / nhóm đang chọn ──
  const detail = opts.detailRows ?? rows
  const has = (k: ExportColKey) => !opts.cols || opts.cols.has(k)
  type ColX = { key: ExportColKey; head: string; get: (r: DongTienRow) => string | number }
  const ALL: ColX[] = [
    { key: 'ngay',      head: 'Ngày',         get: r => r.ngay },
    { key: 'loaiVay',   head: 'Loại vay',     get: r => r.loaiVay },
    { key: 'phapNhan',  head: 'Pháp nhân',    get: r => r.entity },
    { key: 'nganHang',  head: 'Ngân hàng',    get: r => r.nganHang },
    { key: 'soHopDong', head: 'Số hợp đồng',  get: r => r.soHopDong },
    { key: 'soBoHoSo',  head: 'Số bộ hồ sơ',  get: r => r.soBoHoSo || '' },
    { key: 'loaiKy',    head: 'Loại kỳ',      get: r => r.loaiKy },
    { key: 'goc',       head: 'Gốc',          get: r => r.goc },
    { key: 'lai',       head: 'Lãi',          get: r => r.lai },
    { key: 'tong',      head: 'Tổng',         get: r => r.tong },
    { key: 'trangThai', head: 'Trạng thái',   get: r => r.trangThai },
  ]
  const cols = ALL.filter(c => has(c.key))
  const idx  = (k: ExportColKey) => cols.findIndex(c => c.key === k)
  const nC   = cols.length

  const keyOf = (r: DongTienRow) =>
    opts.groupBy === 'loai-vay' ? r.loaiVay
    : opts.groupBy === 'ngan-hang' ? r.nganHang
    : opts.groupBy === 'phap-nhan' ? r.entity : ''
  const grouped = !!opts.groupBy && opts.groupBy !== 'ngay'

  const sumLine = (label: string, list: DongTienRow[]) => {
    const line: (string | number)[] = Array(nC).fill('')
    line[0] = label
    if (idx('goc')  >= 0) line[idx('goc')]  = list.reduce((t, r) => t + r.goc, 0)
    if (idx('lai')  >= 0) line[idx('lai')]  = list.reduce((t, r) => t + r.lai, 0)
    if (idx('tong') >= 0) line[idx('tong')] = list.reduce((t, r) => t + r.tong, 0)
    return line
  }

  const sortedDetail = [...detail].sort((a, b) =>
    (grouped ? keyOf(a).localeCompare(keyOf(b), 'vi') : 0) || a.ngay.localeCompare(b.ngay))

  const body: (string | number)[][] = []
  if (grouped) {
    const order: string[] = []
    const mp = new Map<string, DongTienRow[]>()
    sortedDetail.forEach(r => {
      const k = keyOf(r)
      if (!mp.has(k)) { mp.set(k, []); order.push(k) }
      mp.get(k)!.push(r)
    })
    order.forEach(k => {
      const list = mp.get(k)!
      body.push(sumLine(`▸ ${k} (${list.length})`, list))
      list.forEach(r => body.push(cols.map(c => c.get(r))))
    })
  } else {
    sortedDetail.forEach(r => body.push(cols.map(c => c.get(r))))
  }
  body.push(sumLine('TỔNG CỘNG', detail))

  const top: (string | number)[][] = opts.locText ? [[opts.locText, ...Array(Math.max(nC - 1, 0)).fill('')], []] : []
  const sheet1 = sheetFromAoa([...top, cols.map(c => c.head), ...body])
  if (opts.locText && nC > 1) sheet1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nC - 1 } }]
  XLSX.utils.book_append_sheet(wb, sheet1, safeSheetName('Chi tiết', used))

  // ── Sheet 2: Tổng hợp theo tháng ─────────────────────────────
  const byMonth: Record<string, { goc: number; lai: number; tong: number; soKy: number }> = {}
  rows.forEach(r => {
    const m = r.ngay.slice(0, 7)
    const b = byMonth[m] ?? (byMonth[m] = { goc: 0, lai: 0, tong: 0, soKy: 0 })
    b.goc += r.goc; b.lai += r.lai; b.tong += r.tong; b.soKy++
  })
  const monthHeader = ['Tháng', 'Số kỳ', 'Gốc', 'Lãi', 'Tổng']
  const monthRows = Object.keys(byMonth).sort().map(m => {
    const b = byMonth[m]
    return [m, b.soKy, b.goc, b.lai, b.tong]
  })
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([monthHeader, ...monthRows]), safeSheetName('Tổng hợp theo tháng', used))

  // ── Sheet 3: Tổng hợp theo ngân hàng ─────────────────────────
  const byBank: Record<string, { goc: number; lai: number; tong: number; soKy: number }> = {}
  rows.forEach(r => {
    const b = byBank[r.nganHang] ?? (byBank[r.nganHang] = { goc: 0, lai: 0, tong: 0, soKy: 0 })
    b.goc += r.goc; b.lai += r.lai; b.tong += r.tong; b.soKy++
  })
  const bankHeader = ['Ngân hàng', 'Số kỳ', 'Gốc', 'Lãi', 'Tổng']
  const bankRows = Object.keys(byBank).sort((a, b) => a.localeCompare(b, 'vi')).map(nh => {
    const b = byBank[nh]
    return [nh, b.soKy, b.goc, b.lai, b.tong]
  })
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([bankHeader, ...bankRows]), safeSheetName('Tổng hợp theo NH', used))

  downloadWorkbook(wb, `Ke-hoach-dong-tien_${tuThang}_${denThang}_${todayFile()}.xlsx`)
}
