'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useDashUnit } from '@/contexts/dash-unit'

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
  const { unit, setUnit } = useDashUnit()

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

  const DASH_PATHS = ['/dashboard', '/assets', '/data']
  if (DASH_PATHS.includes(p)) {
    return (
      <div className="dtbar" style={{ display:'flex', alignItems:'center' }}>
        <Link href="/dashboard" className={`dt${p === '/dashboard' ? ' dt-on' : ''}`}>Tổng quan CEO</Link>
        <span className="dt dt-dis">Cơ cấu thu-chi</span>
        <span className="dt dt-dis">Sức khỏe &amp; Rủi ro</span>
        <Link href="/assets" className={`dt${p === '/assets' ? ' dt-on' : ''}`}>Tài sản đảm bảo</Link>
        <Link href="/data"   className={`dt${p === '/data'   ? ' dt-on' : ''}`}>Nhật ký dòng tiền</Link>
        {p === '/dashboard' && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:3 }}>
            {(['đ', 'tr', 'tỷ'] as const).map(u => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`unit-btn${unit === u ? ' on' : ''}`}
              >
                {u === 'đ' ? 'đ' : `${u} đ`}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}
