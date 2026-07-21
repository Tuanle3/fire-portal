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
  ? `${(n / 1e9).toFixed(1).replace(/\.0$/, '')} tỷ`
  : Math.abs(n) >= 1e6
  ? `${(n / 1e6).toFixed(0)} tr`
  : n.toLocaleString('vi-VN')

const VND_FULL = (n: number) => n === 0 ? '—' : n.toLocaleString('vi-VN')

const yearBtnStyle: CSSProperties = {
  width: 26, height: 26, borderRadius: 5, border: '1px solid #E5E7EB',
  background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14,
}
function pillBtn(bg: string, color: string, border: string, busy: boolean): CSSProperties {
  return {
    padding: '3px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
    background: bg, color, border: `1px solid ${border}`, cursor: busy ? 'wait' : 'pointer',
  }
}

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
        label: `Tháng ${parseInt(mon)}/${y}`,
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
        label: `Quý ${q + 1}/${selectedYear}`,
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
        label: 'Chưa có ngày',
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

  // ── derived cho hiển thị ────────────────────────────────────────────────────
  const [yy, mm] = month.split('-')
  const monthLabel = `T${parseInt(mm)}/${yy}`
  const scopeLabel = view === 'day' || view === 'week' ? monthLabel : String(selectedYear)

  const safety = Math.max(0, Math.round((tonDauKy || tonQuyRealtime) * 0.15))
  const periodRows = rows.filter(r => r.key !== 'unscheduled')
  const riskRows = periodRows.filter(r => r.closingBal < safety)
  const hasCritical = riskRows.some(r => r.closingBal < 0)
  const hasRisk = overdue.length > 0 || riskRows.length > 0
  const overdueTotal = overdue.reduce((s, o) => s + amountOf(o), 0)
  const endingBal = periodRows.length ? periodRows[periodRows.length - 1].closingBal : (tonDauKy || tonQuyRealtime)
  const totalThu = periodRows.reduce((s, r) => s + r.thu, 0)
  const totalChi = periodRows.reduce((s, r) => s + r.chi, 0)
  const netFlow  = totalThu - totalChi

  const TH: CSSProperties = {
    padding: '9px 12px', fontWeight: 700, fontSize: 11, color: '#64748B',
    textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #E5E7EB',
  }
  const TD = (extra: CSSProperties = {}): CSSProperties => ({
    padding: '9px 12px', fontSize: 12.5, textAlign: 'right', borderBottom: '1px solid #F1F5F9', ...extra,
  })

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1C3557' }}>📅 Dự báo dòng tiền</span>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3, gap: 2 }}>
          {(['day', 'week', 'month', 'quarter', 'year'] as PeriodView[]).map(v => {
            const labels: Record<PeriodView, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng', quarter: 'Quý', year: 'Năm' }
            return (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: 'none',
                cursor: 'pointer', background: view === v ? '#1C3557' : 'transparent', color: view === v ? '#fff' : '#64748B',
              }}>{labels[v]}</button>
            )
          })}
        </div>
        {(view === 'month' || view === 'quarter' || view === 'year') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setSelectedYear(yr => yr - 1)} style={yearBtnStyle}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1C3557', minWidth: 40, textAlign: 'center' }}>{selectedYear}</span>
            <button onClick={() => setSelectedYear(yr => yr + 1)} style={yearBtnStyle}>›</button>
          </div>
        )}
        {(view === 'day' || view === 'week') && <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>{monthLabel}</span>}
        {loading && <span style={{ fontSize: 12, color: '#94A3B8' }}>⏳ Đang tải…</span>}
      </div>

      {/* ── KPI: 3 số cốt lõi ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Tồn quỹ hiện tại', val: tonQuyRealtime, color: '#166534' },
          { label: `Dòng tiền thuần ${scopeLabel}`, val: netFlow, color: netFlow >= 0 ? '#166534' : '#B91C1C' },
          { label: `Tồn cuối kỳ dự kiến ${scopeLabel}`, val: endingBal, color: endingBal < 0 ? '#B91C1C' : endingBal < safety ? '#D97706' : '#1C3557' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 18px', minWidth: 190, flex: '1 1 190px' }}>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color }}>{val.toLocaleString('vi-VN')} ₫</div>
          </div>
        ))}
      </div>

      {/* ── TRỌNG TÂM: Cảnh báo rủi ro tiền mặt ── */}
      <div style={{ marginBottom: 18, border: '1px solid', borderColor: hasCritical ? '#FCA5A5' : hasRisk ? '#FDE68A' : '#BBF7D0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          padding: '11px 16px', fontWeight: 700, fontSize: 13.5,
          background: hasCritical ? '#FEF2F2' : hasRisk ? '#FFFBEB' : '#F0FDF4',
          color: hasCritical ? '#991B1B' : hasRisk ? '#92400E' : '#166534',
        }}>
          {!hasRisk
            ? '✅ Dòng tiền an toàn — không có kỳ nào âm/mỏng quỹ và không có khoản quá hạn.'
            : `⚠ Cảnh báo dòng tiền${hasCritical ? ' — có kỳ ÂM quỹ' : ''}`}
        </div>

        {hasRisk && (
          <div style={{ background: '#fff' }}>
            {/* Kỳ rủi ro */}
            {riskRows.length > 0 && (
              <div style={{ padding: '10px 16px', borderBottom: overdue.length ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 7, letterSpacing: '.03em' }}>
                  KỲ RỦI RO · ngưỡng an toàn ≈ {VND(safety)} ₫
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {riskRows.map(r => {
                    const neg = r.closingBal < 0
                    const need = neg ? -r.closingBal : safety - r.closingBal
                    return (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: neg ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: '#1C3557', minWidth: 96 }}>{r.label}</span>
                        <span style={{ color: neg ? '#B91C1C' : '#D97706', fontWeight: 600 }}>
                          {neg ? 'Âm quỹ' : 'Quỹ mỏng'} · tồn cuối kỳ {r.closingBal.toLocaleString('vi-VN')} ₫
                        </span>
                        <span style={{ marginLeft: 'auto', color: '#B91C1C', fontWeight: 700 }}>cần +{Math.round(need).toLocaleString('vi-VN')} ₫</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Khoản quá hạn — có hành động */}
            {overdue.length > 0 && (
              <div style={{ padding: '10px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 7, letterSpacing: '.03em' }}>
                  QUÁ HẠN CHƯA THU/CHI · {overdue.length} khoản · {overdueTotal.toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <tbody>
                      {overdue.map(o => (
                        <tr key={`${o.docMonth}-${o.id}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 8px 6px 0', color: '#B91C1C', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {o.ngay}
                            <span style={{ color: '#94A3B8', fontWeight: 500 }}> · trễ {o.daysLate}d{o.roll_count ? ` · dời ${o.roll_count}×` : ''}</span>
                          </td>
                          <td style={{ padding: '6px 8px', color: '#1F2937' }}>{o.dien_giai || '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: o.nhom === 'B' ? '#166534' : '#334155', whiteSpace: 'nowrap' }}>
                            {(o.nhom === 'B' ? '+' : '−') + VND_FULL(amountOf(o))}
                          </td>
                          <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => deferItem(o)} disabled={busyId === o.id} style={pillBtn('#FFF7ED', '#9A3412', '#FED7AA', busyId === o.id)}>↪ Dời {DEFER_LABEL[view]}</button>
                            <button onClick={() => markDone(o)} disabled={busyId === o.id} style={{ ...pillBtn('#F0FDF4', '#166534', '#86EFAC', busyId === o.id), marginLeft: 6 }}>✓ Đã xong</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bảng dòng tiền (gọn) ── */}
      {periodRows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 36, color: '#94A3B8', fontSize: 13 }}>
          {view === 'day' || view === 'week'
            ? 'Chưa có khoản thu/chi nào đặt ngày dự kiến trong tháng này. Thêm ngày ở tab Kế hoạch & Thực hiện.'
            : 'Đang tải dữ liệu…'}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #E5E7EB' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: '#fff' }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: 'left' }}>Kỳ</th>
                <th style={TH}>Thu</th>
                <th style={TH}>Chi</th>
                <th style={{ ...TH, minWidth: 160 }}>Tồn cuối kỳ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const neg = row.closingBal < 0
                const thin = !neg && row.key !== 'unscheduled' && row.closingBal < safety
                return (
                  <>
                    <tr key={row.key}
                      onClick={() => row.items.length > 0 && toggleExpand(row.key)}
                      style={{ background: row.isCurrent ? '#FEFCE8' : 'transparent', cursor: row.items.length > 0 ? 'pointer' : 'default' }}>
                      <td style={TD({ textAlign: 'left', fontWeight: 700, color: '#1C3557' })}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {row.items.length > 0 && <span style={{ fontSize: 9, color: '#CBD5E1' }}>{expanded.has(row.key) ? '▼' : '▶'}</span>}
                          {row.label}
                          {row.isCurrent && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#92400E', background: '#FEF9C3', padding: '1px 6px', borderRadius: 10 }}>hiện tại</span>}
                        </span>
                      </td>
                      <td style={TD({ color: '#166534', fontWeight: 600 })}>{row.thu ? VND_FULL(row.thu) : <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                      <td style={TD({ color: '#334155', fontWeight: 600 })}>{row.chi ? VND_FULL(row.chi) : <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                      <td style={TD({ fontWeight: 700, color: neg ? '#B91C1C' : thin ? '#D97706' : '#1C3557' })}>
                        {VND_FULL(row.closingBal)}
                        {neg && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '1px 6px', borderRadius: 10 }}>âm</span>}
                        {thin && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 6px', borderRadius: 10 }}>mỏng</span>}
                      </td>
                    </tr>
                    {expanded.has(row.key) && row.items.map(item => (
                      <tr key={item.id} style={{ background: '#F8FAFC' }}>
                        <td style={{ padding: '5px 12px 5px 30px', fontSize: 11.5, color: '#475569' }} colSpan={2}>
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, marginRight: 6, background: item.nhom === 'B' ? '#22C55E' : '#94A3B8' }} />
                          {item.dien_giai}{item.ngay && <span style={{ marginLeft: 8, fontSize: 10.5, color: '#94A3B8' }}>{item.ngay}</span>}
                        </td>
                        <td colSpan={2} style={{ padding: '5px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: item.nhom === 'B' ? '#166534' : '#334155' }}>
                          {item.nhom === 'B' ? '+' : '−'}{VND_FULL(item.so)}
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
              <tr style={{ background: '#1C3557', color: '#fff', fontWeight: 700 }}>
                <td style={{ padding: '9px 12px', textAlign: 'left' }}>Tổng {scopeLabel}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#86EFAC' }}>+{VND_FULL(totalThu)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#CBD5E1' }}>−{VND_FULL(totalChi)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>{VND_FULL(endingBal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
