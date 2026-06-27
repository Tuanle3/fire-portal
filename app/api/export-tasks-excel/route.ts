import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { Task, TaskStatus, TaskPriority, PRIORITY_LABEL } from '@/lib/tasks-mock'

const STATUS_LABEL_V: Record<TaskStatus, string> = {
  chua_bat_dau: 'Chưa bắt đầu',
  dang_lam:     'Đang làm',
  hoan_thanh:   'Hoàn thành',
  tre:          'Trễ hạn',
}

function getWeekRange(offsetWeeks = 0) {
  const now = new Date(); const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offsetWeeks * 7)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
}

function getMonthRange(offsetMonths = 0) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offsetMonths
  return {
    from: new Date(y, m, 1).toISOString().slice(0, 10),
    to:   new Date(y, m + 1, 0).toISOString().slice(0, 10),
  }
}

function tasksToRows(tasks: Task[]) {
  return tasks.map((t, i) => ({
    'STT':             i + 1,
    'Tên công việc':   t.title,
    'Mô tả':           t.description || '',
    'Người giao':      t.assignedBy || '',
    'Người phụ trách': t.assignedTo || '',
    'Phòng ban':       t.department || '',
    'Ưu tiên':         PRIORITY_LABEL[t.priority] || t.priority,
    'Trạng thái':      STATUS_LABEL_V[t.status] || t.status,
    'Tiến độ (%)':     t.progress,
    'Deadline':        t.deadline || '',
    'Diễn biến':       t.dienBien || '',
    'Đề xuất / Hỗ trợ': t.deXuat || '',
    'Ghi chú':         t.notes || '',
    'Tạo ngày':        t.createdAt || '',
    'Cập nhật':        t.updatedAt || '',
  }))
}

function applyHeaderStyle(ws: XLSX.WorkSheet, range: XLSX.Range) {
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C })
    if (!ws[addr]) continue
    ws[addr].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' }, name: 'Times New Roman', sz: 11 },
      fill:      { fgColor: { rgb: '1C3557' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top:    { style: 'thin', color: { rgb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
        left:   { style: 'thin', color: { rgb: 'FFFFFF' } },
        right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
      },
    }
  }
}

function applyBodyStyle(ws: XLSX.WorkSheet, range: XLSX.Range) {
  const STATUS_COLORS: Record<string, string> = {
    'Trễ hạn': 'FEF2F2', 'Hoàn thành': 'F0FDF4', 'Đang làm': 'EFF6FF', 'Chưa bắt đầu': 'F3F4F6',
  }
  const PRIORITY_COLORS: Record<string, string> = {
    'Khẩn cấp': 'FEF2F2', 'Cao': 'FFFBEB', 'Trung bình': 'EFF6FF', 'Thấp': 'F3F4F6',
  }

  for (let R = 1; R <= range.e.r; R++) {
    const statusCell = ws[XLSX.utils.encode_cell({ r: R, c: 7 })]
    const statusVal  = statusCell?.v as string ?? ''
    const priorityCell = ws[XLSX.utils.encode_cell({ r: R, c: 6 })]
    const priorityVal  = priorityCell?.v as string ?? ''
    const rowBg = (R % 2 === 0) ? 'F8F9FA' : 'FFFFFF'

    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      const isCenterCol = [0, 8, 9].includes(C)
      let bg = rowBg
      if (C === 7 && STATUS_COLORS[statusVal])   bg = STATUS_COLORS[statusVal]
      if (C === 6 && PRIORITY_COLORS[priorityVal]) bg = PRIORITY_COLORS[priorityVal]

      ws[addr].s = {
        font:      { name: 'Times New Roman', sz: 11 },
        fill:      { fgColor: { rgb: bg } },
        alignment: { horizontal: isCenterCol ? 'center' : 'left', vertical: 'top', wrapText: true },
        border: {
          top:    { style: 'thin', color: { rgb: 'E5E7EB' } },
          bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
          left:   { style: 'thin', color: { rgb: 'E5E7EB' } },
          right:  { style: 'thin', color: { rgb: 'E5E7EB' } },
        },
      }
    }
  }
}

