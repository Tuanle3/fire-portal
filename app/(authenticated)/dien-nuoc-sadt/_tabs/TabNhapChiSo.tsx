'use client'
import { useState, useEffect, useMemo, Fragment } from 'react'
import {
  MeterReading, Customer, CustomerUsage, MeterId, Bands,
  BAND_KEYS, BandKey, BAND_LABELS, meterLabel, METER_LABELS, METER_UNIT, EMPTY_BANDS, CHARGE_TYPE_LABELS,
  bandMoney, meterSubtotal, meterVat, meterTotal, customerCharge, meterAllocation, resolvePrice, resolveTimebandPoint,
  lastReadingBefore, bandsWithPriceChange, isAmountAnomalous,
  FloorReading, FloorBandKey, FLOOR_BAND_KEYS, BqtRatio, DEFAULT_BQT_RATIO,
  defaultFloorReadings, emptyFloorBands, floorBandKwh, floorTotalKwh, computeLightingSplit, computeBqt, isActiveInMonth, normalizeFloor,
  WATER_METER_KEYS, WATER_METER_LABELS, defaultWaterFloorReadings, waterFloorTotal,
  METER_SERVICE, subFor, findUsage, primaryService, customerHasService,
} from '@/lib/dien-nuoc-types'
import { saveMeterReading, saveUsage } from '@/lib/dien-nuoc-store'
import { exportMeter } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'
import { DashArea } from '../_components/DashArea'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')
const fmtDec = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 20 })  // giữ phần lẻ cho đơn giá
const fmtKwh = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })   // kWh giữ tối đa 2 số lẻ

function prefillBands(prev: MeterReading | null): Bands {
  if (!prev) return EMPTY_BANDS
  const out = { ...EMPTY_BANDS }
  for (const k of BAND_KEYS) out[k] = { kwh: 0, donGia: prev.bands[k].donGia }
  return out
}

// Số ghi tầng tháng mới: GỘP mọi khu từng xuất hiện ở các tháng trước (ưu tiên tháng gần nhất) —
// để card đã tạo luôn tự hiện ở tháng mới, không bị mất. Chỉ số cũ = chỉ số mới gần nhất của khu đó;
// giữ tên & cờ cố định.
function prefillFloors(readings: MeterReading[], meterId: MeterId, month: string): FloorReading[] {
  const prior = readings.filter(r => r.meterId === meterId && r.month < month).sort((a, b) => b.month.localeCompare(a.month))
  const seen = new Map<string, FloorReading>()
  const order: string[] = []
  for (const r of prior) {
    for (const raw of (r.floorReadings ?? [])) {
      const f = normalizeFloor(raw)
      const g = (f.group || '').trim()
      if (!g || seen.has(g)) continue  // lấy lần xuất hiện gần nhất của mỗi khu
      seen.set(g, f); order.push(g)
    }
  }
  if (order.length === 0) return meterId === 3 ? defaultWaterFloorReadings() : defaultFloorReadings()
  return order.map(g => {
    const f = seen.get(g)!
    const bands = emptyFloorBands()
    for (const k of FLOOR_BAND_KEYS) bands[k] = { indexOld: f.bands?.[k]?.indexNew || 0, indexNew: 0 }
    return { group: f.group, bands, ...(f.fixed ? { fixed: true as const } : {}), ...(f.commonTM ? { commonTM: true as const } : {}) }
  })
}

