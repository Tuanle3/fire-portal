'use client'
import { useState } from 'react'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, ServiceId,
  meterLabel, meterAllocation, remainderByBand, BAND_KEYS, BAND_LABELS,
  managementFeeOf, METER_SERVICE, primaryService, paymentService,
} from '@/lib/dien-nuoc-types'
import { savePayment } from '@/lib/dien-nuoc-store'
import { exportCongNo } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function PaymentModal({ customerId, month, due, paid, service, label, onClose }: {
  customerId: string; month: string; due: number; paid: number; service: ServiceId; label: string; onClose: () => void
}) {
  const remain = Math.max(0, due - paid)
  const [amount, setAmount] = useState(remain)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (amount <= 0) return
    setSaving(true)
    const now = new Date().toISOString().slice(0, 10)
    await savePayment({ id: `p${Date.now()}`, customerId, month, amount, paidAt: now, note, service, createdAt: now })
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal">
        <div className="so-header">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Ghi nhận thu tiền — {label}</div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Còn nợ tháng {month}: <b style={{ color: '#DC2626' }}>{fmt(remain)} đ</b></div>
          <div className="so-field so-field--full">
            <label className="so-label">Số tiền thu</label>
            <NumberInput className="so-input" value={amount} onValueChange={setAmount} />
          </div>
          <div className="so-field so-field--full">
            <label className="so-label">Ghi chú (tuỳ chọn)</label>
            <input className="so-input" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="so-footer">
          <button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>Hủy</button>
          <button className="so-save" onClick={submit} disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận thu'}</button>
        </div>
      </div>
    </>
  )
}

type CollectArgs = { customerId: string; month: string; due: number; paid: number; service: ServiceId; label: string }

// Popup chọn khoản thu cho 1 khách: liệt kê từng (tháng × chi phí) còn nợ để chọn tháng lưu.
function CollectPickerModal({ customer, readings, customers, usages, payments, onPick, onClose }: {
  customer: Customer; readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]
  onPick: (a: CollectArgs) => void; onClose: () => void
}) {
  const months = Array.from(new Set(readings.map(r => r.month))).sort()
  const primary = primaryService(customer)
  const svcLabel: Record<MeterId, string> = { 1: 'Điện CS', 2: 'Máy lạnh', 3: 'Nước' }
  type Item = { month: string; service: ServiceId; label: string; due: number; paid: number; remain: number }
  const items: Item[] = []
  const paidOf = (m: string, service: ServiceId) => payments
    .filter(p => p.customerId === customer.id && p.month === m && paymentService(p, primary) === service)
    .reduce((s, p) => s + p.amount, 0)

  for (const m of months) {
    for (const id of [1, 2, 3] as MeterId[]) {
      const r = readings.find(x => x.meterId === id && x.month === m)
      if (!r) continue
      const row = meterAllocation(r, customers, usages).rows.find(rr => rr.customer.id === customer.id)
      if (!row || row.amount <= 0) continue
      const service = METER_SERVICE[id]
      const paid = paidOf(m, service)
      items.push({ month: m, service, label: svcLabel[id], due: row.amount, paid, remain: Math.max(0, row.amount - paid) })
    }
    const fee = managementFeeOf(customer, m)
    if (fee > 0) { const paid = paidOf(m, 'phiql'); items.push({ month: m, service: 'phiql', label: 'Phí QL', due: fee, paid, remain: Math.max(0, fee - paid) }) }
  }
  // Còn nợ lên trước, rồi tháng mới → cũ
  items.sort((a, b) => (b.remain > 0 ? 1 : 0) - (a.remain > 0 ? 1 : 0) || b.month.localeCompare(a.month) || a.label.localeCompare(b.label))

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal" style={{ maxWidth: 660 }}>
        <div className="so-header">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Chọn khoản thu — {customer.name}</div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '12px 16px', maxHeight: '60vh', overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 8 }}>Khách này chưa có khoản phải thu.</div>
          ) : (
            <div className="dn-scroll">
              <table className="dn-table">
                <thead><tr>
                  <th>Tháng</th><th>Khoản</th><th style={{ textAlign: 'right' }}>Phải thu</th>
                  <th style={{ textAlign: 'right' }}>Đã thu</th><th style={{ textAlign: 'right' }}>Còn nợ</th><th style={{ width: 80 }}></th>
                </tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{it.month}</td>
                      <td>{it.label}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(it.due)} đ</td>
                      <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(it.paid)} đ</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: it.remain > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(it.remain)} đ</td>
                      <td>
                        <button className="btn-ghost" disabled={it.remain <= 0} style={it.remain <= 0 ? { opacity: 0.45, cursor: 'default' } : undefined}
                          onClick={() => onPick({ customerId: customer.id, month: it.month, due: it.due, paid: it.paid, service: it.service, label: `${it.label} · ${it.month}` })}>Thu</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="so-footer"><button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>Đóng</button></div>
      </div>
    </>
  )
}

