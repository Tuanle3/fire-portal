'use client'
import { useState, useEffect, useMemo, CSSProperties } from 'react'
import { getNganSach, saveNganSach } from '@/lib/ngan-sach-store'
import { NganSachThang } from '@/lib/ngan-sach-types'

interface Props {
  month: string            // "2026-07" — tháng đang chọn ở topbar
  localData: NganSachThang
  tonDauKy: number         // tồn đầu kỳ của tháng đang chọn
  tonQuyRealtime: number   // tồn quỹ thực tế hiện tại
  kmcpActual: Record<string, number>
}

// Mỗi khoản thu/chi (B/C) gom từ tất cả doc tháng đã tải — nguồn duy nhất.
interface PoolItem {
  id: string
  docMonth: string
  nhom: 'B' | 'C'
  dien_giai: string
  kmcp: string
  ke_hoach: number
  thuc_hien: number
  ngay?: string
  done_override?: boolean
  roll_count?: number
}

// Ô dữ liệu 1 tháng của 1 khoản mục
type Cell = { plan: number; actual: number; hasActual: boolean; rolledIn: number }
// Ô đã chuẩn hoá cho hiển thị (actual null = kỳ tương lai / chưa đến kỳ)
type RowCell = { plan: number; actual: number | null; rolledIn: number }
interface Leaf { key: string; label: string; nhom: 'B' | 'C'; m: Cell[] }

const MONTH_FULL = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
const MONTH_SHORT = ['Th.1', 'Th.2', 'Th.3', 'Th.4', 'Th.5', 'Th.6', 'Th.7', 'Th.8', 'Th.9', 'Th.10', 'Th.11', 'Th.12']

