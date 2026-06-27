'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const TASK_VIEWS = [
  { key: 'list',      label: 'Danh sách' },
  { key: 'kanban',    label: 'Kanban' },
  { key: 'dept',      label: 'Phòng ban' },
  { key: 'gantt',     label: 'Gantt' },
  { key: 'timeline',  label: 'Timeline' },
  { key: 'analytics', label: 'Phân tích' },
]

export default function DashTabsBar() {
  const p      = usePathname()
  const params = useSearchParams()
  const view   = params.get('view') ?? 'list'

  if (p === '/tasks') {
    return (
      <div className="dtbar">
        {TASK_VIEWS.map(v => (
          <Link
            key={v.key}
            href={`/tasks?view=${v.key}`}
            className={`dt${view === v.key ? ' dt-on' : ''}`}
          >
            {v.label}
          </Link>
        ))}
      </div>
    )
  }

  if (p === '/dashboard') {
    return (
      <div className="dtbar">
        <Link href="/dashboard" className="dt dt-on">Tổng quan CEO</Link>
        <span className="dt dt-dis">Cơ cấu thu-chi</span>
        <span className="dt dt-dis">Sức khỏe &amp; Rủi ro</span>
        <Link href="/assets" className="dt">Tài sản đảm bảo</Link>
        <Link href="/data"   className="dt">Nhật ký dòng tiền</Link>
      </div>
    )
  }

  return null
}
