'use client'
import { useState, useEffect } from 'react'
import { VatTuItem, fmt } from '../_lib/types'
import { vatTuStore } from '@/lib/firebase-sap-thi-cong'

export function TabVatTu({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<VatTuItem[]>([])
  const [editing, setEditing] = useState<VatTuItem | 'new' | null>(null)

  useEffect(() => {
    const unsub = vatTuStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  const totalCost = items.reduce((s, i) => s + i.qtyUsed * i.unitPrice, 0)
  const overCount = items.filter(i => i.qtyUsed > i.qtyPlanned).length

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Số mặt hàng</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng chi phí vật tư đã dùng</div><div className="stc-kpi-val">{fmt(totalCost)} đ</div></div>
        <div className="stc-kpi red"><div className="stc-kpi-label">Vượt định mức</div><div className="stc-kpi-val">{overCount}</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <span className="stc-panel-title">Danh sách vật tư</span>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm vật tư</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Tên vật tư</th><th>ĐVT</th><th>KH</th><th>Đã dùng</th><th>Đơn giá (đ)</th><th>Thành tiền (đ)</th><th>NCC</th><th></th></tr>
            </thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={8}>Chưa có vật tư nào.</td></tr>}
              {items.map(i => {
                const over = i.qtyUsed > i.qtyPlanned
                return (
                  <tr key={i.id} onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td className="num">{fmt(i.qtyPlanned)}</td>
                    <td className="num" style={{ color: over ? '#DC2626' : undefined, fontWeight: over ? 700 : undefined }}>{fmt(i.qtyUsed)}</td>
                    <td className="num">{fmt(i.unitPrice)}</td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(i.qtyUsed * i.unitPrice)}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i.supplier || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn-del-icon" onClick={() => { if (confirm('Xoá vật tư này?')) vatTuStore.remove(projectId, i.id) }}>🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <VatTuModal projectId={projectId} value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function VatTuModal({ projectId, value, onClose }: { projectId: string; value: VatTuItem | null; onClose: () => void }) {
  const [name, setName] = useState(value?.name ?? '')
  const [unit, setUnit] = useState(value?.unit ?? '')
  const [qtyPlanned, setQtyPlanned] = useState(String(value?.qtyPlanned ?? ''))
  const [qtyUsed, setQtyUsed] = useState(String(value?.qtyUsed ?? 0))
  const [unitPrice, setUnitPrice] = useState(String(value?.unitPrice ?? ''))
  const [supplier, setSupplier] = useState(value?.supplier ?? '')
  const [date, setDate] = useState(value?.date ?? '')
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!name.trim() || !unit.trim()) { setErr('Vui lòng nhập tên vật tư và đơn vị tính'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        name: name.trim(), unit: unit.trim(),
        qtyPlanned: Number(qtyPlanned) || 0, qtyUsed: Number(qtyUsed) || 0,
        unitPrice: Number(unitPrice) || 0,
        supplier: supplier.trim() || undefined, date: date || undefined, note: note.trim() || undefined,
      }
      if (value) await vatTuStore.update(projectId, value.id, data)
      else await vatTuStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa vật tư' : '+ Thêm vật tư'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full"><label>Tên vật tư *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Xi măng PCB40" /></div>
          <div className="stc-field"><label>Đơn vị tính *</label><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="tấn / m³ / bao..." /></div>
          <div className="stc-field"><label>Đơn giá (đ)</label><input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} /></div>
          <div className="stc-field"><label>Khối lượng kế hoạch</label><input type="number" value={qtyPlanned} onChange={e => setQtyPlanned(e.target.value)} /></div>
          <div className="stc-field"><label>Khối lượng đã dùng</label><input type="number" value={qtyUsed} onChange={e => setQtyUsed(e.target.value)} /></div>
          <div className="stc-field"><label>Nhà cung cấp</label><input value={supplier} onChange={e => setSupplier(e.target.value)} /></div>
          <div className="stc-field"><label>Ngày nhập</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="stc-field stc-field--full"><label>Ghi chú</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá vật tư này?')) { vatTuStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
