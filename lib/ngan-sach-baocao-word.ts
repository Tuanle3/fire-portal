import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, VerticalAlign, PageOrientation, BorderStyle, TableLayoutType,
} from 'docx'

// ── Kiểu dữ liệu (khớp với TabDuBao) ────────────────────────────────────────────
export interface WordColDef { key: string; label: string }
export interface WordUnit { unit: string; cols: Record<string, number>; total: number }
export interface WordGroup { nhom: string; cols: Record<string, number>; total: number; units: WordUnit[] }
export interface WordSection { rows: WordGroup[]; colTotals: Record<string, number>; grandTotal: number }
export interface WordSummary { opening: number; thu: number; chi: number; net: number; closing: number }
export interface WordGiaiPhap {
  items: { mo_ta: string; kh: number; th: number; trang_thai: string; thang: string }[]
  kh: number; th: number
}

export interface BaoCaoWordInput {
  scopeLabel: string
  kyLabel: string
  printDate: string
  view: 'year' | 'quarter' | 'month'
  cols: WordColDef[]
  thu: WordSection
  chi: WordSection
  summary: WordSummary
  giaiPhap: WordGiaiPhap
  mode: 'compact' | 'full'   // gọn = chỉ nhóm; đầy đủ = mở hết chi tiết đơn vị
}

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
const fmtSigned = (n: number) =>
  n === 0 ? '—' : (n < 0 ? '−' : '+') + Math.abs(Math.round(n)).toLocaleString('vi-VN')

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

