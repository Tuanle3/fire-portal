'use client'
import { useState, useEffect } from 'react'
import {
  MeterReading, Customer, CustomerUsage, MeterId,
  BAND_KEYS, BandKey, BAND_LABELS, METER_LABELS, METER_UNIT, EMPTY_BANDS,
  meterSubtotal, meterVat, meterTotal, customerCharge,
} from '@/lib/dien-nuoc-types'
import { saveMeterReading, saveUsage } from '@/lib/dien-nuoc-store'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function MeterCard({ meterId, month, reading, customers, usages }: {
  meterId: MeterId; month: string; reading: MeterReading | undefined
  customers: Customer[]; usages: CustomerUsage[]
}) {
  const [bands, setBands] = useState(reading?.bands ?? EMPTY_BANDS)
  const [vatPercent, setVatPercent] = useState(reading?.vatPercent ?? 8)
  const [note, setNote] = useState(reading?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    setBands(reading?.bands ?? EMPTY_BANDS)
    setVatPercent(reading?.vatPercent ?? 8)
    setNote(reading?.note ?? '')
    setSavedAt(null)
  }, [reading, month])

  const isWater = meterId === 3
  const visibleBands: BandKey[] = isWater ? ['toanThoiGian'] : BAND_KEYS
  const unit = METER_UNIT[meterId]

  const setBand = (k: BandKey, field: 'kwh' | 'donGia', v: number) => {
    setBands(b => ({ ...b, [k]: { ...b[k], [field]: v } }))
  }

  const save = async () => {
    setSaving(true)
    const now = new Date().toISOString().slice(0, 10)
    const id = `${meterId}_${month}`
    await saveMeterReading({
      id, meterId, month, bands, vatPercent, note,
      createdAt: reading?.createdAt || now, updatedAt: now,
    })
    setSaving(false)
    setSavedAt(now)
  }

  const meterCustomers = customers.filter(c => c.meterId === meterId && c.active)
  const draftReading: MeterReading = { id: '', meterId, month, bands, vatPercent, note, createdAt: '', updatedAt: '' }

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">{METER_LABELS[meterId]}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Đơn vị: {unit}</span>
      </div>
      <div className="sc-body">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleBands.length}, 1fr)`, gap: 10, marginBottom: 12 }}>
          {visibleBands.map(k => (
            <div key={k}>
              <label className="dn-label">{isWater ? 'Sử dụng trong tháng' : BAND_LABELS[k]}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" className="dn-input" placeholder={unit} value={bands[k].kwh || ''} onChange={e => setBand(k, 'kwh', Number(e.target.value))} />
                <input type="number" className="dn-input" placeholder="Đơn giá" value={bands[k].donGia || ''} onChange={e => setBand(k, 'donGia', Number(e.target.value))} />
              </div>
            </div>
          ))}
          <div>
            <label className="dn-label">% VAT</label>
            <input type="number" className="dn-input" value={vatPercent || ''} onChange={e => setVatPercent(Number(e.target.value))} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 14px', background: 'var(--surf2)', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div><span style={{ fontSize: 11, color: 'var(--muted)' }}>Tiền chưa thuế: </span><b>{fmt(meterSubtotal(bands))} đ</b></div>
          <div><span style={{ fontSize: 11, color: 'var(--muted)' }}>Thuế VAT: </span><b>{fmt(meterVat(bands, vatPercent))} đ</b></div>
          <div><span style={{ fontSize: 11, color: 'var(--muted)' }}>Tổng tiền: </span><b style={{ color: 'var(--navy)', fontSize: 14 }}>{fmt(meterTotal(bands, vatPercent))} đ</b></div>
          <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu chỉ số'}</button>
          {savedAt && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Đã lưu</span>}
        </div>

        <input className="dn-input" placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 12 }} />

        {meterCustomers.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Sản lượng sử dụng của khách hàng</div>
            {meterCustomers.map(c => (
              <CustomerUsageRow key={c.id} customer={c} month={month} usage={usages.find(u => u.customerId === c.id && u.month === month)} reading={draftReading} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function CustomerUsageRow({ customer, month, usage, reading }: {
  customer: Customer; month: string; usage: CustomerUsage | undefined; reading: MeterReading
}) {
  const [totalUnit, setTotalUnit] = useState(usage?.totalUnit ?? 0)
  const [bandsKwh, setBandsKwh] = useState<Partial<Record<BandKey, number>>>(usage?.bandsKwh ?? {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTotalUnit(usage?.totalUnit ?? 0)
    setBandsKwh(usage?.bandsKwh ?? {})
  }, [usage, month])

  const save = async () => {
    setSaving(true)
    const now = new Date().toISOString().slice(0, 10)
    const id = `${customer.id}_${month}`
    await saveUsage({ id, customerId: customer.id, month, totalUnit, bandsKwh, createdAt: usage?.createdAt || now, updatedAt: now })
    setSaving(false)
  }

  const draftUsage: CustomerUsage = { id: '', customerId: customer.id, month, totalUnit, bandsKwh, createdAt: '', updatedAt: '' }
  const charge = customerCharge(customer, draftUsage, reading)

  if (customer.chargeType === 'fixed_area') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>{customer.name}</span>
        <span style={{ color: 'var(--muted)' }}>{customer.areaM2} m² × {fmt(customer.pricePerM2)} đ/m²</span>
        <b style={{ color: 'var(--navy)' }}>{fmt(charge)} đ</b>
      </div>
    )
  }
  if (customer.chargeType === 'remainder') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>{customer.name}</span>
        <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Gánh phần còn lại (tự tính ở tab Công nợ)</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ minWidth: 140, fontWeight: 600, fontSize: 12.5 }}>{customer.name}</span>
      {customer.chargeType === 'flat_vat_incl' ? (
        <input type="number" className="dn-input" style={{ width: 120 }} placeholder="Tổng dùng" value={totalUnit || ''} onChange={e => setTotalUnit(Number(e.target.value))} />
      ) : (
        (['caoDiem', 'thapDiem', 'binhThuong'] as BandKey[]).map(k => (
          <input key={k} type="number" className="dn-input" style={{ width: 110 }} placeholder={BAND_LABELS[k]} value={bandsKwh[k] || ''}
            onChange={e => setBandsKwh(b => ({ ...b, [k]: Number(e.target.value) }))} />
        ))
      )}
      <b style={{ color: 'var(--navy)', minWidth: 90, textAlign: 'right' }}>{fmt(charge)} đ</b>
      <button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button>
    </div>
  )
}

export function TabNhapChiSo({ readings, customers, usages, month }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; month: string
}) {
  const byMeter = (id: MeterId) => readings.find(r => r.meterId === id && r.month === month)
  return (
    <div>
      <MeterCard meterId={1} month={month} reading={byMeter(1)} customers={customers} usages={usages} />
      <MeterCard meterId={2} month={month} reading={byMeter(2)} customers={customers} usages={usages} />
      <MeterCard meterId={3} month={month} reading={byMeter(3)} customers={customers} usages={usages} />
    </div>
  )
}
