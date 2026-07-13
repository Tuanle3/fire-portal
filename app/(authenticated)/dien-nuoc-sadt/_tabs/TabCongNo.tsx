'use client'
import { useState } from 'react'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, ServiceId,
  meterAllocation, managementFeeOf, METER_SERVICE, primaryService, paymentService,
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

const SVC_LABEL: Record<string, string> = {
  [METER_SERVICE[1]]: 'Điện CS', [METER_SERVICE[2]]: 'Máy lạnh', [METER_SERVICE[3]]: 'Nước', phiql: 'Phí QL',
}
const SVC_ORDER: ServiceId[] = [METER_SERVICE[1], METER_SERVICE[2], METER_SERVICE[3], 'phiql']

// Popup chọn khoản thu cho 1 khách: liệt kê từng (tháng × dịch vụ) còn nợ để chọn tháng lưu.
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
              <style>{`.cn-pick td,.cn-pick th{padding:5px 8px!important;white-space:nowrap}`}</style>
              <table className="dn-table cn-pick" style={{ fontSize: 11, width: '100%' }}>
                <thead><tr>
                  <th>Tháng</th><th>Khoản</th><th style={{ textAlign: 'right' }}>Phải thu</th>
                  <th style={{ textAlign: 'right' }}>Đã thu</th><th style={{ textAlign: 'right' }}>Còn nợ</th><th style={{ width: 52 }}></th>
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