function buildSheet(tasks: Task[], sheetName: string): XLSX.WorkSheet {
  const rows = tasksToRows(tasks)
  const ws   = XLSX.utils.json_to_sheet(rows)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')

  // Column widths
  ws['!cols'] = [
    { wch: 5 },   // STT
    { wch: 32 },  // Tên CV
    { wch: 40 },  // Mô tả
    { wch: 18 },  // Người giao
    { wch: 18 },  // Người PT
    { wch: 16 },  // Phòng ban
    { wch: 12 },  // Ưu tiên
    { wch: 14 },  // Trạng thái
    { wch: 10 },  // Tiến độ
    { wch: 12 },  // Deadline
    { wch: 36 },  // Diễn biến
    { wch: 30 },  // Đề xuất
    { wch: 20 },  // Ghi chú
    { wch: 12 },  // Tạo ngày
    { wch: 12 },  // Cập nhật
  ]
  ws['!rows'] = [{ hpt: 30 }]  // header row height

  applyHeaderStyle(ws, range)
  applyBodyStyle(ws, range)

  return ws
}

function buildDeptSheet(tasks: Task[]): XLSX.WorkSheet {
  const deptMap = new Map<string, Task[]>()
  tasks.forEach(t => {
    const d = t.department || 'Chưa phân loại'
    deptMap.set(d, [...(deptMap.get(d) ?? []), t])
  })

  const rows: Record<string, string | number>[] = []
  for (const [dept, dTasks] of deptMap) {
    const total   = dTasks.length
    const done    = dTasks.filter(t => t.status === 'hoan_thanh').length
    const late    = dTasks.filter(t => t.status === 'tre').length
    const inProg  = dTasks.filter(t => t.status === 'dang_lam').length
    const urgent  = dTasks.filter(t => t.priority === 'khẩn').length
    const avgProg = total ? Math.round(dTasks.reduce((s, t) => s + t.progress, 0) / total) : 0
    const rate    = total ? Math.round((done / total) * 100) : 0
    rows.push({
      'Phòng ban':      dept,
      'Tổng CV':        total,
      'Đang làm':       inProg,
      'Hoàn thành':     done,
      'Trễ hạn':        late,
      'Khẩn cấp':       urgent,
      'Tỷ lệ HT (%)':   rate,
      'Tiến độ TB (%)': avgProg,
    })
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }]
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  applyHeaderStyle(ws, range)
  applyBodyStyle(ws, range)
  return ws
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      tasks: rawTasks = [],
      reportMode = 'custom',
      status, priority, department, project,
      dateFrom, dateTo,
    } = body as {
      tasks?: Task[]; reportMode?: 'week' | 'month' | 'custom'
      status?: string; priority?: string; department?: string; project?: string
      dateFrom?: string; dateTo?: string
    }

    let allTasks = [...rawTasks] as Task[]
    if (status)     allTasks = allTasks.filter(t => t.status === status as TaskStatus)
    if (priority)   allTasks = allTasks.filter(t => t.priority === priority as TaskPriority)
    if (department) allTasks = allTasks.filter(t => t.department === department)
    if (project)    allTasks = allTasks.filter(t => t.project === project)

    let currentTasks = allTasks
    let nextTasks: Task[] = []

    if (reportMode === 'week') {
      const cur = getWeekRange(0); const nxt = getWeekRange(1)
      currentTasks = allTasks.filter(t => t.deadline >= cur.from && t.deadline <= cur.to)
      nextTasks    = allTasks.filter(t => t.deadline >= nxt.from && t.deadline <= nxt.to)
    } else if (reportMode === 'month') {
      const cur = getMonthRange(0); const nxt = getMonthRange(1)
      currentTasks = allTasks.filter(t => t.deadline >= cur.from && t.deadline <= cur.to)
      nextTasks    = allTasks.filter(t => t.deadline >= nxt.from && t.deadline <= nxt.to)
    } else {
      if (dateFrom) currentTasks = currentTasks.filter(t => t.deadline >= dateFrom)
      if (dateTo)   currentTasks = currentTasks.filter(t => t.deadline && t.deadline <= dateTo)
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Tổng hợp phòng ban
    XLSX.utils.book_append_sheet(wb, buildDeptSheet(currentTasks), 'Tổng hợp phòng ban')

    // Sheet 2: Kỳ hiện tại
    XLSX.utils.book_append_sheet(wb, buildSheet(currentTasks, 'Kỳ hiện tại'), 'Kỳ hiện tại')

    // Sheet 3: Kỳ tiếp theo (nếu có)
    if (nextTasks.length > 0) {
      XLSX.utils.book_append_sheet(wb, buildSheet(nextTasks, 'Kế hoạch kỳ tới'), 'Kế hoạch kỳ tới')
    }

    // Sheet 4: Tất cả công việc
    XLSX.utils.book_append_sheet(wb, buildSheet(allTasks, 'Tất cả công việc'), 'Tất cả công việc')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="bao-cao-cong-viec.xlsx"',
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Export Excel failed' }, { status: 500 })
  }
}
