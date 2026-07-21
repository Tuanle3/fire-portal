'use client'
import { useState, useEffect, useMemo, CSSProperties } from 'react'
import { getNganSach, saveNganSach } from '@/lib/ngan-sach-store'
import { NganSachThang } from '@/lib/ngan-sach-types'

type PeriodView = 'day' | 'week' | 'month' | 'quarter' | 'year'

interface Props {
  month: string            // "2026-07" — currently selected month
  localData: NganSachThang
  tonDauKy: number         // opening balance of selected month (from Firebase)
  tonQuyRealtime: number   // current real-time balance
  kmcpActual: Record<string, number>
}

interface RowItem { id: string; nhom: 'B' | 'C'; dien_giai: string; so: number; ngay?: string }

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
  items: RowItem[]
}

// Mỗi khoản thu/chi (B/C) gom từ tất cả doc tháng đã tải — nguồn duy nhất cho mọi view.
interface PoolItem {
  id: string
  docMonth: string          // tháng của doc chứa khoản này ("2026-07")
  nhom: 'B' | 'C'
  dien_giai: string
  kmcp: string
  ke_hoach: number
  thuc_hien: number
  ngay?: string             // ngay_du_kien
  done_override?: boolean
  roll_count?: number
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildPool(monthDocs: Map<string, NganSachThang>): PoolItem[] {
  const pool: PoolItem[] = []
  monthDocs.forEach((doc, docMonth) => {
    for (const it of doc.items) {
      if (it.is_section || it.is_group) continue          // bỏ header + nhóm (con của nhóm vẫn được tính)
      if (it.nhom !== 'B' && it.nhom !== 'C') continue
      pool.push({
        id: it.id, docMonth, nhom: it.nhom as 'B' | 'C',
        dien_giai: it.dien_giai, kmcp: it.kmcp,
        ke_hoach: it.ke_hoach, thuc_hien: it.thuc_hien,
        ngay: it.ngay_du_kien, done_override: it.done_override, roll_count: it.roll_count,
      })
    }
  })
  return pool
}

// "kỳ tiếp theo" theo view đang xem
function advanceDate(iso: string, view: PeriodView): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (view === 'day') dt.setDate(dt.getDate() + 1)
  else if (view === 'week') dt.setDate(dt.getDate() + 7)
  else if (view === 'month') dt.setMonth(dt.getMonth() + 1)
  else if (view === 'quarter') dt.setMonth(dt.getMonth() + 3)
  else dt.setFullYear(dt.getFullYear() + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

const DEFER_LABEL: Record<PeriodView, string> = {
  day: 'ngày sau', week: 'tuần sau', month: 'tháng sau', quarter: 'quý sau', year: 'năm sau',
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
  const [busyId, setBusyId] = useState<string | null>(null)

  const curYear = parseInt(month.split('-')[0])
  const curMon  = parseInt(month.split('-')[1])

  const todayISO = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  // ── Load các tháng cần cho view hiện tại (cache dồn vào monthDocs) ──────────
  useEffect(() => {
    const years = new Set<number>([parseInt(month.split('-')[0])])
    if (view === 'month' || view === 'quarter' || view === 'year') years.add(selectedYear)
    if (view === 'year') { years.add(selectedYear - 1); years.add(selectedYear + 1) }

    const need: string[] = []
    years.forEach(y => { for (let i = 1; i <= 12; i++) need.push(`${y}-${String(i).padStart(2, '0')}`) })

    setLoading(true)
    Promise.all(need.map(m =>
      m === month
        ? Promise.resolve([m, localData] as [string, NganSachThang])
        : getNganSach(m).then(d => [m, d] as [string, NganSachThang])
    )).then(pairs => {
      setMonthDocs(prev => {
        const map = new Map(prev)
        pairs.forEach(([m, d]) => map.set(m, d))
        return map
      })
    }).finally(() => setLoading(false))
  }, [view, selectedYear, month, localData])

  // ── Pool + hàm phân bổ theo ngày ────────────────────────────────────────────
  const pool = useMemo(() => buildPool(monthDocs), [monthDocs])

  const effMonth = (p: PoolItem) => (p.ngay ? p.ngay.slice(0, 7) : p.docMonth)
  // Số tiền dùng cho dự báo: tháng đang chọn ưu tiên số Thực hiện auto theo KMCP, còn lại dùng Kế hoạch
  const amountOf = (p: PoolItem) => {
    if (effMonth(p) === month && p.kmcp && kmcpActual[p.kmcp] !== undefined) return kmcpActual[p.kmcp]
    return p.ke_hoach
  }
  const isDone = (p: PoolItem) => {
    if (p.done_override === true) return true
    if (p.ke_hoach > 0 && p.thuc_hien >= p.ke_hoach * 0.9) return true
    if (effMonth(p) === month && p.kmcp && p.ke_hoach > 0 &&
        kmcpActual[p.kmcp] !== undefined && kmcpActual[p.kmcp] >= p.ke_hoach * 0.9) return true
    return false
  }

  // ── Khoản quá hạn (mọi doc đã tải): có ngày < hôm nay & chưa xong ───────────
  const overdue = useMemo(() => {
    return pool
      .filter(p => p.ngay && p.ngay < todayISO && !isDone(p))
      .map(p => ({
        ...p,
        daysLate: Math.max(0, Math.round((new Date(todayISO).getTime() - new Date(p.ngay!).getTime()) / 86400000)),
      }))
      .sort((a, b) => (a.ngay! < b.ngay! ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, todayISO, month, kmcpActual])

  // ── Month rows ──────────────────────────────────────────────────────────────
  const monthRows = useMemo((): PeriodRow[] => {
    const yStr = String(selectedYear)
    const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`)
    const bc = Array.from({ length: 12 }, () => ({ B: 0, C: 0 }))
    const detail: RowItem[][] = Array.from({ length: 12 }, () => [])

    for (const p of pool) {
      const em = effMonth(p)
      if (em.slice(0, 4) !== yStr) continue
      const mi = parseInt(em.slice(5, 7)) - 1
      if (mi < 0 || mi > 11) continue
      const val = amountOf(p)
      if (val === 0) continue
      if (p.nhom === 'B') bc[mi].B += val; else bc[mi].C += val
      detail[mi].push({ id: p.id, nhom: p.nhom, dien_giai: p.dien_giai, so: val, ngay: p.ngay })
    }

    // Anchor tồn đầu kỳ tại tháng đang chọn (nếu cùng năm), chain 2 chiều
    const anchorIdx = selectedYear === curYear ? curMon - 1 : -1
    const openings = new Array(12).fill(0)
    if (anchorIdx >= 0) {
      openings[anchorIdx] = tonDauKy
      for (let i = anchorIdx - 1; i >= 0; i--) openings[i] = openings[i + 1] - bc[i].B + bc[i].C
      for (let i = anchorIdx + 1; i < 12; i++) openings[i] = openings[i - 1] + bc[i - 1].B - bc[i - 1].C
    } else {
      for (let i = 1; i < 12; i++) openings[i] = openings[i - 1] + bc[i - 1].B - bc[i - 1].C
    }

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    return months.map((m, i) => {
      const [y, mon] = m.split('-')
      const isPast    = m < todayStr
      const isCurrent = m === todayStr
      const thu = bc[i].B, chi = bc[i].C
      const opening = openings[i]
      return {
        key: m,
        label: `T${parseInt(mon)}/${y}`,
        sublabel: isCurrent ? 'Hiện tại' : isPast ? 'Đã qua' : 'Dự kiến',
        openingBal: opening,
        thu, chi,
        netFlow: thu - chi,
        closingBal: opening + thu - chi,
        isPast, isCurrent,
        items: detail[i],
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, selectedYear, tonDauKy, month, curYear, curMon, kmcpActual])

  const quarterRows = useMemo((): PeriodRow[] => {
    if (monthRows.length === 0) return []
    return [0, 1, 2, 3].map(q => {
      const slice = monthRows.slice(q * 3, q * 3 + 3)
      const thu = slice.reduce((s, r) => s + r.thu, 0)
      const chi = slice.reduce((s, r) => s + r.chi, 0)
      return {
        key: `Q${q + 1}`,
        label: `Q${q + 1}/${selectedYear}`,
        sublabel: slice.some(r => r.isCurrent) ? 'Hiện tại' : slice.every(r => r.isPast) ? 'Đã qua' : 'Dự kiến',
        openingBal: slice[0].openingBal,
        thu, chi,
        netFlow: thu - chi,
        closingBal: slice[2].closingBal,
        isPast: slice.every(r => r.isPast),
        isCurrent: slice.some(r => r.isCurrent),
        items: slice.flatMap(r => r.items),
      }
    })
  }, [monthRows, selectedYear])

  // ── Year rows (3 năm liền kề, chain quanh năm đang chọn) ────────────────────
  const yearRows = useMemo((): PeriodRow[] => {
    if (view !== 'year') return []
    const years = [selectedYear - 1, selectedYear, selectedYear + 1]
    const netOf = (yr: number) => {
      let B = 0, C = 0
      const items: RowItem[] = []
      for (const p of pool) {
        if (effMonth(p).slice(0, 4) !== String(yr)) continue
        const v = amountOf(p)
        if (v === 0) continue
        if (p.nhom === 'B') B += v; else C += v
        items.push({ id: p.id, nhom: p.nhom, dien_giai: p.dien_giai, so: v, ngay: p.ngay })
      }
      return { B, C, items }
    }
    const janOpeningSel = monthRows[0]?.openingBal ?? tonDauKy
    const netSel = netOf(selectedYear)
    const netPrev = netOf(selectedYear - 1)
    const open: Record<number, number> = {
      [selectedYear]: janOpeningSel,
      [selectedYear - 1]: janOpeningSel - (netPrev.B - netPrev.C),
      [selectedYear + 1]: janOpeningSel + (netSel.B - netSel.C),
    }
    return years.map(yr => {
      const { B, C, items } = netOf(yr)
      const opening = open[yr]
      return {
        key: `Y${yr}`,
        label: `Năm ${yr}`,
        sublabel: yr === curYear ? 'Hiện tại' : yr < curYear ? 'Đã qua' : 'Dự kiến',
        openingBal: opening,
        thu: B, chi: C,
        netFlow: B - C,
        closingBal: opening + B - C,
        isPast: yr < curYear,
        isCurrent: yr === curYear,
        items,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pool, selectedYear, monthRows, tonDauKy, curYear, month, kmcpActual])

  // ── Day / Week rows (khoản có ngày rơi vào tháng đang chọn) ─────────────────
  const dayRows = useMemo((): PeriodRow[] => {
    if (view !== 'day' && view !== 'week') return []
    const [y, m] = month.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()

    const itemsByDate = new Map<string, RowItem[]>()
    const unscheduled: RowItem[] = []

    for (const p of pool) {
      const val = amountOf(p)
      if (val === 0) continue
      const entry: RowItem = { id: p.id, nhom: p.nhom, dien_giai: p.dien_giai, so: val }
      if (p.ngay && p.ngay.slice(0, 7) === month) {
        const bucket = itemsByDate.get(p.ngay) ?? []
        bucket.push(entry)
        itemsByDate.set(p.ngay, bucket)
      } else if (!p.ngay && p.docMonth === month) {
        unscheduled.push(entry)
      }
    }

    const today = new Date()
    let running = tonDauKy
    const rows: PeriodRow[] = []

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`
      const date = new Date(y, m - 1, day)
      const items = itemsByDate.get(dateStr) ?? []
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pool, month, tonDauKy, kmcpActual])

  const weekRows = useMemo((): PeriodRow[] => {
    if (view !== 'week') return []
    const weekMap = new Map<number, PeriodRow>()
    const dayRowsFull = dayRows.filter(r => r.key !== 'unscheduled')
    for (const dr of dayRowsFull) {
      const date = new Date(dr.key)
      const wk = isoWeek(date)
      const existing = weekMap.get(wk)
      if (!existing) {
        weekMap.set(wk, { ...dr, key: `W${wk}`, label: `Tuần ${wk}`, items: [...dr.items] })
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
    const unsched = dayRows.find(r => r.key === 'unscheduled')
    const result = Array.from(weekMap.values())
    if (unsched) result.push(unsched)
    return result
  }, [view, dayRows])

  const rows = view === 'month' ? monthRows
    : view === 'quarter' ? quarterRows
    : view === 'year' ? yearRows
    : view === 'week' ? weekRows
    : dayRows

  const maxBal = Math.max(...rows.map(r => Math.abs(r.closingBal)), 1)

  const toggleExpand = (key: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  // ── Ghi 1 doc: cập nhật 1 khoản trong doc gốc của nó rồi lưu ────────────────
  const patchItem = async (docMonth: string, id: string, patch: Record<string, unknown>) => {
    const doc = monthDocs.get(docMonth)
    if (!doc) return
    setBusyId(id)
    const updated: NganSachThang = { ...doc, items: doc.items.map(it => it.id === id ? { ...it, ...patch } : it) }
    setMonthDocs(prev => new Map(prev).set(docMonth, updated))
    try { await saveNganSach(updated) } catch { /* giữ nguyên state local nếu lỗi mạng */ }
    finally { setBusyId(null) }
  }
  const deferItem = (o: PoolItem) =>
    patchItem(o.docMonth, o.id, { ngay_du_kien: advanceDate(o.ngay!, view), roll_count: (o.roll_count ?? 0) + 1 })
  const markDone = (o: PoolItem) => patchItem(o.docMonth, o.id, { done_override: true })

  // ── styles ────────────────────────────────────────────────────────────────
  const TH_STYLE: CSSProperties = {
    padding: '8px 10px', fontWeight: 700, fontSize: 11.5,
    color: '#fff', background: '#1C3557', textAlign: 'center', whiteSpace: 'nowrap',
    borderRight: '1px solid #2D4A6E',
  }
  const TD = (extra: CSSProperties = {}): CSSProperties => ({
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
          {(['day', 'week', 'month', 'quarter', 'year'] as PeriodView[]).map(v => {
            const labels: Record<PeriodView, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng', quarter: 'Quý', year: 'Năm' }
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

        {/* Year selector (month/quarter/year) */}
        {(view === 'month' || view === 'quarter' || view === 'year') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setSelectedYear(yr => yr - 1)}
              style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1C3557', minWidth: 40, textAlign: 'center' }}>{selectedYear}</span>
            <button onClick={() => setSelectedYear(yr => yr + 1)}
              style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>›</button>
          </div>
        )}

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

      {/* ── ⚠ Khoản quá hạn (đến hạn chưa thu/chi) ── */}
      <div style={{ marginBottom: 18, border: '1px solid', borderColor: overdue.length ? '#FCA5A5' : '#BBF7D0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          padding: '9px 16px', fontWeight: 700, fontSize: 13,
          background: overdue.length ? '#FEF2F2' : '#F0FDF4',
          color: overdue.length ? '#991B1B' : '#166534',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {overdue.length === 0
            ? <>✅ Không có khoản nào quá hạn — mọi khoản dự kiến đều đã thực hiện hoặc chưa tới hạn.</>
            : <>⚠ {overdue.length} khoản quá hạn chưa thu/chi — dời sang kỳ sau hoặc đánh dấu đã xong.</>}
        </div>
        {overdue.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: '#fff' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', color: '#6B7280', fontSize: 11 }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 700 }}>Ngày dự kiến</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 700 }}>Diễn giải</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>Loại</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>Số tiền</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>Trễ</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>Đã dời</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map(o => (
                  <tr key={`${o.docMonth}-${o.id}`} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 600, color: '#B91C1C', whiteSpace: 'nowrap' }}>{o.ngay}</td>
                    <td style={{ padding: '7px 12px', color: '#1F2937' }}>
                      {o.dien_giai || <span style={{ color: '#9CA3AF' }}>—</span>}
                      {o.kmcp && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#9CA3AF', fontFamily: 'monospace' }}>{o.kmcp}</span>}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: o.nhom === 'B' ? '#DBEAFE' : '#FFEDD5',
                        color: o.nhom === 'B' ? '#1D4ED8' : '#9A3412',
                      }}>{o.nhom === 'B' ? 'Thu' : 'Chi'}</span>
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: o.nhom === 'B' ? '#1D4ED8' : '#9A3412' }}>
                      {(o.nhom === 'B' ? '+' : '−') + VND_FULL(amountOf(o))}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'center', color: '#B91C1C', fontWeight: 600 }}>
                      {o.daysLate} ngày
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'center', color: o.roll_count ? '#D97706' : '#9CA3AF', fontWeight: 600 }}>
                      {o.roll_count ? `${o.roll_count} lần` : '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => deferItem(o)}
                        disabled={busyId === o.id}
                        style={{
                          padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, marginRight: 6,
                          background: '#FFF7ED', color: '#9A3412', border: '1px solid #FED7AA',
                          cursor: busyId === o.id ? 'wait' : 'pointer',
                        }}
                      >↪ Dời {DEFER_LABEL[view]}</button>
                      <button
                        onClick={() => markDone(o)}
                        disabled={busyId === o.id}
                        style={{
                          padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 6,
                          background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC',
                          cursor: busyId === o.id ? 'wait' : 'pointer',
                        }}
                      >✓ Đã xong</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tổng quan năm: biểu đồ 12 tháng + cảnh báo tháng thiếu tiền ── */}
      {(view === 'month' || view === 'quarter' || view === 'year') && monthRows.length === 12 && (() => {
        const vals = monthRows.map(r => r.closingBal)
        const maxV = Math.max(...vals, 0)
        const minV = Math.min(...vals, 0)
        const span = (maxV - minV) || 1
        const CHART_H = 150
        const zeroY = (maxV / span) * CHART_H
        const safety = Math.round((tonDauKy || tonQuyRealtime) * 0.15)

        const problems = monthRows
          .filter(r => r.closingBal < Math.max(safety, 0))
          .map(r => ({
            ...r,
            level: r.closingBal < 0 ? 'critical' as const : 'warning' as const,
            shortfall: r.closingBal < 0 ? -r.closingBal : Math.max(safety, 0) - r.closingBal,
          }))

        return (
          <div style={{ marginBottom: 18 }}>
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 18px 10px', marginBottom: 14, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1C3557' }}>Tồn quỹ cuối kỳ theo tháng · {selectedYear}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>Ngưỡng an toàn ≈ {VND(safety)} ₫ (15% tồn đầu)</span>
              </div>
              <div style={{ position: 'relative', height: CHART_H, display: 'flex', alignItems: 'stretch', gap: 4 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: zeroY, borderTop: '1px dashed #9CA3AF', zIndex: 1 }} />
                {monthRows.map((r, i) => {
                  const isNeg = r.closingBal < 0
                  const h = (Math.abs(r.closingBal) / span) * CHART_H
                  const color = isNeg ? '#EF4444' : r.closingBal < safety ? '#F59E0B' : '#22C55E'
                  return (
                    <div key={r.key} title={`T${i + 1}: ${r.closingBal.toLocaleString('vi-VN')} ₫`}
                      style={{ flex: 1, position: 'relative', cursor: 'default' }}>
                      <div style={{
                        position: 'absolute', left: '15%', right: '15%',
                        top: isNeg ? zeroY : zeroY - h,
                        height: Math.max(h, 1),
                        background: color, borderRadius: 3,
                        border: r.isCurrent ? '2px solid #1C3557' : 'none',
                        transition: 'all .3s',
                      }} />
                      <div style={{
                        position: 'absolute', left: 0, right: 0, textAlign: 'center',
                        top: isNeg ? zeroY + h + 2 : zeroY - h - 15,
                        fontSize: 9, fontWeight: 700, color, whiteSpace: 'nowrap',
                      }}>{VND(r.closingBal)}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {monthRows.map((r, i) => (
                  <div key={r.key} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: r.isCurrent ? 700 : 500, color: r.isCurrent ? '#1C3557' : '#9CA3AF' }}>
                    T{i + 1}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid', borderColor: problems.some(p => p.level === 'critical') ? '#FCA5A5' : problems.length ? '#FDE68A' : '#BBF7D0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                padding: '9px 16px', fontWeight: 700, fontSize: 13,
                background: problems.some(p => p.level === 'critical') ? '#FEF2F2' : problems.length ? '#FFFBEB' : '#F0FDF4',
                color: problems.some(p => p.level === 'critical') ? '#991B1B' : problems.length ? '#92400E' : '#166534',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {problems.length === 0
                  ? <>✅ Dòng tiền {selectedYear} an toàn — không có tháng nào âm quỹ.</>
                  : <>⚠ Cảnh báo dòng tiền — {problems.length} tháng cần xử lý</>}
              </div>
              {problems.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', color: '#6B7280', fontSize: 11 }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 700 }}>Tháng</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>Mức độ</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>Tồn cuối kỳ</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>Cần bổ sung</th>
                      <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 700 }}>Đề xuất xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map(p => (
                      <tr key={p.key} style={{ borderTop: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '7px 12px', fontWeight: 700, color: '#1C3557' }}>{p.label}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: p.level === 'critical' ? '#FEE2E2' : '#FEF3C7',
                            color: p.level === 'critical' ? '#991B1B' : '#92400E',
                          }}>
                            {p.level === 'critical' ? '🔴 Âm quỹ' : '🟡 Quỹ mỏng'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: p.closingBal < 0 ? '#B91C1C' : '#D97706' }}>
                          {p.closingBal.toLocaleString('vi-VN')}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#B91C1C' }}>
                          {p.shortfall > 0 ? '+' + Math.round(p.shortfall).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#4B5563', fontSize: 11.5 }}>
                          {p.level === 'critical'
                            ? 'Đẩy nhanh thu hồi công nợ · giãn/hoãn khoản chi lớn · chuẩn bị vay ngắn hạn (đáo hạn) · điều tiết từ tháng dư.'
                            : 'Theo dõi sát · ưu tiên thu đúng hạn · hạn chế chi phát sinh ngoài kế hoạch.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

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
                    <td style={TD({ textAlign: 'center' })}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: row.isCurrent ? '#FEF9C3' : row.isPast ? '#F3F4F6' : '#DBEAFE',
                        color: row.isCurrent ? '#92400E' : row.isPast ? '#6B7280' : '#1D4ED8',
                      }}>
                        {row.isCurrent ? '● Hiện tại' : row.isPast ? '✓ Đã qua' : '◌ Dự kiến'}
                      </span>
                    </td>
                    <td style={TD({ textAlign: 'right', color: numColor(row.openingBal), fontWeight: 600 })}>
                      {VND_FULL(row.openingBal)}
                    </td>
                    <td style={TD({ textAlign: 'right', color: '#1D4ED8', fontWeight: 600 })}>
                      {row.thu ? VND_FULL(row.thu) : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={TD({ textAlign: 'right', color: '#9A3412', fontWeight: 600 })}>
                      {row.chi ? VND_FULL(row.chi) : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={TD({ textAlign: 'right', fontWeight: 700, color: numColor(row.netFlow) })}>
                      {row.netFlow === 0 ? '—' : (row.netFlow > 0 ? '+' : '') + VND_FULL(row.netFlow)}
                    </td>
                    <td style={TD({ minWidth: 220 })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: balColor(row.closingBal, tonDauKy || tonQuyRealtime), minWidth: 100, textAlign: 'right', flexShrink: 0 }}>
                          {VND_FULL(row.closingBal)}
                        </span>
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

              <tr style={{ background: '#1C3557', color: '#fff', fontWeight: 700 }}>
                <td style={{ ...TD({ color: '#fff', fontWeight: 700 }), borderBottom: 'none' }} colSpan={2}>
                  TỔNG CỘNG {view === 'day' || view === 'week' ? monthLabel : selectedYear}
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

      {(view === 'day' || view === 'week') && rows.some(r => r.key === 'unscheduled') && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: '#9CA3AF', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, padding: '6px 12px' }}>
          ⚠ Một số khoản chưa được gán ngày dự kiến — hiển thị trong dòng "Chưa có ngày". Vào Tab Kế hoạch & Thực hiện để thêm ngày.
        </div>
      )}
    </div>
  )
}
