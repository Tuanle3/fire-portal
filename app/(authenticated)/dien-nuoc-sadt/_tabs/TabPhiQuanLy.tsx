'use client'
import { useState, useMemo } from 'react'
import {
  Customer, PricePoint, ServiceSubscription,
  managementFeeOf, managementFeeIsArea, managementFeeUnitPrice,
  isActiveInMonth, subFor,
} from '@/lib/dien-nuoc-types'
import { saveCustomer } from '@/lib/dien-nuoc-store'
import { exportPhiQuanLy } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')
const fmtDec = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 20 })

// Xếp theo số tầng (giống tab Khách hàng): "Tầng 2" → 2, không số ⇒ cuối.
function floorSortKey(floor: string): [number, string] {
  const m = (floor || '').match(/\d+/)
  return [m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY, (floor || '').toLowerCase()]
}

// Cộng/trừ tháng cho chuỗi YYYY-MM.
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}`
}
// Danh sách tháng YYYY-MM từ start đến end (bao gồm 2 đầu), có chặn tối đa để an toàn.
function monthRange(start: string, end: string, cap = 15): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < cap) { out.push(cur); cur = addMonths(cur, 1) }
  return out
}

// Đặt/sửa đơn giá phí quản lý áp dụng TỪ tháng `month` (thêm/ghi đè 1 mốc cùng fromMonth).
//  - isArea=false: mức phí cố định đ/tháng (flatPriceHistory).
//  - isArea=true : đơn giá đ/m²/tháng (areaPriceHistory) — phí = đơn giá × diện tích.
// Cập nhật cả services[] (nguồn chính) lẫn field cũ để đồng bộ.
function upsertPhiqlPriceForMonth(c: Customer, month: string, price: number, isArea: boolean): Customer {
  const upsert = (h?: PricePoint[]) => {
    const arr = [...(h ?? [])]
    const idx = arr.findIndex(p => (p.fromMonth || '') === month)
    if (idx >= 0) arr[idx] = { fromMonth: month, price }; else arr.push({ fromMonth: month, price })
    return arr.filter(p => p.price > 0)
  }
  const latestOf = (arr: PricePoint[]) => [...arr].sort((a, b) => (b.fromMonth || '').localeCompare(a.fromMonth || ''))[0]?.price ?? 0

  const patchSub = (s: ServiceSubscription): ServiceSubscription => {
    if (isArea) {
      const hist = upsert(s.areaPriceHistory)
      return { ...s, chargeType: 'fixed_area', areaPriceHistory: hist, pricePerM2: latestOf(hist) }
    }
    const hist = upsert(s.flatPriceHistory)
    return { ...s, chargeType: 'flat_vat_incl', flatPriceHistory: hist, flatUnitPrice: latestOf(hist) }
  }

  let newServices = c.services
  if (c.services && c.services.length) {
    const cur = c.services.find(s => s.service === 'phiql')
    newServices = cur
      ? c.services.map(s => s.service === 'phiql' ? patchSub(s) : s)
      : [...c.services, patchSub({ service: 'phiql', chargeType: isArea ? 'fixed_area' : 'flat_vat_incl', flatUnitPrice: 0, areaM2: 0, pricePerM2: 0, vatIncluded: true, vatPercent: 8 } as ServiceSubscription)]
  }
  // Field cũ chỉ đồng bộ cho mức phí cố định; theo diện tích thì dựa vào services[].
  const legacyHist = isArea ? (c.managementFeeHistory ?? []) : upsert(c.managementFeeHistory)
  return { ...c, services: newServices, hasManagementFee: true, managementFeeHistory: legacyHist, managementFeePrice: latestOf(legacyHist) }
}

// 1 dòng khách: bên trái nhập mức phí + chọn "có/không tính phí", bên phải đối chiếu phí theo tháng + lũy kế.
// key theo (khách, tháng) ⇒ đổi tháng thì remount, state nhập tự khởi tạo lại (khỏi dùng useEffect).
function PhiCURow({ c, month, months }: { c: Customer; month: string; months: string[] }) {
  const sub = subFor(c, 'phiql')
  const isArea = managementFeeIsArea(sub)
  const areaM2 = sub?.areaM2 ?? 0
  const configuredUnit = sub ? managementFeeUnitPrice(sub, month) : 0   // đơn giá gốc (bỏ qua trạng thái thu)
  const vatExcl = sub?.vatIncluded === false
  const vp = sub?.vatPercent ?? 8
  const activeSaved = isActiveInMonth(c, month)

  const [draft, setDraft] = useState(configuredUnit)
  const [charge, setCharge] = useState(activeSaved)
  const [saving, setSaving] = useState(false)
  const priceCount = (isArea ? sub?.areaPriceHistory : sub?.flatPriceHistory)?.filter(p => p.price > 0).length ?? 0

  // Xem trước phải thu tháng đang chọn theo giá trị đang nhập (chưa lưu)
  const previewBase = isArea ? areaM2 * draft : draft
  const previewTotal = charge ? (vatExcl ? previewBase * (1 + vp / 100) : previewBase) : 0

  const dirtyPrice = draft !== configuredUnit
  const dirtyCharge = charge !== activeSaved
  const dirty = dirtyPrice || dirtyCharge

  const save = async () => {
    setSaving(true)
    let cust = c
    if (dirtyPrice) cust = upsertPhiqlPriceForMonth(cust, month, draft, isArea)
    const set = new Set(cust.inactiveMonths ?? [])
    if (charge) set.delete(month); else set.add(month)         // có tính phí ⇒ bỏ khỏi danh sách "không thu"
    cust = { ...cust, inactiveMonths: Array.from(set).sort() }
    await saveCustomer(cust)
    setSaving(false)
  }

  const feeOf = (m: string) => m === month ? previewTotal : managementFeeOf(c, m)
  const cumulative = months.reduce((s, m) => s + feeOf(m), 0)

  return (
    <tr>
      <td className="dn-sticky-col" style={{ fontWeight: 600, verticalAlign: 'top' }}>
        {c.name}
        <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>{c.floor || '—'}{c.kioskCode ? ` · ${c.kioskCode}` : ''}</div>
      </td>
      <td className="dn-sticky-col dn-sticky-input" style={{ verticalAlign: 'top' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
          {isArea && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{fmtDec(areaM2)} m² ×</span>}
          <NumberInput style={{ width: 92 }} value={draft} onValueChange={setDraft} />
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{isArea ? 'đ/m²' : 'đ/tháng'} {vatExcl ? `(chưa VAT +${vp}%)` : '(gồm VAT)'}</span>
          {!c.active ? (
            <span className="badge badge-red">Ngừng</span>
          ) : (
            <select className="dn-input" style={{ width: 96, padding: '3px 4px', fontSize: 11 }} value={charge ? '1' : '0'} onChange={e => setCharge(e.target.value === '1')}>
              <option value="1">Có tính phí</option>
              <option value="0">Không tính phí</option>
            </select>
          )}
        </div>
        {priceCount > 1 && <div style={{ fontSize: 10, color: 'var(--gold2)' }}>{priceCount} mốc giá</div>}
      </td>
      <td className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right', verticalAlign: 'top' }}>
        <b style={{ color: previewTotal > 0 ? 'var(--navy)' : 'var(--muted2)' }}>{fmt(previewTotal)} đ</b>
      </td>
      <td className="dn-sticky-col dn-sticky-btn" style={{ verticalAlign: 'top' }}>
        <button className="btn-ghost" onClick={save} disabled={!dirty || saving} title={dirty ? `Lưu mức phí & trạng thái từ tháng ${month}` : 'Chưa có thay đổi'}>{saving ? '…' : 'Lưu'}</button>
      </td>
      {months.map(m => {
        const isCur = m === month
        const v = feeOf(m)
        return (
          <td key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: isCur ? '#E0EDFA' : undefined }}>
            <span style={{ fontWeight: isCur ? 700 : undefined, color: v > 0 ? 'var(--navy)' : 'var(--muted2)' }}>{fmt(v)}</span>
          </td>
        )
      })}
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', background: '#F3F7FC', fontWeight: 700, color: 'var(--navy)' }}>{fmt(cumulative)}</td>
    </tr>
  )
}

export function TabPhiQuanLy({ customers, month }: { customers: Customer[]; month: string }) {
  const [floorFilter, setFloorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')

  const feeCustomers = useMemo(() => customers.filter(c => c.hasManagementFee), [customers])

  const floorOptions = useMemo(
    () => Array.from(new Set(feeCustomers.map(c => c.floor?.trim()).filter((f): f is string => !!f)))
      .sort((a, b) => { const [na, sa] = floorSortKey(a), [nb, sb] = floorSortKey(b); return na - nb || sa.localeCompare(sb, 'vi') }),
    [feeCustomers],
  )

  const floorCustomers = useMemo(
    () => feeCustomers.filter(c => !floorFilter || (c.floor?.trim() || '') === floorFilter),
    [feeCustomers, floorFilter],
  )

  // Các tháng hiển thị (cột đối chiếu): từ mốc phí sớm nhất đến tháng đang chọn.
  const months = useMemo(() => {
    const froms = feeCustomers.flatMap(c => {
      const sub = subFor(c, 'phiql')
      return [...(sub?.flatPriceHistory ?? []), ...(sub?.areaPriceHistory ?? [])].map(p => p.fromMonth).filter((m): m is string => !!m)
    }).filter(m => m <= month)
    const start = froms.length ? froms.sort()[0] : addMonths(month, -11)
    return monthRange(start < month ? start : addMonths(month, -11), month)
  }, [feeCustomers, month])

  const displayed = useMemo(() => {
    const filtered = floorCustomers.filter(c =>
      (!statusFilter || (statusFilter === 'active' ? isActiveInMonth(c, month) : !isActiveInMonth(c, month)))
    )
    const col = { numeric: true, sensitivity: 'base' } as const
    return [...filtered].sort((a, b) => {
      const [na, sa] = floorSortKey(a.floor?.trim() || ''), [nb, sb] = floorSortKey(b.floor?.trim() || '')
      return na - nb || sa.localeCompare(sb, 'vi', col)
        || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', col)
        || a.name.localeCompare(b.name, 'vi', col)
    })
  }, [floorCustomers, statusFilter, month])

  // Tổng theo tháng (đã lưu) + lũy kế cộng dồn cho hàng tổng.
  const monthTotals = months.map(m => displayed.reduce((s, c) => s + managementFeeOf(c, m), 0))
  const cumTotals = monthTotals.reduce<number[]>((acc, v) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + v], [])
  const totalThisMonth = displayed.reduce((s, c) => s + managementFeeOf(c, month), 0)
  const countCharged = displayed.filter(c => managementFeeOf(c, month) > 0).length

  return (
    <div className="sc sc--sticky">
      <div className="sc-head">
        <span className="sc-title">Phí quản lý — tháng {month}</span>
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
              <option value="active">Có thu</option>
              <option value="inactive">Không thu</option>
            </select>
          </span>
          <button className="btn-ghost" onClick={() => exportPhiQuanLy(displayed, month)}>⬇ Xuất Excel</button>
        </span>
      </div>
      <div className="sc-body">
        <div style={{ background: '#EEF3FA', border: '1px solid #D0DCE8', borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12, color: 'var(--txt2)' }}>
          Nhập mức phí bên trái, chọn <b>“Có tính phí / Không tính phí”</b> cho tháng {month} rồi bấm <b>Lưu</b> (mức phí áp dụng từ tháng {month} trở đi). Bên phải đối chiếu phí quản lý từng tháng &amp; cột <b>Lũy kế</b> (cộng dồn). Muốn thêm/bỏ khách hoặc chuyển tính <b>theo diện tích</b> thì vào tab <b>Khách hàng</b>.
        </div>

        <div className="dn-usage-wrap">
          <table className="dn-table">
            <thead>
              <tr className="dn-section-hdr">
                <th className="dn-sticky-col" style={{ left: 0, minWidth: 574, textAlign: 'left', fontSize: 11, letterSpacing: '.05em', borderRight: '2px solid var(--border3)' }} colSpan={4}>Nhập mức phí quản lý</th>
                <th colSpan={months.length + 1} style={{ textAlign: 'center', fontSize: 11, letterSpacing: '.05em' }}>Đối chiếu phí quản lý theo tháng &amp; lũy kế</th>
              </tr>
              <tr>
                <th className="dn-sticky-col">Khách hàng</th>
                <th className="dn-sticky-col dn-sticky-input">Mức phí · Tính phí ({month})</th>
                <th className="dn-sticky-col dn-sticky-amt" style={{ textAlign: 'right' }}>Phải thu</th>
                <th className="dn-sticky-col dn-sticky-btn"></th>
                {months.map(m => <th key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: m === month ? '#E0EDFA' : undefined }}>{m}{m === month ? ' ★' : ''}</th>)}
                <th style={{ textAlign: 'right', background: '#DDE6F0' }}>Lũy kế</th>
              </tr>
            </thead>
            <tbody>
              {feeCustomers.length === 0 && (
                <tr><td colSpan={5 + months.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  Chưa có khách nào bật phí quản lý. Vào tab <b>Khách hàng</b> → Sửa khách → tích “Thu phí quản lý”.
                </td></tr>
              )}
              {feeCustomers.length > 0 && displayed.length === 0 && (
                <tr><td colSpan={5 + months.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Không có khách khớp bộ lọc đang chọn.</td></tr>
              )}
              {displayed.map(c => <PhiCURow key={`${c.id}_${month}`} c={c} month={month} months={months} />)}
            </tbody>
            {displayed.length > 0 && (
              <tfoot>
                <tr style={{ background: '#E0EDFA' }}>
                  <td className="dn-sticky-col" style={{ background: '#E0EDFA', fontWeight: 700 }}>Tổng cộng</td>
                  <td className="dn-sticky-col dn-sticky-input" style={{ background: '#E0EDFA', color: 'var(--muted)' }}>{countCharged} khách có thu</td>
                  <td className="dn-sticky-col dn-sticky-amt" style={{ background: '#E0EDFA', textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(totalThisMonth)} đ</td>
                  <td className="dn-sticky-col dn-sticky-btn" style={{ background: '#E0EDFA' }}></td>
                  {monthTotals.map((v, i) => <td key={months[i]} style={{ textAlign: 'right', fontWeight: 700, background: months[i] === month ? '#CFE0F5' : '#E0EDFA', whiteSpace: 'nowrap' }}>{fmt(v)}</td>)}
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)', background: '#CFE0F5', whiteSpace: 'nowrap' }}>{fmt(cumTotals[cumTotals.length - 1] ?? 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
