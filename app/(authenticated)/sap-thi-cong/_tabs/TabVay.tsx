'use client'
import { useState, useEffect } from 'react'
import { KhoanVay, KyTraNo, fmt } from '../_lib/types'
import { NumberInput } from '../_lib/NumberInput'
import { khoanVayStore, kyTraNoStore } from '@/lib/firebase-sap-thi-cong'

export function TabVay({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<KhoanVay[]>([])
  const [editing, setEditing] = useState<KhoanVay | 'new' | null>(null)
  const [panelId, setPanelId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = khoanVayStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  const totalAmount = items.reduce((s, i) => s + i.amount, 0)

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Số đợt giải ngân</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng đã giải ngân</div><div className="stc-kpi-val">{fmt(totalAmount)} đ</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <span className="stc-panel-title">Danh sách khoản vay / đợt giải ngân</span>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm đợt vay</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Đợt giải ngân</th><th>Ngày</th><th>Ngân hàng</th><th>Số tiền (đ)</th><th>Lãi suất</th><th>Ghi chú</th><th></th></tr>
            </thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={7}>Chưa có khoản vay nào.</td></tr>}
              {items.map(i => (
                <tr key={i.id} onClick={() => setPanelId(i.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{i.batch}</td>
                  <td>{i.date}</td>
                  <td>{i.bank || '—'}</td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(i.amount)}</td>
                  <td className="num">{i.interestRate ? `${i.interestRate}%/năm` : '—'}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i.note || '—'}</td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setEditing(i)}>Sửa</button>
                    <button className="btn-del-icon" onClick={() => { if (confirm('Xoá khoản vay này?')) khoanVayStore.remove(projectId, i.id) }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <KhoanVayModal projectId={projectId} value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {panelId && <LichTraNoPanel projectId={projectId} vay={items.find(i => i.id === panelId)!} onClose={() => setPanelId(null)} />}
    </>
  )
}

function KhoanVayModal({ projectId, value, onClose }: { projectId: string; value: KhoanVay | null; onClose: () => void }) {
  const [batch, setBatch] = useState(value?.batch ?? '')
  const [date, setDate] = useState(value?.date ?? new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(String(value?.amount ?? ''))
  const [bank, setBank] = useState(value?.bank ?? '')
  const [interestRate, setInterestRate] = useState(String(value?.interestRate ?? ''))
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!batch.trim() || !amount) { setErr('Vui lòng nhập tên đợt và số tiền'); return }
    setSaving(true); setErr('')
    try {
      const data = { batch: batch.trim(), date, amount: Number(amount), bank: bank.trim() || undefined, interestRate: interestRate ? Number(interestRate) : undefined, note: note.trim() || undefined }
      if (value) await khoanVayStore.update(projectId, value.id, data)
      else await khoanVayStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa khoản vay' : '+ Thêm đợt vay / giải ngân'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field"><label>Tên đợt giải ngân *</label><input value={batch} onChange={e => setBatch(e.target.value)} placeholder="VD: GN đợt 1" /></div>
          <div className="stc-field"><label>Ngày giải ngân</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="stc-field"><label>Số tiền (đ) *</label><NumberInput value={amount} onChange={setAmount} /></div>
          <div className="stc-field"><label>Ngân hàng</label><input value={bank} onChange={e => setBank(e.target.value)} /></div>
          <div className="stc-field"><label>Lãi suất (%/năm)</label><input type="number" value={interestRate} onChange={e => setInterestRate(e.target.value)} /></div>
          <div className="stc-field stc-field--full"><label>Ghi chú</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá khoản vay này?')) { khoanVayStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}

function LichTraNoPanel({ projectId, vay, onClose }: { projectId: string; vay: KhoanVay; onClose: () => void }) {
  const [kys, setKys] = useState<KyTraNo[]>([])
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    const unsub = kyTraNoStore.subscribe(projectId, vay.id, setKys)
    return () => unsub()
  }, [projectId, vay.id])

  const totalGoc = kys.reduce((s, k) => s + k.goc, 0)
  const totalLai = kys.reduce((s, k) => s + k.lai, 0)
  const paidCount = kys.filter(k => k.paid).length

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal" style={{ width: 'min(700px,96vw)' }}>
        <div className="stc-modal-head">
          <div>
            <div className="stc-modal-title">Lịch trả nợ – {vay.batch}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Số tiền vay: <strong style={{ color: 'var(--gold2)' }}>{fmt(vay.amount)} đ</strong> {vay.bank ? `— ${vay.bank}` : ''}</div>
          </div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 0' }}>
          <div className="stc-kpi-row" style={{ marginBottom: 12 }}>
            <div className="stc-kpi"><div className="stc-kpi-label">Số kỳ</div><div className="stc-kpi-val">{kys.length}</div></div>
            <div className="stc-kpi"><div className="stc-kpi-label">Đã trả</div><div className="stc-kpi-val">{paidCount}/{kys.length}</div></div>
            <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng gốc</div><div className="stc-kpi-val">{fmt(totalGoc)} đ</div></div>
            <div className="stc-kpi red"><div className="stc-kpi-label">Tổng lãi</div><div className="stc-kpi-val">{fmt(totalLai)} đ</div></div>
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', overflowY: 'auto', maxHeight: '50vh' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Thêm kỳ trả nợ</button>
          </div>
          <table className="stc-table">
            <thead><tr><th>Ngày đến hạn</th><th>Gốc (đ)</th><th>Lãi (đ)</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {!kys.length && <tr className="stc-empty-row"><td colSpan={5}>Chưa có kỳ trả nợ nào.</td></tr>}
              {kys.map(k => (
                <tr key={k.id}>
                  <td>{k.dueDate}</td>
                  <td className="num">{fmt(k.goc)}</td>
                  <td className="num">{fmt(k.lai)}</td>
                  <td>
                    <button
                      className={`stc-badge stc-badge-${k.paid ? 'done' : 'active'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                      onClick={() => kyTraNoStore.remove(projectId, vay.id, k.id).then(() => kyTraNoStore.add(projectId, vay.id, { dueDate: k.dueDate, goc: k.goc, lai: k.lai, paid: !k.paid }))}
                    >
                      {k.paid ? 'Đã trả' : 'Chưa trả'}
                    </button>
                  </td>
                  <td><button className="btn-del-icon" onClick={() => { if (confirm('Xoá kỳ trả nợ này?')) kyTraNoStore.remove(projectId, vay.id, k.id) }}>🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd && <KyTraNoAddModal projectId={projectId} vayId={vay.id} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function KyTraNoAddModal({ projectId, vayId, onClose }: { projectId: string; vayId: string; onClose: () => void }) {
  const [dueDate, setDueDate] = useState('')
  const [goc, setGoc] = useState('')
  const [lai, setLai] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!dueDate) { setErr('Vui lòng chọn ngày đến hạn'); return }
    setSaving(true); setErr('')
    try {
      await kyTraNoStore.add(projectId, vayId, { dueDate, goc: Number(goc) || 0, lai: Number(lai) || 0, paid: false })
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">+ Thêm kỳ trả nợ</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full"><label>Ngày đến hạn *</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          <div className="stc-field"><label>Gốc (đ)</label><NumberInput value={goc} onChange={setGoc} /></div>
          <div className="stc-field"><label>Lãi (đ)</label><NumberInput value={lai} onChange={setLai} /></div>
        </div>
        <div className="stc-modal-foot">
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
