import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, VerticalAlign, PageOrientation, BorderStyle, TableLayoutType,
  Footer, PageNumber,
} from 'docx'

// ── Kiểu dữ liệu (khớp với app/(authenticated)/data/page.tsx) ──────────────────
export type NhatKyUnit = 'đ' | 'tr' | 'tỷ'

export interface NhatKyRow {
  ngay: string    // đã format dd/mm/yyyy
  donVi: string
  nganHang: string
  soTk: string
  noiDung: string
  nhom: string
  loai: string    // 'Thu' | 'Chi' | ''
  soTienPS: number
  ton: number
}

export interface NhatKyWordInput {
  unit: NhatKyUnit
  printDate: string
  kyLabel: string        // "01/01/2026 – 03/08/2026"
  cuoiKyLabel: string    // "Tại 03/08/2026"
  filterLabel?: string   // "Đơn vị: SAP · Loại: Chi" ...
  fileTag: string        // dùng để đặt tên file, vd "2026-01-01_2026-08-03"
  rows: NhatKyRow[]
  totalRaw: number
  kpi: { thu: number; chi: number; rong: number }
  cuoiKy: number
}

// ── Màu & font (khớp bảng trên màn hình) ─────────────────────────────────────────
const NAVY = '1C3557'
const GREEN = '1F6B3D'
const GREEN_BG = 'EAF6EE'
const RED = '8C1F1F'
const RED_BG = 'FDECEC'
const MUTED = '6B7280'
const GREY = '9CA3AF'
const INK = '374151'
const ZEBRA = 'FAFBFC'
const FONT = 'Arial'

const PAGE_W = 15398 // A4 ngang, trừ lề 2 bên (twip)
const dxa = (pct: number) => Math.round(PAGE_W * pct / 100)

function txt(text: string, o: { size?: number; bold?: boolean; color?: string } = {}) {
  return new TextRun({ text, font: FONT, size: o.size ?? 18, bold: o.bold, color: o.color ?? INK })
}

function cell(opts: {
  runs: TextRun[]
  width: number
  align?: 'left' | 'right' | 'center'
  bg?: string
  columnSpan?: number
}) {
  const align =
    opts.align === 'right' ? AlignmentType.RIGHT
      : opts.align === 'center' ? AlignmentType.CENTER
        : AlignmentType.LEFT
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    columnSpan: opts.columnSpan,
    shading: opts.bg ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.bg } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: [new Paragraph({ alignment: align, children: opts.runs })],
  })
}

const spacer = (before = 260) => new Paragraph({ spacing: { before, after: 0 }, children: [] })

// ── Khối 4 thẻ KPI (Tổng thu / Tổng chi / Ròng / Số dư cuối kỳ) ────────────────
function kpiTable(
  kpi: { thu: number; chi: number; rong: number }, cuoiKy: number, cuoiKyLabel: string,
  unitLbl: string, fmtU: (v: number) => string, fmtUPS: (v: number) => string,
) {
  const W4 = dxa(25)
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'E5E0D8' }

  const card = (label: string, val: string, color: string, sub: string, width: number) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 140, bottom: 140, left: 160, right: 160 },
    children: [
      new Paragraph({ children: [txt(label, { bold: true, size: 13, color: MUTED })] }),
      new Paragraph({ spacing: { before: 60 }, children: [txt(val, { bold: true, size: 24, color })] }),
      new Paragraph({ spacing: { before: 30 }, children: [txt(sub, { size: 13, color: GREY })] }),
    ],
  })

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W4, W4, W4, PAGE_W - 3 * W4],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [new TableRow({
      children: [
        card('TỔNG THU', `${fmtU(kpi.thu)} ${unitLbl}`, GREEN, '', W4),
        card('TỔNG CHI', `${fmtU(kpi.chi)} ${unitLbl}`, RED, '', W4),
        card('RÒNG', `${fmtUPS(kpi.rong)} ${unitLbl}`, kpi.rong >= 0 ? GREEN : RED, kpi.rong >= 0 ? '▲ Thặng dư' : '▼ Thâm hụt', W4),
        card('SỐ DƯ CUỐI KỲ', `${fmtU(cuoiKy)} ${unitLbl}`, NAVY, cuoiKyLabel, PAGE_W - 3 * W4),
      ],
    })],
  })
}

