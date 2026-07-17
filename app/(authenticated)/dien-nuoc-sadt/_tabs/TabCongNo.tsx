'use client'
import { useState } from 'react'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, ServiceId,
  meterAllocation, METER_SERVICE, primaryService, paymentService,
} from '@/lib/dien-nuoc-types'
import { savePayment, deletePayment, saveCustomer } from '@/lib/dien-nuoc-store'
import { exportCongNo, exportThuTien } from '@/lib/dien-nuoc-excel'
import { NumberInput } from '../_components/NumberInput'
import { PhieuThongBaoModal } from './PhieuThongBao'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function PaymentModal({ customerId, customerName, month, due, paid, service, label, editPayment, onClose }: {
  customerId: string; customerName: string; month: string; due: number; paid: number; service: ServiceId; label: string
  editPayment?: Payment; onClose: () => void
}) {
  const remain = Math.max(0, due - paid)
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount] = useState(editPayment?.amount ?? remain)
  const [paidAt, setPaidAt] = useState(editPayment?.paidAt ?? today)
  const [method, setMethod] = useState<'transfer' | 'cash'>(editPayment?.paymentMethod ?? 'transfer')
  const [bankAccount, setBankAccount] = useState(editPayment?.bankAccount ?? '')
  const [transactionRef, setTransactionRef] = useState(editPayment?.transactionRef ?? '')
  const [note, setNote] = useState(editPayment?.note ?? '')
  const [saving, setSaving] = useState(false)
  const isEdit = !!editPayment
  const isOver = !isEdit && amount > remain && remain > 0

  const submit = async () => {
    if (amount <= 0) return
    setSaving(true)
    const p: Parameters<typeof savePayment>[0] = {
      id: editPayment?.id ?? `p${Date.now()}`, customerId, month, amount, paidAt: paidAt || today,
      note, service, createdAt: editPayment?.createdAt ?? today, paymentMethod: method,
      ...(method === 'transfer' && bankAccount ? { bankAccount } : {}),
      ...(transactionRef ? { transactionRef } : {}),
    }
    await savePayment(p)
    setSaving(false)
    onClose()
  }

  const radioStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '5px 12px',
    borderRadius: 7, border: `1px solid ${active ? 'var(--navy)' : 'var(--border2)'}`,
    background: active ? '#EEF3FA' : '#fff', fontWeight: active ? 700 : 400,
    color: active ? 'var(--navy)' : 'var(--muted)', fontSize: 12,
  })

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal" style={{ maxWidth: 460 }}>
        <div className="so-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{isEdit ? '✏️ Sửa khoản thu' : customerName}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{isEdit ? `${customerName} · ${label}` : label}</div>
          </div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tóm tắt khoản nợ */}
        <div style={{ padding: '10px 20px', background: '#F8FAFC', borderBottom: '1px solid var(--border3)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Phải thu', val: due, color: 'var(--txt)' },
            { label: 'Đã thu', val: paid, color: 'var(--green)' },
            { label: 'Còn nợ', val: remain, color: remain > 0 ? '#DC2626' : 'var(--green)' },
          ].map(x => (
            <div key={x.label}>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{x.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: x.color }}>{fmt(x.val)} đ</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {/* Ngày thanh toán */}
          <div className="so-field so-field--full">
            <label className="so-label">Ngày thanh toán</label>
            <input className="so-input" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
          </div>

          {/* Số tiền */}
          <div className="so-field so-field--full">
            <label className="so-label">Số tiền nhận {isOver && <span style={{ color: '#D97706', fontWeight: 600 }}>⚠ vượt {fmt(amount - remain)} đ so nợ còn lại</span>}</label>
            <NumberInput className="so-input" value={amount} onValueChange={setAmount} />
          </div>

          {/* Hình thức */}
          <div className="so-field so-field--full">
            <label className="so-label">Hình thức thanh toán</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={radioStyle(method === 'transfer')}><input type="radio" style={{ display: 'none' }} checked={method === 'transfer'} onChange={() => setMethod('transfer')} />💳 Chuyển khoản</label>
              <label style={radioStyle(method === 'cash')}><input type="radio" style={{ display: 'none' }} checked={method === 'cash'} onChange={() => setMethod('cash')} />💵 Tiền mặt</label>
            </div>
          </div>

          {/* TK nhận (chỉ khi CK) */}
          {method === 'transfer' && (
            <div className="so-field so-field--full">
              <label className="so-label">Tài khoản nhận tiền</label>
              <input className="so-input" placeholder="VD: BIDV 1234567890" value={bankAccount} onChange={e => setBankAccount(e.target.value)} />
            </div>
          )}

          {/* Mã giao dịch */}
          <div className="so-field so-field--full">
            <label className="so-label">Mã giao dịch / số chứng từ (tuỳ chọn)</label>
            <input className="so-input" placeholder="Mã chuyển khoản, số phiếu thu…" value={transactionRef} onChange={e => setTransactionRef(e.target.value)} />
          </div>

          {/* Ghi chú */}
          <div className="so-field so-field--full">
            <label className="so-label">Ghi chú (tuỳ chọn)</label>
            <input className="so-input" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="so-footer">
          <button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>Hủy</button>
          <button className="so-save" onClick={submit} disabled={saving || amount <= 0}>{saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Xác nhận thu'}</button>
        </div>
      </div>
    </>
  )
}

