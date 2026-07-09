'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Customer, ChargeType, PricePoint, TimebandPricePoint,
  ServiceId, ServiceSubscription, SERVICE_IDS, SERVICE_METER, serviceLabel, customerServices,
  CHARGE_TYPE_LABELS, resolvePrice, resolveTimebandPoint, isActiveInMonth,
} from '@/lib/dien-nuoc-types'
import { saveCustomer, deleteCustomer } from '@/lib/dien-nuoc-store'
import { exportKhachHang } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'

const fmtDec = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 20 })  // giữ phần lẻ cho đơn giá

// Thông số giá của 1 dịch vụ (để hiển thị & double-check nhanh ở cột THÔNG SỐ).
function subPriceInfo(s: ServiceSubscription) {
  const mocGia = (n: number) => n > 1 ? <span style={{ color: 'var(--gold2)' }}> · {n} mốc giá</span> : null
  if (s.service === 'phiql') {
    const n = s.flatPriceHistory?.filter(x => x.price > 0).length ?? 0
    return <>{fmtDec(resolvePrice(s.flatPriceHistory, s.flatUnitPrice ?? 0, '9999-12'))} đ/tháng{mocGia(n)}</>
  }
  if (s.chargeType === 'flat_vat_incl') {
    const n = s.flatPriceHistory?.filter(x => x.price > 0).length ?? 0
    return <>{fmtDec(resolvePrice(s.flatPriceHistory, s.flatUnitPrice ?? 0, '9999-12'))} đ{s.service === 'nuoc' ? '/m³' : ''} (gồm VAT){mocGia(n)}</>
  }
  if (s.chargeType === 'fixed_area') {
    const n = s.areaPriceHistory?.filter(x => x.price > 0).length ?? 0
    return <>{s.areaM2 ?? 0} m² × {fmtDec(resolvePrice(s.areaPriceHistory, s.pricePerM2 ?? 0, '9999-12'))} đ{mocGia(n)}</>
  }
  if (s.chargeType === 'timeband_excl_vat') {
    const pt = resolveTimebandPoint(s.timebandPriceHistory, '9999-12')
    const n = s.timebandPriceHistory?.filter(x => x.caoDiem > 0 || x.thapDiem > 0 || x.binhThuong > 0).length ?? 0
    if (!pt) return 'Theo giá đồng hồ'
    return <>CĐ {fmtDec(pt.caoDiem)} · TĐ {fmtDec(pt.thapDiem)} · BT {fmtDec(pt.binhThuong)}{mocGia(n)}</>
  }
  return 'Gánh phần còn lại'
}

const EMPTY_TIMEBAND_ROW: TimebandPricePoint = { fromMonth: '', caoDiem: 0, thapDiem: 0, binhThuong: 0 }

// Khoá sắp xếp theo tầng: lấy số đầu tiên trong chuỗi (VD "Tầng 2" → 2, "Tầng 1 - Hầm" → 1).
// Không có số ⇒ xếp cuối; cùng số thì so sánh chữ để giữ thứ tự ổn định (Hầm/lửng…).
function floorSortKey(floor: string): [number, string] {
  const m = (floor || '').match(/\d+/)
  return [m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY, (floor || '').toLowerCase()]
}

const EMPTY: Omit<Customer, 'id' | 'createdAt'> = {
  name: '', group: '', meterId: 1, chargeType: 'flat_vat_incl', flatUnitPrice: 0, areaM2: 0, pricePerM2: 0,
  flatPriceHistory: [{ fromMonth: '', price: 0 }], areaPriceHistory: [{ fromMonth: '', price: 0 }],
  timebandPriceHistory: [{ ...EMPTY_TIMEBAND_ROW }],
  floor: '', kioskCode: '', kioskOwner: '', tenantName: '', active: true, note: '',
  hasManagementFee: false, managementFeePrice: 0, managementFeeHistory: [{ fromMonth: '', price: 0 }],
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
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Áp dụng từ</span>
          <input type="month" className="dn-input" style={{ width: 118, padding: '5px 6px' }} value={p.fromMonth} onChange={e => setRow(i, { fromMonth: e.target.value })} />
          <NumberInput style={{ width: 96, padding: '5px 6px' }} placeholder="Đơn giá" value={p.price} onValueChange={v => setRow(i, { price: v })} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{unit}</span>
          {value.length > 1 && <button className="btn-danger" onClick={() => removeRow(i)}>Xoá</button>}
        </div>
      ))}
      <button className="btn-ghost" onClick={addRow}>+ Thêm mốc giá</button>
    </div>
  )
}

