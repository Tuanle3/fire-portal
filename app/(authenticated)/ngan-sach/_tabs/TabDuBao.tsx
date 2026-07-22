'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { NganSachThang, NganSachItem } from '@/lib/ngan-sach-types'
import { getNganSach } from '@/lib/ngan-sach-store'
import { findKey, buildTonDauKy, buildKmcpActual } from '@/lib/ngan-sach-mapping'

interface Props {
  month: string            // "2026-07" — tháng đang chọn ở topbar
  localData: NganSachThang
  tonDauKy: number
  tonQuyRealtime: number
  kmcpActual: Record<string, number>
}

type Row = Record<string, any>
type View = 'year' | 'quarter' | 'month'
type ColDef = { key: string; label: string; months: number[]; loai: 'TH' | 'KH' }

interface UnitAgg { unit: string; cols: Record<string, number>; total: number }
interface GroupAgg { nhom: string; cols: Record<string, number>; total: number; units: UnitAgg[] }
interface Section { rows: GroupAgg[]; colTotals: Record<string, number>; grandTotal: number }

const MONTH_SHORT = ['Th.1', 'Th.2', 'Th.3', 'Th.4', 'Th.5', 'Th.6', 'Th.7', 'Th.8', 'Th.9', 'Th.10', 'Th.11', 'Th.12']

const fmt = (n: number) => (n === 0 ? '—' : Math.round(n).toLocaleString('vi-VN'))
const fmtSigned = (n: number) => (n === 0 ? '—' : (n < 0 ? '−' : '+') + Math.abs(Math.round(n)).toLocaleString('vi-VN'))
const pad2 = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

// đọc snapshot Firebase Realtime DB → mảng object
function toArr(snap: any): Row[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? v : {})) as Row[]
  return []
}

// phân loại 1 dòng: thu / chi / null (bỏ qua)
function rowType(r: Row): 'thu' | 'chi' | null {
  const ghi = String(r['Ghi_chu'] ?? '')
  if (ghi === 'Dư đầu kỳ' || ghi === 'Dư cuối kỳ') return null
  const ps = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
  if (ghi === 'Thu') return 'thu'
  if (ghi === 'Chi') return 'chi'
  if (ps > 0) return 'thu'
  if (ps < 0) return 'chi'
  return null
}
const loaiMatch = (col: 'TH' | 'KH', loai: string) =>
  col === 'KH' ? loai === 'Kế hoạch' : (loai === '' || loai === 'Thực tế')