type CollectArgs = { customerId: string; customerName: string; month: string; due: number; paid: number; service: ServiceId; label: string; editPayment?: Payment }

const SVC_LABEL: Record<string, string> = {
  [METER_SERVICE[1]]: 'Điện CS', [METER_SERVICE[2]]: 'Máy lạnh', [METER_SERVICE[3]]: 'Nước', phiql: 'Phí QL', phi_khac: 'Phí khác',
}
const SVC_ORDER: ServiceId[] = [METER_SERVICE[1], METER_SERVICE[2], METER_SERVICE[3], 'phiql', 'phi_khac']

const METHOD_LABEL: Record<string, string> = { transfer: 'CK', cash: 'TM' }

// Modal chốt PQL cộng dồn thành 1 khoản công nợ trong tháng hiện tại
function ChotPQLModal({ customer, currentMonth, onClose }: {
  customer: Customer; currentMonth: string; onClose: () => void
}) {
  const accrued = customer.feeAccruedByMonth ?? {}
  const entries = Object.entries(accrued).sort(([a], [b]) => a.localeCompare(b))
  const total = entries.reduce((s, [, v]) => s + v, 0)
  const today = new Date().toISOString().slice(0, 10)
  const [saving, setSaving] = useState(false)

  const handleChot = async () => {
    setSaving(true)
    const feeByMonth = { ...(customer.feeByMonth ?? {}), [currentMonth]: (customer.feeByMonth?.[currentMonth] ?? 0) + total }
    const historyEntry = { settledAt: today, settledMonth: currentMonth, total, breakdown: { ...accrued } }
    const feeAccruedSettledHistory = [...(customer.feeAccruedSettledHistory ?? []), historyEntry]
    await saveCustomer({ ...customer, feeByMonth, feeAccruedByMonth: {}, feeAccruedSettledHistory })
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal" style={{ maxWidth: 460 }}>
        <div className="so-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Chốt PQL cộng dồn — {customer.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Gộp thành 1 khoản trong tháng {currentMonth}</div>
          </div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <table className="dn-table" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>Tháng cộng dồn</th>
              <th style={{ textAlign: 'right' }}>Số tiền PQL</th>
            </tr></thead>
            <tbody>
              {entries.map(([m, v]) => (
                <tr key={m}>
                  <td>{m}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(v)} đ</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: '#E0EDFA' }}>
              <td style={{ fontWeight: 700 }}>Tổng chốt</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{fmt(total)} đ</td>
            </tr></tfoot>
          </table>
          <div style={{ padding: '10px 14px', background: '#FFF7E8', borderRadius: 8, border: '1px solid #F0D080', fontSize: 12, color: '#78350F', lineHeight: 1.6 }}>
            Sau khi chốt, <b>{fmt(total)} đ</b> sẽ xuất hiện trong công nợ tháng <b>{currentMonth}</b>. Chi tiết từng tháng được lưu lại để truy xuất. Thu tiền bình thường qua nút <b>Thu tiền</b>.
          </div>
        </div>
        <div className="so-footer">
          <button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>Hủy</button>
          <button className="so-save" onClick={handleChot} disabled={saving || total <= 0}>
            {saving ? 'Đang lưu…' : `✓ Chốt ${fmt(total)} đ`}
          </button>
        </div>
      </div>
    </>
  )
}