// ── Bảng nhật ký giao dịch ─────────────────────────────────────────────────────
function journalTable(rows: NhatKyRow[], unitLbl: string, fmtU: (v: number) => string, fmtUPS: (v: number) => string) {
  const W = {
    idx: dxa(4), ngay: dxa(7), donvi: dxa(8), nganhang: dxa(8), sotk: dxa(9),
    noidung: dxa(27), nhom: dxa(13), loai: dxa(6), sotien: dxa(9), sodu: dxa(9),
  }
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' }

  const headRow = new TableRow({
    tableHeader: true,
    children: [
      cell({ runs: [txt('#', { bold: true, color: 'FFFFFF', size: 14 })], width: W.idx, align: 'center', bg: NAVY }),
      cell({ runs: [txt('NGÀY GD', { bold: true, color: 'FFFFFF', size: 14 })], width: W.ngay, align: 'left', bg: NAVY }),
      cell({ runs: [txt('ĐƠN VỊ', { bold: true, color: 'FFFFFF', size: 14 })], width: W.donvi, align: 'left', bg: NAVY }),
      cell({ runs: [txt('NGÂN HÀNG', { bold: true, color: 'FFFFFF', size: 14 })], width: W.nganhang, align: 'left', bg: NAVY }),
      cell({ runs: [txt('SỐ TK', { bold: true, color: 'FFFFFF', size: 14 })], width: W.sotk, align: 'left', bg: NAVY }),
      cell({ runs: [txt('NỘI DUNG', { bold: true, color: 'FFFFFF', size: 14 })], width: W.noidung, align: 'left', bg: NAVY }),
      cell({ runs: [txt('NHÓM GD', { bold: true, color: 'FFFFFF', size: 14 })], width: W.nhom, align: 'left', bg: NAVY }),
      cell({ runs: [txt('LOẠI', { bold: true, color: 'FFFFFF', size: 14 })], width: W.loai, align: 'center', bg: NAVY }),
      cell({ runs: [txt(`SỐ TIỀN (${unitLbl})`, { bold: true, color: 'FFFFFF', size: 14 })], width: W.sotien, align: 'right', bg: NAVY }),
      cell({ runs: [txt(`SỐ DƯ TK (${unitLbl})`, { bold: true, color: 'FFFFFF', size: 14 })], width: W.sodu, align: 'right', bg: NAVY }),
    ],
  })

  const dataRows: TableRow[] = []
  if (rows.length === 0) {
    dataRows.push(new TableRow({
      children: [cell({ runs: [txt('Không có dữ liệu phù hợp.', { color: GREY })], width: PAGE_W, align: 'center', columnSpan: 10 })],
    }))
  }

  rows.forEach((r, i) => {
    const pos = r.soTienPS > 0 || r.loai === 'Thu'
    const neg = r.soTienPS < 0 || r.loai === 'Chi'
    const amtColor = pos ? GREEN : neg ? RED : INK
    const loaiColor = r.loai === 'Thu' ? GREEN : r.loai === 'Chi' ? RED : GREY
    const loaiBg = r.loai === 'Thu' ? GREEN_BG : r.loai === 'Chi' ? RED_BG : undefined
    const zebra = i % 2 === 1 ? ZEBRA : undefined

    dataRows.push(new TableRow({
      children: [
        cell({ runs: [txt(String(i + 1), { color: GREY, size: 14 })], width: W.idx, align: 'center', bg: zebra }),
        cell({ runs: [txt(r.ngay, { size: 15 })], width: W.ngay, align: 'left', bg: zebra }),
        cell({ runs: [txt(r.donVi || '—', { size: 15 })], width: W.donvi, align: 'left', bg: zebra }),
        cell({ runs: [txt(r.nganHang || '—', { size: 15 })], width: W.nganhang, align: 'left', bg: zebra }),
        cell({ runs: [txt(r.soTk || '—', { color: MUTED, size: 14 })], width: W.sotk, align: 'left', bg: zebra }),
        cell({ runs: [txt(r.noiDung || '—', { size: 15 })], width: W.noidung, align: 'left', bg: zebra }),
        cell({ runs: [txt(r.nhom || '—', { color: MUTED, size: 14 })], width: W.nhom, align: 'left', bg: zebra }),
        cell({ runs: [txt(r.loai || '—', { bold: !!r.loai, color: loaiColor, size: 14 })], width: W.loai, align: 'center', bg: loaiBg ?? zebra }),
        cell({ runs: [txt(fmtUPS(r.soTienPS), { bold: true, color: amtColor, size: 15 })], width: W.sotien, align: 'right', bg: zebra }),
        cell({ runs: [txt(fmtU(r.ton), { size: 15 })], width: W.sodu, align: 'right', bg: zebra }),
      ],
    }))
  })

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W.idx, W.ngay, W.donvi, W.nganhang, W.sotk, W.noidung, W.nhom, W.loai, W.sotien, W.sodu],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [headRow, ...dataRows],
  })
}

// ── Ghép tài liệu ─────────────────────────────────────────────────────────────
export function buildNhatKyDoc(input: NhatKyWordInput): Document {
  const { unit, printDate, kyLabel, cuoiKyLabel, filterLabel, rows, totalRaw, kpi, cuoiKy } = input
  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmtU = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtUPS = (v: number) => (v === 0 ? '—' : (v > 0 ? '+' : '') + fmtU(v))

  const metaParts = [
    `Đơn vị tính: ${unitLbl}`,
    'Nguồn: Firebase Realtime Database',
    `Ngày in: ${printDate}`,
    `Kỳ: ${kyLabel}`,
  ]
  if (filterLabel) metaParts.push(`Bộ lọc: ${filterLabel}`)
  metaParts.push(`${rows.length.toLocaleString('vi-VN')} / ${totalRaw.toLocaleString('vi-VN')} giao dịch`)

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [txt('SONAN LAND', { bold: true, size: 16, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [txt('BÁO CÁO NHẬT KÝ DÒNG TIỀN', { bold: true, size: 30, color: NAVY })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
      children: [txt(metaParts.join(' · '), { size: 15, color: GREY })],
    }),
    kpiTable(kpi, cuoiKy, cuoiKyLabel, unitLbl, fmtU, fmtUPS),
    spacer(280),
    journalTable(rows, unitLbl, fmtU, fmtUPS),
  ]

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })],
    })],
  })

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      footers: { default: footer },
      children,
    }],
  })
}

export async function exportNhatKyWord(input: NhatKyWordInput): Promise<void> {
  const doc = buildNhatKyDoc(input)
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `NhatKyDongTien_${input.fileTag}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
