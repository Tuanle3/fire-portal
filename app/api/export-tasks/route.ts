import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  Header, Footer, PageNumber, VerticalAlign, PageBreak,
} from 'docx'
import { PRIORITY_LABEL, STATUS_LABEL, Task, TaskStatus, TaskPriority } from '@/lib/tasks-mock'

// ── Helpers ──────────────────────────────────────────────────────────────────
const BORDER    = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS   = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

const PRIORITY_SHADE: Record<TaskPriority, string> = { thấp: 'F3F4F6', trung: 'EFF6FF', cao: 'FFFBEB', khẩn: 'FEF2F2' }
const STATUS_SHADE:   Record<TaskStatus,   string> = { chua_bat_dau: 'F3F4F6', dang_lam: 'EFF6FF', hoan_thanh: 'F0FDF4', tre: 'FEF2F2' }
const STATUS_LABEL_V: Record<TaskStatus,   string> = { chua_bat_dau: 'Chưa bắt đầu', dang_lam: 'Đang làm', hoan_thanh: 'Hoàn thành', tre: 'Trễ hạn' }

function txt(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
  return new TextRun({ text, font: 'Times New Roman', bold: opts.bold, size: opts.size ?? 20, color: opts.color, italics: opts.italics })
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
      children: [txt(text, { bold: opts.bold, size: opts.size ?? 18, color: opts.shade === '1C3557' ? 'FFFFFF' : opts.color })],
    })],
  })
}

function hdrCell(text: string, width: number) { return cell(text, width, { bold: true, shade: '1C3557', align: AlignmentType.CENTER }) }

// Cell with bold title on first line + italic description below
function cellWithDesc(title: string, desc: string | undefined, width: number) {
  const children = [
    new TextRun({ text: title, font: 'Times New Roman', bold: true, size: 18 }),
    ...(desc ? [
      new TextRun({ text: '', break: 1 }),
      new TextRun({ text: desc, font: 'Times New Roman', size: 16, color: '6B7280', italics: true }),
    ] : []),
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
    children: [txt(text, { bold: true, size: 26, color: '1C3557' })],
    spacing: { before: 240, after: 120 },
  })
}

function h3(text: string) {
  return new Paragraph({
    children: [txt(text, { bold: true, size: 22, color: '1C3557' })],
    spacing: { before: 180, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
  })
}

function sectionBanner(text: string, color: string) {
  return new Paragraph({
    children: [txt(text, { bold: true, size: 28, color: 'FFFFFF' })],
    spacing: { before: 200, after: 200 },
    shading: { fill: color, type: ShadingType.CLEAR },
    indent: { left: 200, right: 200 },
  })
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

function getWeekRange(offsetWeeks = 0): { from: string; to: string; label: string } {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offsetWeeks * 7)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return {
    from: isoDate(mon),
    to:   isoDate(sun),
    label: `${mon.getDate().toString().padStart(2,'0')}/${(mon.getMonth()+1).toString().padStart(2,'0')} – ${sun.getDate().toString().padStart(2,'0')}/${(sun.getMonth()+1).toString().padStart(2,'0')}/${sun.getFullYear()}`,
  }
}

function getMonthRange(offsetMonths = 0): { from: string; to: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offsetMonths
  const first = new Date(y, m, 1)
  const last  = new Date(y, m + 1, 0)
  return {
    from: isoDate(first),
    to:   isoDate(last),
    label: `Tháng ${(first.getMonth()+1).toString().padStart(2,'0')}/${first.getFullYear()}`,
  }
}

// ── Stats block ───────────────────────────────────────────────────────────────
interface DeptData { dept: string; total: number; done: number; late: number; inProgress: number; urgent: number; avgProg: number; rate: number; tasks: Task[] }
interface DeptAccum { total: number; done: number; late: number; inProgress: number; urgent: number; avgProg: number; tasks: Task[] }

function buildStatsRows(tasks: Task[]): (Paragraph | Table)[] {
  const totalTasks = tasks.length
  const done       = tasks.filter(t => t.status === 'hoan_thanh').length
  const inProg     = tasks.filter(t => t.status === 'dang_lam').length
  const overdue    = tasks.filter(t => t.status === 'tre').length
  const notStarted = tasks.filter(t => t.status === 'chua_bat_dau').length
  const avgProg    = totalTasks ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / totalTasks) : 0

  return [
    new Table({
      width: { size: 13680, type: WidthType.DXA },
      columnWidths: [2280, 2280, 2280, 2280, 2280, 2280],
      rows: [
        new TableRow({ children: [hdrCell('Tổng số CV', 2280), hdrCell('Đang làm', 2280), hdrCell('Hoàn thành', 2280), hdrCell('Trễ hạn', 2280), hdrCell('Chưa bắt đầu', 2280), hdrCell('Tiến độ TB', 2280)] }),
        new TableRow({ children: [
          cell(String(totalTasks), 2280, { align: AlignmentType.CENTER, bold: true }),
          cell(String(inProg),     2280, { align: AlignmentType.CENTER, shade: 'EFF6FF' }),
          cell(String(done),       2280, { align: AlignmentType.CENTER, shade: 'F0FDF4' }),
          cell(String(overdue),    2280, { align: AlignmentType.CENTER, shade: overdue > 0 ? 'FEF2F2' : undefined }),
          cell(String(notStarted), 2280, { align: AlignmentType.CENTER, shade: 'F3F4F6' }),
          cell(`${avgProg}%`,      2280, { align: AlignmentType.CENTER }),
        ]}),
      ],
    }) as unknown as Paragraph,
    para([], { after: 160 }),
  ]
}