// Popup chọn tháng thu cho 1 khách — 1 dòng/tháng, tổng phải thu (không tách dịch vụ).
function CollectPickerModal({ customer, readings, customers, usages, payments, currentMonth, onPick, onClose }: {
  customer: Customer; readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]
  currentMonth: string; onPick: (a: CollectArgs) => void; onClose: () => void
}) {
  // Auto-expand tháng đã có phiếu thu để user thấy ngay không cần click tìm
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const p of payments.filter(p => p.customerId === customer.id)) s.add(p.month)
    return s
  })
  const toggleExpand = (m: string) => setExpanded(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n })
  const [editingDebt, setEditingDebt] = useState(false)
  const [debtInput, setDebtInput] = useState(String(customer.oldDebt ?? ''))
  const [savingDebt, setSavingDebt] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const saveOldDebt = async () => {
    setSavingDebt(true)
    const val = parseFloat(debtInput.replace(/[^0-9.]/g, '')) || 0
    await saveCustomer({ ...customer, oldDebt: val > 0 ? val : undefined })
    setSavingDebt(false)
    setEditingDebt(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await deletePayment(id)
    setDeletingId(null)
  }

  const months = Array.from(new Set(readings.map(r => r.month))).sort()
  const primary = primaryService(customer)

  // Phải thu: tổng tất cả dịch vụ trong tháng
  const dueByMonth = new Map<string, number>()
  for (const m of months) {
    let due = 0
    for (const id of [1, 2, 3] as MeterId[]) {
      const r = readings.find(x => x.meterId === id && x.month === m)
      if (!r) continue
      const row = meterAllocation(r, customers, usages).rows.find(rr => rr.customer.id === customer.id)
      if (row && row.amount > 0) due += row.amount
    }
    const phiql = customer.feeByMonth?.[m]; if (phiql) due += phiql
    if (due > 0) dueByMonth.set(m, due)
  }

  // Đã thu: tổng tất cả khoản thu trong tháng (không tách dịch vụ)
  const histByMonth = new Map<string, Payment[]>()
  for (const p of payments.filter(p => p.customerId === customer.id)) {
    if (!histByMonth.has(p.month)) histByMonth.set(p.month, [])
    histByMonth.get(p.month)!.push(p)
  }
  for (const [, arr] of histByMonth) arr.sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''))

  type Item = { month: string; due: number; paid: number; remain: number; history: Payment[] }
  const items: Item[] = Array.from(dueByMonth.entries()).map(([m, due]) => {
    const history = histByMonth.get(m) ?? []
    const paid = history.reduce((s, p) => s + p.amount, 0)
    return { month: m, due, paid, remain: 0, history }
  })

  // Sổ cái theo tháng: còn nợ = phải thu − đã thu (có thể âm nếu trả dư)
  const oldDebtDue = customer.oldDebt ?? 0
  for (const it of items) it.remain = it.due - it.paid

  items.sort((a, b) => a.month.localeCompare(b.month))

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal" style={{ maxWidth: 700, width: '96vw' }}>
        <div className="so-header">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Thu tiền — {customer.name}</div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '10px 14px', maxHeight: '65vh', overflowY: 'auto' }}>
          <style>{`.cn-pick td,.cn-pick th{padding:5px 10px!important;white-space:nowrap;font-size:12px}`}</style>

          {/* Nợ cũ trước hệ thống */}
          <div style={{ marginBottom: 10, padding: '8px 12px', background: '#FFF7E8', borderRadius: 8, border: '1px solid #F0D080', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#8A5A12' }}>Nợ cũ (trước hệ thống):</span>
            {editingDebt ? (
              <>
                <input style={{ width: 130, padding: '3px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 12 }}
                  value={debtInput} onChange={e => setDebtInput(e.target.value)} placeholder="0" autoFocus />
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={saveOldDebt} disabled={savingDebt}>{savingDebt ? '…' : 'Lưu'}</button>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditingDebt(false)}>Hủy</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                  {oldDebtDue > 0 ? `${fmt(oldDebtDue)} đ` : '—'}
                </span>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setDebtInput(String(customer.oldDebt ?? '')); setEditingDebt(true) }}>
                  {oldDebtDue > 0 ? '✏️ Sửa' : '+ Nhập nợ cũ'}
                </button>
              </>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 8 }}>Khách này chưa có khoản phải thu theo tháng.</div>
          ) : (() => {
            // Lũy kế: bắt đầu từ nợ cũ, cộng dồn (phải thu − đã thu) từng tháng
            let cumRun = oldDebtDue
            const cumByMonth = new Map<string, number>()
            for (const it of items) { cumRun += it.remain; cumByMonth.set(it.month, cumRun) }
            const totalRemain = cumRun
            const displayItems = items
            return (
              <table className="dn-table cn-pick" style={{ width: '100%' }}>
                <thead><tr>
                  <th>Tháng</th>
                  <th style={{ textAlign: 'right' }}>Phải thu (đ)</th>
                  <th style={{ textAlign: 'right' }}>Đã thu (đ)</th>
                  <th style={{ textAlign: 'right' }}>Còn nợ (đ)</th>
                  <th style={{ textAlign: 'right', background: '#E8F0FB' }}>Lũy kế (đ)</th>
                  <th style={{ width: 64, textAlign: 'center' }}></th>
                </tr></thead>
                <tbody>
                  {displayItems.map((it) => {
                    const isOpen = expanded.has(it.month)
                    const cum = cumByMonth.get(it.month) ?? 0
                    return (
                      <>
                        <tr key={it.month} style={{ background: it.remain <= 0 ? '#F8FBF5' : '#FEF9F9' }}>
                          <td style={{ fontWeight: 600 }}>· {it.month}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(it.due)}</td>
                          <td style={{ textAlign: 'right', color: it.paid > 0 ? 'var(--green)' : 'var(--muted2)' }}>{fmt(it.paid)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: it.remain > 0 ? '#DC2626' : it.remain < 0 ? 'var(--green)' : 'var(--muted)' }}>
                            {it.remain < 0 ? `(${fmt(-it.remain)})` : fmt(it.remain)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, background: '#F0F5FF', color: cum > 0 ? '#8A3A8A' : cum < 0 ? 'var(--green)' : 'var(--muted)' }}>
                            {cum < 0 ? `(${fmt(-cum)})` : fmt(cum)}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              {it.history.length > 0 && (
                                <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--navy)' }}
                                  onClick={() => toggleExpand(it.month)} title={isOpen ? 'Ẩn phiếu thu' : 'Xem/Sửa phiếu thu'}>
                                  📋 {it.history.length} phiếu {isOpen ? '▴' : '▾'}
                                </button>
                              )}
                              <button className="btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }}
                                onClick={() => onPick({ customerId: customer.id, customerName: customer.name, month: it.month, due: it.due, paid: it.paid, service: primary, label: it.month })}>
                                + Thu
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && it.history.map((p, pi) => (
                          <tr key={`${it.month}-h${pi}`} style={{ background: '#EFF4FF' }}>
                            <td colSpan={2} style={{ color: '#5B6A80', fontSize: 11, paddingLeft: 20 }}>
                              <span style={{ fontWeight: 600 }}>📅 {p.paidAt || '—'}</span>
                              {p.paymentMethod && <span style={{ marginLeft: 6, background: p.paymentMethod === 'transfer' ? '#EEF3FA' : '#F0F8EC', color: p.paymentMethod === 'transfer' ? 'var(--navy)' : '#3A7A1A', borderRadius: 4, padding: '1px 5px', fontSize: 10.5 }}>{METHOD_LABEL[p.paymentMethod]}</span>}
                              {p.bankAccount && <span style={{ marginLeft: 5, color: 'var(--muted)' }}>· {p.bankAccount}</span>}
                              {p.transactionRef && <span style={{ marginLeft: 5, color: '#9B59B6' }}>#{p.transactionRef}</span>}
                              {p.note && <span style={{ marginLeft: 5, fontStyle: 'italic', color: 'var(--muted)' }}>{p.note}</span>}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{fmt(p.amount)}</td>
                            <td colSpan={2} style={{ background: '#EBF0FF' }}></td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--navy)' }}
                                  onClick={() => onPick({ customerId: customer.id, customerName: customer.name, month: it.month, due: it.due, paid: it.paid, service: primary, label: it.month, editPayment: p })}>
                                  ✏️ Sửa
                                </button>
                                <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#DC2626', opacity: deletingId === p.id ? 0.4 : 1 }}
                                  onClick={() => handleDelete(p.id)} disabled={deletingId === p.id}>
                                  🗑️ Xóa
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </tbody>
                <tfoot><tr style={{ background: '#EEF3FA' }}>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>Tổng còn nợ:</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: totalRemain > 0 ? '#DC2626' : totalRemain < 0 ? 'var(--green)' : 'var(--muted)' }}>
                    {totalRemain < 0 ? `(${fmt(-totalRemain)})` : fmt(totalRemain)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 900, background: '#E0E8FF', color: totalRemain > 0 ? '#8A3A8A' : totalRemain < 0 ? 'var(--green)' : 'var(--muted)' }}>
                    {totalRemain < 0 ? `(${fmt(-totalRemain)})` : fmt(totalRemain)}
                  </td>
                  <td></td>
                </tr></tfoot>
              </table>
            )
          })()}
        </div>
        <div className="so-footer"><button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>Đóng</button></div>
      </div>
    </>
  )
}

