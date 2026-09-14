'use client'
// LƯU Ý: cần thêm field `vatPercent?: number` vào type NhaThau (mức VAT mặc định của hợp đồng)
// và type NghiemThu (mức VAT thực tế theo hoá đơn từng đợt) trong ../_lib/types.ts.
// Quy ước: contractValue và value (giá trị nghiệm thu) là giá trị CHƯA VAT; VAT cộng thêm theo %
// để ra tổng tiền — giữ lại bảo hành vẫn tính trên phần CHƯA VAT, chỉ cộng thêm VAT vào lúc thanh toán.
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


function sortHierarchical(items: HangMuc[]): HangMuc[] {
  const byParent = new Map<string, HangMuc[]>()
  for (const item of items) {
    const key = item.parentId || ''
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(item)
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const result: HangMuc[] = []
  function walk(parentKey: string) {
    for (const item of byParent.get(parentKey) ?? []) {
      result.push(item)
      walk(item.id)
    }
  }
  walk('')
  return result
}

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
  const totalContractVAT = items.reduce((s, i) => s + (i.vatAmount ?? Math.round(i.contractValue * ((i.vatPercent ?? 0) / 100))), 0)
  const totalContractGross = totalContract + totalContractVAT
  const hangMucName = (id: string) => hangMucs.find(h => h.id === id)?.name ?? '—'

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Số nhà thầu phụ</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Tổng GT HĐ (chưa VAT)</div><div className="stc-kpi-val">{fmt(totalContract)} đ</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Tổng VAT</div><div className="stc-kpi-val">{fmt(totalContractVAT)} đ</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng GT HĐ (gồm VAT)</div><div className="stc-kpi-val">{fmt(totalContractGross)} đ</div></div>
      </div>

      <div className="stc-panel">
        <div className="stc-panel-head">
          <span className="stc-panel-title">Danh sách nhà thầu phụ</span>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm nhà thầu</button>
        </div>
        <div className="stc-panel-body" style={{ padding: 0 }}>
          <table className="stc-table">
            <thead>
              <tr><th>Nhà thầu</th><th>Số HĐ</th><th>Phạm vi công việc</th><th>Hạng mục phụ trách</th><th>GT HĐ chưa VAT (đ)</th><th>VAT</th><th>Tổng GT HĐ (đ)</th><th>Giữ lại BH</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={10}>Chưa có nhà thầu phụ nào.</td></tr>}
              {items.map(i => {
                const vatPercent = i.vatPercent ?? 0
                const vatAmount = i.vatAmount ?? Math.round(i.contractValue * vatPercent / 100)
                return (
                <tr key={i.id} onClick={() => setPanelId(i.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{i.soHopDong || '—'}</td>
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
                  <td className="num" style={{ color: 'var(--muted)' }}>{vatPercent > 0 ? `${vatPercent}%` : '—'}</td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(i.contractValue + vatAmount)}</td>
                  <td className="num">{i.retainPct}%</td>
                  <td><span className={`stc-badge stc-badge-${i.status === 'done' ? 'done' : i.status === 'paused' ? 'upcoming' : 'active'}`}>{NT_STATUS_LABEL[i.status]}</span></td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setEditing(i)}>Sửa</button>
                    <button className="btn-del-icon" onClick={() => { if (confirm('Xoá nhà thầu này?')) nhaThauStore.remove(projectId, i.id) }}>🗑</button>
                  </td>
                </tr>
              )})}
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
  const [soHopDong, setSoHopDong] = useState(value?.soHopDong ?? '')
  const [contractValue, setContractValue] = useState(String(value?.contractValue ?? ''))
  const [vatPercent, setVatPercent] = useState(String(value?.vatPercent ?? 10))
  const [vatAmount, setVatAmount] = useState(String(value?.vatAmount ?? ''))
  const [vatAmountTouched, setVatAmountTouched] = useState(false)
  const [retainPct, setRetainPct] = useState(String(value?.retainPct ?? 5))
  const [status, setStatus] = useState<NhaThauStatus>(value?.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const vatPct = Number(vatPercent) || 0
  const vatAmountTinhTu = Math.round((Number(contractValue) || 0) * vatPct / 100)
  const vatAmountFinal = vatAmount !== '' ? (Number(vatAmount) || 0) : vatAmountTinhTu

  // Tự điền ô "Số tiền VAT" theo % cho đến khi người dùng gõ tay đè lên — tránh số lẻ do làm tròn
  // khác cách hoá đơn thực tế của nhà thầu xuất ra.
  useEffect(() => {
    if (!vatAmountTouched) setVatAmount(vatAmountTinhTu ? String(vatAmountTinhTu) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatAmountTinhTu, vatAmountTouched])

  function toggleHangMuc(id: string) {
    setHangMucIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!name.trim() || !contractValue) { setErr('Vui lòng nhập tên nhà thầu và giá trị hợp đồng'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        doiTacId, name: name.trim(), scope: scope.trim() || undefined,
        soHopDong: soHopDong.trim() || undefined,
        hangMucIds: hangMucIds.length ? hangMucIds : undefined,
        contractValue: Number(contractValue), vatPercent: vatPct, vatAmount: vatAmountFinal, retainPct: Number(retainPct) || 0, status,
      }
      if (value) await nhaThauStore.update(projectId, value.id, data)
      else await nhaThauStore.add(projectId, data)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => e.stopPropagation()}>
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
              {sortHierarchical(hangMucs).map(h => (
                <label key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 6px', borderRadius: 6, background: hangMucIds.includes(h.id) ? 'var(--surf2)' : 'transparent', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" style={{ flexShrink: 0, width: 14, height: 14 }} checked={hangMucIds.includes(h.id)} onChange={() => toggleHangMuc(h.id)} />
                  <span>{h.parentId ? `↳ ${h.name}` : h.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="stc-field"><label>Số hợp đồng</label><input value={soHopDong} onChange={e => setSoHopDong(e.target.value)} placeholder="VD: HĐ-2026/001" /></div>
          <div className="stc-field"><label>Giá trị hợp đồng chưa VAT (đ) *</label><NumberInput value={contractValue} onChange={setContractValue} /></div>
          <div className="stc-field">
            <label>Thuế suất VAT (%)</label>
            <select
              value={['0', '5', '8', '10'].includes(vatPercent) ? vatPercent : 'custom'}
              onChange={e => setVatPercent(e.target.value === 'custom' ? '' : e.target.value)}
            >
              <option value="0">0% (không VAT)</option>
              <option value="5">5%</option>
              <option value="8">8%</option>
              <option value="10">10%</option>
              <option value="custom">Khác (nhập tay)...</option>
            </select>
            {!['0', '5', '8', '10'].includes(vatPercent) && (
              <input
                type="number" min={0} max={100} step="0.1"
                style={{ marginTop: 6 }}
                value={vatPercent}
                onChange={e => setVatPercent(e.target.value)}
                placeholder="Nhập % VAT khác, VD: 3"
              />
            )}
          </div>
          <div className="stc-field">
            <label>Số tiền VAT (đ)</label>
            <NumberInput
              value={vatAmount}
              onChange={v => { setVatAmount(v); setVatAmountTouched(true) }}
            />
            {vatAmountTouched && (
              <button
                type="button"
                onClick={() => { setVatAmountTouched(false); setVatAmount(vatAmountTinhTu ? String(vatAmountTinhTu) : '') }}
                style={{ marginTop: 4, fontSize: 11, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                ↺ Tính lại tự động theo %
              </button>
            )}
          </div>
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
  const totalVATAmount = acs.reduce((s, a) => s + (a.vatAmount ?? Math.round(a.value * ((a.vatPercent ?? 0) / 100))), 0)
  const totalGross = totalVal + totalVATAmount
  const totalRetain = acs.reduce((s, a) => s + a.retain, 0)
  const totalPaid = acs.reduce((s, a) => s + a.paid, 0)
  const totalUnpaid = acs.reduce((s, a) => s + (a.netPayable - a.paid), 0)
  const khoanVayLabel = (id?: string) => {
    if (!id) return '—'
    const v = khoanVays.find(k => k.id === id)
    return v ? `${v.batch}${v.bank ? ` – ${v.bank}` : ''}` : '—'
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="stc-modal" style={{ width: 'min(960px,96vw)' }}>
        <div className="stc-modal-head">
          <div>
            <div className="stc-modal-title">Nghiệm thu – {subcon.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{subcon.scope} &nbsp;|&nbsp; Giá trị HĐ (chưa VAT): <strong style={{ color: 'var(--gold2)' }}>{fmt(subcon.contractValue)} đ</strong> &nbsp;|&nbsp; Giữ lại BH: {subcon.retainPct}%</div>
          </div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 0' }}>
          {/* Hàng 1: 4 KPI tổng quan */}
          <div className="stc-kpi-row" style={{ marginBottom: 6 }}>
            <div className="stc-kpi"><div className="stc-kpi-label">Số đợt NT</div><div className="stc-kpi-val">{acs.length}</div></div>
            <div className="stc-kpi"><div className="stc-kpi-label">GT nghiệm thu (chưa VAT)</div><div className="stc-kpi-val">{fmt(totalVal)} đ</div></div>
            <div className="stc-kpi"><div className="stc-kpi-label">Tổng VAT</div><div className="stc-kpi-val">{fmt(totalVATAmount)} đ</div></div>
            <div className="stc-kpi green"><div className="stc-kpi-label">Tổng GT (gồm VAT)</div><div className="stc-kpi-val">{fmt(totalGross)} đ</div></div>
            <div className="stc-kpi red"><div className="stc-kpi-label">Giữ lại BH</div><div className="stc-kpi-val">{fmt(totalRetain)} đ</div></div>
          </div>
          {/* Hàng 2: 2 KPI thanh toán — highlight nổi bật */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div className="stc-kpi green" style={{ margin: 0 }}><div className="stc-kpi-label">Đã thanh toán</div><div className="stc-kpi-val">{fmt(totalPaid)} đ</div></div>
            <div className="stc-kpi red" style={{ margin: 0 }}><div className="stc-kpi-label">Còn phải TT</div><div className="stc-kpi-val">{fmt(totalUnpaid)} đ</div></div>
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', overflowY: 'auto', maxHeight: '50vh' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="btn-primary" onClick={() => setModal('new')}>+ Thêm đợt NT</button>
          </div>
          <table className="stc-table">
            <thead>
              <tr><th>Đợt</th><th>GT chưa VAT</th><th>VAT</th><th>Tổng GT (đ)</th><th>Giữ lại BH</th><th>Phải TT</th><th>Đã TT</th><th>Còn nợ</th><th>GN ngân hàng</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {!acs.length && <tr className="stc-empty-row"><td colSpan={11}>Chưa có đợt nghiệm thu nào.</td></tr>}
              {acs.map(a => {
                const unpaid = a.netPayable - a.paid
                const vatPercent = a.vatPercent ?? 0
                const vatAmount = a.vatAmount ?? Math.round(a.value * vatPercent / 100)
                return (
                  <tr key={a.id} onClick={() => setModal(a)} style={{ cursor: 'pointer' }}>
                    <td>{a.dot}</td>
                    <td className="num">{fmt(a.value)}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{vatPercent > 0 ? `${vatPercent}%` : '—'}</td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(a.value + vatAmount)}</td>
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
  const [vatPercent, setVatPercent] = useState(String(value?.vatPercent ?? (subcon.vatPercent ?? 10)))
  const [vatAmount, setVatAmount] = useState(String(value?.vatAmount ?? ''))
  const [vatAmountTouched, setVatAmountTouched] = useState(false)
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
  const vatPct = Number(vatPercent) || 0
  const vatAmountTinhTu = Math.round(valNum * vatPct / 100)
  const vatAmountFinal = vatAmount !== '' ? (Number(vatAmount) || 0) : vatAmountTinhTu
  const retNum = Math.round(valNum * (Number(retainPct) || 0) / 100)
  const netPayable = valNum + vatAmountFinal - retNum

  // Tự điền ô "Số tiền VAT" theo % cho đến khi gõ tay đè lên — số trên hoá đơn thực tế của nhà
  // thầu xuất ra có thể lệch vài đồng so với công thức làm tròn, gõ tay để khớp đúng hoá đơn.
  useEffect(() => {
    if (!vatAmountTouched) setVatAmount(vatAmountTinhTu ? String(vatAmountTinhTu) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatAmountTinhTu, vatAmountTouched])

  async function handleSave() {
    if (!valNum) { setErr('Vui lòng nhập giá trị nghiệm thu'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        dot, value: valNum, vatPercent: vatPct, vatAmount: vatAmountFinal, retainPct: Number(retainPct) || 0, retain: retNum, netPayable,
        paid: Number(paid) || 0, khoanVayId,
        bbNo: bbNo.trim() || undefined, bbDate: bbDate || undefined,
        invNo: invNo.trim() || undefined, invDate: invDate || undefined,
        status, note: note.trim() || undefined,
      }
      await saveNghiemThuWithSync(projectId, subcon.id, subcon.name, subcon.hangMucIds, data, value ?? undefined)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa đợt nghiệm thu' : '+ Thêm đợt nghiệm thu'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field"><label>Tên đợt</label><input value={dot} onChange={e => setDot(e.target.value)} /></div>
          <div className="stc-field"><label>Giá trị nghiệm thu chưa VAT (đ) *</label><NumberInput value={val} onChange={setVal} /></div>
          <div className="stc-field">
            <label>Thuế suất VAT (%)</label>
            <select
              value={['0', '5', '8', '10'].includes(vatPercent) ? vatPercent : 'custom'}
              onChange={e => setVatPercent(e.target.value === 'custom' ? '' : e.target.value)}
            >
              <option value="0">0% (không VAT)</option>
              <option value="5">5%</option>
              <option value="8">8%</option>
              <option value="10">10%</option>
              <option value="custom">Khác (nhập tay)...</option>
            </select>
            {!['0', '5', '8', '10'].includes(vatPercent) && (
              <input
                type="number" min={0} max={100} step="0.1"
                style={{ marginTop: 6 }}
                value={vatPercent}
                onChange={e => setVatPercent(e.target.value)}
                placeholder="Nhập % VAT khác, VD: 3"
              />
            )}
          </div>
          <div className="stc-field">
            <label>Số tiền VAT (đ) — theo hoá đơn</label>
            <NumberInput
              value={vatAmount}
              onChange={v => { setVatAmount(v); setVatAmountTouched(true) }}
            />
            {vatAmountTouched && (
              <button
                type="button"
                onClick={() => { setVatAmountTouched(false); setVatAmount(vatAmountTinhTu ? String(vatAmountTinhTu) : '') }}
                style={{ marginTop: 4, fontSize: 11, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                ↺ Tính lại tự động theo %
              </button>
            )}
          </div>
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
              GT nghiệm thu chưa VAT: <strong>{fmt(valNum)}</strong> đ + VAT ({vatPct}%): <strong>{fmt(vatAmountFinal)}</strong> đ = tổng <strong>{fmt(valNum + vatAmountFinal)}</strong> đ
              <div style={{ marginTop: 4 }}>Giữ lại {retainPct}% (tính trên GT chưa VAT): <strong style={{ color: '#DC2626' }}>{fmt(retNum)}</strong> đ — Thực nhận (gồm VAT, trừ giữ lại BH): <strong style={{ color: 'var(--green)' }}>{fmt(netPayable)}</strong> đ</div>
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