// Bảng đơn giá theo khung giờ (chưa VAT) + theo thời điểm cho khách timeband.
function TimebandPriceEditor({ value, onChange }: {
  value: TimebandPricePoint[]; onChange: (v: TimebandPricePoint[]) => void
}) {
  const setRow = (i: number, patch: Partial<TimebandPricePoint>) => onChange(value.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const addRow = () => onChange([...value, { ...EMPTY_TIMEBAND_ROW }])
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: 10 }}>
      <label className="dn-label">Bảng đơn giá theo khung giờ (chưa VAT) — theo thời điểm</label>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 6 }}>
        Đơn giá charge riêng cho khách này theo từng khung giờ. Mỗi mốc áp dụng từ tháng ghi bên trái đến khi có mốc mới — khi Nhà nước tăng giá thì thêm 1 mốc mới. Để trống khung nào thì khung đó dùng đơn giá của đồng hồ tháng đó.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="dn-table">
          <thead><tr>
            <th>Áp dụng từ</th>
            <th style={{ textAlign: 'right' }}>Cao điểm</th>
            <th style={{ textAlign: 'right' }}>Thấp điểm</th>
            <th style={{ textAlign: 'right' }}>Bình thường</th>
            <th style={{ width: 60 }}></th>
          </tr></thead>
          <tbody>
            {value.map((p, i) => (
              <tr key={i}>
                <td><input type="month" className="dn-input" style={{ width: 150 }} value={p.fromMonth} onChange={e => setRow(i, { fromMonth: e.target.value })} /></td>
                <td><NumberInput style={{ textAlign: 'right' }} placeholder="Giá đồng hồ" value={p.caoDiem} onValueChange={v => setRow(i, { caoDiem: v })} /></td>
                <td><NumberInput style={{ textAlign: 'right' }} placeholder="Giá đồng hồ" value={p.thapDiem} onValueChange={v => setRow(i, { thapDiem: v })} /></td>
                <td><NumberInput style={{ textAlign: 'right' }} placeholder="Giá đồng hồ" value={p.binhThuong} onValueChange={v => setRow(i, { binhThuong: v })} /></td>
                <td>{value.length > 1 && <button className="btn-danger" onClick={() => removeRow(i)}>Xoá</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-ghost" style={{ marginTop: 6 }} onClick={addRow}>+ Thêm mốc giá</button>
    </div>
  )
}

// Seed bảng giá cho 1 dịch vụ (để editor hiển thị ít nhất 1 dòng, tương thích khách cũ chỉ có giá tĩnh).
function seedSubHistories(s: ServiceSubscription): ServiceSubscription {
  return {
    ...s,
    flatPriceHistory: seedHistory(s.flatPriceHistory, s.flatUnitPrice ?? 0),
    areaPriceHistory: seedHistory(s.areaPriceHistory, s.pricePerM2 ?? 0),
    timebandPriceHistory: (s.timebandPriceHistory && s.timebandPriceHistory.length > 0) ? s.timebandPriceHistory : [{ ...EMPTY_TIMEBAND_ROW }],
  }
}
function newSub(service: ServiceId): ServiceSubscription {
  return seedSubHistories({ service, chargeType: 'flat_vat_incl', flatUnitPrice: 0, areaM2: 0, pricePerM2: 0 })
}

// Khối cấu hình tính tiền cho 1 dịch vụ. Phí quản lý (phiql): chỉ mức phí đ/tháng.
function ServiceConfigBlock({ sub, meterNames, onChange }: {
  sub: ServiceSubscription; meterNames: Record<number, string>; onChange: (patch: Partial<ServiceSubscription>) => void
}) {
  const isPhiql = sub.service === 'phiql'
  const isWater = sub.service === 'nuoc'
  return (
    <div style={{ border: '1px solid var(--border3)', borderRadius: 10, padding: 12, background: '#fff', flex: '1 1 320px', minWidth: 280 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>⚙ {serviceLabel(sub.service, meterNames)}</div>
      {isPhiql ? (
        <PriceHistoryEditor label="Bảng phí quản lý theo thời điểm" unit="đ/tháng"
          value={sub.flatPriceHistory ?? [{ fromMonth: '', price: 0 }]} onChange={v => onChange({ flatPriceHistory: v })} />
      ) : (
        <>
          <div style={{ marginBottom: 10, maxWidth: 260 }}>
            <label className="dn-label">Cách tính tiền</label>
            <select className="dn-input" value={sub.chargeType} onChange={e => onChange({ chargeType: e.target.value as ChargeType })}>
              {(Object.keys(CHARGE_TYPE_LABELS) as ChargeType[]).map(k => <option key={k} value={k}>{CHARGE_TYPE_LABELS[k]}</option>)}
            </select>
          </div>
          {sub.chargeType === 'flat_vat_incl' && (
            <PriceHistoryEditor label={isWater ? 'Bảng giá nước theo thời điểm (đã gồm VAT)' : 'Bảng giá cố định theo thời điểm (đã gồm VAT)'}
              unit={isWater ? 'đ/m³' : 'đ/đơn vị'} value={sub.flatPriceHistory ?? [{ fromMonth: '', price: 0 }]} onChange={v => onChange({ flatPriceHistory: v })} />
          )}
          {sub.chargeType === 'fixed_area' && (
            <>
              <div style={{ marginBottom: 10, maxWidth: 220 }}>
                <label className="dn-label">Diện tích (m²)</label>
                <input type="number" className="dn-input" value={sub.areaM2 || ''} onChange={e => onChange({ areaM2: Number(e.target.value) })} />
              </div>
              <PriceHistoryEditor label="Bảng giá / m² / tháng theo thời điểm" unit="đ/m²"
                value={sub.areaPriceHistory ?? [{ fromMonth: '', price: 0 }]} onChange={v => onChange({ areaPriceHistory: v })} />
            </>
          )}
          {sub.chargeType === 'timeband_excl_vat' && (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 10 }}>
                Tính theo sản lượng thực tế từng khung giờ (nhập ở tab đồng hồ tương ứng) × đơn giá bên dưới, cộng thêm VAT theo đồng hồ.
              </div>
              <TimebandPriceEditor value={sub.timebandPriceHistory ?? [{ ...EMPTY_TIMEBAND_ROW }]} onChange={v => onChange({ timebandPriceHistory: v })} />
            </>
          )}
          {sub.chargeType === 'remainder' && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>
              Khách này tự động gánh phần còn lại của đồng hồ sau khi trừ hết các khách khác — không cần nhập sản lượng.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CustomerForm({ initial, meterNames, groupSuggestions, onSave, onCancel }: {
  initial?: Customer; meterNames: Record<number, string>; groupSuggestions: string[]
  onSave: (c: Customer) => void; onCancel: () => void
}) {
  const [form, setForm] = useState<Omit<Customer, 'id' | 'createdAt'>>(
    initial
      ? { ...initial, services: customerServices(initial).map(seedSubHistories) }
      : { ...EMPTY, services: [newSub('dh1')] }
  )
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const services = form.services ?? []
  const hasSvc = (s: ServiceId) => services.some(x => x.service === s)
  const toggleSvc = (s: ServiceId) => setForm(f => {
    const cur = f.services ?? []
    return { ...f, services: cur.some(x => x.service === s) ? cur.filter(x => x.service !== s) : [...cur, newSub(s)] }
  })
  const setSvc = (s: ServiceId, patch: Partial<ServiceSubscription>) =>
    setForm(f => ({ ...f, services: (f.services ?? []).map(x => x.service === s ? { ...x, ...patch } : x) }))

  const submit = () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString().slice(0, 10)
    const latest = (h: PricePoint[]) => [...h].filter(p => p.price > 0).sort((a, b) => (b.fromMonth || '').localeCompare(a.fromMonth || ''))[0]?.price ?? 0
    // Dọn bảng giá của từng dịch vụ + đồng bộ giá tĩnh (tương thích).
    const cleanSub = (s: ServiceSubscription): ServiceSubscription => {
      const flatH = (s.flatPriceHistory ?? []).filter(p => p.price > 0)
      const areaH = (s.areaPriceHistory ?? []).filter(p => p.price > 0)
      const tbH = (s.timebandPriceHistory ?? []).filter(p => p.caoDiem > 0 || p.thapDiem > 0 || p.binhThuong > 0)
      return {
        service: s.service, chargeType: s.chargeType,
        flatUnitPrice: flatH.length ? latest(flatH) : (s.flatUnitPrice ?? 0),
        areaM2: s.areaM2 ?? 0, pricePerM2: areaH.length ? latest(areaH) : (s.pricePerM2 ?? 0),
        flatPriceHistory: flatH, areaPriceHistory: areaH, timebandPriceHistory: tbH,
      }
    }
    // Sắp xếp dịch vụ theo thứ tự chuẩn để hiển thị ổn định.
    const cleaned = SERVICE_IDS.filter(hasSvc).map(s => cleanSub(services.find(x => x.service === s)!))
    const meterSub = cleaned.find(s => s.service !== 'phiql')
    const phiqlSub = cleaned.find(s => s.service === 'phiql')
    const meterId = meterSub ? SERVICE_METER[meterSub.service]! : (initial?.meterId ?? 1)

    onSave({
      ...(initial ?? { id: `c${Date.now()}`, createdAt: now }), ...form,
      services: cleaned,
      // Đồng bộ field cũ từ dịch vụ đồng hồ chính + phí quản lý (để code/kết xuất cũ vẫn đọc được)
      meterId,
      chargeType: meterSub?.chargeType ?? 'flat_vat_incl',
      flatUnitPrice: meterSub?.flatUnitPrice ?? 0,
      areaM2: meterSub?.areaM2 ?? 0,
      pricePerM2: meterSub?.pricePerM2 ?? 0,
      flatPriceHistory: meterSub?.flatPriceHistory ?? [],
      areaPriceHistory: meterSub?.areaPriceHistory ?? [],
      timebandPriceHistory: meterSub?.timebandPriceHistory ?? [],
      hasManagementFee: !!phiqlSub,
      managementFeeHistory: phiqlSub?.flatPriceHistory ?? [],
      managementFeePrice: phiqlSub?.flatUnitPrice ?? 0,
    } as Customer)
  }

  return (
    <div style={{ background: 'var(--surf2)', border: '1px solid var(--border3)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div className="dn-form-grid">
        <div>
          <label className="dn-label">Tên khách hàng *</label>
          <input className="dn-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="VD: Vin, SAG, Ki-ốt A1…" />
        </div>
        <div>
          <label className="dn-label">Nhóm khách hàng</label>
          <input className="dn-input" list="dn-group-suggestions" value={form.group ?? ''} onChange={e => set('group', e.target.value)} placeholder="VD: Ki-ốt tầng 1, Văn phòng…" />
          <datalist id="dn-group-suggestions">
            {groupSuggestions.map(g => <option key={g} value={g} />)}
          </datalist>
        </div>
      </div>

      <div className="dn-form-grid">
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
        <div>
          <label className="dn-label">Trạng thái</label>
          <select className="dn-input" value={form.active ? 'active' : 'inactive'} onChange={e => set('active', e.target.value === 'active')}>
            <option value="active">Đang thuê</option>
            <option value="inactive">Chưa thuê</option>
          </select>
        </div>
      </div>

      {/* LOẠI SỬ DỤNG: tích nhiều dịch vụ; mỗi dịch vụ có cấu hình tính tiền riêng và hiện ở tab tương ứng */}
      <div style={{ borderTop: '1px dashed var(--border3)', paddingTop: 12, marginBottom: 10 }}>
        <label className="dn-label" style={{ marginBottom: 6 }}>Loại sử dụng (chọn tất cả dịch vụ khách dùng)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
          {SERVICE_IDS.map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: hasSvc(s) ? 'var(--navy)' : 'var(--muted)' }}>
              <input type="checkbox" checked={hasSvc(s)} onChange={() => toggleSvc(s)} style={{ margin: 0 }} />
              {serviceLabel(s, meterNames)}
            </label>
          ))}
        </div>
        {services.length === 0 && (
          <div style={{ fontSize: 11.5, color: '#8C1F1F', fontStyle: 'italic', marginBottom: 8 }}>
            Chưa chọn dịch vụ nào — khách sẽ không xuất hiện ở tab nào. Hãy tích ít nhất 1 loại sử dụng.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          {SERVICE_IDS.filter(hasSvc).map(s => (
            <ServiceConfigBlock key={s} sub={services.find(x => x.service === s)!} meterNames={meterNames} onChange={patch => setSvc(s, patch)} />
          ))}
        </div>
      </div>

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

export function TabKhachHang({ customers, meterNames, month }: { customers: Customer[]; meterNames: Record<number, string>; month: string }) {
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Khi mở form (Sửa/Thêm) tự cuộn lên đầu để thấy form ngay
  useEffect(() => {
    if (!editing) return
    const scroller = cardRef.current?.closest('.prj-main') as HTMLElement | null
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [editing])

  const [floorFilter, setFloorFilter] = useState('')  // '' = tất cả tầng
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')  // '' = tất cả trạng thái

  const save = async (c: Customer) => { await saveCustomer(c); setEditing(null) }
  const remove = async (id: string) => { if (confirm('Xoá khách hàng này?')) await deleteCustomer(id) }

  // Bật/tắt tay trạng thái thuê của ki-ốt cho ĐÚNG tháng đang chọn (thêm/bớt month khỏi inactiveMonths)
  const toggleMonth = async (c: Customer) => {
    const set = new Set(c.inactiveMonths ?? [])
    if (set.has(month)) set.delete(month); else set.add(month)
    await saveCustomer({ ...c, inactiveMonths: Array.from(set).sort() })
  }

  // Gợi ý nhóm từ các nhóm đã nhập (bỏ trùng, bỏ rỗng)
  const groupSuggestions = Array.from(new Set(customers.map(c => c.group?.trim()).filter((g): g is string => !!g))).sort((a, b) => a.localeCompare(b, 'vi'))

  // Danh sách tầng để lọc (bỏ trùng, xếp theo số tầng tự nhiên)
  const floorOptions = useMemo(
    () => Array.from(new Set(customers.map(c => c.floor?.trim()).filter((f): f is string => !!f)))
      .sort((a, b) => { const [na, sa] = floorSortKey(a), [nb, sb] = floorSortKey(b); return na - nb || sa.localeCompare(sb, 'vi') }),
    [customers],
  )

  // Lọc theo tầng + trạng thái đang chọn rồi luôn sắp xếp theo tầng (rồi tên) để dễ theo dõi
  const displayed = useMemo(() => {
    const filtered = customers.filter(c =>
      (!floorFilter || (c.floor?.trim() || '') === floorFilter) &&
      (!statusFilter || (statusFilter === 'active' ? isActiveInMonth(c, month) : !isActiveInMonth(c, month)))
    )
    return [...filtered].sort((a, b) => {
      const [na, sa] = floorSortKey(a.floor?.trim() || ''), [nb, sb] = floorSortKey(b.floor?.trim() || '')
      // Trong cùng 1 tầng: xếp theo mã ki-ốt A→Z (numeric: A2 trước A10), rồi tên
      const col = { numeric: true, sensitivity: 'base' } as const
      return na - nb
        || sa.localeCompare(sb, 'vi', col)
        || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', col)
        || a.name.localeCompare(b.name, 'vi', col)
    })
  }, [customers, floorFilter, statusFilter, month])

  return (
    <div className="sc sc--sticky" ref={cardRef}>
      <div className="sc-head">
        <span className="sc-title">Danh sách khách hàng</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label className="dn-label" style={{ margin: 0 }}>Tầng:</label>
            <select className="dn-input" style={{ width: 150, padding: '5px 8px' }} value={floorFilter} onChange={e => setFloorFilter(e.target.value)}>
              <option value="">Tất cả tầng</option>
              {floorOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label className="dn-label" style={{ margin: 0 }}>Trạng thái ({month}):</label>
            <select className="dn-input" style={{ width: 150, padding: '5px 8px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | 'active' | 'inactive')}>
              <option value="">Tất cả</option>
              <option value="active">Đang thuê</option>
              <option value="inactive">Trống</option>
            </select>
          </span>
          <button className="btn-ghost" onClick={() => exportKhachHang(displayed, meterNames, month)}>⬇ Xuất Excel</button>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Thêm khách hàng</button>
        </span>
      </div>
      <div className="sc-body">
        {editing === 'new' && <CustomerForm meterNames={meterNames} groupSuggestions={groupSuggestions} onSave={save} onCancel={() => setEditing(null)} />}
        {editing && editing !== 'new' && <CustomerForm initial={editing} meterNames={meterNames} groupSuggestions={groupSuggestions} onSave={save} onCancel={() => setEditing(null)} />}

        <div className="dn-scroll">
          <table className="dn-table">
            <thead><tr>
              <th>Tên khách hàng</th><th>Nhóm</th><th>Tầng</th><th>Mã ki-ốt</th><th>Chủ ki-ốt</th><th>Khách hàng thuê</th>
              <th>Loại sử dụng</th><th>Cách tính tiền</th><th>Thông số</th><th>Trạng thái ({month})</th><th style={{ width: 100 }}></th>
            </tr></thead>
            <tbody>
              {customers.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Chưa có khách hàng nào.</td></tr>
              )}
              {customers.length > 0 && displayed.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Không có khách hàng khớp bộ lọc đang chọn.</td></tr>
              )}
              {displayed.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}{c.note && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{c.note}</div>}</td>
                  <td>{c.group?.trim() ? <span className="badge" style={{ background: 'var(--surf2)', color: 'var(--navy)', border: '1px solid var(--border3)' }}>{c.group}</span> : '—'}</td>
                  <td>{c.floor || '—'}</td>
                  <td>{c.kioskCode || '—'}</td>
                  <td>{c.kioskOwner || '—'}</td>
                  <td>{c.tenantName || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {customerServices(c).map(s => (
                        <span key={s.service} className={`badge${s.service === 'phiql' ? ' badge-amber' : ''}`}
                          style={s.service === 'phiql' ? undefined : { background: 'var(--surf2)', color: 'var(--navy)', border: '1px solid var(--border3)' }}>
                          {serviceLabel(s.service, meterNames)}
                        </span>
                      ))}
                      {customerServices(c).length === 0 && '—'}
                    </div>
                  </td>
                  <td>{CHARGE_TYPE_LABELS[c.chargeType]}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                    {customerServices(c).map(s => (
                      <div key={s.service} style={{ whiteSpace: 'nowrap', marginBottom: 1 }}>
                        <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{serviceLabel(s.service, meterNames)}:</span> {subPriceInfo(s)}
                      </div>
                    ))}
                    {customerServices(c).length === 0 && '—'}
                  </td>
                  <td>
                    {!c.active ? (
                      <span className="badge badge-red">Ngừng</span>
                    ) : (
                      <button
                        onClick={() => toggleMonth(c)}
                        title={isActiveInMonth(c, month) ? `Bấm để đánh dấu TRỐNG tháng ${month}` : `Bấm để bật thuê lại tháng ${month}`}
                        className={`badge ${isActiveInMonth(c, month) ? 'badge-green' : 'badge-amber'}`}
                        style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
                      >
                        {isActiveInMonth(c, month) ? 'Đang thuê' : 'Trống'}
                      </button>
                    )}
                  </td>
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