// Tự điền "chỉ số cũ" = chỉ số mới cùng khu của tháng trước cho mọi ô CŨ đang trống (0).
// Áp dụng cả khi tháng đã lưu — để chỉ số cũ luôn nối tiếp tháng trước, khỏi nhập tay.
function fillOldFromPrev(floors: FloorReading[], prev: MeterReading | null): FloorReading[] {
  if (!prev?.floorReadings?.length) return floors
  const prevMap = new Map(prev.floorReadings.map(normalizeFloor).map(f => [(f.group || '').trim(), f]))
  return floors.map(f => {
    const pf = prevMap.get((f.group || '').trim())
    if (!pf) return f
    const bands = { ...f.bands }
    for (const k of FLOOR_BAND_KEYS) {
      if (!bands[k].indexOld) bands[k] = { ...bands[k], indexOld: pf.bands?.[k]?.indexNew || 0 }
    }
    return { ...f, bands }
  })
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

  const colCount = months.length + 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
      <div className="dn-col-title">
        <span>Bảng 2 — Chi tiết thông số theo tháng (12 tháng gần nhất)</span>
      </div>
      {months.length === 0 ? (
        <div className="dn-empty">Chưa có dữ liệu tháng nào cho đồng hồ này.</div>
      ) : (
        <table className="dn-table dn-fill" style={{ fontSize: 11 }}>
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
              <tr key={`${k}-kwh`} style={{ fontSize: 10, lineHeight: '14px', color: '#2563EB' }}>
                <td style={{ fontWeight: 400, padding: '5px 6px' }}>{isWater ? `Sản lượng (${unit})` : `${BAND_LABELS[k]} (${unit})`}</td>
                {months.map(r => <td key={r.id} style={{ textAlign: 'right', padding: '5px 6px', background: cellBg(r.id) }}>{fmtKwh(r.bands[k].kwh)}</td>)}
              </tr>
            ))}
            {visibleBands.map(k => (
              <tr key={`${k}-gia`} style={{ fontSize: 10, lineHeight: '14px' }}>
                <td style={{ fontWeight: 600, padding: '5px 6px' }}>{isWater ? 'Đơn giá' : `${BAND_LABELS[k]} (giá)`}</td>
                {months.map(r => <td key={r.id} style={{ textAlign: 'right', padding: '5px 6px', background: cellBg(r.id) }}>{fmtDec(r.bands[k].donGia)}</td>)}
              </tr>
            ))}
            <tr className="dn-spacer" aria-hidden><td colSpan={colCount}></td></tr>
            <tr className="dn-sum-top">
              <td style={{ fontWeight: 600 }}>Tổng tiền chưa VAT</td>
              {months.map(r => <td key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>{fmt(meterSubtotal(r.bands))}</td>)}
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Thuế VAT</td>
              {months.map(r => <td key={r.id} style={{ textAlign: 'right', background: cellBg(r.id) }}>{fmt(meterVat(r.bands, r.vatPercent))}</td>)}
            </tr>
            <tr style={{ background: '#E0EDFA' }}>
              <td style={{ fontWeight: 700 }}>Tổng thanh toán</td>
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
  const [floorReadings, setFloorReadings] = useState<FloorReading[]>(fillOldFromPrev(reading?.floorReadings ?? prefillFloors(readings, meterId, month), prevReading))
  const [bqtRatio, setBqtRatio] = useState<BqtRatio>(reading?.bqtRatio ?? prevReading?.bqtRatio ?? DEFAULT_BQT_RATIO)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    setBands(reading?.bands ?? prefillBands(prevReading))
    setVatPercent(reading?.vatPercent ?? prevReading?.vatPercent ?? 8)
    setNote(reading?.note ?? '')
    setFloorReadings(fillOldFromPrev(reading?.floorReadings ?? prefillFloors(readings, meterId, month), prevReading))
    setBqtRatio(reading?.bqtRatio ?? prevReading?.bqtRatio ?? DEFAULT_BQT_RATIO)
    setSavedAt(null)
  }, [reading, month, prevReading, readings, meterId])

  const isWater = meterId === 3
  const visibleBands: BandKey[] = isWater ? ['toanThoiGian'] : BAND_KEYS
  const unit = METER_UNIT[meterId]

  const setBand = (k: BandKey, field: 'kwh' | 'donGia', v: number) => {
    setBands(b => ({ ...b, [k]: { ...b[k], [field]: v } }))
  }

  const isMeter1 = meterId === 1

  const save = async () => {
    setSaving(true)
    const now = new Date().toISOString().slice(0, 10)
    const id = `${meterId}_${month}`
    await saveMeterReading({
      id, meterId, month, bands, vatPercent, note,
      ...(isMeter1 ? { floorReadings, bqtRatio } : {}),
      ...(isWater ? { floorReadings } : {}),  // nước: lưu số ghi từng tầng (không có bqtRatio/khung giờ)
      createdAt: reading?.createdAt || now, updatedAt: now,
    })
    setSaving(false)
    setSavedAt(now)
  }

  const meterCustomers = customers.filter(c => customerHasService(c, METER_SERVICE[meterId]) && isActiveInMonth(c, month))
  const draftReading: MeterReading = { id: '', meterId, month, bands, vatPercent, note, floorReadings, bqtRatio, createdAt: '', updatedAt: '' }

  // Cảnh báo sai lệch ngay khi đang nhập (trước khi lưu)
  const priceChangedBands = bandsWithPriceChange(bands, prevReading)
  const priorForAnomaly = readings.filter(r => r.meterId === meterId && r.month < month).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3)
  const anomalous = isAmountAnomalous(meterTotal(bands, vatPercent), priorForAnomaly)

  return (
    <div className="sc">
      <div className="sc-head">
        <EditableMeterTitle meterId={meterId} meterNames={meterNames} canEdit={canEditMeterName} onSave={onSaveMeterNames} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Đơn vị: {unit}</span>
          <button className="btn-ghost" onClick={() => exportMeter(meterId, month, readings, customers, usages, meterNames)}>⬇ Xuất Excel</button>
        </span>
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

        <table className="dn-table dn-fill">
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
                  <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(bandMoney(bands[k]))} đ</td>
                </tr>
              )
            })}
            <tr className="dn-spacer" aria-hidden><td colSpan={4}></td></tr>
            <tr className="dn-sum-top"><td colSpan={3} style={{ textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Tổng tiền chưa VAT</td><td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(meterSubtotal(bands))} đ</td></tr>
            <tr><td colSpan={3} style={{ textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Thuế VAT ({vatPercent || 0}%)</td><td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(meterVat(bands, vatPercent))} đ</td></tr>
            <tr style={{ background: '#E0EDFA' }}><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>Tổng thanh toán</td><td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)', fontSize: 14, whiteSpace: 'nowrap' }}>{fmt(meterTotal(bands, vatPercent))} đ</td></tr>
          </tbody>
        </table>
        </div>

        <div className="dn-split-right">
          <MeterHistoryTable meterId={meterId} readings={readings} visibleBands={visibleBands} isWater={isWater} unit={unit} />
        </div>
       </div>

        {priceChangedBands.length > 0 && (
          <div style={{ background: '#FFF4E0', color: '#8A5A12', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 8 }}>
            ⚠ Đơn giá thay đổi so với tháng trước ở: {priceChangedBands.map(k => isWater ? 'sử dụng' : BAND_LABELS[k]).join(', ')}. Kiểm tra lại nếu không cố ý sửa.
          </div>
        )}
        {anomalous && (
          <div style={{ background: '#FDECEC', color: '#8C1F1F', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            ⚠️ Tổng thanh toán tháng này lệch hơn 30% so với trung bình 3 tháng trước — có thể ghi sai số, kiểm tra lại trước khi lưu.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, marginBottom: 12 }}>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu chỉ số'}</button>
          {savedAt && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Đã lưu</span>}
          <input className="dn-input" placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={e => setNote(e.target.value)} style={{ flex: 1 }} />
        </div>

        {isMeter1 && (
          <BqtSection reading={draftReading} readings={readings} month={month} customers={customers} usages={usages}
            floorReadings={floorReadings} setFloorReadings={setFloorReadings}
            bqtRatio={bqtRatio} setBqtRatio={setBqtRatio}
            onSave={save} saving={saving} savedAt={savedAt} />
        )}

        {isWater && (
          <WaterFloorSection readings={readings} month={month} customers={customers}
            floorReadings={floorReadings} setFloorReadings={setFloorReadings}
            onSave={save} saving={saving} savedAt={savedAt} />
        )}

        {meterId === 2 && (
          <AcSplitSection reading={draftReading} readings={readings} month={month} customers={customers} usages={usages} />
        )}

        {meterCustomers.length > 0 && (
          <CustomerUsageTable meterId={meterId} month={month} customers={customers} readings={readings} usages={usages} reading={draftReading} unit={unit} />
        )}
      </div>
    </div>
  )
}

// ── Chia tiền đồng hồ 1 cho 3 bên (cộng khớp tổng đồng hồ) — cùng logic splitThreeWay ở Tổng quan ──
//  • Sơn An thu hộ (khách thuê) = tiền thu hộ (3 tầng TM chung + công ty đồng hồ riêng, đã VAT).
//  • BQT chịu = điện cư dân dùng chung CÓ đo đếm = Σ(ghi tầng − khách) các khu KHÔNG phải 3 tầng TM.
//  • Sơn An chịu = phần còn lại chưa quy được = hao hụt/thất thoát. ①+②+③ = tổng tiền đồng hồ 1.
interface Dh1Split3 {
  total: number
  sonanRevenue: number    // tiền thực thu từ khách ki ốt + công ty (theo đơn giá của họ)
  sonanEVNCost: number    // tiền Sơn An trả EVN cho phần kWh của khách (theo đơn giá EVN)
  sonanProfit: number     // chênh lệch Sơn An hưởng = sonanRevenue − sonanEVNCost
  bqtBorne: number        // BQT chịu = tổng đồng hồ − sonanEVNCost
  totalKwh: number; commonKwh: number; companyKwh: number
  tenantKwh: number; bqtKwh: number
}
// Tỷ lệ phân bổ khung giờ cho ki ốt (chung 3 tầng TM) khi tính chi phí EVN
const KIOSK_BAND_RATIO = { caoDiem: 0.15, thapDiem: 0.35, binhThuong: 0.50 } as const
function splitDh1ThreeWay(split: ReturnType<typeof computeLightingSplit>, reading: MeterReading, customers: Customer[], usages: CustomerUsage[]): Dh1Split3 {
  const total = split.meterTotal
  const vatMul = 1 + (reading.vatPercent || 0) / 100

  // ① Sơn An thu hộ = tiền thực tế thu từ khách (theo đơn giá cấu hình từng khách)
  const sonanRevenue = meterAllocation(reading, customers, usages).allocated

  // ② Sơn An chịu phí EVN = tiền EVN tính cho phần kWh của ki ốt + công ty
  // Ki ốt (chung 3 tầng TM): phân bổ 15% CĐ / 35% TĐ / 50% BT × đơn giá EVN × VAT
  const commonKwh = split.commonPoolKwh
  const kioskEVNCost = (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((s, k) =>
    s + commonKwh * KIOSK_BAND_RATIO[k] * (reading.bands[k]?.donGia || 0), 0) * vatMul
  // Công ty (ownMeter): kWh thực từng khung giờ × đơn giá EVN × VAT
  const companyEVNCost = split.companies.reduce((s, co) =>
    s + (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((ss, k) =>
      ss + co[k] * (reading.bands[k]?.donGia || 0), 0) * vatMul, 0)
  const sonanEVNCost = kioskEVNCost + companyEVNCost

  const sonanProfit = sonanRevenue - sonanEVNCost
  const bqtBorne = Math.max(0, total - sonanEVNCost)

  // kWh thông tin (không dùng để tính tiền)
  const companyKwh = split.companies.reduce((s, co) => s + co.total, 0)
  const tenantKwh = commonKwh + companyKwh
  const totKwh = BAND_KEYS.reduce((s, k) => s + (reading.bands[k]?.kwh || 0), 0)
  const bqtc = computeBqt(reading, customers, usages, reading.bqtRatio ?? DEFAULT_BQT_RATIO)
  const commonGroups = new Set((reading.floorReadings ?? []).filter(f => f.commonTM).map(f => (f.group || '').trim()))
  const bqtKwh = bqtc.floors.filter(fr => !commonGroups.has((fr.group || '').trim())).reduce((s, fr) => s + fr.bqtKwh, 0)
  return { total, sonanRevenue, sonanEVNCost, sonanProfit, bqtBorne, totalKwh: totKwh, commonKwh, companyKwh, tenantKwh, bqtKwh }
}

// ── Đồng hồ 1: tách "Sơn An thu hộ" & "Ban quản trị" (theo sheet Điện chiếu sáng) ──
function BqtSection({ reading, readings, month, customers, usages, floorReadings, setFloorReadings, bqtRatio, setBqtRatio, onSave, saving, savedAt }: {
  reading: MeterReading; readings: MeterReading[]; month: string; customers: Customer[]; usages: CustomerUsage[]
  floorReadings: FloorReading[]; setFloorReadings: (v: FloorReading[]) => void
  bqtRatio: BqtRatio; setBqtRatio: (v: BqtRatio) => void
  onSave: () => void; saving: boolean; savedAt: string | null
}) {
  const split = computeLightingSplit(reading, customers, usages, bqtRatio)
  const ratioSum = (bqtRatio.caoDiem || 0) + (bqtRatio.thapDiem || 0) + (bqtRatio.binhThuong || 0)
  // Chia 3 bên: Sơn An thu hộ (khách thuê) · Sơn An chịu (hao hụt) · BQT chịu (cư dân đo đếm)
  const split3 = splitDh1ThreeWay(split, reading, customers, usages)
  const tot3 = split.meterTotal
  const evnCostPct = tot3 > 0 ? Math.round(split3.sonanEVNCost / tot3 * 100) : 0
  const bqtBornePct = Math.max(0, 100 - evnCostPct)
  const groupSuggestions = Array.from(new Set(customers.filter(c => customerHasService(c, 'dh1') && c.active).map(c => (c.group || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'))

  const [dragIdx, setDragIdx] = useState<number | null>(null)  // kéo-thả đổi vị trí khu
  const moveFloor = (from: number | null, to: number) => {
    if (from === null || from === to) return
    const arr = [...floorReadings]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    setFloorReadings(arr)
  }

  const setFloorGroup = (i: number, group: string) => setFloorReadings(floorReadings.map((f, idx) => idx === i ? { ...f, group } : f))
  const setFloorBand = (i: number, k: FloorBandKey, field: 'indexOld' | 'indexNew', v: number) =>
    setFloorReadings(floorReadings.map((f, idx) => idx === i ? { ...f, bands: { ...f.bands, [k]: { ...f.bands[k], [field]: v } } } : f))
  const setRatio = (k: keyof BqtRatio, v: number) => setBqtRatio({ ...bqtRatio, [k]: v })
  const addFloor = () => setFloorReadings([...floorReadings, { group: '', bands: emptyFloorBands() }])
  const removeFloor = (i: number) => setFloorReadings(floorReadings.filter((_, idx) => idx !== i))
  // Bật "cố định": gộp về 1 chỉ số (khung Bình thường), xoá CĐ/TĐ để không cộng nhầm
  const setFloorFixed = (i: number, fixed: boolean) => setFloorReadings(floorReadings.map((f, idx) =>
    idx !== i ? f
      : fixed ? { ...f, fixed: true, bands: { ...f.bands, caoDiem: { indexOld: 0, indexNew: 0 }, thapDiem: { indexOld: 0, indexNew: 0 } } }
      : { ...f, fixed: false }))
  // Bật/tắt "thuộc 3 tầng TM chung" (chỉ gắn key khi bật ⇒ tránh undefined khi lưu Firestore)
  const setFloorCommonTM = (i: number, on: boolean) => setFloorReadings(floorReadings.map((f, idx) => {
    if (idx !== i) return f
    if (on) return { ...f, commonTM: true }
    const rest = { ...f }; delete rest.commonTM; return rest  // gỡ hẳn key khi tắt (tránh undefined khi lưu Firestore)
  }))

  return (
    <div style={{ marginTop: 20, border: '1px solid var(--border3)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: '#1C3557', color: '#fff', padding: '9px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Phân bổ tiền điện chiếu sáng — Sơn An thu hộ &amp; Ban quản trị (đồng hồ điện 1)
      </div>

      <div style={{ padding: 14 }}>
        {/* Nhập số ghi điện từng khu */}
        <div className="dn-col-title">
          <span>Nhập số ghi điện từng khu — đánh dấu khu <b>“Thuộc 3 tầng TM chung”</b> để gom vào Sơn An thu hộ</span>
          <button className="btn-ghost" style={{ textTransform: 'none', fontWeight: 600 }} onClick={addFloor}>+ Thêm khu</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 14 }}>
          {floorReadings.map((f, i) => (
            <div key={i}
              onDragOver={e => { if (dragIdx !== null && dragIdx !== i) e.preventDefault() }}
              onDrop={e => { e.preventDefault(); moveFloor(dragIdx, i); setDragIdx(null) }}
              style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', border: dragIdx !== null && dragIdx !== i ? '1px dashed var(--navy3)' : f.commonTM ? '1.5px solid #D4A64A' : '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff', opacity: dragIdx === i ? 0.45 : 1, transition: 'opacity .12s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', background: f.commonTM ? '#FFF4E0' : '#EEF3FA', borderBottom: '1px solid var(--border3)' }}>
                {floorReadings.length > 1 && (
                  <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} title="Kéo để đổi vị trí khu"
                    style={{ flexShrink: 0, cursor: 'grab', color: 'var(--muted2)', fontSize: 14, lineHeight: 1, userSelect: 'none' }}>⠿</span>
                )}
                <input className="dn-input" list="dn-bqt-groups" style={{ flex: 1, fontWeight: 600 }} value={f.group} placeholder="Tên khu (Nhóm KH)" onChange={e => setFloorGroup(i, e.target.value)} />
                {floorReadings.length > 1 && (
                  <button onClick={() => removeFloor(i)} title="Xoá khu này" style={{ flexShrink: 0, width: 22, height: 22, padding: 0, lineHeight: '20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', border: '1px solid #FECACA', borderRadius: 6, background: '#fff', color: '#DC2626' }}>×</button>
                )}
              </div>
              <div style={{ padding: '9px 10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: f.commonTM ? '#8A5A12' : 'var(--muted)', marginBottom: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.commonTM} onChange={e => setFloorCommonTM(i, e.target.checked)} style={{ margin: 0 }} />
                  Thuộc 3 tầng TM chung (→ Sơn An thu hộ)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--muted)', marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.fixed} onChange={e => setFloorFixed(i, e.target.checked)} style={{ margin: 0 }} />
                  Cố định (không theo khung giờ)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 1fr 44px', gap: 4, alignItems: 'center', fontSize: 9.5, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 3 }}>
                  <span>{f.fixed ? 'Loại' : 'Khung'}</span><span style={{ textAlign: 'right' }}>Cũ</span><span style={{ textAlign: 'right' }}>Mới</span><span style={{ textAlign: 'right' }}>kWh</span>
                </div>
                {(f.fixed ? (['binhThuong'] as FloorBandKey[]) : FLOOR_BAND_KEYS).map(k => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 1fr 44px', gap: 4, alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{f.fixed ? 'Cố định' : BAND_LABELS[k]}</span>
                    <NumberInput style={{ textAlign: 'right', padding: '5px 5px' }} placeholder="0" value={f.bands[k].indexOld} onValueChange={v => setFloorBand(i, k, 'indexOld', v)} />
                    <NumberInput style={{ textAlign: 'right', padding: '5px 5px' }} placeholder="0" value={f.bands[k].indexNew} onValueChange={v => setFloorBand(i, k, 'indexNew', v)} />
                    <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>{fmtKwh(floorBandKwh(f.bands[k]))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px dashed var(--border3)', paddingTop: 8 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: '#E0EDFA', borderRadius: 7, padding: '5px 4px' }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.02em' }}>Ghi tầng (kWh)</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{fmtKwh(floorTotalKwh(f))}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <datalist id="dn-bqt-groups">{groupSuggestions.map(g => <option key={g} value={g} />)}</datalist>

        {/* Tỷ lệ chia khung giờ cho phần chung 3 tầng TM */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--navy)' }}>Tỷ lệ chia khung giờ (phần chung 3 tầng TM):</span>
          {([['caoDiem', 'CĐ'], ['thapDiem', 'TĐ'], ['binhThuong', 'BT']] as [keyof BqtRatio, string][]).map(([k, label]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <label className="dn-label" style={{ margin: 0 }}>{label}%</label>
              <input type="number" className="dn-input" style={{ width: 56, padding: '4px 6px' }} value={bqtRatio[k] || ''} onChange={e => setRatio(k, Number(e.target.value))} />
            </span>
          ))}
          <span style={{ fontSize: 10.5, color: ratioSum === 100 ? 'var(--green)' : '#DC2626', fontWeight: 600 }}>Σ {ratioSum}%{ratioSum === 100 ? ' ✓' : ''}</span>
        </div>

        {/* Nút lưu — đưa lên trên các card kết quả */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <button className="btn-primary" style={{ background: '#D4A64A' }} onClick={onSave} disabled={saving}>{saving ? 'Đang lưu…' : '💾 Lưu tháng này'}</button>
          {savedAt && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>✓ Đã lưu</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>
          * Bấm “💾 Lưu tháng này” để lưu số ghi từng khu, cờ “3 tầng TM chung” &amp; tỷ lệ cho tháng {month}. (Cũng được lưu chung khi bấm “Lưu chỉ số” ở Bảng 1.)
        </div>

        {/* Bố cục 3 phần cùng hàng (desktop). iPad: 2 cột + bảng thống kê full. Điện thoại: xếp dọc. */}
        <style>{`
          .dh1-3col { display: grid; grid-template-columns: minmax(230px, 0.7fr) 390px minmax(0, 2fr); gap: 12px; align-items: stretch; margin-bottom: 12px; }
          .dh1-3col > div { min-width: 0; }
          /* Bảng Sơn An thu hộ: nén padding + không xuống dòng, đủ chỗ hiện hết cột Thành tiền */
          .dh1-satable td, .dh1-satable th { padding: 6px 9px !important; white-space: nowrap; }
          @media (max-width: 1200px) {
            .dh1-3col { grid-template-columns: 1fr 1fr; }
            .dh1-3col .dh1-wide { grid-column: 1 / -1; }
          }
          @media (max-width: 720px) {
            .dh1-3col { grid-template-columns: 1fr; }
            .dh1-3col .dh1-wide { grid-column: auto; }
          }
        `}</style>
        <div className="dh1-3col">
          {/* Phần 1: Tóm tắt cách tính + Phân bổ 3 bên (xếp dọc) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Tóm tắt cách tính */}
            <div style={{ background: '#FFF9EC', border: '1px solid #F1E2BD', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '7px 11px', background: '#FBEFCF', color: '#8A5A12', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #F1E2BD' }}>📘 Tóm tắt cách tính</div>
              <div style={{ padding: '9px 11px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--txt2)' }}>
                <div style={{ marginBottom: 4 }}><b style={{ color: '#8A5A12' }}>① Sơn An thu hộ</b> = tổng tiền thu từ khách ki ốt + công ty (theo đơn giá cấu hình từng khách).</div>
                <div style={{ marginBottom: 4 }}><b style={{ color: '#8C1F1F' }}>② Sơn An chịu phí EVN</b> = kWh ki ốt (15% CĐ/35% TĐ/50% BT) + kWh công ty thực × đơn giá EVN × VAT.</div>
                <div style={{ marginBottom: 4 }}><b style={{ color: '#5A7A2A' }}>③ Chênh lệch Sơn An hưởng</b> = ① − ② (dương = lời, âm = lỗ so EVN).</div>
                <div><b style={{ color: 'var(--navy)' }}>④ BQT chịu</b> = tổng đồng hồ 1 − ②. <b>② + ④ = tổng đồng hồ 1.</b></div>
              </div>
            </div>

            {/* Phân bổ 4 chỉ tiêu tháng hiện tại */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <div style={{ padding: '6px 11px', background: '#1C3557', color: '#fff', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>② Phân bổ chi phí (tháng {month})</div>
              <div style={{ padding: '9px 11px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: '#F8FAFC', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.02em' }}>Tổng đồng hồ 1</span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{fmt(split.meterTotal)} đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: '#FFF4E0', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 10, color: '#8A5A12', textTransform: 'uppercase', letterSpacing: '.02em' }}>① Thu hộ từ khách</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#8A5A12', whiteSpace: 'nowrap' }}>{fmt(split3.sonanRevenue)} đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: '#FDECEC', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 10, color: '#8C1F1F', textTransform: 'uppercase', letterSpacing: '.02em' }}>② Chịu phí EVN</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#8C1F1F', whiteSpace: 'nowrap' }}>{fmt(split3.sonanEVNCost)} đ <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>({evnCostPct}%)</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: split3.sonanProfit >= 0 ? '#F0F8EC' : '#FDECEC', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 10, color: '#5A7A2A', textTransform: 'uppercase', letterSpacing: '.02em' }}>③ Chênh lệch hưởng</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: split3.sonanProfit >= 0 ? '#3A7A1A' : '#8C1F1F', whiteSpace: 'nowrap' }}>{split3.sonanProfit >= 0 ? '+' : ''}{fmt(split3.sonanProfit)} đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: '#E0EDFA', borderRadius: 8, padding: '7px 10px' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.02em' }}>④ BQT chịu</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{fmt(split3.bqtBorne)} đ <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>({bqtBornePct}%)</span></span>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border3)', marginTop: 'auto' }} title={`Sơn An chịu phí EVN ${evnCostPct}% · BQT chịu ${bqtBornePct}%`}>
                  <div style={{ width: `${evnCostPct}%`, background: '#C0392B' }} />
                  <div style={{ width: `${bqtBornePct}%`, background: '#1C3557' }} />
                </div>
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#C0392B', marginRight: 3 }} />SA chịu phí EVN</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#1C3557', marginRight: 3 }} />BQT chịu</span>
                </div>
              </div>
            </div>
          </div>

          {/* Phần 2: Bảng Sơn An thu hộ (khách thuê) theo khung giờ */}
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '6px 11px', background: '#8A5A12', color: '#fff', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>② Phí Sơn An chịu theo đồng hồ điện — theo khung giờ</div>
            <div style={{ padding: '8px 11px', flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5 }}>
                Chung 3 tầng TM: <b style={{ color: 'var(--navy)' }}>{fmtKwh(split.commonPoolKwh)} kWh</b>
                {split.companies.length > 0 && <> · Công ty: {split.companies.map(co => `${co.customer.name} ${fmtKwh(co.total)}`).join(', ')} kWh</>}
              </div>
              <div className="dn-scroll">
              <table className="dn-table dh1-satable" style={{ fontSize: 10.5 }}>
                <thead><tr>
                  <th>Khung giờ</th>
                  <th style={{ textAlign: 'right' }}>Tổng kWh</th><th style={{ textAlign: 'right' }}>Đơn giá</th><th style={{ textAlign: 'right' }}>Thành tiền</th>
                </tr></thead>
                <tbody>
                  {split.bands.map(b => (
                    <tr key={b.key}>
                      <td>{BAND_LABELS[b.key]}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKwh(b.kwh)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtDec(b.price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3} style={{ textAlign: 'right', color: 'var(--muted)' }}>Chưa VAT</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(split.sonAnSubtotal)}</td></tr>
                  <tr><td colSpan={3} style={{ textAlign: 'right', color: 'var(--muted)' }}>VAT ({split.vatPercent || 0}%)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(split.sonAnVat)}</td></tr>
                  <tr style={{ background: '#FFF4E0' }}><td colSpan={3} style={{ textAlign: 'right', fontWeight: 800, color: '#8A5A12' }}>Sơn An thu hộ</td><td style={{ textAlign: 'right', fontWeight: 800, color: '#8A5A12' }}>{fmt(split.sonAnTotal)} đ</td></tr>
                </tfoot>
              </table>
              </div>
            </div>
          </div>

          {/* Phần 3: Thống kê từng tháng (chọn kWh / Tiền) — rộng nhất, full width trên iPad */}
          <div className="dh1-wide" style={{ display: 'flex' }}>
            <Dh1MonthlyTable reading={reading} readings={readings} month={month} customers={customers} usages={usages} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Đồng hồ nước: ghi chỉ số nước từng tầng (mỗi tầng 3 đồng hồ · cũ → mới ⇒ tiêu thụ) ──
function WaterFloorSection({ readings, month, customers, floorReadings, setFloorReadings, onSave, saving, savedAt }: {
  readings: MeterReading[]; month: string; customers: Customer[]
  floorReadings: FloorReading[]; setFloorReadings: (v: FloorReading[]) => void
  onSave: () => void; saving: boolean; savedAt: string | null
}) {
  const groupSuggestions = Array.from(new Set([
    ...customers.filter(c => customerHasService(c, 'nuoc') && c.active).map(c => (c.group || '').trim()).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, 'vi'))

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const moveFloor = (from: number | null, to: number) => {
    if (from === null || from === to) return
    const arr = [...floorReadings]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    setFloorReadings(arr)
  }
  const setFloorGroup = (i: number, group: string) => setFloorReadings(floorReadings.map((f, idx) => idx === i ? { ...f, group } : f))
  const setFloorBand = (i: number, k: FloorBandKey, field: 'indexOld' | 'indexNew', v: number) =>
    setFloorReadings(floorReadings.map((f, idx) => idx === i ? { ...f, bands: { ...f.bands, [k]: { ...f.bands[k], [field]: v } } } : f))
  const addFloor = () => setFloorReadings([...floorReadings, { group: '', bands: emptyFloorBands() }])
  const removeFloor = (i: number) => setFloorReadings(floorReadings.filter((_, idx) => idx !== i))

  // Tổng tiêu thụ toàn nhà + tổng theo từng đồng hồ (cộng các tầng)
  const grandTotal = floorReadings.reduce((s, f) => s + waterFloorTotal(f), 0)
  const perMeterTotal = (k: FloorBandKey) => floorReadings.reduce((s, f) => s + floorBandKwh(f.bands[k]), 0)

  return (
    <div style={{ marginTop: 20, border: '1px solid var(--border3)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: '#1C3557', color: '#fff', padding: '9px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Ghi chỉ số nước theo tầng — đồng hồ nước
      </div>

      <div style={{ padding: 14 }}>
        {/* a. Hướng dẫn */}
        <div style={{ background: '#EEF3FA', border: '1px solid #D0DCE8', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.6, color: 'var(--txt2)' }}>
          <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>a. Cách ghi chỉ số nước</div>
          <div>① Mỗi tầng có tối đa <b>3 đồng hồ nước</b>. Nhập <b>chỉ số cũ</b> &amp; <b>chỉ số mới</b> ⇒ <b>tiêu thụ (m³)</b> = mới − cũ.</div>
          <div>② Chỉ số cũ tháng này tự điền = chỉ số mới cùng đồng hồ của tháng trước (có thể sửa tay).</div>
          <div>③ <b>Tổng tiêu thụ tầng</b> = cộng 3 đồng hồ; <b>tổng toàn nhà</b> = cộng các tầng. Tầng nào không dùng thì để trống/0.</div>
        </div>

        {/* b. Các card tầng + card tổng hợp */}
        <div className="dn-col-title">
          <span>b. Nhập chỉ số nước từng tầng ⇒ tiêu thụ (m³)</span>
          <button className="btn-ghost" style={{ textTransform: 'none', fontWeight: 600 }} onClick={addFloor}>+ Thêm tầng</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 12 }}>
          {floorReadings.map((f, i) => (
            <div key={i}
              onDragOver={e => { if (dragIdx !== null && dragIdx !== i) e.preventDefault() }}
              onDrop={e => { e.preventDefault(); moveFloor(dragIdx, i); setDragIdx(null) }}
              style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', border: dragIdx !== null && dragIdx !== i ? '1px dashed var(--navy3)' : '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff', opacity: dragIdx === i ? 0.45 : 1, transition: 'opacity .12s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', background: '#EEF3FA', borderBottom: '1px solid var(--border3)' }}>
                {floorReadings.length > 1 && (
                  <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} title="Kéo để đổi vị trí tầng"
                    style={{ flexShrink: 0, cursor: 'grab', color: 'var(--muted2)', fontSize: 14, lineHeight: 1, userSelect: 'none' }}>⠿</span>
                )}
                <input className="dn-input" list="dn-water-groups" style={{ flex: 1, fontWeight: 600 }} value={f.group} placeholder="Tên tầng / địa điểm" onChange={e => setFloorGroup(i, e.target.value)} />
                {floorReadings.length > 1 && (
                  <button onClick={() => removeFloor(i)} title="Xoá tầng này" style={{ flexShrink: 0, width: 22, height: 22, padding: 0, lineHeight: '20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', border: '1px solid #FECACA', borderRadius: 6, background: '#fff', color: '#DC2626' }}>×</button>
                )}
              </div>
              <div style={{ padding: '9px 10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 52px', gap: 4, alignItems: 'center', fontSize: 9.5, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 3 }}>
                  <span>Đồng hồ</span><span style={{ textAlign: 'right' }}>CS cũ</span><span style={{ textAlign: 'right' }}>CS mới</span><span style={{ textAlign: 'right' }}>Tiêu thụ</span>
                </div>
                {WATER_METER_KEYS.map(k => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 52px', gap: 4, alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{WATER_METER_LABELS[k]}</span>
                    <NumberInput style={{ textAlign: 'right', padding: '5px 5px' }} placeholder="0" value={f.bands[k].indexOld} onValueChange={v => setFloorBand(i, k, 'indexOld', v)} />
                    <NumberInput style={{ textAlign: 'right', padding: '5px 5px' }} placeholder="0" value={f.bands[k].indexNew} onValueChange={v => setFloorBand(i, k, 'indexNew', v)} />
                    <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>{fmtKwh(floorBandKwh(f.bands[k]))}</span>
                  </div>
                ))}
                <div style={{ marginTop: 'auto', borderTop: '1px dashed var(--border3)', paddingTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, background: '#E0EDFA', borderRadius: 7, padding: '6px 9px' }}>
                    <span style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.02em' }}>Tổng tiêu thụ tầng</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{fmtKwh(waterFloorTotal(f))} <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>m³</span></span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Card tổng hợp */}
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '7px 9px', background: '#1C3557', color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Tổng hợp tiêu thụ (m³)</div>
            <div style={{ padding: '9px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {WATER_METER_KEYS.map(k => (
                <div key={k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, background: '#F8FAFC', borderRadius: 7, padding: '6px 9px' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.02em' }}>{WATER_METER_LABELS[k]} (cộng tầng)</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{fmtKwh(perMeterTotal(k))} <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>m³</span></span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, background: '#E0EDFA', borderRadius: 7, padding: '6px 9px', marginTop: 'auto' }}>
                <span style={{ fontSize: 10.5, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.02em', fontWeight: 700 }}>Tổng toàn nhà</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{fmtKwh(grandTotal)} <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>m³</span></span>
              </div>
            </div>
          </div>
        </div>
        <datalist id="dn-water-groups">{groupSuggestions.map(g => <option key={g} value={g} />)}</datalist>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button className="btn-primary" style={{ background: '#D4A64A' }} onClick={onSave} disabled={saving}>{saving ? 'Đang lưu…' : '💾 Lưu tháng này'}</button>
          {savedAt && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>✓ Đã lưu</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4 }}>
          * Bấm “💾 Lưu tháng này” để lưu số ghi nước từng tầng cho tháng {month}. (Cũng được lưu chung khi bấm “Lưu chỉ số” ở Bảng 1.)
        </div>

        {/* c. Thống kê tiêu thụ nước theo tháng */}
        <div style={{ marginTop: 18 }}>
          <WaterFloorHistoryTable readings={readings} month={month} floorReadings={floorReadings} />
        </div>
      </div>
    </div>
  )
}

// Thống kê tiêu thụ nước 12 tháng gần nhất — cột tháng hiện tại dùng số liệu live.
function WaterFloorHistoryTable({ readings, month, floorReadings }: {
  readings: MeterReading[]; month: string; floorReadings: FloorReading[]
}) {
  const [showFloors, setShowFloors] = useState(false)

  const saved = readings.filter(r => r.meterId === 3).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
  const liveFloors = floorReadings.map(normalizeFloor)
  const hasCurrent = saved.some(r => r.month === month)
  const months = (hasCurrent ? saved.map(r => r.month === month ? { ...r, floorReadings } : r)
    : [...saved, { meterId: 3 as MeterId, month, floorReadings } as MeterReading].sort((a, b) => a.month.localeCompare(b.month)))

  if (months.length === 0) return null

  const monthFloors = months.map(r => ({
    month: r.month, isCur: r.month === month,
    floors: r.month === month ? liveFloors : (r.floorReadings ?? []).map(normalizeFloor),
    mainKwh: r.bands?.toanThoiGian?.kwh ?? 0,
  }))
  const sumFloors = (fl: FloorReading[]) => fl.reduce((s, f) => s + waterFloorTotal(f), 0)

  // Danh sách tầng xuất hiện (có ít nhất 1 chỉ số ≠ 0)
  const allGroups: string[] = []
  monthFloors.forEach(mf => mf.floors.forEach(f => { const g = (f.group || '').trim(); if (g && !allGroups.includes(g)) allGroups.push(g) }))
  const groupOrder = allGroups.filter(g => monthFloors.some(mf => {
    const f = mf.floors.find(x => (x.group || '').trim() === g)
    return !!f && WATER_METER_KEYS.some(k => (f.bands[k]?.indexOld || 0) !== 0 || (f.bands[k]?.indexNew || 0) !== 0)
  }))
  const floorOf = (mf: typeof monthFloors[number], g: string) => mf.floors.find(f => (f.group || '').trim() === g)

  return (
    <>
      <div className="dn-col-title"><span>c. Thống kê tiêu thụ nước theo tháng</span></div>
      <div className="dn-scroll">
        <table className="dn-table" style={{ fontSize: 11 }}>
          <thead><tr>
            <th>Chỉ tiêu</th>
            {monthFloors.map(mf => <th key={mf.month} style={{ textAlign: 'right', background: mf.isCur ? '#E0EDFA' : undefined }}>{mf.month}{mf.isCur ? ' ★' : ''}</th>)}
          </tr></thead>
          <tbody>
            <tr style={{ fontSize: 10 }}>
              <td style={{ fontWeight: 400 }}>
                {groupOrder.length > 0 && (
                  <button onClick={() => setShowFloors(v => !v)} title={showFloors ? 'Thu gọn chi tiết tầng' : 'Xem chi tiết từng tầng × đồng hồ'}
                    style={{ width: 16, height: 16, marginRight: 6, padding: 0, lineHeight: '14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border3)', borderRadius: 4, background: '#fff', color: 'var(--navy)' }}>
                    {showFloors ? '−' : '+'}
                  </button>
                )}
                Tổng tiêu thụ các tầng (m³)
              </td>
              {monthFloors.map(mf => <td key={mf.month} style={{ textAlign: 'right', background: mf.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>{fmtKwh(sumFloors(mf.floors))}</td>)}
            </tr>
            {showFloors && groupOrder.map(g => (
              <Fragment key={g}>
                <tr style={{ fontSize: 9.5 }}>
                  <td style={{ paddingLeft: 26, fontWeight: 700, color: 'var(--navy)' }}>{g} — tổng</td>
                  {monthFloors.map(mf => {
                    const f = floorOf(mf, g)
                    return <td key={mf.month} style={{ textAlign: 'right', fontWeight: 600, background: mf.isCur ? '#E0EDFA' : '#F5F8FC', whiteSpace: 'nowrap' }}>{fmtKwh(f ? waterFloorTotal(f) : 0)}</td>
                  })}
                </tr>
                {WATER_METER_KEYS.map(k => (
                  <tr key={`${g}-${k}`} style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                    <td style={{ paddingLeft: 42 }}>{WATER_METER_LABELS[k]}</td>
                    {monthFloors.map(mf => {
                      const f = floorOf(mf, g)
                      return <td key={mf.month} style={{ textAlign: 'right', background: mf.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>{fmtKwh(f ? floorBandKwh(f.bands[k]) : 0)}</td>
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr style={{ fontSize: 10 }}><td style={{ fontWeight: 400 }}>Đồng hồ nước chính (m³)</td>{monthFloors.map(mf => <td key={mf.month} style={{ textAlign: 'right', background: mf.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>{fmtKwh(mf.mainKwh)}</td>)}</tr>
            <tr><td style={{ fontWeight: 600, color: 'var(--navy)' }}>Chênh lệch (chính − tầng)</td>{monthFloors.map(mf => {
              const d = mf.mainKwh - sumFloors(mf.floors)
              return <td key={mf.month} style={{ textAlign: 'right', fontWeight: 700, color: d < 0 ? '#DC2626' : 'var(--navy)', background: mf.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>{fmtKwh(d)}</td>
            })}</tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

// Thống kê 3 bên 12 tháng gần nhất (1 bảng) — nút chọn xem theo kWh hoặc Tiền. Cột tháng hiện tại dùng số liệu live.
function Dh1MonthlyTable({ reading, readings, month, customers, usages }: {
  reading: MeterReading; readings: MeterReading[]; month: string; customers: Customer[]; usages: CustomerUsage[]
}) {
  const [mode, setMode] = useState<'tien' | 'kwh'>('tien')

  // 12 tháng gần nhất của đồng hồ 1, cũ → mới; tháng hiện tại thay bằng số liệu live (reading)
  const saved = readings.filter(r => r.meterId === 1).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
  const hasCurrent = saved.some(r => r.month === month)
  const months = hasCurrent ? saved.map(r => r.month === month ? reading : r) : [...saved, reading].sort((a, b) => a.month.localeCompare(b.month))
  if (months.length === 0) return null

  const calcs = months.map(r => {
    const c = computeLightingSplit(r, customers, usages, r.bqtRatio ?? DEFAULT_BQT_RATIO)
    return { month: r.month, isCur: r.month === month, s: splitDh1ThreeWay(c, r, customers, usages) }
  })

  const isKwh = mode === 'kwh'
  const fmtVal = isKwh ? fmtKwh : fmt
  const totalGet = (s: Dh1Split3) => isKwh ? s.totalKwh : s.total

  // MoM trên dòng tổng so với tháng liền trước
  const delta = (i: number): { pct: number; up: boolean } | null => {
    if (i === 0) return null
    const prev = totalGet(calcs[i - 1].s), cur = totalGet(calcs[i].s)
    if (prev === 0 || Math.abs((cur - prev) / prev * 100) < 0.05) return null
    return { pct: (cur - prev) / prev * 100, up: cur > prev }
  }

  type Row = { label: string; get: (s: Dh1Split3) => number; bold?: boolean; bg?: string; color?: string; share?: boolean }
  const rows: Row[] = isKwh
    ? [
        { label: 'Chung 3 tầng TM (kWh)', get: s => s.commonKwh },
        { label: 'Công ty đồng hồ riêng (kWh)', get: s => s.companyKwh },
        { label: '① Khách thuê tổng (kWh)', get: s => s.tenantKwh, bold: true, bg: '#FFF9EC', color: '#8A5A12', share: true },
        { label: '④ BQT – cư dân đo đếm (kWh)', get: s => s.bqtKwh, bold: true, bg: '#E0EDFA', color: 'var(--navy)', share: true },
      ]
    : [
        { label: '① Sơn An thu hộ từ khách (đ)', get: s => s.sonanRevenue, bold: true, bg: '#FFF9EC', color: '#8A5A12', share: true },
        { label: '② Sơn An chịu phí EVN (đ)', get: s => s.sonanEVNCost, bold: true, bg: '#FDECEC', color: '#8C1F1F', share: true },
        { label: '③ Chênh lệch SA hưởng (đ)', get: s => s.sonanProfit, bold: true, bg: '#F0F8EC', color: '#3A7A1A' },
        { label: '④ BQT chịu (đ)', get: s => s.bqtBorne, bold: true, bg: '#E0EDFA', color: 'var(--navy)', share: true },
      ]

  const tabBtn = (m: 'tien' | 'kwh', label: string) => (
    <button onClick={() => setMode(m)} style={{
      cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 7,
      border: mode === m ? '1px solid var(--navy)' : '1px solid var(--border2)',
      background: mode === m ? 'var(--navy)' : '#fff', color: mode === m ? '#fff' : 'var(--muted)',
    }}>{label}</button>
  )

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '6px 12px', background: '#EEF3FA', borderBottom: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#4B6A8A', textTransform: 'uppercase', letterSpacing: '.04em' }}>📊 Thống kê từng tháng — Thu hộ · Chịu phí EVN · Chênh lệch · BQT chịu (đồng hồ điện 1)</span>
        <span style={{ display: 'flex', gap: 4 }}>{tabBtn('kwh', 'kWh')}{tabBtn('tien', 'Tiền')}</span>
      </div>
      <div style={{ padding: '8px 12px', flex: 1 }}>
        <div className="dn-scroll">
          <table className="dn-table" style={{ fontSize: 11 }}>
            <thead><tr>
              <th>Chỉ tiêu ({isKwh ? 'kWh' : 'đ'})</th>
              {calcs.map(x => <th key={x.month} style={{ textAlign: 'right', background: x.isCur ? '#E0EDFA' : undefined }}>{x.month}{x.isCur ? ' ★' : ''}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td style={{ fontWeight: row.bold ? 600 : 400, color: row.color, fontSize: row.bold ? undefined : 10 }}>{row.label}</td>
                  {calcs.map(x => {
                    const val = row.get(x.s)
                    const d = totalGet(x.s)
                    const share = row.share && d > 0 ? Math.round(val / d * 100) : null
                    return (
                      <td key={x.month} style={{ textAlign: 'right', fontWeight: row.bold ? 700 : undefined, color: row.color, background: x.isCur ? '#E0EDFA' : row.bg, whiteSpace: 'nowrap' }}>
                        {fmtVal(val)}
                        {share !== null && <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)' }}>{share}%</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="dn-sum-top">
                <td style={{ fontWeight: 700, color: 'var(--navy)' }}>{isKwh ? 'Tổng kWh đồng hồ 1' : 'Tổng tiền đồng hồ 1 (đ)'}</td>
                {calcs.map((x, i) => {
                  const d = delta(i)
                  return (
                    <td key={x.month} style={{ textAlign: 'right', fontWeight: 700, background: x.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>
                      {fmtVal(totalGet(x.s))}
                      {d && <div style={{ fontSize: 9, fontWeight: 700, color: d.up ? '#DC2626' : 'var(--green)' }}>{d.up ? '▲' : '▼'} {Math.abs(d.pct).toFixed(1)}%</div>}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Đồng hồ 2: phân bổ tiền điện máy lạnh trung tâm cho khách + Sơn An Group chịu (phần còn lại) ──
function AcSplitSection({ reading, readings, month, customers, usages }: {
  reading: MeterReading; readings: MeterReading[]; month: string; customers: Customer[]; usages: CustomerUsage[]
}) {
  const service = METER_SERVICE[2]  // 'dh2'
  const alloc = meterAllocation(reading, customers, usages)
  const isRemainder = (c: Customer) => subFor(c, service)?.chargeType === 'remainder'
  const pricedRows = alloc.rows.filter(r => !isRemainder(r.customer))
  const chargeTypeLabel = (c: Customer) => CHARGE_TYPE_LABELS[subFor(c, service)?.chargeType ?? 'flat_vat_incl']

  // Lịch sử 12 tháng: Tổng đồng hồ / Σ khách / Sơn An Group chịu
  const saved = readings.filter(r => r.meterId === 2).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12).sort((a, b) => a.month.localeCompare(b.month))
  const hasCur = saved.some(r => r.month === month)
  const months = hasCur ? saved.map(r => r.month === month ? reading : r) : [...saved, reading].sort((a, b) => a.month.localeCompare(b.month))
  const hist = months.map(r => { const a = meterAllocation(r, customers, usages); return { month: r.month, isCur: r.month === month, total: a.total, allocated: a.allocated, remainder: a.remainderTotal } })

  const allocPct = alloc.total > 0 ? Math.round(alloc.allocated / alloc.total * 100) : 0
  const remPct = Math.max(0, 100 - allocPct)
  const cardHead = { padding: '6px 11px', background: '#EEF3FA', borderBottom: '1px solid var(--border3)', fontSize: 10.5, fontWeight: 800, color: '#4B6A8A', textTransform: 'uppercase' as const, letterSpacing: '.04em' }
  const kpi = (label: string, val: string, sub: string, color: string, bg: string) => (
    <div style={{ background: bg, borderRadius: 8, padding: '7px 10px' }}>
      <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.02em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, whiteSpace: 'nowrap' }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ marginTop: 20, border: '1px solid var(--border3)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: '#1C3557', color: '#fff', padding: '9px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Phân bổ tiền điện máy lạnh trung tâm (đồng hồ điện 2)
      </div>
      <div style={{ padding: 14 }}>
        {/* 3 card ngang: Tóm tắt · Phân bổ tháng · Tỷ trọng — người dùng tự kéo-thả & co giãn (DashArea) */}
        <div style={{ marginBottom: 14 }}>
        <DashArea gridKey="dh2-ketqua" minWidth={210}>
          {/* Card 1: Tóm tắt cách tính */}
          <div key="tomtat" style={{ height: '100%', background: '#FFF9EC', border: '1px solid #F1E2BD', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardHead, background: '#FBEFCF', color: '#8A5A12', borderColor: '#F1E2BD' }}>📘 Tóm tắt cách tính</div>
            <div style={{ padding: '9px 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--txt2)' }}>
              <div><b>Tổng tiền đồng hồ 2</b> (máy lạnh trung tâm, từ điện lực + VAT) phân bổ cho khách dùng máy lạnh:</div>
              <div style={{ margin: '3px 0 3px 4px' }}>
                <div>• Khách <b>giá cố định</b> (VIN, D01): sản lượng × đơn giá.</div>
                <div>• Khách <b>theo khung giờ</b> (OBE — chưa VAT): kWh từng khung × đơn giá + VAT.</div>
                <div>• <b style={{ color: 'var(--navy)' }}>Sơn An Group chịu</b> = Tổng − tổng đã phân bổ khách (phần còn lại).</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Thêm/sửa khách ở tab <b>Khách hàng</b> (dịch vụ “{METER_LABELS[2]}”).</div>
            </div>
          </div>

          {/* Card 2: Phân bổ tháng hiện tại */}
          <div key="phanbo" style={{ height: '100%', border: '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={cardHead}>Phân bổ tháng {month}</div>
            <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pricedRows.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>Chưa có khách nào gán cho đồng hồ máy lạnh.</div>}
              {pricedRows.map(r => (
                <div key={r.customer.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, borderBottom: '1px dashed var(--border)', paddingBottom: 4 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.customer.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted2)' }}>{chargeTypeLabel(r.customer)}</div>
                  </div>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmt(r.amount)} đ</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: '#FFF4E0', borderRadius: 7, padding: '5px 8px' }}>
                <span style={{ fontWeight: 700, color: '#8A5A12', fontSize: 12 }}>Sơn An Group chịu</span>
                <span style={{ fontWeight: 800, color: '#8A5A12', whiteSpace: 'nowrap' }}>{fmt(alloc.remainderTotal)} đ</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, background: '#E0EDFA', borderRadius: 7, padding: '6px 8px', marginTop: 'auto' }}>
                <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 11.5, textTransform: 'uppercase' }}>Tổng đồng hồ 2</span>
                <span style={{ fontWeight: 800, color: 'var(--navy)', whiteSpace: 'nowrap', fontSize: 14 }}>{fmt(alloc.total)} đ</span>
              </div>
            </div>
          </div>

          {/* Card 3: Tỷ trọng tháng hiện tại */}
          <div key="tytrong" style={{ height: '100%', border: '1px solid var(--border3)', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={cardHead}>Tỷ trọng tháng {month}</div>
            <div style={{ padding: '9px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {kpi('Tổng tiền đồng hồ', `${fmt(alloc.total)} đ`, '', 'var(--navy)', '#F8FAFC')}
              {kpi('Đã phân bổ khách', `${fmt(alloc.allocated)} đ`, `${allocPct}% tổng`, '#1F6B3D', '#EAF6EE')}
              {kpi('Sơn An Group chịu', `${fmt(alloc.remainderTotal)} đ`, `${remPct}% tổng`, '#8A5A12', '#FFF4E0')}
              {/* Thanh tỷ trọng */}
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border3)' }} title={`Khách ${allocPct}% · Sơn An ${remPct}%`}>
                <div style={{ width: `${allocPct}%`, background: '#1F6B3D' }} />
                <div style={{ width: `${remPct}%`, background: '#D4A64A' }} />
              </div>
            </div>
          </div>
        </DashArea>
        </div>

        {/* Thống kê theo tháng (full width) */}
        <div className="dn-col-title"><span>Thống kê phân bổ theo tháng</span></div>
        <div className="dn-scroll">
          <table className="dn-table" style={{ fontSize: 11 }}>
            <thead><tr>
              <th>Chỉ tiêu</th>
              {hist.map(h => <th key={h.month} style={{ textAlign: 'right', background: h.isCur ? '#E0EDFA' : undefined }}>{h.month}{h.isCur ? ' ★' : ''}</th>)}
            </tr></thead>
            <tbody>
              <tr style={{ fontSize: 10 }}><td style={{ fontWeight: 400 }}>Tổng tiền đồng hồ (đ)</td>{hist.map(h => <td key={h.month} style={{ textAlign: 'right', background: h.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>{fmt(h.total)}</td>)}</tr>
              <tr style={{ fontSize: 10 }}><td style={{ fontWeight: 400 }}>Đã phân bổ khách (đ)</td>{hist.map(h => <td key={h.month} style={{ textAlign: 'right', background: h.isCur ? '#E0EDFA' : undefined, whiteSpace: 'nowrap' }}>{fmt(h.allocated)}</td>)}</tr>
              <tr style={{ background: '#E0EDFA' }}><td style={{ fontWeight: 700, color: '#8A5A12' }}>Sơn An Group chịu (đ)</td>{hist.map(h => <td key={h.month} style={{ textAlign: 'right', fontWeight: 700, background: '#E0EDFA', whiteSpace: 'nowrap' }}>{fmt(h.remainder)}</td>)}</tr>
            </tbody>
          </table>
        </div>
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
  const service = METER_SERVICE[meterId]
  const histMonths = readings.filter(r => r.meterId === meterId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12)
    .sort((a, b) => a.month.localeCompare(b.month))
  const meterCustomers = customers.filter(c => customerHasService(c, service) && isActiveInMonth(c, month))
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
                usage={findUsage(usages, c.id, service, month, primaryService(c))}
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
  const service = METER_SERVICE[reading.meterId]
  const primary = primaryService(c)
  const sub = subFor(c, service)!            // luôn tồn tại vì đã lọc theo customerHasService
  const ct = sub.chargeType
  const prevUsage = useMemo(() => findUsage(allUsages, c.id, service, prevMonthStr(month), primary), [allUsages, c.id, service, month, primary])
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
    const id = `${c.id}_${service}_${month}`
    await saveUsage({ id, customerId: c.id, service, month, totalUnit, bandsKwh, indexOld, indexNew, bandsIndexOld, bandsIndexNew, createdAt: usage?.createdAt || now, updatedAt: now })
    setSaving(false)
  }

  const draftUsage: CustomerUsage = { id: '', customerId: c.id, service, month, totalUnit, bandsKwh, indexOld, indexNew, bandsIndexOld, bandsIndexNew, createdAt: '', updatedAt: '' }
  const charge = customerCharge(c, draftUsage, reading)

  const usageOf = (m: string) => findUsage(allUsages, c.id, service, m, primaryService(c))
  const usageUnit = (u: CustomerUsage | undefined): number | null => {
    if (ct === 'flat_vat_incl') return u?.totalUnit ?? 0
    if (ct === 'timeband_excl_vat') { const b = u?.bandsKwh ?? {}; return (b.caoDiem ?? 0) + (b.thapDiem ?? 0) + (b.binhThuong ?? 0) }
    return null
  }

  const monthCells = months.map(r => {
    const isCurrent = r.month === month
    const u = isCurrent ? draftUsage : usageOf(r.month)
    const sl = usageUnit(u)
    const tt = isCurrent ? charge : customerCharge(c, u, readingByMonth.get(r.month))
    const priceLabel = (() => {
      if (ct === 'flat_vat_incl') {
        const p = resolvePrice(sub.flatPriceHistory, sub.flatUnitPrice ?? 0, r.month)
        return `${fmtKwh(sl ?? 0)} × ${fmtDec(p)}`
      }
      if (ct === 'fixed_area') {
        const p = resolvePrice(sub.areaPriceHistory, sub.pricePerM2 ?? 0, r.month)
        return `${sub.areaM2 ?? 0} m² × ${fmtDec(p)}`
      }
      return null
    })()

    // Chi tiết khung giờ cho timeband
    const tbDetail = (() => {
      if (ct !== 'timeband_excl_vat') return null
      const mU = isCurrent ? draftUsage : usageOf(r.month)
      const mBands = mU?.bandsKwh ?? {}
      const mPt = resolveTimebandPoint(sub.timebandPriceHistory, r.month)
      const mReading = readingByMonth.get(r.month)
      const lines = (['caoDiem', 'thapDiem', 'binhThuong'] as const).map(k => {
        const kw = mBands[k] ?? 0
        const custP = mPt?.[k] ?? 0
        const price = custP > 0 ? custP : (mReading?.bands[k].donGia ?? 0)
        return { label: BAND_LABELS[k], kw, price, amt: kw * price }
      })
      const subt = lines.reduce((s, l) => s + l.amt, 0)
      const vp = mReading?.vatPercent ?? 8
      const vat = subt * vp / 100
      return { lines, sub: subt, vat, total: subt + vat, vatPercent: vp }
    })()

    return (
      <td key={r.month} style={{ textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', background: isCurrent ? '#E0EDFA' : undefined }}>
        {tbDetail ? (
          <>
            {tbDetail.lines.map(l => (
              <div key={l.label} style={{ fontSize: 10, color: 'var(--muted2)' }}>{l.label}: {fmtKwh(l.kw)} × {fmtDec(l.price)}</div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>Chưa VAT: {fmt(tbDetail.sub)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>VAT ({tbDetail.vatPercent}%): {fmt(tbDetail.vat)}</div>
            <div style={{ fontSize: 11, color: isCurrent ? 'var(--navy)' : 'var(--muted)', fontWeight: isCurrent ? 600 : undefined }}>{fmt(tbDetail.total)} đ</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: isCurrent ? 700 : undefined }}>{sl == null ? '—' : fmtKwh(sl)}</div>
            {priceLabel && <div style={{ fontSize: 10, color: 'var(--muted2)' }}>{priceLabel}</div>}
            <div style={{ fontSize: 11, color: isCurrent ? 'var(--navy)' : 'var(--muted)', fontWeight: isCurrent ? 600 : undefined }}>{fmt(tt)} đ</div>
          </>
        )}
      </td>
    )
  })

  if (ct === 'fixed_area') {
    const price = resolvePrice(sub.areaPriceHistory, sub.pricePerM2 ?? 0, month)
    return (
      <tr>
        <td className="dn-sticky-col" style={{ fontWeight: 600 }}>{c.name}</td>
        <td className="dn-sticky-col dn-sticky-input"><span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{sub.areaM2 ?? 0} m² × {fmtDec(price)} đ/m²</span></td>
        <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right' }}><b style={{ color: 'var(--navy)' }}>{fmt(charge)} đ</b></td>
        <td className="dn-sticky-col dn-sticky-btn"></td>
        {monthCells}
      </tr>
    )
  }
  if (ct === 'remainder') {
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

  const flatPrice = resolvePrice(sub.flatPriceHistory, sub.flatUnitPrice ?? 0, month)

  if (ct === 'flat_vat_incl') {
    return (
      <tr>
        <td className="dn-sticky-col" style={{ fontWeight: 600 }}>{c.name}</td>
        <td className="dn-sticky-col dn-sticky-input">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Cũ:</span>
            <NumberInput style={{ width: 80 }} placeholder="Chỉ số cũ" value={indexOld} onValueChange={setIndexOld} />
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Mới:</span>
            <NumberInput style={{ width: 80 }} placeholder="Chỉ số mới" value={indexNew} onValueChange={setIndexNew} />
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>→ SL: {fmtKwh(totalUnit)} × {fmtDec(flatPrice)}</span>
          </div>
        </td>
        <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right' }}><b style={{ color: 'var(--navy)' }}>{fmt(charge)} đ</b></td>
        <td className="dn-sticky-col dn-sticky-btn"><button className="btn-ghost" onClick={save} disabled={saving}>{saving ? '…' : 'Lưu'}</button></td>
        {monthCells}
      </tr>
    )
  }

  // timeband_excl_vat
  const tbPt = resolveTimebandPoint(sub.timebandPriceHistory, month)
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
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>→ {fmtKwh(bandsKwh[k] ?? 0)} × {fmtDec(tbPrices[i])} = {fmt((bandsKwh[k] ?? 0) * tbPrices[i])}</span>
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
