'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DEPARTMENTS, PROJECTS, MEMBERS,
  PRIORITY_LABEL, STATUS_LABEL, EVAL_LABEL,
  Task, TaskPriority, TaskStatus, TaskEval,
} from '@/lib/tasks-mock'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { subscribeToTasks, saveTask as fsSave, deleteTask as fsDelete, seedMockTasks } from '@/lib/tasks-store'
import { subscribeToUsers, StaffUser } from '@/lib/users-store'
import { subscribeToDepartments, Department } from '@/lib/departments-store'
import { subscribeToProjects, Project } from '@/lib/projects-store'

// ── Design tokens ────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  khẩn: '#DC2626', cao: '#D97706', trung: '#2563EB', thấp: '#9CA3AF',
}
const PRIORITY_ORDER: Record<TaskPriority, number> = { khẩn: 0, cao: 1, trung: 2, thấp: 3 }

const STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string; border: string }> = {
  chua_bat_dau: { label: 'Chưa bắt đầu', color: '#374151', bg: '#F3F4F6', border: '#D1D5DB' },
  dang_lam:     { label: 'Đang làm',     color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  hoan_thanh:   { label: 'Hoàn thành',   color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  tre:          { label: 'Trễ hạn',      color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
}

const KANBAN_COLS: { key: TaskStatus; label: string; colBg: string; colText: string; badgeBg: string; stripColor: string }[] = [
  { key: 'chua_bat_dau', label: 'Chưa bắt đầu', colBg: '#F9FAFB', colText: '#374151', badgeBg: '#E5E7EB', stripColor: '#9CA3AF' },
  { key: 'dang_lam',     label: 'Đang làm',     colBg: '#EFF6FF', colText: '#1E40AF', badgeBg: '#BFDBFE', stripColor: '#2563EB' },
  { key: 'tre',          label: 'Trễ hạn',      colBg: '#FEF2F2', colText: '#991B1B', badgeBg: '#FECACA', stripColor: '#DC2626' },
  { key: 'hoan_thanh',   label: 'Hoàn thành',   colBg: '#F0FDF4', colText: '#166534', badgeBg: '#BBF7D0', stripColor: '#16A34A' },
]

const AVATAR_PALETTE = ['#4F6BED','#E85D75','#0D9488','#D97706','#7C3AED','#0891B2','#DC2626','#16A34A','#DB2777','#2563EB']
const avatarColor = (name: string) => AVATAR_PALETTE[(name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % AVATAR_PALETTE.length]
const initials    = (name: string) => name.split(' ').filter(Boolean).map(n => n[0]).slice(-2).join('').toUpperCase()

const EMPTY_TASK: Omit<Task,'id'|'createdAt'|'updatedAt'> = {
  title:'', description:'', assignedBy:'', assignedTo:'', department:'',
  project:'', priority:'trung', status:'chua_bat_dau', progress:0, deadline:'', notes:'',
  dienBien:'', deXuat:'',
}

type View = 'list' | 'kanban' | 'analytics' | 'dept' | 'gantt' | 'timeline'

// ── Hierarchy helpers ────────────────────────────────────────────────────────
function buildHierarchy(tasks: Task[]): { task: Task; level: number }[] {
  const result: { task: Task; level: number }[] = []
  function add(t: Task, level: number) {
    result.push({ task: t, level })
    tasks.filter(c => c.parentId === t.id)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      .forEach(c => add(c, level + 1))
  }
  tasks.filter(t => !t.parentId)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .forEach(t => add(t, 0))
  return result
}

// ── Evaluation badge ─────────────────────────────────────────────────────────
function EvalBadge({ result }: { result: TaskEval }) {
  const cfg = result === 'dat'
    ? { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0', label: '✓ Đạt' }
    : { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', label: '✗ Không đạt' }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

// ── Micro-components ─────────────────────────────────────────────────────────
function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  if (!name) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#E5E7EB', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: avatarColor(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.35), fontWeight: 700, color: '#fff',
      flexShrink: 0, letterSpacing: '-.01em', userSelect: 'none',
    }} title={name}>
      {initials(name)}
    </div>
  )
}

function PriorityDot({ p }: { p: TaskPriority }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'inline-block', flexShrink: 0 }} title={PRIORITY_LABEL[p]} />
}

function StatusChip({ s }: { s: TaskStatus }) {
  const c = STATUS_CFG[s]
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap', letterSpacing: '-.01em',
    }}>{c.label}</span>
  )
}

function MiniBar({ value }: { value: number }) {
  const color = value === 100 ? '#16A34A' : value >= 60 ? '#2563EB' : value >= 30 ? '#D97706' : '#DC2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 72, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: 'var(--font-mono)', minWidth: 26, textAlign: 'right' }}>{value}%</span>
    </div>
  )
}