function buildDeptRows(tasks: Task[]): DeptData[] {
  const deptMap = new Map<string, DeptAccum>()
  for (const t of tasks) {
    const key = t.department || 'Chưa phân loại'
    const d = deptMap.get(key) ?? { total: 0, done: 0, late: 0, inProgress: 0, urgent: 0, avgProg: 0, tasks: [] }
    d.total++; d.tasks.push(t)
    if (t.status === 'hoan_thanh') d.done++
    if (t.status === 'tre')        d.late++
    if (t.status === 'dang_lam')   d.inProgress++
    if (t.priority === 'khẩn')     d.urgent++
    d.avgProg += t.progress
    deptMap.set(key, d)
  }
  return [...deptMap.entries()].map(([dept, d]): DeptData => ({
    dept,
    total:      d.total,
    done:       d.done,
    late:       d.late,
    inProgress: d.inProgress,
    urgent:     d.urgent,
    tasks:      d.tasks,
    avgProg:    d.total ? Math.round(d.avgProg / d.total) : 0,
    rate:       d.total ? Math.round((d.done / d.total) * 100) : 0,
  })).sort((a, b) => b.late - a.late || b.urgent - a.urgent || b.total - a.total)
}

function buildDeptSummaryTable(depts: DeptData[]): (Paragraph | Table)[] {
  return [
    new Table({
      width: { size: 13680, type: WidthType.DXA },
      columnWidths: [2736, 1368, 1368, 1368, 1710, 1710, 3420],
      rows: [
        new TableRow({ children: [
          hdrCell('Phòng ban', 2736), hdrCell('Tổng CV', 1368),
          hdrCell('HT', 1368),        hdrCell('Trễ', 1368),
          hdrCell('Tỷ lệ HT (%)', 1710), hdrCell('TĐ TB (%)', 1710),
          hdrCell('Có đề xuất / diễn biến', 3420),
        ]}),
        ...depts.map(d => {
          const hasUpdate = d.tasks.filter(t => t.dienBien || t.deXuat).length
          const note = hasUpdate > 0 ? `${hasUpdate} / ${d.total} công việc có cập nhật` : '—'
          return new TableRow({ children: [
            cell(d.dept,          2736, { bold: d.late > 0 }),
            cell(String(d.total), 1368, { align: AlignmentType.CENTER }),
            cell(String(d.done),  1368, { align: AlignmentType.CENTER, shade: 'F0FDF4' }),
            cell(String(d.late),  1368, { align: AlignmentType.CENTER, shade: d.late > 0 ? 'FEF2F2' : undefined }),
            cell(`${d.rate}%`,    1710, { align: AlignmentType.CENTER }),
            cell(`${d.avgProg}%`, 1710, { align: AlignmentType.CENTER }),
            cell(note,            3420, { size: 16 }),
          ]})
        }),
      ],
    }) as unknown as Paragraph,
    para([], { after: 160 }),
  ]
}

