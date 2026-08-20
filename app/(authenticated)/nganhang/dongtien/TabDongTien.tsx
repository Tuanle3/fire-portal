// ============================================================
// TAB — Dòng tiền
//   Phần 1: khoản nhập tay (có thể thu gọn)
//   Phần 2: khoản tự động từ hạn mức tín dụng (có thể thu gọn)
//   Phần 3: Aggregation Engine
//   Phần 4: 3 kiểu hiển thị + bộ lọc ngày TOÀN TAB
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useEffect, useState, useMemo } from 'react'
import { KhoanDongTien } from '@/lib/dong-tien-types'
import { subscribeDongTien } from '@/lib/dong-tien-store'
import { subscribeDongTienTuHanMuc, DongTienHanMucData } from '@/lib/dong-tien-hanmuc-adapter'
import { hopNhatDongTien, locTheoKhoangNgay } from '@/lib/dong-tien-engine'
import DongTienForm        from './DongTienForm'
import DongTienBangChiTiet from './DongTienBangChiTiet'
import DongTienTuDong      from './DongTienTuDong'
import DongTienView        from './DongTienView'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: (EntityType | 'all')[] = ['all', 'SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const ENTITY_LABEL: Record<string, string> = { all: 'Toàn tập đoàn' }

// ── Shortcut khoảng ngày ─────────────────────────────────────
function shortcutRange(key: string): { tu: string; den: string } {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')

  if (key === 'thang-nay') {
    return { tu: `${y}-${pad(m + 1)}-01`, den: `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}` }
  }
  if (key === 'quy-nay') {
    const q  = Math.floor(m / 3)
    const t  = q * 3
    return { tu: `${y}-${pad(t + 1)}-01`, den: `${y}-${pad(t + 3)}-${new Date(y, t + 3, 0).getDate()}` }
  }
  if (key === '6-thang') {
    const six = new Date(y, m - 5, 1)
    return {
      tu:  `${six.getFullYear()}-${pad(six.getMonth() + 1)}-01`,
      den: `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`,
    }
  }
  if (key === 'nam-nay') return { tu: `${y}-01-01`, den: `${y}-12-31` }
  return { tu: '', den: '' }
}

const SHORTCUTS = [
  { key: 'thang-nay', label: 'Tháng này' },
  { key: 'quy-nay',   label: 'Quý này'   },
  { key: '6-thang',   label: '6 tháng'   },
  { key: 'nam-nay',   label: 'Năm nay'   },
  { key: 'tat-ca',    label: 'Tất cả'    },
]

export default function TabDongTien() {
  const [entity,     setEntity]    = useState<EntityType | 'all'>('all')
  const [rows,       setRows]      = useState<KhoanDongTien[]>([])
  const [hanMucData, setHanMucData]= useState<DongTienHanMucData>({ items: [], khaDungList: [] })
  const [showForm,   setShowForm]  = useState(false)
  const [editing,    setEditing]   = useState<KhoanDongTien | null>(null)

  // ── Bộ lọc ngày TOÀN TAB ────────────────────────────────────
  const [tuNgay,   setTuNgay]   = useState('')
  const [denNgay,  setDenNgay]  = useState('')
  const [shortcut, setShortcut] = useState('tat-ca')

  // ── Thu gọn card nhập tay / tự động ─────────────────────────
  const [moNhapTay, setMoNhapTay]   = useState(false)
  const [moTuDong,  setMoTuDong]    = useState(false)

  function applyShortcut(key: string) {
    setShortcut(key)
    const { tu, den } = shortcutRange(key)
    setTuNgay(tu); setDenNgay(den)
  }

  useEffect(() => {
    const unsub = subscribeDongTien(setRows, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  useEffect(() => {
    const unsub = subscribeDongTienTuHanMuc(setHanMucData, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  function openNew()   { setEditing(null); setShowForm(true) }
  function openEdit(k: KhoanDongTien) { setEditing(k); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  // ── Lọc dữ liệu theo khoảng ngày ────────────────────────────
  const rowsFiltered = useMemo(() => {
    if (!tuNgay && !denNgay) return rows
    return rows.filter(r => {
      const ng = r.ngayDuKien
      if (tuNgay  && ng < tuNgay)  return false
      if (denNgay && ng > denNgay) return false
      return true
    })
  }, [rows, tuNgay, denNgay])

  const hanMucFiltered = useMemo(() => {
    if (!tuNgay && !denNgay) return hanMucData.items
    return locTheoKhoangNgay(hanMucData.items, tuNgay || undefined, denNgay || undefined)
  }, [hanMucData.items, tuNgay, denNgay])

  const itemsHopNhat = useMemo(
    () => hopNhatDongTien(rows, hanMucData.items),
    [rows, hanMucData.items],
  )

  // ── Style helper cho nút shortcut ───────────────────────────
  function scBtn(key: string) {
    const active = shortcut === key
    return {
      padding: '4px 12px', borderRadius: 20, fontSize: 12,
      fontFamily: 'inherit', cursor: 'pointer',
      border: '1px solid ' + (active ? 'var(--nh-navy)' : '#E5E0D8'),
      background: active ? 'var(--nh-navy)' : '#fff',
      color:      active ? '#fff' : '#3D3D3D',
      fontWeight: active ? 700 : 400,
      transition: 'all .12s',
    } as React.CSSProperties
  }

  return (
    <div>
      {/* ── THANH ĐIỀU KHIỂN: entity + thêm khoản ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ENTITIES.map(e => {
            const active = entity === e
            return (
              <button key={e} onClick={() => setEntity(e)} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
                border:     '1px solid ' + (active ? 'var(--nh-navy)' : '#E5E0D8'),
                background: active ? 'var(--nh-navy)' : '#fff',
                color:      active ? '#fff' : '#3D3D3D',
                transition: 'all .15s',
              }}>
                {ENTITY_LABEL[e as string] ?? e}
              </button>
            )
          })}
        </div>
        <button className="btn-primary" onClick={openNew}>+ Thêm khoản</button>
      </div>

      {/* ── BỘ LỌC NGÀY TOÀN TAB ── */}
      <div style={{
        background: '#F7F9FC', border: '1px solid var(--nh-border)',
        borderRadius: 10, padding: '10px 16px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nh-navy)', marginRight: 4 }}>
          🗓 Lọc theo ngày:
        </span>
        {SHORTCUTS.map(s => (
          <button key={s.key} onClick={() => applyShortcut(s.key)} style={scBtn(s.key)}>
            {s.label}
          </button>
        ))}
        <span style={{ color: '#ddd' }}>|</span>
        <label style={{ fontSize: 12, color: 'var(--nh-muted2)', margin: 0 }}>Từ</label>
        <input
          type="date" className="nh-input" style={{ width: 145 }}
          value={tuNgay}
          onChange={e => { setTuNgay(e.target.value); setShortcut('') }}
        />
        <label style={{ fontSize: 12, color: 'var(--nh-muted2)', margin: 0 }}>Đến</label>
        <input
          type="date" className="nh-input" style={{ width: 145 }}
          value={denNgay}
          onChange={e => { setDenNgay(e.target.value); setShortcut('') }}
        />
        {(tuNgay || denNgay) && (
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { setTuNgay(''); setDenNgay(''); setShortcut('tat-ca') }}>
            ✕ Xoá lọc
          </button>
        )}
        {(tuNgay || denNgay) && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--nh-muted2)' }}>
            {rowsFiltered.length + hanMucFiltered.length} khoản trong khoảng
          </span>
        )}
      </div>

      {/* ── FORM THÊM/SỬA ── */}
      {showForm && (
        <div style={{ marginBottom: 14 }}>
          <DongTienForm
            editing={editing}
            entityMacDinh={entity === 'all' ? undefined : entity}
            onSaved={closeForm}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* ── PHẦN 1: NHẬP TAY (có thể thu gọn) ── */}
      <div className="nh-card" style={{ marginBottom: 14 }}>
        <div
          className="nh-card-head"
          onClick={() => setMoNhapTay(v => !v)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span className="nh-card-title">
            {moNhapTay ? '▲' : '▶'} Danh sách khoản nhập tay
            <span className="nh-badge nh-b-grey" style={{ marginLeft: 8 }}>
              {rowsFiltered.length} khoản
            </span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>
            {moNhapTay ? 'Thu gọn' : 'Mở rộng'}
          </span>
        </div>
        {moNhapTay && (
          <div className="nh-card-body" style={{ padding: 0 }}>
            <DongTienBangChiTiet rows={rowsFiltered} onEdit={openEdit} onChanged={() => {}} />
          </div>
        )}
      </div>

      {/* ── PHẦN 2: TỰ ĐỘNG TỪ HẠN MỨC (có thể thu gọn) ── */}
      <div className="nh-card" style={{ marginBottom: 14 }}>
        <div
          className="nh-card-head"
          onClick={() => setMoTuDong(v => !v)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span className="nh-card-title">
            {moTuDong ? '▲' : '▶'} Tự động từ hạn mức tín dụng
            <span className="nh-badge nh-b-blue" style={{ marginLeft: 8 }}>
              {hanMucFiltered.length} khoản
            </span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>
            {moTuDong ? 'Thu gọn' : 'Mở rộng'}
          </span>
        </div>
        {moTuDong && (
          <div className="nh-card-body" style={{ padding: 0 }}>
            <DongTienTuDong items={hanMucFiltered} />
          </div>
        )}
      </div>

      {/* ── PHẦN 3+4: ENGINE ROLLUP + 3 KIỂU HIỂN THỊ ── */}
      <DongTienView items={itemsHopNhat} />
    </div>
  )
}
