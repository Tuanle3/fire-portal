// ============================================================
// TAB — Dòng tiền (khung ghép Phần 1: nhập tay khoản thu/chi)
// Các phần 2–7 (adapter hạn mức, engine rollup, timeline,
// gap-analysis...) sẽ nối vào tab này ở các bước tiếp theo.
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { KhoanDongTien } from '@/lib/dong-tien-types'
import { subscribeDongTien } from '@/lib/dong-tien-store'
import DongTienForm from './DongTienForm'
import DongTienBangChiTiet from './DongTienBangChiTiet'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: (EntityType | 'all')[] = ['all', 'SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const ENTITY_LABEL: Record<string, string> = { all: 'Toàn tập đoàn' }

export default function TabDongTien() {
  const [entity, setEntity] = useState<EntityType | 'all'>('all')
  const [rows, setRows]     = useState<KhoanDongTien[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<KhoanDongTien | null>(null)

  useEffect(() => {
    const unsub = subscribeDongTien(setRows, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  function openNew() { setEditing(null); setShowForm(true) }
  function openEdit(k: KhoanDongTien) { setEditing(k); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  return (
    <div className="space-y-4">
      {/* Header: chọn công ty + nút thêm khoản */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {ENTITIES.map(e => (
            <button
              key={e}
              onClick={() => setEntity(e)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                entity === e
                  ? 'bg-[#1C3557] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ENTITY_LABEL[e] ?? e}
            </button>
          ))}
        </div>
        <button
          onClick={openNew}
          className="rounded-md bg-[#D4A64A] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#D4A64A]/90"
        >
          + Thêm khoản
        </button>
      </div>

      {showForm && (
        <DongTienForm
          editing={editing}
          entityMacDinh={entity === 'all' ? undefined : entity}
          onSaved={closeForm}
          onCancel={closeForm}
        />
      )}

      <DongTienBangChiTiet rows={rows} onEdit={openEdit} onChanged={() => {}} />
    </div>
  )
}
