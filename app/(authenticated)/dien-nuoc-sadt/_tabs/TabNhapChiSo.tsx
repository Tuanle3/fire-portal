'use client'
import { useState, useEffect, useMemo, Fragment } from 'react'
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
  // 12 tháng gần nhất, xếp cũ → mới (trái sang phải)
  const months = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))

  // Cảnh báo theo tháng (đổi giá / tổng tiền lệch bất thường) — tính theo chuỗi tăng dần
  const warn = new Map<string, { anomalous: boolean; priceChanged: boolean }>()
  months.forEach((r, idx) => {
    const prev = idx > 0 ? months[idx - 1] : null
    const priceChanged = bandsWithPriceChange(r.bands, prev).length > 0
    const priorSlice = months.slice(Math.max(0, idx - 3), idx)
    const anomalous = isAmountAnomalous(meterTotal(r.bands, r.vatPercent), priorSlice)
    warn.set(r.id, { anomalous, priceChanged })
  })

  const cellBg = (id: string) => {
    const w = warn.get(id)
    return w?.anomalous ? '#FDECEC' : w?.priceChanged ? '#FFF4E0' : undefined
  }

  return (
    <div>
      <div className="dn-col-title">
        <span>Bảng 2 — Chi tiết thông số theo tháng (12 tháng gần nhất)</span>
      </div>
      {months.length === 0 ? (
        <div className="dn-empty">Chưa có dữ liệu tháng nào cho đồng hồ này.</div>
      ) : (
        <table className="dn-table">
          <thead><tr>
            <th>Chỉ tiêu</th>
            {months.map(r => {
              const w = warn.get(r.id)!
              return (
                <th key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>
                  {r.month}
                  {w.anomalous && <span title="Tổng tiền lệch bất thường (>30%) so với trung bình các tháng trước" style={{ marginLeft: 3 }}>⚠️</span>}
                  {!w.anomalous && w.priceChanged && <span title="Đơn giá thay đổi so với tháng trước" style={{ marginLeft: 3 }}>⚠</span>}
                </th>
              )
            })}
          </tr></thead>
          <tbody>
            {visibleBands.map(k => (
              <tr key={`${k}-kwh`}>
                <td style={{ fontWeight: 600 }}>{isWater ? `Sản lượng (${unit})` : `${BAND_LABELS[k]} (${unit})`}</td>
                {months.map(r => <td key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>{fmt(r.bands[k].kwh)}</td>)}
              </tr>
            ))}
            {visibleBands.map(k => (
              <tr key={`${k}-gia`}>
                <td style={{ fontWeight: 600 }}>{isWater ? 'Đơn giá' : `${BAND_LABELS[k]} (giá)`}</td>
                {months.map(r => <td key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>{fmtDec(r.bands[k].donGia)}</td>)}
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 600 }}>Chưa VAT</td>
              {months.map(r => <td key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>{fmt(meterSubtotal(r.bands))}</td>)}
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>VAT</td>
              {months.map(r => <td key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>{fmt(meterVat(r.bands, r.vatPercent))}</td>)}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Tổng tiền</td>
              {months.map(r => <td key={r.id} style={{ textAlign: 'right', fontWeight: 700, background: cellBg(r.id) }}>{fmt(meterTotal(r.bands, r.vatPercent))}</td>)}
            </tr>
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
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Sản lượng sử dụng của khách hàng — tháng {month}</div>
            {meterCustomers.map(c => (
              <CustomerUsageRow key={c.id} customer={c} month={month} usage={usages.find(u => u.customerId === c.id && u.month === month)} reading={draftReading} allUsages={usages} />
            ))}
            <CustomerUsageHistory meterId={meterId} customers={customers} readings={readings} usages={usages} unit={unit} />
          </>
        )}
      </div>
    </div>
  )
}

