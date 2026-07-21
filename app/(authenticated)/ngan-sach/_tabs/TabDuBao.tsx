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

interface MonthAgg {
  idx: number               // 0..11
  thu: number
  chi: number
  net: number
  opening: number
  closing: number
  isCurrent: boolean
}

const MONTH_FULL = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
const MONTH_SHORT = ['Th.1', 'Th.2', 'Th.3', 'Th.4', 'Th.5', 'Th.6', 'Th.7', 'Th.8', 'Th.9', 'Th.10', 'Th.11', 'Th.12']
const MONO = 'ui-monospace, "Cascadia Code", Consolas, "Liberation Mono", monospace'

const DEFER_LABEL: Record<'week' | 'month', string> = { week: 'tuần sau', month: 'tháng sau' }

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
function advanceDate(iso: string, mode: 'week' | 'month'): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (mode === 'week') dt.setDate(dt.getDate() + 7)
  else dt.setMonth(dt.getMonth() + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const fmt = (n: number) => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('vi-VN') + ' ₫'
const fmtShort = (n: number) => {
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace(/\.0$/, '') + ' tỷ'
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace(/\.0$/, '') + ' tr'
  return s + a.toLocaleString('vi-VN')
}

// ── component ─────────────────────────────────────────────────────────────────
export function TabDuBao({ month, localData, tonDauKy, tonQuyRealtime, kmcpActual }: Props) {
  const curYear = parseInt(month.split('-')[0])
  const curMon  = parseInt(month.split('-')[1])

  const [selectedYear, setSelectedYear] = useState(curYear)
  const [quarter, setQuarter]   = useState<'all' | number>('all')  // 0..3
  const [monthSel, setMonthSel] = useState<'all' | number>('all')  // 0..11
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [monthDocs, setMonthDocs] = useState<Map<string, NganSachThang>>(new Map())
  const [loading, setLoading] = useState(false)
  const [openRows, setOpenRows] = useState<Set<number>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const todayISO = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  // ── Load 12 tháng của năm đang chọn (+ năm của tháng topbar) ────────────────
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

  const effMonth = (p: PoolItem) => (p.ngay ? p.ngay.slice(0, 7) : p.docMonth)
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

  // Tổng hợp 12 tháng của selectedYear (thu/chi + tồn đầu/cuối kỳ nối tiếp)
  const monthsAgg = useMemo((): MonthAgg[] => {
    const yStr = String(selectedYear)
    const bc = Array.from({ length: 12 }, () => ({ B: 0, C: 0 }))
    for (const p of pool) {
      const em = effMonth(p)
      if (em.slice(0, 4) !== yStr) continue
      const mi = parseInt(em.slice(5, 7)) - 1
      if (mi < 0 || mi > 11) continue
      const v = amountOf(p)
      if (v === 0) continue
      if (p.nhom === 'B') bc[mi].B += v; else bc[mi].C += v
    }
    const anchorIdx = selectedYear === curYear ? curMon - 1 : -1
    const openings = new Array(12).fill(0)
    if (anchorIdx >= 0) {
      openings[anchorIdx] = tonDauKy
      for (let i = anchorIdx - 1; i >= 0; i--) openings[i] = openings[i + 1] - bc[i].B + bc[i].C
      for (let i = anchorIdx + 1; i < 12; i++) openings[i] = openings[i - 1] + bc[i - 1].B - bc[i - 1].C
    } else {
      for (let i = 1; i < 12; i++) openings[i] = openings[i - 1] + bc[i - 1].B - bc[i - 1].C
    }
    const todayM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    return bc.map((c, i) => ({
      idx: i, thu: c.B, chi: c.C, net: c.B - c.C,
      opening: openings[i], closing: openings[i] + c.B - c.C,
      isCurrent: `${selectedYear}-${String(i + 1).padStart(2, '0')}` === todayM,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, selectedYear, tonDauKy, month, curYear, curMon, kmcpActual])

  // Chi tiết hạng mục 1 tháng (gộp theo diễn giải)
  const detailFor = (i: number) => {
    const mk = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
    const inc = new Map<string, number>(), exp = new Map<string, number>()
    for (const p of pool) {
      if (effMonth(p) !== mk) continue
      const v = amountOf(p)
      if (v === 0) continue
      const map = p.nhom === 'B' ? inc : exp
      const key = p.dien_giai || '(không tên)'
      map.set(key, (map.get(key) ?? 0) + v)
    }
    const toArr = (m: Map<string, number>) => [...m].map(([name, amt]) => ({ name, amt })).sort((a, b) => b.amt - a.amt)
    return { income: toArr(inc), expense: toArr(exp) }
  }

  // Chia tuần trong 1 tháng (theo ngày dự kiến; khoản chưa có ngày gộp riêng)
  const weeksFor = (i: number) => {
    const mk = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
    const wk = new Map<number, { income: number; expense: number }>()
    let uns = { income: 0, expense: 0 }; let hasUns = false
    for (const p of pool) {
      const v = amountOf(p)
      if (v === 0) continue
      if (p.ngay && p.ngay.slice(0, 7) === mk) {
        const w = Math.ceil(parseInt(p.ngay.slice(8, 10)) / 7)
        const cur = wk.get(w) ?? { income: 0, expense: 0 }
        if (p.nhom === 'B') cur.income += v; else cur.expense += v
        wk.set(w, cur)
      } else if (!p.ngay && p.docMonth === mk) {
        if (p.nhom === 'B') uns.income += v; else uns.expense += v
        hasUns = true
      }
    }
    const arr = [...wk.entries()].sort((a, b) => a[0] - b[0]).map(([w, v]) => ({ label: `Tuần ${w}`, ...v }))
    if (hasUns) arr.push({ label: 'Chưa có ngày', ...uns })
    return arr
  }

  // Khoản quá hạn (mọi doc): có ngày < hôm nay & chưa xong
  const overdue = useMemo(() => pool
    .filter(p => p.ngay && p.ngay < todayISO && !isDone(p))
    .map(p => ({ ...p, daysLate: Math.max(0, Math.round((new Date(todayISO).getTime() - new Date(p.ngay!).getTime()) / 86400000)) }))
    .sort((a, b) => (a.ngay! < b.ngay! ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , [pool, todayISO, month, kmcpActual])

  // ── Ghi 1 doc ────────────────────────────────────────────────────────────────
  const patchItem = async (docMonth: string, id: string, patch: Record<string, unknown>) => {
    const doc = monthDocs.get(docMonth)
    if (!doc) return
    setBusyId(id)
    const updated: NganSachThang = { ...doc, items: doc.items.map(it => it.id === id ? { ...it, ...patch } : it) }
    setMonthDocs(prev => new Map(prev).set(docMonth, updated))
    try { await saveNganSach(updated) } catch { /* giữ state local nếu lỗi mạng */ }
    finally { setBusyId(null) }
  }
  const deferItem = (o: PoolItem) =>
    patchItem(o.docMonth, o.id, { ngay_du_kien: advanceDate(o.ngay!, viewMode), roll_count: (o.roll_count ?? 0) + 1 })
  const markDone = (o: PoolItem) => patchItem(o.docMonth, o.id, { done_override: true })

  // ── Phạm vi kỳ đang chọn ────────────────────────────────────────────────────
  const monthIdxs = useMemo(() => {
    if (monthSel !== 'all') return [monthSel]
    if (quarter === 'all') return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    return [quarter * 3, quarter * 3 + 1, quarter * 3 + 2]
  }, [monthSel, quarter])

  const safety = Math.max(0, Math.round((tonDauKy || tonQuyRealtime) * 0.15))
  const sel = monthIdxs.map(i => monthsAgg[i]).filter(Boolean)
  const totalThu = sel.reduce((s, m) => s + m.thu, 0)
  const totalChi = sel.reduce((s, m) => s + m.chi, 0)
  const net = totalThu - totalChi
  const endingBal = sel.length ? sel[sel.length - 1].closing : (tonDauKy || tonQuyRealtime)
  const riskMonths = sel.filter(m => m.closing < safety)
  const periodLabel = monthSel !== 'all' ? `${MONTH_FULL[monthSel as number]} · ${selectedYear}`
    : quarter === 'all' ? `Năm ${selectedYear}` : `Quý ${(quarter as number) + 1} · ${selectedYear}`

  const toggleRow = (i: number) =>
    setOpenRows(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })

  // ── styles (nền sáng, đồng bộ app) ──────────────────────────────────────────
  const INK = '#1C3557', DIM = '#64748B', FAINT = '#94A3B8'
  const GREEN = '#15803D', CORAL = '#B91C1C', AMBER = '#D97706', EXP = '#9A3412'
  const panel: CSSProperties = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14 }
  const chip = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? INK : '#E5E7EB'}`, background: active ? INK : '#fff',
    color: active ? '#fff' : DIM, padding: '6px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  })
  const num: CSSProperties = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }
  const balColor = (v: number) => v < 0 ? CORAL : v < safety ? AMBER : INK

  const YEARS = [curYear - 2, curYear - 1, curYear, curYear + 1, curYear + 2]

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: FAINT, fontWeight: 700 }}>Sổ cái dòng tiền</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 3 }}>📅 Dự báo dòng tiền</div>
          <div style={{ fontSize: 12.5, color: DIM, marginTop: 3 }}>Theo dõi thu – chi, phát hiện kỳ thiếu hụt và gợi ý cân đối.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{periodLabel}</div>
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>
            {sel.length} tháng · {riskMonths.length ? `${riskMonths.length} kỳ rủi ro` : 'Đủ dòng tiền'}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ ...panel, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: FAINT, fontWeight: 700 }}>Năm</span>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            style={{ background: '#fff', color: INK, border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: FAINT, fontWeight: 700 }}>Kỳ</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['all', 'Cả năm'], [0, 'Quý 1'], [1, 'Quý 2'], [2, 'Quý 3'], [3, 'Quý 4']] as [('all' | number), string][]).map(([v, l]) => (
              <button key={String(v)} style={chip(monthSel === 'all' && quarter === v)}
                onClick={() => { setQuarter(v); setMonthSel('all') }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: FAINT, fontWeight: 700 }}>Tháng</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={chip(monthSel === 'all')} onClick={() => setMonthSel('all')}>Tất cả</button>
            {MONTH_SHORT.map((l, i) => (
              <button key={i} style={chip(monthSel === i)} onClick={() => setMonthSel(i)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: FAINT, fontWeight: 700 }}>Hiển thị</span>
          <div style={{ display: 'flex', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                background: viewMode === v ? INK : '#fff', color: viewMode === v ? '#fff' : DIM,
                border: 'none', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{v === 'month' ? 'Theo tháng' : 'Theo tuần'}</button>
            ))}
          </div>
        </div>
        {loading && <span style={{ fontSize: 12, color: FAINT }}>⏳ Đang tải…</span>}
      </div>

      {/* ── Overview cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Tổng thu', value: fmt(totalThu), color: GREEN, tag: null as [string, boolean] | null },
          { label: 'Tổng chi', value: fmt(totalChi), color: EXP, tag: null },
          { label: 'Chênh lệch dòng tiền', value: (net >= 0 ? '+' : '') + fmt(net), color: net >= 0 ? GREEN : CORAL, tag: (net >= 0 ? ['Dư dòng tiền', true] : ['Thiếu hụt', false]) as [string, boolean] },
          { label: 'Số dư cuối kỳ dự kiến', value: fmt(endingBal), color: balColor(endingBal), tag: (riskMonths.length ? [`${riskMonths.length} kỳ rủi ro`, false] : ['Ổn định', true]) as [string, boolean] },
        ].map(c => (
          <div key={c.label} style={{ ...panel, padding: '16px 18px', position: 'relative' }}>
            {c.tag && (
              <span style={{
                position: 'absolute', top: 14, right: 14, fontSize: 9.5, padding: '3px 8px', borderRadius: 6,
                textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700,
                background: c.tag[1] ? '#ECFDF5' : '#FEF2F2', color: c.tag[1] ? GREEN : CORAL,
              }}>{c.tag[0]}</span>
            )}
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: FAINT, fontWeight: 700, marginBottom: 10 }}>{c.label}</div>
            <div style={{ ...num, fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Ledger ── */}
      <div style={{ ...panel, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: INK }}>Chi tiết dòng tiền</span>
          <span style={{ fontSize: 12, color: FAINT }}>Bấm vào từng dòng để mở/đóng chi tiết hạng mục</span>
        </div>
        {sel.length === 0 && !loading && (
          <div style={{ padding: 32, textAlign: 'center', color: FAINT, fontSize: 13 }}>Chưa có dữ liệu cho kỳ này.</div>
        )}
        {sel.map(m => {
          const open = openRows.has(m.idx)
          const bad = m.closing < 0
          const thin = !bad && m.closing < safety
          const detail = open ? detailFor(m.idx) : null
          const weeks = open && viewMode === 'week' ? weeksFor(m.idx) : []
          const topExp = detail?.expense[0]
          return (
            <div key={m.idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <div onClick={() => toggleRow(m.idx)} style={{
                display: 'grid', gridTemplateColumns: '24px 1.6fr .9fr .9fr .9fr 1fr', alignItems: 'center',
                gap: 10, padding: '13px 20px', cursor: 'pointer', background: m.isCurrent ? '#FEFCE8' : 'transparent',
              }}>
                <span style={{ color: open ? INK : FAINT, fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                <div style={{ fontWeight: 700, fontSize: 14, color: INK, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: bad ? CORAL : thin ? AMBER : GREEN, flexShrink: 0 }} />
                  {MONTH_FULL[m.idx]}
                  {m.isCurrent && <span style={{ fontSize: 9.5, fontWeight: 700, color: AMBER, background: '#FEF9C3', padding: '1px 6px', borderRadius: 10 }}>hiện tại</span>}
                </div>
                <div><div style={colLbl(FAINT)}>Thu</div><div style={{ ...num, fontSize: 13.5, color: GREEN }}>{m.thu ? fmtShort(m.thu) : '—'}</div></div>
                <div><div style={colLbl(FAINT)}>Chi</div><div style={{ ...num, fontSize: 13.5, color: EXP }}>{m.chi ? fmtShort(m.chi) : '—'}</div></div>
                <div><div style={colLbl(FAINT)}>Chênh lệch</div><div style={{ ...num, fontSize: 13.5, color: m.net >= 0 ? GREEN : CORAL }}>{m.net >= 0 ? '+' : ''}{fmtShort(m.net)}</div></div>
                <div><div style={colLbl(FAINT)}>Số dư cuối kỳ</div><div style={{ ...num, fontSize: 13.5, fontWeight: 700, color: balColor(m.closing) }}>{fmtShort(m.closing)}</div></div>
              </div>

              {open && detail && (
                <div style={{ padding: '2px 20px 18px 54px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 12 }}>
                    <div>
                      <div style={detailHdr(FAINT)}>Khoản thu</div>
                      {detail.income.length ? detail.income.map(r => (
                        <div key={r.name} style={catLine}><span style={{ color: '#334155' }}>{r.name}</span><span style={{ ...num, color: GREEN }}>{fmt(r.amt)}</span></div>
                      )) : <div style={{ fontSize: 12.5, color: FAINT, padding: '6px 0' }}>—</div>}
                    </div>
                    <div>
                      <div style={detailHdr(FAINT)}>Khoản chi</div>
                      {detail.expense.length ? detail.expense.map(r => (
                        <div key={r.name} style={catLine}><span style={{ color: '#334155' }}>{r.name}</span><span style={{ ...num, color: EXP }}>{fmt(r.amt)}</span></div>
                      )) : <div style={{ fontSize: 12.5, color: FAINT, padding: '6px 0' }}>—</div>}
                    </div>
                  </div>

                  {viewMode === 'week' && weeks.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8, marginBottom: 4 }}>
                      {weeks.map(w => {
                        const wnet = w.income - w.expense
                        return (
                          <div key={w.label} style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 9, padding: '9px 12px' }}>
                            <div style={{ fontSize: 10.5, color: FAINT, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{w.label}</div>
                            <div style={wkRow}><span>Thu</span><span style={{ ...num, color: GREEN }}>{fmtShort(w.income)}</span></div>
                            <div style={wkRow}><span>Chi</span><span style={{ ...num, color: EXP }}>{fmtShort(w.expense)}</span></div>
                            <div style={wkRow}><span>Chênh lệch</span><span style={{ ...num, color: wnet >= 0 ? GREEN : CORAL }}>{wnet >= 0 ? '+' : ''}{fmtShort(wnet)}</span></div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {(bad || thin) && (
                    <div style={{ marginTop: 12, background: bad ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${bad ? '#FCA5A5' : '#FDE68A'}`, borderRadius: 10, padding: '11px 14px', fontSize: 12.5, color: bad ? '#7F1D1D' : '#78350F', display: 'flex', gap: 9 }}>
                      <span>💡</span>
                      <span>
                        {bad ? 'Âm quỹ ' : 'Quỹ mỏng '}<b>{fmt(bad ? -m.closing : safety - m.closing)}</b> ở tháng này.
                        {topExp && <> Hạng mục chi lớn nhất: <b>{topExp.name}</b> ({fmt(topExp.amt)}). Gợi ý: cắt 10–15% mục này (~{fmt(topExp.amt * 0.12)}), đẩy nhanh thu đúng hạn hoặc chuẩn bị nguồn bù.</>}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Cảnh báo: khoản quá hạn + kỳ thiếu hụt ── */}
      <div style={{ ...panel, borderColor: (overdue.length || riskMonths.length) ? '#FCA5A5' : '#BBF7D0', padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: (overdue.length || riskMonths.length) ? CORAL : GREEN, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span>⚠</span> Cảnh báo dòng tiền
        </div>
        <div style={{ fontSize: 12.5, color: DIM, marginBottom: 14 }}>Khoản quá hạn cần xử lý và các kỳ chi vượt/âm quỹ, kèm gợi ý.</div>

        {overdue.length > 0 && (
          <div style={{ marginBottom: riskMonths.length ? 16 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: '.04em', marginBottom: 7 }}>
              QUÁ HẠN CHƯA THU/CHI · {overdue.length} khoản
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <tbody>
                  {overdue.map(o => (
                    <tr key={`${o.docMonth}-${o.id}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px 6px 0', color: CORAL, fontWeight: 600, whiteSpace: 'nowrap', ...num }}>
                        {o.ngay}<span style={{ color: FAINT, fontWeight: 500 }}> · trễ {o.daysLate}d{o.roll_count ? ` · dời ${o.roll_count}×` : ''}</span>
                      </td>
                      <td style={{ padding: '6px 8px', color: '#1F2937' }}>{o.dien_giai || '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: o.nhom === 'B' ? GREEN : EXP, ...num }}>
                        {(o.nhom === 'B' ? '+' : '−') + fmtShort(amountOf(o))}
                      </td>
                      <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => deferItem(o)} disabled={busyId === o.id} style={actBtn('#FFF7ED', EXP, '#FED7AA', busyId === o.id)}>↪ Dời {DEFER_LABEL[viewMode]}</button>
                        <button onClick={() => markDone(o)} disabled={busyId === o.id} style={{ ...actBtn('#ECFDF5', GREEN, '#86EFAC', busyId === o.id), marginLeft: 6 }}>✓ Đã xong</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {riskMonths.length > 0 ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: '.04em', marginBottom: 7 }}>
              KỲ THIẾU HỤT / RỦI RO · ngưỡng an toàn ≈ {fmtShort(safety)} ₫
            </div>
            {riskMonths.map(m => {
              const d = detailFor(m.idx)
              const top = d.expense[0]
              const bad = m.closing < 0
              return (
                <div key={m.idx} style={{ borderTop: '1px solid #F1F5F9', padding: '11px 0', display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>{MONTH_FULL[m.idx]}</div>
                    <div style={{ ...num, fontSize: 12.5, color: bad ? CORAL : AMBER, marginTop: 3 }}>{bad ? 'Âm quỹ' : 'Quỹ mỏng'} {fmt(bad ? -m.closing : safety - m.closing)}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
                    Tồn cuối kỳ <b style={{ color: balColor(m.closing) }}>{fmt(m.closing)}</b>.
                    {top && <> Chi lớn nhất: <b style={{ color: INK }}>{top.name}</b> ({fmt(top.amt)}).</>}
                    {' '}Đề xuất: giảm 10–15% mục lớn, dời khoản không thiết yếu sang kỳ sau, hoặc chuẩn bị nguồn bù ~{fmt(Math.abs(bad ? -m.closing : safety - m.closing) * 1.1)}.
                  </div>
                </div>
              )
            })}
          </div>
        ) : overdue.length === 0 ? (
          <div style={{ fontSize: 13.5, color: GREEN }}>✓ Không có khoản quá hạn và không có kỳ nào thiếu hụt trong phạm vi đang chọn.</div>
        ) : null}
      </div>
    </div>
  )
}

function colLbl(c: string): CSSProperties {
  return { fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: c, marginBottom: 3 }
}
function detailHdr(c: string): CSSProperties {
  return { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.07em', color: c, fontWeight: 700, marginBottom: 8 }
}
const catLine: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5, borderBottom: '1px dashed #F1F5F9' }
const wkRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, color: '#475569' }
function actBtn(bg: string, color: string, border: string, busy: boolean): CSSProperties {
  return { padding: '3px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, background: bg, color, border: `1px solid ${border}`, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }
}