export function TabDuBao({ month, localData }: Props) {
  const curYear = parseInt(month.split('-')[0])
  const curMon = parseInt(month.split('-')[1])

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('month')
  const [selectedYear, setSelectedYear] = useState(curYear)
  const [quarter, setQuarter] = useState(Math.ceil(curMon / 3))  // 1..4
  const [monthSel, setMonthSel] = useState(curMon)               // 1..12
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fetchedDoc, setFetchedDoc] = useState<NganSachThang | null>(null)

  useEffect(() => {
    let alive = true
    get(ref(getDb(), 'data_quy'))
      .then(snap => { if (alive) setRows(toArr(snap)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const loaiKey = useMemo(() => findKey(rows, 'loai'), [rows])

  // Kế hoạch cho chế độ Tháng: doc ngân sách tháng đang chọn (nhập tay ở tab Kế hoạch).
  // Tháng ở topbar dùng localData (bản đang chỉnh); tháng khác thì tải từ Firestore.
  const monthStr = `${selectedYear}-${pad2(monthSel)}`
  useEffect(() => {
    if (view !== 'month' || monthStr === month) return
    let alive = true
    getNganSach(monthStr).then(d => { if (alive) setFetchedDoc(d) }).catch(() => {})
    return () => { alive = false }
  }, [view, monthStr, month])
  const planDoc = monthStr === month ? localData : (fetchedDoc?.thang === monthStr ? fetchedDoc : null)
  // TH khớp theo mã ngân sách (Mã_ngân_sách / Nhóm_CP) cho tháng đang chọn
  const monthTH = useMemo(() => (view === 'month' ? buildKmcpActual(rows, monthStr) : {}), [rows, view, monthStr])

  // ── Định nghĩa cột theo chế độ xem ─────────────────────────────────────────────
  const cols: ColDef[] = useMemo(() => {
    if (view === 'year')
      return [1, 2, 3, 4].map(q => ({ key: 'Q' + q, label: 'Quý ' + q, months: [(q - 1) * 3, (q - 1) * 3 + 1, (q - 1) * 3 + 2], loai: 'TH' as const }))
    if (view === 'quarter')
      return [(quarter - 1) * 3, (quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2].map(m => ({ key: 'M' + m, label: MONTH_SHORT[m], months: [m], loai: 'TH' as const }))
    const mi = monthSel - 1
    return [
      { key: 'KH', label: 'Kế hoạch', months: [mi], loai: 'KH' },
      { key: 'TH', label: 'Thực hiện', months: [mi], loai: 'TH' },
    ]
  }, [view, quarter, monthSel])

  const scopeMonths = useMemo(() => [...new Set(cols.flatMap(c => c.months))].sort((a, b) => a - b), [cols])
  const totalKey = view === 'month' ? 'TH' : null   // month: total = TH; khác: cộng tất cả cột

  // ── Gom nhóm theo Nhóm_CP + Đơn vị ─────────────────────────────────────────────
  const { thu, chi } = useMemo(() => {
    // ── Chế độ Tháng: nhóm theo khoản mục ngân sách (KH nhập tay) + TH khớp theo mã ──
    if (view === 'month') {
      const thOf = (it: NganSachItem) => (it.kmcp && monthTH[it.kmcp] !== undefined ? monthTH[it.kmcp] : it.thuc_hien) || 0
      const buildPlan = (want: 'B' | 'C'): Section => {
        const items = (planDoc?.items ?? []).filter(it => it.nhom === want)
        const kidsOf = new Map<string, NganSachItem[]>()
        for (const it of items) if (it.parent_id) { const a = kidsOf.get(it.parent_id) ?? []; a.push(it); kidsOf.set(it.parent_id, a) }
        const rowsArr: GroupAgg[] = []
        for (const it of items) {
          if (it.is_section || it.parent_id) continue
          if (it.is_group) {
            const kids = kidsOf.get(it.id) ?? []
            const c = { KH: 0, TH: 0 }
            const units: UnitAgg[] = kids.map(k => {
              const kc = { KH: k.ke_hoach || 0, TH: thOf(k) }
              c.KH += kc.KH; c.TH += kc.TH
              return { unit: k.dien_giai || '(không tên)', cols: kc, total: kc.TH }
            })
            rowsArr.push({ nhom: it.dien_giai || '(nhóm)', cols: c, total: c.TH, units })
          } else {
            const c = { KH: it.ke_hoach || 0, TH: thOf(it) }
            rowsArr.push({ nhom: it.dien_giai || '(không tên)', cols: c, total: c.TH, units: [] })
          }
        }
        rowsArr.sort((a, b) => b.total - a.total)
        const colTotals = {
          KH: rowsArr.reduce((s, r) => s + (r.cols.KH ?? 0), 0),
          TH: rowsArr.reduce((s, r) => s + (r.cols.TH ?? 0), 0),
        }
        return { rows: rowsArr, colTotals, grandTotal: colTotals.TH }
      }
      return { thu: buildPlan('B'), chi: buildPlan('C') }
    }

    const yPrefix = String(selectedYear) + '-'
    const build = (want: 'thu' | 'chi'): Section => {
      const g = new Map<string, { cols: Record<string, number>; units: Map<string, Record<string, number>> }>()
      for (const r of rows) {
        const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
        if (!ngay.startsWith(yPrefix)) continue
        if (rowType(r) !== want) continue
        const mi = parseInt(ngay.slice(5, 7)) - 1
        if (mi < 0 || mi > 11) continue
        const amt = Math.abs(Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0))
        if (!amt) continue
        const loai = loaiKey ? String(r[loaiKey] ?? '').trim() : ''
        const nhom = String(r['Nhóm_CP'] ?? r['Nhom_CP'] ?? '').trim() || '(Chưa phân nhóm)'
        const unit = String(r['Đơn_vị'] ?? r['Đơn vị'] ?? r['Don_vi'] ?? '').trim() || '(Không rõ)'
        let grp = g.get(nhom)
        if (!grp) { grp = { cols: {}, units: new Map() }; g.set(nhom, grp) }
        for (const c of cols) {
          if (!c.months.includes(mi) || !loaiMatch(c.loai, loai)) continue
          grp.cols[c.key] = (grp.cols[c.key] ?? 0) + amt
          const u = grp.units.get(unit) ?? {}
          u[c.key] = (u[c.key] ?? 0) + amt
          grp.units.set(unit, u)
        }
      }
      const totalOf = (c: Record<string, number>) =>
        totalKey ? (c[totalKey] ?? 0) : cols.reduce((s, col) => s + (c[col.key] ?? 0), 0)
      const rowsArr: GroupAgg[] = [...g.entries()].map(([nhom, grp]) => ({
        nhom, cols: grp.cols, total: totalOf(grp.cols),
        units: [...grp.units.entries()]
          .map(([unit, uc]) => ({ unit, cols: uc, total: totalOf(uc) }))
          .sort((a, b) => b.total - a.total),
      }))
        .filter(r => cols.some(c => (r.cols[c.key] ?? 0) !== 0))
        .sort((a, b) => b.total - a.total)
      const colTotals: Record<string, number> = {}
      cols.forEach(c => { colTotals[c.key] = rowsArr.reduce((s, r) => s + (r.cols[c.key] ?? 0), 0) })
      const grandTotal = rowsArr.reduce((s, r) => s + r.total, 0)
      return { rows: rowsArr, colTotals, grandTotal }
    }
    return { thu: build('thu'), chi: build('chi') }
  }, [rows, cols, loaiKey, selectedYear, totalKey, view, planDoc, monthTH])

  // ── Tóm tắt kỳ ─────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    // Tóm tắt luôn theo dòng tiền THỰC TẾ (data_quy) để phản ánh đúng số dư quỹ,
    // độc lập với bảng khoản mục ở chế độ Tháng.
    const yPrefix = String(selectedYear) + '-'
    let thuReal = 0, chiReal = 0
    for (const r of rows) {
      const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
      if (!ngay.startsWith(yPrefix)) continue
      const mi = parseInt(ngay.slice(5, 7)) - 1
      if (!scopeMonths.includes(mi)) continue
      const loai = loaiKey ? String(r[loaiKey] ?? '').trim() : ''
      if (loai && loai !== 'Thực tế') continue
      const t = rowType(r); if (!t) continue
      const amt = Math.abs(Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0))
      if (t === 'thu') thuReal += amt; else chiReal += amt
    }
    const startMonth = scopeMonths.length ? scopeMonths[0] : (view === 'year' ? 0 : monthSel - 1)
    const opening = buildTonDauKy(rows, `${selectedYear}-${pad2(startMonth + 1)}`)
    const net = thuReal - chiReal
    return { opening, thu: thuReal, chi: chiReal, net, closing: opening + net }
  }, [rows, scopeMonths, loaiKey, selectedYear, view, monthSel])

  // ── Nhãn kỳ / tiêu đề ───────────────────────────────────────────────────────────
  const scopeLabel =
    view === 'year' ? `NĂM ${selectedYear}`
      : view === 'quarter' ? `QUÝ ${quarter}/${selectedYear}`
        : `THÁNG ${monthSel}/${selectedYear}`
  const kyLabel =
    view === 'year' ? `01/01/${selectedYear} – 31/12/${selectedYear}`
      : view === 'quarter'
        ? `01/${pad2((quarter - 1) * 3 + 1)}/${selectedYear} – ${lastDay(selectedYear, quarter * 3)}/${pad2(quarter * 3)}/${selectedYear}`
        : `01/${pad2(monthSel)}/${selectedYear} – ${lastDay(selectedYear, monthSel)}/${pad2(monthSel)}/${selectedYear}`
  const printDate = useMemo(() => new Date().toLocaleDateString('vi-VN'), [])

  const YEARS = [curYear - 2, curYear - 1, curYear, curYear + 1, curYear + 2]
  const toggle = (key: string) => setExpanded(prev => {
    const s = new Set(prev)
    if (s.has(key)) s.delete(key); else s.add(key)
    return s
  })

  // ── Render 1 dòng giá trị (các cột + cột cuối + tỷ trọng) ────────────────────────
  const valueCells = (c: Record<string, number>, total: number, grand: number, isThu: boolean) => (
    <>
      {cols.map(col => (
        <td key={col.key} className="bc-num">{fmt(c[col.key] ?? 0)}</td>
      ))}
      {view === 'month' ? (
        <td className={'bc-num bc-delta ' + (((c['TH'] ?? 0) - (c['KH'] ?? 0)) >= 0 === isThu ? 'good' : 'bad')}>
          {fmtSigned((c['TH'] ?? 0) - (c['KH'] ?? 0))}
        </td>
      ) : (
        <td className="bc-num bc-strong">{fmt(total)}</td>
      )}
      <td className="bc-pct">{grand > 0 ? (total / grand * 100).toFixed(1) + '%' : '—'}</td>
    </>
  )

  const renderSection = (sec: Section, type: 'thu' | 'chi', roman: string, title: string, nameHead: string) => {
    const isThu = type === 'thu'
    const totalColor = isThu ? 'var(--bc-green)' : 'var(--bc-red)'
    return (
      <div className="bc-section">
        <div className="bc-sec-head">
          <span className="bc-sec-title">{roman}. {title}</span>
          <span className="bc-sec-total" style={{ color: totalColor }}>{fmt(sec.grandTotal)} đ</span>
        </div>
        <div className="bc-scroll">
          <table className="bc-table">
            <thead>
              <tr>
                <th className="bc-idx">#</th>
                <th className="bc-name">{nameHead}</th>
                {cols.map(c => <th key={c.key} className="bc-num-h">{c.label}</th>)}
                <th className="bc-num-h">{view === 'month' ? 'Chênh lệch' : 'Tổng (đ)'}</th>
                <th className="bc-pct-h">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody>
              {sec.rows.length === 0 && (
                <tr><td className="bc-empty" colSpan={cols.length + 3}>Không có dữ liệu trong kỳ.</td></tr>
              )}
              {sec.rows.map((g, i) => {
                const ek = type + '|' + g.nhom
                const open = expanded.has(ek)
                return (
                  <>
                    <tr key={ek} className={'bc-row bc-group' + (open ? ' open' : '')} onClick={() => g.units.length > 1 && toggle(ek)}>
                      <td className="bc-idx">{i + 1}</td>
                      <td className="bc-name">
                        {g.units.length > 1 && <span className="bc-caret">▶</span>}
                        <span className="bc-gname">{g.nhom}</span>
                      </td>
                      {valueCells(g.cols, g.total, sec.grandTotal, isThu)}
                    </tr>
                    {open && g.units.map(u => (
                      <tr key={ek + '|' + u.unit} className="bc-row bc-unit">
                        <td className="bc-idx" />
                        <td className="bc-name"><span className="bc-uname">└ {u.unit}</span></td>
                        {valueCells(u.cols, u.total, sec.grandTotal, isThu)}
                      </tr>
                    ))}
                  </>
                )
              })}
              <tr className="bc-total-row">
                <td className="bc-idx" />
                <td className="bc-name">TỔNG {isThu ? 'THU' : 'CHI'}</td>
                {cols.map(c => <td key={c.key} className="bc-num">{fmt(sec.colTotals[c.key] ?? 0)}</td>)}
                <td className="bc-num">{view === 'month' ? fmtSigned((sec.colTotals['TH'] ?? 0) - (sec.colTotals['KH'] ?? 0)) : fmt(sec.grandTotal)}</td>
                <td className="bc-pct">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="baocao">
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <div className="bc-head">
        <div className="bc-eyebrow">SƠN AN GROUP</div>
        <h1 className="bc-title">BÁO CÁO DÒNG TIỀN {scopeLabel}</h1>
        <div className="bc-meta">
          Đơn vị tính: đ · Nguồn: Firebase Realtime Database · Ngày in: {printDate} · Kỳ: {kyLabel}
        </div>
      </div>

      {/* ── CONTROLS ── */}
      <div className="bc-controls">
        <div className="bc-switch">
          {([['year', 'Cả năm'], ['quarter', 'Theo Quý'], ['month', 'Theo Tháng']] as [View, string][]).map(([v, l]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <select className="bc-select" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        {view === 'quarter' && (
          <div className="bc-chips">
            {[1, 2, 3, 4].map(q => (
              <button key={q} className={'bc-chip' + (quarter === q ? ' active' : '')} onClick={() => setQuarter(q)}>Quý {q}</button>
            ))}
          </div>
        )}
        {view === 'month' && (
          <div className="bc-chips">
            {MONTH_SHORT.map((l, i) => (
              <button key={i} className={'bc-chip' + (monthSel === i + 1 ? ' active' : '')} onClick={() => setMonthSel(i + 1)}>{l}</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {loading && <span className="bc-loading">⏳ Đang tải…</span>}
        <button className="bc-print" onClick={() => window.print()}>⬇ Xuất báo cáo</button>
      </div>

      {renderSection(thu, 'thu', 'I', 'DÒNG TIỀN THU', view === 'month' ? 'KHOẢN MỤC THU' : 'NHÓM GIAO DỊCH / ĐƠN VỊ')}
      {renderSection(chi, 'chi', 'II', 'DÒNG TIỀN CHI', view === 'month' ? 'KHOẢN MỤC CHI' : 'NHÓM CHI PHÍ / ĐƠN VỊ')}

      {/* ── III. TÓM TẮT KỲ ── */}
      <div className="bc-summary">
        <div className="bc-sum-head">III. TÓM TẮT KỲ {scopeLabel}</div>
        <div className="bc-sum-body">
          <SumRow label={`Số dư đầu kỳ`} sub={kyLabel.split(' – ')[0]} value={fmt(summary.opening) + ' đ'} />
          <SumRow label="(+) Tổng thu trong kỳ" value={fmt(summary.thu) + ' đ'} color="var(--bc-green)" />
          <SumRow label="(−) Tổng chi trong kỳ" value={fmt(summary.chi) + ' đ'} color="var(--bc-red)" />
          <SumRow label="(=) Dòng tiền ròng trong kỳ" value={fmtSigned(summary.net) + ' đ'} color={summary.net >= 0 ? 'var(--bc-green)' : 'var(--bc-red)'} strong />
          <SumRow label="Số dư cuối kỳ" value={fmt(summary.closing) + ' đ'} strong highlight />
        </div>
      </div>
    </div>
  )
}

function SumRow({ label, sub, value, color, strong, highlight }: { label: string; sub?: string; value: string; color?: string; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={'bc-sum-row' + (highlight ? ' hl' : '')}>
      <span className="bc-sum-label" style={strong ? { fontWeight: 700 } : undefined}>
        {label}{sub && <span className="bc-sum-sub"> ({sub})</span>}
      </span>
      <span className="bc-sum-val" style={{ color, fontWeight: strong ? 700 : 600 }}>{value}</span>
    </div>
  )
}

const CSS = `
.baocao{
  --bc-navy:#1C3557; --bc-navy-deep:#122238; --bc-ink:#1B2430; --bc-line:#E3E6EB;
  --bc-green:#15803D; --bc-red:#B91C1C; --bc-grey:#8A8F98;
  --bc-mono:ui-monospace,'Cascadia Code',Consolas,'Liberation Mono',monospace;
  color:var(--bc-ink);font-size:13px;
}
.baocao *{box-sizing:border-box;}
.bc-head{text-align:center;margin-bottom:18px;padding-bottom:16px;border-bottom:2px solid var(--bc-navy);}
.bc-eyebrow{font-size:11px;letter-spacing:.22em;color:var(--bc-grey);font-weight:700;text-transform:uppercase;margin-bottom:6px;}
.bc-title{font-size:20px;font-weight:800;color:var(--bc-navy-deep);margin:0;letter-spacing:.01em;}
.bc-meta{font-size:11.5px;color:var(--bc-grey);margin-top:7px;}

.bc-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid var(--bc-line);border-radius:10px;padding:11px 13px;margin-bottom:22px;}
.bc-switch{display:flex;background:#EEF2F7;border-radius:8px;padding:3px;gap:2px;}
.bc-switch button{font-family:inherit;border:none;background:transparent;padding:7px 15px;border-radius:6px;font-size:12.5px;font-weight:700;color:#2A4770;cursor:pointer;}
.bc-switch button.active{background:var(--bc-navy-deep);color:#fff;}
.bc-select{font-family:inherit;font-size:12.5px;font-weight:700;color:var(--bc-navy);background:#fff;border:1px solid var(--bc-line);border-radius:20px;padding:7px 12px;cursor:pointer;}
.bc-chips{display:flex;gap:6px;flex-wrap:wrap;}
.bc-chip{font-family:inherit;border:1px solid var(--bc-line);background:#fff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;color:var(--bc-navy);cursor:pointer;}
.bc-chip.active{background:var(--bc-navy);border-color:var(--bc-navy);color:#fff;}
.bc-loading{font-size:12px;color:var(--bc-grey);}
.bc-print{font-family:inherit;background:var(--bc-navy-deep);color:#fff;border:none;padding:8px 15px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;}

.bc-section{margin-bottom:26px;}
.bc-sec-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid var(--bc-navy);padding-bottom:6px;margin-bottom:2px;}
.bc-sec-title{font-size:14px;font-weight:800;color:var(--bc-navy-deep);letter-spacing:.02em;}
.bc-sec-total{font-family:var(--bc-mono);font-size:15px;font-weight:700;}
.bc-scroll{overflow-x:auto;}
.bc-table{border-collapse:collapse;width:100%;min-width:640px;}
.bc-table thead th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--bc-grey);font-weight:700;padding:8px 10px;border-bottom:1.5px solid var(--bc-line);background:#F8FAFC;white-space:nowrap;}
.bc-idx{width:34px;text-align:center;color:var(--bc-grey);font-size:11.5px;}
.bc-name{text-align:left;}
.bc-num-h,.bc-pct-h{text-align:right;}
.bc-row td{padding:8px 10px;border-bottom:1px solid #F1F3F6;vertical-align:middle;}
.bc-row.bc-group{cursor:default;}
.bc-row.bc-group .bc-name{cursor:pointer;}
.bc-group:hover td{background:#FBFAF7;}
.bc-caret{display:inline-block;font-size:8px;color:var(--bc-navy);margin-right:7px;transition:transform .15s;transform:rotate(0deg);}
.bc-group.open .bc-caret{transform:rotate(90deg);}
.bc-gname{font-weight:600;color:var(--bc-navy-deep);font-size:13px;}
.bc-uname{color:#475569;font-size:12px;padding-left:20px;display:inline-block;}
.bc-unit td{background:#FAFBFC;}
.bc-num{text-align:right;font-family:var(--bc-mono);font-size:12.5px;color:var(--bc-ink);white-space:nowrap;}
.bc-num.bc-strong{font-weight:700;color:var(--bc-navy-deep);}
.bc-delta.good{color:var(--bc-green);}
.bc-delta.bad{color:var(--bc-red);}
.bc-pct{text-align:right;font-size:12px;color:var(--bc-grey);white-space:nowrap;}
.bc-empty{text-align:center;color:var(--bc-grey);padding:20px;font-size:12.5px;}
.bc-total-row td{background:var(--bc-navy-deep);color:#fff;font-weight:700;padding:10px;border:none;}
.bc-total-row .bc-name{font-size:13px;letter-spacing:.02em;}
.bc-total-row .bc-num,.bc-total-row .bc-pct{color:#fff;}

.bc-summary{border:1px solid var(--bc-line);border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(28,53,87,.05);max-width:560px;}
.bc-sum-head{background:var(--bc-navy-deep);color:#fff;font-weight:700;font-size:13px;padding:11px 16px;letter-spacing:.02em;}
.bc-sum-body{padding:4px 0;}
.bc-sum-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid #F1F3F6;font-size:13px;}
.bc-sum-row:last-child{border-bottom:none;}
.bc-sum-row.hl{background:#F0FDF4;}
.bc-sum-label{color:var(--bc-ink);}
.bc-sum-sub{color:var(--bc-grey);font-size:11.5px;}
.bc-sum-val{font-family:var(--bc-mono);}
@media print{.bc-controls,.bc-print{display:none;}}
`
