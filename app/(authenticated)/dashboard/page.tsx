'use client'
import { useEffect, useState, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { ref, get } from 'firebase/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function toArr(snap: any): Row[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? (v as Row) : {}))
  return []
}

const color = (v: number) => (v > 0 ? '#1F6B3D' : v < 0 ? '#8C1F1F' : '#374151')

const CY    = new Date().getFullYear()
const CY_PX = `${CY}-`

interface MonthRow   { mm: string; thu: number; chi: number; rong: number; cuoiky: number }
interface AccRow     { label: string; stk: string; dauKy: number; thu: number; chi: number; rong: number; cuoiky: number }
interface UnitRow    { unit: string; dauKy: number; thu: number; chi: number; rong: number; cuoiky: number; accounts: AccRow[] }

export default function DashboardPage() {
  const [data,     setData]     = useState<Row[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [unit,     setUnit]     = useState<'đ'|'tr'|'tỷ'>('đ')

  useEffect(() => {
    get(ref(db, 'data_quy'))
      .then(snap =>
        setData(toArr(snap).sort((a, b) =>
          String(a['Ngày'] ?? '').localeCompare(String(b['Ngày'] ?? ''))
        ))
      )
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (unit: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(unit) ? s.delete(unit) : s.add(unit); return s })

  // Đầu kỳ per account
  const dauKyAcc = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data) {
      if (String(r['Ngày'] ?? '') >= CY_PX) break
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) m.set(s, Number(r['Tồn'] ?? 0))
    }
    return m
  }, [data])

  // Tồn mới nhất per account
  const latestTon = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data) {
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) m.set(s, Number(r['Tồn'] ?? 0))
    }
    return m
  }, [data])

  const yearData = useMemo(
    () => data.filter(r => String(r['Ngày'] ?? '').startsWith(CY_PX)),
    [data]
  )

  // Monthly aggregation
  const monthRows = useMemo<MonthRow[]>(() => {
    const ton = new Map<string, number>(dauKyAcc)
    const result: MonthRow[] = []
    let curMm = '', mThu = 0, mChi = 0
    for (const r of yearData) {
      const mm   = String(r['Ngày'] ?? '').slice(5, 7)
      const stk  = String(r['Số_tài_khoản'] ?? '')
      const ps   = Number(r['Số_tiền_PS'] ?? 0)
      const loai = String(r['Ghi_chu'] ?? '')
      if (mm !== curMm) {
        if (curMm) { let c = 0; ton.forEach(v => { c += v }); result.push({ mm: curMm, thu: mThu, chi: mChi, rong: mThu - mChi, cuoiky: c }) }
        curMm = mm; mThu = 0; mChi = 0
      }
      if (loai === 'Thu' || ps > 0) mThu += Math.abs(ps)
      else if (loai === 'Chi' || ps < 0) mChi += Math.abs(ps)
      if (stk) ton.set(stk, Number(r['Tồn'] ?? 0))
    }
    if (curMm) { let c = 0; ton.forEach(v => { c += v }); result.push({ mm: curMm, thu: mThu, chi: mChi, rong: mThu - mChi, cuoiky: c }) }
    return result
  }, [yearData, dauKyAcc])

  // Per-unit + per-account aggregation
  const unitRows = useMemo<UnitRow[]>(() => {
    // unit → account → {bank, thu, chi}
    type AccAgg = { bank: string; thu: number; chi: number }
    const map = new Map<string, Map<string, AccAgg>>()

    for (const r of yearData) {
      const unit = String(r['Đơn_vị'] ?? '')
      if (!unit) continue
      if (!map.has(unit)) map.set(unit, new Map())
      const accMap = map.get(unit)!
      const stk  = String(r['Số_tài_khoản'] ?? '')
      const bank = String(r['Ngân_hàng'] ?? '')
      const ps   = Number(r['Số_tiền_PS'] ?? 0)
      const loai = String(r['Ghi_chu'] ?? '')
      if (stk) {
        if (!accMap.has(stk)) accMap.set(stk, { bank, thu: 0, chi: 0 })
        const a = accMap.get(stk)!
        if (loai === 'Thu' || ps > 0) a.thu += Math.abs(ps)
        else if (loai === 'Chi' || ps < 0) a.chi += Math.abs(ps)
      }
    }

    const rows: UnitRow[] = []
    map.forEach((accMap, unit) => {
      const accounts: AccRow[] = []
      accMap.forEach(({ bank, thu, chi }, stk) => {
        const dauKy  = dauKyAcc.get(stk)  ?? 0
        const cuoiky = latestTon.get(stk) ?? 0
        const last4  = stk.slice(-4)
        accounts.push({ label: `${bank}-${last4}`, stk, dauKy, thu, chi, rong: thu - chi, cuoiky })
      })
      accounts.sort((a, b) => b.thu - a.thu)
      const dauKy  = accounts.reduce((s, a) => s + a.dauKy,  0)
      const thu    = accounts.reduce((s, a) => s + a.thu,    0)
      const chi    = accounts.reduce((s, a) => s + a.chi,    0)
      const cuoiky = accounts.reduce((s, a) => s + a.cuoiky, 0)
      rows.push({ unit, dauKy, thu, chi, rong: thu - chi, cuoiky, accounts })
    })
    const order = (u: string) => u.toLowerCase().startsWith('mr') ? 0 : u.toLowerCase().startsWith('quy') ? 1 : 2
    return rows.sort((a, b) => {
      const od = order(a.unit) - order(b.unit)
      return od !== 0 ? od : b.thu - a.thu
    })
  }, [yearData, dauKyAcc, latestTon])

  const totals = useMemo(() => {
    const caNhan   = unitRows.filter(u => u.unit.toLowerCase().startsWith('mr'))
    const phapNhan = unitRows.filter(u => !u.unit.toLowerCase().startsWith('mr'))
    return {
      dauKy:           unitRows.reduce((s, u) => s + u.dauKy,  0),
      dauKyCaNhan:     caNhan.reduce((s, u) => s + u.dauKy,    0),
      dauKyPhapNhan:   phapNhan.reduce((s, u) => s + u.dauKy,  0),
      thu:             unitRows.reduce((s, u) => s + u.thu,    0),
      chi:             unitRows.reduce((s, u) => s + u.chi,    0),
      rong:            unitRows.reduce((s, u) => s + u.rong,   0),
      cuoiky:          unitRows.reduce((s, u) => s + u.cuoiky, 0),
      cuoikyCaNhan:    caNhan.reduce((s, u) => s + u.cuoiky,   0),
      cuoikyPhapNhan:  phapNhan.reduce((s, u) => s + u.cuoiky, 0),
    }
  }, [unitRows])

  const luykeThu  = monthRows.reduce((s, m) => s + m.thu, 0)
  const luykeChi  = monthRows.reduce((s, m) => s + m.chi, 0)
  const luykeRong = luykeThu - luykeChi
  const chartMax  = Math.max(...monthRows.map(m => Math.max(m.thu, m.chi)), 1)
  const mmLabel   = (mm: string) => `T${mm}/${String(CY).slice(2)}`
  const BAR_W = 56

  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs   = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const fmtB    = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtN    = (v: number) => fmtB(Math.abs(v))
  const fmtPs   = (v: number) => (v > 0 ? '+' : '') + fmtB(v)
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`

  if (loading) return <div style={{ display:'flex', flex:1, alignItems:'center', justifyContent:'center', color:'#6B7280', fontSize:14 }}>⏳ Đang tải dữ liệu từ Firebase...</div>
  if (error)   return <div style={{ margin:24, padding:16, background:'#FDECEC', border:'1px solid #FECACA', borderRadius:8, color:'#8C1F1F' }}>⚠ {error}</div>

  return (
    <>
      <style>{`
        .ov{flex:1;overflow-y:auto;padding:20px 24px;background:#FAF8F3;}
        .ov-title{font-size:16px;font-weight:700;color:#1F2430;margin-bottom:14px;}
        .kpi4{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:16px;}
        .k4{background:#fff;border:1px solid #E5E0D8;border-radius:10px;padding:14px 18px;}
        .k4-lbl{font-size:9.5px;font-weight:700;letter-spacing:.08em;color:#6B7280;text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:5px;}
        .k4-dot{width:7px;height:7px;border-radius:50%;}
        .k4-val{font-size:18px;font-weight:800;font-family:'Roboto Mono',monospace;line-height:1.15;}
        .k4-sub{font-size:10px;color:#9CA3AF;margin-top:3px;}
        .k4du-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
        .k4du-cols{display:grid;grid-template-columns:1fr 1px 1fr;gap:0 14px;}
        .k4du-period{font-size:9px;font-weight:700;letter-spacing:.07em;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;}
        .k4du-big{font-family:'Roboto Mono',monospace;font-size:17px;font-weight:800;line-height:1.2;margin-bottom:8px;}
        .k4du-row{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#6B7280;padding:2px 0;}
        .k4du-row span:last-child{font-family:'Roboto Mono',monospace;font-weight:600;font-size:10px;}
        .ov2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;}
        .ov-card{background:#fff;border:1px solid #E5E0D8;border-radius:10px;overflow:hidden;}
        .ov-card-hdr{background:#1C3557;padding:10px 14px;font-size:10px;font-weight:700;color:rgba(255,255,255,.8);letter-spacing:.06em;text-transform:uppercase;}
        /* Monthly table */
        .mt{width:100%;border-collapse:collapse;font-size:11.5px;}
        .mt th{padding:7px 10px;background:#1C3557;color:rgba(255,255,255,.7);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:right;}
        .mt th:first-child{text-align:left;}
        .mt td{padding:7px 10px;border-bottom:1px solid #F3F4F6;text-align:right;font-family:'Roboto Mono',monospace;font-size:11px;color:#374151;white-space:nowrap;}
        .mt td:first-child{text-align:left;font-family:inherit;font-weight:600;color:#1F2430;}
        .mt .total td{background:#F8F7F4;font-weight:700;border-top:2px solid #E5E0D8;}
        .mt .total td:first-child{color:#1C3557;}
        .mt tr:hover td{background:#FAFAF8;}
        .mt .total:hover td{background:#F8F7F4;}
        /* Bar chart */
        .chart-wrap{padding:14px 14px 8px;border-top:1px solid #F3F4F6;}
        .chart-legend{display:flex;gap:14px;font-size:10px;color:#6B7280;margin-bottom:8px;}
        .legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
        /* Unit table */
        .ut{width:100%;border-collapse:collapse;font-size:11px;}
        .ut th{padding:7px 8px;background:#1C3557;color:rgba(255,255,255,.7);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:right;white-space:nowrap;}
        .ut th:first-child{text-align:left;}
        .ut td{padding:6px 8px;border-bottom:1px solid #F3F4F6;text-align:right;font-family:'Roboto Mono',monospace;font-size:10.5px;color:#374151;white-space:nowrap;}
        .ut td:first-child{text-align:left;font-family:inherit;}
        .ut .u-row{cursor:pointer;}
        .ut .u-row:hover td{background:#EEF4FB;}
        .ut .u-row td:first-child{font-weight:700;color:#1F2430;font-size:11px;}
        .ut .u-row td{background:#F4F7FB;}
        .ut .a-row td{background:#fff;}
        .ut .a-row:hover td{background:#FAFAF8;}
        .ut .a-row td:first-child{color:#6B7280;font-size:10px;padding-left:28px;}
        .ut .total td{background:#F8F7F4;font-weight:700;border-top:2px solid #E5E0D8;font-size:11px;}
        .ut .total td:first-child{color:#1C3557;font-weight:700;}
        .ut .total:hover td{background:#F8F7F4;}
        .ut-toggle{display:inline-block;width:14px;text-align:center;font-size:9px;color:#9CA3AF;margin-right:4px;}
        @media(max-width:900px){.kpi4{grid-template-columns:1fr}.ov2{grid-template-columns:1fr}.ov{padding:14px 12px}}
        .unit-sw{display:flex;align-items:center;gap:3px;}
        .unit-btn{padding:3px 9px;font-size:10px;font-weight:700;border-radius:5px;cursor:pointer;border:1px solid #E5E0D8;background:#fff;color:#9CA3AF;letter-spacing:.02em;}
        .unit-btn.on{background:#1C3557;color:#fff;border-color:#1C3557;}
      `}</style>

      <main className="ov">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div className="ov-title" style={{ marginBottom:0 }}>
            BÁO CÁO THÁNG {new Date().getMonth() + 1} NĂM {CY} · Firebase Realtime DB
          </div>
          <div className="unit-sw">
            {(['đ', 'tr', 'tỷ'] as const).map(u => (
              <button key={u} className={`unit-btn${unit === u ? ' on' : ''}`} onClick={() => setUnit(u)}>
                {u === 'đ' ? 'đ' : `${u} đ`}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="kpi4">
          {/* SỐ DƯ TẠI THỜI ĐIỂM – combined card */}
          <div className="k4">
            <div className="k4du-hdr">
              <div className="k4-lbl" style={{ marginBottom:0 }}>
                <span className="k4-dot" style={{ background:'#D4A64A' }}/>
                SỐ DƯ TẠI THỜI ĐIỂM
              </div>
              <div style={{ fontSize:10.5, fontWeight:700, color: color(totals.cuoiky - totals.dauKy) }}>
                {totals.cuoiky - totals.dauKy >= 0 ? '▲' : '▼'} {fmtPs(totals.cuoiky - totals.dauKy)} {unitLbl} so với đầu kỳ
              </div>
            </div>
            <div className="k4du-cols">
              {/* ĐẦU KỲ */}
              <div>
                <div className="k4du-period">Đầu kỳ · 1/1/{CY}</div>
                <div className="k4du-big" style={{ color:'#1C3557' }}>
                  {fmtB(totals.dauKy)}<span style={{ fontSize:11, fontWeight:600, marginLeft:2 }}>{unitLbl}</span>
                </div>
                <div className="k4du-row">
                  <span>Cá nhân</span>
                  <span style={{ color: color(totals.dauKyCaNhan) }}>{fmtB(totals.dauKyCaNhan)} {unitLbl}</span>
                </div>
                <div className="k4du-row">
                  <span>Pháp nhân</span>
                  <span style={{ color: color(totals.dauKyPhapNhan) }}>{fmtB(totals.dauKyPhapNhan)} {unitLbl}</span>
                </div>
              </div>
              {/* Divider */}
              <div style={{ background:'#E5E0D8' }}/>
              {/* CUỐI KỲ */}
              <div>
                <div className="k4du-period">Cuối kỳ · {new Date().toLocaleDateString('vi-VN')}</div>
                <div className="k4du-big" style={{ color: color(totals.cuoiky) }}>
                  {fmtB(totals.cuoiky)}<span style={{ fontSize:11, fontWeight:600, marginLeft:2 }}>{unitLbl}</span>
                </div>
                <div className="k4du-row">
                  <span>Cá nhân</span>
                  <span style={{ color: color(totals.cuoikyCaNhan) }}>{fmtB(totals.cuoikyCaNhan)} {unitLbl}</span>
                </div>
                <div className="k4du-row">
                  <span>Pháp nhân</span>
                  <span style={{ color: color(totals.cuoikyPhapNhan) }}>{fmtB(totals.cuoikyPhapNhan)} {unitLbl}</span>
                </div>
              </div>
            </div>
          </div>

          {/* TỔNG THU */}
          <div className="k4">
            <div className="k4-lbl"><span className="k4-dot" style={{ background:'#22C55E' }}/>TỔNG THU</div>
            <div className="k4-val" style={{ color:'#1F6B3D' }}>{fmtN(totals.thu)}<span style={{ fontSize:12, fontWeight:600, marginLeft:2 }}>{unitLbl}</span></div>
            <div className="k4-sub">{unitRows.length} đơn vị · {monthRows.length} tháng</div>
          </div>

          {/* TỔNG CHI */}
          <div className="k4">
            <div className="k4-lbl"><span className="k4-dot" style={{ background:'#EF4444' }}/>TỔNG CHI</div>
            <div className="k4-val" style={{ color:'#8C1F1F' }}>{fmtN(totals.chi)}<span style={{ fontSize:12, fontWeight:600, marginLeft:2 }}>{unitLbl}</span></div>
            <div className="k4-sub">Ròng: <span style={{ color: color(totals.rong), fontWeight:700 }}>{fmtPs(totals.rong)} {unitLbl}</span></div>
          </div>
        </div>

        <div className="ov2">
          {/* Left: monthly table + chart */}
          <div className="ov-card">
            <div className="ov-card-hdr">SO SÁNH DÒNG TIỀN TỪNG THÁNG</div>
            <table className="mt">
              <thead>
                <tr>
                  <th>THÁNG</th><th>THU ({unitLbl})</th><th>CHI ({unitLbl})</th><th>RÒNG ({unitLbl})</th><th>SỐ DƯ CUỐI ({unitLbl})</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map(m => (
                  <tr key={m.mm}>
                    <td>{mmLabel(m.mm)}</td>
                    <td style={{ color:'#1F6B3D' }}>{fmtN(m.thu)}</td>
                    <td style={{ color:'#8C1F1F' }}>{fmtN(m.chi)}</td>
                    <td style={{ color: color(m.rong) }}>{fmtPs(m.rong)}</td>
                    <td style={{ color: color(m.cuoiky) }}>{fmtB(m.cuoiky)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Lũy kế {CY}</td>
                  <td style={{ color:'#1F6B3D' }}>{fmtN(luykeThu)}</td>
                  <td style={{ color:'#8C1F1F' }}>{fmtN(luykeChi)}</td>
                  <td style={{ color: color(luykeRong) }}>{fmtPs(luykeRong)}</td>
                  <td style={{ color:'#1C3557' }}>{fmtB(totals.cuoiky)}</td>
                </tr>
              </tbody>
            </table>

            {/* Bar chart */}
            <div className="chart-wrap">
              <div className="chart-legend">
                <div style={{ display:'flex', alignItems:'center', gap:4 }}><div className="legend-dot" style={{ background:'#86EFAC' }}/>Thu</div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}><div className="legend-dot" style={{ background:'#FCA5A5' }}/>Chi</div>
              </div>
              <svg viewBox={`0 0 ${BAR_W * monthRows.length + 30} 160`} style={{ width:'100%', height:160, display:'block' }}>
                {monthRows.map((m, i) => {
                  const x = i * BAR_W + 15
                  const BH = 130, bw = BAR_W / 2 - 3
                  const thuH = (m.thu / chartMax) * BH
                  const chiH = (m.chi / chartMax) * BH
                  return (
                    <g key={m.mm}>
                      <rect x={x}         y={BH - thuH + 10} width={bw} height={thuH} fill="#86EFAC" rx={2}/>
                      <rect x={x + bw + 2} y={BH - chiH + 10} width={bw} height={chiH} fill="#FCA5A5" rx={2}/>
                      <text x={x + BAR_W / 2 - 2} y={155} fontSize={9} textAnchor="middle" fill="#9CA3AF">{mmLabel(m.mm)}</text>
                    </g>
                  )
                })}
                <line x1={10} y1={140} x2={BAR_W * monthRows.length + 20} y2={140} stroke="#E5E0D8" strokeWidth={1}/>
              </svg>
            </div>
          </div>

          {/* Right: unit + account table */}
          <div className="ov-card">
            <div className="ov-card-hdr">
              DÒNG TIỀN THEO ĐƠN VỊ &nbsp;· Tháng 1–{new Date().getMonth()+1}/{CY}
            </div>
            <table className="ut">
              <thead>
                <tr>
                  <th>ĐƠN VỊ / TÀI KHOẢN</th>
                  <th>ĐẦU KỲ ({unitLbl})</th>
                  <th>TỔNG THU ({unitLbl})</th>
                  <th>TỔNG CHI ({unitLbl})</th>
                  <th>RÒNG ({unitLbl})</th>
                  <th>SỐ DƯ ({unitLbl})</th>
                </tr>
              </thead>
              <tbody>
                {unitRows.map(u => (
                  <>
                    {/* Unit group row */}
                    <tr key={`u-${u.unit}`} className="u-row" onClick={() => toggle(u.unit)}>
                      <td>
                        <span className="ut-toggle">{expanded.has(u.unit) ? '▼' : '▶'}</span>
                        {u.unit}
                      </td>
                      <td style={{ color: color(u.dauKy) }}>{fmtB(u.dauKy)}</td>
                      <td style={{ color:'#1F6B3D' }}>{fmtN(u.thu)}</td>
                      <td style={{ color:'#8C1F1F' }}>{fmtN(u.chi)}</td>
                      <td style={{ color: color(u.rong), fontWeight:600 }}>{fmtPs(u.rong)}</td>
                      <td style={{ fontWeight:600, color: color(u.cuoiky) }}>{fmtB(u.cuoiky)}</td>
                    </tr>
                    {/* Account sub-rows (only when expanded) */}
                    {expanded.has(u.unit) && u.accounts.map(a => (
                      <tr key={`a-${a.stk}`} className="a-row">
                        <td>{a.label}</td>
                        <td style={{ color: color(a.dauKy) }}>{fmtB(a.dauKy)}</td>
                        <td style={{ color:'#1F6B3D' }}>{fmtN(a.thu)}</td>
                        <td style={{ color:'#8C1F1F' }}>{fmtN(a.chi)}</td>
                        <td style={{ color: color(a.rong) }}>{fmtPs(a.rong)}</td>
                        <td style={{ color: color(a.cuoiky) }}>{fmtB(a.cuoiky)}</td>
                      </tr>
                    ))}
                  </>
                ))}
                <tr className="total">
                  <td>Tổng tập đoàn</td>
                  <td style={{ color: color(totals.dauKy) }}>{fmtB(totals.dauKy)}</td>
                  <td style={{ color:'#1F6B3D' }}>{fmtN(totals.thu)}</td>
                  <td style={{ color:'#8C1F1F' }}>{fmtN(totals.chi)}</td>
                  <td style={{ color: color(totals.rong) }}>{fmtPs(totals.rong)}</td>
                  <td style={{ color:'#1C3557' }}>{fmtB(totals.cuoiky)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  )
}
