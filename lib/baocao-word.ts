import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, VerticalAlign, PageOrientation, BorderStyle, TableLayoutType,
  Footer, PageNumber,
} from 'docx'

// ── Kiểu dữ liệu (khớp với app/(authenticated)/baocao/page.tsx) ────────────────
export type BaocaoUnit = 'đ' | 'tr' | 'tỷ'

export interface WordItem { label: string; amt: number }
export interface WordGroup { nhom: string; total: number; items: WordItem[] }

export interface MonthlyInput {
  selMonth: number; selYear: number
  thuGroups: WordGroup[]; chiGroups: WordGroup[]
  totalThu: number; totalChi: number
  openBal: number; closeBal: number
}

export interface MonthRow { mm: string; thu: number; chi: number; rong: number; cuoiky: number }
export interface AnnSubItem { nhom: string; mmMap: Map<string, number>; total: number }
export interface AnnChiSuperGroup { key: string; label: string; mmMap: Map<string, number>; total: number; items: AnnSubItem[] }
export interface AnnThuGroup { nhom: string; mmMap: Map<string, number>; total: number; items: AnnSubItem[] }

export interface AnnualInput {
  selYear: number
  monthRows: MonthRow[]; yearOpen: number
  chiSuperGroups: AnnChiSuperGroup[]; thuNhomRows: AnnThuGroup[]
  totalThu: number; totalChi: number
}

export interface BaocaoWordInput {
  mode: 'monthly' | 'annual'
  unit: BaocaoUnit
  printDate: string
  monthly?: MonthlyInput
  annual?: AnnualInput
}

// ── Màu & font (khớp bảng trên màn hình) ─────────────────────────────────────────
const NAVY = '1C3557'
const GREEN = '15803D'
const RED = 'DC2626'
const AMBER = 'B45309'
const HEAD_BG = 'F5F8FC'
const GROUP_BG = 'EEF3FA'
const MUTED = '4B6A8A'
const GREY = '9CA3AF'
const INK = '1F2430'
const FONT = 'Arial'

const PAGE_W = 15398 // A4 ngang, trừ lề 2 bên (twip)
const dxa = (pct: number, base = PAGE_W) => Math.round(base * pct / 100)

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

function sectionHead(roman: string, title: string, totalStr?: string, color?: string) {
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
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: totalStr ? [txt(totalStr, { bold: true, size: 21, color })] : [],
          })],
        }),
      ],
    })],
  })
}

const spacer = (before = 260) => new Paragraph({ spacing: { before, after: 0 }, children: [] })

function toRoman(n: number) { return ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] ?? String(n) }