export function buildBaoCaoDoc(input: BaoCaoWordInput): Document {
  const { cols, view, thu, chi, summary, giaiPhap, mode, scopeLabel, kyLabel, printDate } = input
  const showUnits = mode === 'full'

  // Layout cột (bề rộng tuyệt đối theo twip): #, tên khoản mục, [các cột giá trị],
  // cột tổng/chênh lệch, tỷ trọng. Cột # (STT) hẹp, cột tên rộng — giống bản web.
  // Dùng layout FIXED + columnWidths bằng twip nên Word tôn trọng đúng bề rộng
  // (không tự co giãn theo nội dung như trước).
  const nVal = cols.length
  const PAGE_W = 15398                                   // A4 ngang, trừ lề 2 bên (twip)
  const dxa = (pct: number, base = PAGE_W) => Math.round(base * pct / 100)
  const SUMMARY_W = dxa(72)                              // bảng tóm tắt hẹp hơn cho đẹp
  const W_IDX = dxa(4), W_PCT = dxa(8), W_TOT = dxa(12)
  const W_VAL = dxa(nVal <= 2 ? 18 : nVal === 3 ? 15 : 12)
  const W_NAME = PAGE_W - W_IDX - W_PCT - W_TOT - W_VAL * nVal
  const SECTION_COLW = [W_IDX, W_NAME, ...cols.map(() => W_VAL), W_TOT, W_PCT]
  const lastLabel = view === 'month' ? 'Chênh lệch' : 'Tổng (đ)'

  // ── 1 dòng giá trị (nhóm hoặc đơn vị) ─────────────────────────────────────────
  const valueCells = (c: Record<string, number>, total: number, grand: number, isThu: boolean, bg?: string) => {
    const cellsArr: TableCell[] = []
    for (const col of cols) {
      cellsArr.push(cell({
        runs: [txt(fmt(c[col.key] ?? 0), { color: bg === GROUP_BG ? NAVY : '374151', bold: bg === GROUP_BG })],
        width: W_VAL, align: 'right', bg,
      }))
    }
    if (view === 'month') {
      const d = (c['TH'] ?? 0) - (c['KH'] ?? 0)
      const good = (d >= 0) === isThu
      cellsArr.push(cell({ runs: [txt(fmtSigned(d), { color: good ? GREEN : RED, bold: true })], width: W_TOT, align: 'right', bg }))
    } else {
      cellsArr.push(cell({ runs: [txt(fmt(total), { color: NAVY, bold: true })], width: W_TOT, align: 'right', bg }))
    }
    cellsArr.push(cell({
      runs: [txt(grand > 0 ? (total / grand * 100).toFixed(1) + '%' : '—', { color: '6B7280', size: 16 })],
      width: W_PCT, align: 'right', bg,
    }))
    return cellsArr
  }

  const sectionTable = (sec: WordSection, type: 'thu' | 'chi', nameHead: string) => {
    const isThu = type === 'thu'
    const rows: TableRow[] = []

    // header
    const headCells: TableCell[] = [
      cell({ runs: [txt('#', { color: MUTED, bold: true, size: 15 })], width: W_IDX, align: 'center', bg: HEAD_BG }),
      cell({ runs: [txt(nameHead, { color: MUTED, bold: true, size: 15 })], width: W_NAME, align: 'left', bg: HEAD_BG }),
    ]
    for (const col of cols) headCells.push(cell({ runs: [txt(col.label, { color: MUTED, bold: true, size: 15 })], width: W_VAL, align: 'right', bg: HEAD_BG }))
    headCells.push(cell({ runs: [txt(lastLabel, { color: MUTED, bold: true, size: 15 })], width: W_TOT, align: 'right', bg: HEAD_BG }))
    headCells.push(cell({ runs: [txt('Tỷ trọng', { color: MUTED, bold: true, size: 15 })], width: W_PCT, align: 'right', bg: HEAD_BG }))
    rows.push(new TableRow({ tableHeader: true, children: headCells }))

    if (sec.rows.length === 0) {
      rows.push(new TableRow({
        children: [cell({ runs: [txt('Không có dữ liệu trong kỳ.', { color: GREY })], width: PAGE_W, align: 'center', columnSpan: nVal + 4 })],
      }))
    }

    sec.rows.forEach((g, i) => {
      const gCells: TableCell[] = [
        cell({ runs: [txt(String(i + 1), { color: 'C4CACF', bold: true })], width: W_IDX, align: 'center', bg: GROUP_BG }),
        cell({ runs: [txt(g.nhom, { color: NAVY, bold: true })], width: W_NAME, align: 'left', bg: GROUP_BG }),
        ...valueCells(g.cols, g.total, sec.grandTotal, isThu, GROUP_BG),
      ]
      rows.push(new TableRow({ children: gCells }))

      if (showUnits && g.units.length > 1) {
        for (const u of g.units) {
          const uCells: TableCell[] = [
            cell({ runs: [txt('', {})], width: W_IDX, align: 'center' }),
            cell({ runs: [txt('└ ' + u.unit, { color: MUTED, size: 17 })], width: W_NAME, align: 'left' }),
            ...valueCells(u.cols, u.total, sec.grandTotal, isThu),
          ]
          rows.push(new TableRow({ children: uCells }))
        }
      }
    })

    // TỔNG
    const totalCells: TableCell[] = [
      cell({ runs: [txt('', {})], width: W_IDX, bg: NAVY }),
      cell({ runs: [txt('TỔNG ' + (isThu ? 'THU' : 'CHI'), { color: 'FFFFFF', bold: true })], width: W_NAME, align: 'left', bg: NAVY }),
    ]
    for (const col of cols) totalCells.push(cell({ runs: [txt(fmt(sec.colTotals[col.key] ?? 0), { color: 'FFFFFF', bold: true })], width: W_VAL, align: 'right', bg: NAVY }))
    totalCells.push(cell({
      runs: [txt(view === 'month' ? fmtSigned((sec.colTotals['TH'] ?? 0) - (sec.colTotals['KH'] ?? 0)) : fmt(sec.grandTotal), { color: 'FFFFFF', bold: true })],
      width: W_TOT, align: 'right', bg: NAVY,
    }))
    totalCells.push(cell({ runs: [txt('100%', { color: 'FFFFFF', bold: true })], width: W_PCT, align: 'right', bg: NAVY }))
    rows.push(new TableRow({ children: totalCells }))

    const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }
    return new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: SECTION_COLW,
      layout: TableLayoutType.FIXED,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows,
    })
  }

  const sectionHead = (roman: string, title: string, total: number, color: string) => {
    const noB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    const botB = { style: BorderStyle.SINGLE, size: 12, color: NAVY }
    return new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      columnWidths: [dxa(60), dxa(40)],
      layout: TableLayoutType.FIXED,
      borders: { top: noB, left: noB, right: noB, bottom: botB, insideHorizontal: noB, insideVertical: noB },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: dxa(60), type: WidthType.DXA }, verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 200, bottom: 60, left: 0, right: 0 },
            children: [new Paragraph({ children: [txt(`${roman}. ${title}`, { bold: true, size: 21, color: NAVY })] })],
          }),
          new TableCell({
            width: { size: dxa(40), type: WidthType.DXA }, verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 200, bottom: 60, left: 0, right: 0 },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(`${fmt(total)} đ`, { bold: true, size: 21, color })] })],
          }),
        ],
      })],
    })
  }

  // ── Bảng tóm tắt III ────────────────────────────────────────────────────────
  const sumRow = (label: string, value: string, color?: string, bold?: boolean, bg?: string) =>
    new TableRow({
      children: [
        cell({ runs: [txt(label, { bold, color: '374151' })], width: dxa(62, SUMMARY_W), align: 'left', bg }),
        cell({ runs: [txt(value, { bold: true, color })], width: dxa(38, SUMMARY_W), align: 'right', bg }),
      ],
    })

  const sumRows: TableRow[] = [
    new TableRow({
      children: [cell({ runs: [txt(`III. TÓM TẮT & CÂN ĐỐI KỲ · ${scopeLabel}`, { bold: true, color: 'FFFFFF', size: 17 })], width: SUMMARY_W, align: 'left', bg: NAVY, columnSpan: 2 })],
    }),
    sumRow(`Tồn quỹ đầu kỳ (${kyLabel.split(' – ')[0]})`, fmt(summary.opening) + ' đ'),
    sumRow('(+) Tổng thu trong kỳ', fmt(summary.thu) + ' đ', GREEN),
    sumRow('(−) Tổng chi trong kỳ', fmt(summary.chi) + ' đ', RED),
    sumRow('(=) Thừa/thiếu tiền', fmtSigned(summary.closing) + ' đ', summary.closing < 0 ? RED : NAVY, true, GROUP_BG),
  ]
  if (giaiPhap.items.length === 0) {
    sumRows.push(new TableRow({
      children: [cell({ runs: [txt('Giải pháp cân đối: chưa có (nhập ở tab Giải pháp cân đối)', { color: GREY })], width: SUMMARY_W, align: 'left', columnSpan: 2 })],
    }))
  } else {
    for (const g of giaiPhap.items) {
      const prefix = view !== 'month' ? `[Th.${parseInt(g.thang.slice(5, 7))}] ` : ''
      const st = g.trang_thai === 'yes' ? 'đã thực hiện' : g.trang_thai === 'no' ? 'không dùng' : 'dự kiến'
      sumRows.push(sumRow(`↳ ${prefix}${g.mo_ta} · ${st}`, fmt(g.kh) + ' đ', g.trang_thai === 'no' ? GREY : GREEN))
    }
  }
  sumRows.push(sumRow('(+) Giải pháp cân đối', fmt(giaiPhap.kh) + ' đ', GREEN))
  sumRows.push(sumRow('(=) Dòng tiền sau cân đối', fmtSigned(summary.closing + giaiPhap.kh) + ' đ', (summary.closing + giaiPhap.kh) < 0 ? RED : NAVY, true, GROUP_BG))

  const sumBorder = { style: BorderStyle.SINGLE, size: 4, color: NAVY }
  const summaryTable = new Table({
    width: { size: SUMMARY_W, type: WidthType.DXA },
    columnWidths: [dxa(62, SUMMARY_W), dxa(38, SUMMARY_W)],
    layout: TableLayoutType.FIXED,
    borders: { top: sumBorder, bottom: sumBorder, left: sumBorder, right: sumBorder, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows: sumRows,
  })

  // ── Ghép tài liệu ─────────────────────────────────────────────────────────────
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [txt('SƠN AN GROUP', { bold: true, size: 16, color: GREY })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [txt(`BÁO CÁO DÒNG TIỀN ${scopeLabel}`, { bold: true, size: 30, color: NAVY })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
          children: [txt(`Đơn vị tính: đ · Nguồn: Firebase Realtime Database · Ngày in: ${printDate} · Kỳ: ${kyLabel}`, { size: 15, color: GREY })],
        }),

        sectionHead('I', 'DÒNG TIỀN THU', thu.grandTotal, GREEN),
        sectionTable(thu, 'thu', 'KHOẢN MỤC THU'),

        sectionHead('II', 'DÒNG TIỀN CHI', chi.grandTotal, RED),
        sectionTable(chi, 'chi', 'KHOẢN MỤC CHI'),

        new Paragraph({ spacing: { before: 300, after: 100 }, children: [] }),
        summaryTable,
      ],
    }],
  })

  return doc
}

export async function exportBaoCaoWord(input: BaoCaoWordInput): Promise<void> {
  const doc = buildBaoCaoDoc(input)
  const blob = await Packer.toBlob(doc)
  const safe = input.scopeLabel.normalize('NFC').replace(/[\\/:*?"<>|]/g, '-')
  const mode = input.mode
  const fname = `Bao cao dong tien - ${safe} (${mode === 'full' ? 'day du' : 'gon'}).docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