function DeadlineBadge({ deadline, status }: { deadline: string; status: TaskStatus }) {
  if (!deadline) return <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  const done = status === 'hoan_thanh'
  if (done) return <span style={{ fontSize: 11, color: '#16A34A', fontFamily: 'var(--font-mono)' }}>{deadline}</span>
  const { text, color, bg } =
    diff < 0  ? { text: `Trễ ${Math.abs(diff)}n`, color: '#991B1B', bg: '#FEF2F2' } :
    diff === 0 ? { text: 'Hôm nay',               color: '#991B1B', bg: '#FEF2F2' } :
    diff <= 3  ? { text: `Còn ${diff}n`,           color: '#92400E', bg: '#FFFBEB' } :
                 { text: deadline,                  color: '#4B5563', bg: 'transparent' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color, background: bg,
      padding: bg !== 'transparent' ? '2px 6px' : 0, borderRadius: 4,
      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

// ── List view ────────────────────────────────────────────────────────────────
function ListView({ tasks, allTasks, onSelect, onAddSubTask }: {
  tasks: Task[]; allTasks: Task[]
  onSelect: (t: Task) => void
  onAddSubTask: (parent: Task) => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const rows = useMemo(() => buildHierarchy(tasks), [tasks])

  const subCount = (id: string) => allTasks.filter(t => t.parentId === id).length

  return (
    <div className="tk2-table-shell">
      <table className="tk2-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}></th>
            <th style={{ textAlign: 'left' }}>Công việc</th>
            <th>Người phụ trách</th>
            <th>Phòng ban</th>
            <th>Trạng thái</th>
            <th>Đánh giá</th>
            <th>Tiến độ</th>
            <th>Deadline</th>
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={9} className="tk2-empty">Không có công việc nào phù hợp</td></tr>
          )}
          {rows.map(({ task: t, level }) => (
            <tr key={t.id} className={`tk2-row${hoverId === t.id ? ' hov' : ''}${level > 0 ? ' tk2-row-sub' : ''}`}
              onMouseEnter={() => setHoverId(t.id)} onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect(t)}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: level * 16 }}>
                  <PriorityDot p={t.priority} />
                </div>
              </td>
              <td>
                <div style={{ paddingLeft: level * 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {level > 0 && <span style={{ color: 'var(--muted)', fontSize: 10 }}>└</span>}
                  <div>
                    <div style={{ fontWeight: level === 0 ? 600 : 500, fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.3 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 8 }}>
                      {t.project && <span>{t.project}</span>}
                      {subCount(t.id) > 0 && <span style={{ color: '#2563EB' }}>↳ {subCount(t.id)} đầu việc con</span>}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Avatar name={t.assignedTo} size={22} />
                  <span style={{ fontSize: 12 }}>{t.assignedTo || '—'}</span>
                </div>
              </td>
              <td><span style={{ fontSize: 12, color: 'var(--txt2)' }}>{t.department || '—'}</span></td>
              <td><StatusChip s={t.status} /></td>
              <td>{t.evaluation ? <EvalBadge result={t.evaluation.result} /> : <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>}</td>
              <td><MiniBar value={t.progress} /></td>
              <td><DeadlineBadge deadline={t.deadline} status={t.status} /></td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="tk2-row-action" title="Chia đầu việc" onClick={e => { e.stopPropagation(); onAddSubTask(t) }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6"/></svg>
                  </button>
                  <button className="tk2-row-action" onClick={e => { e.stopPropagation(); onSelect(t) }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Kanban view ──────────────────────────────────────────────────────────────
function KanbanCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const late  = task.deadline && task.deadline < today && task.status !== 'hoan_thanh'
  return (
    <div className="kb-card" onClick={onClick} style={{ borderLeftColor: PRIORITY_COLOR[task.priority] }}>
      <div className="kb-card-title">{task.title}</div>
      {task.description && <div className="kb-card-desc">{task.description.slice(0, 70)}{task.description.length > 70 ? '…' : ''}</div>}
      {task.progress > 0 && task.progress < 100 && (
        <div style={{ height: 3, background: '#E5E7EB', borderRadius: 2, margin: '6px 0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${task.progress}%`, background: PRIORITY_COLOR[task.priority], borderRadius: 2 }} />
        </div>
      )}
      <div className="kb-card-foot">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Avatar name={task.assignedTo} size={20} />
          <span style={{ fontSize: 10.5, color: '#6B7280' }}>{task.assignedTo}</span>
        </div>
        <DeadlineBadge deadline={task.deadline} status={task.status} />
      </div>
      {late && <div style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#DC2626' }} />}
    </div>
  )
}

function KanbanView({ tasks, onSelect }: { tasks: Task[]; onSelect: (t: Task) => void }) {
  const byStatus = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { chua_bat_dau: [], dang_lam: [], tre: [], hoan_thanh: [] }
    tasks.forEach(t => m[t.status].push(t))
    Object.values(m).forEach(arr => arr.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]))
    return m
  }, [tasks])

  return (
    <div className="kb-board">
      {KANBAN_COLS.map(col => (
        <div key={col.key} className="kb-col">
          <div className="kb-col-header" style={{ background: col.colBg }}>
            <span style={{ color: col.colText, fontWeight: 700, fontSize: 12 }}>{col.label}</span>
            <span style={{
              background: col.badgeBg, color: col.colText, fontSize: 10, fontWeight: 700,
              padding: '2px 7px', borderRadius: 999,
            }}>{byStatus[col.key].length}</span>
          </div>
          <div className="kb-col-body">
            {byStatus[col.key].length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>Trống</div>
            )}
            {byStatus[col.key].map(t => (
              <KanbanCard key={t.id} task={t} onClick={() => onSelect(t)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Gantt view ───────────────────────────────────────────────────────────────
const G_DAY  = 28   // px per day
const G_ROW  = 44   // row height px
const G_NAME = 290  // left name column px
const G_HDR  = 54   // header height px

function GanttView({ tasks, onSelect, onAddSubTask }: {
  tasks: Task[]; onSelect: (t: Task) => void; onAddSubTask: (t: Task) => void
}) {
  const rows  = useMemo(() => buildHierarchy(tasks), [tasks])
  const today = new Date().toISOString().slice(0, 10)

  const { start, totalDays, months } = useMemo(() => {
    const dates = tasks.flatMap(t => [t.createdAt, t.deadline].filter(Boolean))
    if (!dates.length) return { start: new Date(), totalDays: 30, months: [] as { label: string; left: number; width: number }[] }
    const minD = dates.reduce((a, b) => (a < b ? a : b))
    const maxD = dates.reduce((a, b) => (a > b ? a : b))
    const s = new Date(minD); s.setDate(s.getDate() - 3)
    const e = new Date(maxD); e.setDate(e.getDate() + 10)
    const days = Math.ceil((e.getTime() - s.getTime()) / 86400000)

    // Build month groups
    const ms: { label: string; left: number; width: number }[] = []
    let cur = new Date(s.getFullYear(), s.getMonth(), 1)
    while (cur <= e) {
      const label = cur.toLocaleDateString('vi-VN', { month: 'short', year: '2-digit' }).toUpperCase()
      const mEnd  = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const left  = Math.max(0, Math.floor((cur.getTime() - s.getTime()) / 86400000)) * G_DAY
      const right = Math.min(days, Math.floor((mEnd.getTime() - s.getTime()) / 86400000)) * G_DAY
      ms.push({ label, left, width: right - left })
      cur = mEnd
    }
    return { start: s, totalDays: days, months: ms }
  }, [tasks])

  const xOf = (dateStr: string) =>
    Math.floor((new Date(dateStr).getTime() - start.getTime()) / 86400000) * G_DAY
  const todayX = xOf(today)
  const totalW = totalDays * G_DAY

  const days = useMemo(() =>
    Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i)
      return { n: d.getDate(), isWe: d.getDay() === 0 || d.getDay() === 6, iso: d.toISOString().slice(0,10) }
    }), [start, totalDays])

  if (!tasks.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 14 }}>Không có công việc nào</div>
  )

  return (
    <div className="gantt-wrap">
      {/* Header */}
      <div className="gantt-header" style={{ height: G_HDR }}>
        {/* Name col */}
        <div className="gantt-name-hdr" style={{ width: G_NAME, minWidth: G_NAME }}>Công việc</div>
        {/* Timeline header */}
        <div style={{ position: 'relative', width: totalW, flexShrink: 0 }}>
          {/* Month row */}
          {months.map((m, i) => (
            <div key={i} style={{ position: 'absolute', left: m.left, width: m.width, top: 0, height: 26, borderLeft: '1px solid rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(255,255,255,.9)' }}>{m.label}</span>
            </div>
          ))}
          {/* Day row */}
          <div style={{ position: 'absolute', top: 26, left: 0, display: 'flex', height: 28 }}>
            {days.map((d, i) => (
              <div key={i} style={{ width: G_DAY, flexShrink: 0, textAlign: 'center', fontSize: 9,
                color: d.iso === today ? '#FCD34D' : d.isWe ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.6)',
                fontWeight: d.iso === today ? 800 : 400, borderLeft: '1px solid rgba(255,255,255,.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: d.isWe ? 'rgba(0,0,0,.08)' : 'transparent',
              }}>{d.n}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="gantt-body">
        {rows.map(({ task: t, level }, rowIdx) => {
          const hasStart = !!t.createdAt; const hasEnd = !!t.deadline
          const barL = hasStart ? xOf(t.createdAt) : 0
          const barR = hasEnd   ? xOf(t.deadline)  : barL + G_DAY
          const barW = Math.max(barR - barL, G_DAY * 0.8)
          const col  = PRIORITY_COLOR[t.priority]
          const isLate = t.deadline && t.deadline < today && t.status !== 'hoan_thanh'
          const pct  = t.progress

          return (
            <div key={t.id} className={`gantt-row${rowIdx % 2 === 1 ? ' gantt-row-alt' : ''}`} style={{ height: G_ROW }}>
              {/* Name */}
              <div className="gantt-name-cell" style={{ width: G_NAME, minWidth: G_NAME, paddingLeft: 12 + level * 20 }}
                onClick={() => onSelect(t)}>
                {level > 0 && <span style={{ color: 'var(--muted)', marginRight: 4, fontSize: 10 }}>└</span>}
                <PriorityDot p={t.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: level === 0 ? 600 : 500, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{t.assignedTo}</div>
                </div>
                <button className="gantt-sub-btn" title="Chia đầu việc" onClick={e => { e.stopPropagation(); onAddSubTask(t) }}>+</button>
              </div>

              {/* Timeline */}
              <div style={{ position: 'relative', width: totalW, flexShrink: 0, height: '100%' }}>
                {/* Weekend shading */}
                {days.filter(d => d.isWe).map((d, i) => (
                  <div key={i} style={{ position: 'absolute', left: i * G_DAY /* approximated below */ }} />
                ))}
                {days.map((d, i) => d.isWe && (
                  <div key={i} style={{ position: 'absolute', left: i * G_DAY, width: G_DAY, top: 0, bottom: 0, background: 'rgba(0,0,0,.025)' }} />
                ))}

                {/* Today line */}
                <div style={{ position: 'absolute', left: todayX + G_DAY / 2, top: 0, bottom: 0, width: 2, background: '#DC2626', opacity: .4, zIndex: 2 }} />

                {/* Task bar */}
                {hasStart && hasEnd && (
                  <div style={{
                    position: 'absolute', left: barL + 1, top: 8, width: barW - 2, height: G_ROW - 16,
                    borderRadius: 6, overflow: 'hidden',
                    background: isLate ? '#FEF2F2' : `${col}18`,
                    border: `2px solid ${isLate ? '#DC2626' : col}`,
                    cursor: 'pointer', zIndex: 3,
                  }} onClick={() => onSelect(t)}>
                    {/* Progress fill */}
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: col, opacity: .25 }} />
                    <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 6, gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isLate ? '#DC2626' : col, whiteSpace: 'nowrap' }}>{pct}%</span>
                      {t.evaluation && <EvalBadge result={t.evaluation.result} />}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Department view ───────────────────────────────────────────────────────────
interface DeptStats {
  dept: string; total: number; done: number; late: number; inProgress: number
  urgent: number; avgProg: number; rate: number; tasks: Task[]
}

function DeptCard({ d, tasks, onOpenTask }: { d: DeptStats; tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="dept-card">
      {/* Card header */}
      <div className="dept-card-head" onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div className="dept-icon">{d.dept.charAt(0)}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{d.dept}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {d.total} công việc · {d.done} hoàn thành · {d.late > 0 ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{d.late} trễ hạn</span> : '0 trễ hạn'}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 220px' }}>
          <div style={{ flex: 1, height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${d.avgProg}%`, background: d.late > 0 ? '#DC2626' : d.avgProg >= 70 ? '#16A34A' : '#2563EB', borderRadius: 4, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--navy)', minWidth: 36, textAlign: 'right' }}>{d.avgProg}%</span>
        </div>
        {/* Status badges */}
        <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
          {d.urgent > 0 && <span className="dept-badge dept-badge--urgent">{d.urgent} khẩn</span>}
          {d.late   > 0 && <span className="dept-badge dept-badge--late">{d.late} trễ</span>}
          {d.late === 0 && d.done === d.total && d.total > 0 && <span className="dept-badge dept-badge--done">Hoàn thành</span>}
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="dept-card-body">
          {/* Task list with dienBien / deXuat */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase', margin: '4px 0 8px' }}>
            Danh sách công việc ({tasks.length})
          </div>
          <div className="dept-task-list">
            {tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).map(t => {
              const today  = new Date().toISOString().slice(0, 10)
              const isLate = t.deadline && t.deadline < today && t.status !== 'hoan_thanh'
              const s      = STATUS_CFG[t.status]
              return (
                <div key={t.id} className="dept-task-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, cursor: 'pointer' }} onClick={() => onOpenTask(t)}>
                  {/* Top row: summary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PriorityDot p={t.priority} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <Avatar name={t.assignedTo} size={20} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.label}</span>
                    <div style={{ width: 80, flexShrink: 0 }}><MiniBar value={t.progress} /></div>
                    <div style={{ flexShrink: 0, minWidth: 70, textAlign: 'right' }}>
                      <DeadlineBadge deadline={t.deadline} status={t.status} />
                      {isLate && <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 700, marginTop: 1 }}>⚠ Quá hạn</div>}
                    </div>
                  </div>
                  {/* Diễn biến & Đề xuất rows */}
                  {(t.dienBien || t.deXuat) && (
                    <div style={{ marginTop: 8, marginLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {t.dienBien && (
                        <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, color: '#2563EB', flexShrink: 0, minWidth: 80 }}>Diễn biến:</span>
                          <span style={{ color: 'var(--txt2)' }}>{t.dienBien}</span>
                        </div>
                      )}
                      {t.deXuat && (
                        <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, color: '#D97706', flexShrink: 0, minWidth: 80 }}>Đề xuất:</span>
                          <span style={{ color: 'var(--txt2)' }}>{t.deXuat}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function DeptView({ tasks, deptNames, onOpenTask }: { tasks: Task[]; deptNames: string[]; onOpenTask: (t: Task) => void }) {
  const depts = useMemo(() => {
    const m = new Map<string, Task[]>()
    const names = deptNames.length ? deptNames : DEPARTMENTS
    names.forEach(d => m.set(d, []))
    tasks.forEach(t => { if (t.department) { const arr = m.get(t.department) ?? []; arr.push(t); m.set(t.department, arr) } })
    return [...m.entries()].map(([dept, dTasks]): DeptStats => {
      const total      = dTasks.length
      const done       = dTasks.filter(t => t.status === 'hoan_thanh').length
      const late       = dTasks.filter(t => t.status === 'tre').length
      const inProgress = dTasks.filter(t => t.status === 'dang_lam').length
      const urgent     = dTasks.filter(t => t.priority === 'khẩn').length
      const avgProg    = total ? Math.round(dTasks.reduce((s, t) => s + t.progress, 0) / total) : 0
      const rate       = total ? Math.round((done / total) * 100) : 0
      return { dept, total, done, late, inProgress, urgent, avgProg, rate, tasks: dTasks }
    }).sort((a, b) => b.late - a.late || b.urgent - a.urgent || b.total - a.total)
  }, [tasks])

  const totalLate   = depts.reduce((s, d) => s + d.late, 0)
  const totalUrgent = depts.reduce((s, d) => s + d.urgent, 0)
  const doneAll     = depts.reduce((s, d) => s + d.done, 0)

  return (
    <div>
      {/* Top summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Phòng ban', val: depts.filter(d => d.total > 0).length, color: 'var(--navy)', suffix: `/${depts.length}` },
          { label: 'Hoàn thành', val: doneAll, color: '#16A34A', suffix: ` / ${tasks.length}` },
          { label: 'Trễ hạn', val: totalLate, color: '#DC2626', suffix: '' },
          { label: 'Khẩn cấp', val: totalUrgent, color: '#D97706', suffix: '' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', minWidth: 100 }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color, lineHeight: 1 }}>
              {s.val}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{s.suffix}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Department cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {depts.map(d => (
          <DeptCard key={d.dept} d={d} tasks={d.tasks} onOpenTask={onOpenTask} />
        ))}
      </div>
    </div>
  )
}

// ── Timeline view ────────────────────────────────────────────────────────────
function TimelineView({ tasks, onSelect }: { tasks: Task[]; onSelect: (t: Task) => void }) {
  // Group tasks by ISO week (Mon–Sun), sorted by deadline
  const weeks = useMemo(() => {
    const getMonday = (d: Date) => {
      const day = d.getDay()
      const diff = (day === 0 ? -6 : 1 - day)
      const mon = new Date(d)
      mon.setDate(d.getDate() + diff)
      mon.setHours(0,0,0,0)
      return mon
    }
    const map = new Map<string, { monday: Date; tasks: Task[] }>()
    const noDate: Task[] = []
    for (const t of tasks) {
      if (!t.deadline) { noDate.push(t); continue }
      const d = new Date(t.deadline)
      const mon = getMonday(d)
      const key = mon.toISOString().slice(0,10)
      if (!map.has(key)) map.set(key, { monday: mon, tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    const sorted = [...map.entries()]
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([,v]) => v)
    if (noDate.length) sorted.push({ monday: new Date(0), tasks: noDate })
    return sorted
  }, [tasks])

  const todayStr = new Date().toISOString().slice(0,10)
  const fmtDate  = (s: string) => new Date(s).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' })
  const fmtWeek  = (mon: Date) => {
    if (mon.getTime() === 0) return 'Chưa có deadline'
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return `${mon.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})} – ${sun.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}`
  }
  const isCurrentWeek = (mon: Date) => {
    if (mon.getTime() === 0) return false
    const now = new Date(); now.setHours(0,0,0,0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return now >= mon && now <= sun
  }
  const isPastWeek = (mon: Date) => {
    if (mon.getTime() === 0) return false
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59)
    return new Date() > sun
  }

  return (
    <div className="tl-wrap">
      {weeks.length === 0 && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Không có công việc nào</div>
      )}
      {weeks.map((w, wi) => {
        const past    = isPastWeek(w.monday)
        const current = isCurrentWeek(w.monday)
        const sorted  = [...w.tasks].sort((a,b) => {
          if (!a.deadline) return 1; if (!b.deadline) return -1
          return a.deadline.localeCompare(b.deadline)
        })
        return (
          <div key={wi} className="tl-week">
            {/* Spine */}
            <div className="tl-spine">
              <div className={`tl-dot${current ? ' tl-dot--now' : past ? ' tl-dot--past' : ''}`} />
              {wi < weeks.length - 1 && <div className={`tl-line${past ? ' tl-line--past' : ''}`} />}
            </div>
            {/* Content */}
            <div className="tl-body">
              <div className={`tl-week-label${current ? ' tl-week-label--now' : past ? ' tl-week-label--past' : ''}`}>
                {current && <span className="tl-now-badge">Tuần này</span>}
                {fmtWeek(w.monday)}
              </div>
              <div className="tl-cards">
                {sorted.map(t => {
                  const sc = STATUS_CFG[t.status]
                  const late = t.deadline && t.deadline < todayStr && t.status !== 'hoan_thanh'
                  return (
                    <div key={t.id} className="tl-card" onClick={() => onSelect(t)}>
                      <div className="tl-card-stripe" style={{ background: PRIORITY_COLOR[t.priority] }} />
                      <div className="tl-card-main">
                        <div className="tl-card-title">
                          {t.parentId && <span className="tl-sub-mark">└ </span>}
                          {t.title}
                          {t.evaluation && <EvalBadge result={t.evaluation.result} />}
                        </div>
                        <div className="tl-card-meta">
                          <span className="tl-badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                          {t.deadline && (
                            <span style={{ fontSize: 11, color: late ? '#DC2626' : 'var(--muted)', fontWeight: late ? 700 : 400 }}>
                              {late ? '⚠ ' : ''}Deadline {fmtDate(t.deadline)}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.assignedTo}</span>
                          {t.department && <span style={{ fontSize: 11, color: 'var(--muted2)', background: 'var(--surf2)', padding: '1px 6px', borderRadius: 4 }}>{t.department}</span>}
                        </div>
                        {t.progress > 0 && (
                          <div style={{ marginTop: 6, height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', width: '100%' }}>
                            <div style={{ height: '100%', width: `${t.progress}%`, background: t.status === 'hoan_thanh' ? '#16A34A' : 'var(--navy)', borderRadius: 99, transition: 'width .3s' }} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: PRIORITY_COLOR[t.priority], padding: '0 8px', alignSelf: 'flex-start', paddingTop: 10, whiteSpace: 'nowrap' }}>
                        {t.priority.toUpperCase()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Analytics view ───────────────────────────────────────────────────────────
function AnalyticsView({ tasks }: { tasks: Task[] }) {
  const deptStats = useMemo(() => {
    const m = new Map<string, { total: number; done: number; late: number; progress: number }>()
    for (const t of tasks) {
      const d = m.get(t.department) ?? { total: 0, done: 0, late: 0, progress: 0 }
      d.total++
      if (t.status === 'hoan_thanh') d.done++
      if (t.status === 'tre') d.late++
      d.progress += t.progress
      m.set(t.department, d)
    }
    return [...m.entries()].map(([dept, d]) => ({
      dept, ...d, rate: Math.round((d.done / d.total) * 100),
      avgProg: Math.round(d.progress / d.total),
    })).sort((a, b) => b.rate - a.rate)
  }, [tasks])

  const personStats = useMemo(() => {
    const m = new Map<string, { total: number; done: number; late: number; progress: number }>()
    for (const t of tasks) {
      if (!t.assignedTo) continue
      const d = m.get(t.assignedTo) ?? { total: 0, done: 0, late: 0, progress: 0 }
      d.total++
      if (t.status === 'hoan_thanh') d.done++
      if (t.status === 'tre') d.late++
      d.progress += t.progress
      m.set(t.assignedTo, d)
    }
    return [...m.entries()].map(([person, d]) => ({
      person, ...d, rate: Math.round((d.done / d.total) * 100),
      avgProg: Math.round(d.progress / d.total),
    })).sort((a, b) => b.total - a.total)
  }, [tasks])

  const priorityDist = useMemo(() => {
    const c = { khẩn: 0, cao: 0, trung: 0, thấp: 0 } as Record<TaskPriority, number>
    tasks.forEach(t => c[t.priority]++)
    return Object.entries(c).map(([k, v]) => ({ key: k as TaskPriority, val: v }))
  }, [tasks])

  const maxBar = Math.max(...deptStats.map(d => d.total), 1)

  return (
    <div className="an-wrap">
      {/* Summary row */}
      <div className="an-stats">
        {[
          { label: 'Tổng công việc', val: tasks.length, color: 'var(--navy)' },
          { label: 'Hoàn thành', val: tasks.filter(t => t.status === 'hoan_thanh').length, color: '#16A34A' },
          { label: 'Đang thực hiện', val: tasks.filter(t => t.status === 'dang_lam').length, color: '#2563EB' },
          { label: 'Trễ hạn', val: tasks.filter(t => t.status === 'tre').length, color: '#DC2626' },
          { label: 'Tiến độ TB', val: tasks.length ? Math.round(tasks.reduce((s,t) => s + t.progress, 0) / tasks.length) : 0, color: 'var(--navy)', suffix: '%' },
        ].map(s => (
          <div key={s.label} className="an-stat">
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.val}{s.suffix ?? ''}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="an-grid">
        {/* Dept table */}
        <div className="an-card">
          <div className="an-card-title">Theo phòng ban</div>
          <table className="an-table">
            <thead><tr>
              <th>Phòng ban</th><th>Tổng</th><th>Tỷ lệ HT</th><th>Tiến độ TB</th><th>Trễ</th>
            </tr></thead>
            <tbody>
              {deptStats.map(d => (
                <tr key={d.dept}>
                  <td style={{ fontWeight: 600 }}>{d.dept}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{d.total}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 5, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                        <div style={{ height: '100%', width: `${d.rate}%`, background: d.rate >= 70 ? '#16A34A' : d.rate >= 40 ? '#D97706' : '#DC2626', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--txt2)', minWidth: 30 }}>{d.rate}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.avgProg}%</td>
                  <td style={{ textAlign: 'center' }}>
                    {d.late > 0
                      ? <span style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{d.late}</span>
                      : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Person table */}
        <div className="an-card">
          <div className="an-card-title">Theo cá nhân</div>
          <table className="an-table">
            <thead><tr>
              <th>Người phụ trách</th><th>Tổng</th><th>Tiến độ TB</th><th>Trễ</th>
            </tr></thead>
            <tbody>
              {personStats.map(p => (
                <tr key={p.person}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Avatar name={p.person} size={22} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{p.person}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <div style={{ width: Math.round((p.total / Math.max(...personStats.map(x => x.total), 1)) * 40), height: 5, background: avatarColor(p.person), borderRadius: 2, opacity: .7 }} />
                      <span style={{ fontSize: 12 }}>{p.total}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 50, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p.avgProg}%`, background: p.avgProg >= 70 ? '#16A34A' : '#2563EB', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{p.avgProg}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {p.late > 0
                      ? <span style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{p.late}</span>
                      : <span style={{ color: '#9CA3AF' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Priority + workload bars */}
      <div className="an-grid" style={{ marginTop: 16 }}>
        <div className="an-card">
          <div className="an-card-title">Phân bổ ưu tiên</div>
          {priorityDist.map(({ key, val }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <PriorityDot p={key} />
              <span style={{ fontSize: 12, width: 80, flexShrink: 0 }}>{PRIORITY_LABEL[key]}</span>
              <div style={{ flex: 1, height: 10, background: '#F3F4F6', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(val / tasks.length) * 100}%`, background: PRIORITY_COLOR[key], borderRadius: 5, transition: 'width .4s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', width: 20, textAlign: 'right', color: PRIORITY_COLOR[key] }}>{val}</span>
            </div>
          ))}
        </div>

        <div className="an-card">
          <div className="an-card-title">Khối lượng công việc theo phòng ban</div>
          {deptStats.map(d => (
            <div key={d.dept} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, width: 100, flexShrink: 0, color: 'var(--txt2)' }}>{d.dept}</span>
              <div style={{ flex: 1, height: 10, background: '#F3F4F6', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(d.total / maxBar) * 100}%`, background: 'var(--navy2)', borderRadius: 5, opacity: .75 }} />
              </div>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', width: 16, textAlign: 'right', color: 'var(--navy)' }}>{d.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Slide-over detail/edit panel ─────────────────────────────────────────────
function SlideOver({ task, allTasks, currentUser, currentStaff, staffUsers, departments, projects, onSave, onDelete, onAddSubTask, onDuplicate, onClose }: {
  task: Task | null
  allTasks: Task[]
  currentUser: string
  currentStaff: import('@/lib/users-store').StaffUser | null
  staffUsers: StaffUser[]
  departments: Department[]
  projects: Project[]
  onSave: (t: Task) => void
  onDelete: (id: string) => void
  onAddSubTask: (parent: Task) => void
  onDuplicate: (task: Task) => void
  onClose: () => void
}) {
  const isNew = !task
  const [form, setForm] = useState<Omit<Task,'id'|'createdAt'|'updatedAt'>>(
    task ? { ...task } : { ...EMPTY_TASK }
  )
  const [err, setErr]           = useState('')
  const [evalNote, setEvalNote] = useState(task?.evaluation?.note ?? '')
  const [showShare, setShowShare] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const subTasks    = allTasks.filter(t => t.parentId === task?.id)
  const parentTask  = task?.parentId ? allTasks.find(t => t.id === task.parentId) : null
  const canEvaluate = !isNew && !!currentUser && currentUser === task?.assignedBy

  // RBAC: can this user edit/create tasks?
  const canEdit = !currentStaff || currentStaff.level !== 'nhan_vien'
  // truong_phong can only assign within own department; giam_doc can assign all
  const assignableUsers = staffUsers.filter(u => u.active && (
    !currentStaff ||
    currentStaff.level === 'giam_doc' ||
    u.department === currentStaff.department
  ))
  // can share: truong_phong/giam_doc of the task's department (or admin)
  const canShare = !isNew && canEdit && (
    !currentStaff ||
    currentStaff.level === 'giam_doc' ||
    (currentStaff.level === 'truong_phong' && task?.department === currentStaff.department)
  )
  const allDeptNames = departments.length
    ? departments.map(d => d.name)
    : []

  useEffect(() => {
    setForm(task ? { ...task } : { ...EMPTY_TASK })
    setErr('')
    setEvalNote(task?.evaluation?.note ?? '')
  }, [task])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = () => {
    if (!form.title.trim()) { setErr('Vui lòng nhập tên công việc'); return }
    if (!form.assignedTo)   { setErr('Vui lòng chọn người phụ trách'); return }
    const now = new Date().toISOString().slice(0, 10)
    onSave({ ...(task ?? { id: `t${Date.now()}`, createdAt: now }), ...form, updatedAt: now } as Task)
    onClose()
  }

  const saveEval = (result: TaskEval) => {
    if (!task) return
    const now = new Date().toISOString().slice(0, 10)
    onSave({ ...task, ...form, evaluation: { result, note: evalNote, evaluatedAt: now, evaluatedBy: currentUser }, updatedAt: now })
    onClose()
  }

  const clearEval = () => {
    if (!task) return
    const now = new Date().toISOString().slice(0, 10)
    const { evaluation: _ev, ...rest } = { ...task, ...form, updatedAt: now }
    onSave(rest as Task)
    onClose()
  }

  const sel = (label: string, k: keyof typeof form, opts: string[], allowEmpty = true) => (
    <div className="so-field">
      <label className="so-label">{label}</label>
      <select className="so-input" value={String(form[k])} onChange={e => set(k, e.target.value as never)}>
        {allowEmpty && <option value="">— Chọn —</option>}
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="so-panel" ref={ref}>
        {/* Header */}
        <div className="so-header">
          <div>
            {parentTask && (
              <div style={{ fontSize: 11, color: '#2563EB', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>↑</span><span style={{ fontWeight: 600 }}>{parentTask.title}</span>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 2 }}>
              {isNew ? (form.parentId ? 'Đầu việc con mới' : 'Công việc mới') : 'Chi tiết công việc'}
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3, maxWidth: 340 }}>
              {form.title || 'Nhập tên công việc…'}
            </h2>
          </div>
          <button className="so-close" onClick={onClose} title="Đóng (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Priority + status quick-set */}
        <div className="so-quickrow">
          {(['khẩn','cao','trung','thấp'] as TaskPriority[]).map(p => (
            <button key={p} onClick={() => set('priority', p)} className={`so-pquick${form.priority === p ? ' active' : ''}`}
              style={{ '--dot': PRIORITY_COLOR[p] } as React.CSSProperties}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'inline-block' }} />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="so-quickrow" style={{ marginTop: 4 }}>
          {Object.entries(STATUS_CFG).map(([k, c]) => (
            <button key={k} onClick={() => set('status', k as TaskStatus)}
              className={`so-squick${form.status === k ? ' active' : ''}`}
              style={{ background: form.status === k ? c.bg : 'transparent', color: form.status === k ? c.color : 'var(--muted)', borderColor: form.status === k ? c.border : 'var(--border2)' }}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="so-body">
          {err && <div className="so-err">{err}</div>}

          <div className="so-field so-field--full">
            <label className="so-label">Tên công việc *</label>
            <input className="so-input" value={form.title} onChange={e => { set('title', e.target.value); setErr('') }} placeholder="Nhập tên công việc…" />
          </div>

          <div className="so-field so-field--full">
            <label className="so-label">Mô tả</label>
            <textarea className="so-input so-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Mô tả chi tiết…" rows={2} />
          </div>

          {sel('Người giao', 'assignedBy', assignableUsers.length ? assignableUsers.map(u => u.name) : MEMBERS)}
          {sel('Người phụ trách *', 'assignedTo', assignableUsers.length ? assignableUsers.map(u => u.name) : MEMBERS)}
          {sel('Phòng ban', 'department', departments.length ? departments.map(d => d.name) : DEPARTMENTS)}
          {sel('Dự án', 'project', projects.length ? projects.map(p => p.name) : PROJECTS)}

          <div className="so-field">
            <label className="so-label">Deadline</label>
            <input type="date" className="so-input" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
          </div>

          <div className="so-field so-field--full">
            <label className="so-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tiến độ</span>
              <b style={{ color: 'var(--navy)', fontFamily: 'var(--font-mono)' }}>{form.progress}%</b>
            </label>
            <input type="range" min={0} max={100} step={5} value={form.progress}
              onChange={e => set('progress', Number(e.target.value))} className="so-range" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          <div className="so-field so-field--full">
            <label className="so-label">Ghi chú</label>
            <textarea className="so-input so-textarea" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ghi chú nội bộ…" rows={2} />
          </div>

          <div className="so-field so-field--full">
            <label className="so-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
              Diễn biến <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(phòng ban tự cập nhật)</span>
            </label>
            <textarea className="so-input so-textarea" value={form.dienBien} onChange={e => set('dienBien', e.target.value)} placeholder="Cập nhật tiến triển mới nhất, vướng mắc gặp phải…" rows={3} />
          </div>

          <div className="so-field so-field--full">
            <label className="so-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
              Đề xuất / Hỗ trợ cần <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(phòng ban tự điền)</span>
            </label>
            <textarea className="so-input so-textarea" value={form.deXuat} onChange={e => set('deXuat', e.target.value)} placeholder="Đề xuất xử lý hoặc yêu cầu hỗ trợ từ BGĐ / phòng ban khác…" rows={3} />
          </div>

          {/* Sub-tasks panel */}
          {!isNew && (
            <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Đầu việc con {subTasks.length > 0 && `(${subTasks.length})`}
                </div>
                <button style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                  onClick={() => { onAddSubTask(task!); onClose() }}>
                  + Chia đầu việc
                </button>
              </div>
              {subTasks.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Chưa có đầu việc con.</div>
              )}
              {subTasks.map(st => {
                const sc = STATUS_CFG[st.status]
                return (
                  <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surf2)', borderRadius: 7, marginBottom: 5, cursor: 'pointer', border: '1px solid var(--border)' }}>
                    <PriorityDot p={st.priority} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.title}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>{st.assignedTo}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap' }}>{sc.label}</span>
                    <MiniBar value={st.progress} />
                    {st.evaluation && <EvalBadge result={st.evaluation.result} />}
                  </div>
                )
              })}
            </div>
          )}

          {/* Evaluation panel */}
          {!isNew && (
            <div style={{ gridColumn: '1/-1', borderTop: '2px solid var(--navy)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Đánh giá kết quả
                </div>
                {!canEvaluate && (
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>
                    (chỉ người giao việc mới đánh giá được)
                  </span>
                )}
              </div>
              {task?.evaluation && (
                <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: task.evaluation.result === 'dat' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${task.evaluation.result === 'dat' ? '#BBF7D0' : '#FECACA'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EvalBadge result={task.evaluation.result} />
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>bởi {task.evaluation.evaluatedBy} · {task.evaluation.evaluatedAt}</span>
                    {canEvaluate && <button style={{ marginLeft: 'auto', fontSize: 10, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={clearEval}>Xóa đánh giá</button>}
                  </div>
                  {task.evaluation.note && <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 4 }}>{task.evaluation.note}</div>}
                </div>
              )}
              {canEvaluate && (
                <>
                  <div className="so-field so-field--full" style={{ marginBottom: 10 }}>
                    <label className="so-label">Ghi chú đánh giá (tuỳ chọn)</label>
                    <textarea className="so-input so-textarea" value={evalNote} onChange={e => setEvalNote(e.target.value)} placeholder="Nhận xét về kết quả thực hiện…" rows={2} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveEval('dat')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: '#F0FDF4', color: '#166534', border: '2px solid #16A34A' }}>
                      ✓ Đạt
                    </button>
                    <button onClick={() => saveEval('khong_dat')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: '#FEF2F2', color: '#991B1B', border: '2px solid #DC2626' }}>
                      ✗ Không đạt
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Meta info */}
          {!isNew && (
            <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--muted2)', display: 'flex', gap: 16, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              <span>Tạo: {task!.createdAt}</span>
              <span>Cập nhật: {task!.updatedAt}</span>
            </div>
          )}

          {/* Share panel */}
          {canShare && allDeptNames.length > 0 && (
            <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--navy)', padding: 0, marginBottom: showShare ? 10 : 0 }}
                onClick={() => setShowShare(s => !s)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Chia sẻ với phòng ban khác
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {form.sharedWith && form.sharedWith.length > 0 ? `(${form.sharedWith.length} phòng)` : ''}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showShare ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showShare && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allDeptNames.filter(d => d !== form.department).map(dept => {
                    const checked = form.sharedWith?.includes(dept) ?? false
                    return (
                      <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                        background: checked ? '#EFF6FF' : 'var(--surf2)',
                        border: `1.5px solid ${checked ? '#3B82F6' : 'var(--border2)'}`,
                        borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: checked ? 600 : 400,
                        color: checked ? '#1D4ED8' : 'var(--txt)' }}>
                        <input type="checkbox" checked={checked} style={{ accentColor: '#3B82F6' }}
                          onChange={e => {
                            const cur = form.sharedWith ?? []
                            set('sharedWith' as never, (e.target.checked ? [...cur, dept] : cur.filter(x => x !== dept)) as never)
                          }} />
                        {dept}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {/* Read-only shared badge for viewers */}
          {!canShare && task?.sharedWith && task.sharedWith.length > 0 && (
            <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#3B82F6', display: 'flex', alignItems: 'center', gap: 5, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Được chia sẻ với: {task.sharedWith.join(', ')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="so-footer">
          {!isNew && canEdit && (
            <button className="so-del" onClick={() => { if (confirm('Xóa công việc này?')) { onDelete(task!.id); onClose() } }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Xóa
            </button>
          )}
          {!isNew && canEdit && (
            <button className="so-cancel" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => { onDuplicate(task!); onClose() }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Nhân bản
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="so-cancel" onClick={onClose}>Hủy</button>
            {canEdit && (
              <button className="so-save" onClick={save}>
                {isNew ? '+ Thêm công việc' : 'Lưu thay đổi'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Export modal ──────────────────────────────────────────────────────────────
function ExportModal({ tasks, filters, onClose }: {
  tasks: Task[]
  filters: { status: string; priority: string; department: string; project: string; dateFrom: string; dateTo: string }
  onClose: () => void
}) {
  const [loadingDocx, setLoadingDocx] = useState(false)
  const [loadingXlsx, setLoadingXlsx] = useState(false)
  const loading = loadingDocx || loadingXlsx
  const [mode, setMode]         = useState<'week' | 'month' | 'custom'>('week')
  const [title, setTitle]       = useState('BÁO CÁO TÌNH TRẠNG CÔNG VIỆC')
  const [subtitle, setSub]      = useState('')

  const MODE_INFO = {
    week:   { icon: '📅', label: 'Tuần này + Tuần tới', desc: 'Phần A: công việc tuần hiện tại · Phần B: kế hoạch tuần tiếp theo' },
    month:  { icon: '🗓', label: 'Tháng này + Tháng tới', desc: 'Phần A: công việc tháng hiện tại · Phần B: kế hoạch tháng tiếp theo' },
    custom: { icon: '✏️', label: 'Tùy chọn (theo bộ lọc)', desc: 'Sử dụng bộ lọc deadline + phòng ban + trạng thái đang chọn' },
  }

  const payload = () => ({
    tasks,
    reportMode: mode,
    ...(mode === 'custom' ? filters : {}),
    title,
    subtitle,
  })

  const doDownload = async (url: string, filename: string, setLoad: (v: boolean) => void) => {
    setLoad(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
      link.click(); URL.revokeObjectURL(link.href); onClose()
    } catch { alert('Xuất thất bại') }
    finally { setLoad(false) }
  }

  const doExportDocx = () => doDownload('/api/export-tasks',       'bao-cao-cong-viec.docx', setLoadingDocx)
  const doExportXlsx = () => doDownload('/api/export-tasks-excel', 'bao-cao-cong-viec.xlsx', setLoadingXlsx)

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal">
        <div className="so-header">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Xuất báo cáo Word</div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Mode selector */}
          <div>
            <div className="so-label" style={{ marginBottom: 8 }}>Loại báo cáo</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.entries(MODE_INFO) as [typeof mode, typeof MODE_INFO[typeof mode]][]).map(([k, v]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  background: mode === k ? 'var(--surf2)' : 'transparent',
                  border: `1.5px solid ${mode === k ? 'var(--navy)' : 'var(--border2)'}`,
                  borderRadius: 8, padding: '10px 12px', transition: 'all .15s' }}>
                  <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} style={{ marginTop: 2, accentColor: 'var(--navy)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{v.icon} {v.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{v.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {mode === 'custom' && (
            <div style={{ background: 'var(--surf2)', border: '1px solid var(--border3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--txt2)', lineHeight: 1.7 }}>
              <b>Phạm vi hiện tại:</b>{' '}
              {filters.dateFrom || filters.dateTo
                ? <>Deadline từ <b>{filters.dateFrom || '…'}</b> đến <b>{filters.dateTo || '…'}</b>{' '}</>
                : ''}
              {filters.status     ? `· ${STATUS_CFG[filters.status as TaskStatus]?.label ?? filters.status} ` : ''}
              {filters.priority   ? `· ${PRIORITY_LABEL[filters.priority as TaskPriority]} ` : ''}
              {filters.department ? `· ${filters.department} ` : ''}
              {filters.project    ? `· ${filters.project} ` : ''}
              {!filters.dateFrom && !filters.dateTo && !filters.status && !filters.priority && !filters.department && !filters.project
                ? `Tất cả ${tasks.length} công việc` : `${tasks.length} công việc`}
            </div>
          )}

          <div className="so-field so-field--full">
            <label className="so-label">Tiêu đề báo cáo</label>
            <input className="so-input" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="so-field so-field--full">
            <label className="so-label">Ghi chú / kỳ báo cáo (tuỳ chọn)</label>
            <input className="so-input" placeholder="VD: Tháng 6/2026 — Phòng TC-KT" value={subtitle} onChange={e => setSub(e.target.value)} />
          </div>
        </div>
        <div className="so-footer">
          <button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>Hủy</button>
          <button className="so-cancel" onClick={doExportXlsx} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#16A34A', borderColor: '#86EFAC', background: loadingXlsx ? '#F0FDF4' : undefined }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            {loadingXlsx ? 'Đang xuất…' : '⬇ Xuất .xlsx'}
          </button>
          <button className="so-save" onClick={doExportDocx} disabled={loading}>
            {loadingDocx ? 'Đang xuất…' : '⬇ Xuất .docx'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
import { Suspense } from 'react'

function TasksPageInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { setInfo }  = useTopbarInfo()
  const [tasks, setTasks]           = useState<Task[]>([])
  const [loading, setLoading]       = useState(true)
  const [seeding, setSeeding]       = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [staffUsers,   setStaffUsers]   = useState<StaffUser[]>([])
  const [fsDepartments, setFsDepartments] = useState<Department[]>([])
  const [fsProjects, setFsProjects] = useState<Project[]>([])

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null)
      .then(s => { if (s?.full_name) setCurrentUser(s.full_name) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = subscribeToTasks(list => {
      const today = new Date().toISOString().slice(0, 10)
      // auto-mark overdue tasks
      list.forEach(t => {
        if (t.deadline && t.deadline < today && t.status !== 'hoan_thanh' && t.status !== 'tre') {
          fsSave({ ...t, status: 'tre', updatedAt: today }).catch(console.error)
        }
      })
      setTasks(list)
      setLoading(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToUsers(setStaffUsers)
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToDepartments(setFsDepartments)
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToProjects(setFsProjects)
    return unsub
  }, [])

  const rawView = searchParams.get('view') ?? 'list'
  const view: View = (['list','kanban','dept','analytics','gantt','timeline'] as View[]).includes(rawView as View)
    ? rawView as View : 'list'

  const setView = useCallback((v: View) => {
    router.push(`/tasks?view=${v}`, { scroll: false })
  }, [router])
  const [search, setSearch]       = useState('')
  const [fStatus, setFStatus]     = useState('')
  const [fPriority, setFPriority] = useState('')
  const [fDept, setFDept]         = useState('')
  const [fProject, setFProject]   = useState('')
  const [selected, setSelected]   = useState<Task | null | 'new'>(null)
  const [showExport, setShowExport]   = useState(false)
  const [fDateFrom, setFDateFrom]     = useState('')
  const [fDateTo,   setFDateTo]       = useState('')

  // quick preset helpers
  const applyWeek = (offset: number) => {
    const now = new Date(); const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    setFDateFrom(mon.toISOString().slice(0, 10))
    setFDateTo(sun.toISOString().slice(0, 10))
  }
  const applyMonth = (offset: number) => {
    const now = new Date()
    const y = now.getFullYear(); const m = now.getMonth() + offset
    const from = new Date(y, m, 1).toISOString().slice(0, 10)
    const to   = new Date(y, m + 1, 0).toISOString().slice(0, 10)
    setFDateFrom(from); setFDateTo(to)
  }

  // ── RBAC ─────────────────────────────────────────────────────────────────────
  const currentStaff = useMemo(
    () => staffUsers.find(u => u.name === currentUser) ?? null,
    [staffUsers, currentUser]
  )
  // giam_doc sees all; others see only own dept + shared tasks
  // if user not in staff_users (admin/system), fallback to all
  const visibleTasks = useMemo(() => {
    if (!currentStaff) return tasks  // admin fallback
    if (currentStaff.level === 'giam_doc') return tasks
    return tasks.filter(t =>
      t.department === currentStaff.department ||
      (t.sharedWith && t.sharedWith.includes(currentStaff.department))
    )
  }, [tasks, currentStaff])

  // can create/assign tasks: only truong_phong and giam_doc
  const canCreate = !currentStaff || currentStaff.level !== 'nhan_vien'

  const filtered = useMemo(() => {
    let t = visibleTasks
    const q = search.toLowerCase()
    if (q)         t = t.filter(x => x.title.toLowerCase().includes(q) || x.assignedTo.toLowerCase().includes(q) || x.department.toLowerCase().includes(q))
    if (fStatus)   t = t.filter(x => x.status === fStatus)
    if (fPriority) t = t.filter(x => x.priority === fPriority)
    if (fDept)     t = t.filter(x => x.department === fDept)
    if (fProject)  t = t.filter(x => x.project === fProject)
    if (fDateFrom) t = t.filter(x => x.deadline >= fDateFrom)
    if (fDateTo)   t = t.filter(x => x.deadline && x.deadline <= fDateTo)
    return t
  }, [visibleTasks, search, fStatus, fPriority, fDept, fProject, fDateFrom, fDateTo])

  const hasDateFilter = fDateFrom || fDateTo
  const activeFilters = [
    fStatus   && { label: STATUS_CFG[fStatus as TaskStatus]?.label ?? fStatus,   clear: () => setFStatus('') },
    fPriority && { label: PRIORITY_LABEL[fPriority as TaskPriority],              clear: () => setFPriority('') },
    fDept     && { label: fDept,                                                   clear: () => setFDept('') },
    fProject  && { label: fProject,                                                clear: () => setFProject('') },
    hasDateFilter && { label: `${fDateFrom || '…'} → ${fDateTo || '…'}`, clear: () => { setFDateFrom(''); setFDateTo('') } },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  const saveTask   = (t: Task) => { fsSave(t).catch(console.error) }
  const deleteTask = (id: string) => { fsDelete(id).catch(console.error) }
  const duplicateTask = (original: Task) => {
    const now    = new Date().toISOString().slice(0, 10)
    const newId  = `t${Date.now()}`
    const clone: Task = { ...original, id: newId, title: `${original.title} (bản sao)`,
      status: 'chua_bat_dau', progress: 0, evaluation: undefined,
      dienBien: '', deXuat: '', createdAt: now, updatedAt: now }
    fsSave(clone).catch(console.error)
    // clone sub-tasks
    const subs = tasks.filter(t => t.parentId === original.id)
    subs.forEach(sub => {
      const subClone: Task = { ...sub, id: `t${Date.now()}-${sub.id}`, parentId: newId,
        status: 'chua_bat_dau', progress: 0, evaluation: undefined,
        dienBien: '', deXuat: '', createdAt: now, updatedAt: now }
      fsSave(subClone).catch(console.error)
    })
  }
  const openTask   = (t: Task)   => setSelected(t)
  const addSubTask = (parent: Task) => {
    const preload: Task = {
      ...EMPTY_TASK,
      id: `sub-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      parentId:   parent.id,
      department: parent.department,
      project:    parent.project,
      assignedBy: currentUser || parent.assignedTo,
    } as Task
    setSelected(preload)
  }

  useEffect(() => {
    const count = filtered.length !== tasks.length
      ? `${filtered.length} / ${tasks.length} công việc`
      : `${tasks.length} công việc`
    setInfo(`${count} · Cập nhật ${new Date().toLocaleDateString('vi-VN')}`)
  }, [filtered.length, tasks.length, setInfo])

  const stats = useMemo(() => {
    const total      = visibleTasks.length
    const done       = visibleTasks.filter(t => t.status === 'hoan_thanh').length
    const late       = visibleTasks.filter(t => t.status === 'tre').length
    const urgent     = visibleTasks.filter(t => t.priority === 'khẩn').length
    const avgProg    = total ? Math.round(visibleTasks.reduce((s,t) => s + t.progress, 0) / total) : 0
    return { total, done, late, urgent, avgProg }
  }, [visibleTasks])

  const handleSeed = async () => {
    if (!confirm('Import 18 công việc mẫu vào Firestore?')) return
    setSeeding(true)
    try {
      await seedMockTasks()
    } catch (e) {
      alert('Lỗi: ' + e)
    } finally {
      setSeeding(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 10, color: 'var(--muted)', fontSize: 14 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
      Đang tải dữ liệu…
    </div>
  )

  return (
    <div className="tk2-page">
      {/* Seed banner — only when empty */}
      {tasks.length === 0 && (
        <div style={{ margin: '16px 24px 0', padding: '14px 20px', borderRadius: 10, background: '#FFFBEB', border: '1px dashed #D97706', display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: 13, color: '#92400E', flex: 1 }}>
            Firestore đang trống. Import dữ liệu mẫu để bắt đầu nhanh, hoặc tự thêm công việc mới.
          </span>
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{ padding: '7px 16px', borderRadius: 8, background: '#D97706', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: seeding ? 'not-allowed' : 'pointer', opacity: seeding ? .7 : 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            {seeding
              ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 0 0-9-9"/></svg>Đang import…</>
              : '⬆ Import 18 task mẫu'}
          </button>
        </div>
      )}

      {/* Stat strip ── */}
      <div className="tk2-statstrip">
        {[
          { label: 'Tổng',         val: stats.total,   color: 'var(--navy)',  f: '' },
          { label: 'Hoàn thành',   val: stats.done,    color: '#16A34A', f: 'hoan_thanh' },
          { label: 'Đang thực hiện', val: tasks.filter(t => t.status === 'dang_lam').length, color: '#2563EB', f: 'dang_lam' },
          { label: 'Trễ hạn',      val: stats.late,    color: '#DC2626', f: 'tre' },
          { label: 'Khẩn cấp',     val: stats.urgent,  color: '#D97706', f: '' },
          { label: 'Tiến độ TB',   val: `${stats.avgProg}%`, color: 'var(--navy2)', f: '' },
        ].map(s => (
          <div key={s.label} className={`tk2-stat${s.f && fStatus === s.f ? ' active' : ''}`}
            onClick={() => s.f && setFStatus(fStatus === s.f ? '' : s.f)}
            style={{ cursor: s.f ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>{s.label}</div>
            {s.f && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: fStatus === s.f ? s.color : 'transparent', borderRadius: '0 0 8px 8px' }} />}
          </div>
        ))}
      </div>

      {/* Toolbar ── */}
      <div className="tk2-toolbar">
        {/* Filters */}
        <div className="tk2-filters" style={{ flex: 1 }}>
          <div className="tk2-search-wrap">
            <svg className="tk2-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="tk2-search" placeholder="Tìm công việc, người phụ trách…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="tk2-search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <select className="tk2-sel" value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Trạng thái</option>
            {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="tk2-sel" value={fPriority} onChange={e => setFPriority(e.target.value)}>
            <option value="">Ưu tiên</option>
            {Object.entries(PRIORITY_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="tk2-sel" value={fDept} onChange={e => setFDept(e.target.value)}>
            <option value="">Phòng ban</option>
            {(fsDepartments.length ? fsDepartments.map(d => d.name) : DEPARTMENTS).map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="tk2-sel" value={fProject} onChange={e => setFProject(e.target.value)}>
            <option value="">Dự án</option>
            {(fsProjects.length ? fsProjects.map(p => p.name) : PROJECTS).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button className="tk2-btn-ghost" onClick={() => setShowExport(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Xuất báo cáo
          </button>
          {canCreate && (
            <button className="tk2-btn-primary" onClick={() => setSelected('new')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Thêm công việc
            </button>
          )}
        </div>
      </div>

      {/* Date range bar ── */}
      <div className="tk2-datebar">
        <div className="tk2-datebar-label">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Lọc theo deadline:
        </div>
        <div className="tk2-datebar-inputs">
          <input type="date" className="tk2-date-input" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} title="Từ ngày" />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
          <input type="date" className="tk2-date-input" value={fDateTo} onChange={e => setFDateTo(e.target.value)} title="Đến ngày" />
        </div>
        <div className="tk2-datebar-presets">
          <button className={`tk2-preset${hasDateFilter ? '' : ''}`} onClick={() => applyWeek(0)}>Tuần này</button>
          <button className="tk2-preset" onClick={() => applyWeek(1)}>Tuần tới</button>
          <button className="tk2-preset" onClick={() => applyMonth(0)}>Tháng này</button>
          <button className="tk2-preset" onClick={() => applyMonth(1)}>Tháng tới</button>
          {hasDateFilter && (
            <button className="tk2-preset tk2-preset--clear" onClick={() => { setFDateFrom(''); setFDateTo('') }}>✕ Xóa</button>
          )}
        </div>
        {hasDateFilter && (
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--navy)', fontWeight: 600, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px' }}>
            {filtered.length} CV có deadline trong kỳ
          </div>
        )}
      </div>

      {/* Filter chips ── */}
      {activeFilters.length > 0 && (
        <div className="tk2-chips">
          {activeFilters.map(f => (
            <button key={f.label} className="tk2-chip" onClick={f.clear}>
              {f.label} <span>✕</span>
            </button>
          ))}
          <button className="tk2-chip-clear" onClick={() => { setFStatus(''); setFPriority(''); setFDept(''); setFProject(''); setFDateFrom(''); setFDateTo('') }}>
            Xóa tất cả
          </button>
        </div>
      )}

      {/* Content ── */}
      <div className="tk2-content">
        {view === 'list'      && <ListView      tasks={filtered} allTasks={tasks} onSelect={openTask} onAddSubTask={addSubTask} />}
        {view === 'kanban'    && <KanbanView    tasks={filtered} onSelect={openTask} />}
        {view === 'dept'      && <DeptView      tasks={filtered} deptNames={fsDepartments.map(d => d.name)} onOpenTask={openTask} />}
        {view === 'gantt'     && <GanttView      tasks={filtered} onSelect={openTask} onAddSubTask={addSubTask} />}
        {view === 'timeline'  && <TimelineView  tasks={filtered} onSelect={openTask} />}
        {view === 'analytics' && <AnalyticsView tasks={filtered} />}
      </div>

      {/* Slide-over ── */}
      {selected !== null && (
        <SlideOver
          task={selected === 'new' ? null : selected}
          allTasks={tasks}
          currentUser={currentUser}
          currentStaff={currentStaff}
          staffUsers={staffUsers}
          departments={fsDepartments}
          projects={fsProjects}
          onSave={saveTask}
          onDelete={deleteTask}
          onAddSubTask={addSubTask}
          onDuplicate={duplicateTask}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Export modal ── */}
      {showExport && (
        <ExportModal
          tasks={tasks}
          filters={{ status: fStatus, priority: fPriority, department: fDept, project: fProject, dateFrom: fDateFrom, dateTo: fDateTo }}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksPageInner />
    </Suspense>
  )
}