// Bảng đối chiếu theo tháng (chỉ để xem): mỗi khách 2 dòng — sản lượng & thành tiền — theo 12 tháng gần nhất (cũ → mới).
function CustomerUsageHistory({ meterId, customers, readings, usages, unit }: {
  meterId: MeterId; customers: Customer[]; readings: MeterReading[]; usages: CustomerUsage[]; unit: string
}) {
  const months = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
  const meterCustomers = customers.filter(c => c.meterId === meterId && c.active)
  if (months.length === 0 || meterCustomers.length === 0) return null

  const readingByMonth = new Map(months.map(r => [r.month, r]))
  const usageOf = (cid: string, m: string) => usages.find(u => u.customerId === cid && u.month === m)
  // Sản lượng dùng của khách trong tháng: flat = tổng dùng; timeband = tổng 3 khung; fixed/remainder không có sản lượng.
  const usageUnit = (c: Customer, u: CustomerUsage | undefined): number | null => {
    if (c.chargeType === 'flat_vat_incl') return u?.totalUnit ?? 0
    if (c.chargeType === 'timeband_excl_vat') { const b = u?.bandsKwh ?? {}; return (b.caoDiem ?? 0) + (b.thapDiem ?? 0) + (b.binhThuong ?? 0) }
    return null
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="dn-col-title"><span>Đối chiếu theo tháng — sản lượng &amp; thành tiền</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="dn-table">
          <thead><tr>
            <th>Khách hàng</th>
            <th></th>
            {months.map(r => <th key={r.month} style={{ textAlign: 'right' }}>{r.month}</th>)}
          </tr></thead>
          <tbody>
            {meterCustomers.map(c => (
              <Fragment key={c.id}>
                <tr>
                  <td rowSpan={2} style={{ fontWeight: 600, verticalAlign: 'top' }}>{c.name}</td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>Sản lượng ({unit})</td>
                  {months.map(r => {
                    const val = usageUnit(c, usageOf(c.id, r.month))
                    return <td key={r.month} style={{ textAlign: 'right' }}>{val == null ? '—' : fmt(val)}</td>
                  })}
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>Thành tiền (đ)</td>
                  {months.map(r => (
                    <td key={r.month} style={{ textAlign: 'right' }}>{fmt(customerCharge(c, usageOf(c.id, r.month), readingByMonth.get(r.month)))}</td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function prevMonthStr(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}

function CustomerUsageRow({ customer, month, usage, reading, allUsages }: {
  customer: Customer; month: string; usage: CustomerUsage | undefined; reading: MeterReading; allUsages: CustomerUsage[]
}) {
  const prevUsage = useMemo(() => allUsages.find(u => u.customerId === customer.id && u.month === prevMonthStr(month)), [allUsages, customer.id, month])

  const [indexOld, setIndexOld] = useState(usage?.indexOld ?? prevUsage?.indexNew ?? 0)
  const [indexNew, setIndexNew] = useState(usage?.indexNew ?? 0)
  const [bandsIndexOld, setBandsIndexOld] = useState<Partial<Record<BandKey, number>>>(usage?.bandsIndexOld ?? prevUsage?.bandsIndexNew ?? {})
  const [bandsIndexNew, setBandsIndexNew] = useState<Partial<Record<BandKey, number>>>(usage?.bandsIndexNew ?? {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setIndexOld(usage?.indexOld ?? prevUsage?.indexNew ?? 0)
    setIndexNew(usage?.indexNew ?? 0)
    setBandsIndexOld(usage?.bandsIndexOld ?? prevUsage?.bandsIndexNew ?? {})
    setBandsIndexNew(usage?.bandsIndexNew ?? {})
  }, [usage, month, prevUsage])

  const totalUnit = Math.max(0, indexNew - indexOld)
  const bandsKwh: Partial<Record<BandKey, number>> = {}
  for (const k of ['caoDiem', 'thapDiem', 'binhThuong'] as const) {
    bandsKwh[k] = Math.max(0, (bandsIndexNew[k] ?? 0) - (bandsIndexOld[k] ?? 0))
  }

  const save = async () => {
    setSaving(true)
    const now = new Date().toISOString().slice(0, 10)
    const id = `${customer.id}_${month}`
    await saveUsage({ id, customerId: customer.id, month, totalUnit, bandsKwh, indexOld, indexNew, bandsIndexOld, bandsIndexNew, createdAt: usage?.createdAt || now, updatedAt: now })
    setSaving(false)
  }

  const draftUsage: CustomerUsage = { id: '', customerId: customer.id, month, totalUnit, bandsKwh, indexOld, indexNew, bandsIndexOld, bandsIndexNew, createdAt: '', updatedAt: '' }
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

  if (customer.chargeType === 'flat_vat_incl') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ minWidth: 140, fontWeight: 600, fontSize: 12.5 }}>{customer.name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Cũ:</span>
        <NumberInput style={{ width: 100 }} placeholder="Chỉ số cũ" value={indexOld} onValueChange={setIndexOld} />
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Mới:</span>
        <NumberInput style={{ width: 100 }} placeholder="Chỉ số mới" value={indexNew} onValueChange={setIndexNew} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>→ SL: {fmt(totalUnit)} × {fmtDec(flatPriceThisMonth)} đ</span>
        <b style={{ color: 'var(--navy)', minWidth: 90, textAlign: 'right' }}>{fmt(charge)} đ</b>
        <button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button>
      </div>
    )
  }

  // timeband_excl_vat
  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{customer.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ color: 'var(--navy)' }}>{fmt(charge)} đ</b>
          <button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button>
        </div>
      </div>
      {(['caoDiem', 'thapDiem', 'binhThuong'] as const).map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingLeft: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 80 }}>{BAND_LABELS[k]}:</span>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Cũ</span>
          <NumberInput style={{ width: 90 }} value={bandsIndexOld[k] ?? 0} onValueChange={v => setBandsIndexOld(b => ({ ...b, [k]: v }))} />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Mới</span>
          <NumberInput style={{ width: 90 }} value={bandsIndexNew[k] ?? 0} onValueChange={v => setBandsIndexNew(b => ({ ...b, [k]: v }))} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→ SL: {fmt(bandsKwh[k] ?? 0)}</span>
        </div>
      ))}
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
