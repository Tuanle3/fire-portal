'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  MeterReading, Customer, CustomerUsage, MeterId, Bands,
  BAND_KEYS, BandKey, BAND_LABELS, meterLabel, METER_UNIT, EMPTY_BANDS,
  bandMoney, meterSubtotal, meterVat, meterTotal, customerCharge, resolvePrice,
  lastReadingBefore, bandsWithPriceChange, isAmountAnomalous,
} from '@/lib/dien-nuoc-types'
import { saveMeterReading, saveUsage } from '@/lib/dien-nuoc-store'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')
const fmtDec = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 20 })  // giữ phần lẻ cho đơn giá

function prefillBands(prev: MeterReading | null): Bands {
  if (!prev) return EMPTY_BANDS
  const out = { ...EMPTY_BANDS }
  for (const k of BAND_KEYS) out[k] = { kwh: 0, donGia: prev.bands[k].donGia }
  return out
}

function EditableMeterTitle({ meterId, meterNames, canEdit, onSave }: {
  meterId: MeterId; meterNames: Record<number, string>; canEdit: boolean; onSave: (id: number, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(meterLabel(meterNames, meterId))

  useEffect(() => { setDraft(meterLabel(meterNames, meterId)) }, [meterNames, meterId])

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input className="dn-input" style={{ width: 260 }} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
        <button className="btn-ghost" onClick={() => { onSave(meterId, draft); setEditing(false) }}>Lưu</button>
        <button className="btn-ghost" onClick={() => { setDraft(meterLabel(meterNames, meterId)); setEditing(false) }}>Hủy</button>
      </div>
    )
  }
  return (
    <span className="sc-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {meterLabel(meterNames, meterId)}
      {canEdit && (
        <button onClick={() => setEditing(true)} title="Sửa tên đồng hồ" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', fontSize: 12 }}>✏️</button>
      )}
    </span>
  )
}