// ── helpers ──────────────────────────────────────────────────────────────────
function buildPool(monthDocs: Map<string, NganSachThang>): PoolItem[] {
  const pool: PoolItem[] = []
  monthDocs.forEach((doc, docMonth) => {
    for (const it of doc.items) {
      if (it.is_section || it.is_group) continue
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
const effMonth = (p: PoolItem) => (p.ngay ? p.ngay.slice(0, 7) : p.docMonth)
function advanceDate(iso: string, mode: 'week' | 'month'): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (mode === 'week') dt.setDate(dt.getDate() + 7)
  else dt.setMonth(dt.getMonth() + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
// Hiển thị theo đơn vị Triệu ₫ (đồng bộ mẫu: bảng gọn, dễ đọc)
const fmtM = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Math.round(n / 1e6).toLocaleString('vi-VN')

const zeroRC = (): RowCell => ({ plan: 0, actual: null, rolledIn: 0 })
function addRC(a: RowCell, b: RowCell): RowCell {
  return {
    plan: a.plan + b.plan,
    actual: a.actual === null && b.actual === null ? null : (a.actual ?? 0) + (b.actual ?? 0),
    rolledIn: a.rolledIn + b.rolledIn,
  }
}
function subRC(a: RowCell, b: RowCell): RowCell {
  return {
    plan: a.plan - b.plan,
    actual: a.actual === null && b.actual === null ? null : (a.actual ?? 0) - (b.actual ?? 0),
    rolledIn: 0,
  }
}
// gộp nhiều tháng của 1 khoản mục thành 1 RowCell
function aggMonths(cells: Cell[], months: number[]): RowCell {
  let plan = 0, actual = 0, has = false, rolled = 0
  for (const mi of months) {
    const c = cells[mi]; if (!c) continue
    plan += c.plan
    if (c.hasActual) { actual += c.actual; has = true }
    rolled += c.rolledIn
  }
  return { plan, actual: has ? actual : null, rolledIn: rolled }
}

// ── component ─────────────────────────────────────────────────────────────────
export function TabDuBao({ month, localData, tonDauKy, tonQuyRealtime, kmcpActual }: Props) {
  const curYear = parseInt(month.split('-')[0])
  const curMon = parseInt(month.split('-')[1])   // 1..12

  const [selectedYear, setSelectedYear] = useState(curYear)
  const [view, setView] = useState<'year' | 'quarter' | 'month'>('year')
  const [quarter, setQuarter] = useState(Math.ceil(curMon / 3))  // 1..4
  const [monthSel, setMonthSel] = useState(curMon)               // 1..12
  const [monthDocs, setMonthDocs] = useState<Map<string, NganSachThang>>(new Map())
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<{ thu: boolean; chi: boolean }>({ thu: false, chi: false })
  const [busyId, setBusyId] = useState<string | null>(null)

  const todayISO = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  // ── Load 12 tháng của năm đang chọn (+ năm của tháng topbar) ──────────────────
  useEffect(() => {
    const years = new Set<number>([selectedYear, parseInt(month.split('-')[0])])
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
  }, [selectedYear, month, localData])

  const pool = useMemo(() => buildPool(monthDocs), [monthDocs])

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

  // ── Gom pool → khoản mục (leaf) × 12 tháng của selectedYear ────────────────────
  const leaves = useMemo((): Leaf[] => {
    const yStr = String(selectedYear)
    // tháng "đã chốt" (có số thực hiện) so với năm/tháng hiện tại
    const isClosed = (mi: number) =>
      selectedYear < curYear || (selectedYear === curYear && mi <= curMon - 1)
    const map = new Map<string, Leaf>()
    for (const p of pool) {
      const em = effMonth(p)
      if (em.slice(0, 4) !== yStr) continue
      const mi = parseInt(em.slice(5, 7)) - 1
      if (mi < 0 || mi > 11) continue
      const label = p.dien_giai || '(không tên)'
      const key = p.nhom + '|' + label
      let lf = map.get(key)
      if (!lf) {
        lf = { key, label, nhom: p.nhom, m: Array.from({ length: 12 }, () => ({ plan: 0, actual: 0, hasActual: false, rolledIn: 0 })) }
        map.set(key, lf)
      }
      const c = lf.m[mi]
      c.plan += p.ke_hoach
      if (isClosed(mi)) {
        const act = em === month && p.kmcp && kmcpActual[p.kmcp] !== undefined ? kmcpActual[p.kmcp] : p.thuc_hien
        c.actual += act
        c.hasActual = true
      }
      if ((p.roll_count ?? 0) > 0) c.rolledIn += p.ke_hoach
    }
    const yearPlan = (l: Leaf) => l.m.reduce((s, c) => s + c.plan, 0)
    return [...map.values()].sort((a, b) => yearPlan(b) - yearPlan(a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, selectedYear, month, kmcpActual, curYear, curMon])

  // ── Thống kê cả năm (cho KPI + tồn quỹ đầu năm) ────────────────────────────────
  const yearStat = useMemo(() => {
    let thuPlan = 0, thuAct = 0, chiPlan = 0, chiAct = 0
    const thuV = new Array(12).fill(0), chiV = new Array(12).fill(0)
    for (const l of leaves) {
      for (let mi = 0; mi < 12; mi++) {
        const c = l.m[mi]
        const val = c.hasActual ? c.actual : c.plan
        if (l.nhom === 'B') { thuPlan += c.plan; if (c.hasActual) thuAct += c.actual; thuV[mi] += val }
        else { chiPlan += c.plan; if (c.hasActual) chiAct += c.actual; chiV[mi] += val }
      }
    }
    const net = thuV.map((v, i) => v - chiV[i])
    const openings = new Array(12).fill(0)
    const anchor = selectedYear === curYear ? curMon - 1 : -1
    if (anchor >= 0) {
      openings[anchor] = tonDauKy
      for (let i = anchor - 1; i >= 0; i--) openings[i] = openings[i + 1] - net[i]
      for (let i = anchor + 1; i < 12; i++) openings[i] = openings[i - 1] + net[i - 1]
    } else {
      for (let i = 1; i < 12; i++) openings[i] = openings[i - 1] + net[i - 1]
    }
    return { thuPlan, thuAct, chiPlan, chiAct, openingYear: openings[0] }
  }, [leaves, selectedYear, tonDauKy, curYear, curMon])

  // ── Mô hình bảng theo chế độ xem ───────────────────────────────────────────────
  const model = useMemo(() => {
    let cols: { key: string; label: string }[]
    let totalLabel: string
    let cellOf: (l: Leaf, colKey: string) => RowCell
    let totalOf: (l: Leaf) => RowCell

    if (view === 'year') {
      cols = [1, 2, 3, 4].map(q => ({ key: 'Q' + q, label: 'Quý ' + q }))
      totalLabel = 'Cả năm'
      cellOf = (l, k) => { const q = parseInt(k.slice(1)) - 1; return aggMonths(l.m, [q * 3, q * 3 + 1, q * 3 + 2]) }
      totalOf = (l) => aggMonths(l.m, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    } else if (view === 'quarter') {
      const ms = [(quarter - 1) * 3, (quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2]
      cols = ms.map(m => ({ key: 'M' + m, label: MONTH_SHORT[m] }))
      totalLabel = 'Quý ' + quarter
      cellOf = (l, k) => aggMonths(l.m, [parseInt(k.slice(1))])
      totalOf = (l) => aggMonths(l.m, ms)
    } else {
      // month view → chia theo tuần (dựa vào ngày dự kiến)
      const mi = monthSel - 1
      const yStr = String(selectedYear)
      const isClosed = selectedYear < curYear || (selectedYear === curYear && mi <= curMon - 1)
      const wkPlan = new Map<string, Record<string, { plan: number; rolled: number }>>()
      let hasU = false
      for (const p of pool) {
        const em = effMonth(p)
        if (em.slice(0, 4) !== yStr || parseInt(em.slice(5, 7)) - 1 !== mi) continue
        const label = p.dien_giai || '(không tên)'
        const key = p.nhom + '|' + label
        const wk = p.ngay ? 'W' + Math.min(4, Math.max(1, Math.ceil(parseInt(p.ngay.slice(8, 10)) / 7))) : 'U'
        if (wk === 'U') hasU = true
        const rec = wkPlan.get(key) ?? {}
        const cur = rec[wk] ?? { plan: 0, rolled: 0 }
        cur.plan += p.ke_hoach
        if ((p.roll_count ?? 0) > 0) cur.rolled += p.ke_hoach
        rec[wk] = cur; wkPlan.set(key, rec)
      }
      cols = [1, 2, 3, 4].map(w => ({ key: 'W' + w, label: 'Tuần ' + w }))
      if (hasU) cols.push({ key: 'U', label: 'Chưa xếp' })
      totalLabel = MONTH_FULL[mi]
      cellOf = (l, k) => {
        const rec = wkPlan.get(l.key) ?? {}
        const wp = rec[k]?.plan ?? 0
        const wr = rec[k]?.rolled ?? 0
        const mp = l.m[mi].plan, ma = l.m[mi].actual, mHas = l.m[mi].hasActual && isClosed
        // TH tuần = phân bổ theo tỉ trọng kế hoạch (số thực nằm ở cột Tổng)
        const actual = mHas ? (mp > 0 ? ma * (wp / mp) : 0) : null
        return { plan: wp, actual, rolledIn: wr }
      }
      totalOf = (l) => aggMonths(l.m, [mi])
    }

    const buildGroup = (type: 'thu' | 'chi', label: string) => {
      const gl = leaves.filter(l => (type === 'thu' ? l.nhom === 'B' : l.nhom === 'C'))
      const items = gl.map(l => ({
        label: l.label,
        cells: cols.map(c => cellOf(l, c.key)),
        total: totalOf(l),
      }))
      const totalCells = cols.map((_, ci) => items.reduce((acc, it) => addRC(acc, it.cells[ci]), zeroRC()))
      const total = items.reduce((acc, it) => addRC(acc, it.total), zeroRC())
      return { type, label, items, totalCells, total }
    }
    const thu = buildGroup('thu', 'THU — Nguồn thu')
    const chi = buildGroup('chi', 'CHI — Nhu cầu chi')
    const netCells = cols.map((_, ci) => subRC(thu.totalCells[ci], chi.totalCells[ci]))
    const grandNet = subRC(thu.total, chi.total)
    return { cols, totalLabel, thu, chi, netCells, grandNet }
  }, [leaves, pool, view, quarter, monthSel, selectedYear, curYear, curMon])

  // ── Khoản quá hạn (mọi doc): có ngày < hôm nay & chưa xong ─────────────────────
  const overdue = useMemo(() => pool
    .filter(p => p.ngay && p.ngay < todayISO && !isDone(p))
    .map(p => ({ ...p, daysLate: Math.max(0, Math.round((new Date(todayISO).getTime() - new Date(p.ngay!).getTime()) / 86400000)) }))
    .sort((a, b) => (a.ngay! < b.ngay! ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , [pool, todayISO, month, kmcpActual])

  // ── Ghi 1 doc ──────────────────────────────────────────────────────────────────
  const patchItem = async (docMonth: string, id: string, patch: Record<string, unknown>) => {
    const doc = monthDocs.get(docMonth)
    if (!doc) return
    setBusyId(id)
    const updated: NganSachThang = { ...doc, items: doc.items.map(it => it.id === id ? { ...it, ...patch } : it) }
    setMonthDocs(prev => new Map(prev).set(docMonth, updated))
    try { await saveNganSach(updated) } catch { /* giữ state local nếu lỗi mạng */ }
    finally { setBusyId(null) }
  }
  const deferMode = view === 'month' ? 'week' : 'month'
  const deferItem = (o: PoolItem) =>
    patchItem(o.docMonth, o.id, { ngay_du_kien: advanceDate(o.ngay!, deferMode), roll_count: (o.roll_count ?? 0) + 1 })
  const markDone = (o: PoolItem) => patchItem(o.docMonth, o.id, { done_override: true })

  // ── KPI (cả năm) ───────────────────────────────────────────────────────────────
  const netPlanY = yearStat.thuPlan - yearStat.chiPlan
  const netActY = yearStat.thuAct - yearStat.chiAct
  const kpis: {
    label: string; value: string; pct?: number; color?: string; sub?: string; subTone?: 'pos' | 'neg'; accent?: boolean
  }[] = [
    { label: `Tổng thu · KH ${selectedYear}`, value: fmtM(yearStat.thuPlan), pct: yearStat.thuPlan ? yearStat.thuAct / yearStat.thuPlan * 100 : 0, color: 'var(--green)', sub: `Thực hiện ${fmtM(yearStat.thuAct)} tr₫` },
    { label: `Tổng chi · KH ${selectedYear}`, value: fmtM(yearStat.chiPlan), pct: yearStat.chiPlan ? yearStat.chiAct / yearStat.chiPlan * 100 : 0, color: 'var(--red)', sub: `Thực hiện ${fmtM(yearStat.chiAct)} tr₫` },
    { label: 'Dòng tiền ròng · TH', value: fmtM(netActY), sub: `Kế hoạch ${fmtM(netPlanY)} tr₫`, subTone: netActY >= netPlanY ? 'pos' : 'neg' },
    { label: `Tồn quỹ đầu ${selectedYear}`, value: fmtM(yearStat.openingYear), sub: 'Số dư đầu kỳ ước tính' },
    { label: 'Tồn quỹ hiện tại', value: fmtM(tonQuyRealtime), sub: 'Số dư thực tế', accent: true },
  ]

  const YEARS = [curYear - 2, curYear - 1, curYear, curYear + 1, curYear + 2]
  const toggle = (t: 'thu' | 'chi') => setCollapsed(p => ({ ...p, [t]: !p[t] }))

  // ── Ô số KH/TH ─────────────────────────────────────────────────────────────────
  function RC({ rc, good }: { rc: RowCell; good: boolean }) {
    if (rc.plan === 0 && (rc.actual === null || rc.actual === 0))
      return <div className="du-pair"><span className="du-future">—</span></div>
    if (rc.actual === null)
      return <div className="du-pair"><span className="du-plan">{fmtM(rc.plan)}</span><span className="du-future">chưa đến kỳ</span></div>
    const delta = rc.actual - rc.plan
    const fav = good ? delta >= 0 : delta <= 0
    return (
      <div className="du-pair">
        <span className="du-plan">KH {fmtM(rc.plan)}</span>
        <span className="du-actual">{fmtM(rc.actual)}</span>
        <span className={'du-delta ' + (fav ? 'pos' : 'neg')}>{delta >= 0 ? '+' : '−'}{fmtM(Math.abs(delta))}</span>
        {rc.rolledIn > 0 && <span className="du-roll">↩ dời {fmtM(rc.rolledIn)}</span>}
      </div>
    )
  }

  const renderGroup = (g: typeof model.thu) => (
    <>
      <tr className={'row-group' + (collapsed[g.type] ? ' collapsed' : '')}>
        <td className="label-cell" onClick={() => toggle(g.type)}>
          <span className="lc">
            <span className="caret">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
            </span>
            <span className={'type-icon ' + g.type}>{g.type === 'thu' ? '↑' : '↓'}</span>
            {g.label}
          </span>
        </td>
        {g.totalCells.map((rc, ci) => <td key={ci} className="num-cell"><RC rc={rc} good={g.type === 'thu'} /></td>)}
        <td className="num-cell total-col"><RC rc={g.total} good={g.type === 'thu'} /></td>
      </tr>
      {!collapsed[g.type] && g.items.map(it => (
        <tr className="item-row" key={it.label}>
          <td className="label-cell">{it.label}</td>
          {it.cells.map((rc, ci) => <td key={ci} className="num-cell"><RC rc={rc} good={g.type === 'thu'} /></td>)}
          <td className="num-cell total-col"><RC rc={it.total} good={g.type === 'thu'} /></td>
        </tr>
      ))}
    </>
  )

  return (
    <div className="dubao">
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <div className="du-topbar">
        <div className="du-brand">
          <div className="du-mark"><span>SA</span></div>
          <div>
            <div className="du-eyebrow">Sơn An Group · Kiểm soát tài chính</div>
            <h1 className="du-title">Dự Báo Dòng Tiền — Năm {selectedYear}</h1>
            <div className="du-sub">Kế hoạch (KH) so với Thực hiện (TH) · khoản chưa TH tự dời sang kỳ sau</div>
          </div>
        </div>
        <div className="du-top-right">
          {loading && <span style={{ fontSize: 12, color: 'var(--grey)' }}>⏳ Đang tải…</span>}
          <span className="du-unit-chip">Đơn vị: Triệu ₫</span>
          <button className="du-btn" onClick={() => window.print()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v13m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
            Xuất báo cáo
          </button>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="du-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className={'du-kpi' + (k.accent ? ' accent' : '')}>
            <div className="du-kpi-label">{k.label}</div>
            <div className="du-kpi-val">{k.value}<small>tr₫</small></div>
            {k.pct !== undefined ? (
              <div className="du-kpi-bar-row">
                <span>{k.pct.toFixed(0)}% TH</span>
                <span className="du-kpi-bar"><i style={{ width: Math.min(100, Math.max(0, k.pct)) + '%', background: k.color }} /></span>
              </div>
            ) : (
              <div className={'du-kpi-sub ' + (k.subTone ?? '')}>{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── CONTROLS ── */}
      <div className="du-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="du-switch">
            {([['year', 'Cả năm'], ['quarter', 'Theo Quý'], ['month', 'Theo Tháng']] as const).map(([v, l]) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
          <select className="du-select" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
        </div>

        <div className="du-picker">
          {view === 'quarter' && <>
            <span className="du-picker-label">Chọn Quý:</span>
            {[1, 2, 3, 4].map(q => (
              <button key={q} className={'du-chip' + (quarter === q ? ' active' : '')} onClick={() => setQuarter(q)}>Quý {q}</button>
            ))}
          </>}
          {view === 'month' && <>
            <span className="du-picker-label">Chọn Tháng:</span>
            {MONTH_SHORT.map((l, i) => (
              <button key={i} className={'du-chip' + (monthSel === i + 1 ? ' active' : '')} onClick={() => setMonthSel(i + 1)}>{l}</button>
            ))}
          </>}
        </div>

        <div className="du-legend">
          <span><span className="dot" style={{ background: 'var(--green)' }} />Đạt / vượt KH</span>
          <span><span className="dot" style={{ background: 'var(--red)' }} />Chưa đạt KH</span>
          <span><span className="dot" style={{ background: 'var(--amber)' }} />Dời sang kỳ sau</span>
        </div>
      </div>

      {/* ── BẢNG ── */}
      <div className="du-card">
        <div className="du-scroll">
          <table className="cf">
            <thead>
              <tr className="period-row">
                <th rowSpan={2}>Khoản mục dòng tiền</th>
                {model.cols.map(c => <th key={c.key}>{c.label}</th>)}
                <th className="total-col">{model.totalLabel} (Tổng)</th>
              </tr>
              <tr className="sub-row">
                {model.cols.map(c => <th key={c.key}>KH&nbsp;/&nbsp;TH</th>)}
                <th className="total-col">KH&nbsp;/&nbsp;TH</th>
              </tr>
            </thead>
            <tbody>
              {renderGroup(model.thu)}
              {renderGroup(model.chi)}

              <tr className="total-row">
                <td className="label-cell">Tổng THU</td>
                {model.thu.totalCells.map((rc, ci) => <td key={ci} className="num-cell"><RC rc={rc} good /></td>)}
                <td className="num-cell total-col"><RC rc={model.thu.total} good /></td>
              </tr>
              <tr className="total-row">
                <td className="label-cell">Tổng CHI</td>
                {model.chi.totalCells.map((rc, ci) => <td key={ci} className="num-cell"><RC rc={rc} good={false} /></td>)}
                <td className="num-cell total-col"><RC rc={model.chi.total} good={false} /></td>
              </tr>
              <tr className="net-row">
                <td className="label-cell">Dòng tiền ròng (Thu − Chi)</td>
                {model.netCells.map((rc, ci) => <td key={ci} className="num-cell"><RC rc={rc} good /></td>)}
                <td className="num-cell total-col"><RC rc={model.grandNet} good /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="footnote">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          Khoản chưa thực hiện được dời sang kỳ kế tiếp — đánh dấu bằng nhãn hổ phách. Nhấp vào tên nhóm “THU” / “CHI” để mở rộng hoặc thu gọn chi tiết.
          {view === 'month' && ' Số TH theo tuần là ước tính phân bổ theo kế hoạch; số thực tế tổng nằm ở cột Tổng.'}
        </div>
      </div>

      {/* ── CẢNH BÁO: khoản quá hạn ── */}
      {overdue.length > 0 && (
        <div className="du-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--du-serif)', fontWeight: 700, fontSize: 16, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            ⚠ Khoản quá hạn cần xử lý
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--grey)', marginBottom: 12 }}>
            {overdue.length} khoản có ngày dự kiến đã qua nhưng chưa thực hiện — dời sang kỳ sau hoặc đánh dấu đã xong.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                {overdue.map(o => (
                  <tr key={`${o.docMonth}-${o.id}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '7px 8px 7px 0', color: 'var(--red)', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: MONO }}>
                      {o.ngay}<span style={{ color: 'var(--grey)', fontWeight: 500 }}> · trễ {o.daysLate}d{o.roll_count ? ` · dời ${o.roll_count}×` : ''}</span>
                    </td>
                    <td style={{ padding: '7px 8px', color: '#1F2937' }}>{o.dien_giai || '—'}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: o.nhom === 'B' ? 'var(--green)' : 'var(--red)', fontFamily: MONO }}>
                      {(o.nhom === 'B' ? '+' : '−') + fmtM(amountOf(o))} tr₫
                    </td>
                    <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => deferItem(o)} disabled={busyId === o.id} style={actBtn('#FBF0DD', '#B8862F', '#EBD9AE', busyId === o.id)}>↪ Dời {deferMode === 'week' ? 'tuần sau' : 'tháng sau'}</button>
                      <button onClick={() => markDone(o)} disabled={busyId === o.id} style={{ ...actBtn('#E4F3EC', '#2F7D5E', '#B7DEC9', busyId === o.id), marginLeft: 6 }}>✓ Đã xong</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace"
function actBtn(bg: string, color: string, border: string, busy: boolean): CSSProperties {
  return { padding: '4px 11px', fontSize: 11, fontWeight: 700, borderRadius: 6, background: bg, color, border: `1px solid ${border}`, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
.dubao{
  --navy:#1C3557; --navy-deep:#122238; --navy-mid:#2A4770; --navy-pale:#EEF2F7;
  --gold:#D4A64A; --gold-soft:#F3E3C0; --gold-deep:#B4832E;
  --ink:#1B2430; --line:#DFE1E6; --green:#2F7D5E; --green-soft:#E4F3EC;
  --red:#B4453A; --red-soft:#FBEAE7; --amber:#B8862F; --amber-soft:#FBF0DD; --grey:#8A8F98;
  --du-serif:'Playfair Display', Georgia, 'Times New Roman', serif;
  --du-mono:'JetBrains Mono', ui-monospace, Consolas, monospace;
  color:var(--ink);
}
.dubao *{box-sizing:border-box;}
.dubao .du-topbar{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:20px;margin-bottom:22px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:14px;}
.dubao .du-brand{display:flex;align-items:center;gap:14px;}
.dubao .du-mark{width:46px;height:46px;border-radius:10px;background:linear-gradient(155deg,var(--navy),var(--navy-deep));display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;box-shadow:0 1px 2px rgba(28,53,87,.12);flex:none;}
.dubao .du-mark::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(212,166,74,.5) 50%,transparent 60%);}
.dubao .du-mark span{font-family:var(--du-serif);color:var(--gold);font-weight:700;font-size:20px;z-index:1;}
.dubao .du-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:700;margin-bottom:3px;}
.dubao .du-title{font-family:var(--du-serif);font-weight:600;font-size:24px;color:var(--navy-deep);margin:0;letter-spacing:-.01em;}
.dubao .du-sub{font-size:12.5px;color:var(--grey);margin-top:3px;}
.dubao .du-top-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.dubao .du-unit-chip{font-size:12px;color:var(--navy);background:var(--navy-pale);padding:7px 13px;border-radius:20px;font-weight:600;border:1px solid rgba(28,53,87,.10);}
.dubao .du-btn{display:flex;align-items:center;gap:7px;background:var(--navy-deep);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s;}
.dubao .du-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(18,34,56,.14);}

.dubao .du-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:24px;}
.dubao .du-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 17px;position:relative;overflow:hidden;box-shadow:0 1px 2px rgba(28,53,87,.05);}
.dubao .du-kpi.accent::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--gold),var(--gold-deep));}
.dubao .du-kpi-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--grey);font-weight:700;margin-bottom:10px;}
.dubao .du-kpi-val{font-family:var(--du-mono);font-size:20px;font-weight:600;color:var(--navy-deep);letter-spacing:-.01em;}
.dubao .du-kpi-val small{font-size:11px;color:var(--grey);font-weight:500;margin-left:3px;}
.dubao .du-kpi-bar-row{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11.5px;font-weight:600;color:var(--grey);}
.dubao .du-kpi-bar{flex:1;height:5px;background:var(--navy-pale);border-radius:3px;overflow:hidden;}
.dubao .du-kpi-bar i{display:block;height:100%;border-radius:3px;}
.dubao .du-kpi-sub{margin-top:10px;font-size:11.5px;color:var(--grey);font-weight:500;}
.dubao .du-kpi-sub.pos{color:var(--green);font-weight:600;}
.dubao .du-kpi-sub.neg{color:var(--red);font-weight:600;}

.dubao .du-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:16px;box-shadow:0 1px 2px rgba(28,53,87,.05);}
.dubao .du-switch{display:flex;background:var(--navy-pale);border-radius:9px;padding:4px;gap:2px;}
.dubao .du-switch button{font-family:inherit;border:none;background:transparent;padding:8px 16px;border-radius:7px;font-size:13px;font-weight:700;color:var(--navy-mid);cursor:pointer;transition:all .15s;}
.dubao .du-switch button.active{background:var(--navy-deep);color:#fff;}
.dubao .du-select{font-family:inherit;font-size:12.5px;font-weight:700;color:var(--navy);background:#fff;border:1px solid var(--line);border-radius:20px;padding:8px 12px;cursor:pointer;}
.dubao .du-picker{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.dubao .du-picker-label{font-size:12px;color:var(--grey);font-weight:600;margin-right:2px;}
.dubao .du-chip{font-family:inherit;border:1px solid var(--line);background:#fff;padding:6px 13px;border-radius:20px;font-size:12.5px;font-weight:600;color:var(--navy);cursor:pointer;transition:all .15s;}
.dubao .du-chip:hover{border-color:var(--gold-deep);}
.dubao .du-chip.active{background:var(--gold-soft);border-color:var(--gold-deep);color:var(--gold-deep);}
.dubao .du-legend{display:flex;align-items:center;gap:14px;font-size:11.5px;color:var(--grey);flex-wrap:wrap;}
.dubao .du-legend .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle;}

.dubao .du-card{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 2px rgba(28,53,87,.05);overflow:hidden;margin-bottom:20px;}
.dubao .du-scroll{overflow-x:auto;}
.dubao table.cf{border-collapse:collapse;width:100%;min-width:900px;}
.dubao table.cf thead tr.period-row th{background:var(--navy-deep);color:#fff;font-weight:700;font-size:12.5px;padding:12px 14px 8px;text-align:center;border-right:1px solid rgba(255,255,255,.08);font-family:var(--du-serif);letter-spacing:.02em;}
.dubao table.cf thead tr.period-row th:first-child{text-align:left;position:sticky;left:0;z-index:3;background:var(--navy-deep);}
.dubao table.cf thead tr.sub-row th{background:var(--navy-mid);color:rgba(255,255,255,.88);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:7px 10px;text-align:right;border-right:1px solid rgba(255,255,255,.08);}
.dubao table.cf thead tr.sub-row th:first-child{position:sticky;left:0;background:var(--navy-mid);text-align:left;z-index:3;}
.dubao table.cf th.total-col{background:#16294a;}
.dubao .row-group>td.label-cell{background:var(--navy-pale);font-weight:700;color:var(--navy-deep);padding:11px 14px;font-size:13px;cursor:pointer;position:sticky;left:0;z-index:2;border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.dubao .row-group>td.label-cell .lc{display:flex;align-items:center;gap:9px;}
.dubao .row-group .caret{display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;transition:transform .18s;color:var(--gold-deep);flex:none;}
.dubao .row-group.collapsed .caret{transform:rotate(-90deg);}
.dubao .row-group td.num-cell{background:var(--navy-pale);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
.dubao tr.item-row td{border-bottom:1px solid #EEEFF1;}
.dubao tr.item-row td.label-cell{padding:9px 14px 9px 34px;font-size:12.5px;color:var(--ink);position:sticky;left:0;background:#fff;z-index:1;}
.dubao tr.item-row:nth-child(even) td.label-cell,.dubao tr.item-row:nth-child(even) td.num-cell{background:#FBFAF8;}
.dubao .num-cell{padding:8px 10px;text-align:right;border-right:1px solid #EEEFF1;vertical-align:top;}
.dubao .du-pair{display:flex;flex-direction:column;gap:2px;align-items:flex-end;}
.dubao .du-plan{font-family:var(--du-mono);font-size:11px;color:var(--grey);}
.dubao .du-actual{font-family:var(--du-mono);font-size:12.5px;font-weight:700;color:var(--navy-deep);}
.dubao .du-future{font-family:var(--du-mono);font-size:11px;color:#C6CAD2;}
.dubao .du-delta{font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:8px;display:inline-block;margin-top:1px;}
.dubao .du-delta.pos{background:var(--green-soft);color:var(--green);}
.dubao .du-delta.neg{background:var(--red-soft);color:var(--red);}
.dubao .du-roll{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;background:var(--amber-soft);color:var(--amber);padding:1px 6px;border-radius:8px;margin-top:1px;}
.dubao tr.total-row td{background:var(--navy-deep);color:#fff;font-weight:700;}
.dubao tr.total-row td.label-cell{position:sticky;left:0;z-index:2;background:var(--navy-deep);color:#fff;font-size:13px;padding:12px 14px;font-family:var(--du-serif);}
.dubao tr.total-row .du-plan{color:rgba(255,255,255,.55);}
.dubao tr.total-row .du-actual,.dubao tr.total-row .du-future{color:#fff;}
.dubao tr.net-row td{background:var(--gold-soft);}
.dubao tr.net-row td.label-cell{position:sticky;left:0;z-index:2;background:var(--gold-soft);color:var(--gold-deep);font-size:13px;font-family:var(--du-serif);font-weight:700;padding:12px 14px;}
.dubao tr.net-row .du-actual{color:var(--gold-deep);font-size:13.5px;}
.dubao tr.net-row .du-plan{color:var(--gold-deep);opacity:.6;}
.dubao .num-cell.total-col{background:#F4F1EA;border-right:none;}
.dubao .row-group td.num-cell.total-col{background:#E4E0D3;}
.dubao tr.total-row td.num-cell.total-col{background:#0E1F38;}
.dubao tr.net-row td.num-cell.total-col{background:#EAD9AE;}
.dubao .type-icon{width:15px;height:15px;flex:none;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}
.dubao .type-icon.thu{background:var(--green-soft);color:var(--green);}
.dubao .type-icon.chi{background:var(--red-soft);color:var(--red);}
.dubao .footnote{display:flex;align-items:center;gap:8px;padding:12px 16px;font-size:11.5px;color:var(--grey);border-top:1px solid var(--line);background:#FBFAF8;}
.dubao .footnote svg{color:var(--gold-deep);flex:none;}
@media (max-width:900px){.dubao .du-kpi-grid{grid-template-columns:repeat(2,1fr);}}
`