function MeterAllocationCard({ meterId, reading, customers, usages, payments, month, meterNames, onCollect }: {
  meterId: MeterId; reading: MeterReading | undefined; customers: Customer[]; usages: CustomerUsage[]
  payments: Payment[]; month: string; meterNames: Record<number, string>; onCollect: (a: CollectArgs) => void
}) {
  if (!reading) {
    return (
      <div className="sc">
        <div className="sc-head"><span className="sc-title">{meterLabel(meterNames, meterId)}</span></div>
        <div className="sc-body"><div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 10 }}>Chưa nhập chỉ số tháng {month}.</div></div>
      </div>
    )
  }

  const alloc = meterAllocation(reading, customers, usages)
  const remBand = meterId !== 3 ? remainderByBand(reading, customers, usages) : null
  const meterName = meterLabel(meterNames, meterId)
  const service = METER_SERVICE[meterId]
  const custById = new Map(customers.map(c => [c.id, c]))

  // Chỉ tính khoản thu đúng dịch vụ đồng hồ này (khách có thể đóng cho nhiều đồng hồ khác nhau)
  const paidOf = (customerId: string) => payments.filter(p => p.customerId === customerId && p.month === month
    && paymentService(p, primaryService(custById.get(customerId)!)) === service).reduce((s, p) => s + p.amount, 0)

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">{meterLabel(meterNames, meterId)}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Tổng tiền: <b style={{ color: 'var(--navy)' }}>{fmt(alloc.total)} đ</b></span>
      </div>
      <div className="sc-body">
        <div className="dn-scroll">
        <table className="dn-table">
          <thead><tr>
            <th>Khách hàng</th><th style={{ textAlign: 'right' }}>Phải trả</th><th style={{ textAlign: 'right' }}>Đã thu</th><th style={{ textAlign: 'right' }}>Còn nợ</th><th style={{ width: 100 }}></th>
          </tr></thead>
          <tbody>
            {alloc.rows.map(r => {
              const paid = paidOf(r.customer.id)
              const remain = Math.max(0, r.amount - paid)
              return (
                <tr key={r.customer.id}>
                  <td style={{ fontWeight: 600 }}>{r.customer.name}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.amount)} đ</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(paid)} đ</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: remain > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(remain)} đ</td>
                  <td><button className="btn-ghost" onClick={() => onCollect({ customerId: r.customer.id, month, due: r.amount, paid, service, label: meterName })}>Thu tiền</button></td>
                </tr>
              )
            })}
            {alloc.rows.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Chưa có khách hàng nào gán cho đồng hồ này.</td></tr>
            )}
          </tbody>
        </table>
        </div>

        {remBand && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>
              Chi tiết phần còn lại theo khung giờ (sau khi trừ khách theo khung giờ — chưa trừ khách giá cố định)
            </summary>
            <table className="dn-table" style={{ marginTop: 6 }}>
              <thead><tr>{BAND_KEYS.map(k => <th key={k}>{BAND_LABELS[k]}</th>)}</tr></thead>
              <tbody><tr>{BAND_KEYS.map(k => <td key={k}>{fmt(remBand[k])} đ</td>)}</tr></tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  )
}

