'use client'
import { useState, useMemo } from 'react'
import { Customer, managementFeeBreakdown } from '@/lib/dien-nuoc-types'
import { saveCustomer } from '@/lib/dien-nuoc-store'
import { exportPhiQuanLy } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function floorSortKey(floor: string): [number, string] {
  const m = (floor || '').match(/\d+/)
  return [m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY, (floor || '').toLowerCase()]
}
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}`
}
function monthRange(start: string, end: string, cap = 15): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < cap) { out.push(cur); cur = addMonths(cur, 1) }
  return out
}

export function TabPhiQuanLy({ customers, month }: { customers: Customer[]; month: string }) {
  const [floorFilter, setFloorFilter] = useState('')
  const [savingAll, setSavingAll] = useState(false)
  // draft[customerId] = đơn giá đang nhập cho tháng hiện tại (chưa Lưu)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number>>({})

  const feeCustomers = useMemo(() => customers.filter(c => c.hasManagementFee), [customers])

  const floorOptions = useMemo(
    () => Array.from(new Set(feeCustomers.map(c => c.floor?.trim()).filter((f): f is string => !!f)))
      .sort((a, b) => { const [na, sa] = floorSortKey(a), [nb, sb] = floorSortKey(b); return na - nb || sa.localeCompare(sb, 'vi') }),
    [feeCustomers],
  )

  const displayed = useMemo(() => {
    const filtered = feeCustomers.filter(c => !floorFilter || (c.floor?.trim() || '') === floorFilter)
    const col = { numeric: true, sensitivity: 'base' } as const
    return [...filtered].sort((a, b) => {
      const [na, sa] = floorSortKey(a.floor?.trim() || ''), [nb, sb] = floorSortKey(b.floor?.trim() || '')
      return na - nb || sa.localeCompare(sb, 'vi', col)
        || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', col)
        || a.name.localeCompare(b.name, 'vi', col)
    })
  }, [feeCustomers, floorFilter])

  // Các tháng trong năm: từ tháng 1 đến tháng đang chọn.
  const months = useMemo(() => {
    const [y] = month.split('-')
    return monthRange(`${y}-01`, month, 12)
  }, [month])

  // Lấy đơn giá hiển thị:
  // 1. Có draft → dùng draft
  // 2. Đã lưu feeByMonth và isArea → suy ngược: savedAmt / areaM2
  // 3. Chưa có → pre-fill từ config (managementFeeBreakdown.unitPrice)
  const getUnitPrice = (c: Customer) => {
    if (priceDrafts[c.id] !== undefined) return priceDrafts[c.id]
    const bd = managementFeeBreakdown(c, month)
    if (bd.isArea && bd.areaM2 > 0 && c.feeByMonth?.[month] !== undefined)
      return c.feeByMonth[month] / bd.areaM2
    return bd.unitPrice
  }

  // Số tiền = đơn giá × diện tích (nếu theo m²) hoặc đơn giá (flat)
  const getAmt = (c: Customer) => {
    const bd = managementFeeBreakdown(c, month)
    const unitPrice = getUnitPrice(c)
    return bd.isArea && bd.areaM2 > 0 ? unitPrice * bd.areaM2 : unitPrice
  }

  const setUnitPrice = (id: string, v: number) => setPriceDrafts(prev => ({ ...prev, [id]: v }))

  const saveSingle = async (c: Customer) => {
    const amount = getAmt(c)
    await saveCustomer({ ...c, feeByMonth: { ...(c.feeByMonth ?? {}), [month]: amount } })
    setPriceDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n })
  }

  const saveAll = async () => {
    setSavingAll(true)
    await Promise.all(displayed.map(c => {
      const amount = getAmt(c)
      return saveCustomer({ ...c, feeByMonth: { ...(c.feeByMonth ?? {}), [month]: amount } })
    }))
    setPriceDrafts({})
    setSavingAll(false)
  }

  const monthTotals = months.map(m =>
    displayed.reduce((s, c) => s + (m === month ? getAmt(c) : (c.feeByMonth?.[m] ?? 0)), 0)
  )
  const cumTotals = monthTotals.reduce<number[]>((acc, v) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + v], [])
  const totalThisMonth = displayed.reduce((s, c) => s + getAmt(c), 0)

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
          <button className="btn-primary" onClick={saveAll} disabled={savingAll || displayed.length === 0}>
            {savingAll ? '…' : `✓ Lưu tất cả (${displayed.length})`}
          </button>
        </span>
      </div>
      <div className="sc-body">
        <div style={{ background: '#EEF3FA', border: '1px solid #D0DCE8', borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12, color: 'var(--txt2)' }}>
          Nhập <b>đơn giá (đ/m²)</b> cho từng khách tháng <b>{month}</b> — hệ thống tự tính <b>Phí = Diện tích × Đơn giá</b>. Bấm <b>Lưu</b> từng dòng hoặc <b>Lưu tất cả</b>.
          Tháng nào chưa lưu thì không tính vào công nợ. Cột bên phải: phí các tháng đã lưu &amp; lũy kế.
        </div>

        <div className="dn-usage-wrap">
          <table className="dn-table">
            <thead>
              <tr className="dn-section-hdr">
                <th className="dn-sticky-col" colSpan={3} style={{ left: 0, textAlign: 'left', fontSize: 11, letterSpacing: '.05em', borderRight: '2px solid var(--border3)' }}>
                  Nhập phí tháng {month}
                </th>
                <th colSpan={months.length + 1} style={{ textAlign: 'center', fontSize: 11, letterSpacing: '.05em' }}>
                  Phí đã lưu theo tháng &amp; lũy kế
                </th>
              </tr>
              <tr>
                <th className="dn-sticky-col">Khách hàng</th>
                <th className="dn-sticky-col dn-sticky-input" style={{ textAlign: 'right' }}>Đơn giá (đ/m²) → Phí tháng {month}</th>
                <th className="dn-sticky-col dn-sticky-btn"></th>
                {months.map(m => (
                  <th key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: m === month ? '#E0EDFA' : undefined }}>
                    {m}{m === month ? ' ★' : ''}
                  </th>
                ))}
                <th style={{ textAlign: 'right', background: '#DDE6F0' }}>Lũy kế</th>
              </tr>
            </thead>
            <tbody>
              {feeCustomers.length === 0 && (
                <tr><td colSpan={3 + months.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  Chưa có khách nào bật phí quản lý. Vào tab <b>Khách hàng</b> → Sửa khách → tích "Thu phí quản lý".
                </td></tr>
              )}
              {displayed.map(c => {
                const bd = managementFeeBreakdown(c, month)
                const unitPrice = getUnitPrice(c)
                const amt = bd.isArea && bd.areaM2 > 0 ? unitPrice * bd.areaM2 : unitPrice
                const savedAmt = c.feeByMonth?.[month]
                const unsaved = savedAmt === undefined
                const changed = priceDrafts[c.id] !== undefined
                const cumulative = months.reduce((s, m) => s + (m === month ? amt : (c.feeByMonth?.[m] ?? 0)), 0)
                return (
                  <tr key={c.id}>
                    <td className="dn-sticky-col" style={{ fontWeight: 600 }}>
                      {c.name}
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>
                        {c.floor || '—'}{c.kioskCode ? ` · ${c.kioskCode}` : ''}
                      </div>
                    </td>
                    <td className="dn-sticky-col dn-sticky-input">
                      {bd.isArea && bd.areaM2 > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{bd.areaM2} m² ×</span>
                            <NumberInput style={{ width: 90 }} value={unitPrice} onValueChange={v => setUnitPrice(c.id, v)} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>= {fmt(amt)} đ</span>
                            {unsaved && <span style={{ fontSize: 9.5, color: '#C87000' }}>chưa lưu</span>}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <NumberInput style={{ width: 110 }} value={unitPrice} onValueChange={v => setUnitPrice(c.id, v)} />
                          {unsaved && <span style={{ fontSize: 9.5, color: '#C87000' }}>chưa lưu</span>}
                        </div>
                      )}
                    </td>
                    <td className="dn-sticky-col dn-sticky-btn">
                      <button className="btn-ghost" onClick={() => saveSingle(c)}
                        style={changed || unsaved ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>
                        Lưu
                      </button>
                    </td>
                    {months.map(m => {
                      const v = m === month ? amt : (c.feeByMonth?.[m] ?? 0)
                      const isCur = m === month
                      const notSaved = isCur ? unsaved : c.feeByMonth?.[m] === undefined
                      return (
                        <td key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: isCur ? '#E0EDFA' : undefined }}>
                          <span style={{ fontWeight: isCur ? 700 : undefined, color: notSaved ? 'var(--muted2)' : v > 0 ? 'var(--navy)' : 'var(--muted2)' }}>
                            {notSaved && !isCur ? '—' : fmt(v)}
                          </span>
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', background: '#F3F7FC', fontWeight: 700, color: 'var(--navy)' }}>
                      {fmt(cumulative)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {displayed.length > 0 && (
              <tfoot>
                <tr style={{ background: '#E0EDFA' }}>
                  <td className="dn-sticky-col" style={{ background: '#E0EDFA', fontWeight: 700 }}>Tổng cộng</td>
                  <td className="dn-sticky-col dn-sticky-input" style={{ background: '#E0EDFA', textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>
                    {fmt(totalThisMonth)} đ
                  </td>
                  <td className="dn-sticky-col dn-sticky-btn" style={{ background: '#E0EDFA' }}></td>
                  {monthTotals.map((v, i) => (
                    <td key={months[i]} style={{ textAlign: 'right', fontWeight: 700, background: months[i] === month ? '#CFE0F5' : '#E0EDFA', whiteSpace: 'nowrap' }}>
                      {fmt(v)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)', background: '#CFE0F5', whiteSpace: 'nowrap' }}>
                    {fmt(cumTotals[cumTotals.length - 1] ?? 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
