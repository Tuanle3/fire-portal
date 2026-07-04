import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  Header, Footer, PageNumber, VerticalAlign, PageBreak,
} from 'docx'
import { Task, TaskStatus, TaskPriority } from '@/lib/tasks-mock'
import { getWeekRange, getMonthRange, taskOverlapsRange } from '@/lib/report-ranges'
import { taskSortRank } from '@/lib/task-sort'

// ── Font & màu thương hiệu (khớp mẫu "Báo cáo hiệu quả công việc") ─────────────
const FONT_BODY  = 'Be Vietnam Pro'
const FONT_TITLE = 'Playfair Display'
const NAVY = '1C3557'

// ── Helpers ──────────────────────────────────────────────────────────────────
const BORDER  = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDER  = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }

const STATUS_SHADE:   Record<TaskStatus,   string> = { chua_bat_dau: 'F3F4F6', dang_lam: 'DAE9F7', hoan_thanh: 'D9F2D0', tre: 'F8D7D7' }
const STATUS_LABEL_V: Record<TaskStatus,   string> = { chua_bat_dau: 'Chưa bắt đầu', dang_lam: 'Đang làm', hoan_thanh: 'Hoàn thành', tre: 'Trễ hạn' }

const CONTENT_WIDTH = 13680 // landscape, lề 1080 mỗi bên trên khổ 15840

function txt(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean; font?: string } = {}) {
  return new TextRun({ text, font: opts.font ?? FONT_BODY, bold: opts.bold, size: opts.size ?? 20, color: opts.color, italics: opts.italics })
}

function para(children: TextRun[], opts: { align?: typeof AlignmentType[keyof typeof AlignmentType]; before?: number; after?: number } = {}) {
  return new Paragraph({ alignment: opts.align, spacing: { before: opts.before ?? 0, after: opts.after ?? 80 }, children })
}

function cell(text: string, width: number, opts: { bold?: boolean; shade?: string; align?: typeof AlignmentType[keyof typeof AlignmentType]; size?: number; color?: string } = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      children: [txt(text, { bold: opts.bold, size: opts.size ?? 18, color: opts.shade === NAVY ? 'FFFFFF' : opts.color })],
    })],
  })
}

function hdrCell(text: string, width: number) { return cell(text, width, { bold: true, shade: NAVY, align: AlignmentType.CENTER }) }

// Ô "Công việc": tên đậm + phòng ban/dự án nhỏ mờ ngay dưới
function taskCell(t: Task, width: number) {
  const sub = [t.department, t.project].filter(Boolean).join(' · ')
  const children = [
    new TextRun({ text: t.title, font: FONT_BODY, bold: true, size: 19 }),
    ...(sub ? [new TextRun({ text: '', break: 1 }), new TextRun({ text: sub, font: FONT_BODY, size: 15, color: '6B7280' })] : []),
  ]
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ children })],
  })
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [txt(text, { bold: true, size: 24, color: NAVY })],
    spacing: { before: 200, after: 100 },
  })
}

function sectionBanner(text: string, color: string) {
  return new Paragraph({
    children: [txt(text, { bold: true, size: 28, color: 'FFFFFF' })],
    spacing: { before: 260, after: 160 },
    shading: { fill: color, type: ShadingType.CLEAR },
    indent: { left: 200, right: 200 },
  })
}

// ── Tổng quan ngắn (1 dòng số liệu, không lập bảng nhiều tầng) ─────────────────
function buildOverviewLine(tasks: Task[]): Paragraph {
  const total   = tasks.length
  const done    = tasks.filter(t => t.status === 'hoan_thanh').length
  const late    = tasks.filter(t => t.status === 'tre').length
  const doing   = tasks.filter(t => t.status === 'dang_lam').length
  const avgProg = total ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total) : 0
  return para([
    txt(`Tổng: `, { color: '6B7280', size: 19 }), txt(`${total} việc`, { bold: true, size: 19 }),
    txt(`   ·   Hoàn thành: `, { color: '6B7280', size: 19 }), txt(`${done}`, { bold: true, size: 19, color: '166534' }),
    txt(`   ·   Đang làm: `, { color: '6B7280', size: 19 }), txt(`${doing}`, { bold: true, size: 19, color: '1D4ED8' }),
    txt(`   ·   Trễ hạn: `, { color: '6B7280', size: 19 }), txt(`${late}`, { bold: true, size: 19, color: late > 0 ? 'C00000' : '6B7280' }),
    txt(`   ·   Tiến độ TB: `, { color: '6B7280', size: 19 }), txt(`${avgProg}%`, { bold: true, size: 19, color: NAVY }),
  ], { before: 40, after: 160 })
}