// Thu tiền phí quản lý (độc lập với đồng hồ) — chỉ tính khoản thu kind='management'.
function ManagementFeeCard({ customers, payments, month, onCollect }: {
  customers: Customer[]; payments: Payment[]; month: string; onCollect: (a: CollectArgs) => void
}) {
  const cmp = { numeric: true, sensitivity: 'base' } as const
  const feeCustomers = customers.filter(c => managementFeeOf(c, month) > 0)
    .sort((a, b) => (a.floor?.trim() || '').localeCompare(b.floor?.trim() || '', 'vi', cmp)
      || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', cmp)
      || a.name.localeCompare(b.name, 'vi', cmp))
  const paidOf = (cid: string) => payments.filter(p => p.customerId === cid && p.month === month
    && paymentService(p, primaryService(feeCustomers.find(c => c.id === cid)!)) === 'phiql').reduce((s, p) => s + p.amount, 0)
  const total = feeCustomers.reduce((s, c) => s + managementFeeOf(c, month), 0)

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Phí quản lý</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Tổng phí: <b style={{ color: 'var(--navy)' }}>{fmt(total)} đ</b></span>
      </div>
      <div className="sc-body">
        <div className="dn-scroll">
          <table className="dn-table">
            <thead><tr>
              <th>Khách hàng</th><th style={{ textAlign: 'right' }}>Phải trả</th><th style={{ textAlign: 'right' }}>Đã thu</th><th style={{ textAlign: 'right' }}>Còn nợ</th><th style={{ width: 100 }}></th>
            </tr></thead>
            <tbody>
              {feeCustomers.map(c => {
                const due = managementFeeOf(c, month)
                const paid = paidOf(c.id)
                const remain = Math.max(0, due - paid)
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(due)} đ</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(paid)} đ</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: remain > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(remain)} đ</td>
                    <td><button className="btn-ghost" onClick={() => onCollect({ customerId: c.id, month, due, paid, service: 'phiql', label: 'Phí quản lý' })}>Thu tiền</button></td>
                  </tr>
                )
              })}
              {feeCustomers.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Chưa có khách nào thu phí quản lý tháng {month}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Bảng công nợ LŨY KẾ theo các tháng: mỗi khách 1 dòng, cộng dồn phải thu/đã thu/còn nợ.
// Nút +/- mở ngang ra các cột chi phí thành phần (điện CS · máy lạnh · nước · phí QL).
// Cột ghi chú tự đếm số tháng chưa thu đủ.
type CpKey = 'dienCS' | 'mayLanh' | 'nuoc' | 'phiQL'
function CongNoMultiMonth({ readings, customers, usages, payments, month, meterNames, onCollect }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>; onCollect: (c: Customer) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const months = Array.from(new Set(readings.map(r => r.month))).sort()

  type Agg = { c: Customer; dienCS: number; mayLanh: number; nuoc: number; phiQL: number; due: number; paid: number; remain: number; unpaid: number }
  const agg = new Map<string, Agg>()
  const ensure = (c: Customer): Agg => {
    let a = agg.get(c.id)
    if (!a) { a = { c, dienCS: 0, mayLanh: 0, nuoc: 0, phiQL: 0, due: 0, paid: 0, remain: 0, unpaid: 0 }; agg.set(c.id, a) }
    return a
  }
  const meterField = (id: MeterId): CpKey => id === 1 ? 'dienCS' : id === 2 ? 'mayLanh' : 'nuoc'

  for (const m of months) {
    const monthDue = new Map<string, number>()
    for (const r of readings.filter(r => r.month === m)) {
      const field = meterField(r.meterId)
      for (const row of meterAllocation(r, customers, usages).rows) {
        const a = ensure(row.customer)
        a[field] += row.amount; a.due += row.amount
        monthDue.set(row.customer.id, (monthDue.get(row.customer.id) ?? 0) + row.amount)
      }
    }
    for (const c of customers) {
      const fee = managementFeeOf(c, m)
      if (fee > 0) { const a = ensure(c); a.phiQL += fee; a.due += fee; monthDue.set(c.id, (monthDue.get(c.id) ?? 0) + fee) }
    }
    const monthPaid = new Map<string, number>()
    for (const p of payments) if (p.month === m) monthPaid.set(p.customerId, (monthPaid.get(p.customerId) ?? 0) + p.amount)
    for (const [cid, d] of monthDue) {
      const a = agg.get(cid); if (!a || d <= 0) continue
      const pd = monthPaid.get(cid) ?? 0
      a.paid += Math.min(pd, d)            // đã thu = phần khớp nợ tháng đó (phải thu = đã thu + còn nợ)
      a.remain += Math.max(0, d - pd)
      if (pd < d) a.unpaid += 1             // tháng chưa thu đủ
    }
  }

  const cmp = { numeric: true, sensitivity: 'base' } as const
  const rows = Array.from(agg.values()).filter(a => a.due > 0)
    .sort((x, y) => (x.c.group?.trim() || 'zzz').localeCompare(y.c.group?.trim() || 'zzz', 'vi', cmp) || x.c.name.localeCompare(y.c.name, 'vi', cmp))

  const cpCols: { key: CpKey; label: string }[] = [
    { key: 'dienCS', label: 'Điện CS' }, { key: 'mayLanh', label: 'Máy lạnh' },
    { key: 'nuoc', label: 'Nước' }, { key: 'phiQL', label: 'Phí QL' },
  ]
  const sum = (fn: (a: Agg) => number) => rows.reduce((s, a) => s + fn(a), 0)
  const colSpanEmpty = expanded ? 11 : 7
  const rangeLabel = months.length ? `${months[0]} → ${months[months.length - 1]}` : '—'

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Công nợ lũy kế theo tháng — {rangeLabel} ({months.length} tháng)</span>
        <button className="btn-ghost" onClick={() => exportCongNo(readings, customers, usages, payments, month, meterNames)}>⬇ Xuất Excel (tháng {month})</button>
      </div>
      <div className="sc-body">
        <div className="dn-scroll">
        <table className="dn-table">
          <thead><tr>
            <th>Khách hàng</th><th>Nhóm</th>
            {expanded && cpCols.map(col => <th key={col.key} style={{ textAlign: 'right', fontWeight: 600 }}>{col.label}</th>)}
            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <button onClick={() => setExpanded(v => !v)} title={expanded ? 'Thu gọn chi phí thành phần' : 'Mở chi tiết chi phí thành phần'}
                style={{ marginRight: 6, width: 18, height: 18, lineHeight: '15px', padding: 0, fontSize: 13, fontWeight: 800, cursor: 'pointer', border: '1px solid var(--border2)', borderRadius: 5, background: '#fff', color: 'var(--navy)' }}>{expanded ? '−' : '+'}</button>
              Tổng phải thu
            </th>
            <th style={{ textAlign: 'right' }}>Đã thu</th><th style={{ textAlign: 'right' }}>Còn nợ</th>
            <th style={{ textAlign: 'right' }}>Ghi chú</th><th style={{ width: 100 }}></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={colSpanEmpty} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Chưa có dữ liệu công nợ.</td></tr>
            )}
            {rows.map(a => (
              <tr key={a.c.id}>
                <td style={{ fontWeight: 600 }}>{a.c.name}</td>
                <td style={{ color: 'var(--muted)' }}>{a.c.group?.trim() || '—'}</td>
                {expanded && cpCols.map(col => <td key={col.key} style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(a[col.key])} đ</td>)}
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.due)} đ</td>
                <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(a.paid)} đ</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: a.remain > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(a.remain)} đ</td>
                <td style={{ textAlign: 'right' }}>
                  {a.unpaid > 0
                    ? <span className="badge badge-red">{a.unpaid} tháng chưa thu</span>
                    : <span className="badge badge-green">Đã thu đủ</span>}
                </td>
                <td><button className="btn-ghost" onClick={() => onCollect(a.c)}>Thu tiền</button></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{ background: '#E0EDFA' }}>
              <td style={{ fontWeight: 700 }}>Tổng cộng</td><td></td>
              {expanded && cpCols.map(col => <td key={col.key} style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(sum(a => a[col.key]))} đ</td>)}
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(sum(a => a.due))} đ</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmt(sum(a => a.paid))} đ</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: sum(a => a.remain) > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(sum(a => a.remain))} đ</td>
              <td></td><td></td>
            </tr></tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  )
}