// Bảng công nợ CHI TIẾT theo từng tháng — 1 bảng tổng (không tách đồng hồ).
// Mỗi khách 1 dòng; mỗi tháng 1 cột hiện Phải thu / Còn nợ; nút +/- mỗi tháng để bung chi tiết theo dịch vụ.
// Cột tổng: Phải thu / Đã thu / Còn nợ + ghi chú tự đếm số tháng chưa thu.
function CongNoMultiMonth({ readings, customers, usages, payments, month, meterNames, onCollect, onPrint }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>; onCollect: (c: Customer) => void; onPrint: (c: Customer) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (m: string) => setOpen(prev => { const n = new Set(prev); if (n.has(m)) n.delete(m); else n.add(m); return n })
  const [chotting, setChotting] = useState<Customer | null>(null)
  const [filterName, setFilterName] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'con-no' | 'du'>('all')
  const [filterMonths, setFilterMonths] = useState('')

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
  // Phí quản lý — chỉ tính các tháng đã nhập tay và Lưu trong tab Phí quản lý (feeByMonth)
  for (const c of customers) for (const m of months) {
    const fee = c.feeByMonth?.[m] ?? 0
    if (fee > 0) { const cell = ensureCell(ensureRow(c), m); ensureSvc(cell, 'phiql').due += fee; cell.due += fee }
  }
  // Phí khác (mở lại điện, thu rác,...) — tổng tất cả loại phí cho tháng đó
  for (const c of customers) for (const m of months) {
    const total = Object.values(c.otherFeesByType ?? {}).reduce((s, byMonth) => s + (byMonth[m] ?? 0), 0)
    if (total > 0) { const cell = ensureCell(ensureRow(c), m); ensureSvc(cell, 'phi_khac').due += total; cell.due += total }
  }
  // Đã thu theo tháng (tổng, không tách dịch vụ)
  for (const p of payments) {
    const R = rowMap.get(p.customerId); if (!R) continue
    const cell = R.m.get(p.month); if (!cell) continue
    cell.paid += p.amount
  }
  // Chốt còn nợ: gộp toàn bộ tiền đã thu → trả nợ theo thứ tự: nợ cũ trước, rồi tháng cũ→mới
  for (const R of rowMap.values()) {
    const sortedMonths = Array.from(R.m.keys()).sort()
    let pool = Array.from(R.m.values()).reduce((s, c) => s + c.paid, 0)
    const oldDebt = R.c.oldDebt ?? 0
    R.totalDue += oldDebt
    if (pool >= oldDebt) pool -= oldDebt
    else pool = 0
    for (const m of sortedMonths) {
      const cell = R.m.get(m)!
      R.totalDue += cell.due
      if (pool >= cell.due) { cell.remain = 0; pool -= cell.due }
      else { cell.remain = cell.due - pool; pool = 0 }
      R.totalRemain += cell.remain
      if (cell.due > 0 && cell.remain >= 5000) R.unpaid += 1
    }
    R.totalPaid = Array.from(R.m.values()).reduce((s, c) => s + c.paid, 0)
    R.totalRemain = Math.max(0, R.totalDue - R.totalPaid)
  }

  // PQL cộng dồn (tích lũy chưa có KT) — KHÔNG tính vào công nợ phải thu / cảnh báo quá hạn
  const accruedPQL = (c: Customer) => Object.values(c.feeAccruedByMonth ?? {}).reduce((s, v) => s + Math.abs(v), 0)

  // Đưa khách chỉ có PQL cộng dồn (không có totalDue) vào bảng để hiển thị
  for (const c of customers) {
    if (accruedPQL(c) > 0 && !rowMap.has(c.id)) {
      rowMap.set(c.id, { c, m: new Map(), totalDue: 0, totalPaid: 0, totalRemain: 0, unpaid: 0 })
    }
  }

  const cmp = { numeric: true, sensitivity: 'base' } as const
  const allGroups = Array.from(new Set(customers.map(c => c.group?.trim()).filter(Boolean))).sort((a, b) => a!.localeCompare(b!, 'vi', cmp)) as string[]
  const rows = Array.from(rowMap.values()).filter(r => r.totalDue > 0 || accruedPQL(r.c) > 0)
    .sort((x, y) => (x.c.group?.trim() || 'zzz').localeCompare(y.c.group?.trim() || 'zzz', 'vi', cmp) || x.c.name.localeCompare(y.c.name, 'vi', cmp))
    .filter(r => !filterName || r.c.name.toLowerCase().includes(filterName.toLowerCase()))
    .filter(r => !filterGroup || (r.c.group?.trim() || '') === filterGroup)
    .filter(r => filterStatus === 'all' || (filterStatus === 'con-no' ? r.totalRemain > 0 : r.totalRemain <= 0))
    .filter(r => !filterMonths || r.unpaid === Number(filterMonths))

  const leadCols = 9 // Khách · Nhóm · Tổng phải thu · Tổng đã thu · Tổng còn nợ · PQL cộng dồn · Ghi chú · Thu tiền · In phiếu
  const sum = (fn: (r: Row) => number) => rows.reduce((s, r) => s + fn(r), 0)

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-title">Công nợ theo tháng — {rows.length} khách · {months.length} tháng</span>
        <button className="btn-ghost" onClick={() => exportCongNo(readings, customers, usages, payments, month, meterNames).catch(console.error)}>⬇ Công nợ</button>
        <button className="btn-ghost" onClick={() => exportThuTien(readings, customers, usages, payments, month).catch(console.error)}>⬇ Thu tiền</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0 4px', flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="🔍 Tìm tên khách hàng…" value={filterName}
          onChange={e => setFilterName(e.target.value)}
          style={{ border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, minWidth: 200, background: 'var(--card)', color: 'var(--text)' }}
        />
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
          style={{ border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, background: 'var(--card)', color: 'var(--text)' }}>
          <option value="">Tất cả nhóm</option>
          {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'con-no' | 'du')}
          style={{ border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, background: 'var(--card)', color: 'var(--text)' }}>
          <option value="all">Tất cả trạng thái</option>
          <option value="con-no">Còn nợ</option>
          <option value="du">Đã đủ</option>
        </select>
        <select value={filterMonths} onChange={e => setFilterMonths(e.target.value)}
          style={{ border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, background: 'var(--card)', color: 'var(--text)' }}>
          <option value="">Tất cả tháng nợ</option>
          {Array.from(new Set(Array.from(rowMap.values()).filter(r => r.unpaid > 0).map(r => r.unpaid))).sort((a, b) => a - b)
            .map(n => <option key={n} value={n}>{n} tháng</option>)}
        </select>
        {(filterName || filterGroup || filterStatus !== 'all' || filterMonths) && (
          <button className="btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }}
            onClick={() => { setFilterName(''); setFilterGroup(''); setFilterStatus('all'); setFilterMonths('') }}>
            ✕ Xóa lọc
          </button>
        )}
      </div>
      <style>{`.cn-mm-scroll .dn-table thead th { top: 0 !important; } .cn-mm-scroll .dn-table tfoot tr { position: sticky; bottom: 0; z-index: 4; }`}</style>
      <div className="dn-scroll cn-mm-scroll" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        <table className="dn-table" style={{ fontSize: 12 }}>
          <thead><tr>
            <th>Khách hàng</th><th>Nhóm</th>
            <th style={{ textAlign: 'right' }}>Tổng phải thu</th>
            <th style={{ textAlign: 'right' }}>Tổng đã thu</th>
            <th style={{ textAlign: 'right' }}>Tổng còn nợ</th>
            <th style={{ textAlign: 'right', color: '#92400E', whiteSpace: 'nowrap' }} title="Phí quản lý tích lũy khi chưa có khách thuê — không tính vào cảnh báo quá hạn">PQL cộng dồn</th>
            <th style={{ textAlign: 'right' }}>Ghi chú</th>
            <th style={{ width: 80 }}></th>
            <th style={{ width: 72 }}></th>
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
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: accruedPQL(R.c) > 0 ? '#92400E' : 'var(--muted2)' }}>
                  {accruedPQL(R.c) > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontWeight: 600 }}>{fmt(accruedPQL(R.c))} đ</span>
                      {R.c.feeByMonth?.[month] != null && (
                        <span style={{ fontSize: 10, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 4, fontWeight: 600, letterSpacing: '.02em' }}>
                          ⚠ Đề xuất chốt
                        </span>
                      )}
                      <button className="btn-ghost" style={{ fontSize: 10.5, padding: '2px 8px', color: '#92400E', borderColor: '#D97706' }}
                        onClick={() => setChotting(R.c)}>
                        → Chốt
                      </button>
                    </div>
                  ) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>{R.unpaid > 0 ? <span className="badge badge-red">{R.unpaid} tháng</span> : <span className="badge badge-green">Đủ</span>}</td>
                <td><button className="btn-ghost" onClick={() => onCollect(R.c)}>Thu tiền</button></td>
                <td><button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => onPrint(R.c)}>🖨️ In phiếu</button></td>
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
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#92400E' }}>{fmt(rows.reduce((s, r) => s + accruedPQL(r.c), 0))} đ</td>
              <td></td><td></td><td></td>
              {months.map(m => {
                const mrem = sum(r => r.m.get(m)?.remain ?? 0)
                return <td key={m} style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', background: m === month ? '#D6E6F6' : undefined, color: mrem > 0 ? '#DC2626' : 'var(--green)' }}>{fmt(mrem)}</td>
              })}
            </tr></tfoot>
          )}
        </table>
      </div>
      {chotting && (
        <ChotPQLModal customer={chotting} currentMonth={month} onClose={() => setChotting(null)} />
      )}
    </div>
  )
}

