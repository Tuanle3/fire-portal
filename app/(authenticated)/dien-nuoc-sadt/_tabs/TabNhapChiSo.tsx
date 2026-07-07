'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  MeterReading, Customer, CustomerUsage, MeterId, Bands,
  BAND_KEYS, BandKey, BAND_LABELS, meterLabel, METER_UNIT, EMPTY_BANDS,
  bandMoney, meterSubtotal, meterVat, meterTotal, customerCharge, resolvePrice, resolveTimebandPoint,
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
        <table className="dn-table" style={{ fontSize: 11 }}>
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
              <tr key={`${k}-kwh`} style={{ fontSize: 10, lineHeight: '14px' }}>
                <td style={{ fontWeight: 600, padding: '5px 6px' }}>{isWater ? `Sản lượng (${unit})` : `${BAND_LABELS[k]} (${unit})`}</td>
                {months.map(r => <td key={r.id} style={{ textAlign: 'right', padding: '5px 6px', background: cellBg(r.id) }}>{fmt(r.bands[k].kwh)}</td>)}
              </tr>
            ))}
            {visibleBands.map(k => (
              <tr key={`${k}-gia`} style={{ fontSize: 10, lineHeight: '14px' }}>
                <td style={{ fontWeight: 600, padding: '5px 6px' }}>{isWater ? 'Đơn giá' : `${BAND_LABELS[k]} (giá)`}</td>
                {months.map(r => <td key={r.id} style={{ textAlign: 'right', padding: '5px 6px', background: cellBg(r.id) }}>{fmtDec(r.bands[k].donGia)}</td>)}
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
            <tr style={{ background: '#E0EDFA' }}>
              <td style={{ fontWeight: 700 }}>Tổng tiền</td>
              {months.map(r => <td key={r.id} style={{ textAlign: 'right', fontWeight: 700, background: cellBg(r.id) ?? '#E0EDFA' }}>{fmt(meterTotal(r.bands, r.vatPercent))}</td>)}
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
            <tr style={{ background: '#E0EDFA' }}><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>Tổng thanh toán</td><td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{fmt(meterTotal(bands, vatPercent))} đ</td></tr>
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
          <CustomerUsageTable meterId={meterId} month={month} customers={customers} readings={readings} usages={usages} reading={draftReading} unit={unit} />
        )}
      </div>
    </div>
  )
}

function prevMonthStr(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}

