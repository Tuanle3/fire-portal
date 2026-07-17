import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { DEFAULT_ITEMS } from '@/lib/ngan-sach-types'

export const dynamic = 'force-dynamic'

// Section background colors (hex without #)
const BG: Record<string, string> = {
  A: 'D1FAE5', B: 'DBEAFE', C: 'FFEDD5', D: 'FEF3C7', E: 'D1FAE5',
}
const HEADER_BG = '1C3557'
const SECTION_FG = '1C3557'
const NOTE_BG = 'FFF9C4'

function cell(v: unknown, t: 'n' | 's' | 'b' = 's'): XLSX.CellObject {
  return { v, t } as XLSX.CellObject
}

export async function GET() {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Kế hoạch ──────────────────────────────────────────────────────
  // Columns: A=STT B=DienGiai C=KMCP D=KeHoach E=ThucHien F=GhiChu
  const wsData: (XLSX.CellObject | undefined)[][] = []

  // Row 0: title
  wsData.push([
    cell('KẾ HOẠCH DÒNG TIỀN - NHẬP DỮ LIỆU'),
    undefined, undefined, undefined, undefined, undefined,
  ])
  // Row 1: header
  wsData.push([
    cell('STT'), cell('Diễn giải'), cell('KMCP'),
    cell('Kế hoạch (₫)'), cell('Thực hiện (₫)'), cell('Ghi chú'),
  ])

  // Rows 2+: data
  for (const it of DEFAULT_ITEMS) {
    if (it.is_section) {
      wsData.push([
        cell(it.stt), cell(it.dien_giai), cell(''),
        cell(0, 'n'), cell(0, 'n'), cell(it.ghi_chu),
      ])
    } else {
      wsData.push([
        cell(it.stt), cell(it.dien_giai), cell(it.kmcp),
        cell(0, 'n'), cell(0, 'n'), cell(it.ghi_chu),
      ])
    }
  }

  // Add a few blank item rows for custom entries
  for (let i = 0; i < 5; i++) {
    wsData.push([cell(''), cell(''), cell(''), cell(0, 'n'), cell(0, 'n'), cell('')])
  }

  const ws: XLSX.WorkSheet = {}
  const totalRows = wsData.length
  const totalCols = 6

  // Write cells manually to apply styles
  wsData.forEach((row, R) => {
    row.forEach((cellObj, C) => {
      if (cellObj === undefined) return
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      ws[addr] = { ...cellObj }

      // Determine style
      let fill = 'FFFFFF'
      let bold = false
      let fontColor = '000000'
      let align: 'left' | 'center' | 'right' = 'left'
      let border = true

      if (R === 0) {
        // Title row
        fill = HEADER_BG; bold = true; fontColor = 'FFFFFF'; align = 'center'
        border = false
      } else if (R === 1) {
        // Header row
        fill = HEADER_BG; bold = true; fontColor = 'FFFFFF'; align = 'center'
      } else {
        const it = DEFAULT_ITEMS[R - 2]
        if (it) {
          if (it.is_section) {
            fill = BG[it.nhom] ?? 'F3F4F6'; bold = true; fontColor = SECTION_FG
          }
        }
        if (C === 0) align = 'center'
        if (C === 3 || C === 4) align = 'right'
      }

      ws[addr].s = {
        font: { bold, color: { rgb: fontColor }, name: 'Times New Roman', sz: 11 },
        fill: { patternType: 'solid', fgColor: { rgb: fill } },
        alignment: { horizontal: align, vertical: 'center', wrapText: C === 1 || C === 5 },
        border: border ? {
          top:    { style: 'thin', color: { rgb: 'D1D5DB' } },
          bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
          left:   { style: 'thin', color: { rgb: 'D1D5DB' } },
          right:  { style: 'thin', color: { rgb: 'D1D5DB' } },
        } : undefined,
      }
    })
  })

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: totalCols - 1 } })
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }]
  ws['!cols'] = [
    { wch: 6 },   // STT
    { wch: 40 },  // Diễn giải
    { wch: 12 },  // KMCP
    { wch: 20 },  // Kế hoạch
    { wch: 20 },  // Thực hiện
    { wch: 30 },  // Ghi chú
  ]
  ws['!rows'] = [{ hpt: 30 }, { hpt: 22 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Kế hoạch')

  // ── Sheet 2: Giải pháp ─────────────────────────────────────────────────────
  const ws2: XLSX.WorkSheet = {}
  const gpData: (XLSX.CellObject | undefined)[][] = [
    [cell('GIẢI PHÁP CÂN ĐỐI DÒNG TIỀN'), undefined, undefined, undefined, undefined],
    [
      cell('Trạng thái\n(yes/no/?)'),
      cell('Mô tả giải pháp'),
      cell('Số tiền kế hoạch (₫)'),
      cell('Đã thực hiện (₫)'),
      cell('Ghi chú / Tiến độ'),
    ],
    [cell('yes'), cell(''), cell(0, 'n'), cell(0, 'n'), cell('')],
    [cell('yes'), cell(''), cell(0, 'n'), cell(0, 'n'), cell('')],
    [cell('yes'), cell(''), cell(0, 'n'), cell(0, 'n'), cell('')],
    [cell('yes'), cell(''), cell(0, 'n'), cell(0, 'n'), cell('')],
    [cell('yes'), cell(''), cell(0, 'n'), cell(0, 'n'), cell('')],
  ]

  gpData.forEach((row, R) => {
    row.forEach((cellObj, C) => {
      if (!cellObj) return
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      ws2[addr] = { ...cellObj }
      let fill = 'FFFFFF', bold = false, fontColor = '000000'
      if (R === 0) { fill = HEADER_BG; bold = true; fontColor = 'FFFFFF' }
      else if (R === 1) { fill = HEADER_BG; bold = true; fontColor = 'FFFFFF' }
      ws2[addr].s = {
        font: { bold, color: { rgb: fontColor }, name: 'Times New Roman', sz: 11 },
        fill: { patternType: 'solid', fgColor: { rgb: fill } },
        alignment: { horizontal: C === 0 ? 'center' : C >= 2 ? 'right' : 'left', vertical: 'center', wrapText: true },
        border: {
          top:    { style: 'thin', color: { rgb: 'D1D5DB' } },
          bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
          left:   { style: 'thin', color: { rgb: 'D1D5DB' } },
          right:  { style: 'thin', color: { rgb: 'D1D5DB' } },
        },
      }
    })
  })

  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: gpData.length - 1, c: 4 } })
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]
  ws2['!cols'] = [{ wch: 14 }, { wch: 45 }, { wch: 22 }, { wch: 22 }, { wch: 40 }]
  ws2['!rows'] = [{ hpt: 28 }, { hpt: 36 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Giải pháp')

  // ── Sheet 3: Hướng dẫn ─────────────────────────────────────────────────────
  const ws3 = XLSX.utils.aoa_to_sheet([
    ['HƯỚNG DẪN NHẬP LIỆU'],
    [''],
    ['Sheet "Kế hoạch"'],
    ['• Cột STT: Giữ nguyên hoặc tùy chỉnh số thứ tự'],
    ['• Cột Diễn giải: Tên khoản mục (có thể sửa)'],
    ['• Cột KMCP: Mã khoản mục (VD: CP-SH, CP-HC...)'],
    ['• Cột Kế hoạch (₫): Nhập số tiền kế hoạch (số nguyên, không dấu phẩy)'],
    ['• Cột Thực hiện (₫): Nhập số tiền đã thực hiện'],
    ['• Cột Ghi chú: Ghi chú thêm'],
    ['• Dòng section (A, B, C, D): Hệ thống tự tính tổng, không cần nhập'],
    [''],
    ['Sheet "Giải pháp"'],
    ['• Cột Trạng thái: Nhập yes (xác nhận) / no (bỏ qua) / ? (đang xem xét)'],
    ['• Cột Mô tả: Mô tả nguồn tiền bổ sung'],
    ['• Cột Số tiền kế hoạch: Số tiền dự kiến huy động'],
    ['• Cột Đã thực hiện: Số tiền đã nhận được'],
    ['• Cột Ghi chú: Tiến độ chi tiết (VD: Lần 3: 1,025,000,000đ)'],
    [''],
    ['LƯU Ý'],
    ['• Nhập số tiền dạng số nguyên (VD: 175466148, không phải 175,466,148)'],
    ['• Không xóa các dòng section (A, B, C, D) — hệ thống cần để nhận dạng'],
    ['• Sau khi nhập xong, dùng nút "Import Excel" trong ứng dụng để tải lên'],
  ])
  ws3['!cols'] = [{ wch: 80 }]
  if (ws3['A1']) ws3['A1'].s = { font: { bold: true, sz: 13, color: { rgb: HEADER_BG } } }
  XLSX.utils.book_append_sheet(wb, ws3, 'Hướng dẫn')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau-ngan-sach.xlsx"',
    },
  })
}