// ── Bảng công việc gộp — 1 bảng duy nhất, sắp khẩn lên trên / hoàn thành xuống dưới ──
function buildTaskTable(tasks: Task[]): Table {
  const sorted = [...tasks].sort((a, b) => taskSortRank(a) - taskSortRank(b))
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [3800, 1600, 1200, 1000, 1300, 4780],
    rows: [
      new TableRow({ tableHeader: true, children: [
        hdrCell('Công việc', 3800), hdrCell('Người phụ trách', 1600),
        hdrCell('Deadline', 1200),  hdrCell('Tiến độ', 1000),
        hdrCell('Trạng thái', 1300), hdrCell('Diễn biến / Đề xuất', 4780),
      ]}),
      ...sorted.map(t => new TableRow({ children: [
        taskCell(t, 3800),
        cell(t.assignedTo || '—', 1600),
        cell(t.deadline || '—',   1200, { align: AlignmentType.CENTER }),
        cell(`${t.progress}%`,   1000, { align: AlignmentType.CENTER }),
        cell(STATUS_LABEL_V[t.status], 1300, { shade: STATUS_SHADE[t.status], align: AlignmentType.CENTER }),
        cell([t.dienBien, t.deXuat].filter(Boolean).join(' — ') || '—', 4780, { size: 16 }),
      ]})),
    ],
  })
}

function buildPart(tasks: Task[], bannerLabel: string, bannerColor: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [sectionBanner(bannerLabel, bannerColor)]
  if (tasks.length === 0) {
    out.push(para([txt('Không có công việc nào trong kỳ này.', { size: 20, color: '6B7280', italics: true })], { before: 80, after: 200 }))
    return out
  }
  out.push(buildOverviewLine(tasks))
  out.push(buildTaskTable(tasks))
  out.push(para([], { after: 240 }))
  return out
}

// ── Khối chữ ký 3 cột (bảng không viền, chỉ để canh layout) ────────────────────
function signatureBlock(reportedBy: string): Table {
  const sigCell = (label: string, name: string) => new TableCell({
    borders: NO_BORDERS,
    width: { size: CONTENT_WIDTH / 3, type: WidthType.DXA },
    children: [
      para([txt(label, { bold: true, size: 20 })], { align: AlignmentType.CENTER, after: 60 }),
      para([txt('(Ký, ghi rõ họ tên)', { size: 16, color: '6B7280', italics: true })], { align: AlignmentType.CENTER, after: 600 }),
      para([txt(name || '', { bold: true, size: 20 })], { align: AlignmentType.CENTER }),
    ],
  })
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH / 3, CONTENT_WIDTH / 3, CONTENT_WIDTH / 3],
    rows: [new TableRow({ children: [
      sigCell('Người lập báo cáo', reportedBy),
      sigCell('Trưởng phòng xác nhận', ''),
      sigCell('Ban Giám đốc phê duyệt', ''),
    ]})],
  })
}