// Bảng thống nhất: nhập chỉ số bên trái (sticky) + đối chiếu theo tháng bên phải (cuộn ngang).
function CustomerUsageTable({ meterId, month, customers, readings, usages, reading, unit }: {
  meterId: MeterId; month: string; customers: Customer[]; readings: MeterReading[]
  usages: CustomerUsage[]; reading: MeterReading; unit: string
}) {
  const histMonths = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
  const meterCustomers = customers.filter(c => c.meterId === meterId && c.active)
  if (meterCustomers.length === 0) return null

  // Luôn bao gồm tháng hiện tại trong cột để đối chiếu ngay khi nhập
  const hasCurrentMonth = histMonths.some(r => r.month === month)
  const months = hasCurrentMonth ? histMonths : [...histMonths, reading].sort((a, b) => a.month.localeCompare(b.month))
  const readingByMonth = new Map(months.map(r => [r.month, r]))

  return (
    <div style={{ marginTop: 16 }}>
      <div className="dn-col-title"><span>Sản lượng khách hàng — tháng {month}</span></div>
      <div className="dn-usage-wrap">
        <table className="dn-table">
          <thead>
            <tr className="dn-section-hdr">
              <th className="dn-sticky-col" style={{ left: 0, minWidth: 574, textAlign: 'left', fontSize: 11, letterSpacing: '.05em', borderRight: '2px solid var(--border3)' }} colSpan={4}>Nhập thông tin sản lượng</th>
              <th colSpan={months.length} style={{ textAlign: 'center', fontSize: 11, letterSpacing: '.05em' }}>Đối chiếu theo tháng — sản lượng {"&"} thành tiền</th>
            </tr>
            <tr>
              <th className="dn-sticky-col">Khách hàng</th>
              <th className="dn-sticky-col dn-sticky-input">Nhập chỉ số</th>
              <th className="dn-sticky-col dn-sticky-amt">Thành tiền</th>
              <th className="dn-sticky-col dn-sticky-btn"></th>
              {months.map(r => (
                <th key={r.month} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: r.month === month ? '#E0EDFA' : undefined }}>{r.month}{r.month === month ? ' ★' : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meterCustomers.map(c => (
              <CURow key={c.id} customer={c} month={month}
                usage={usages.find(u => u.customerId === c.id && u.month === month)}
                allUsages={usages} reading={reading}
                months={months} readingByMonth={readingByMonth} unit={unit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CURow({ customer: c, month, usage, allUsages, reading, months, readingByMonth, unit }: {
  customer: Customer; month: string; usage: CustomerUsage | undefined
  allUsages: CustomerUsage[]; reading: MeterReading
  months: MeterReading[]; readingByMonth: Map<string, MeterReading>; unit: string
}) {
  const prevUsage = useMemo(() => allUsages.find(u => u.customerId === c.id && u.month === prevMonthStr(month)), [allUsages, c.id, month])
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
    const id = `${c.id}_${month}`
    await saveUsage({ id, customerId: c.id, month, totalUnit, bandsKwh, indexOld, indexNew, bandsIndexOld, bandsIndexNew, createdAt: usage?.createdAt || now, updatedAt: now })
    setSaving(false)
  }

  const draftUsage: CustomerUsage = { id: '', customerId: c.id, month, totalUnit, bandsKwh, indexOld, indexNew, bandsIndexOld, bandsIndexNew, createdAt: '', updatedAt: '' }
  const charge = customerCharge(c, draftUsage, reading)

  const usageOf = (m: string) => allUsages.find(u => u.customerId === c.id && u.month === m)
  const usageUnit = (u: CustomerUsage | undefined): number | null => {
    if (c.chargeType === 'flat_vat_incl') return u?.totalUnit ?? 0
    if (c.chargeType === 'timeband_excl_vat') { const b = u?.bandsKwh ?? {}; return (b.caoDiem ?? 0) + (b.thapDiem ?? 0) + (b.binhThuong ?? 0) }
    return null
  }

  const monthCells = months.map(r => {
    const isCurrent = r.month === month
    const u = isCurrent ? draftUsage : usageOf(r.month)
    const sl = usageUnit(u)
    const tt = isCurrent ? charge : customerCharge(c, u, readingByMonth.get(r.month))
    const priceLabel = (() => {
      if (c.chargeType === 'flat_vat_incl') {
        const p = resolvePrice(c.flatPriceHistory, c.flatUnitPrice, r.month)
        return `${fmt(sl ?? 0)} × ${fmtDec(p)}`
      }
      if (c.chargeType === 'fixed_area') {
        const p = resolvePrice(c.areaPriceHistory, c.pricePerM2, r.month)
        return `${c.areaM2} m² × ${fmtDec(p)}`
      }
      return null
    })()

    // Chi tiết khung giờ cho timeband
    const tbDetail = (() => {
      if (c.chargeType !== 'timeband_excl_vat') return null
      const mU = isCurrent ? draftUsage : usageOf(r.month)
      const mBands = mU?.bandsKwh ?? {}
      const mPt = resolveTimebandPoint(c.timebandPriceHistory, r.month)
      const mReading = readingByMonth.get(r.month)
      const lines = (['caoDiem', 'thapDiem', 'binhThuong'] as const).map(k => {
        const kw = mBands[k] ?? 0
        const custP = mPt?.[k] ?? 0
        const price = custP > 0 ? custP : (mReading?.bands[k].donGia ?? 0)
        return { label: BAND_LABELS[k], kw, price, amt: kw * price }
      })
      const sub = lines.reduce((s, l) => s + l.amt, 0)
      const vp = mReading?.vatPercent ?? 8
      const vat = sub * vp / 100
      return { lines, sub, vat, total: sub + vat, vatPercent: vp }
    })()

    return (
      <td key={r.month} style={{ textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', background: isCurrent ? '#E0EDFA' : undefined }}>
        {tbDetail ? (
          <>
            {tbDetail.lines.map(l => (
              <div key={l.label} style={{ fontSize: 10, color: 'var(--muted2)' }}>{l.label}: {fmt(l.kw)} × {fmtDec(l.price)}</div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>Chưa VAT: {fmt(tbDetail.sub)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>VAT ({tbDetail.vatPercent}%): {fmt(tbDetail.vat)}</div>
            <div style={{ fontSize: 11, color: isCurrent ? 'var(--navy)' : 'var(--muted)', fontWeight: isCurrent ? 600 : undefined }}>{fmt(tbDetail.total)} đ</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: isCurrent ? 700 : undefined }}>{sl == null ? '—' : fmt(sl)}</div>
            {priceLabel && <div style={{ fontSize: 10, color: 'var(--muted2)' }}>{priceLabel}</div>}
            <div style={{ fontSize: 11, color: isCurrent ? 'var(--navy)' : 'var(--muted)', fontWeight: isCurrent ? 600 : undefined }}>{fmt(tt)} đ</div>
          </>
        )}
      </td>
    )
  })

  if (c.chargeType === 'fixed_area') {
    const price = resolvePrice(c.areaPriceHistory, c.pricePerM2, month)
    return (
      <tr>
        <td className="dn-sticky-col" style={{ fontWeight: 600 }}>{c.name}</td>
        <td className="dn-sticky-col dn-sticky-input"><span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{c.areaM2} m² × {fmtDec(price)} đ/m²</span></td>
        <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right' }}><b style={{ color: 'var(--navy)' }}>{fmt(charge)} đ</b></td>
        <td className="dn-sticky-col dn-sticky-btn"></td>
        {monthCells}
      </tr>
    )
  }
  if (c.chargeType === 'remainder') {
    return (
      <tr>
        <td className="dn-sticky-col" style={{ fontWeight: 600 }}>{c.name}</td>
        <td className="dn-sticky-col dn-sticky-input"><span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 11.5 }}>Gánh phần còn lại</span></td>
        <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right' }}>—</td>
        <td className="dn-sticky-col dn-sticky-btn"></td>
        {months.map(r => <td key={r.month} style={{ textAlign: 'right' }}>—</td>)}
      </tr>
    )
  }

  const flatPrice = resolvePrice(c.flatPriceHistory, c.flatUnitPrice, month)

  if (c.chargeType === 'flat_vat_incl') {
    return (
      <tr>
        <td className="dn-sticky-col" style={{ fontWeight: 600 }}>{c.name}</td>
        <td className="dn-sticky-col dn-sticky-input">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Cũ:</span>
            <NumberInput style={{ width: 80 }} placeholder="Chỉ số cũ" value={indexOld} onValueChange={setIndexOld} />
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Mới:</span>
            <NumberInput style={{ width: 80 }} placeholder="Chỉ số mới" value={indexNew} onValueChange={setIndexNew} />
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>→ SL: {fmt(totalUnit)} × {fmtDec(flatPrice)}</span>
          </div>
        </td>
        <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right' }}><b style={{ color: 'var(--navy)' }}>{fmt(charge)} đ</b></td>
        <td className="dn-sticky-col dn-sticky-btn"><button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button></td>
        {monthCells}
      </tr>
    )
  }

  // timeband_excl_vat
  const tbPt = resolveTimebandPoint(c.timebandPriceHistory, month)
  const tbPrices = (['caoDiem', 'thapDiem', 'binhThuong'] as const).map(k => {
    const custPrice = tbPt?.[k] ?? 0
    return custPrice > 0 ? custPrice : (reading.bands[k].donGia ?? 0)
  })
  const tbSubtotal = (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((s, k, i) => s + (bandsKwh[k] ?? 0) * tbPrices[i], 0)
  const tbVat = tbSubtotal * (reading.vatPercent / 100)
  const tbTotal = tbSubtotal + tbVat

  return (
    <tr>
      <td className="dn-sticky-col" style={{ fontWeight: 600, verticalAlign: 'top' }}>{c.name}</td>
      <td className="dn-sticky-col dn-sticky-input" style={{ verticalAlign: 'top' }}>
        {(['caoDiem', 'thapDiem', 'binhThuong'] as const).map((k, i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10.5, color: 'var(--muted)', minWidth: 70 }}>{BAND_LABELS[k]}:</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Cũ</span>
            <NumberInput style={{ width: 70 }} value={bandsIndexOld[k] ?? 0} onValueChange={v => setBandsIndexOld(b => ({ ...b, [k]: v }))} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Mới</span>
            <NumberInput style={{ width: 70 }} value={bandsIndexNew[k] ?? 0} onValueChange={v => setBandsIndexNew(b => ({ ...b, [k]: v }))} />
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>→ {fmt(bandsKwh[k] ?? 0)} × {fmtDec(tbPrices[i])} = {fmt((bandsKwh[k] ?? 0) * tbPrices[i])}</span>
          </div>
        ))}
      </td>
      <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right', verticalAlign: 'top' }}>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Chưa VAT: {fmt(tbSubtotal)} đ</div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>VAT ({reading.vatPercent}%): {fmt(tbVat)} đ</div>
        <div><b style={{ color: 'var(--navy)' }}>{fmt(tbTotal)} đ</b></div>
      </td>
      <td className="dn-sticky-col dn-sticky-btn" style={{ verticalAlign: 'top' }}><button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button></td>
      {monthCells}
    </tr>
  )
}

export function TabNhapChiSo({ readings, customers, usages, month, meterNames, canEditMeterName, onSaveMeterNames, meterId }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; month: string
  meterNames: Record<number, string>; canEditMeterName: boolean; onSaveMeterNames: (id: number, name: string) => void
  meterId: MeterId
}) {
  return (
    <MeterCard meterId={meterId} readings={readings} customers={customers} usages={usages} month={month} meterNames={meterNames} canEditMeterName={canEditMeterName} onSaveMeterNames={onSaveMeterNames} />
  )
}