function buildDeptDetailSections(depts: DeptData[]): Paragraph[] {
  const out: Paragraph[] = []
  depts.forEach((d, idx) => {
    out.push(h3(`${String.fromCharCode(65 + idx)}. ${d.dept.toUpperCase()} — ${d.total} công việc · HT: ${d.rate}% · TĐ TB: ${d.avgProg}%`))
    out.push(new Table({
      width: { size: 13680, type: WidthType.DXA },
      columnWidths: [3420, 2052, 2052, 2052, 2052, 2052],
      rows: [
        new TableRow({ children: [hdrCell('Tổng CV', 3420), hdrCell('Đang làm', 2052), hdrCell('Hoàn thành', 2052), hdrCell('Trễ hạn', 2052), hdrCell('Khẩn cấp', 2052), hdrCell('Tiến độ TB', 2052)] }),
        new TableRow({ children: [
          cell(String(d.total),      3420, { align: AlignmentType.CENTER, bold: true }),
          cell(String(d.inProgress), 2052, { align: AlignmentType.CENTER, shade: 'EFF6FF' }),
          cell(String(d.done),       2052, { align: AlignmentType.CENTER, shade: 'F0FDF4' }),
          cell(String(d.late),       2052, { align: AlignmentType.CENTER, shade: d.late > 0 ? 'FEF2F2' : undefined }),
          cell(String(d.urgent),     2052, { align: AlignmentType.CENTER, shade: d.urgent > 0 ? 'FFFBEB' : undefined }),
          cell(`${d.avgProg}%`,      2052, { align: AlignmentType.CENTER }),
        ]}),
      ],
    }) as unknown as Paragraph)
    out.push(para([]))

    if (d.tasks.length > 0) {
      out.push(para([txt('Danh sách công việc:', { bold: true, size: 20, color: '374151' })], { before: 80 }))
      const sorted = [...d.tasks].sort((a, b) => {
        const order = { khẩn: 0, cao: 1, trung: 2, thấp: 3 }
        return order[a.priority] - order[b.priority]
      })
      out.push(new Table({
        width: { size: 13680, type: WidthType.DXA },
        columnWidths: [2600, 1500, 1320, 1400, 1200, 1080, 2840, 1740],
        rows: [
          new TableRow({ tableHeader: true, children: [
            hdrCell('Tên công việc', 2600), hdrCell('Người phụ trách', 1500),
            hdrCell('Ưu tiên', 1320),       hdrCell('Trạng thái', 1400),
            hdrCell('Tiến độ', 1200),        hdrCell('Deadline', 1080),
            hdrCell('Diễn biến', 2840),      hdrCell('Đề xuất / Hỗ trợ', 1740),
          ]}),
          ...sorted.map(t => new TableRow({ children: [
            cellWithDesc(t.title, t.description, 2600),
            cell(t.assignedTo || '—',        1500),
            cell(PRIORITY_LABEL[t.priority], 1320, { shade: PRIORITY_SHADE[t.priority], align: AlignmentType.CENTER }),
            cell(STATUS_LABEL_V[t.status],   1400, { shade: STATUS_SHADE[t.status],     align: AlignmentType.CENTER }),
            cell(`${t.progress}%`,           1200, { align: AlignmentType.CENTER }),
            cell(t.deadline || '—',          1080, { align: AlignmentType.CENTER }),
            cell(t.dienBien || '—',          2840, { size: 16 }),
            cell(t.deXuat   || '—',          1740, { size: 16, shade: t.deXuat ? 'FFFBEB' : undefined }),
          ]})),
        ],
      }) as unknown as Paragraph)
    }
    out.push(para([], { after: 200 }))
    if (idx < depts.length - 1) out.push(new Paragraph({ children: [new PageBreak()] }))
  })
  return out
}

