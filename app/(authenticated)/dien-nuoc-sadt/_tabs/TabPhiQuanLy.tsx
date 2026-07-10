'use client'
import { useState, useMemo } from 'react'
import {
  Customer, PricePoint, ServiceSubscription,
  managementFeeOf, managementFeeBreakdown, managementFeeIsArea, managementFeeUnitPrice,
  isActiveInMonth, subFor,
} from '@/lib/dien-nuoc-types'
import { saveCustomer } from '@/lib/dien-nuoc-store'
import { exportPhiQuanLy } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

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
function monthRange(start: string, end: string, cap = 36): string[] {
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

function PhiRow({ c, month }: { c: Customer; month: string }) {
  const bd = managementFeeBreakdown(c, month)                                 // phải thu, đã gồm VAT (0 nếu tháng này không thu)
  const sub = subFor(c, 'phiql')
  const isArea = managementFeeIsArea(sub)
  const areaM2 = sub?.areaM2 ?? 0
  const configuredUnit = sub ? managementFeeUnitPrice(sub, month) : 0          // đơn giá gốc (bỏ qua trạng thái)
  const vatExcl = sub?.vatIncluded === false
  const vp = sub?.vatPercent ?? 8
  const [draft, setDraft] = useState(configuredUnit)
  const [saving, setSaving] = useState(false)
  const active = isActiveInMonth(c, month)
  const priceCount = (isArea ? sub?.areaPriceHistory : sub?.flatPriceHistory)?.filter(p => p.price > 0).length ?? 0
  const applied = bd.total

  const saveFee = async () => { setSaving(true); await saveCustomer(upsertPhiqlPriceForMonth(c, month, draft, isArea)); setSaving(false) }
  const toggleMonth = async () => {
    const set = new Set(c.inactiveMonths ?? [])
    if (set.has(month)) set.delete(month); else set.add(month)
    await saveCustomer({ ...c, inactiveMonths: Array.from(set).sort() })
  }

  const dirty = draft !== configuredUnit
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{c.name}</td>
      <td>{c.group?.trim() ? <span className="badge" style={{ background: 'var(--surf2)', color: 'var(--navy)', border: '1px solid var(--border3)' }}>{c.group}</span> : '—'}</td>
      <td>{c.floor || '—'}</td>
      <td>{c.kioskCode || '—'}</td>
      <td>{c.tenantName || c.kioskOwner || '—'}</td>
      <td style={{ textAlign: 'right' }}>{isArea ? `${areaM2.toLocaleString('vi-VN')} m²` : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
          {isArea && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{areaM2.toLocaleString('vi-VN')} m² ×</span>}
          <NumberInput style={{ width: 120, textAlign: 'right' }} value={draft} onValueChange={setDraft} />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{isArea ? 'đ/m²/tháng' : 'đ/tháng'} {vatExcl ? `(chưa VAT +${vp}%)` : '(gồm VAT)'}</span>
          {dirty && <button className="btn-ghost" onClick={saveFee} disabled={saving}>{saving ? '…' : `Lưu từ ${month}`}</button>}
        </div>
        {priceCount > 1 && <div style={{ fontSize: 10, color: 'var(--gold2)' }}>{priceCount} mốc giá</div>}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 700, color: applied > 0 ? 'var(--navy)' : 'var(--muted2)' }}>{fmt(applied)} đ</td>
      <td>
        {!c.active ? (
          <span className="badge badge-red">Ngừng</span>
        ) : (
          <button onClick={toggleMonth}
            title={active ? `Bấm để đánh dấu KHÔNG thu tháng ${month}` : `Bấm để thu lại tháng ${month}`}
            className={`badge ${active ? 'badge-green' : 'badge-amber'}`} style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
            {active ? 'Có thu' : 'Không thu'}
          </button>
        )}
      </td>
    </tr>
  )
}