// ── I / II. Bảng nhóm Thu / Chi (báo cáo tháng) ─────────────────────────────────
function monthlyGroupTable(groups: WordGroup[], total: number, kind: 'thu' | 'chi', unitLbl: string, fmtN: (v: number) => string) {
  const isThu = kind === 'thu'
  const color = isThu ? GREEN : RED
  const nameHead = isThu ? 'NHÓM GIAO DỊCH / ĐƠN VỊ' : 'NHÓM CHI PHÍ / ĐƠN VỊ'
  const W_IDX = dxa(5), W_PCT = dxa(11), W_AMT = dxa(22)
  const W_NAME = PAGE_W - W_IDX - W_PCT - W_AMT
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }

  const rows: TableRow[] = [new TableRow({
    tableHeader: true,
    children: [
      cell({ runs: [txt('#', { color: MUTED, bold: true, size: 15 })], width: W_IDX, align: 'center', bg: HEAD_BG }),
      cell({ runs: [txt(nameHead, { color: MUTED, bold: true, size: 15 })], width: W_NAME, align: 'left', bg: HEAD_BG }),
      cell({ runs: [txt(`SỐ TIỀN (${unitLbl})`, { color: MUTED, bold: true, size: 15 })], width: W_AMT, align: 'right', bg: HEAD_BG }),
      cell({ runs: [txt('TỶ TRỌNG', { color: MUTED, bold: true, size: 15 })], width: W_PCT, align: 'right', bg: HEAD_BG }),
    ],
  })]

  if (groups.length === 0) {
    rows.push(new TableRow({
      children: [cell({ runs: [txt('Không có giao dịch trong kỳ.', { color: GREY })], width: PAGE_W, align: 'center', columnSpan: 4 })],
    }))
  }

  groups.forEach((g, i) => {
    rows.push(new TableRow({
      children: [
        cell({ runs: [txt(String(i + 1), { color: 'C4CACF', bold: true })], width: W_IDX, align: 'center', bg: GROUP_BG }),
        cell({ runs: [txt(g.nhom, { color: NAVY, bold: true })], width: W_NAME, align: 'left', bg: GROUP_BG }),
        cell({ runs: [txt(fmtN(g.total), { color })], width: W_AMT, align: 'right', bg: GROUP_BG }),
        cell({ runs: [txt(total > 0 ? (g.total / total * 100).toFixed(1) + '%' : '—', { color: '6B7280', size: 16 })], width: W_PCT, align: 'right', bg: GROUP_BG }),
      ],
    }))
    g.items.forEach(item => {
      rows.push(new TableRow({
        children: [
          cell({ runs: [txt('', {})], width: W_IDX }),
          cell({ runs: [txt('└ ' + item.label, { color: MUTED, size: 17 })], width: W_NAME, align: 'left' }),
          cell({ runs: [txt(fmtN(item.amt), { color: MUTED })], width: W_AMT, align: 'right' }),
          cell({ runs: [txt(g.total > 0 ? (item.amt / g.total * 100).toFixed(1) + '%' : '—', { color: GREY, size: 15 })], width: W_PCT, align: 'right' }),
        ],
      }))
    })
  })

  rows.push(new TableRow({
    children: [
      cell({ runs: [txt('', {})], width: W_IDX, bg: NAVY }),
      cell({ runs: [txt(isThu ? 'TỔNG THU' : 'TỔNG CHI', { color: 'FFFFFF', bold: true })], width: W_NAME, align: 'left', bg: NAVY }),
      cell({ runs: [txt(fmtN(total), { color: 'FFFFFF', bold: true })], width: W_AMT, align: 'right', bg: NAVY }),
      cell({ runs: [txt('100%', { color: 'FFFFFF', bold: true })], width: W_PCT, align: 'right', bg: NAVY }),
    ],
  }))

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W_IDX, W_NAME, W_AMT, W_PCT],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows,
  })
}