// ── Bảng 2: chi tiết thông số theo tháng (12 tháng gần nhất), cảnh báo sai lệch ──
function MeterHistoryTable({ meterId, readings, visibleBands, isWater, unit }: {
  meterId: MeterId; readings: MeterReading[]; visibleBands: BandKey[]; isWater: boolean; unit: string
}) {
  const rows = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
  const ascByMonth = [...rows].sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div>
      <div className="dn-col-title">
        <span>Bảng 2 — Chi tiết thông số theo tháng (12 tháng gần nhất)</span>
      </div>
      {rows.length === 0 ? (
        <div className="dn-empty">Chưa có dữ liệu tháng nào cho đồng hồ này.</div>
      ) : (
        <table className="dn-table">
          <thead><tr>
            <th>Tháng</th>
            {visibleBands.map(k => <th key={`${k}-kwh`} style={{ textAlign: 'right' }}>{isWater ? unit : `${BAND_LABELS[k]} (${unit})`}</th>)}
            {visibleBands.map(k => <th key={`${k}-gia`} style={{ textAlign: 'right' }}>{isWater ? 'Đơn giá' : `${BAND_LABELS[k]} (giá)`}</th>)}
            <th style={{ textAlign: 'right' }}>Chưa VAT</th><th style={{ textAlign: 'right' }}>VAT</th><th style={{ textAlign: 'right' }}>Tổng tiền</th>
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const idx = ascByMonth.findIndex(x => x.id === r.id)
              const prev = idx > 0 ? ascByMonth[idx - 1] : null
              const priceChanged = bandsWithPriceChange(r.bands, prev).length > 0
              const priorSlice = ascByMonth.slice(Math.max(0, idx - 3), idx)
              const anomalous = isAmountAnomalous(meterTotal(r.bands, r.vatPercent), priorSlice)
              return (
                <tr key={r.id} style={{ background: anomalous ? '#FDECEC' : priceChanged ? '#FFF4E0' : undefined }}>
                  <td style={{ fontWeight: 600 }}>
                    {r.month}
                    {anomalous && <span title="Tổng tiền lệch bất thường (>30%) so với trung bình các tháng trước" style={{ marginLeft: 4 }}>⚠️</span>}
                    {!anomalous && priceChanged && <span title="Đơn giá thay đổi so với tháng trước" style={{ marginLeft: 4 }}>⚠</span>}
                  </td>
                  {visibleBands.map(k => <td key={`${k}-kwh`} style={{ textAlign: 'right' }}>{fmt(r.bands[k].kwh)}</td>)}
                  {visibleBands.map(k => <td key={`${k}-gia`} style={{ textAlign: 'right' }}>{fmtDec(r.bands[k].donGia)}</td>)}
                  <td style={{ textAlign: 'right' }}>{fmt(meterSubtotal(r.bands))}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(meterVat(r.bands, r.vatPercent))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(meterTotal(r.bands, r.vatPercent))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MeterCard({ meterId, month, readings, customers, usages, meterNames, canEditMeterName, onSaveMeterNames }: {
  meterId: MeterId; month: string; readings: MeterReading[]
  customers: Customer[]; usages: CustomerUsage[]
  meterNames: Record<number, string>; canEditMeterName: boolean; onSaveMeterNames: (id: number, name: string) => void
}) {
  const reading = readings.find(r => r.meterId === meterId && r.month === month)
  const prevReading = useMemo(() => lastReadingBefore(readings, meterId, month), [readings, meterId, month])

  const [bands, setBands] = useState<Bands>(reading?.bands ?? prefillBands(prevReading))
  const [vatPercent, setVatPercent] = useState(reading?.vatPercent ?? prevReading?.vatPercent ?? 8)
  const [note, setNote] = useState(reading?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    setBands(reading?.bands ?? prefillBands(prevReading))
    setVatPercent(reading?.vatPercent ?? prevReading?.vatPercent ?? 8)
    setNote(reading?.note ?? '')
    setSavedAt(null)
  }, [reading, month, prevReading])

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

  // Cảnh báo sai lệch ngay khi đang nhập (trước khi lưu)
  const priceChangedBands = bandsWithPriceChange(bands, prevReading)
  const priorForAnomaly = readings.filter(r => r.meterId === meterId && r.month < month).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3)
  const anomalous = isAmountAnomalous(meterTotal(bands, vatPercent), priorForAnomaly)

  return (
    <div className="sc">
      <div className="sc-head">
        <EditableMeterTitle meterId={meterId} meterNames={meterNames} canEdit={canEditMeterName} onSave={onSaveMeterNames} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Đơn vị: {unit}</span>
      </div>
      <div className="sc-body">
       <div className="dn-split">
        <div className="dn-split-left">
        <div className="dn-col-title">
          <span>Bảng 1 — Nhập chỉ số tháng {month}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', fontWeight: 400 }}>
            <label className="dn-label" style={{ margin: 0 }}>VAT %:</label>
            <input type="number" className="dn-input" style={{ width: 60 }} value={vatPercent || ''} onChange={e => setVatPercent(Number(e.target.value))} />
          </span>
        </div>

        <table className="dn-table" style={{ marginBottom: 10 }}>
          <thead><tr>
            <th>Khung giờ</th>
            <th style={{ textAlign: 'right' }}>Sản lượng ({unit})</th>
            <th style={{ textAlign: 'right' }}>Đơn giá (đ)</th>
            <th style={{ textAlign: 'right' }}>Thành tiền</th>
          </tr></thead>
          <tbody>
            {visibleBands.map(k => {
              const changed = priceChangedBands.includes(k)
              return (
                <tr key={k}>
                  <td>{isWater ? 'Sử dụng trong tháng' : BAND_LABELS[k]}</td>
                  <td style={{ textAlign: 'right' }}>
                    <NumberInput style={{ textAlign: 'right' }} placeholder="0" value={bands[k].kwh} onValueChange={v => setBand(k, 'kwh', v)} />
                  </td>
                  <td style={{ textAlign: 'right', background: changed ? '#FFF4E0' : undefined }}>
                    <NumberInput style={{ textAlign: 'right' }} placeholder="0" value={bands[k].donGia} onValueChange={v => setBand(k, 'donGia', v)} />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(bandMoney(bands[k]))} đ</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} style={{ textAlign: 'right', color: 'var(--muted)' }}>Tổng tiền chưa VAT</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(meterSubtotal(bands))} đ</td></tr>
            <tr><td colSpan={3} style={{ textAlign: 'right', color: 'var(--muted)' }}>Thuế VAT ({vatPercent || 0}%)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(meterVat(bands, vatPercent))} đ</td></tr>
            <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>Tổng thanh toán</td><td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{fmt(meterTotal(bands, vatPercent))} đ</td></tr>
          </tfoot>
        </table>

        {priceChangedBands.length > 0 && (
          <div style={{ background: '#FFF4E0', color: '#8A5A12', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            ⚠ Đơn giá thay đổi so với tháng trước ở: {priceChangedBands.map(k => isWater ? 'sử dụng' : BAND_LABELS[k]).join(', ')}. Kiểm tra lại nếu không cố ý sửa.
          </div>
        )}
        {anomalous && (
          <div style={{ background: '#FDECEC', color: '#8C1F1F', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            ⚠️ Tổng thanh toán tháng này lệch hơn 30% so với trung bình 3 tháng trước — có thể ghi sai số, kiểm tra lại trước khi lưu.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu chỉ số'}</button>
          {savedAt && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Đã lưu</span>}
          <input className="dn-input" placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1 }} />
        </div>
        </div>

        <div className="dn-split-right">
          <MeterHistoryTable meterId={meterId} readings={readings} visibleBands={visibleBands} isWater={isWater} unit={unit} />
        </div>
       </div>

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
    const priceThisMonth = resolvePrice(customer.areaPriceHistory, customer.pricePerM2, month)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>{customer.name}</span>
        <span style={{ color: 'var(--muted)' }}>{customer.areaM2} m² × {fmtDec(priceThisMonth)} đ/m²</span>
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

  const flatPriceThisMonth = resolvePrice(customer.flatPriceHistory, customer.flatUnitPrice, month)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ minWidth: 140, fontWeight: 600, fontSize: 12.5 }}>{customer.name}</span>
      {customer.chargeType === 'flat_vat_incl' ? (
        <>
          <NumberInput style={{ width: 120 }} placeholder="Tổng dùng" value={totalUnit} onValueChange={setTotalUnit} />
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>× {fmtDec(flatPriceThisMonth)} đ</span>
        </>
      ) : (
        (['caoDiem', 'thapDiem', 'binhThuong'] as BandKey[]).map(k => (
          <NumberInput key={k} style={{ width: 110 }} placeholder={BAND_LABELS[k]} value={bandsKwh[k] || 0}
            onValueChange={v => setBandsKwh(b => ({ ...b, [k]: v }))} />
        ))
      )}
      <b style={{ color: 'var(--navy)', minWidth: 90, textAlign: 'right' }}>{fmt(charge)} đ</b>
      <button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button>
    </div>
  )
}

export function TabNhapChiSo({ readings, customers, usages, month, meterNames, canEditMeterName, onSaveMeterNames }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; month: string
  meterNames: Record<number, string>; canEditMeterName: boolean; onSaveMeterNames: (id: number, name: string) => void
}) {
  const common = { readings, customers, usages, month, meterNames, canEditMeterName, onSaveMeterNames }
  return (
    <div>
      <MeterCard meterId={1} {...common} />
      <MeterCard meterId={2} {...common} />
      <MeterCard meterId={3} {...common} />
    </div>
  )
}