// Bảng tích lũy phí quản lý từng tháng + tổng hợp lũy kế (cộng dồn) — giống thống kê theo tháng của điện.
function PhiLuyKeCard({ customers, month }: { customers: Customer[]; month: string }) {
  const rows = useMemo(() => {
    // Tháng bắt đầu = mốc giá phí quản lý sớm nhất (có ghi tháng) trong nhóm khách; nếu không có ⇒ 11 tháng trước tháng đang chọn.
    const froms = customers.flatMap(c => {
      const sub = subFor(c, 'phiql')
      return [...(sub?.flatPriceHistory ?? []), ...(sub?.areaPriceHistory ?? [])].map(p => p.fromMonth).filter((m): m is string => !!m)
    }).filter(m => m <= month)
    const start = froms.length ? froms.sort()[0] : addMonths(month, -11)
    const months = monthRange(start < month ? start : addMonths(month, -11), month)

    return months.reduce<{ month: string; monthTotal: number; count: number; cumulative: number }[]>((acc, m) => {
      const monthTotal = customers.reduce((s, c) => s + managementFeeOf(c, m), 0)
      const count = customers.filter(c => managementFeeOf(c, m) > 0).length
      const cumulative = (acc.length ? acc[acc.length - 1].cumulative : 0) + monthTotal
      return [...acc, { month: m, monthTotal, count, cumulative }]
    }, [])
  }, [customers, month])

  const grand = rows.length ? rows[rows.length - 1].cumulative : 0

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Tích lũy phí quản lý theo tháng — lũy kế đến {month}</span>
      </div>
      <div className="sc-body">
        <div style={{ background: '#EEF3FA', border: '1px solid #D0DCE8', borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12, color: 'var(--txt2)' }}>
          Mỗi dòng là tổng phí quản lý phải thu của một tháng; cột <b>Lũy kế</b> là tổng cộng dồn từ tháng đầu đến tháng đó. Áp dụng bộ lọc tầng ở trên.
        </div>
        <div className="dn-scroll">
          <table className="dn-table">
            <thead><tr>
              <th>Tháng</th>
              <th style={{ textAlign: 'right' }}>Số khách có thu</th>
              <th style={{ textAlign: 'right' }}>Phí quản lý tháng</th>
              <th style={{ textAlign: 'right' }}>Lũy kế</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Chưa có dữ liệu.</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.month} style={r.month === month ? { background: '#E0EDFA' } : undefined}>
                  <td style={{ fontWeight: r.month === month ? 700 : 600 }}>{r.month}{r.month === month ? ' ★' : ''}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.count}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.monthTotal)} đ</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(r.cumulative)} đ</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#DDE6F0' }}>
                  <td style={{ fontWeight: 800 }} colSpan={3}>Tổng lũy kế {rows[0].month} → {month}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(grand)} đ</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
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

  // Lọc theo tầng (dùng cho cả bảng tháng hiện tại lẫn bảng lũy kế)
  const floorCustomers = useMemo(
    () => feeCustomers.filter(c => !floorFilter || (c.floor?.trim() || '') === floorFilter),
    [feeCustomers, floorFilter],
  )

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

  const total = displayed.reduce((s, c) => s + managementFeeOf(c, month), 0)
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
          Danh sách khách đã bật <b>“Thu phí quản lý”</b>. Sửa mức phí ở đây sẽ áp dụng từ tháng {month} trở đi (thêm mốc giá); muốn thêm/bỏ khách hoặc chuyển sang tính <b>theo diện tích</b> thì vào tab <b>Khách hàng</b>. Thu tiền &amp; công nợ phí quản lý xem ở tab <b>Công nợ &amp; Thu tiền</b>.
        </div>
        <div className="dn-scroll">
          <table className="dn-table">
            <thead><tr>
              <th>Khách hàng</th><th>Nhóm</th><th>Tầng</th><th>Mã ki-ốt</th><th>Khách thuê</th>
              <th style={{ textAlign: 'right' }}>Diện tích</th>
              <th style={{ textAlign: 'right' }}>Mức phí</th><th style={{ textAlign: 'right' }}>Phải thu ({month})</th><th>Trạng thái ({month})</th>
            </tr></thead>
            <tbody>
              {feeCustomers.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  Chưa có khách nào bật phí quản lý. Vào tab <b>Khách hàng</b> → Sửa khách → tích “Thu phí quản lý”.
                </td></tr>
              )}
              {feeCustomers.length > 0 && displayed.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Không có khách khớp bộ lọc đang chọn.</td></tr>
              )}
              {displayed.map(c => <PhiRow key={c.id} c={c} month={month} />)}
            </tbody>
            {displayed.length > 0 && (
              <tfoot>
                <tr style={{ background: '#E0EDFA' }}>
                  <td style={{ fontWeight: 700 }} colSpan={6}>Tổng cộng ({countCharged} khách có thu)</td>
                  <td></td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(total)} đ</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {feeCustomers.length > 0 && <div style={{ marginTop: 16 }}><PhiLuyKeCard customers={floorCustomers} month={month} /></div>}
      </div>
    </div>
  )
}