// ── III. Tóm tắt kỳ (báo cáo tháng) ─────────────────────────────────────────────
function monthlySummaryTable(m: MonthlyInput, unitLbl: string, fmtN: (v: number) => string, fmtP: (v: number) => string) {
  const SUMMARY_W = dxa(72)
  const rong = m.totalThu - m.totalChi
  const clr = (v: number) => v > 0 ? GREEN : v < 0 ? RED : '374151'

  const row = (label: string, value: string, color?: string, bold = false, bg?: string) => new TableRow({
    children: [
      cell({ runs: [txt(label, { bold, color: '374151' })], width: dxa(62, SUMMARY_W), align: 'left', bg }),
      cell({ runs: [txt(value, { bold: true, color })], width: dxa(38, SUMMARY_W), align: 'right', bg }),
    ],
  })

  const rows = [
    new TableRow({
      children: [cell({ runs: [txt(`III. TÓM TẮT KỲ THÁNG ${m.selMonth}/${m.selYear}`, { bold: true, color: 'FFFFFF', size: 17 })], width: SUMMARY_W, align: 'left', bg: NAVY, columnSpan: 2 })],
    }),
    row(`Số dư đầu kỳ (01/${String(m.selMonth).padStart(2, '0')}/${m.selYear})`, `${fmtN(m.openBal)} ${unitLbl}`, NAVY, false, HEAD_BG),
    row('(+) Tổng thu trong kỳ', `${fmtN(m.totalThu)} ${unitLbl}`, GREEN, false, 'F0FDF4'),
    row('(−) Tổng chi trong kỳ', `${fmtN(m.totalChi)} ${unitLbl}`, RED, false, 'FFF5F5'),
    row('(=) Dòng tiền ròng trong kỳ', `${fmtP(rong)} ${unitLbl}`, clr(rong), false, rong >= 0 ? 'F0FDF4' : 'FFF5F5'),
    row('Số dư cuối kỳ', `${fmtN(m.closeBal)} ${unitLbl}`, NAVY, true, GROUP_BG),
  ]

  const sumBorder = { style: BorderStyle.SINGLE, size: 4, color: NAVY }
  return new Table({
    width: { size: SUMMARY_W, type: WidthType.DXA },
    columnWidths: [dxa(62, SUMMARY_W), dxa(38, SUMMARY_W)],
    layout: TableLayoutType.FIXED,
    borders: { top: sumBorder, bottom: sumBorder, left: sumBorder, right: sumBorder, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows,
  })
}

// ── I. Tổng hợp dòng tiền theo tháng (báo cáo năm) ──────────────────────────────
function annualSummaryTable(a: AnnualInput, fmtN: (v: number) => string, fmtP: (v: number) => string) {
  const clr = (v: number) => v > 0 ? GREEN : v < 0 ? RED : '374151'
  const n = a.monthRows.length
  const mmLbl = (mm: string) => `T${mm}/${String(a.selYear).slice(2)}`
  const W_LABEL = dxa(18), W_TOT = dxa(10)
  const W_MM = Math.round((PAGE_W - W_LABEL - W_TOT) / n)
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }

  const dataRow = (label: string, vals: string[], total: string, color?: string, bg?: string, bold = false) => new TableRow({
    children: [
      cell({ runs: [txt(label, { color: color ?? '374151', bold })], width: W_LABEL, align: 'left', bg }),
      ...vals.map(v => cell({ runs: [txt(v, { color: color ?? '374151', bold })], width: W_MM, align: 'right', bg })),
      cell({ runs: [txt(total, { color: color ?? NAVY, bold: true })], width: W_TOT, align: 'right', bg }),
    ],
  })

  const rong = a.totalThu - a.totalChi
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        cell({ runs: [txt('CHỈ TIÊU', { bold: true, color: 'FFFFFF', size: 15 })], width: W_LABEL, align: 'left', bg: NAVY }),
        ...a.monthRows.map(m => cell({ runs: [txt(mmLbl(m.mm), { bold: true, color: 'FFFFFF', size: 15 })], width: W_MM, align: 'right', bg: NAVY })),
        cell({ runs: [txt('TỔNG / CK', { bold: true, color: 'FFFFFF', size: 15 })], width: W_TOT, align: 'right', bg: '0D1F33' }),
      ],
    }),
    dataRow('Số dư đầu kỳ', a.monthRows.map((m, i) => fmtN(i === 0 ? a.yearOpen : a.monthRows[i - 1].cuoiky)), fmtN(a.yearOpen), NAVY),
    dataRow('↑ Tổng thu', a.monthRows.map(m => fmtN(m.thu)), fmtN(a.totalThu), GREEN, GROUP_BG, true),
    dataRow('↓ Tổng chi', a.monthRows.map(m => fmtN(m.chi)), fmtN(a.totalChi), RED, GROUP_BG, true),
    dataRow('↔ Ròng', a.monthRows.map(m => fmtP(m.rong)), fmtP(rong), clr(rong), GROUP_BG, true),
    dataRow('Số dư cuối kỳ', a.monthRows.map(m => fmtN(m.cuoiky)), fmtN(a.monthRows[a.monthRows.length - 1].cuoiky), NAVY, GROUP_BG, true),
    new TableRow({
      children: [
        cell({ runs: [txt('Burn rate (%)', { color: '6B7280', size: 15 })], width: W_LABEL, align: 'left', bg: HEAD_BG }),
        ...a.monthRows.map(m => {
          const br = m.thu > 0 ? m.chi / m.thu * 100 : null
          const c = br === null ? GREY : br > 100 ? RED : br > 80 ? 'B45309' : GREEN
          return cell({ runs: [txt(br === null ? '—' : br.toFixed(0) + '%', { color: c, size: 15 })], width: W_MM, align: 'right', bg: HEAD_BG })
        }),
        cell({
          runs: [txt(a.totalThu > 0 ? (a.totalChi / a.totalThu * 100).toFixed(1) + '%' : '—', { color: a.totalThu > 0 && a.totalChi / a.totalThu > 1 ? RED : GREEN, size: 15 })],
          width: W_TOT, align: 'right', bg: HEAD_BG,
        }),
      ],
    }),
  ]

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W_LABEL, ...a.monthRows.map(() => W_MM), W_TOT],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows,
  })
}

// ── II / III. Cơ cấu Chi / Thu theo nhóm × tháng (báo cáo năm) ──────────────────
interface AnnGroup { label: string; mmMap: Map<string, number>; total: number; items: { label: string; mmMap: Map<string, number>; total: number }[] }

