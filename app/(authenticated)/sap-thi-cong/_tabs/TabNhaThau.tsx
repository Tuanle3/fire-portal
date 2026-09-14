'use client'
import { useState, useEffect } from 'react'
import {
  NhaThau, NhaThauStatus, NghiemThu, NghiemThuStatus, DoiTac, HangMuc, KhoanVay, fmt,
} from '../_lib/types'
import { NumberInput } from '../_lib/NumberInput'
import { PartnerPicker } from '../_lib/PartnerPicker'
import {
  nhaThauStore, nghiemThuStore, doiTacStore, hangMucStore, khoanVayStore,
  saveNghiemThuWithSync, removeNghiemThuWithSync,
} from '@/lib/firebase-sap-thi-cong'

const NT_STATUS_LABEL: Record<NhaThauStatus, string> = { active: 'Đang thi công', done: 'Hoàn thành', paused: 'Tạm dừng' }

export function TabNhaThau({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<NhaThau[]>([])
  const [doiTacs, setDoiTacs] = useState<DoiTac[]>([])
  const [hangMucs, setHangMucs] = useState<HangMuc[]>([])
  const [khoanVays, setKhoanVays] = useState<KhoanVay[]>([])
  const [editing, setEditing] = useState<NhaThau | 'new' | null>(null)
  const [panelId, setPanelId] = useState<string | null>(null)

  useEffect(() => { const unsub = nhaThauStore.subscribe(projectId, setItems); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = doiTacStore.subscribe(projectId, setDoiTacs); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = hangMucStore.subscribe(projectId, setHangMucs); return () => unsub() }, [projectId])
  useEffect(() => { const unsub = khoanVayStore.subscribe(projectId, setKhoanVays); return () => unsub() }, [projectId])

  const totalContract = items.reduce((s, i) => s + i.contractValue, 0)
  const hangMucName = (id: string) => hangMucs.find(h => h.id === id)?.name ?? '—'

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
              <tr><th>Nhà thầu</th><th>Phạm vi công việc</th><th>Hạng mục phụ trách</th><th>Giá trị HĐ (đ)</th><th>Giữ lại BH</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={7}>Chưa có nhà thầu phụ nào.</td></tr>}
              {items.map(i => (
                <tr key={i.id} onClick={() => setPanelId(i.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i.scope || '—'}</td>
                  <td style={{ fontSize: 11, maxWidth: 200 }}>
                    {i.hangMucIds?.length
                      ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {i.hangMucIds.map(hid => (
                            <span key={hid} className="stc-badge stc-badge-upcoming">{hangMucName(hid)}</span>
                          ))}
                        </div>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
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

      {editing && (
        <NhaThauModal
          projectId={projectId} doiTacs={doiTacs} hangMucs={hangMucs}
          value={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {panelId && (
        <NghiemThuPanel
          projectId={projectId}
          subcon={items.find(i => i.id === panelId)!}
          khoanVays={khoanVays}
          onClose={() => setPanelId(null)}
        />
      )}
    </>
  )
}

function NhaThauModal({
  projectId, doiTacs, hangMucs, value, onClose,
}: {
  projectId: string
  doiTacs: DoiTac[]
  hangMucs: HangMuc[]
  value: NhaThau | null
  onClose: () => void
}) {
  const [doiTacId, setDoiTacId] = useState(value?.doiTacId)
  const [name, setName] = useState(value?.name ?? '')
  const [scope, setScope] = useState(value?.scope ?? '')
  const [hangMucIds, setHangMucIds] = useState<string[]>(value?.hangMucIds ?? [])
  const [contractValue, setContractValue] = useState(String(value?.contractValue ?? ''))
  const [retainPct, setRetainPct] = useState(String(value?.retainPct ?? 5))
  const [status, setStatus] = useState<NhaThauStatus>(value?.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function toggleHangMuc(id: string) {
    setHangMucIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!name.trim() || !contractValue) { setErr('Vui lòng nhập tên nhà thầu và giá trị hợp đồng'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        doiTacId, name: name.trim(), scope: scope.trim() || undefined,
        hangMucIds: hangMucIds.length ? hangMucIds : undefined,
        contractValue: Number(contractValue), retainPct: Number(retainPct) || 0, status,
      }
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

          <div className="stc-field stc-field--full">
            <label>Chọn từ danh mục Đối tác</label>
            <PartnerPicker
              projectId={projectId} doiTacs={doiTacs} type="nha-thau" doiTacId={doiTacId}
              onPick={(id, nm) => { setDoiTacId(id); setName(nm) }}
            />
          </div>
          <div className="stc-field stc-field--full">
            <label>Tên nhà thầu *</label>
            <input value={name} onChange={e => { setName(e.target.value); setDoiTacId(undefined) }} placeholder="Hoặc gõ tên trực tiếp nếu chưa có trong danh mục" />
          </div>
          <div className="stc-field stc-field--full"><label>Phạm vi công việc</label><input value={scope} onChange={e => setScope(e.target.value)} placeholder="VD: Thi công phần thô..." /></div>

          <div className="stc-field stc-field--full">
            <label>Hạng mục phụ trách (1 hạng mục có thể do nhiều nhà thầu cùng làm)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px' }}>
              {!hangMucs.length && <span style={{ fontSize: 11.5, color: 'var(--muted)', padding: '4px 2px' }}>Chưa có hạng mục nào ở tab Tiến độ.</span>}
              {hangMucs.map(h => (
                <label key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 6px', borderRadius: 6, background: hangMucIds.includes(h.id) ? 'var(--surf2)' : 'transparent', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" style={{ flexShrink: 0, width: 14, height: 14 }} checked={hangMucIds.includes(h.id)} onChange={() => toggleHangMuc(h.id)} />
                  <span>{h.parentId ? `↳ ${h.name}` : h.name}</span>
                </label>
              ))}
            </div>
          </div>

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

function NghiemThuPanel({
  projectId, subcon, khoanVays, onClose,
}: {
  projectId: string
  subcon: NhaThau
  khoanVays: KhoanVay[]
  onClose: () => void
}) {
  const [acs, setAcs] = useState<NghiemThu[]>([])
  const [modal, setModal] = useState<NghiemThu | 'new' | null>(null)

  useEffect(() => {
    const unsub = nghiemThuStore.subscribe(projectId, subcon.id, setAcs)
    return () => unsub()
  }, [projectId, subcon.id])

  const totalVal = acs.reduce((s, a) => s + a.value, 0)
  const totalRetain = acs.reduce((s, a) => s + a.retain, 0)
  const totalPaid = acs.reduce((s, a) => s + a.paid, 0)
  const totalUnpaid = acs.reduce((s, a) => s + (a.netPayable - a.paid), 0)
  const khoanVayLabel = (id?: string) => {
    if (!id) return '—'
    const v = khoanVays.find(k => k.id === id)
    return v ? `${v.batch}${v.bank ? ` – ${v.bank}` : ''}` : '—'
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal" style={{ width: 'min(960px,96vw)' }}>
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
            <button className="btn-primary" onClick={() => setModal('new')}>+ Thêm đợt NT</button>
          </div>
          <table className="stc-table">
            <thead>
              <tr><th>Đợt</th><th>GT đợt (đ)</th><th>Giữ lại BH</th><th>Phải TT</th><th>Đã TT</th><th>Còn nợ</th><th>GN ngân hàng</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {!acs.length && <tr className="stc-empty-row"><td colSpan={9}>Chưa có đợt nghiệm thu nào.</td></tr>}
              {acs.map(a => {
                const unpaid = a.netPayable - a.paid
                return (
                  <tr key={a.id} onClick={() => setModal(a)} style={{ cursor: 'pointer' }}>
                    <td>{a.dot}</td>
                    <td className="num">{fmt(a.value)}</td>
                    <td className="num">{fmt(a.retain)}</td>
                    <td className="num">{fmt(a.netPayable)}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{fmt(a.paid)}</td>
                    <td className="num" style={{ color: unpaid > 0 ? '#DC2626' : 'var(--green)', fontWeight: 700 }}>{fmt(unpaid)}</td>
                    <td style={{ fontSize: 11 }}>{khoanVayLabel(a.khoanVayId)}</td>
                    <td><span className={`stc-badge stc-badge-${a.status === 'done' ? 'done' : 'active'}`}>{a.status === 'done' ? 'Đã TT' : 'Chờ TT'}</span></td>
                    <td onClick={e => e.stopPropagation()}><button className="btn-del-icon" onClick={() => { if (confirm('Xoá đợt nghiệm thu này? (Dòng tiền liên kết cũng sẽ bị xoá)')) removeNghiemThuWithSync(projectId, subcon.id, a) }}>🗑</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <NghiemThuModal
          projectId={projectId} subcon={subcon} khoanVays={khoanVays}
          value={modal === 'new' ? null : modal}
          acCount={acs.length}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function NghiemThuModal({
  projectId, subcon, khoanVays, value, acCount, onClose,
}: {
  projectId: string
  subcon: NhaThau
  khoanVays: KhoanVay[]
  value: NghiemThu | null
  acCount: number
  onClose: () => void
}) {
  const [dot, setDot] = useState(value?.dot ?? `Đợt ${acCount + 1}`)
  const [val, setVal] = useState(String(value?.value ?? ''))
  const [retainPct, setRetainPct] = useState(String(value?.retainPct ?? (subcon.retainPct || 5)))
  const [paid, setPaid] = useState(String(value?.paid ?? 0))
  const [khoanVayId, setKhoanVayId] = useState(value?.khoanVayId)
  const [bbNo, setBbNo] = useState(value?.bbNo ?? '')
  const [bbDate, setBbDate] = useState(value?.bbDate ?? '')
  const [invNo, setInvNo] = useState(value?.invNo ?? '')
  const [invDate, setInvDate] = useState(value?.invDate ?? '')
  const [status, setStatus] = useState<NghiemThuStatus>(value?.status ?? 'pending')
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const valNum = Number(val) || 0
  const retNum = Math.round(valNum * (Number(retainPct) || 0) / 100)
  const netPayable = valNum - retNum

  async function handleSave() {
    if (!valNum) { setErr('Vui lòng nhập giá trị nghiệm thu'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        dot, value: valNum, retainPct: Number(retainPct) || 0, retain: retNum, netPayable,
        paid: Number(paid) || 0, khoanVayId,
        bbNo: bbNo.trim() || undefined, bbDate: bbDate || undefined,
        invNo: invNo.trim() || undefined, invDate: invDate || undefined,
        status, note: note.trim() || undefined,
      }
      await saveNghiemThuWithSync(projectId, subcon.id, subcon.name, data, value ?? undefined)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa đợt nghiệm thu' : '+ Thêm đợt nghiệm thu'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field"><label>Tên đợt</label><input value={dot} onChange={e => setDot(e.target.value)} /></div>
          <div className="stc-field"><label>Giá trị nghiệm thu (đ) *</label><NumberInput value={val} onChange={setVal} /></div>
          <div className="stc-field"><label>Số biên bản NT</label><input value={bbNo} onChange={e => setBbNo(e.target.value)} /></div>
          <div className="stc-field"><label>Ngày ký biên bản</label><input type="date" value={bbDate} onChange={e => setBbDate(e.target.value)} /></div>
          <div className="stc-field"><label>Số hoá đơn</label><input value={invNo} onChange={e => setInvNo(e.target.value)} /></div>
          <div className="stc-field"><label>Ngày hoá đơn</label><input type="date" value={invDate} onChange={e => setInvDate(e.target.value)} /></div>
          <div className="stc-field"><label>% Giữ lại bảo hành</label><input type="number" min={0} max={20} value={retainPct} onChange={e => setRetainPct(e.target.value)} /></div>
          <div className="stc-field"><label>Đã thanh toán (đ)</label><NumberInput value={paid} onChange={setPaid} /></div>
          <div className="stc-field stc-field--full">
            <label>Liên kết đợt giải ngân ngân hàng (nếu có)</label>
            <select value={khoanVayId ?? ''} onChange={e => setKhoanVayId(e.target.value || undefined)}>
              <option value="">— Không liên kết —</option>
              {khoanVays.map(k => <option key={k.id} value={k.id}>{k.batch} – {k.date} ({fmt(k.amount)}đ){k.bank ? ` – ${k.bank}` : ''}</option>)}
            </select>
          </div>
          <div className="stc-field stc-field--full">
            <label>Trạng thái</label>
            <select value={status} onChange={e => setStatus(e.target.value as NghiemThuStatus)}>
              <option value="pending">Chờ thanh toán</option>
              <option value="done">Đã thanh toán</option>
            </select>
          </div>
          {valNum > 0 && (
            <div className="stc-hint stc-field--full">
              GT nghiệm thu: <strong>{fmt(valNum)}</strong> đ — Giữ lại {retainPct}%: <strong style={{ color: '#DC2626' }}>{fmt(retNum)}</strong> đ — Thực nhận: <strong style={{ color: 'var(--green)' }}>{fmt(netPayable)}</strong> đ
              <div style={{ marginTop: 4, fontSize: 11 }}>Số tiền &quot;Đã thanh toán&quot; sẽ tự động đồng bộ 1 dòng &quot;Chi&quot; tương ứng trong tab Dòng tiền — không cần nhập lại.</div>
            </div>
          )}
          <div className="stc-field stc-field--full"><label>Ghi chú / Phạm vi công việc đợt này</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá đợt nghiệm thu này?')) { removeNghiemThuWithSync(projectId, subcon.id, value); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu đợt NT'}</button>
        </div>
      </div>
    </div>
  )
}
