'use client'
import { useState } from 'react'
import {
  Customer, MeterId, ChargeType, PricePoint, meterLabel, CHARGE_TYPE_LABELS,
} from '@/lib/dien-nuoc-types'
import { saveCustomer, deleteCustomer } from '@/lib/dien-nuoc-store'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

const EMPTY: Omit<Customer, 'id' | 'createdAt'> = {
  name: '', meterId: 1, chargeType: 'flat_vat_incl', flatUnitPrice: 0, areaM2: 0, pricePerM2: 0,
  flatPriceHistory: [{ fromMonth: '', price: 0 }], areaPriceHistory: [{ fromMonth: '', price: 0 }],
  floor: '', kioskCode: '', kioskOwner: '', tenantName: '', active: true, note: '',
}

// Chuyển giá tĩnh cũ (nếu có) thành 1 mốc "áp dụng từ đầu" khi mở khách hàng cũ chưa có bảng giá.
function seedHistory(history: PricePoint[] | undefined, legacyPrice: number): PricePoint[] {
  if (history && history.length > 0) return history
  return [{ fromMonth: '', price: legacyPrice || 0 }]
}

// Bảng giá theo thời điểm: mỗi dòng "áp dụng từ tháng | đơn giá".
function PriceHistoryEditor({ label, unit, value, onChange }: {
  label: string; unit: string; value: PricePoint[]; onChange: (v: PricePoint[]) => void
}) {
  const setRow = (i: number, patch: Partial<PricePoint>) => onChange(value.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const addRow = () => onChange([...value, { fromMonth: '', price: 0 }])
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: 10 }}>
      <label className="dn-label">{label}</label>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 6 }}>
        Mỗi mốc giá áp dụng từ tháng ghi bên trái đến khi có mốc mới. Để trống tháng = áp dụng từ đầu.
      </div>
      {value.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 70 }}>Áp dụng từ</span>
          <input type="month" className="dn-input" style={{ width: 150 }} value={p.fromMonth} onChange={e => setRow(i, { fromMonth: e.target.value })} />
          <NumberInput style={{ width: 140 }} placeholder="Đơn giá" value={p.price} onValueChange={v => setRow(i, { price: v })} />
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{unit}</span>
          {value.length > 1 && <button className="btn-danger" onClick={() => removeRow(i)}>Xoá</button>}
        </div>
      ))}
      <button className="btn-ghost" onClick={addRow}>+ Thêm mốc giá</button>
    </div>
  )
}

