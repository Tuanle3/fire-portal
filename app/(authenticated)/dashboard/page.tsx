'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { useDashUnit } from '@/contexts/dash-unit'

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

// Try field name with spaces AND underscores
function f(row: Row, name: string): unknown {
  return row[name] ?? row[name.replace(/ /g, '_')]
}
function nf(row: Row, name: string): number { const x = Number(f(row, name)); return isNaN(x) ? 0 : x }

// Cá nhân = đại diện bắt đầu bằng Mr / Mrs / Ms (không phân biệt hoa thường)
function isCaNhan(row: Row): boolean {
  const dd = String(f(row, 'Đại diện vay') ?? '').trim().toLowerCase()
  return /^(mr|mrs|ms)[\s./]/.test(dd) || dd === 'mr' || dd === 'mrs' || dd === 'ms'
}

const color = (v: number) => (v > 0 ? '#1F6B3D' : v < 0 ? '#8C1F1F' : '#374151')

const CY    = new Date().getFullYear()
const CY_PX = `${CY}-`

interface MonthRow   { mm: string; thu: number; chi: number; rong: number; cuoiky: number }
interface AccRow     { label: string; stk: string; dauKy: number; thu: number; chi: number; rong: number; cuoiky: number }
interface UnitRow    { unit: string; dauKy: number; thu: number; chi: number; rong: number; cuoiky: number; accounts: AccRow[] }

