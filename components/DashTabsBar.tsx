'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useDashUnit } from '@/contexts/dash-unit'
import { useUserSession } from '@/contexts/user-session'

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
  const { can } = useUserSession()

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

  const DASH_PATHS = ['/dashboard', '/cocau', '/suckhoe', '/baocao', '/ecosystem', '/assets', '/data']
  if (DASH_PATHS.includes(p)) {
    return (
      <div className="dtbar" style={{ display:'flex', alignItems:'center' }}>
        {can('m:dashboard') && (
          <Link href="/dashboard" className={`dt${p === '/dashboard' ? ' dt-on' : ''}`}>Tổng quan CEO</Link>
        )}
        {can('m:dashboard') && (
          <Link href="/cocau" className={`dt${p === '/cocau' ? ' dt-on' : ''}`}>Cơ cấu thu-chi</Link>
        )}
        {can('m:dashboard') && (
          <Link href="/suckhoe" className={`dt${p === '/suckhoe' ? ' dt-on' : ''}`}>Sức khỏe &amp; Rủi ro</Link>
        )}
        {can('m:dashboard') && (
          <Link href="/baocao" className={`dt${p === '/baocao' ? ' dt-on' : ''}`}>Báo cáo chi tiết</Link>
        )}
        {can('m:dashboard') && (
          <Link href="/ecosystem" className={`dt${p === '/ecosystem' ? ' dt-on' : ''}`}>Hệ sinh thái</Link>
        )}
        {can('m:assets') && (
          <Link href="/assets" className={`dt${p === '/assets' ? ' dt-on' : ''}`}>Tài sản đảm bảo</Link>
        )}
        {can('m:data') && (
          <Link href="/data" className={`dt${p === '/data' ? ' dt-on' : ''}`}>Nhật ký dòng tiền</Link>
        )}
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
      </div>
    )
  }

  return null
}
