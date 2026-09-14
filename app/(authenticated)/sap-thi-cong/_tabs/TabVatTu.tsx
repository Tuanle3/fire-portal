'use client'
// LƯU Ý: cần thêm field `vatPercent?: number` vào type VatTuItem trong ../_lib/types.ts
// (đơn giá vẫn là giá CHƯA VAT; vatPercent là % thuế suất, dùng để tính ra thuế VAT + tổng tiền).
import { useState, useEffect } from 'react'
import { VatTuItem, DoiTac, HangMuc, fmt } from '../_lib/types'
import { NumberInput } from '../_lib/NumberInput'
import { PartnerPicker } from '../_lib/PartnerPicker'
import { vatTuStore, doiTacStore, hangMucStore, saveVatTuWithSync, removeVatTuWithSync } from '@/lib/firebase-sap-thi-cong'

// Sắp xếp cây cha-con để hiện thụt lề trong dropdown chọn hạng mục — giống hệt cách làm ở
// TabTienDo.tsx / TabNhaThau.tsx, tách riêng vì mỗi tab tự quản lý danh sách hangMuc của mình.
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

export function TabVatTu({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<VatTuItem[]>([])
  const [doiTacs, setDoiTacs] = useState<DoiTac[]>([])
  const [hangMucs, setHangMucs] = useState<HangMuc[]>([])
  const [editing, setEditing] = useState<VatTuItem | 'new' | null>(null)

  useEffect(() => {
    const unsub = vatTuStore.subscribe(projectId, setItems)
    return () => unsub()
  }, [projectId])

  useEffect(() => {
    const unsub = doiTacStore.subscribe(projectId, setDoiTacs)
    return () => unsub()
  }, [projectId])

  useEffect(() => {
    const unsub = hangMucStore.subscribe(projectId, setHangMucs)
    return () => unsub()
  }, [projectId])

  const hangMucName = (id?: string) => (id && hangMucs.find(h => h.id === id)?.name) || '—'

  const totalChuaVAT = items.reduce((s, i) => s + i.qtyUsed * i.unitPrice, 0)
  const totalVAT = items.reduce((s, i) => s + (i.qtyUsed * i.unitPrice) * ((i.vatPercent ?? 0) / 100), 0)
  const totalCost = totalChuaVAT + totalVAT
  const totalPaid = items.reduce((s, i) => s + (i.paidAmount || 0), 0)
  const overCount = items.filter(i => i.qtyUsed > i.qtyPlanned).length

  return (
    <>
      <div className="stc-kpi-row">
        <div className="stc-kpi"><div className="stc-kpi-label">Số mặt hàng</div><div className="stc-kpi-val">{items.length}</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Chưa VAT</div><div className="stc-kpi-val">{fmt(totalChuaVAT)} đ</div></div>
        <div className="stc-kpi"><div className="stc-kpi-label">Thuế VAT</div><div className="stc-kpi-val">{fmt(totalVAT)} đ</div></div>
        <div className="stc-kpi gold"><div className="stc-kpi-label">Tổng tiền vật tư (gồm VAT)</div><div className="stc-kpi-val">{fmt(totalCost)} đ</div></div>
        <div className="stc-kpi green"><div className="stc-kpi-label">Đã thanh toán NCC</div><div className="stc-kpi-val">{fmt(totalPaid)} đ</div></div>
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
              <tr><th>Tên vật tư</th><th>ĐVT</th><th>KH</th><th>Đã dùng</th><th>Đơn giá (đ)</th><th>Chưa VAT (đ)</th><th>VAT</th><th>Tổng tiền (đ)</th><th>Đã TT (đ)</th><th>Còn nợ (đ)</th><th>Hạng mục</th><th>NCC</th><th>Số HĐ/PO</th><th></th></tr>
            </thead>
            <tbody>
              {!items.length && <tr className="stc-empty-row"><td colSpan={14}>Chưa có vật tư nào.</td></tr>}
              {items.map(i => {
                const over = i.qtyUsed > i.qtyPlanned
                const vatPercent = i.vatPercent ?? 0
                const chuaVAT = i.qtyUsed * i.unitPrice
                const vatAmount = chuaVAT * vatPercent / 100
                const tongTien = chuaVAT + vatAmount
                const conNo = tongTien - (i.paidAmount || 0)
                return (
                  <tr key={i.id} onClick={() => setEditing(i)} style={{ cursor: 'pointer' }}>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td className="num">{fmt(i.qtyPlanned)}</td>
                    <td className="num" style={{ color: over ? '#DC2626' : undefined, fontWeight: over ? 700 : undefined }}>{fmt(i.qtyUsed)}</td>
                    <td className="num">{fmt(i.unitPrice)}</td>
                    <td className="num">{fmt(chuaVAT)}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{vatPercent > 0 ? `${vatPercent}%` : '—'}</td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmt(tongTien)}</td>
                    <td className="num" style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(i.paidAmount || 0)}</td>
                    <td className="num" style={{ color: conNo > 0 ? '#DC2626' : 'var(--green)', fontWeight: 700 }}>{fmt(conNo)}</td>
                    <td style={{ fontSize: 11 }}>{i.hangMucId ? <span className="stc-badge stc-badge-upcoming">{hangMucName(i.hangMucId)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{i.supplier || '—'}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{i.soHopDong || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn-del-icon" onClick={() => { if (confirm('Xoá vật tư này? (Dòng tiền thanh toán liên kết sẽ bị xoá theo)')) removeVatTuWithSync(projectId, i) }}>🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <VatTuModal
          projectId={projectId}
          doiTacs={doiTacs}
          hangMucs={hangMucs}
          value={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function VatTuModal({
  projectId, doiTacs, hangMucs, value, onClose,
}: {
  projectId: string
  doiTacs: DoiTac[]
  hangMucs: HangMuc[]
  value: VatTuItem | null
  onClose: () => void
}) {
  const [name, setName] = useState(value?.name ?? '')
  const [unit, setUnit] = useState(value?.unit ?? '')
  const [qtyPlanned, setQtyPlanned] = useState(String(value?.qtyPlanned ?? ''))
  const [qtyUsed, setQtyUsed] = useState(String(value?.qtyUsed ?? 0))
  const [unitPrice, setUnitPrice] = useState(String(value?.unitPrice ?? ''))
  const [vatPercent, setVatPercent] = useState(String(value?.vatPercent ?? 10))
  const [hangMucId, setHangMucId] = useState(value?.hangMucId)
  const [doiTacId, setDoiTacId] = useState(value?.doiTacId)
  const [supplier, setSupplier] = useState(value?.supplier ?? '')
  const [soHopDong, setSoHopDong] = useState(value?.soHopDong ?? '')
  const [paidAmount, setPaidAmount] = useState(String(value?.paidAmount ?? 0))
  const [date, setDate] = useState(value?.date ?? '')
  const [note, setNote] = useState(value?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Quy ra tiền cả 2 chiều: "dự kiến" theo khối lượng KẾ HOẠCH (để biết trước khi mua sẽ tốn bao
  // nhiêu) và "thực tế" theo khối lượng ĐÃ DÙNG (dùng để đối chiếu công nợ NCC) — trước đây chỉ
  // tính theo đã dùng nên nhập khối lượng kế hoạch xong không thấy quy ra tiền ước tính.
  // Đơn giá nhập vào được coi là đơn giá CHƯA VAT — VAT cộng thêm theo % khai báo để ra tổng tiền
  // thực phải trả NCC, tránh nhầm giữa giá trị hàng và tổng tiền trên hoá đơn.
  const vatPct = Number(vatPercent) || 0
  const duKienChuaVAT = (Number(qtyPlanned) || 0) * (Number(unitPrice) || 0)
  const duKienVAT = duKienChuaVAT * vatPct / 100
  const duKien = duKienChuaVAT + duKienVAT
  const thanhTienChuaVAT = (Number(qtyUsed) || 0) * (Number(unitPrice) || 0)
  const thanhTienVAT = thanhTienChuaVAT * vatPct / 100
  const thanhTien = thanhTienChuaVAT + thanhTienVAT

  async function handleSave() {
    if (!name.trim() || !unit.trim()) { setErr('Vui lòng nhập tên vật tư và đơn vị tính'); return }
    setSaving(true); setErr('')
    try {
      const data = {
        name: name.trim(), unit: unit.trim(),
        qtyPlanned: Number(qtyPlanned) || 0, qtyUsed: Number(qtyUsed) || 0,
        unitPrice: Number(unitPrice) || 0,
        vatPercent: vatPct,
        hangMucId,
        doiTacId, supplier: supplier.trim() || undefined,
        soHopDong: soHopDong.trim() || undefined,
        paidAmount: Number(paidAmount) || 0,
        date: date || undefined, note: note.trim() || undefined,
      }
      await saveVatTuWithSync(projectId, data, value ?? undefined)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Lưu thất bại') } finally { setSaving(false) }
  }

  return (
    <div className="stc-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="stc-modal">
        <div className="stc-modal-head">
          <div className="stc-modal-title">{value ? 'Sửa vật tư' : '+ Thêm vật tư'}</div>
          <button className="stc-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="stc-modal-body">
          {err && <div className="stc-err">{err}</div>}
          <div className="stc-field stc-field--full"><label>Tên vật tư *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Xi măng PCB40" /></div>
          <div className="stc-field"><label>Đơn vị tính *</label><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="tấn / m³ / bao..." /></div>
          <div className="stc-field"><label>Đơn giá chưa VAT (đ)</label><NumberInput value={unitPrice} onChange={setUnitPrice} /></div>
          <div className="stc-field">
            <label>Thuế suất VAT (%)</label>
            <select value={vatPercent} onChange={e => setVatPercent(e.target.value)}>
              <option value="0">0% (không VAT)</option>
              <option value="5">5%</option>
              <option value="8">8%</option>
              <option value="10">10%</option>
            </select>
          </div>
          <div className="stc-field"><label>Khối lượng kế hoạch</label><NumberInput decimal value={qtyPlanned} onChange={setQtyPlanned} placeholder="VD: 3,204" /></div>
          <div className="stc-field"><label>Khối lượng đã dùng</label><NumberInput decimal value={qtyUsed} onChange={setQtyUsed} /></div>
          <div className="stc-field"><label>Ngày nhập</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="stc-field"><label>Số hợp đồng / PO</label><input value={soHopDong} onChange={e => setSoHopDong(e.target.value)} placeholder="VD: PO-2026/012" /></div>

          <div className="stc-field stc-field--full">
            <label>Hạng mục thi công dùng vật tư này</label>
            <select value={hangMucId ?? ''} onChange={e => setHangMucId(e.target.value || undefined)}>
              <option value="">— Không gắn hạng mục —</option>
              {sortHierarchical(hangMucs).map(h => (
                <option key={h.id} value={h.id}>{h.parentId ? `\u00A0\u00A0↳ ${h.name}` : h.name}</option>
              ))}
            </select>
          </div>

          <div className="stc-field stc-field--full">
            <label>Nhà cung cấp</label>
            <PartnerPicker
              projectId={projectId} doiTacs={doiTacs} type="ncc" doiTacId={doiTacId}
              onPick={(id, nm) => { setDoiTacId(id); setSupplier(nm) }}
            />
            <input
              style={{ marginTop: 6 }}
              value={supplier}
              onChange={e => { setSupplier(e.target.value); setDoiTacId(undefined) }}
              placeholder="Hoặc gõ tên NCC trực tiếp..."
            />
          </div>

          <div className="stc-field"><label>Đã thanh toán NCC (đ)</label><NumberInput value={paidAmount} onChange={setPaidAmount} /></div>
          <div className="stc-field stc-field--full"><label>Ghi chú</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>

          {(duKien > 0 || thanhTien > 0) && (
            <div className="stc-hint stc-field--full">
              {duKien > 0 && (
                <div>
                  Dự kiến theo kế hoạch: chưa VAT <strong>{fmt(duKienChuaVAT)}</strong> đ + VAT ({vatPct}%) <strong>{fmt(duKienVAT)}</strong> đ = tổng <strong>{fmt(duKien)}</strong> đ
                </div>
              )}
              {thanhTien > 0 && (
                <div style={{ marginTop: duKien > 0 ? 4 : 0 }}>
                  Thực tế: chưa VAT <strong>{fmt(thanhTienChuaVAT)}</strong> đ + VAT ({vatPct}%) <strong>{fmt(thanhTienVAT)}</strong> đ = tổng tiền <strong>{fmt(thanhTien)}</strong> đ — Đã TT: <strong style={{ color: 'var(--green)' }}>{fmt(Number(paidAmount) || 0)}</strong> đ — Còn nợ NCC: <strong style={{ color: '#DC2626' }}>{fmt(thanhTien - (Number(paidAmount) || 0))}</strong> đ
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 11 }}>Số tiền đã TT sẽ tự động đồng bộ 1 dòng &quot;Chi&quot; tương ứng trong tab Dòng tiền — không cần nhập lại.</div>
            </div>
          )}
        </div>
        <div className="stc-modal-foot">
          {value && <button className="btn-ghost" style={{ color: '#DC2626', marginRight: 'auto' }} onClick={() => { if (confirm('Xoá vật tư này?')) { removeVatTuWithSync(projectId, value); onClose() } }}>Xoá</button>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