export default function DashboardPage() {
  const [data,       setData]       = useState<Row[]>([])
  const [dataTs,     setDataTs]     = useState<Row[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())
  const { unit } = useDashUnit()
  const chartRef      = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<any>(null)

  useEffect(() => {
    const db = getDb()
    Promise.all([
      get(ref(db, 'data_quy')),
      get(ref(db, 'data_ts')),
    ])
      .then(([snapQuy, snapTs]) => {
        setData(toArr(snapQuy).sort((a, b) =>
          String(a['Ngày'] ?? '').localeCompare(String(b['Ngày'] ?? ''))
        ))
        setDataTs(toArr(snapTs))
      })
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

  // Monthly balance split by Cá nhân vs Pháp nhân (for chart lines)
  const monthlyTypeBalance = useMemo<Array<{mm:string;cn:number;pn:number}>>(() => {
    const stkUnit = new Map<string,string>()
    for (const r of data) {
      const s = String(r['Số_tài_khoản'] ?? ''), u = String(r['Đơn_vị'] ?? '')
      if (s && u && !stkUnit.has(s)) stkUnit.set(s, u)
    }
    const ton = new Map<string,number>(dauKyAcc)
    const result: Array<{mm:string;cn:number;pn:number}> = []
    let curMm = ''
    for (const r of yearData) {
      const mm = String(r['Ngày'] ?? '').slice(5,7)
      const stk = String(r['Số_tài_khoản'] ?? '')
      if (mm !== curMm) {
        if (curMm) {
          let cn = 0, pn = 0
          ton.forEach((v,s) => { const u=(stkUnit.get(s)??'').toLowerCase(); if(u.startsWith('mr')) cn+=v; else pn+=v })
          result.push({mm:curMm,cn,pn})
        }
        curMm = mm
      }
      if (stk) ton.set(stk, Number(r['Tồn'] ?? 0))
    }
    if (curMm) {
      let cn = 0, pn = 0
      ton.forEach((v,s) => { const u=(stkUnit.get(s)??'').toLowerCase(); if(u.startsWith('mr')) cn+=v; else pn+=v })
      result.push({mm:curMm,cn,pn})
    }
    return result
  }, [data, yearData, dauKyAcc])

  // Debt KPI từ data_ts
  const debtKpi = useMemo(() => {
    const tc   = dataTs.filter(r => String(f(r,'Tình trạng') ?? '').toLowerCase() === 'đã thế chấp')
    const chua = dataTs.filter(r => String(f(r,'Tình trạng') ?? '').toLowerCase() === 'chưa thế chấp')
    const cn   = dataTs.filter(isCaNhan)
    const pn   = dataTs.filter(r => !isCaNhan(r))
    const totalDuNo  = dataTs.reduce((s, r) => s + nf(r,'Dư nợ phân bổ theo TSĐB'), 0)
    const cnDuNo     = cn.reduce((s, r) => s + nf(r,'Dư nợ phân bổ theo TSĐB'), 0)
    const pnDuNo     = pn.reduce((s, r) => s + nf(r,'Dư nợ phân bổ theo TSĐB'), 0)
    const tcSA       = tc.filter(r => {
      const dd = String(f(r,'Đại diện vay') ?? '').trim()
      const ht = String(f(r,'Hình thức vay') ?? '').toLowerCase()
      return dd.startsWith('SA.') && (ht.includes('ngắn') || ht.includes('ngan'))
    })
    const hanMucTC   = tcSA.reduce((s, r) => s + nf(r,'Hạn mức cho vay'), 0)
    const duNoTC     = tcSA.reduce((s, r) => s + nf(r,'Dư nợ hiện tại'), 0)
    const roomTC     = hanMucTC - duNoTC
    const chuaDinhGia = chua.reduce((s, r) => s + nf(r,'Định giá'), 0)
    const chuaRoom    = chua.reduce((s, r) => s + nf(r,'Hạn mức cho vay'), 0)
    return { totalDuNo, cnDuNo, pnDuNo, hanMucTC, duNoTC, roomTC, chuaCount: chua.length, chuaDinhGia, chuaRoom }
  }, [dataTs])

  // ── vẽ chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || monthRows.length === 0) return

    const labels    = monthRows.map(m => mmLabel(m.mm))
    const thuData   = monthRows.map(m => +(m.thu    / divisor).toFixed(2))
    const chiData   = monthRows.map(m => +(m.chi    / divisor).toFixed(2))
    const soDuData  = monthRows.map(m => +(m.cuoiky / divisor).toFixed(2))
    const pnData    = monthRows.map(m => {
      const found = monthlyTypeBalance.find(b => b.mm === m.mm)
      return found ? +(found.pn / divisor).toFixed(2) : null
    })
    const cnData    = monthRows.map(m => {
      const found = monthlyTypeBalance.find(b => b.mm === m.mm)
      return found ? +(found.cn / divisor).toFixed(2) : null
    })

    const buildChart = () => {
      const Chart = (window as any).Chart
      if (!Chart || !chartRef.current) return
      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
      chartInstance.current = new Chart(chartRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Thu', data: thuData, backgroundColor: '#7b8da7', borderRadius: 4, yAxisID: 'y', order: 2 },
            { label: 'Chi', data: chiData, backgroundColor: '#e6c5db', borderRadius: 4, yAxisID: 'y', order: 2 },
            { label: 'Số dư pháp nhân', data: pnData, type: 'line' as any, borderColor: '#734ad4', backgroundColor: 'transparent', pointBackgroundColor: '#D4A64A', pointRadius: 3, borderWidth: 1.5, borderDash: [6, 3], yAxisID: 'y2', order: 1, tension: 0.3 },
            { label: 'Số dư cá nhân', data: cnData, type: 'line' as any, borderColor: '#E05A8A', backgroundColor: 'transparent', pointBackgroundColor: '#E05A8A', pointRadius: 3, borderWidth: 1.5, borderDash: [2, 3], yAxisID: 'y2', order: 1, tension: 0.3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unitLbl}` } },
          },
          scales: {
            y:  { position: 'left',  grid: { color: '#F0F4FA' }, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: (v: any) => v.toLocaleString('vi-VN') + ' ' + unitLbl } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: (v: any) => v.toLocaleString('vi-VN') + ' ' + unitLbl } },
            x:  { grid: { display: false }, ticks: { font: { size: 10 }, color: '#6B7280' } },
          },
        },
      })
    }

    if ((window as any).Chart) {
      buildChart()
    } else {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
      s.onload = buildChart
      document.head.appendChild(s)
    }
    return () => { chartInstance.current?.destroy(); chartInstance.current = null }
  }, [monthRows, monthlyTypeBalance, unit])

  const luykeThu  = monthRows.reduce((s, m) => s + m.thu, 0)
  const luykeChi  = monthRows.reduce((s, m) => s + m.chi, 0)
  const luykeRong = luykeThu - luykeChi
  const mmLabel = (mm: string) => `T${mm}/${String(CY).slice(2)}`

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
        /* 3 cards bằng nhau */
        .kpi4{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;}
        .k4{background:#fff;border:1px solid #E5E0D8;border-radius:10px;padding:16px 18px;}
        .k4-lbl{font-size:9.5px;font-weight:700;letter-spacing:.08em;color:#6B7280;text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:5px;}
        .k4-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
        .k4-val{font-size:20px;font-weight:800;font-family:'Roboto Mono',monospace;line-height:1.15;}
        .k4-sub{font-size:10px;color:#9CA3AF;margin-top:2px;line-height:1.5;}
        /* Card 1 – số dư */
        .k4du-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
        .k4du-delta{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:5px;}
        .k4du-cols{display:grid;grid-template-columns:1fr 1px 1fr;gap:0 14px;}
        .k4du-period{font-size:9px;font-weight:700;letter-spacing:.07em;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;}
        .k4du-big{font-family:'Roboto Mono',monospace;font-size:16px;font-weight:800;line-height:1.2;margin-bottom:7px;}
        .k4du-row{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#6B7280;padding:2px 0;border-bottom:1px dashed #F3F4F6;}
        .k4du-row:last-child{border-bottom:none;}
        .k4du-row span:last-child{font-family:'Roboto Mono',monospace;font-weight:600;font-size:10px;}
        /* Card 2 – dư nợ */
        .k4dn-total{font-size:22px;font-weight:800;font-family:'Roboto Mono',monospace;color:#8C1F1F;line-height:1.1;margin:4px 0 10px;}
        .k4dn-bar{height:6px;border-radius:3px;background:#F3F4F6;overflow:hidden;margin:8px 0 10px;}
        .k4dn-bar-cn{height:100%;background:#DC2626;border-radius:3px 0 0 3px;}
        .k4dn-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #F9FAFB;}
        .k4dn-row:last-child{border-bottom:none;}
        .k4dn-lbl{font-size:10.5px;font-weight:600;color:#374151;}
        .k4dn-val{font-size:11px;font-weight:700;font-family:'Roboto Mono',monospace;}
        .k4dn-pct{font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;margin-left:5px;}
        /* Card 3 – khả dụng (2 cột như card 1) */
        .k4kd-cols{display:grid;grid-template-columns:1fr 1px 1fr;gap:0 14px;margin-top:8px;}
        .k4kd-period{font-size:9px;font-weight:700;letter-spacing:.07em;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px;}
        .k4kd-big{font-size:16px;font-weight:800;font-family:'Roboto Mono',monospace;line-height:1.2;margin-bottom:7px;}
        .k4kd-row{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#6B7280;padding:2px 0;border-bottom:1px dashed #F3F4F6;}
        .k4kd-row:last-child{border-bottom:none;}
        .k4kd-row span:last-child{font-family:'Roboto Mono',monospace;font-weight:600;color:#374151;font-size:10px;}
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
        /* Risk alerts */
        .risk-item{padding:9px 11px;border-radius:7px;border-left:3px solid transparent;}
        .risk-r{background:#FEF2F2;border-left-color:#DC2626;}
        .risk-a{background:#FFFBEB;border-left-color:#F59E0B;}
        .risk-g{background:#F0FDF4;border-left-color:#22C55E;}
        .risk-hdr{display:flex;align-items:center;gap:7px;margin-bottom:3px;}
        .risk-badge{font-size:8.5px;font-weight:700;letter-spacing:.07em;padding:2px 6px;border-radius:3px;white-space:nowrap;}
        .rbr{background:#DC2626;color:#fff;} .rba{background:#F59E0B;color:#fff;} .rbg{background:#22C55E;color:#fff;}
        .risk-title{font-size:11.5px;font-weight:700;color:#1F2430;}
        .risk-msg{font-size:11px;color:#374151;line-height:1.5;}
        .risk-suggest{font-size:10.5px;color:#6B7280;margin-top:2px;font-style:italic;}
        .tbl-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        @media(max-width:1180px){
          .mt{font-size:10px;} .mt th{padding:5px 6px;font-size:8.5px;} .mt td{padding:5px 6px;font-size:9.5px;}
          .ut{font-size:9.5px;} .ut th{padding:5px 5px;font-size:8px;} .ut td{padding:5px 5px;font-size:9px;}
          .ut .a-row td:first-child{padding-left:20px;}
        }
        @media(max-width:900px){.kpi4{grid-template-columns:1fr}.ov2{grid-template-columns:1fr}.ov{padding:14px 12px}}
        @media(max-width:600px){
          .mt{font-size:9px;} .mt th{padding:4px 5px;font-size:7.5px;} .mt td{padding:4px 5px;font-size:8.5px;}
          .ut{font-size:8.5px;} .ut th{padding:4px 4px;font-size:7px;} .ut td{padding:4px 4px;font-size:8px;}
        }
      `}</style>

      <main className="ov">
        <div className="ov-title">
          BÁO CÁO THÁNG {new Date().getMonth() + 1} NĂM {CY} · Firebase Realtime DB
        </div>

        {/* KPI cards – 3 columns equal */}
        <div className="kpi4">

          {/* ── Card 1: SỐ DƯ TẠI THỜI ĐIỂM ── */}
          <div className="k4">
            <div className="k4du-hdr">
              <div className="k4-lbl" style={{ marginBottom:0 }}>
                <span className="k4-dot" style={{ background:'#D4A64A' }}/>SỐ DƯ TẠI THỜI ĐIỂM
              </div>
              <span className="k4du-delta" style={{
                color: color(totals.cuoiky - totals.dauKy),
                background: totals.cuoiky >= totals.dauKy ? '#F0FDF4' : '#FEF2F2',
              }}>
                {totals.cuoiky >= totals.dauKy ? '▲' : '▼'} {fmtPs(totals.cuoiky - totals.dauKy)} {unitLbl}
              </span>
            </div>
            <div className="k4du-cols">
              <div>
                <div className="k4du-period">Đầu kỳ · 1/1/{CY}</div>
                <div className="k4du-big" style={{ color:'#1C3557' }}>
                  {fmtB(totals.dauKy)}<span style={{ fontSize:10, fontWeight:600, marginLeft:2 }}>{unitLbl}</span>
                </div>
                <div className="k4du-row"><span>Cá nhân</span><span style={{ color: color(totals.dauKyCaNhan) }}>{fmtB(totals.dauKyCaNhan)} {unitLbl}</span></div>
                <div className="k4du-row"><span>Pháp nhân</span><span style={{ color: color(totals.dauKyPhapNhan) }}>{fmtB(totals.dauKyPhapNhan)} {unitLbl}</span></div>
              </div>
              <div style={{ background:'#E5E0D8' }}/>
              <div>
                <div className="k4du-period">Cuối kỳ · {new Date().toLocaleDateString('vi-VN')}</div>
                <div className="k4du-big" style={{ color: color(totals.cuoiky) }}>
                  {fmtB(totals.cuoiky)}<span style={{ fontSize:10, fontWeight:600, marginLeft:2 }}>{unitLbl}</span>
                </div>
                <div className="k4du-row"><span>Cá nhân</span><span style={{ color: color(totals.cuoikyCaNhan) }}>{fmtB(totals.cuoikyCaNhan)} {unitLbl}</span></div>
                <div className="k4du-row"><span>Pháp nhân</span><span style={{ color: color(totals.cuoikyPhapNhan) }}>{fmtB(totals.cuoikyPhapNhan)} {unitLbl}</span></div>
              </div>
            </div>
          </div>

          {/* ── Card 2: TỔNG DƯ NỢ HIỆN TẠI ── */}
          <div className="k4">
            <div className="k4-lbl"><span className="k4-dot" style={{ background:'#DC2626' }}/>TỔNG DƯ NỢ HIỆN TẠI</div>
            <div className="k4dn-total">
              {fmtN(debtKpi.totalDuNo)}<span style={{ fontSize:12, fontWeight:600, marginLeft:3 }}>{unitLbl}</span>
            </div>
            {/* Progress bar CN vs PN */}
            {debtKpi.totalDuNo > 0 && (
              <div className="k4dn-bar">
                <div className="k4dn-bar-cn" style={{ width: `${debtKpi.cnDuNo / debtKpi.totalDuNo * 100}%` }}/>
              </div>
            )}
            <div className="k4dn-row">
              <span className="k4dn-lbl">👤 Cá nhân đứng tên</span>
              <span style={{ display:'flex', alignItems:'center', gap:0 }}>
                <span className="k4dn-val" style={{ color:'#8C1F1F' }}>{fmtN(debtKpi.cnDuNo)} {unitLbl}</span>
                {debtKpi.totalDuNo > 0 && <span className="k4dn-pct" style={{ background:'#FEF2F2', color:'#8C1F1F' }}>{(debtKpi.cnDuNo/debtKpi.totalDuNo*100).toFixed(1)}%</span>}
              </span>
            </div>
            <div className="k4dn-row">
              <span className="k4dn-lbl">🏢 Pháp nhân</span>
              <span style={{ display:'flex', alignItems:'center', gap:0 }}>
                <span className="k4dn-val" style={{ color:'#1C3557' }}>{fmtN(debtKpi.pnDuNo)} {unitLbl}</span>
                {debtKpi.totalDuNo > 0 && <span className="k4dn-pct" style={{ background:'#EFF6FF', color:'#1E40AF' }}>{(debtKpi.pnDuNo/debtKpi.totalDuNo*100).toFixed(1)}%</span>}
              </span>
            </div>
          </div>

          {/* ── Card 3: KHẢ DỤNG – 2 cột ngang như card 1 ── */}
          <div className="k4">
            <div className="k4du-hdr">
              <div className="k4-lbl" style={{ marginBottom:0 }}>
                <span className="k4-dot" style={{ background:'#2563EB' }}/>KHẢ DỤNG
              </div>
            </div>
            <div className="k4kd-cols">
              {/* Hạn mức NH */}
              <div>
                <div className="k4kd-period">Hạn mức NH ngắn hạn</div>
                <div className="k4kd-big" style={{ color: debtKpi.roomTC <= 0 ? '#8C1F1F' : '#1C3557' }}>
                  {fmtN(debtKpi.roomTC)}<span style={{ fontSize:10, fontWeight:600, marginLeft:2 }}>{unitLbl}</span>
                </div>
                <div className="k4kd-row"><span>Hạn mức cấp</span><span>{fmtN(debtKpi.hanMucTC)} {unitLbl}</span></div>
                <div className="k4kd-row"><span>Đã dùng</span><span style={{ color:'#8C1F1F', fontWeight:700 }}>{fmtN(debtKpi.duNoTC)} {unitLbl}</span></div>
              </div>
              {/* Divider */}
              <div style={{ background:'#E5E0D8' }}/>
              {/* Tài sản chưa khai thác */}
              <div>
                <div className="k4kd-period">Tài sản chưa khai thác</div>
                <div className="k4kd-big" style={{ color:'#15803D' }}>
                  {debtKpi.chuaCount}<span style={{ fontSize:10, fontWeight:600, marginLeft:4 }}>tài sản</span>
                </div>
                <div className="k4kd-row"><span>Định giá</span><span>{fmtN(debtKpi.chuaDinhGia)} {unitLbl}</span></div>
                <div className="k4kd-row"><span>Room còn dụng</span><span style={{ color:'#15803D', fontWeight:700 }}>{fmtN(debtKpi.chuaRoom)} {unitLbl}</span></div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Chart & Risk alerts row ── */}
        {(() => {
          const totalDays  = monthRows.length * 30
          const dailyAvg   = totalDays > 0 && luykeChi > 0 ? luykeChi / totalDays : 0
          const coverDays  = dailyAvg > 0 ? totals.cuoiky / dailyAvg : 999
          const cnPct      = debtKpi.totalDuNo > 0 ? debtKpi.cnDuNo / debtKpi.totalDuNo * 100 : 0
          const nhUsedPct  = debtKpi.hanMucTC  > 0 ? debtKpi.duNoTC  / debtKpi.hanMucTC  * 100 : 0
          const last2      = monthRows.slice(-2)
          const cashTrend  = last2.length === 2 ? last2[1].rong - last2[0].rong : 0
          const cumNet     = luykeRong
          type Lvl = 'r'|'a'|'g'
          const risks: {id:string;icon:string;title:string;body:string;action:string;lvl:Lvl}[] = [
            {
              id: 'lq',
              lvl: coverDays < 30 ? 'r' : coverDays < 60 ? 'a' : 'g',
              icon: coverDays < 30 ? '🚨' : coverDays < 60 ? '⚠️' : '✅',
              title: `Thanh khoản: Dự trữ ${coverDays.toFixed(0)} ngày hoạt động`,
              body: dailyAvg > 0
                ? `Số dư tiền mặt ${fmtB(totals.cuoiky)} ${unitLbl} = ${coverDays.toFixed(0)} ngày chi phí (bình quân ${fmtN(dailyAvg)} ${unitLbl}/ngày). ${coverDays < 30 ? 'Rất nguy hiểm.' : coverDays < 60 ? 'Mức cảnh báo.' : 'Thanh khoản an toàn.'}`
                : 'Chưa có dữ liệu chi trong kỳ.',
              action: coverDays < 60
                ? `→ (1) Đẩy nhanh thu hồi công nợ; (2) Giãn chi lớn; (3) Kích hoạt hạn mức ngắn hạn ${fmtN(debtKpi.roomTC)} ${unitLbl}.`
                : '→ Duy trì dự trữ ≥45 ngày. Gửi kỳ hạn ngắn phần nhàn rỗi.',
            },
            {
              id: 'ds',
              lvl: cnPct > 60 ? 'r' : cnPct > 40 ? 'a' : 'g',
              icon: '🏦',
              title: `Cơ cấu nợ: ${cnPct.toFixed(1)}% dư nợ đứng tên cá nhân`,
              body: debtKpi.totalDuNo > 0
                ? `${fmtN(debtKpi.cnDuNo)}/${fmtN(debtKpi.totalDuNo)} ${unitLbl} đứng tên cá nhân. Lãi vay không đúng chủ thể bị loại khi quyết toán TNDN — mất ~${fmtN(debtKpi.cnDuNo * 0.20 * 0.10)} ${unitLbl}/năm lợi thế thuế.`
                : 'Chưa có dữ liệu dư nợ.',
              action: '→ (1) Ký HĐ ủy quyền vay hộ; (2) Chuyển sang khế ước pháp nhân khi đáo hạn; (3) Ưu tiên sang tên TS lớn.',
            },
            {
              id: 'nh',
              lvl: (debtKpi.hanMucTC === 0 ? 'g' : debtKpi.roomTC <= 0 ? 'r' : nhUsedPct > 80 ? 'a' : 'g') as Lvl,
              icon: '📊',
              title: `Hạn mức tín dụng ngắn hạn khả dụng: ${fmtN(debtKpi.roomTC)} ${unitLbl}`,
              body: `Hạn mức cấp ${fmtN(debtKpi.hanMucTC)} ${unitLbl}, đã dùng ${fmtN(debtKpi.duNoTC)} ${unitLbl}, còn ${fmtN(debtKpi.roomTC)} ${unitLbl}.`,
              action: debtKpi.roomTC > 0
                ? '→ Ưu tiên dùng hạn mức này trả lãi suất cao. Trả vòng để tái sử dụng.'
                : '→ Đàm phán nâng hạn mức hoặc bổ sung TSĐB.',
            },
            ...(debtKpi.chuaCount > 0 ? [{
              id: 'ts',
              lvl: 'g' as Lvl,
              icon: '✨',
              title: `${debtKpi.chuaCount} tài sản chưa khai thác — Room tín dụng ${fmtN(debtKpi.chuaRoom)} ${unitLbl}`,
              body: `${debtKpi.chuaCount} BĐS định giá ${fmtN(debtKpi.chuaDinhGia)} ${unitLbl} chưa thế chấp, tương đương hạn mức khả dụng ${fmtN(debtKpi.chuaRoom)} ${unitLbl}.`,
              action: '→ Thế chấp tại NH lãi suất thấp · Tất toán khoản vay ngoài · Tài trợ dự án mới',
            }] : []),
            {
              id: 'cf',
              lvl: (cumNet >= 0 ? (cashTrend >= 0 ? 'g' : 'a') : 'r') as Lvl,
              icon: cumNet >= 0 ? (cashTrend >= 0 ? '✅' : '⚠️') : '🔻',
              title: `Dòng tiền ròng lũy kế: ${fmtPs(cumNet)} ${unitLbl} — Xu hướng ${cashTrend >= 0 ? '▲ Cải thiện' : '▼ Suy giảm'}`,
              body: last2.length === 2
                ? `Lũy kế: ${fmtPs(cumNet)} ${unitLbl}. So 2 tháng gần: ${mmLabel(last2[0].mm)} (${fmtPs(last2[0].rong)} ${unitLbl}) → ${mmLabel(last2[1].mm)} (${fmtPs(last2[1].rong)} ${unitLbl}), ${cashTrend >= 0 ? 'xu hướng tích cực.' : 'xu hướng xấu đi.'}`
                : `Lũy kế: ${fmtPs(cumNet)} ${unitLbl}.`,
              action: cashTrend < 0
                ? '→ Phân tích nguyên nhân suy giảm. Đặt chỉ tiêu dòng tiền tháng tới.'
                : '→ Duy trì. Dùng thặng dư trả trước nợ gốc.',
            },
          ]
          const bgOf  = (l:Lvl) => l==='r'?'#FFF5F5':l==='a'?'#FFF4E0':'#F0FDF4'
          const bdOf  = (l:Lvl) => l==='r'?'#FECACA':l==='a'?'#FDE68A':'#BBF7D0'
          const acOf  = (l:Lvl) => l==='r'?'#B91C1C':l==='a'?'#B45309':'#047857'
          return (
            <div className="ov2" style={{ marginBottom:16, alignItems:'stretch' }}>
              {/* Cash flow chart */}
              <div className="ov-card" style={{ display:'flex', flexDirection:'column' }}>
                <div className="ov-card-hdr">⬤ DIỄN BIẾN DÒNG TIỀN {CY}</div>
                <div style={{ flex:1, padding:'12px 14px', minHeight:300 }}>
                  <canvas ref={chartRef}/>
                </div>
                {/* Legend bên dưới chart */}
                <div style={{ padding:'8px 14px 12px', display:'flex', flexWrap:'wrap', gap:'10px 20px', borderTop:'1px solid #F3F4F6' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}><span style={{ width:12, height:12, borderRadius:3, background:'#7b8da7', display:'inline-block' }}/> Thu</span>
                  <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}><span style={{ width:12, height:12, borderRadius:3, background:'#e6c5db', display:'inline-block' }}/> Chi</span>
                  <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}><span style={{ width:20, height:0, borderTop:'2px dashed #734ad4', borderTopStyle:'dashed', display:'inline-block', verticalAlign:'middle', opacity:.6 }}/> Số dư pháp nhân</span>
                  <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}><span style={{ width:20, height:0, borderTop:'2px dashed #E05A8A', display:'inline-block', verticalAlign:'middle' }}/> Số dư cá nhân</span>
                </div>
              </div>
              {/* Risk alerts */}
              <div className="ov-card">
                <div className="ov-card-hdr" style={{ background:'#7C2626' }}>⬤ CẢNH BÁO RỦI RO &amp; ĐỀ XUẤT</div>
                <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10, overflowY:'auto' }}>
                  {risks.map(r => (
                    <div key={r.id} style={{ background:bgOf(r.lvl), border:`1px solid ${bdOf(r.lvl)}`, borderRadius:8, padding:'10px 12px', display:'flex', gap:10 }}>
                      <div style={{ fontSize:18, flexShrink:0, lineHeight:1.4 }}>{r.icon}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:acOf(r.lvl), marginBottom:4 }}>{r.title}</div>
                        <div style={{ fontSize:11, color:'#374151', lineHeight:1.6 }}>{r.body}</div>
                        <div style={{ fontSize:10.5, color:acOf(r.lvl), fontStyle:'italic', marginTop:5, lineHeight:1.5 }}>{r.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        <div className="ov2">
          {/* Left: monthly table + chart */}
          <div className="ov-card">
            <div className="ov-card-hdr">SO SÁNH DÒNG TIỀN TỪNG THÁNG</div>
            <div className="tbl-scroll">
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
            </div>

          </div>

          {/* Right: unit + account table */}
          <div className="ov-card">
            <div className="ov-card-hdr">
              DÒNG TIỀN THEO ĐƠN VỊ &nbsp;· Tháng 1–{new Date().getMonth()+1}/{CY}
            </div>
            <div className="tbl-scroll">
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
        </div>
      </main>
    </>
  )
}
