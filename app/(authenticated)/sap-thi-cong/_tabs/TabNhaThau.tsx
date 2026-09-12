'use client'
import { useState, useEffect } from 'react'
import { NhaThau, NhaThauStatus, NghiemThu, NghiemThuStatus, fmt } from '../_lib/types'
import { NumberInput } from '../_lib/NumberInput'
import { nhaThauStore, nghiemThuStore } from '@/lib/firebase-sap-thi-cong'

const NT_STATUS_LABEL: Record<NhaThauStatus, string> = { active: 'Đang thi công', done: 'Hoàn thành', paused: 'Tạm dừng' }

export function TabNhaThau({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<NhaThau[]>([])
  const [editing, setEditing] = useState<NhaThau | 'new' | null>(null)
  const [panelId, setPanelId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = nhaThauStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  const totalContract = items.reduce((s, i) => s + i.contractValue, 0)

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Số nhà thầu phụ</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng giá trị hợp đồng</div><div className="stc-kpi-val">{fmt(totalContract)} đ</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <span className="stc-panel-title">Danh sách nhà thầu phụ</span>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm nhà thầu</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Nhà thầu</th><th>Phạm vi công việc</th><th>Giá trị HĐ (đ)</th><th>Giữ lại BH</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={6}>Chưa có nhà thầu phụ nào.</td></tr>}
              {items.map(i => (
                <tr key={i.id} onClick={() => setPanelId(i.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i.scope || '—'}</td>
                  <td className="num">{fmt(i.contractValue)}</td>
                  <td className="num">{i.retainPct}%</td>
                  <td><span className={`stc-badge stc-badge-${i.status === 'done' ? 'done' : i.status === 'paused' ? 'upcoming' : 'active'}`}>{NT_STATUS_LABEL[i.status]}</span></td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setEditing(i)}>Sửa</button>
                    <button className="btn-del-icon" onClick={() => { if (confirm('Xoá nhà thầu này?')) nhaThauStore.remove(projectId, i.id) }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <NhaThauModal projectId={projectId} value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {panelId && (
        <NghiemThuPanel
          projectId={projectId}
          subcon={items.find(i => i.id === panelId)!}
          onClose={() => setPanelId(null)}
        />
      )}
    </>
  )
}

function NhaThauModal({ projectId, value, onClose }: { projectId: string; value: NhaThau | null; onClose: () => void }) {
  const [name, setName] = useState(value?.name ?? '')
  const [scope, setScope] = useState(value?.scope ?? '')
  const [contractValue, setContractValue] = useState(String(value?.contractValue ?? ''))
  const [retainPct, setRetainPct] = useState(String(value?.retainPct ?? 5))
  const [status, setStatus] = useState<NhaThauStatus>(value?.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!name.trim() || !contractValue) { setErr('Vui lòng nhập tên nhà thầu và giá trị hợp đồng'); return }
    setSaving(true); setErr('')
    try {
      const data = { name: name.trim(), scope: scope.trim() || undefined, contractValue: Number(contractValue), retainPct: Number(retainPct) || 0, status }
      if (value) await nhaThauStore.update(projectId, value.id, data)
      else await nhaThauStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa nhà thầu phụ' : '+ Thêm nhà thầu phụ'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full"><label>Tên nhà thầu *</label><input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="stc-field stc-field--full"><label>Phạm vi công việc</label><input value={scope} onChange={e => setScope(e.target.value)} placeholder="VD: Thi công phần thô..." /></div>
          <div className="stc-field"><label>Giá trị hợp đồng (đ) *</label><NumberInput value={contractValue} onChange={setContractValue} /></div>
          <div className="stc-field"><label>% Giữ lại bảo hành</label><input type="number" min={0} max={20} value={retainPct} onChange={e => setRetainPct(e.target.value)} /></div>
          <div className="stc-field stc-field--full">
            <label>Trạng thái</label>
            <select value={status} onChange={e => setStatus(e.target.value as NhaThauStatus)}>
              <option value="active">Đang thi công</option>
              <option value="done">Hoàn thành</option>
              <option value="paused">Tạm dừng</option>
            </select>
          </div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá nhà thầu này?')) { nhaThauStore.remove(projectId, value.id); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}

function NghiemThuPanel({ projectId, subcon, onClose }: { projectId: string; subcon: NhaThau; onClose: () => void }) {
  const [acs, setAcs] = useState<NghiemThu[]>([])
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    const unsub = nghiemThuStore.subscribe(projectId, subcon.id, setAcs)
    return () => unsub()
  }, [projectId, subcon.id])

  const totalVal = acs.reduce((s, a) => s + a.value, 0)
  const totalRetain = acs.reduce((s, a) => s + a.retain, 0)
  const totalPaid = acs.reduce((s, a) => s + a.paid, 0)
  const totalUnpaid = acs.reduce((s, a) => s + (a.netPayable - a.paid), 0)

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal" style={{ width: 'min(900px,96vw)' }}>
        <div className="stc-modal-head">
          <div>
            <div className="stc-modal-title">Nghiệm thu – {subcon.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{subcon.scope} &nbsp;|&nbsp; Giá trị HĐ: <strong style={{ color: 'var(--gold2)' }}>{fmt(subcon.contractValue)} đ</strong> &nbsp;|&nbsp; Giữ lại BH: {subcon.retainPct}%</div>
          </div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 0' }}>
          <div className="stc-kpi-row" style={{ marginBottom: 12 }}>
            <div className="stc-kpi"><div className="stc-kpi-label">Số đợt NT</div><div className="stc-kpi-val">{acs.length}</div></div>
            <div className="stc-kpi green"><div className="stc-kpi-label">Tổng GT nghiệm thu</div><div className="stc-kpi-val">{fmt(totalVal)} đ</div></div>
            <div className="stc-kpi red"><div className="stc-kpi-label">Giữ lại BH</div><div className="stc-kpi-val">{fmt(totalRetain)} đ</div></div>
            <div className="stc-kpi green"><div className="stc-kpi-label">Đã thanh toán</div><div className="stc-kpi-val">{fmt(totalPaid)} đ</div></div>
            <div className="stc-kpi red"><div className="stc-kpi-label">Còn phải TT</div><div className="stc-kpi-val">{fmt(totalUnpaid)} đ</div></div>
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', overflowY: 'auto', maxHeight: '50vh' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Thêm đợt NT</button>
          </div>
          <table className="stc-table">
            <thead>
              <tr><th>Đợt</th><th>GT đợt (đ)</th><th>Giữ lại BH</th><th>Phải TT</th><th>Đã TT</th><th>Còn nợ</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {!acs.length && <tr className="stc-empty-row"><td colSpan={8}>Chưa có đợt nghiệm thu nào.</td></tr>}
              {acs.map(a => {
                const unpaid = a.netPayable - a.paid
                return (
                  <tr key={a.id}>
                    <td>{a.dot}</td>
                    <td className="num">{fmt(a.value)}</td>
                    <td className="num">{fmt(a.retain)}</td>
                    <td className="num">{fmt(a.netPayable)}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{fmt(a.paid)}</td>
                    <td className="num" style={{ color: unpaid > 0 ? '#DC2626' : 'var(--green)', fontWeight: 700 }}>{fmt(unpaid)}</td>
                    <td><span className={`stc-badge stc-badge-${a.status === 'done' ? 'done' : 'active'}`}>{a.status === 'done' ? 'Đã TT' : 'Chờ TT'}</span></td>
                    <td><button className="btn-del-icon" onClick={() => { if (confirm('Xoá đợt nghiệm thu này?')) nghiemThuStore.remove(projectId, subcon.id, a.id) }}>🗑</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd && <NghiemThuAddModal projectId={projectId} subcon={subcon} acCount={acs.length} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function NghiemThuAddModal({ projectId, subcon, acCount, onClose }: { projectId: string; subcon: NhaThau; acCount: number; onClose: () => void }) {
  const [dot, setDot] = useState(`Đợt ${acCount + 1}`)
  const [value, setValue] = useState('')
  const [retainPct, setRetainPct] = useState(String(subcon.retainPct || 5))
  const [paid, setPaid] = useState('0')
  const [bbNo, setBbNo] = useState('')
  const [bbDate, setBbDate] = useState('')
  const [invNo, setInvNo] = useState('')
  const [invDate, setInvDate] = useState('')
  const [status, setStatus] = useState<NghiemThuStatus>('pending')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const valNum = Number(value) || 0
  const retNum = Math.round(valNum * (Number(retainPct) || 0) / 100)
  const netPayable = valNum - retNum

  async function handleSave() {
    if (!valNum) { setErr('Vui lòng nhập giá trị nghiệm thu'); return }
    setSaving(true); setErr('')
    try {
      await nghiemThuStore.add(projectId, subcon.id, {
        dot, value: valNum, retainPct: Number(retainPct) || 0, retain: retNum, netPayable,
        paid: Number(paid) || 0, bbNo: bbNo.trim() || undefined, bbDate: bbDate || undefined,
        invNo: invNo.trim() || undefined, invDate: invDate || undefined, status, note: note.trim() || undefined,
      })
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">+ Thêm đợt nghiệm thu</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field"><label>Tên đợt</label><input value={dot} onChange={e => setDot(e.target.value)} /></div>
          <div className="stc-field"><label>Giá trị nghiệm thu (đ) *</label><NumberInput value={value} onChange={setValue} /></div>
          <div className="stc-field"><label>Số biên bản NT</label><input value={bbNo} onChange={e => setBbNo(e.target.value)} /></div>
          <div className="stc-field"><label>Ngày ký biên bản</label><input type="date" value={bbDate} onChange={e => setBbDate(e.target.value)} /></div>
          <div className="stc-field"><label>Số hoá đơn</label><input value={invNo} onChange={e => setInvNo(e.target.value)} /></div>
          <div className="stc-field"><label>Ngày hoá đơn</label><input type="date" value={invDate} onChange={e => setInvDate(e.target.value)} /></div>
          <div className="stc-field"><label>% Giữ lại bảo hành</label><input type="number" min={0} max={20} value={retainPct} onChange={e => setRetainPct(e.target.value)} /></div>
          <div className="stc-field"><label>Đã thanh toán (đ)</label><NumberInput value={paid} onChange={setPaid} /></div>
          <div className="stc-field stc-field--full">
            <label>Trạng thái</label>
            <select value={status} onChange={e => setStatus(e.target.value as NghiemThuStatus)}>
              <option value="pending">Chờ thanh toán</option>
              <option value="done">Đã thanh toán</option>
            </select>
          </div>
          {valNum > 0 && (
            <div className="stc-hint">
              GT nghiệm thu: <strong>{fmt(valNum)}</strong> đ — Giữ lại {retainPct}%: <strong style={{ color: '#DC2626' }}>{fmt(retNum)}</strong> đ — Thực nhận: <strong style={{ color: 'var(--green)' }}>{fmt(netPayable)}</strong> đ
            </div>
          )}
          <div className="stc-field stc-field--full"><label>Ghi chú / Phạm vi công việc đợt này</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu đợt NT'}</button>
        </div>
      </div>
    </div>
  )
}
