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
  soHopDong:   string          // số hợp đồng / bộ hồ sơ (đã gồm ghi chú khung nếu có)
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

export function exportKeHoachDongTienExcel(
  rows: DongTienRow[],
  tuThang: string,
  denThang: string,
) {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  // ── Sheet 1: Chi tiết ──────────────────────────────────────
  const header = [
    'Ngày', 'Loại vay', 'Pháp nhân', 'Ngân hàng', 'Chi nhánh',
    'Số hợp đồng / Bộ hồ sơ', 'Loại kỳ', 'Gốc', 'Lãi', 'Tổng', 'Trạng thái',
  ]
  const sorted = [...rows].sort((a, b) => a.ngay.localeCompare(b.ngay))
  const aoaRows: (string | number)[][] = sorted.map(r => [
    r.ngay, r.loaiVay, r.entity, r.nganHang, r.chiNhanh || '',
    r.soHopDong, r.loaiKy, r.goc, r.lai, r.tong, r.trangThai,
  ])
  const tongGoc  = rows.reduce((s, r) => s + r.goc, 0)
  const tongLai  = rows.reduce((s, r) => s + r.lai, 0)
  const tongCong = rows.reduce((s, r) => s + r.tong, 0)
  aoaRows.push(['', '', '', '', '', '', 'TỔNG CỘNG', tongGoc, tongLai, tongCong, ''])
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([header, ...aoaRows]), safeSheetName('Chi tiết', used))

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
