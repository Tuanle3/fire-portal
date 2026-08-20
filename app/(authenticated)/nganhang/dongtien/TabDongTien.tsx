// ============================================================
// TAB — Dòng tiền
//   Phần 1: khoản nhập tay (có thể thu gọn)
//   Phần 2: khoản tự động từ hạn mức tín dụng (có thể thu gọn)
//   Phần 3: Aggregation Engine
//   Phần 4: 3 kiểu hiển thị
//
//   ⚙️ NGUYÊN TẮC: LỌC 1 LẦN DUY NHẤT ở đây (ngày + loại + trạng
//   thái), mọi phần bên dưới (nhập tay / tự động / tổng hợp /
//   timeline / chi tiết) đều dùng chung dữ liệu đã lọc — không
//   có bộ lọc riêng lẻ ở component con nữa, tránh rối/lệch số.
//
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
  return { tu: '', den: '' } // 'tat-ca'
}

const SHORTCUTS = [
  { key: 'thang-nay', label: 'Tháng này' },
  { key: 'quy-nay',   label: 'Quý này'   },
  { key: '6-thang',   label: '6 tháng'   },
  { key: 'nam-nay',   label: 'Năm nay'   },
  { key: 'tat-ca',    label: 'Tất cả'    },
]

// ── Mặc định mở tab: Quý này (gọn, đỡ rối mắt) ───────────────
const DEFAULT_SHORTCUT = 'quy-nay'

export default function TabDongTien() {
  const [entity,     setEntity]    = useState<EntityType | 'all'>('all')
  const [rows,       setRows]      = useState<KhoanDongTien[]>([])
  const [hanMucData, setHanMucData]= useState<DongTienHanMucData>({ items: [], khaDungList: [] })
  const [showForm,   setShowForm]  = useState(false)
  const [editing,    setEditing]   = useState<KhoanDongTien | null>(null)

  // ── BỘ LỌC HỢP NHẤT — dùng chung cho toàn bộ tab ─────────────
  const initRange = shortcutRange(DEFAULT_SHORTCUT)
  const [tuNgay,   setTuNgay]   = useState(initRange.tu)
  const [denNgay,  setDenNgay]  = useState(initRange.den)
  const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT)
  const [locLoai,      setLocLoai]      = useState<'all' | 'thu' | 'chi'>('all')
  const [locTrangThai, setLocTrangThai] = useState<'all' | 'du-kien' | 'thuc-te'>('all')

  // ── Thu gọn card nhập tay / tự động ─────────────────────────
  const [moNhapTay, setMoNhapTay] = useState(false)
  const [moTuDong,  setMoTuDong]  = useState(false)

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

  function openNew()   { setEditing(null); setShowForm(true); setMoNhapTay(true) }
  function openEdit(k: KhoanDongTien) { setEditing(k); setShowForm(true); setMoNhapTay(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  // ── Lọc khoản NHẬP TAY: ngày + loại + trạng thái ────────────
  const rowsFiltered = useMemo(() => {
    return rows
      .filter(r => !tuNgay  || r.ngayDuKien >= tuNgay)
      .filter(r => !denNgay || r.ngayDuKien <= denNgay)
      .filter(r => locLoai === 'all' || r.loai === locLoai)
      .filter(r => {
        if (locTrangThai === 'all') return true
        const trang = r.daThucHien ? 'thuc-te' : 'du-kien'
        return trang === locTrangThai
      })
  }, [rows, tuNgay, denNgay, locLoai, locTrangThai])

  // ── Lọc khoản TỰ ĐỘNG (hạn mức): ngày + loại + trạng thái ───
  const hanMucFiltered = useMemo(() => {
    let list = locTheoKhoangNgay(hanMucData.items, tuNgay || undefined, denNgay || undefined)
    if (locLoai !== 'all')      list = list.filter(it => it.loai === locLoai)
    if (locTrangThai !== 'all') list = list.filter(it => it.trangThai === locTrangThai)
    return list
  }, [hanMucData.items, tuNgay, denNgay, locLoai, locTrangThai])

  // ── Hợp nhất — đã lọc sẵn từ 2 nguồn trên, dùng cho Tổng hợp/Timeline/Chi tiết ──
  const itemsHopNhat = useMemo(
    () => hopNhatDongTien(rowsFiltered, hanMucFiltered),
    [rowsFiltered, hanMucFiltered],
  )

  const dangLoc = !!(tuNgay || denNgay || locLoai !== 'all' || locTrangThai !== 'all')

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
      {/* ── THANH ĐIỀU KHIỂN: chỉ chọn pháp nhân ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
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

      {/* ── BỘ LỌC HỢP NHẤT (ngày + loại + trạng thái) — áp dụng CHO TẤT CẢ bên dưới ── */}
      <div style={{
        background: '#F7F9FC', border: '1px solid var(--nh-border)',
        borderRadius: 10, padding: '10px 16px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nh-navy)', marginRight: 4 }}>
          🗓 Lọc:
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

        <span style={{ color: '#ddd' }}>|</span>
        <select className="nh-select" style={{ width: 130 }} value={locLoai} onChange={e => setLocLoai(e.target.value as any)}>
          <option value="all">Tất cả loại</option>
          <option value="thu">Chỉ khoản THU</option>
          <option value="chi">Chỉ khoản CHI</option>
        </select>
        <select className="nh-select" style={{ width: 150 }} value={locTrangThai} onChange={e => setLocTrangThai(e.target.value as any)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="du-kien">Dự kiến</option>
          <option value="thuc-te">Đã thực hiện</option>
        </select>

        {dangLoc && (
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => {
              applyShortcut(DEFAULT_SHORTCUT)
              setLocLoai('all'); setLocTrangThai('all')
            }}>
            ✕ Xoá lọc
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--nh-muted2)' }}>
          {rowsFiltered.length + hanMucFiltered.length} khoản (nhập tay {rowsFiltered.length} + tự động {hanMucFiltered.length})
        </span>
      </div>

      {/* ── FORM THÊM/SỬA (hiện ngay trên card nhập tay khi bấm) ── */}
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

      {/* ── PHẦN 1: NHẬP TAY (có thể thu gọn) — nút Thêm khoản nằm đúng đây ── */}
      <div className="nh-card" style={{ marginBottom: 14 }}>
        <div className="nh-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span
            className="nh-card-title"
            onClick={() => setMoNhapTay(v => !v)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {moNhapTay ? '▲' : '▶'} Danh sách khoản nhập tay
            <span className="nh-badge nh-b-grey" style={{ marginLeft: 8 }}>
              {rowsFiltered.length} khoản
            </span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              onClick={() => setMoNhapTay(v => !v)}
              style={{ cursor: 'pointer', fontSize: 12, color: 'var(--nh-muted2)' }}
            >
              {moNhapTay ? 'Thu gọn' : 'Mở rộng'}
            </span>
            <button className="btn-primary" onClick={openNew}>+ Thêm khoản</button>
          </div>
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

      {/* ── PHẦN 3+4: ENGINE ROLLUP + 3 KIỂU HIỂN THỊ — dùng dữ liệu đã lọc ở trên ── */}
      <DongTienView items={itemsHopNhat} />
    </div>
  )
}