function annMatrixTable(
  groups: AnnGroup[], monthRows: MonthRow[], selYear: number, grandTotal: number,
  color: string, footLabel: string, fmtN: (v: number) => string,
) {
  const mmLbl = (mm: string) => `T${mm}/${String(selYear).slice(2)}`
  const n = monthRows.length
  const W_LABEL = dxa(20), W_TOT = dxa(12), W_PCT = dxa(6)
  const W_MM = Math.round((PAGE_W - W_LABEL - W_TOT - W_PCT) / n)
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }

  const rows: TableRow[] = [new TableRow({
    tableHeader: true,
    children: [
      cell({ runs: [txt('NHÓM', { bold: true, color: 'FFFFFF', size: 14 })], width: W_LABEL, align: 'left', bg: NAVY }),
      ...monthRows.map(m => cell({ runs: [txt(mmLbl(m.mm), { bold: true, color: 'FFFFFF', size: 14 })], width: W_MM, align: 'right', bg: NAVY })),
      cell({ runs: [txt('TỔNG', { bold: true, color: 'FFFFFF', size: 14 })], width: W_TOT, align: 'right', bg: NAVY }),
      cell({ runs: [txt('TỶ LỆ', { bold: true, color: 'FFFFFF', size: 14 })], width: W_PCT, align: 'right', bg: NAVY }),
    ],
  })]

  if (groups.length === 0) {
    rows.push(new TableRow({
      children: [cell({ runs: [txt('Không có dữ liệu trong kỳ.', { color: GREY })], width: PAGE_W, align: 'center', columnSpan: n + 3 })],
    }))
  }

  groups.forEach(g => {
    rows.push(new TableRow({
      children: [
        cell({ runs: [txt(g.label, { bold: true, color: NAVY })], width: W_LABEL, align: 'left', bg: GROUP_BG }),
        ...monthRows.map(m => {
          const v = g.mmMap.get(m.mm) ?? 0
          return cell({ runs: [txt(v ? fmtN(v) : '—', { color: v ? color : 'D1D5DB' })], width: W_MM, align: 'right', bg: GROUP_BG })
        }),
        cell({ runs: [txt(fmtN(g.total), { color, bold: true })], width: W_TOT, align: 'right', bg: GROUP_BG }),
        cell({ runs: [txt(grandTotal > 0 ? (g.total / grandTotal * 100).toFixed(1) + '%' : '—', { color: '6B7280', size: 14 })], width: W_PCT, align: 'right', bg: GROUP_BG }),
      ],
    }))
    g.items.forEach(it => {
      rows.push(new TableRow({
        children: [
          cell({ runs: [txt('└ ' + it.label, { color: MUTED, size: 16 })], width: W_LABEL, align: 'left' }),
          ...monthRows.map(m => {
            const v = it.mmMap.get(m.mm) ?? 0
            return cell({ runs: [txt(v ? fmtN(v) : '—', { color: v ? color : 'D1D5DB', size: 16 })], width: W_MM, align: 'right' })
          }),
          cell({ runs: [txt(fmtN(it.total), { color, size: 16 })], width: W_TOT, align: 'right' }),
          cell({ runs: [txt(g.total > 0 ? (it.total / g.total * 100).toFixed(1) + '%' : '—', { color: '6B7280', size: 14 })], width: W_PCT, align: 'right' }),
        ],
      }))
    })
  })

  rows.push(new TableRow({
    children: [
      cell({ runs: [txt(footLabel, { color: 'FFFFFF', bold: true })], width: W_LABEL, align: 'left', bg: NAVY },
      ),
      ...monthRows.map(m => {
        const v = groups.reduce((s, g) => s + (g.mmMap.get(m.mm) ?? 0), 0)
        return cell({ runs: [txt(fmtN(v), { color: 'FFFFFF', bold: true })], width: W_MM, align: 'right', bg: NAVY })
      }),
      cell({ runs: [txt(fmtN(grandTotal), { color: 'FFFFFF', bold: true })], width: W_TOT, align: 'right', bg: NAVY }),
      cell({ runs: [txt('100%', { color: 'FFFFFF', bold: true })], width: W_PCT, align: 'right', bg: NAVY }),
    ],
  }))

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W_LABEL, ...monthRows.map(() => W_MM), W_TOT, W_PCT],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows,
  })
}