function CustomerForm({ initial, meterNames, onSave, onCancel }: {
  initial?: Customer; meterNames: Record<number, string>; onSave: (c: Customer) => void; onCancel: () => void
}) {
  const [form, setForm] = useState<Omit<Customer, 'id' | 'createdAt'>>(
    initial
      ? { ...initial, flatPriceHistory: seedHistory(initial.flatPriceHistory, initial.flatUnitPrice), areaPriceHistory: seedHistory(initial.areaPriceHistory, initial.pricePerM2) }
      : { ...EMPTY }
  )
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString().slice(0, 10)
    // Đồng bộ giá tĩnh cũ = mốc giá mới nhất (để tương thích chỗ nào còn đọc flatUnitPrice/pricePerM2).
    const latest = (h: PricePoint[]) => [...h].filter(p => p.price > 0).sort((a, b) => (b.fromMonth || '').localeCompare(a.fromMonth || ''))[0]?.price ?? 0
    const flatH = (form.flatPriceHistory ?? []).filter(p => p.price > 0)
    const areaH = (form.areaPriceHistory ?? []).filter(p => p.price > 0)
    onSave({
      ...(initial ?? { id: `c${Date.now()}`, createdAt: now }), ...form,
      flatPriceHistory: flatH, areaPriceHistory: areaH,
      flatUnitPrice: flatH.length ? latest(flatH) : form.flatUnitPrice,
      pricePerM2:    areaH.length ? latest(areaH) : form.pricePerM2,
    } as Customer)
  }

  return (
    <div style={{ background: 'var(--surf2)', border: '1px solid var(--border3)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label className="dn-label">Tên khách hàng *</label>
          <input className="dn-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="VD: Vin, SAG, Ki-ốt A1…" />
        </div>
        <div>
          <label className="dn-label">Đồng hồ</label>
          <select className="dn-input" value={form.meterId} onChange={e => set('meterId', Number(e.target.value) as MeterId)}>
            {([1, 2, 3] as MeterId[]).map(id => <option key={id} value={id}>{meterLabel(meterNames, id)}</option>)}
          </select>
        </div>
        <div>
          <label className="dn-label">Cách tính tiền</label>
          <select className="dn-input" value={form.chargeType} onChange={e => set('chargeType', e.target.value as ChargeType)}>
            {(Object.keys(CHARGE_TYPE_LABELS) as ChargeType[]).map(k => <option key={k} value={k}>{CHARGE_TYPE_LABELS[k]}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label className="dn-label">Tầng</label>
          <input className="dn-input" value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="VD: Tầng 1" />
        </div>
        <div>
          <label className="dn-label">Mã ki-ốt</label>
          <input className="dn-input" value={form.kioskCode} onChange={e => set('kioskCode', e.target.value)} placeholder="VD: A1-02" />
        </div>
        <div>
          <label className="dn-label">Chủ ki-ốt</label>
          <input className="dn-input" value={form.kioskOwner} onChange={e => set('kioskOwner', e.target.value)} />
        </div>
        <div>
          <label className="dn-label">Khách hàng thuê</label>
          <input className="dn-input" value={form.tenantName} onChange={e => set('tenantName', e.target.value)} />
        </div>
      </div>

      {form.chargeType === 'flat_vat_incl' && (
        <PriceHistoryEditor
          label="Bảng giá cố định theo thời điểm (đã gồm VAT)"
          unit="đ/đơn vị"
          value={form.flatPriceHistory ?? [{ fromMonth: '', price: 0 }]}
          onChange={v => set('flatPriceHistory', v)}
        />
      )}
      {form.chargeType === 'fixed_area' && (
        <>
          <div style={{ marginBottom: 10, maxWidth: 220 }}>
            <label className="dn-label">Diện tích (m²)</label>
            <input type="number" className="dn-input" value={form.areaM2 || ''} onChange={e => set('areaM2', Number(e.target.value))} />
          </div>
          <PriceHistoryEditor
            label="Bảng giá / m² / tháng theo thời điểm"
            unit="đ/m²"
            value={form.areaPriceHistory ?? [{ fromMonth: '', price: 0 }]}
            onChange={v => set('areaPriceHistory', v)}
          />
        </>
      )}
      {form.chargeType === 'timeband_excl_vat' && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 10 }}>
          Tính theo sản lượng thực tế × đơn giá từng khung giờ của đồng hồ (nhập ở tab "Nhập chỉ số điện nước"), cộng thêm VAT.
        </div>
      )}
      {form.chargeType === 'remainder' && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 10 }}>
          Khách này sẽ tự động gánh phần còn lại của đồng hồ sau khi trừ hết các khách khác — không cần nhập sản lượng.
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <label className="dn-label">Ghi chú</label>
        <input className="dn-input" value={form.note} onChange={e => set('note', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={submit}>Lưu</button>
        <button className="btn-ghost" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  )
}

export function TabKhachHang({ customers, meterNames }: { customers: Customer[]; meterNames: Record<number, string> }) {
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)

  const save = async (c: Customer) => { await saveCustomer(c); setEditing(null) }
  const remove = async (id: string) => { if (confirm('Xoá khách hàng này?')) await deleteCustomer(id) }

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Danh sách khách hàng</span>
        <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm khách hàng</button>
      </div>
      <div className="sc-body">
        {editing === 'new' && <CustomerForm meterNames={meterNames} onSave={save} onCancel={() => setEditing(null)} />}
        {editing && editing !== 'new' && <CustomerForm initial={editing} meterNames={meterNames} onSave={save} onCancel={() => setEditing(null)} />}

        <div style={{ overflowX: 'auto' }}>
          <table className="dn-table">
            <thead><tr>
              <th>Tên khách hàng</th><th>Tầng</th><th>Mã ki-ốt</th><th>Chủ ki-ốt</th><th>Khách hàng thuê</th>
              <th>Đồng hồ</th><th>Cách tính tiền</th><th>Thông số</th><th>Trạng thái</th><th style={{ width: 100 }}></th>
            </tr></thead>
            <tbody>
              {customers.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Chưa có khách hàng nào.</td></tr>
              )}
              {customers.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}{c.note && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{c.note}</div>}</td>
                  <td>{c.floor || '—'}</td>
                  <td>{c.kioskCode || '—'}</td>
                  <td>{c.kioskOwner || '—'}</td>
                  <td>{c.tenantName || '—'}</td>
                  <td>{meterLabel(meterNames, c.meterId)}</td>
                  <td>{CHARGE_TYPE_LABELS[c.chargeType]}</td>
                  <td style={{ color: 'var(--muted)' }}>
                    {c.chargeType === 'flat_vat_incl' && <>{fmt(c.flatUnitPrice)} đ (gồm VAT){(c.flatPriceHistory?.filter(p => p.price > 0).length ?? 0) > 1 && <span style={{ color: 'var(--gold2)' }}> · {c.flatPriceHistory!.filter(p => p.price > 0).length} mốc giá</span>}</>}
                    {c.chargeType === 'fixed_area' && <>{c.areaM2} m² × {fmt(c.pricePerM2)} đ{(c.areaPriceHistory?.filter(p => p.price > 0).length ?? 0) > 1 && <span style={{ color: 'var(--gold2)' }}> · {c.areaPriceHistory!.filter(p => p.price > 0).length} mốc giá</span>}</>}
                    {(c.chargeType === 'timeband_excl_vat' || c.chargeType === 'remainder') && '—'}
                  </td>
                  <td><span className={`badge ${c.active ? 'badge-green' : 'badge-red'}`}>{c.active ? 'Hoạt động' : 'Ngừng'}</span></td>
                  <td>
                    <button className="btn-ghost" style={{ marginRight: 6 }} onClick={() => setEditing(c)}>Sửa</button>
                    <button className="btn-danger" onClick={() => remove(c.id)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
