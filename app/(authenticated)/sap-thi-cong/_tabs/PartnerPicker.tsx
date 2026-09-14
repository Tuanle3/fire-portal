'use client'
import { useState } from 'react'
import { DoiTac, DoiTacType } from './types'
import { doiTacStore } from '@/lib/firebase-sap-thi-cong'

// Dropdown chọn Đối tác (Nhà thầu phụ / NCC vật tư) từ danh mục dùng chung,
// hoặc thêm nhanh 1 đối tác mới ngay tại chỗ. Chọn xong sẽ trả về
// (doiTacId, name) để form cha tự điền vào field tên hiển thị của nó —
// nếu người dùng sau đó gõ tay đổi tên khác đi, form cha nên tự bỏ
// doiTacId (coi như không còn liên kết danh mục, vẫn lưu được bình thường).
export function PartnerPicker({
  projectId, doiTacs, type, doiTacId, onPick,
}: {
  projectId: string
  doiTacs: DoiTac[]
  type: DoiTacType
  doiTacId?: string
  onPick: (doiTacId: string | undefined, name: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const options = doiTacs.filter(d => d.type === type)

  async function handleAddNew() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const ref = await doiTacStore.add(projectId, { name: newName.trim(), type })
      onPick(ref.id, newName.trim())
      setAdding(false)
      setNewName('')
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Tên đối tác mới..."
          style={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNew() } }}
        />
        <button type="button" className="btn-ghost" disabled={saving} onClick={handleAddNew}>Lưu</button>
        <button type="button" className="btn-ghost" onClick={() => { setAdding(false); setNewName('') }}>Huỷ</button>
      </div>
    )
  }

  return (
    <select
      value={doiTacId ?? ''}
      onChange={e => {
        const v = e.target.value
        if (v === '__new__') { setAdding(true); return }
        if (v === '') return
        const d = options.find(o => o.id === v)
        if (d) onPick(d.id, d.name)
      }}
    >
      <option value="">— Chọn từ danh mục Đối tác —</option>
      {options.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      <option value="__new__">+ Thêm đối tác mới...</option>
    </select>
  )
}
