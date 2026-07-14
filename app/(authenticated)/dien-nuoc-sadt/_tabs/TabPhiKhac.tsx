'use client'
import { useState, useMemo, useEffect } from 'react'
import { Customer, OTHER_FEE_TYPES } from '@/lib/dien-nuoc-types'
import { saveCustomer, subscribeOtherFeeTypes, saveOtherFeeTypes, OtherFeeTypeDef } from '@/lib/dien-nuoc-store'
import { NumberInput } from '../_components/NumberInput'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

function slugify(label: string): string {
  return label.trim().toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a').replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i').replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u').replace(/[ỳýỵỷỹ]/g, 'y').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

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
  const [feeTypes, setFeeTypes] = useState<OtherFeeTypeDef[]>(OTHER_FEE_TYPES)
  const [feeTypeKey, setFeeTypeKey] = useState(OTHER_FEE_TYPES[0].key)
  const [floorFilter, setFloorFilter] = useState('')
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const [savingAll, setSavingAll] = useState(false)
  // Quản lý loại phí
  const [managingTypes, setManagingTypes] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [addingType, setAddingType] = useState(false)

  useEffect(() => {
    return subscribeOtherFeeTypes(OTHER_FEE_TYPES, types => {
      setFeeTypes(types)
      setFeeTypeKey(prev => types.find(t => t.key === prev) ? prev : types[0]?.key ?? '')
    })
  }, [])

  const months = useMemo(() => {
    const [y] = month.split('-')
    return monthRange(`${y}-01`, month, 12)
  }, [month])

  const floorOptions = useMemo(() => {
    const floors = Array.from(new Set(customers.map(c => c.floor?.trim()).filter((f): f is string => !!f)))
    return floors.sort((a, b) => { const [na, sa] = floorSortKey(a), [nb, sb] = floorSortKey(b); return na - nb || sa.localeCompare(sb, 'vi') })
  }, [customers])

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
  const isSaved  = (c: Customer) => c.otherFeesByType?.[feeTypeKey]?.[month] !== undefined
  const hasAnyData = (c: Customer) => Object.values(c.otherFeesByType?.[feeTypeKey] ?? {}).some(v => v > 0)

  const saveOne = async (c: Customer) => {
    const amount = Math.abs(drafts[c.id] ?? getSaved(c, month))
    const otherFeesByType = { ...(c.otherFeesByType ?? {}) }
    const byMonth = { ...(otherFeesByType[feeTypeKey] ?? {}) }
    if (amount > 0) byMonth[month] = amount; else delete byMonth[month]
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
    await Promise.all(displayed.filter(c => drafts[c.id] !== undefined || getSaved(c, month) > 0).map(saveOne))
    setSavingAll(false)
  }

  // Thêm loại phí mới
  const addFeeType = async () => {
    const label = newLabel.trim()
    if (!label) return
    const key = slugify(label) || `fee_${Date.now()}`
    if (feeTypes.find(t => t.key === key)) return
    setAddingType(true)
    const updated = [...feeTypes, { key, label }]
    await saveOtherFeeTypes(updated)
    setFeeTypeKey(key)
    setNewLabel('')
    setAddingType(false)
  }

  // Xóa loại phí (chỉ khi không có dữ liệu)
  const deleteFeeType = async (key: string) => {
    const hasData = customers.some(c => Object.keys(c.otherFeesByType?.[key] ?? {}).length > 0)
    if (hasData && !confirm('Loại phí này đang có dữ liệu. Vẫn xóa tên loại phí?')) return
    await saveOtherFeeTypes(feeTypes.filter(t => t.key !== key))
    if (feeTypeKey === key) setFeeTypeKey(feeTypes.find(t => t.key !== key)?.key ?? '')
  }

  const visibleRows = displayed.filter(c => hasAnyData(c) || drafts[c.id] !== undefined)
  const monthTotals = months.map(m => visibleRows.reduce((s, c) => s + (m === month ? getDraft(c) : getSaved(c, m)), 0))
  const cumTotals = monthTotals.reduce<number[]>((acc, v) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + v], [])

  const currentTypLabel = feeTypes.find(t => t.key === feeTypeKey)?.label ?? feeTypeKey

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
        {/* ── Thanh loại phí ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {feeTypes.map(ft => (
            <div key={ft.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <button
                onClick={() => { setFeeTypeKey(ft.key); setDrafts({}) }}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: managingTypes ? '6px 0 0 6px' : 6,
                  border: '1px solid', borderRight: managingTypes ? 'none' : undefined,
                  background: feeTypeKey === ft.key ? '#1E3A5F' : 'var(--card)',
                  color: feeTypeKey === ft.key ? '#fff' : 'var(--txt)',
                  borderColor: feeTypeKey === ft.key ? '#1E3A5F' : 'var(--border2)',
                  cursor: 'pointer', fontWeight: feeTypeKey === ft.key ? 700 : 400 }}>
                {ft.label}
              </button>
              {managingTypes && (
                <button onClick={() => deleteFeeType(ft.key)}
                  title="Xóa loại phí này"
                  style={{ fontSize: 11, padding: '5px 7px', borderRadius: '0 6px 6px 0', border: '1px solid #FCA5A5',
                    background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', lineHeight: 1 }}>
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Thêm loại phí mới */}
          {managingTypes ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: '#F0F5FF', border: '1px solid #C7D8F4', borderRadius: 8, padding: '4px 8px' }}>
              <input
                className="dn-input" style={{ width: 160, padding: '4px 8px', fontSize: 12 }}
                placeholder="Tên loại phí mới..." value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFeeType()}
                autoFocus />
              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={addFeeType} disabled={!newLabel.trim() || addingType}>
                {addingType ? '…' : '+ Thêm'}
              </button>
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setManagingTypes(false); setNewLabel('') }}>
                Xong
              </button>
            </div>
          ) : (
            <button className="btn-ghost"
              style={{ fontSize: 11, padding: '5px 10px', border: '1px dashed var(--border2)', borderRadius: 6, color: 'var(--muted)' }}
              onClick={() => setManagingTypes(true)}>
              ⚙ Quản lý loại phí
            </button>
          )}
        </div>

        <div style={{ background: '#EEF3FA', border: '1px solid #D0DCE8', borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12, color: 'var(--txt2)' }}>
          Nhập số tiền và bấm <b>Lưu</b>. Phí đã lưu sẽ tính vào <b>Công nợ</b>. Dùng ô <b>"+ Thêm khách"</b> để thêm khách vào danh sách.
        </div>

        {/* Ô tìm kiếm thêm khách */}
        <AddFeeRow customers={displayed} month={month} feeTypeKey={feeTypeKey}
          existing={visibleRows.map(c => c.id)} onAdded={() => setDrafts({})} />

        {visibleRows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: '20px 0' }}>
            Chưa có khách nào có <b>{currentTypLabel}</b> tháng này. Dùng ô trên để thêm.
          </div>
        ) : (
          <div className="dn-usage-wrap">
            <table className="dn-table">
              <thead>
                <tr className="dn-section-hdr">
                  <th className="dn-sticky-col" colSpan={3} style={{ left: 0, textAlign: 'left', fontSize: 11, letterSpacing: '.05em', borderRight: '2px solid var(--border3)' }}>
                    {currentTypLabel} — tháng {month}
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
                  const unsaved = !isSaved(c)
                  const changed = drafts[c.id] !== undefined
                  const cumulative = months.reduce((s, m) => s + (m === month ? draft : getSaved(c, m)), 0)
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
                              style={{ fontSize: 11, color: '#DC2626' }}>Xóa</button>
                          )}
                        </div>
                      </td>
                      {months.map(m => {
                        const v = m === month ? draft : getSaved(c, m)
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
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function AddFeeRow({ customers, month, feeTypeKey, existing, onAdded }: {
  customers: Customer[]; month: string; feeTypeKey: string; existing: string[]; onAdded: () => void
}) {
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState(0)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDrop, setShowDrop] = useState(false)

  const options = customers.filter(c => !existing.includes(c.id) && (
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.kioskCode ?? '').toLowerCase().includes(search.toLowerCase())
  )).slice(0, 8)

  const handleAdd = async () => {
    if (!selected || amount <= 0) return
    setSaving(true)
    const otherFeesByType = { ...(selected.otherFeesByType ?? {}) }
    otherFeesByType[feeTypeKey] = { ...(otherFeesByType[feeTypeKey] ?? {}), [month]: Math.abs(amount) }
    await saveCustomer({ ...selected, otherFeesByType })
    setSearch(''); setAmount(0); setSelected(null); setSaving(false); setShowDrop(false); onAdded()
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--card)', border: '1px dashed var(--border2)', borderRadius: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>+ Thêm khách:</span>
      <div style={{ position: 'relative' }}>
        <input className="dn-input" style={{ width: 200, padding: '5px 8px', fontSize: 12 }}
          placeholder="Tìm tên / mã ki-ốt..." value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); setShowDrop(true) }}
          onFocus={() => setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)} />
        {showDrop && search && !selected && options.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.12)', zIndex: 20, minWidth: 240 }}>
            {options.map(c => (
              <div key={c.id} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
                onMouseDown={() => { setSelected(c); setSearch(c.name); setShowDrop(false) }}>
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