export function TabCongNo({ readings, customers: allCustomers, usages, payments, month, meterNames }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>
}) {
  const customers = allCustomers.filter(c => !c.internalSA)
  const [collecting, setCollecting] = useState<CollectArgs | null>(null)
  const [picking, setPicking] = useState<Customer | null>(null)
  const [printing, setPrinting] = useState<Customer | null>(null)

  return (
    <div>
      <CongNoMultiMonth readings={readings} customers={customers} usages={usages} payments={payments} month={month} meterNames={meterNames} onCollect={setPicking} onPrint={setPrinting} />
      {picking && (
        <CollectPickerModal customer={picking} readings={readings} customers={customers} usages={usages} payments={payments}
          currentMonth={month} onPick={a => { setPicking(null); setCollecting(a) }} onClose={() => setPicking(null)} />
      )}
      {collecting && (
        <PaymentModal customerId={collecting.customerId} customerName={collecting.customerName} month={collecting.month} due={collecting.due} paid={collecting.paid}
          service={collecting.service} label={collecting.label} editPayment={collecting.editPayment} onClose={() => setCollecting(null)} />
      )}
      {printing && (
        <PhieuThongBaoModal customer={printing} readings={readings} usages={usages} month={month} onClose={() => setPrinting(null)} />
      )}
    </div>
  )
}
