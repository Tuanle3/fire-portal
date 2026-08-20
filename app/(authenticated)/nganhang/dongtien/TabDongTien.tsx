// ============================================================
// TAB — Dòng tiền
//   Phần 1: khoản nhập tay
//   Phần 2: khoản tự động từ hạn mức tín dụng (chỉ xem)
//   Phần 3: Aggregation Engine (hopNhatDongTien + rollupTheoDonVi)
//   Phần 4: 3 kiểu hiển thị (Tổng hợp / Timeline / Chi tiết) + lọc ngày
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { KhoanDongTien } from '@/lib/dong-tien-types'
import { subscribeDongTien } from '@/lib/dong-tien-store'
import { subscribeDongTienTuHanMuc, DongTienHanMucData } from '@/lib/dong-tien-hanmuc-adapter'
import { hopNhatDongTien } from '@/lib/dong-tien-engine'
import DongTienForm        from './DongTienForm'
import DongTienBangChiTiet from './DongTienBangChiTiet'
import DongTienTuDong      from './DongTienTuDong'
import DongTienView        from './DongTienView'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: (EntityType | 'all')[] = ['all', 'SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const ENTITY_LABEL: Record<string, string> = { all: 'Toàn tập đoàn' }

export default function TabDongTien() {
  const [entity,      setEntity]     = useState<EntityType | 'all'>('all')
  const [rows,        setRows]       = useState<KhoanDongTien[]>([])
  const [hanMucData,  setHanMucData] = useState<DongTienHanMucData>({ items: [], khaDungList: [] })
  const [showForm,    setShowForm]   = useState(false)
  const [editing,     setEditing]    = useState<KhoanDongTien | null>(null)

  useEffect(() => {
    const unsub = subscribeDongTien(setRows, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  useEffect(() => {
    const unsub = subscribeDongTienTuHanMuc(setHanMucData, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  function openNew()  { setEditing(null); setShowForm(true) }
  function openEdit(k: KhoanDongTien) { setEditing(k); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  const itemsHopNhat = hopNhatDongTien(rows, hanMucData.items)

  return (
    <div>
      {/* Bộ chọn công ty + nút thêm khoản */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ENTITIES.map(e => {
            const active = entity === e
            return (
              <button
                key={e}
                onClick={() => setEntity(e)}
                style={{
                  padding:    '6px 14px',
                  borderRadius: 20,
                  fontSize:   12,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor:     'pointer',
                  border:     '1px solid ' + (active ? 'var(--nh-navy)' : '#E5E0D8'),
                  background: active ? 'var(--nh-navy)' : '#fff',
                  color:      active ? '#fff' : '#3D3D3D',
                  transition: 'all .15s',
                }}
              >
                {ENTITY_LABEL[e as string] ?? e}
              </button>
            )
          })}
        </div>
        <button className="btn-primary" onClick={openNew}>+ Thêm khoản</button>
      </div>

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

      {/* Phần 1: nhập tay */}
      <div style={{ marginBottom: 14 }}>
        <DongTienBangChiTiet rows={rows} onEdit={openEdit} onChanged={() => {}} />
      </div>

      {/* Phần 2: tự động từ hạn mức */}
      <div style={{ marginBottom: 14 }}>
        <DongTienTuDong items={hanMucData.items} />
      </div>

      {/* Phần 3+4: engine rollup + 3 kiểu hiển thị */}
      <DongTienView items={itemsHopNhat} />
    </div>
  )
}