// ── Build document ────────────────────────────────────────────────────────────
function buildDoc(
  currentTasks: Task[],
  nextTasks: Task[] | null,
  title: string,
  subtitle: string,
  currentLabel: string,
  nextLabel: string,
  reportedBy: string,
) {
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const children: (Paragraph | Table)[] = [
    // ── Tiêu đề & thông tin báo cáo ──
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [txt(title, { bold: true, size: 44, color: NAVY, font: FONT_TITLE })], spacing: { after: 100 } }),
    para([txt(subtitle || `Ngày xuất: ${today}`, { size: 20, color: '6B7280' })], { after: 40 }),
    para([txt('Người lập báo cáo: ', { size: 19, color: '374151' }), txt(reportedBy || '—', { bold: true, size: 19 })], { after: 20 }),
    para([txt('Ngày xuất báo cáo: ', { size: 19, color: '374151' }), txt(today, { bold: true, size: 19 })], { after: 240 }),
  ]

  if (nextTasks !== null) {
    // ── Đúng 2 phần theo yêu cầu: kỳ này / kỳ tới ──
    children.push(...buildPart(currentTasks, `PHẦN 1: BÁO CÁO CÔNG VIỆC ${currentLabel.toUpperCase()}`, NAVY))
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...buildPart(nextTasks, `PHẦN 2: BÁO CÁO CÔNG VIỆC ${nextLabel.toUpperCase()}`, '0891B2'))
  } else {
    // ── Chế độ tuỳ chọn: chỉ 1 phần, không đánh số ──
    children.push(...buildPart(currentTasks, `BÁO CÁO CÔNG VIỆC — ${currentLabel.toUpperCase()}`, NAVY))
  }

  children.push(signatureBlock(reportedBy))

  return new Document({
    styles: {
      default: { document: { run: { font: FONT_BODY, size: 20 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: FONT_TITLE, color: NAVY },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, font: FONT_BODY, color: NAVY },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 15840, height: 12240 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 1 } },
          children: [
            txt('BÁO CÁO TÌNH TRẠNG CÔNG VIỆC', { bold: true, size: 20, color: NAVY }),
            txt(`\t${today}`, { size: 18, color: '6B7280' }),
          ],
          tabStops: [{ type: 'right' as never, position: CONTENT_WIDTH }],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E0D8', space: 1 } },
          alignment: AlignmentType.CENTER,
          children: [
            txt('Trang ', { size: 18, color: '9CA3AF' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT_BODY, color: '9CA3AF' }),
            txt(' / ', { size: 18, color: '9CA3AF' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: FONT_BODY, color: '9CA3AF' }),
          ],
        })] }),
      },
      children,
    }],
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      tasks: rawTasks = [],
      reportMode = 'custom',
      status, priority, department, project,
      dateFrom, dateTo,
      title, subtitle, reportedBy,
    } = body as {
      tasks?: Task[]
      reportMode?: 'week' | 'month' | 'custom'
      status?: string; priority?: string; department?: string; project?: string
      dateFrom?: string; dateTo?: string; title?: string; subtitle?: string; reportedBy?: string
    }

    // Apply common filters
    let allTasks = [...rawTasks] as Task[]
    if (status)     allTasks = allTasks.filter(t => t.status === status as TaskStatus)
    if (priority)   allTasks = allTasks.filter(t => t.priority === priority as TaskPriority)
    if (department) allTasks = allTasks.filter(t => t.department === department)
    if (project)    allTasks = allTasks.filter(t => t.project === project)

    let currentTasks: Task[] = allTasks
    let nextTasks: Task[] | null = null
    let currentLabel = subtitle || 'Báo cáo công việc'
    let nextLabel = ''
    let docTitle = title || 'BÁO CÁO TÌNH TRẠNG CÔNG VIỆC'
    let docSubtitle = subtitle || `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`

    if (reportMode === 'week') {
      const cur  = getWeekRange(0)
      const next = getWeekRange(1)
      currentTasks = allTasks.filter(t => taskOverlapsRange(t.deadline, t.createdAt, cur.from, cur.to))
      nextTasks    = allTasks.filter(t => taskOverlapsRange(t.deadline, t.createdAt, next.from, next.to))
      currentLabel = `Tuần này (${cur.label})`
      nextLabel    = `Tuần tới (${next.label})`
      docTitle    = title || 'BÁO CÁO CÔNG VIỆC TUẦN'
      docSubtitle  = `${cur.label} · Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`
    } else if (reportMode === 'month') {
      const cur  = getMonthRange(0)
      const next = getMonthRange(1)
      currentTasks = allTasks.filter(t => taskOverlapsRange(t.deadline, t.createdAt, cur.from, cur.to))
      nextTasks    = allTasks.filter(t => taskOverlapsRange(t.deadline, t.createdAt, next.from, next.to))
      currentLabel = cur.label
      nextLabel    = next.label
      docTitle    = title || 'BÁO CÁO CÔNG VIỆC THÁNG'
      docSubtitle  = `${cur.label} · Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`
    } else {
      // custom range
      if (dateFrom || dateTo) currentTasks = currentTasks.filter(t => taskOverlapsRange(t.deadline, t.createdAt, dateFrom, dateTo))
      currentLabel = subtitle || 'Toàn bộ công việc'
    }

    const doc    = buildDoc(currentTasks, nextTasks, docTitle, docSubtitle, currentLabel, nextLabel, reportedBy || '')
    const buffer = await Packer.toBuffer(doc)
    const uint8  = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="bao-cao-cong-viec.docx"`,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