// Bảng công nợ CHI TIẾT theo từng tháng — 1 bảng tổng (không tách đồng hồ).
// Mỗi khách 1 dòng; mỗi tháng 1 cột hiện Phải thu / Còn nợ; nút +/- mỗi tháng để bung chi tiết theo dịch vụ.
// Cột tổng: Phải thu / Đã thu / Còn nợ + ghi chú tự đếm số tháng chưa thu.
function CongNoMultiMonth({ readings, customers, usages, payments, month, meterNames, onCollect }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>; onCollect: (c: Customer) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (m: string) => setOpen(prev => { const n = new Set(prev); if (n.has(m)) n.delete(m); else n.add(m); return n })

  const months = Array.from(new Set(readings.map(r => r.month))).sort((a, b) => b.localeCompare(a)) // mới → cũ

  type Svc = { due: number; paid: number }
  type MCell = { due: number; paid: number; remain: number; svc: Map<ServiceId, Svc> }
  type Row = { c: Customer; m: Map<string, MCell>; totalDue: number; totalPaid: number; totalRemain: number; unpaid: number }
  const rowMap = new Map<string, Row>()
  const ensureRow = (c: Customer): Row => {
    let r = rowMap.get(c.id)
    if (!r) { r = { c, m: new Map(), totalDue: 0, totalPaid: 0, totalRemain: 0, unpaid: 0 }; rowMap.set(c.id, r) }
    return r
  }
  const ensureCell = (r: Row, m: string): MCell => {
    let x = r.m.get(m)
    if (!x) { x = { due: 0, paid: 0, remain: 0, svc: new Map() }; r.m.set(m, x) }
    return x
  }
  const ensureSvc = (cell: MCell, s: ServiceId): Svc => {
    let x = cell.svc.get(s)
    if (!x) { x = { due: 0, paid: 0 }; cell.svc.set(s, x) }
    return x
  }

  // Phải thu theo đồng hồ
  for (const r of readings) {
    const service = METER_SERVICE[r.meterId]
    for (const row of meterAllocation(r, customers, usages).rows) {
      if (row.amount <= 0) continue
      const cell = ensureCell(ensureRow(row.customer), r.month)
      ensureSvc(cell, service).due += row.amount; cell.due += row.amount
    }
  }
  // Phí quản lý
  for (const c of customers) for (const m of months) {
    const fee = managementFeeOf(c, m)
    if (fee > 0) { const cell = ensureCell(ensureRow(c), m); ensureSvc(cell, 'phiql').due += fee; cell.due += fee }
  }
  // Đã thu theo (tháng × dịch vụ)
  const custById = new Map(customers.map(c => [c.id, c]))
  for (const p of payments) {
    const R = rowMap.get(p.customerId); if (!R) continue
    const cell = R.m.get(p.month); if (!cell) continue
    const sv = cell.svc.get(paymentService(p, primaryService(custById.get(p.customerId)!)))
    if (sv) sv.paid += p.amount
  }
  // Chốt còn nợ + tổng + đếm số tháng chưa thu đủ
  for (const R of rowMap.values()) {
    for (const cell of R.m.values()) {
      let rem = 0
      for (const sv of cell.svc.values()) rem += Math.max(0, sv.due - sv.paid)
      cell.remain = rem; cell.paid = cell.due - rem
      R.totalDue += cell.due; R.totalRemain += rem
      if (cell.due > 0 && rem > 0) R.unpaid += 1
    }
    R.totalPaid = R.totalDue - R.totalRemain
  }

  const cmp = { numeric: true, sensitivity: 'base' } as const
  const rows = Array.from(rowMap.values()).filter(r => r.totalDue > 0)
    .sort((x, y) => (x.c.group?.trim() || 'zzz').localeCompare(y.c.group?.trim() || 'zzz', 'vi', cmp) || x.c.name.localeCompare(y.c.name, 'vi', cmp))

  const leadCols = 7 // Khách · Nhóm · Tổng phải thu · Tổng đã thu · Tổng còn nợ · Ghi chú · Thu tiền
  const sum = (fn: (r: Row) => number) => rows.reduce((s, r) => s + fn(r), 0)

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Công nợ theo tháng — {rows.length} khách · {months.length} tháng</span>
        <button className="btn-ghost" onClick={() => exportCongNo(readings, customers, usages, payments, month, meterNames)}>⬇ Xuất Excel (tháng {month})</button>
      </div>
      <div className="sc-body">
        <div className="dn-scroll">
        <table className="dn-table" style={{ fontSize: 12 }}>
          <thead><tr>
            <th>Khách hàng</th><th>Nhóm</th>
            <th style={{ textAlign: 'right' }}>Tổng phải thu</th>
            <th style={{ textAlign: 'right' }}>Tổng đã thu</th>
            <th style={{ textAlign: 'right' }}>Tổng còn nợ</th>
            <th style={{ textAlign: 'right' }}>Ghi chú</th>
            <th style={{ width: 92 }}></th>
            {months.map(m => (
              <th key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: m === month ? '#E0EDFA' : undefined }}>
                <button onClick={() => toggle(m)} title={open.has(m) ? 'Thu gọn dịch vụ' : 'Xem chi tiết theo dịch vụ'}
                  style={{ marginRight: 5, width: 16, height: 16, lineHeight: '13px', padding: 0, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: '1px solid var(--border2)', borderRadius: 4, background: '#fff', color: 'var(--navy)' }}>{open.has(m) ? '−' : '+'}</button>
                {m}{m === month ? ' ★' : ''}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={leadCols + months.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Chưa có dữ liệu công nợ.</td></tr>
            )}
            {rows.map(R => (
              <tr key={R.c.id}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{R.c.name}</td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{R.c.group?.trim() || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(R.totalDue)} đ</td>
                <td style={{ textAlign: 'right', color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmt(R.totalPaid)} đ</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: R.totalRemain > 0 ? '#DC2626' : 'var(--green)', whiteSpace: 'nowrap' }}>{fmt(R.totalRemain)} đ</td>
                <td style={{ textAlign: 'right' }}>{R.unpaid > 0 ? <span className="badge badge-red">{R.unpaid} tháng</span> : <span className="badge badge-green">Đủ</span>}</td>
                <td><button className="btn-ghost" onClick={() => onCollect(R.c)}>Thu tiền</button></td>
                {months.map(m => {
                  const cell = R.m.get(m)
                  const bg = m === month ? '#F2F7FD' : undefined
                  if (!cell || cell.due <= 0) return <td key={m} style={{ textAlign: 'right', color: 'var(--muted2)', background: bg }}>–</td>
                  return (
                    <td key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', background: bg }}>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{fmt(cell.due)}</div>
                      <div style={{ fontWeight: 700, color: cell.remain > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(cell.remain)}</div>
                      {open.has(m) && (
                        <div style={{ marginTop: 3, borderTop: '1px dashed var(--border3)', paddingTop: 3, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                          {SVC_ORDER.filter(s => (cell.svc.get(s)?.due ?? 0) > 0).map(s => {
                            const sv = cell.svc.get(s)!
                            const rem = Math.max(0, sv.due - sv.paid)
                            return <div key={s}>{SVC_LABEL[s]}: <b style={{ color: rem > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(rem)}</b></div>
                          })}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{ background: '#E0EDFA' }}>
              <td style={{ fontWeight: 700 }}>Tổng cộng</td><td></td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(sum(r => r.totalDue))} đ</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmt(sum(r => r.totalPaid))} đ</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: sum(r => r.totalRemain) > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(sum(r => r.totalRemain))} đ</td>
              <td></td><td></td>
              {months.map(m => {
                const mrem = sum(r => r.m.get(m)?.remain ?? 0)
                return <td key={m} style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', background: m === month ? '#D6E6F6' : undefined, color: mrem > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(mrem)}</td>
              })}
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

  return (
    <div>
      <CongNoMultiMonth readings={readings} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames} onCollect={setPicking} />
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
