'use client'
import { useState, useEffect, useMemo } from 'react'
import { getNganSach } from '@/lib/ngan-sach-store'
import { NganSachThang } from '@/lib/ngan-sach-types'

type PeriodView = 'day' | 'week' | 'month' | 'quarter'

interface Props {
  month: string            // "2026-07" — currently selected month
  localData: NganSachThang
  tonDauKy: number         // opening balance of selected month (from Firebase)
  tonQuyRealtime: number   // current real-time balance
  kmcpActual: Record<string, number>
}

interface PeriodRow {
  key: string
  label: string
  sublabel: string
  openingBal: number
  thu: number
  chi: number
  netFlow: number
  closingBal: number
  isPast: boolean
  isCurrent: boolean
  items: { id: string; nhom: 'B' | 'C'; dien_giai: string; so: number; ngay?: string }[]
  expanded?: boolean
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sumBC(d: NganSachThang, kma?: Record<string, number>) {
  let B = 0, C = 0
  // standalone items
  for (const it of d.items) {
    if (it.is_section || it.is_group || it.parent_id) continue
    const auto = kma && it.kmcp ? kma[it.kmcp] : undefined
    const val = (auto !== undefined ? auto : it.ke_hoach)
    if (it.nhom === 'B') B += val
    if (it.nhom === 'C') C += val
  }
  // group children
  for (const it of d.items) {
    if (!it.is_group) continue
    for (const child of d.items.filter(x => x.parent_id === it.id)) {
      const auto = kma && child.kmcp ? kma[child.kmcp] : undefined
      const val = (auto !== undefined ? auto : child.ke_hoach)
      if (it.nhom === 'B') B += val
      if (it.nhom === 'C') C += val
    }
  }
  return { B, C }
}

function isoWeek(d: Date): number {
  const tmp = new Date(d)
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const w = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(((tmp.getTime() - w.getTime()) / 86400000 - 3 + (w.getDay() + 6) % 7) / 7)
}

function viDay(d: Date) {
  const days = ['CN', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7']
  return days[d.getDay()]
}

const VND = (n: number) => Math.abs(n) >= 1e9
  ? `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  : Math.abs(n) >= 1e6
  ? `${(n / 1e6).toFixed(0)}M`
  : n.toLocaleString('vi-VN')

const VND_FULL = (n: number) => n === 0 ? '—' : n.toLocaleString('vi-VN')

const numColor = (n: number) => n < 0 ? '#B91C1C' : n > 0 ? '#166534' : '#6B7280'
const balColor = (n: number, ref: number) =>
  n < 0 ? '#B91C1C' : n < ref * 0.15 ? '#D97706' : '#166534'

// ── component ─────────────────────────────────────────────────────────────────

export function TabDuBao({ month, localData, tonDauKy, tonQuyRealtime, kmcpActual }: Props) {
  const [view, setView] = useState<PeriodView>('month')
  const [selectedYear, setSelectedYear] = useState(() => parseInt(month.split('-')[0]))
  const [monthDocs, setMonthDocs] = useState<Map<string, NganSachThang>>(new Map())
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const curYear = parseInt(month.split('-')[0])
  const curMon  = parseInt(month.split('-')[1])

  // ── Load 12 months for the selected year ─────────────────────────────────
  useEffect(() => {
    if (view !== 'month' && view !== 'quarter') return
    setLoading(true)
    const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`)
    Promise.all(months.map(m => {
      // Reuse already-loaded data for the currently selected month
      if (m === month) return Promise.resolve([m, localData] as [string, NganSachThang])
      return getNganSach(m).then(d => [m, d] as [string, NganSachThang])
    })).then(pairs => {
      const map = new Map<string, NganSachThang>()
      pairs.forEach(([m, d]) => map.set(m, d))
      setMonthDocs(map)
    }).finally(() => setLoading(false))
  }, [view, selectedYear, month, localData])

  // ── Month / Quarter rows ──────────────────────────────────────────────────
  const monthRows = useMemo((): PeriodRow[] => {
    if (monthDocs.size === 0) return []
    const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`)
    const bc = months.map(m => {
      const d = monthDocs.get(m)
      if (!d) return { B: 0, C: 0 }
      const isCurrentMonth = m === month
      return sumBC(d, isCurrentMonth ? kmcpActual : undefined)
    })

    // Anchor: month index of the currently selected month within selectedYear
    // If selected year ≠ displayed year, anchor to tonDauKy-derived value
    const anchorIdx = selectedYear === curYear ? curMon - 1 : -1
    const openings = new Array(12).fill(0)

    if (anchorIdx >= 0) {
      openings[anchorIdx] = tonDauKy
      // Walk backward
      for (let i = anchorIdx - 1; i >= 0; i--) {
        openings[i] = openings[i + 1] - bc[i].B + bc[i].C
      }
      // Walk forward
      for (let i = anchorIdx + 1; i < 12; i++) {
        openings[i] = openings[i - 1] + bc[i - 1].B - bc[i - 1].C
      }
    } else {
      // Year without anchor — just chain forward from 0
      for (let i = 1; i < 12; i++) {
        openings[i] = openings[i - 1] + bc[i - 1].B - bc[i - 1].C
      }
    }

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    return months.map((m, i) => {
      const [y, mon] = m.split('-')
      const isPast    = m < todayStr
      const isCurrent = m === todayStr
      const thu = bc[i].B
      const chi = bc[i].C
      const opening = openings[i]
      const closing = opening + thu - chi

      // Item detail for drill-down
      const doc = monthDocs.get(m)
      const items: PeriodRow['items'] = []
      if (doc) {
        for (const it of doc.items) {
          if (it.is_section || it.is_group || it.parent_id) continue
          if (it.nhom !== 'B' && it.nhom !== 'C') continue
          const auto = m === month && it.kmcp ? kmcpActual[it.kmcp] : undefined
          const val = auto !== undefined ? auto : it.ke_hoach
          if (val !== 0) items.push({ id: it.id, nhom: it.nhom as 'B' | 'C', dien_giai: it.dien_giai, so: val, ngay: it.ngay_du_kien })
        }
      }

      return {
        key: m,
        label: `T${parseInt(mon)}/${y}`,
        sublabel: isCurrent ? 'Hiện tại' : isPast ? 'Đã qua' : 'Dự kiến',
        openingBal: opening,
        thu, chi,
        netFlow: thu - chi,
        closingBal: closing,
        isPast, isCurrent,
        items,
      }
    })
  }, [monthDocs, selectedYear, tonDauKy, month, curYear, curMon, kmcpActual])

  const quarterRows = useMemo((): PeriodRow[] => {
    if (monthRows.length === 0) return []
    return [0, 1, 2, 3].map(q => {
      const slice = monthRows.slice(q * 3, q * 3 + 3)
      const thu = slice.reduce((s, r) => s + r.thu, 0)
      const chi = slice.reduce((s, r) => s + r.chi, 0)
      const opening = slice[0].openingBal
      const closing = slice[2].closingBal
      const isPast = slice.every(r => r.isPast)
      const isCurrent = slice.some(r => r.isCurrent)
      return {
        key: `Q${q + 1}`,
        label: `Q${q + 1}/${selectedYear}`,
        sublabel: isCurrent ? 'Hiện tại' : isPast ? 'Đã qua' : 'Dự kiến',
        openingBal: opening,
        thu, chi,
        netFlow: thu - chi,
        closingBal: closing,
        isPast, isCurrent,
        items: slice.flatMap(r => r.items),
      }
    })
  }, [monthRows, selectedYear])

  // ── Day / Week rows ───────────────────────────────────────────────────────
  const dayRows = useMemo((): PeriodRow[] => {
    if (view !== 'day' && view !== 'week') return []
    const [y, m] = month.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()

    // Collect items with dates (B/C only)
    const itemsByDate = new Map<string, { id: string; nhom: 'B' | 'C'; dien_giai: string; so: number }[]>()
    const unscheduled: { id: string; nhom: 'B' | 'C'; dien_giai: string; so: number }[] = []

    for (const it of localData.items) {
      if (it.is_section || it.is_group || it.nhom === 'A' || it.nhom === 'D') continue
      const auto = it.kmcp ? kmcpActual[it.kmcp] : undefined
      const val = auto !== undefined ? auto : it.ke_hoach
      if (val === 0) continue
      const entry = { id: it.id, nhom: it.nhom as 'B' | 'C', dien_giai: it.dien_giai, so: val }
      if (it.ngay_du_kien) {
        const bucket = itemsByDate.get(it.ngay_du_kien) ?? []
        bucket.push(entry)
        itemsByDate.set(it.ngay_du_kien, bucket)
      } else {
        unscheduled.push(entry)
      }
    }

    // Build day rows
    const today = new Date()
    let running = tonDauKy
    const rows: PeriodRow[] = []

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`
      const date = new Date(y, m - 1, day)
      const items = (itemsByDate.get(dateStr) ?? [])
      const thu = items.filter(x => x.nhom === 'B').reduce((s, x) => s + x.so, 0)
      const chi = items.filter(x => x.nhom === 'C').reduce((s, x) => s + x.so, 0)
      const opening = running
      running = running + thu - chi
      const isPast = date < today && date.toDateString() !== today.toDateString()
      const isCurrent = date.toDateString() === today.toDateString()

      if (items.length > 0 || isCurrent) {
        rows.push({
          key: dateStr,
          label: `${String(day).padStart(2, '0')}/${m}`,
          sublabel: viDay(date),
          openingBal: opening,
          thu, chi,
          netFlow: thu - chi,
          closingBal: running,
          isPast, isCurrent,
          items: items.map(x => ({ ...x, ngay: dateStr })),
        })
      }
    }

    // Unscheduled items — append at end
    if (unscheduled.length > 0) {
      const thu = unscheduled.filter(x => x.nhom === 'B').reduce((s, x) => s + x.so, 0)
      const chi = unscheduled.filter(x => x.nhom === 'C').reduce((s, x) => s + x.so, 0)
      rows.push({
        key: 'unscheduled',
        label: '—',
        sublabel: 'Chưa có ngày',
        openingBal: running,
        thu, chi,
        netFlow: thu - chi,
        closingBal: running + thu - chi,
        isPast: false, isCurrent: false,
        items: unscheduled,
      })
    }

    return rows
  }, [view, localData, month, tonDauKy, kmcpActual])

  const weekRows = useMemo((): PeriodRow[] => {
    if (view !== 'week') return []
    const weekMap = new Map<number, PeriodRow>()
    const dayRowsFull = dayRows.filter(r => r.key !== 'unscheduled')
    for (const dr of dayRowsFull) {
      const date = new Date(dr.key)
      const wk = isoWeek(date)
      const existing = weekMap.get(wk)
      if (!existing) {
        weekMap.set(wk, {
          key: `W${wk}`,
          label: `Tuần ${wk}`,
          sublabel: dr.sublabel,
          openingBal: dr.openingBal,
          thu: dr.thu, chi: dr.chi,
          netFlow: dr.netFlow,
          closingBal: dr.closingBal,
          isPast: dr.isPast, isCurrent: dr.isCurrent,
          items: [...dr.items],
        })
      } else {
        existing.thu += dr.thu
        existing.chi += dr.chi
        existing.netFlow += dr.netFlow
        existing.closingBal = dr.closingBal
        existing.items.push(...dr.items)
        if (dr.isCurrent) existing.isCurrent = true
        if (!dr.isPast) existing.isPast = false
      }
    }
    // Add unscheduled
    const unsched = dayRows.find(r => r.key === 'unscheduled')
    const result = Array.from(weekMap.values())
    if (unsched) result.push(unsched)
    return result
  }, [view, dayRows])

  const rows = view === 'month' ? monthRows
    : view === 'quarter' ? quarterRows
    : view === 'week' ? weekRows
    : dayRows

  const maxBal = Math.max(...rows.map(r => Math.abs(r.closingBal)), 1)

  const toggleExpand = (key: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  // ── styles ────────────────────────────────────────────────────────────────
  const TH_STYLE: React.CSSProperties = {
    padding: '8px 10px', fontWeight: 700, fontSize: 11.5,
    color: '#fff', background: '#1C3557', textAlign: 'center', whiteSpace: 'nowrap',
    borderRight: '1px solid #2D4A6E',
  }
  const TD = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid #F3F4F6',
    verticalAlign: 'middle', ...extra,
  })

  const [y, m] = month.split('-')
  const monthLabel = `T${parseInt(m)}/${y}`

  return (
    <div>
      {/* ── Header controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1C3557' }}>📅 Dự báo dòng tiền</span>

        {/* Period toggle */}
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2 }}>
          {(['day', 'week', 'month', 'quarter'] as PeriodView[]).map(v => {
            const labels: Record<PeriodView, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng', quarter: 'Quý' }
            return (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: view === v ? '#1C3557' : 'transparent',
                color: view === v ? '#fff' : '#6B7280',
                transition: 'all .15s',
              }}>{labels[v]}</button>
            )
          })}
        </div>

        {/* Year selector (month/quarter only) */}
        {(view === 'month' || view === 'quarter') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setSelectedYear(y => y - 1)}
              style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1C3557', minWidth: 40, textAlign: 'center' }}>{selectedYear}</span>
            <button onClick={() => setSelectedYear(y => y + 1)}
              style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>›</button>
          </div>
        )}

        {/* Day/Week: show current month label */}
        {(view === 'day' || view === 'week') && (
          <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{monthLabel}</span>
        )}

        {loading && <span style={{ fontSize: 12, color: '#9CA3AF' }}>⏳ Đang tải...</span>}

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5, color: '#6B7280' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#DBEAFE', display: 'inline-block' }} />Dự kiến
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#F3F4F6', display: 'inline-block', border: '1px solid #E5E7EB' }} />Đã qua
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#FEF9C3', display: 'inline-block' }} />Hiện tại
          </span>
        </div>
      </div>

      {/* ── KPI Summary bar ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Tồn quỹ hiện tại', val: tonQuyRealtime, color: '#166534', bg: '#F0FDF4' },
          { label: view === 'day' || view === 'week' ? `Tổng thu ${monthLabel}` : `Tổng thu ${selectedYear}`, val: rows.reduce((s, r) => s + r.thu, 0), color: '#1D4ED8', bg: '#EFF6FF' },
          { label: view === 'day' || view === 'week' ? `Tổng chi ${monthLabel}` : `Tổng chi ${selectedYear}`, val: rows.reduce((s, r) => s + r.chi, 0), color: '#9A3412', bg: '#FFF7ED' },
          { label: 'Dòng tiền thuần', val: rows.reduce((s, r) => s + r.netFlow, 0), color: rows.reduce((s, r) => s + r.netFlow, 0) >= 0 ? '#166534' : '#B91C1C', bg: '#F9FAFB' },
        ].map(({ label, val, color, bg }) => (
          <div key={label} style={{ background: bg, border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 18px', minWidth: 160 }}>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{VND(val)} ₫</div>
          </div>
        ))}
      </div>

      {/* ── Forecast table ── */}
      {rows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
          {view === 'day' || view === 'week'
            ? 'Chưa có khoản thu/chi nào được đặt ngày dự kiến. Nhập ngày tại Tab Kế hoạch & Thực hiện.'
            : 'Đang tải dữ liệu...'}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: 'left', width: 100 }}>Kỳ</th>
                <th style={TH_STYLE}>Trạng thái</th>
                <th style={TH_STYLE}>Tồn đầu kỳ</th>
                <th style={{ ...TH_STYLE, background: '#1D4ED8' }}>Thu dự kiến</th>
                <th style={{ ...TH_STYLE, background: '#9A3412' }}>Chi dự kiến</th>
                <th style={TH_STYLE}>Dòng tiền thuần</th>
                <th style={{ ...TH_STYLE, minWidth: 220 }}>Tồn cuối kỳ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isEven = idx % 2 === 0
                const isQ2 = view === 'quarter' && idx === 1
                const isQ4 = view === 'quarter' && idx === 3
                const rowBg = row.isCurrent ? '#FEF9C3'
                  : row.isPast ? (isEven ? '#FAFAFA' : '#F5F5F5')
                  : (isEven ? '#EFF6FF' : '#F0F4FF')
                const qBorderTop = (view === 'month' && idx > 0 && idx % 3 === 0)
                  ? '2px solid #D1D5DB' : undefined

                return (
                  <>
                  <tr key={row.key}
                    onClick={() => row.items.length > 0 && toggleExpand(row.key)}
                    style={{
                      background: rowBg,
                      cursor: row.items.length > 0 ? 'pointer' : 'default',
                      borderTop: qBorderTop,
                      transition: 'background .1s',
                    }}
                  >
                    {/* Kỳ */}
                    <td style={TD({ fontWeight: 700, color: '#1C3557' })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {row.items.length > 0 && (
                          <span style={{ fontSize: 10, color: '#9CA3AF' }}>{expanded.has(row.key) ? '▼' : '▶'}</span>
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{row.label}</div>
                          {(view === 'day' || view === 'week') && (
                            <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 400 }}>{row.sublabel}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Trạng thái */}
                    <td style={TD({ textAlign: 'center' })}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: row.isCurrent ? '#FEF9C3' : row.isPast ? '#F3F4F6' : '#DBEAFE',
                        color: row.isCurrent ? '#92400E' : row.isPast ? '#6B7280' : '#1D4ED8',
                      }}>
                        {row.isCurrent ? '● Hiện tại' : row.isPast ? '✓ Đã qua' : '◌ Dự kiến'}
                      </span>
                    </td>
                    {/* Tồn đầu kỳ */}
                    <td style={TD({ textAlign: 'right', color: numColor(row.openingBal), fontWeight: 600 })}>
                      {VND_FULL(row.openingBal)}
                    </td>
                    {/* Thu */}
                    <td style={TD({ textAlign: 'right', color: '#1D4ED8', fontWeight: 600 })}>
                      {row.thu ? VND_FULL(row.thu) : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    {/* Chi */}
                    <td style={TD({ textAlign: 'right', color: '#9A3412', fontWeight: 600 })}>
                      {row.chi ? VND_FULL(row.chi) : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    {/* Dòng tiền thuần */}
                    <td style={TD({ textAlign: 'right', fontWeight: 700, color: numColor(row.netFlow) })}>
                      {row.netFlow === 0 ? '—' : (row.netFlow > 0 ? '+' : '') + VND_FULL(row.netFlow)}
                    </td>
                    {/* Tồn cuối kỳ + mini bar */}
                    <td style={TD({ minWidth: 220 })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: balColor(row.closingBal, tonDauKy || tonQuyRealtime), minWidth: 100, textAlign: 'right', flexShrink: 0 }}>
                          {VND_FULL(row.closingBal)}
                        </span>
                        {/* Mini bar */}
                        <div style={{ flex: 1, height: 10, background: '#F3F4F6', borderRadius: 5, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{
                            height: '100%', borderRadius: 5,
                            width: `${Math.min(100, Math.max(0, Math.abs(row.closingBal) / maxBal * 100))}%`,
                            background: row.closingBal < 0 ? '#EF4444'
                              : row.closingBal < (tonDauKy || tonQuyRealtime) * 0.15 ? '#F59E0B'
                              : '#22C55E',
                            transition: 'width .3s',
                          }} />
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded item detail ── */}
                  {expanded.has(row.key) && row.items.map(item => (
                    <tr key={item.id} style={{ background: row.isCurrent ? '#FFFDE7' : row.isPast ? '#FAFAFA' : '#EEF3FF' }}>
                      <td style={{ padding: '4px 10px 4px 28px', fontSize: 11.5, color: '#374151' }} colSpan={2}>
                        <span style={{ color: '#D1D5DB', marginRight: 6 }}>└</span>
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 5,
                          background: item.nhom === 'B' ? '#3B82F6' : '#F97316',
                        }} />
                        {item.dien_giai}
                        {item.ngay && <span style={{ marginLeft: 8, fontSize: 10.5, color: '#9CA3AF' }}>{item.ngay}</span>}
                      </td>
                      <td colSpan={2} style={{ padding: '4px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: item.nhom === 'B' ? '#1D4ED8' : '#9A3412' }}>
                        {item.nhom === 'B' ? '+' : '−'}{VND_FULL(item.so)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  ))}

                  {/* Quarter boundary: show Q subtotal line */}
                  {view === 'month' && (idx + 1) % 3 === 0 && (
                    <tr key={`q-${idx}`} style={{ background: '#F0F4FF', fontWeight: 700 }}>
                      <td style={{ ...TD({ color: '#1D4ED8', fontWeight: 700 }), paddingLeft: 20 }}>
                        Q{Math.ceil((idx + 1) / 3)}/{selectedYear}
                      </td>
                      <td style={TD({ textAlign: 'center' })}>
                        <span style={{ fontSize: 10, color: '#6B7280' }}>Quý</span>
                      </td>
                      <td style={TD({ textAlign: 'right', color: '#6B7280' })}>{VND_FULL(monthRows[idx - 2]?.openingBal ?? 0)}</td>
                      <td style={TD({ textAlign: 'right', color: '#1D4ED8', fontWeight: 700 })}>
                        {VND_FULL(monthRows.slice(idx - 2, idx + 1).reduce((s, r) => s + r.thu, 0))}
                      </td>
                      <td style={TD({ textAlign: 'right', color: '#9A3412', fontWeight: 700 })}>
                        {VND_FULL(monthRows.slice(idx - 2, idx + 1).reduce((s, r) => s + r.chi, 0))}
                      </td>
                      <td style={TD({ textAlign: 'right', color: numColor(monthRows.slice(idx - 2, idx + 1).reduce((s, r) => s + r.netFlow, 0)), fontWeight: 700 })}>
                        {(() => { const n = monthRows.slice(idx - 2, idx + 1).reduce((s, r) => s + r.netFlow, 0); return (n > 0 ? '+' : '') + VND_FULL(n) })()}
                      </td>
                      <td style={TD({ fontWeight: 700, color: balColor(monthRows[idx]?.closingBal ?? 0, tonDauKy || tonQuyRealtime) })}>
                        {VND_FULL(monthRows[idx]?.closingBal ?? 0)}
                      </td>
                    </tr>
                  )}
                  </>
                )
              })}

              {/* ── Totals row ── */}
              <tr style={{ background: '#1C3557', color: '#fff', fontWeight: 700 }}>
                <td style={{ ...TD({ color: '#fff', fontWeight: 700 }), borderBottom: 'none' }} colSpan={2}>
                  TỔNG CỘNG {view === 'month' || view === 'quarter' ? selectedYear : monthLabel}
                </td>
                <td style={{ ...TD({ textAlign: 'right', color: '#93C5FD' }), borderBottom: 'none' }}>
                  {VND_FULL(rows[0]?.openingBal ?? 0)}
                </td>
                <td style={{ ...TD({ textAlign: 'right', color: '#93C5FD', fontWeight: 700 }), borderBottom: 'none' }}>
                  +{VND_FULL(rows.reduce((s, r) => s + r.thu, 0))}
                </td>
                <td style={{ ...TD({ textAlign: 'right', color: '#FCA5A5', fontWeight: 700 }), borderBottom: 'none' }}>
                  −{VND_FULL(rows.reduce((s, r) => s + r.chi, 0))}
                </td>
                <td style={{ ...TD({ textAlign: 'right', fontWeight: 700 }), borderBottom: 'none', color: rows.reduce((s, r) => s + r.netFlow, 0) >= 0 ? '#86EFAC' : '#FCA5A5' }}>
                  {(() => { const n = rows.reduce((s, r) => s + r.netFlow, 0); return (n > 0 ? '+' : '') + VND_FULL(n) })()}
                </td>
                <td style={{ ...TD({ color: '#fff', fontWeight: 700 }), borderBottom: 'none' }}>
                  {VND_FULL(rows[rows.length - 1]?.closingBal ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Day/Week: note about unscheduled items ── */}
      {(view === 'day' || view === 'week') && rows.some(r => r.key === 'unscheduled') && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#9CA3AF', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, padding: '6px 12px' }}>
          ⚠ Một số khoản chưa được gán ngày dự kiến — hiển thị trong dòng "Chưa có ngày". Vào Tab Kế hoạch & Thực hiện để thêm ngày.
        </div>
      )}
    </div>
  )
}
