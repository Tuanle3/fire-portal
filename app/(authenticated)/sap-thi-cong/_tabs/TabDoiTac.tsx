'use client'
import { useState, useEffect } from 'react'
import { DoiTac, DoiTacType, DOI_TAC_TYPE_LABEL } from '../_lib/types'
import { doiTacStore } from '@/lib/firebase-sap-thi-cong'

export function TabDoiTac({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<DoiTac[]>([])
  const [editing, setEditing] = useState<DoiTac | 'new' | null>(null)
  const [filter, setFilter] = useState<'all' | DoiTacType>('all')

  useEffect(() => {
    const unsub = doiTacStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  const shown = items.filter(i => filter === 'all' || i.type === filter)
  const countByType = (t: DoiTacType) => items.filter(i => i.type === t).length

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Tổng đối tác</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Nhà thầu phụ</div><div className="stc-kpi-val">{countByType('nha-thau')}</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">NCC vật tư</div><div className="stc-kpi-val">{countByType('ncc')}</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'nha-thau', 'ncc', 'khac'] as const).map(f => (
              <button
                key={f}
                className="btn-ghost"
                style={filter === f ? { background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' } : undefined}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Tất cả' : DOI_TAC_TYPE_LABEL[f]}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm đối tác</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Tên đối tác</th><th>Loại</th><th>Người liên hệ</th><th>SĐT</th><th>MST</th><th>Ghi chú</th><th></th></tr>
            </thead>
            <tbody>
              {!shown.length && <tr className="stc-empty-row"><td colSpan={7}>Chưa có đối tác nào. Đối tác cũng có thể được thêm nhanh ngay từ tab Vật tư / Nhà thầu phụ.</td></tr>}
              {shown.map(i => (
                <tr key={i.id} onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td><span className={`stc-badge stc-badge-${i.type === 'nha-thau' ? 'active' : i.type === 'ncc' ? 'done' : 'upcoming'}`}>{DOI_TAC_TYPE_LABEL[i.type]}</span></td>
                  <td>{i.contact || '—'}</td>
                  <td>{i.phone || '—'}</td>
                  <td>{i.taxCode || '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11.5 }}>{i.note || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn-del-icon" onClick={() => { if (confirm('Xoá đối tác này? (Các bản ghi vật tư/nhà thầu đã liên kết trước đó sẽ vẫn giữ tên cũ)')) doiTacStore.remove(projectId, i.id) }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <DoiTacModal projectId={projectId} value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function DoiTacModal({ projectId, value, onClose }: { projectId: string; value: DoiTac | null; onClose: () => void }) {
  const [name, setName] = useState(value?.name ?? '')
  const [type, setType] = useState<DoiTacType>(value?.type ?? 'ncc')
  const [contact, setContact] = useState(value?.contact ?? '')
  const [phone, setPhone] = useState(value?.phone ?? '')
  const [taxCode, setTaxCode] = useState(value?.taxCode ?? '')
  const [address, setAddress] = useState(value?.address ?? '')
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!name.trim()) { setErr('Vui lòng nhập tên đối tác'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        name: name.trim(), type,
        contact: contact.trim() || undefined,
        phone: phone.trim() || undefined,
        taxCode: taxCode.trim() || undefined,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
      }
      if (value) await doiTacStore.update(projectId, value.id, data)
      else await doiTacStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa đối tác' : '+ Thêm đối tác'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full"><label>Tên đối tác *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Hoa Sen Group, CT TNHH Điện Lạnh Bách Khoa..." /></div>
          <div className="stc-field">
            <label>Loại đối tác</label>
            <select value={type} onChange={e => setType(e.target.value as DoiTacType)}>
              <option value="nha-thau">Nhà thầu phụ</option>
              <option value="ncc">Nhà cung cấp vật tư</option>
              <option value="khac">Khác</option>
            </select>
          </div>
          <div className="stc-field"><label>SĐT</label><input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div className="stc-field"><label>Người liên hệ</label><input value={contact} onChange={e => setContact(e.target.value)} /></div>
          <div className="stc-field"><label>Mã số thuế</label><input value={taxCode} onChange={e => setTaxCode(e.target.value)} /></div>
          <div className="stc-field stc-field--full"><label>Địa chỉ</label><input value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div className="stc-field stc-field--full"><label>Ghi chú</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá đối tác này?')) { doiTacStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
