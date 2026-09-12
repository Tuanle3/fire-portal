'use client'
import { useState, useEffect } from 'react'
import { NguonVon, NguonVonType, fmt } from '../_lib/types'
import { NumberInput } from '../_lib/NumberInput'
import { nguonVonStore } from '@/lib/firebase-sap-thi-cong'

const TYPE_LABEL: Record<NguonVonType, string> = { 'von-tu-co': 'Vốn tự có', vay: 'Vốn vay', khac: 'Khác' }

export function TabNguonVon({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<NguonVon[]>([])
  const [editing, setEditing] = useState<NguonVon | 'new' | null>(null)

  useEffect(() => {
    const unsub = nguonVonStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  const total = items.reduce((s, i) => s + i.amount, 0)
  const byType = (t: NguonVonType) => items.filter(i => i.type === t).reduce((s, i) => s + i.amount, 0)

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng nguồn vốn</div><div className="stc-kpi-val">{fmt(total)} đ</div></div>
        <div className="stc-kpi green"><div className="stc-kpi-label">Vốn tự có</div><div className="stc-kpi-val">{fmt(byType('von-tu-co'))} đ</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Vốn vay</div><div className="stc-kpi-val">{fmt(byType('vay'))} đ</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Khác</div><div className="stc-kpi-val">{fmt(byType('khac'))} đ</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <span className="stc-panel-title">Cơ cấu nguồn vốn</span>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm nguồn vốn</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead><tr><th>Nguồn</th><th>Loại</th><th>Số tiền (đ)</th><th>Tỷ trọng</th><th>Ghi chú</th><th></th></tr></thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={6}>Chưa có dữ liệu nguồn vốn.</td></tr>}
              {items.map(i => (
                <tr key={i.id} onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{i.source}</td>
                  <td><span className={`stc-badge stc-badge-${i.type === 'von-tu-co' ? 'done' : i.type === 'vay' ? 'active' : 'upcoming'}`}>{TYPE_LABEL[i.type]}</span></td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(i.amount)}</td>
                  <td className="num">{total ? Math.round(i.amount / total * 100) : 0}%</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i.note || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn-del-icon" onClick={() => { if (confirm('Xoá nguồn vốn này?')) nguonVonStore.remove(projectId, i.id) }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <NguonVonModal projectId={projectId} value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function NguonVonModal({ projectId, value, onClose }: { projectId: string; value: NguonVon | null; onClose: () => void }) {
  const [source, setSource] = useState(value?.source ?? '')
  const [type, setType] = useState<NguonVonType>(value?.type ?? 'von-tu-co')
  const [amount, setAmount] = useState(String(value?.amount ?? ''))
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!source.trim() || !amount) { setErr('Vui lòng nhập tên nguồn và số tiền'); return }
    setSaving(true); setErr('')
    try {
      const data = { source: source.trim(), type, amount: Number(amount), note: note.trim() || undefined }
      if (value) await nguonVonStore.update(projectId, value.id, data)
      else await nguonVonStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa nguồn vốn' : '+ Thêm nguồn vốn'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full"><label>Tên nguồn *</label><input value={source} onChange={e => setSource(e.target.value)} placeholder="VD: Vốn tự có SAP, Vay VCB..." /></div>
          <div className="stc-field">
            <label>Loại</label>
            <select value={type} onChange={e => setType(e.target.value as NguonVonType)}>
              <option value="von-tu-co">Vốn tự có</option>
              <option value="vay">Vốn vay</option>
              <option value="khac">Khác</option>
            </select>
          </div>
          <div className="stc-field"><label>Số tiền (đ) *</label><NumberInput value={amount} onChange={setAmount} /></div>
          <div className="stc-field stc-field--full"><label>Ghi chú</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá nguồn vốn này?')) { nguonVonStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