// ── IV. Chỉ số biến động theo tháng (báo cáo năm) ───────────────────────────────
function growthTable(monthRows: MonthRow[], selYear: number) {
  const mmLbl = (mm: string) => `T${mm}/${String(selYear).slice(2)}`
  const rest = monthRows.slice(1)
  const n = rest.length
  const W_LABEL = dxa(30)
  const W_MM = Math.round((PAGE_W - W_LABEL) / n)
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'D0DCE8' }

  const growthRows: { label: string; vals: (number | null)[]; posGood?: boolean; isBr?: boolean }[] = [
    { label: '▲ Tăng trưởng Thu', vals: rest.map((m, i) => { const p = monthRows[i].thu; return p > 0 ? (m.thu - p) / p * 100 : null }), posGood: true },
    { label: '▼ Tăng trưởng Chi', vals: rest.map((m, i) => { const p = monthRows[i].chi; return p > 0 ? (m.chi - p) / p * 100 : null }), posGood: false },
    { label: 'Burn rate', vals: rest.map(m => m.thu > 0 ? m.chi / m.thu * 100 : null), isBr: true },
    { label: 'Số dư cuối kỳ (%)', vals: rest.map((m, i) => { const p = monthRows[i].cuoiky; return p > 0 ? (m.cuoiky - p) / p * 100 : null }), posGood: true },
  ]

  const rows: TableRow[] = [new TableRow({
    tableHeader: true,
    children: [
      cell({ runs: [txt('CHỈ SỐ', { bold: true, color: 'FFFFFF', size: 14 })], width: W_LABEL, align: 'left', bg: '374151' }),
      ...rest.map(m => cell({ runs: [txt(mmLbl(m.mm), { bold: true, color: 'FFFFFF', size: 14 })], width: W_MM, align: 'right', bg: '374151' })),
    ],
  })]

  growthRows.forEach(r => {
    rows.push(new TableRow({
      children: [
        cell({ runs: [txt(r.label, { bold: true, color: '374151' })], width: W_LABEL, align: 'left' }),
        ...r.vals.map(v => {
          if (v === null) return cell({ runs: [txt('—', { color: GREY })], width: W_MM, align: 'right' })
          const bad = r.isBr ? v >= 100 : (r.posGood ? v < 0 : v > 0)
          const warn = r.isBr ? (v >= 80 && v < 100) : false
          const good = r.isBr ? v < 80 : (r.posGood ? v >= 0 : v <= 0)
          const c = bad ? RED : warn ? AMBER : good ? GREEN : '374151'
          const s = r.isBr ? v.toFixed(1) + '%' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
          return cell({ runs: [txt(s, { color: c })], width: W_MM, align: 'right' })
        }),
      ],
    }))
  })

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W_LABEL, ...rest.map(() => W_MM)],
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows,
  })
}

// ── Chữ ký ───────────────────────────────────────────────────────────────────
function signatureBlock() {
  const titles = ['KẾ TOÁN TRƯỞNG', 'GIÁM ĐỐC TÀI CHÍNH (CFO)', 'TỔNG GIÁM ĐỐC (CEO)']
  const W = Math.round(PAGE_W / 3)
  const noB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [W, W, PAGE_W - 2 * W],
    layout: TableLayoutType.FIXED,
    borders: { top: noB, bottom: noB, left: noB, right: noB, insideHorizontal: noB, insideVertical: noB },
    rows: [new TableRow({
      children: titles.map((t, i) => new TableCell({
        width: { size: i < 2 ? W : PAGE_W - 2 * W, type: WidthType.DXA },
        margins: { top: 200, bottom: 0, left: 0, right: 0 },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(t, { bold: true, size: 15, color: '374151' })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { before: 900 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: NAVY, space: 4 } },
            children: [txt('Ký tên, đóng dấu', { size: 13, color: GREY })],
          }),
        ],
      })),
    })],
  })
}