function buildAllTasksTable(tasks: Task[]): (Paragraph | Table)[] {
  return [
    new Table({
      width: { size: 13680, type: WidthType.DXA },
      columnWidths: [2000, 1300, 1300, 1000, 1100, 1100, 900, 900, 1840, 1240],
      rows: [
        new TableRow({ tableHeader: true, children: [
          hdrCell('Tên công việc', 2400), hdrCell('Người phụ trách', 1400),
          hdrCell('Phòng ban', 1500),
          hdrCell('Ưu tiên', 1200),       hdrCell('Trạng thái', 1200),
          hdrCell('Tiến độ', 900),         hdrCell('Deadline', 900),
          hdrCell('Diễn biến', 2040),      hdrCell('Đề xuất', 1140),
        ]}),
        ...tasks.map(t => new TableRow({ children: [
          cellWithDesc(t.title, t.description, 2400),
          cell(t.assignedTo || '—',        1400),
          cell(t.department || '—',        1500),
          cell(PRIORITY_LABEL[t.priority], 1200, { shade: PRIORITY_SHADE[t.priority], align: AlignmentType.CENTER }),
          cell(STATUS_LABEL_V[t.status],   1200, { shade: STATUS_SHADE[t.status],     align: AlignmentType.CENTER }),
          cell(`${t.progress}%`,            900, { align: AlignmentType.CENTER }),
          cell(t.deadline || '—',           900, { align: AlignmentType.CENTER }),
          cell(t.dienBien || '—',          2040, { size: 16 }),
          cell(t.deXuat   || '—',          1140, { size: 16, shade: t.deXuat ? 'FFFBEB' : undefined }),
        ]})),
      ],
    }) as unknown as Paragraph,
    para([], { after: 300 }),
  ]
}

