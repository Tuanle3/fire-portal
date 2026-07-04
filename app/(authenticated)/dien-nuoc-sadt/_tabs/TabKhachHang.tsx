'use client'
import { useState } from 'react'
import {
  Customer, MeterId, ChargeType, METER_LABELS, CHARGE_TYPE_LABELS,
} from '@/lib/dien-nuoc-types'
import { saveCustomer, deleteCustomer } from '@/lib/dien-nuoc-store'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

const EMPTY: Omit<Customer, 'id' | 'createdAt'> = {
  name: '', meterId: 1, chargeType: 'flat_vat_incl', flatUnitPrice: 0, areaM2: 0, pricePerM2: 0, active: true, note: '',
}

function CustomerForm({ initial, onSave, onCancel }: {
  initial?: Customer; onSave: (c: Customer) => void; onCancel: () => void
}) {
  const [form, setForm] = useState<Omit<Customer, 'id' | 'createdAt'>>(initial ? { ...initial } : { ...EMPTY })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString().slice(0, 10)
    onSave({ ...(initial ?? { id: `c${Date.now()}`, createdAt: now }), ...form } as Customer)
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
            {([1, 2, 3] as MeterId[]).map(id => <option key={id} value={id}>{METER_LABELS[id]}</option>)}
          </select>
        </div>
        <div>
          <label className="dn-label">Cách tính tiền</label>
          <select className="dn-input" value={form.chargeType} onChange={e => set('chargeType', e.target.value as ChargeType)}>
            {(Object.keys(CHARGE_TYPE_LABELS) as ChargeType[]).map(k => <option key={k} value={k}>{CHARGE_TYPE_LABELS[k]}</option>)}
          </select>
        </div>
      </div>

      {form.chargeType === 'flat_vat_incl' && (
        <div style={{ marginBottom: 10, maxWidth: 220 }}>
          <label className="dn-label">Đơn giá cố định (đã gồm VAT)</label>
          <input type="number" className="dn-input" value={form.flatUnitPrice || ''} onChange={e => set('flatUnitPrice', Number(e.target.value))} />
        </div>
      )}
      {form.chargeType === 'fixed_area' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10, maxWidth: 460 }}>
          <div>
            <label className="dn-label">Diện tích (m²)</label>
            <input type="number" className="dn-input" value={form.areaM2 || ''} onChange={e => set('areaM2', Number(e.target.value))} />
          </div>
          <div>
            <label className="dn-label">Đơn giá / m² / tháng</label>
            <input type="number" className="dn-input" value={form.pricePerM2 || ''} onChange={e => set('pricePerM2', Number(e.target.value))} />
          </div>
        </div>
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

export function TabKhachHang({ customers }: { customers: Customer[] }) {
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
        {editing === 'new' && <CustomerForm onSave={save} onCancel={() => setEditing(null)} />}
        {editing && editing !== 'new' && <CustomerForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />}

        <table className="dn-table">
          <thead><tr>
            <th>Tên khách hàng</th><th>Đồng hồ</th><th>Cách tính tiền</th><th>Thông số</th><th>Trạng thái</th><th style={{ width: 100 }}></th>
          </tr></thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Chưa có khách hàng nào.</td></tr>
            )}
            {customers.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}{c.note && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{c.note}</div>}</td>
                <td>{METER_LABELS[c.meterId]}</td>
                <td>{CHARGE_TYPE_LABELS[c.chargeType]}</td>
                <td style={{ color: 'var(--muted)' }}>
                  {c.chargeType === 'flat_vat_incl' && `${fmt(c.flatUnitPrice)} đ (gồm VAT)`}
                  {c.chargeType === 'fixed_area' && `${c.areaM2} m² × ${fmt(c.pricePerM2)} đ`}
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
  )
}