// ── Ghép tài liệu ─────────────────────────────────────────────────────────────
export function buildBaocaoDoc(input: BaocaoWordInput): Document {
  const { mode, unit, printDate } = input
  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmt = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtN = (v: number) => fmt(Math.abs(v))
  const fmtP = (v: number) => (v >= 0 ? '+' : '') + fmt(v)

  const titleLine = mode === 'monthly'
    ? `BÁO CÁO DÒNG TIỀN THÁNG ${input.monthly!.selMonth}/${input.monthly!.selYear}`
    : `BÁO CÁO DÒNG TIỀN NĂM ${input.annual!.selYear}`

  const metaLine = mode === 'monthly'
    ? (() => {
        const m = input.monthly!
        const lastDay = new Date(m.selYear, m.selMonth, 0).getDate()
        return `Đơn vị tính: ${unitLbl} · Nguồn: Firebase Realtime Database · Ngày in: ${printDate} · Kỳ: 01/${String(m.selMonth).padStart(2, '0')}/${m.selYear} – ${lastDay}/${String(m.selMonth).padStart(2, '0')}/${m.selYear}`
      })()
    : `Đơn vị tính: ${unitLbl} · Nguồn: Firebase Realtime Database · Ngày in: ${printDate}`

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [txt('SONAN LAND', { bold: true, size: 16, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [txt(titleLine, { bold: true, size: 30, color: NAVY })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 6 } },
      children: [txt(metaLine, { size: 15, color: GREY })],
    }),
  ]

  if (mode === 'monthly') {
    const m = input.monthly!

    children.push(sectionHead('I', 'DÒNG TIỀN THU', `${fmtN(m.totalThu)} ${unitLbl}`, GREEN))
    children.push(monthlyGroupTable(m.thuGroups, m.totalThu, 'thu', unitLbl, fmtN))
    children.push(spacer())
    children.push(sectionHead('II', 'DÒNG TIỀN CHI', `${fmtN(m.totalChi)} ${unitLbl}`, RED))
    children.push(monthlyGroupTable(m.chiGroups, m.totalChi, 'chi', unitLbl, fmtN))
    children.push(spacer(300))
    children.push(monthlySummaryTable(m, unitLbl, fmtN, fmtP))
    children.push(spacer(500))
    children.push(signatureBlock())
  } else {
    const a = input.annual!
    let sec = 1

    children.push(sectionHead(toRoman(sec), 'TỔNG HỢP DÒNG TIỀN THEO THÁNG'))
    children.push(annualSummaryTable(a, fmtN, fmtP))
    sec++

    const chiGroups: AnnGroup[] = a.chiSuperGroups.map(sg => ({
      label: sg.label, mmMap: sg.mmMap, total: sg.total,
      items: sg.items.map(it => ({ label: it.nhom, mmMap: it.mmMap, total: it.total })),
    }))
    if (chiGroups.length > 0) {
      children.push(spacer(280))
      children.push(sectionHead(toRoman(sec), 'CƠ CẤU CHI THEO NHÓM', `${fmtN(a.totalChi)} ${unitLbl}`, RED))
      children.push(annMatrixTable(chiGroups, a.monthRows, a.selYear, a.totalChi, RED, 'TỔNG CHI', fmtN))
      sec++
    }

    const thuGroups: AnnGroup[] = a.thuNhomRows.map(g => ({
      label: g.nhom, mmMap: g.mmMap, total: g.total,
      items: g.items.map(it => ({ label: it.nhom, mmMap: it.mmMap, total: it.total })),
    }))
    if (thuGroups.length > 1) {
      children.push(spacer(280))
      children.push(sectionHead(toRoman(sec), 'CƠ CẤU THU THEO NHÓM', `${fmtN(a.totalThu)} ${unitLbl}`, GREEN))
      children.push(annMatrixTable(thuGroups, a.monthRows, a.selYear, a.totalThu, GREEN, 'TỔNG THU', fmtN))
      sec++
    }

    if (a.monthRows.length >= 2) {
      children.push(spacer(280))
      children.push(sectionHead(toRoman(sec), 'CHỈ SỐ BIẾN ĐỘNG THEO THÁNG (so tháng trước)'))
      children.push(growthTable(a.monthRows, a.selYear))
    }

    children.push(spacer(500))
    children.push(signatureBlock())
  }

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

export async function exportBaocaoWord(input: BaocaoWordInput): Promise<void> {
  const doc = buildBaocaoDoc(input)
  const blob = await Packer.toBlob(doc)
  const fname = input.mode === 'monthly'
    ? `BaoCao_T${String(input.monthly!.selMonth).padStart(2, '0')}_${input.monthly!.selYear}.docx`
    : `BaoCao_Nam_${input.annual!.selYear}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
