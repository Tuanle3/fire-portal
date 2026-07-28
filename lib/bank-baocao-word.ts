import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, VerticalAlign, BorderStyle, TableLayoutType,
  Footer, PageNumber,
} from 'docx'
import { BankRelation, BankProposal, BankNote, DANH_GIA_LABEL, TRANG_THAI_NH_LABEL, LOAI_VAY_LABEL, TRANG_THAI_PA_LABEL } from './bank-types'

// ── Màu & font (khớp bảng trên màn hình) ─────────────────────────────────────────
const NAVY = '1C3557'
const GREEN = '15803D'
const RED = 'DC2626'
const HEAD_BG = 'F5F8FC'
const GROUP_BG = 'EEF3FA'
const MUTED = '4B6A8A'
const GREY = '9CA3AF'
const INK = '1F2430'
const FONT = 'Arial'

const fmt = (n: number) => (n === 0 ? '—' : Math.round(n).toLocaleString('vi-VN'))
const pct = (n: number) => (n === 0 ? '—' : n.toFixed(1) + '%')

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

function sectionHead(roman: string, title: string) {
  return new Paragraph({
    spacing: { before: 260, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } },
    children: [txt(`${roman}. ${title}`, { bold: true, size: 22, color: NAVY })],
  })
}

export interface BankWordInput {
  printDate: string
  relations: BankRelation[]
  proposals: (BankProposal & { tenNganHang: string })[]
  notes: (BankNote & { tenNganHang: string })[]
  deXuat: string
  mode: 'compact' | 'full'
}

