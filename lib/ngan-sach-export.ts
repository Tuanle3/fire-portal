import ExcelJS from 'exceljs'
import type { NganSachThang, NganSachItem, GiaiPhap } from '@/lib/ngan-sach-types'

export async function exportNganSachExcel(
  data: NganSachThang,
  tonQuySoDu: number,
  kmcpActual: Record<string, number>,
  thangLabel: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`Kế hoạch ${thangLabel}`)

  sheet.columns = [
    { key: 'stt',    width: 8  },
    { key: 'dg',     width: 45 },
    { key: 'kmcp',   width: 14 },
    { key: 'kh',     width: 20 },
    { key: 'th',     width: 20 },
    { key: 'con',    width: 20 },
    { key: 'ghi',    width: 30 },
  ]

  const COLS = 7

  function mergeRow(row: ExcelJS.Row) {
    sheet.mergeCells(row.number, 1, row.number, COLS)
  }

  function applyBorder(row: ExcelJS.Row, style: ExcelJS.BorderStyle = 'thin') {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > COLS) return
      cell.border = {
        top:    { style },
        left:   { style },
        bottom: { style },
        right:  { style },
      }
    })
  }

  function numFmt(cell: ExcelJS.Cell) {
    cell.numFmt = '#,##0'
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }

  function colorCell(cell: ExcelJS.Cell, val: number) {
    cell.font = {
      ...(cell.font as ExcelJS.Font ?? {}),
      color: { argb: val >= 0 ? 'FF166534' : 'FF991B1B' },
    }
  }

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  const r1 = sheet.addRow([`KẾ HOẠCH DÒNG TIỀN ${thangLabel}`])
  r1.height = 40
  mergeRow(r1)
  const c1 = r1.getCell(1)
  c1.font  = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  c1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C3557' } }
  c1.alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 2: Subtitle ───────────────────────────────────────────────────────
  const r2 = sheet.addRow([`Sơn An Group — cập nhật ${data.ngay_cap_nhat}`])
  r2.height = 20
  mergeRow(r2)
  const c2 = r2.getCell(1)
  c2.font  = { italic: true, size: 10, color: { argb: 'FF6B7280' } }
  c2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
  c2.alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 3: Spacer ─────────────────────────────────────────────────────────
  const r3 = sheet.addRow([])
  r3.height = 8

  // ── Row 4: Headers ────────────────────────────────────────────────────────
  const HEADERS = ['STT', 'Diễn giải', 'KMCP', `${thangLabel} (KH)`, 'Đã thực hiện', 'Còn phải TH', 'Ghi chú']
  const r4 = sheet.addRow(HEADERS)
  r4.height = 30
  r4.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > COLS) return
    cell.font      = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C3557' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border    = {
      top:    { style: 'medium' },
      left:   { style: 'thin'   },
      bottom: { style: 'medium' },
      right:  { style: 'thin'   },
    }
  })

  // ── Totals computation ────────────────────────────────────────────────────
  const groupTotals = new Map<string, { kh: number; th: number }>()
  for (const it of data.items) {
    if (!it.parent_id) continue
    if (!groupTotals.has(it.parent_id)) groupTotals.set(it.parent_id, { kh: 0, th: 0 })
    const g = groupTotals.get(it.parent_id)!
    g.kh += it.ke_hoach
    const autoVal = it.kmcp ? kmcpActual[it.kmcp] : undefined
    g.th += autoVal !== undefined ? autoVal : it.thuc_hien
  }

  let B_kh = 0, B_th = 0, C_kh = 0, C_th = 0
  for (const it of data.items) {
    if (it.is_section || it.is_group || it.parent_id) continue
    const autoVal = it.kmcp ? kmcpActual[it.kmcp] : undefined
    const th = autoVal !== undefined ? autoVal : it.thuc_hien
    if (it.nhom === 'B') { B_kh += it.ke_hoach; B_th += th }
    if (it.nhom === 'C') { C_kh += it.ke_hoach; C_th += th }
  }
  for (const it of data.items) {
    if (!it.is_group) continue
    const gt = groupTotals.get(it.id) ?? { kh: 0, th: 0 }
    if (it.nhom === 'B') { B_kh += gt.kh; B_th += gt.th }
    if (it.nhom === 'C') { C_kh += gt.kh; C_th += gt.th }
  }
  const D_kh = tonQuySoDu + B_kh - C_kh
  const D_th = tonQuySoDu + B_th - C_th

  const sectionTotals: Record<string, { kh: number; th: number }> = {
    A: { kh: 0, th: tonQuySoDu },
    B: { kh: B_kh, th: B_th },
    C: { kh: C_kh, th: C_th },
    D: { kh: D_kh, th: D_th },
  }

  const sectionBg: Record<string, string> = {
    A: 'FFECFDF5',
    B: 'FFEFF6FF',
    C: 'FFFFF7ED',
    D: 'FFFEF3C7',
  }

  const groupBg: Record<string, string> = {
    B: 'FFDBEAFE',
    C: 'FFFFEDD5',
  }

  // ── Data rows ─────────────────────────────────────────────────────────────
  let detailIndex = 0

  for (const it of data.items) {
    if (it.is_section) {
      const tot = sectionTotals[it.nhom] ?? { kh: 0, th: 0 }
      const con = tot.kh - tot.th
      const thLabel = it.nhom === 'A' ? tot.th : tot.th
      const thDisplay = it.nhom === 'A' ? `${tot.th} (AUTO)` : tot.th

      const row = sheet.addRow([it.nhom, it.dien_giai, '', tot.kh, it.nhom === 'A' ? thDisplay : tot.th, con, ''])
      row.height = 28
      const bg = sectionBg[it.nhom] ?? 'FFF3F4F6'
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > COLS) return
        cell.font = { bold: true, size: 12 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.alignment = { vertical: 'middle' }
      })

      const khCell  = row.getCell(4)
      const thCell  = row.getCell(5)
      const conCell = row.getCell(6)

      if (it.nhom === 'A') {
        thCell.value = tot.th
        thCell.numFmt = '#,##0'
        thCell.alignment = { horizontal: 'right', vertical: 'middle' }
        // Append "(AUTO)" as rich text isn't trivially supported; just format as number + note
        thCell.note = '(AUTO) — lấy từ tồn quỹ số dư'
      } else {
        numFmt(thCell)
      }
      numFmt(khCell)
      numFmt(conCell)
      colorCell(conCell, con)
      applyBorder(row)

    } else if (it.is_group) {
      const gt  = groupTotals.get(it.id) ?? { kh: 0, th: 0 }
      const con = gt.kh - gt.th
      const bg  = groupBg[it.nhom] ?? 'FFF3F4F6'

      const row = sheet.addRow([it.stt, `  ${it.stt} ${it.dien_giai}`, it.kmcp, gt.kh, gt.th, con, it.ghi_chu])
      row.height = 24
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > COLS) return
        cell.font = { bold: true, size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.alignment = { vertical: 'middle' }
      })
      numFmt(row.getCell(4))
      numFmt(row.getCell(5))
      numFmt(row.getCell(6))
      colorCell(row.getCell(6), con)
      applyBorder(row)

    } else {
      const autoVal = it.kmcp ? kmcpActual[it.kmcp] : undefined
      const th  = autoVal !== undefined ? autoVal : it.thuc_hien
      const con = it.ke_hoach - th
      const dg  = it.parent_id ? `    └ ${it.dien_giai}` : `  ${it.dien_giai}`
      const bg  = detailIndex % 2 === 1 ? 'FFFAFAFA' : 'FFFFFFFF'
      detailIndex++

      const row = sheet.addRow([it.stt, dg, it.kmcp, it.ke_hoach, th, con, it.ghi_chu])
      row.height = 20
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > COLS) return
        cell.font = { size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.alignment = { vertical: 'middle' }
      })
      numFmt(row.getCell(4))
      numFmt(row.getCell(5))
      numFmt(row.getCell(6))
      colorCell(row.getCell(6), con)
      applyBorder(row)
    }
  }

  // ── Spacer ────────────────────────────────────────────────────────────────
  sheet.addRow([])

  // ── Section E: Giải pháp cân đối ─────────────────────────────────────────
  const gpKH = data.giai_phap.reduce((s, g) => s + g.so_tien_ke_hoach, 0)
  const gpTH = data.giai_phap.reduce((s, g) => s + g.so_tien_thuc_hien, 0)
  const gpCon = gpKH - gpTH

  const rE = sheet.addRow(['E', 'GIẢI PHÁP CÂN ĐỐI', '', gpKH, gpTH, gpCon, ''])
  rE.height = 28
  rE.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > COLS) return
    cell.font = { bold: true, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }
    cell.alignment = { vertical: 'middle' }
  })
  numFmt(rE.getCell(4))
  numFmt(rE.getCell(5))
  numFmt(rE.getCell(6))
  colorCell(rE.getCell(6), gpCon)
  applyBorder(rE)

  const trangThaiBg: Record<GiaiPhap['trang_thai'], string> = {
    yes:     'FFD1FAE5',
    no:      'FFFEE2E2',
    pending: 'FFFEF9C3',
  }

  for (const gp of data.giai_phap) {
    const con = gp.so_tien_ke_hoach - gp.so_tien_thuc_hien
    const row = sheet.addRow(['', gp.mo_ta, '', gp.so_tien_ke_hoach, gp.so_tien_thuc_hien, con, gp.ghi_chu])
    row.height = 20
    const bg = trangThaiBg[gp.trang_thai]
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > COLS) return
      cell.font = { size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.alignment = { vertical: 'middle' }
    })
    numFmt(row.getCell(4))
    numFmt(row.getCell(5))
    numFmt(row.getCell(6))
    colorCell(row.getCell(6), con)
    applyBorder(row)
  }

  // ── Spacer ────────────────────────────────────────────────────────────────
  sheet.addRow([])

  // ── Section F: Dòng tiền sau cân đối ─────────────────────────────────────
  const F_kh = D_kh + gpKH
  const F_th = D_th + gpTH
  const F_con = F_kh - F_th

  const rF = sheet.addRow(['F', 'DÒNG TIỀN SAU CÂN ĐỐI', '', F_kh, F_th, F_con, ''])
  rF.height = 28
  rF.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > COLS) return
    cell.font = { bold: true, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
    cell.alignment = { vertical: 'middle' }
  })
  numFmt(rF.getCell(4))
  numFmt(rF.getCell(5))
  numFmt(rF.getCell(6))
  colorCell(rF.getCell(6), F_con)
  applyBorder(rF)

  // ── Freeze panes ──────────────────────────────────────────────────────────
  sheet.views = [
    {
      state:        'frozen',
      xSplit:       1,
      ySplit:       4,
      topLeftCell:  'B5',
      activeCell:   'B5',
    },
  ]

  // ── Download ──────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = `ngan-sach-${thangLabel}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
