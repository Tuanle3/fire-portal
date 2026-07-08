'use client'
import { useState } from 'react'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId,
  meterLabel, meterAllocation, remainderByBand, BAND_KEYS, BAND_LABELS,
} from '@/lib/dien-nuoc-types'
import { savePayment } from '@/lib/dien-nuoc-store'
import { exportCongNo } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function PaymentModal({ customerId, month, due, paid, onClose }: {
  customerId: string; month: string; due: number; paid: number; onClose: () => void
}) {
  const remain = Math.max(0, due - paid)
  const [amount, setAmount] = useState(remain)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (amount <= 0) return
    setSaving(true)
    const now = new Date().toISOString().slice(0, 10)
    await savePayment({ id: `p${Date.now()}`, customerId, month, amount, paidAt: now, note, createdAt: now })
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal">
        <div className="so-header">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Ghi nhận thu tiền</div>
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

function MeterAllocationCard({ meterId, reading, customers, usages, payments, month, meterNames, onCollect }: {
  meterId: MeterId; reading: MeterReading | undefined; customers: Customer[]; usages: CustomerUsage[]
  payments: Payment[]; month: string; meterNames: Record<number, string>; onCollect: (customerId: string, due: number, paid: number) => void
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

  const paidOf = (customerId: string) => payments.filter(p => p.customerId === customerId && p.month === month).reduce((s, p) => s + p.amount, 0)

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
                  <td><button className="btn-ghost" onClick={() => onCollect(r.customer.id, r.amount, paid)}>Thu tiền</button></td>
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

// Bảng tổng hợp phải trả / đã thu / còn nợ theo NHÓM khách hàng (gộp cả 3 đồng hồ).
function GroupSummaryCard({ readings, customers, usages, payments, month, meterNames }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>
}) {
  const monthReadings = readings.filter(r => r.month === month)
  const allRows = monthReadings.flatMap(r => meterAllocation(r, customers, usages).rows)
  const paidOf = (customerId: string) => payments.filter(p => p.customerId === customerId && p.month === month).reduce((s, p) => s + p.amount, 0)

  const groups = new Map<string, { due: number; paid: number; count: number }>()
  for (const r of allRows) {
    const g = r.customer.group?.trim() || 'Chưa phân nhóm'
    const cur = groups.get(g) ?? { due: 0, paid: 0, count: 0 }
    cur.due += r.amount
    cur.paid += paidOf(r.customer.id)
    cur.count += 1
    groups.set(g, cur)
  }
  const rows = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi'))
  const totalDue = rows.reduce((s, [, v]) => s + v.due, 0)
  const totalPaid = rows.reduce((s, [, v]) => s + v.paid, 0)

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Tổng hợp theo nhóm khách hàng — tháng {month}</span>
        <button className="btn-ghost" onClick={() => exportCongNo(readings, customers, usages, payments, month, meterNames)}>⬇ Xuất Excel</button>
      </div>
      <div className="sc-body">
        <div className="dn-scroll">
        <table className="dn-table">
          <thead><tr>
            <th>Nhóm</th><th style={{ textAlign: 'right' }}>Số KH</th><th style={{ textAlign: 'right' }}>Phải trả</th>
            <th style={{ textAlign: 'right' }}>Đã thu</th><th style={{ textAlign: 'right' }}>Còn nợ</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Chưa có dữ liệu tháng này.</td></tr>
            )}
            {rows.map(([g, v]) => {
              const remain = Math.max(0, v.due - v.paid)
              return (
                <tr key={g}>
                  <td style={{ fontWeight: 600 }}>{g}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{v.count}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(v.due)} đ</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmt(v.paid)} đ</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: remain > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(remain)} đ</td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ background: '#E0EDFA' }}>
                <td style={{ fontWeight: 700 }}>Tổng cộng</td>
                <td></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalDue)} đ</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmt(totalPaid)} đ</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: (totalDue - totalPaid) > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(Math.max(0, totalDue - totalPaid))} đ</td>
              </tr>
            </tfoot>
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
  const [collecting, setCollecting] = useState<{ customerId: string; due: number; paid: number } | null>(null)
  const byMeter = (id: MeterId) => readings.find(r => r.meterId === id && r.month === month)

  return (
    <div>
      <GroupSummaryCard readings={readings} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames} />
      {([1, 2, 3] as MeterId[]).map(id => (
        <MeterAllocationCard key={id} meterId={id} reading={byMeter(id)} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames}
          onCollect={(customerId, due, paid) => setCollecting({ customerId, due, paid })} />
      ))}
      {collecting && (
        <PaymentModal customerId={collecting.customerId} month={month} due={collecting.due} paid={collecting.paid} onClose={() => setCollecting(null)} />
      )}
    </div>
  )
}