export function buildBankDoc(input: BankWordInput): Document {
  const { printDate, relations, proposals, notes, deXuat, mode } = input
  const showFull = mode === 'full'
  const PAGE_W = 11050 // A4 dọc, trừ lề (twip)

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [txt('SƠN AN GROUP', { bold: true, size: 16, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [txt('BÁO CÁO QUAN HỆ & PHƯƠNG ÁN NGÂN HÀNG', { bold: true, size: 28, color: NAVY })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
      children: [txt(`Ngày in: ${printDate}`, { size: 15, color: GREY })],
    }),
  ]

  // ── I. Tổng quan quan hệ ngân hàng (chỉ ở bản đầy đủ) ─────────────────────
  if (showFull) {
    children.push(sectionHead('I', 'TỔNG QUAN QUAN HỆ NGÂN HÀNG'))
    const W = [PAGE_W * .22, PAGE_W * .13, PAGE_W * .16, PAGE_W * .16, PAGE_W * .13, PAGE_W * .20]
    const head = new TableRow({
      tableHeader: true,
      children: [
        cell({ runs: [txt('Ngân hàng', { bold: true, color: MUTED, size: 15 })], width: W[0], bg: HEAD_BG }),
        cell({ runs: [txt('Trạng thái', { bold: true, color: MUTED, size: 15 })], width: W[1], bg: HEAD_BG }),
        cell({ runs: [txt('Hạn mức (đ)', { bold: true, color: MUTED, size: 15 })], width: W[2], align: 'right', bg: HEAD_BG }),
        cell({ runs: [txt('Dư nợ (đ)', { bold: true, color: MUTED, size: 15 })], width: W[3], align: 'right', bg: HEAD_BG }),
        cell({ runs: [txt('Lãi suất bq', { bold: true, color: MUTED, size: 15 })], width: W[4], align: 'right', bg: HEAD_BG }),
        cell({ runs: [txt('Đánh giá', { bold: true, color: MUTED, size: 15 })], width: W[5], bg: HEAD_BG }),
      ],
    })
    const rows = relations.length === 0
      ? [new TableRow({ children: [cell({ runs: [txt('Chưa có ngân hàng nào.', { color: GREY })], width: PAGE_W, align: 'center', columnSpan: 6 })] })]
      : relations.map(r => new TableRow({
        children: [
          cell({ runs: [txt(r.tenNganHang + (r.chiNhanh ? ' — ' + r.chiNhanh : ''), { bold: true, color: NAVY })], width: W[0] }),
          cell({ runs: [txt(TRANG_THAI_NH_LABEL[r.trangThai])], width: W[1] }),
          cell({ runs: [txt(fmt(r.hanMucHienTai))], width: W[2], align: 'right' }),
          cell({ runs: [txt(fmt(r.duNoHienTai), { color: r.duNoHienTai > 0 ? RED : undefined })], width: W[3], align: 'right' }),
          cell({ runs: [txt(pct(r.laiSuatBinhQuan))], width: W[4], align: 'right' }),
          cell({ runs: [txt(DANH_GIA_LABEL[r.danhGia])], width: W[5] }),
        ],
      }))
    const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
    children.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: W,
      layout: TableLayoutType.FIXED,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [head, ...rows],
    }))
  }

  // ── II. So sánh phương án đang xem xét ────────────────────────────────────
  children.push(sectionHead(showFull ? 'II' : 'I', 'SO SÁNH PHƯƠNG ÁN ĐANG XEM XÉT'))
  if (proposals.length === 0) {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [txt('Chưa chọn phương án nào để so sánh (chọn ở tab So sánh).', { color: GREY })] }))
  } else {
    const nCol = proposals.length
    const W_LABEL = Math.round(PAGE_W * 0.22)
    const W_COL = Math.round((PAGE_W - W_LABEL) / nCol)
    type ProposalRow = BankProposal & { tenNganHang: string }
    const rowsDef: { label: string; get: (p: ProposalRow) => string; bestOf?: (p: ProposalRow) => number; better?: 'min' | 'max' }[] = [
      { label: 'Ngân hàng', get: p => p.tenNganHang },
      { label: 'Loại vay', get: p => LOAI_VAY_LABEL[p.loaiVay] },
      { label: 'Lãi suất (%/năm)', get: p => pct(p.laiSuat), bestOf: p => p.laiSuat, better: 'min' },
      { label: 'Hạn mức đề xuất (đ)', get: p => fmt(p.hanMucDeXuat), bestOf: p => p.hanMucDeXuat, better: 'max' },
      { label: 'Tỷ lệ TSĐB', get: p => pct(p.tyLeTSDB) },
      { label: 'Thời hạn', get: p => p.thoiHan || '—' },
      { label: 'Phí dịch vụ', get: p => p.phiDichVu || '—' },
      { label: 'Điều kiện kèm theo', get: p => p.dieuKien || '—' },
      { label: 'Ưu điểm', get: p => p.uuDiem.length ? p.uuDiem.map(s => '+ ' + s).join('\n') : '—' },
      { label: 'Nhược điểm', get: p => p.nhuocDiem.length ? p.nhuocDiem.map(s => '− ' + s).join('\n') : '—' },
      { label: 'Trạng thái', get: p => TRANG_THAI_PA_LABEL[p.trangThai] },
    ]
    const head = new TableRow({
      tableHeader: true,
      children: [
        cell({ runs: [txt('Chỉ tiêu', { bold: true, color: 'FFFFFF' })], width: W_LABEL, bg: NAVY }),
        ...proposals.map(p => cell({ runs: [txt(p.tenPhuongAn, { bold: true, color: 'FFFFFF', size: 16 })], width: W_COL, align: 'center', bg: NAVY })),
      ],
    })
    const rows = rowsDef.map((rd, i) => {
      let bestVal: number | null = null
      if (rd.bestOf) {
        const vals = proposals.map(rd.bestOf).filter(v => v !== 0)
        if (vals.length) bestVal = rd.better === 'min' ? Math.min(...vals) : Math.max(...vals)
      }
      return new TableRow({
        children: [
          cell({ runs: [txt(rd.label, { bold: true, color: MUTED, size: 15 })], width: W_LABEL, bg: i % 2 === 0 ? HEAD_BG : undefined }),
          ...proposals.map(p => {
            const isBest = bestVal !== null && rd.bestOf?.(p) === bestVal
            return cell({
              runs: rd.get(p).split('\n').map((line, li) => new TextRun({ text: line, font: FONT, size: 17, bold: isBest, color: isBest ? GREEN : INK, break: li > 0 ? 1 : 0 })),
              width: W_COL, align: 'center', bg: isBest ? 'EAF6EE' : (i % 2 === 0 ? HEAD_BG : undefined),
            })
          }),
        ],
      })
    })
    const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
    children.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: [W_LABEL, ...proposals.map(() => W_COL)],
      layout: TableLayoutType.FIXED,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [head, ...rows],
    }))
  }

  // ── III. Nhật ký làm việc gần đây (chỉ ở bản đầy đủ) ──────────────────────
  if (showFull) {
    children.push(sectionHead('III', 'NHẬT KÝ LÀM VIỆC GẦN ĐÂY'))
    if (notes.length === 0) {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [txt('Chưa có ghi chú nào.', { color: GREY })] }))
    } else {
      const W = [PAGE_W * .10, PAGE_W * .18, PAGE_W * .42, PAGE_W * .30]
      const head = new TableRow({
        tableHeader: true,
        children: [
          cell({ runs: [txt('Ngày', { bold: true, color: MUTED, size: 15 })], width: W[0], bg: HEAD_BG }),
          cell({ runs: [txt('Ngân hàng', { bold: true, color: MUTED, size: 15 })], width: W[1], bg: HEAD_BG }),
          cell({ runs: [txt('Nội dung', { bold: true, color: MUTED, size: 15 })], width: W[2], bg: HEAD_BG }),
          cell({ runs: [txt('Việc cần làm / Hạn xử lý', { bold: true, color: MUTED, size: 15 })], width: W[3], bg: HEAD_BG }),
        ],
      })
      const rows = notes.map(n => new TableRow({
        children: [
          cell({ runs: [txt(n.ngay)], width: W[0] }),
          cell({ runs: [txt(n.tenNganHang, { bold: true, color: NAVY })], width: W[1] }),
          cell({ runs: [txt(n.noiDung || '—')], width: W[2] }),
          cell({ runs: [txt([n.viecCanLam, n.hanXuLy && `(hạn ${n.hanXuLy})`].filter(Boolean).join(' ') || '—')], width: W[3] }),
        ],
      }))
      const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
      children.push(new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: W,
        layout: TableLayoutType.FIXED,
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [head, ...rows],
      }))
    }
  }

  // ── IV. Đề xuất / Kết luận ─────────────────────────────────────────────────
  children.push(sectionHead(showFull ? 'IV' : 'II', 'ĐỀ XUẤT / KẾT LUẬN'))
  children.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [PAGE_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      left: { style: BorderStyle.SINGLE, size: 4, color: NAVY }, right: { style: BorderStyle.SINGLE, size: 4, color: NAVY },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: PAGE_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: GROUP_BG },
        margins: { top: 160, bottom: 160, left: 160, right: 160 },
        children: (deXuat || 'Chưa nhập đề xuất.').split('\n').map(line => new Paragraph({ children: [txt(line, { color: deXuat ? INK : GREY })] })),
      })],
    })],
  }))

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY })],
    })],
  })

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      footers: { default: footer },
      children,
    }],
  })
}

export async function exportBankWord(input: BankWordInput): Promise<void> {
  const doc = buildBankDoc(input)
  const blob = await Packer.toBlob(doc)
  const fname = `Bao cao ngan hang (${input.mode === 'full' ? 'day du' : 'gon'}).docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
