'use client'
import { useState, useMemo } from 'react'
import { Customer, OTHER_FEE_TYPES } from '@/lib/dien-nuoc-types'
import { saveCustomer } from '@/lib/dien-nuoc-store'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function floorSortKey(floor: string): [number, string] {
  const m = (floor || '').match(/\d+/)
  return [m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY, (floor || '').toLowerCase()]
}
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12); const nm = total % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}`
}
function monthRange(start: string, end: string, cap = 12): string[] {
  const out: string[] = []; let cur = start
  while (cur <= end && out.length < cap) { out.push(cur); cur = addMonths(cur, 1) }
  return out
}

export function TabPhiKhac({ customers, month }: { customers: Customer[]; month: string }) {
  const [feeTypeKey, setFeeTypeKey] = useState(OTHER_FEE_TYPES[0].key)
  const [floorFilter, setFloorFilter] = useState('')
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const [savingAll, setSavingAll] = useState(false)

  const months = useMemo(() => {
    const [y] = month.split('-')
    return monthRange(`${y}-01`, month, 12)
  }, [month])

  const floorOptions = useMemo(() => {
    const floors = Array.from(new Set(customers.map(c => c.floor?.trim()).filter((f): f is string => !!f)))
    return floors.sort((a, b) => { const [na, sa] = floorSortKey(a), [nb, sb] = floorSortKey(b); return na - nb || sa.localeCompare(sb, 'vi') })
  }, [customers])

  // Hiển thị: khách có entry cho fee type này (bất kỳ tháng nào) + khách có draft + filter tầng
  const displayed = useMemo(() => {
    const col = { numeric: true, sensitivity: 'base' } as const
    return [...customers]
      .filter(c => !floorFilter || (c.floor?.trim() || '') === floorFilter)
      .sort((a, b) => {
        const [na, sa] = floorSortKey(a.floor?.trim() || ''), [nb, sb] = floorSortKey(b.floor?.trim() || '')
        return na - nb || sa.localeCompare(sb, 'vi', col)
          || (a.kioskCode?.trim() || '').localeCompare(b.kioskCode?.trim() || '', 'vi', col)
          || a.name.localeCompare(b.name, 'vi', col)
      })
  }, [customers, floorFilter])

  const getSaved = (c: Customer, m: string) => c.otherFeesByType?.[feeTypeKey]?.[m] ?? 0
  const getDraft = (c: Customer) => drafts[c.id] !== undefined ? drafts[c.id] : getSaved(c, month)
  const isSaved = (c: Customer) => c.otherFeesByType?.[feeTypeKey]?.[month] !== undefined
  const hasAnyData = (c: Customer) => Object.values(c.otherFeesByType?.[feeTypeKey] ?? {}).some(v => v > 0)

  const saveOne = async (c: Customer) => {
    const amount = Math.abs(drafts[c.id] ?? getSaved(c, month))
    const otherFeesByType = { ...(c.otherFeesByType ?? {}) }
    const byMonth = { ...(otherFeesByType[feeTypeKey] ?? {}) }
    if (amount > 0) byMonth[month] = amount
    else delete byMonth[month]
    otherFeesByType[feeTypeKey] = byMonth
    await saveCustomer({ ...c, otherFeesByType })
    setDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n })
  }

  const deleteOne = async (c: Customer) => {
    const otherFeesByType = { ...(c.otherFeesByType ?? {}) }
    const byMonth = { ...(otherFeesByType[feeTypeKey] ?? {}) }
    delete byMonth[month]
    otherFeesByType[feeTypeKey] = byMonth
    await saveCustomer({ ...c, otherFeesByType })
    setDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n })
  }

  const saveAll = async () => {
    setSavingAll(true)
    const toSave = displayed.filter(c => drafts[c.id] !== undefined || getSaved(c, month) > 0)
    await Promise.all(toSave.map(saveOne))
    setSavingAll(false)
  }

  const histAmt = (c: Customer, m: string) => getSaved(c, m)
  const monthTotals = months.map(m => displayed.reduce((s, c) => s + (m === month ? getDraft(c) : histAmt(c, m)), 0))
  const cumTotals = monthTotals.reduce<number[]>((acc, v) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + v], [])

  // Chỉ hiển thị rows có data hoặc có draft (ẩn rows trống để bảng gọn)
  const visibleRows = displayed.filter(c => hasAnyData(c) || drafts[c.id] !== undefined || getSaved(c, month) > 0)

  return (
    <div className="sc sc--sticky">
      <div className="sc-head">
        <span className="sc-title">Phí khác — tháng {month}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label className="dn-label" style={{ margin: 0 }}>Tầng:</label>
            <select className="dn-input" style={{ width: 150, padding: '5px 8px' }} value={floorFilter} onChange={e => setFloorFilter(e.target.value)}>
              <option value="">Tất cả tầng</option>
              {floorOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </span>
          <button className="btn-primary" onClick={saveAll} disabled={savingAll}>
            {savingAll ? '…' : '✓ Lưu tất cả'}
          </button>
        </span>
      </div>
      <div className="sc-body">
        {/* Selector loại phí */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Loại phí:</span>
          {OTHER_FEE_TYPES.map(ft => (
            <button key={ft.key}
              onClick={() => { setFeeTypeKey(ft.key); setDrafts({}) }}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid',
                background: feeTypeKey === ft.key ? '#1E3A5F' : 'var(--card)',
                color: feeTypeKey === ft.key ? '#fff' : 'var(--txt)',
                borderColor: feeTypeKey === ft.key ? '#1E3A5F' : 'var(--border2)',
                cursor: 'pointer', fontWeight: feeTypeKey === ft.key ? 700 : 400 }}>
              {ft.label}
            </button>
          ))}
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
            (Thêm loại phí mới: liên hệ admin để cập nhật hệ thống)
          </span>
        </div>

        <div style={{ background: '#EEF3FA', border: '1px solid #D0DCE8', borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12, color: 'var(--txt2)' }}>
          Nhập số tiền và bấm <b>Lưu</b>. Phí đã lưu sẽ được tính vào <b>Công nợ</b> của khách hàng tương ứng.
          Chỉ hiển thị khách đã có phí hoặc đang nhập. Dùng ô nhập để thêm mới.
        </div>

        {/* Ô nhập nhanh để thêm khách mới */}
        <AddFeeRow customers={displayed} month={month} feeTypeKey={feeTypeKey}
          onAdded={() => setDrafts({})} existing={visibleRows.map(c => c.id)} />

        {visibleRows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: '20px 0' }}>
            Chưa có khách nào có {OTHER_FEE_TYPES.find(f => f.key === feeTypeKey)?.label ?? feeTypeKey} tháng này.
          </div>
        ) : (
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
                  <th className="dn-sticky-col dn-sticky-input" style={{ textAlign: 'right' }}>Số tiền tháng {month}</th>
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
                {visibleRows.map(c => {
                  const draft = getDraft(c)
                  const saved = getSaved(c, month)
                  const unsaved = !isSaved(c)
                  const changed = drafts[c.id] !== undefined
                  const cumulative = months.reduce((s, m) => s + (m === month ? draft : histAmt(c, m)), 0)
                  return (
                    <tr key={c.id}>
                      <td className="dn-sticky-col" style={{ fontWeight: 600 }}>
                        {c.name}
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>
                          {c.floor || '—'}{c.kioskCode ? ` · ${c.kioskCode}` : ''}
                        </div>
                      </td>
                      <td className="dn-sticky-col dn-sticky-input">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <NumberInput style={{ width: 120 }} value={draft}
                            onValueChange={v => setDrafts(prev => ({ ...prev, [c.id]: v }))} />
                          {unsaved && !changed && <span style={{ fontSize: 9.5, color: '#C87000' }}>chưa lưu</span>}
                        </div>
                      </td>
                      <td className="dn-sticky-col dn-sticky-btn" style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <button className="btn-ghost" onClick={() => saveOne(c)}
                            style={changed || unsaved ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>
                            Lưu
                          </button>
                          {!unsaved && (
                            <button className="btn-ghost" onClick={() => deleteOne(c)}
                              style={{ fontSize: 11, color: '#DC2626' }}>
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                      {months.map(m => {
                        const v = m === month ? draft : histAmt(c, m)
                        const noData = m === month ? unsaved : getSaved(c, m) === 0
                        return (
                          <td key={m} style={{ textAlign: 'right', whiteSpace: 'nowrap', background: m === month ? '#E0EDFA' : undefined }}>
                            {noData
                              ? <span style={{ color: 'var(--muted2)' }}>—</span>
                              : <span style={{ fontWeight: m === month ? 700 : undefined, color: 'var(--navy)', fontSize: m === month ? undefined : 11 }}>{fmt(v)}</span>}
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
              {visibleRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#E0EDFA' }}>
                    <td className="dn-sticky-col" style={{ background: '#E0EDFA', fontWeight: 700 }}>Tổng cộng</td>
                    <td className="dn-sticky-col dn-sticky-input" style={{ background: '#E0EDFA', textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>
                      {fmt(visibleRows.reduce((s, c) => s + getDraft(c), 0))} đ
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
        )}
      </div>
    </div>
  )
}

// Component nhỏ để thêm khách mới vào bảng
function AddFeeRow({ customers, month, feeTypeKey, onAdded, existing }: {
  customers: Customer[]; month: string; feeTypeKey: string; onAdded: () => void; existing: string[]
}) {
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState(0)
  const [saving, setSaving] = useState(false)

  const options = customers.filter(c => !existing.includes(c.id) && (
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.kioskCode?.toLowerCase().includes(search.toLowerCase())
  )).slice(0, 8)

  const [selected, setSelected] = useState<Customer | null>(null)

  const handleAdd = async () => {
    if (!selected || amount <= 0) return
    setSaving(true)
    const otherFeesByType = { ...(selected.otherFeesByType ?? {}) }
    otherFeesByType[feeTypeKey] = { ...(otherFeesByType[feeTypeKey] ?? {}), [month]: Math.abs(amount) }
    await saveCustomer({ ...selected, otherFeesByType })
    setSearch(''); setAmount(0); setSelected(null); setSaving(false); onAdded()
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--card)', border: '1px dashed var(--border2)', borderRadius: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>+ Thêm khách:</span>
      <div style={{ position: 'relative' }}>
        <input className="dn-input" style={{ width: 200, padding: '5px 8px', fontSize: 12 }}
          placeholder="Tìm khách hàng..." value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null) }} />
        {search && !selected && options.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.12)', zIndex: 20, minWidth: 220 }}>
            {options.map(c => (
              <div key={c.id} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
                onMouseDown={() => { setSelected(c); setSearch(c.name) }}>
                <b>{c.name}</b> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.floor} · {c.kioskCode}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <NumberInput style={{ width: 130 }} value={amount} onValueChange={setAmount} />
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>đ</span>
      <button className="btn-primary" style={{ fontSize: 12, padding: '5px 14px' }}
        onClick={handleAdd} disabled={!selected || amount <= 0 || saving}>
        {saving ? '…' : 'Thêm & Lưu'}
      </button>
    </div>
  )
}