// ── Build document ────────────────────────────────────────────────────────────
function buildDoc(
  currentTasks: Task[],
  nextTasks: Task[] | null,
  title: string,
  subtitle: string,
  currentLabel: string,
  nextLabel: string,
) {
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const currentDepts = buildDeptRows(currentTasks)

  const children: (Paragraph | Table)[] = [
    // ── Cover ──
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [txt(title, { bold: true, size: 44, color: '1C3557' })], spacing: { after: 60 } }),
    para([txt(subtitle || `Ngày xuất: ${today}`, { size: 20, color: '6B7280' })], { after: 280 }),

    // ── PHẦN A: KỲ HIỆN TẠI ──
    sectionBanner(`▌ PHẦN A — ${currentLabel.toUpperCase()}`, '1C3557'),
    h2('I. TỔNG QUAN'),
    ...buildStatsRows(currentTasks),
    h2('II. TÓM TẮT THEO PHÒNG BAN'),
    ...buildDeptSummaryTable(currentDepts),
    h2('III. CHI TIẾT THEO PHÒNG BAN'),
    para([txt('Mỗi phòng ban hiển thị danh sách công việc kèm diễn biến và đề xuất.', { size: 18, color: '6B7280', italics: true })], { after: 200 }),
    ...buildDeptDetailSections(currentDepts),
    new Paragraph({ children: [new PageBreak()] }),
    h2('IV. DANH SÁCH TOÀN BỘ CÔNG VIỆC'),
    ...buildAllTasksTable(currentTasks),
  ]

  // ── PHẦN B: KỲ TIẾP THEO (nếu có) ──
  if (nextTasks && nextTasks.length > 0) {
    const nextDepts = buildDeptRows(nextTasks)
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(sectionBanner(`▌ PHẦN B — KẾ HOẠCH ${nextLabel.toUpperCase()}`, '0891B2'))
    children.push(h2('I. TỔNG QUAN KỲ TỚI'))
    children.push(...buildStatsRows(nextTasks))
    children.push(h2('II. TÓM TẮT THEO PHÒNG BAN'))
    children.push(...buildDeptSummaryTable(nextDepts))
    children.push(h2('III. DANH SÁCH CÔNG VIỆC KẾ HOẠCH'))
    children.push(...buildAllTasksTable(nextTasks))
  } else if (nextTasks && nextTasks.length === 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(sectionBanner(`▌ PHẦN B — KẾ HOẠCH ${nextLabel.toUpperCase()}`, '0891B2'))
    children.push(para([txt('Chưa có công việc nào được lên kế hoạch cho kỳ này.', { size: 20, color: '6B7280', italics: true })], { before: 200 }))
  }

  // ── Signature ──
  children.push(para([txt(`${today}`, { size: 18, color: '6B7280', italics: true })], { before: 300, after: 0 }))
  children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(`${today}`, { size: 18, color: '6B7280', italics: true })] }))
  children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt('Người lập báo cáo', { bold: true, size: 22 })], spacing: { after: 600 } }))

  return new Document({
    styles: {
      default: { document: { run: { font: 'Times New Roman', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: 'Times New Roman', color: '1C3557' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: 'Times New Roman', color: '1C3557' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 15840, height: 12240 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1C3557', space: 1 } },
          children: [
            txt('BÁO CÁO TÌNH TRẠNG CÔNG VIỆC', { bold: true, size: 20, color: '1C3557' }),
            txt(`\t${today}`, { size: 18, color: '6B7280' }),
          ],
          tabStops: [{ type: 'right' as never, position: 13680 }],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E0D8', space: 1 } },
          alignment: AlignmentType.CENTER,
          children: [
            txt('Trang ', { size: 18, color: '9CA3AF' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Times New Roman', color: '9CA3AF' }),
            txt(' / ', { size: 18, color: '9CA3AF' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Times New Roman', color: '9CA3AF' }),
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
      title, subtitle,
    } = body as {
      tasks?: Task[]
      reportMode?: 'week' | 'month' | 'custom'
      status?: string; priority?: string; department?: string; project?: string
      dateFrom?: string; dateTo?: string; title?: string; subtitle?: string
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
      currentTasks = allTasks.filter(t => t.deadline >= cur.from && t.deadline <= cur.to)
      nextTasks    = allTasks.filter(t => t.deadline >= next.from && t.deadline <= next.to)
      currentLabel = `Tuần này (${cur.label})`
      nextLabel    = `Tuần tới (${next.label})`
      docTitle    = title || 'BÁO CÁO CÔNG VIỆC TUẦN'
      docSubtitle  = `${cur.label} · Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`
    } else if (reportMode === 'month') {
      const cur  = getMonthRange(0)
      const next = getMonthRange(1)
      currentTasks = allTasks.filter(t => t.deadline >= cur.from && t.deadline <= cur.to)
      nextTasks    = allTasks.filter(t => t.deadline >= next.from && t.deadline <= next.to)
      currentLabel = cur.label
      nextLabel    = next.label
      docTitle    = title || 'BÁO CÁO CÔNG VIỆC THÁNG'
      docSubtitle  = `${cur.label} · Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`
    } else {
      // custom range
      if (dateFrom) currentTasks = currentTasks.filter(t => t.deadline >= dateFrom)
      if (dateTo)   currentTasks = currentTasks.filter(t => t.deadline && t.deadline <= dateTo)
      currentLabel = subtitle || 'Toàn bộ công việc'
    }

    const doc    = buildDoc(currentTasks, nextTasks, docTitle, docSubtitle, currentLabel, nextLabel)
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