export function TabCongNo({ readings, customers, usages, payments, month, meterNames }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>
}) {
  const [collecting, setCollecting] = useState<CollectArgs | null>(null)
  const [picking, setPicking] = useState<Customer | null>(null)
  const byMeter = (id: MeterId) => readings.find(r => r.meterId === id && r.month === month)
  const hasFeeCustomers = customers.some(c => c.hasManagementFee)

  return (
    <div>
      <CongNoMultiMonth readings={readings} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames} onCollect={setPicking} />
      {([1, 2, 3] as MeterId[]).map(id => (
        <MeterAllocationCard key={id} meterId={id} reading={byMeter(id)} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames}
          onCollect={setCollecting} />
      ))}
      {hasFeeCustomers && (
        <ManagementFeeCard customers={customers} payments={payments} month={month} onCollect={setCollecting} />
      )}
      {picking && (
        <CollectPickerModal customer={picking} readings={readings} customers={customers} usages={usages} payments={payments}
          onPick={a => { setPicking(null); setCollecting(a) }} onClose={() => setPicking(null)} />
      )}
      {collecting && (
        <PaymentModal customerId={collecting.customerId} month={collecting.month} due={collecting.due} paid={collecting.paid}
          service={collecting.service} label={collecting.label} onClose={() => setCollecting(null)} />
      )}
    </div>
  )
}
