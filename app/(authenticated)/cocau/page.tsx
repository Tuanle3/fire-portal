'use client'
import { useEffect, useState, useMemo } from 'react'
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

const GROUP_COLORS = ['#1C3557','#7C3AED','#0EA5E9','#D4A64A','#15803D','#EF4444','#F59E0B','#6B7280','#0891B2','#DC2626']

const CY         = new Date().getFullYear()
const CY_PX      = `${CY}-`
const CUR_MM     = new Date().getMonth() + 1
const MONTH_KEYS = Array.from({ length: CUR_MM }, (_, i) => `${CY}-${String(i + 1).padStart(2, '0')}`)
const MONTH_LBL  = MONTH_KEYS.map(mk => `T${mk.slice(5)}/${String(CY).slice(2)}`)

interface NhomAgg { nhom: string; thuMonthly: number[]; chiMonthly: number[] }

export default function CocauPage() {
  const { unit } = useDashUnit()
  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs   = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmt = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtS = (v: number) => v === 0 ? '–' : fmt(v)

  const [data,    setData]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [mode,    setMode]    = useState<'thu'|'chi'>('thu')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    get(ref(getDb(), 'data_quy'))
      .then(snap => setData(
        toArr(snap).sort((a, b) => String(a['Ngày'] ?? '').localeCompare(String(b['Ngày'] ?? '')))
      ))
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  const yearData = useMemo(() => data.filter(r => String(r['Ngày'] ?? '').startsWith(CY_PX)), [data])

  // Aggregate by Nhóm_CP per month
  const nhomData = useMemo<NhomAgg[]>(() => {
    const map = new Map<string, { thu: Record<string, number>; chi: Record<string, number> }>()
    for (const r of yearData) {
      const mm   = String(r['Ngày'] ?? '').slice(0, 7)
      if (!MONTH_KEYS.includes(mm)) continue
      const nhom = (String(r['Nhóm_CP'] ?? r['Đơn_vị'] ?? '').trim()) || 'Khác'
      const ps   = Number(r['Số_tiền_PS'] ?? 0)
      const loai = String(r['Ghi_chu'] ?? '')
      const amt  = Math.abs(ps)
      if (!amt) continue
      if (!map.has(nhom)) map.set(nhom, { thu: {}, chi: {} })
      const e = map.get(nhom)!
      if (loai === 'Thu' || ps > 0) e.thu[mm] = (e.thu[mm] ?? 0) + amt
      if (loai === 'Chi' || ps < 0) e.chi[mm] = (e.chi[mm] ?? 0) + amt
    }
    return Array.from(map.entries()).map(([nhom, { thu, chi }]) => ({
      nhom,
      thuMonthly: MONTH_KEYS.map(mk => thu[mk] ?? 0),
      chiMonthly: MONTH_KEYS.map(mk => chi[mk] ?? 0),
    }))
  }, [yearData])

  // Monthly totals
  const monthlyThu  = MONTH_KEYS.map((_, i) => nhomData.reduce((s, g) => s + g.thuMonthly[i], 0))
  const monthlyChi  = MONTH_KEYS.map((_, i) => nhomData.reduce((s, g) => s + g.chiMonthly[i], 0))
  const monthlyRong = monthlyThu.map((v, i) => v - monthlyChi[i])
  const totalThu    = monthlyThu.reduce((s, v) => s + v, 0)
  const totalChi    = monthlyChi.reduce((s, v) => s + v, 0)
  const chiThuRatio = totalThu > 0 ? totalChi / totalThu * 100 : 0

  // Group ranking: CPHĐ* first (sorted by total desc), then others (sorted by total desc)
  const nhomRanked = useMemo(() => {
    const isCPHD = (n: string) => n.toUpperCase().startsWith('CPHĐ') || n.toUpperCase().startsWith('CPHD')
    return nhomData
      .map(g => ({ nhom: g.nhom, total: (mode === 'thu' ? g.thuMonthly : g.chiMonthly).reduce((s, v) => s + v, 0) }))
      .sort((a, b) => {
        const ac = isCPHD(a.nhom) ? 0 : 1
        const bc = isCPHD(b.nhom) ? 0 : 1
        if (ac !== bc) return ac - bc
        return b.total - a.total
      })
  }, [nhomData, mode])
  const grandTotal   = nhomRanked.reduce((s, g) => s + g.total, 0)
  const maxVal       = nhomRanked.filter(g => g.total > 0)[0]?.total || 1
  const activeGroups = nhomRanked.filter(g => g.total > 0).length

  // Month-over-month biến động (top 4 by absolute % change)
  const bienDong = useMemo(() =>
    nhomData
      .map(g => {
        const arr  = mode === 'thu' ? g.thuMonthly : g.chiMonthly
        const n    = arr.length
        const prev = n >= 2 ? arr[n - 2] : 0
        const cur  = n >= 1 ? arr[n - 1] : 0
        const pct  = prev > 0 ? (cur - prev) / prev * 100 : (cur > 0 ? Infinity : 0)
        return { nhom: g.nhom, prev, cur, pct }
      })
      .filter(x => x.prev > 0 || x.cur > 0)
      .sort((a, b) => Math.abs(b.pct === Infinity ? 1e9 : b.pct) - Math.abs(a.pct === Infinity ? 1e9 : a.pct))
      .slice(0, 4),
  [nhomData, mode])

  // Heatmap intensity
  const heatMax = Math.max(...nhomData.flatMap(g => mode === 'thu' ? g.thuMonthly : g.chiMonthly), 1)
  const heatBg  = (v: number) => {
    if (!v) return 'transparent'
    const base = mode === 'thu' ? '28,53,87' : '220,38,38'
    return `rgba(${base},${(0.05 + Math.min(v / heatMax, 1) * 0.35).toFixed(2)})`
  }

  // 3-month trend + alerts
  const last3        = monthlyRong.slice(-3)
  const trendDown    = last3.length === 3 && last3[2] < last3[1] && last3[1] < last3[0]
  const topNhom      = nhomRanked[0]
  const topNhomPct   = grandTotal > 0 ? (topNhom?.total ?? 0) / grandTotal * 100 : 0
  const topBienDong  = bienDong[0]

  if (loading) return (
    <div style={{ display:'flex', flex:1, alignItems:'center', justifyContent:'center', color:'#6B7280', fontSize:14 }}>
      ⏳ Đang tải dữ liệu...
    </div>
  )
  if (error) return (
    <div style={{ margin:24, padding:16, background:'#FDECEC', borderRadius:8, color:'#8C1F1F' }}>⚠ {error}</div>
  )

  return (
    <>
      <style>{`
        .cc{flex:1;padding:16px 24px 24px;overflow-y:auto;background:#FAF8F3}
        /* Cards */
        .grid4c{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
        .grid2c{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px}
        .grid2ec{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .ccard{background:#fff;border:1px solid #E0E7F0;border-radius:12px;padding:18px 20px}
        .ccard-title{font-size:10px;font-weight:700;letter-spacing:.08em;color:#4B6A8A;margin:-18px -20px 14px;padding:10px 20px;background:#EEF3FA;border-radius:12px 12px 0 0;border-bottom:.5px solid #A8C4DE;display:flex;align-items:center;gap:6px}
        .cdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .kval{font-size:22px;font-weight:800;color:#1C3557;margin-bottom:2px}
        .ksub{font-size:11px;color:#9CA3AF}
        /* Toggle */
        .tgl{display:flex;gap:4px;margin-left:auto}
        .tgl-btn{padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid #E0E7F0;background:#fff;color:#6B7280;cursor:pointer;font-family:inherit}
        .tgl-btn.on{background:#1C3557;color:#fff;border-color:#1C3557}
        /* Bar ranking */
        .bar-row{display:grid;grid-template-columns:14px 130px minmax(60px,1fr) 110px 44px;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #F4F7FB}
        .bar-row:last-of-type{border-bottom:none}
        .bar-rank{font-size:10px;font-weight:700;color:#C4CACF;text-align:right}
        .bar-label{font-size:11px;color:#3D3D3D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bar-track{height:7px;background:#F0F4FA;border-radius:6px;overflow:hidden}
        .bar-fill{height:100%;border-radius:6px;transition:width .4s}
        .bar-val{font-size:11px;font-weight:700;color:#1F2430;white-space:nowrap;text-align:right}
        .bar-pct{font-size:10px;font-weight:700;text-align:right;white-space:nowrap}
        .bar-total{margin-top:12px;padding:9px 14px;background:#DCE9F5;border-radius:0 0 8px 8px;border-top:1.5px solid #A8C4DE;display:flex;justify-content:space-between;align-items:center;color:#4B6A8A;font-size:12px;font-weight:700}
        /* Focus alerts */
        .focus{display:flex;gap:10px;border-radius:8px;padding:10px 12px}
        .focus-ic{font-size:18px;flex-shrink:0;line-height:1.4}
        .focus-title{font-size:12px;font-weight:700;margin-bottom:4px}
        .focus-body{font-size:11px;color:#374151;line-height:1.6}
        .focus-action{font-size:10.5px;font-style:italic;margin-top:5px;line-height:1.5}
        /* Table */
        .ctbl{width:100%;border-collapse:collapse;font-size:12px}
        .ctbl th{font-size:10px;font-weight:600;color:#4B6A8A;letter-spacing:.06em;padding:8px 10px;border-bottom:1px solid #A8C4DE;border-top:1px solid #A8C4DE;background:#EEF3FA;text-align:right;white-space:nowrap}
        .ctbl th:first-child{text-align:left}
        .ctbl td{padding:7px 10px;border-bottom:1px solid #F0F4FA;text-align:right;color:#1F2430;white-space:nowrap;font-family:'Roboto Mono',monospace;font-size:11px}
        .ctbl td:first-child{text-align:left;font-family:inherit}
        .ctbl-total{background:#DCE9F5;font-weight:700;border-top:1.5px solid #A8C4DE}
        .ctbl-total td{color:#4B6A8A!important}
        .pos{color:#15803D;font-weight:600}
        .neg{color:#DC2626;font-weight:600}
        /* Progress */
        .prog-track{height:8px;background:#F0F4FA;border-radius:6px;overflow:hidden;margin:6px 0 4px}
        .prog-fill{height:100%;border-radius:6px}
        .ind-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F0F4FA;font-size:12px}
        .ind-row:last-child{border-bottom:none}
        .sec-lbl{font-size:10px;font-weight:700;letter-spacing:.06em;color:#9CA3AF;margin:14px 0 4px;text-transform:uppercase}
        @media(max-width:900px){.grid4c{grid-template-columns:1fr 1fr}.grid2c,.grid2ec{grid-template-columns:1fr}.cc{padding:12px 14px}}
      `}</style>

      <main className="cc">

        {/* ── 1. KPI CARDS ── */}
        <div className="grid4c">
          <div className="ccard" style={{ border:'1px solid #BBF7D0', background:'linear-gradient(135deg,#F0FDF4,#fff 60%)' }}>
            <div className="ccard-title"><div className="cdot" style={{ background:'#15803D' }}/>TỔNG THU (NĂM {CY})</div>
            <div className="kval">{fmt(totalThu)} {unitLbl}</div>
            <div className="ksub">Tháng 1 – {CUR_MM}/{CY}</div>
          </div>
          <div className="ccard" style={{ border:'1px solid #FECACA', background:'linear-gradient(135deg,#FFF5F5,#fff 60%)' }}>
            <div className="ccard-title"><div className="cdot" style={{ background:'#DC2626' }}/>TỔNG CHI (NĂM {CY})</div>
            <div className="kval" style={{ color:'#DC2626' }}>{fmt(totalChi)} {unitLbl}</div>
            <div className="ksub">Tháng 1 – {CUR_MM}/{CY}</div>
          </div>
          <div className="ccard">
            <div className="ccard-title"><div className="cdot" style={{ background:'#1C3557' }}/>SỐ NHÓM PHÂN TÍCH</div>
            <div className="kval">{activeGroups} / {nhomData.length}</div>
            <div className="ksub">Nhóm có phát sinh / tổng số nhóm</div>
          </div>
          <div className="ccard" style={chiThuRatio > 100
            ? { border:'1px solid #FDE68A', background:'linear-gradient(135deg,#FFF4E0,#fff 60%)' }
            : { border:'1px solid #BBF7D0', background:'linear-gradient(135deg,#F0FDF4,#fff 60%)' }}>
            <div className="ccard-title">
              <div className="cdot" style={{ background: chiThuRatio > 100 ? '#F59E0B' : '#15803D' }}/>TỶ LỆ CHI/THU
            </div>
            <div className="kval" style={{ color: chiThuRatio > 100 ? '#B45309' : '#15803D' }}>
              {chiThuRatio.toFixed(1)}%
            </div>
            <div className="ksub">
              {chiThuRatio > 100
                ? `Chi vượt thu ${fmt(totalChi - totalThu)} ${unitLbl}`
                : `Thu vượt chi ${fmt(totalThu - totalChi)} ${unitLbl}`}
            </div>
          </div>
        </div>

        {/* ── 2. NHÓM GIAO DỊCH + TÂM ĐIỂM QUẢN TRỊ ── */}
        <div className="grid2c">

          {/* Nhóm giao dịch */}
          <div className="ccard">
            <div className="ccard-title">
              <div className="cdot" style={{ background:'#7C3AED' }}/>NHÓM GIAO DỊCH
              <div className="tgl">
                <button className={`tgl-btn${mode==='thu'?' on':''}`} onClick={() => { setMode('thu'); setShowAll(false) }}>Thu</button>
                <button className={`tgl-btn${mode==='chi'?' on':''}`} onClick={() => { setMode('chi'); setShowAll(false) }}>Chi</button>
              </div>
            </div>

            {(() => {
              const active = nhomRanked.filter(g => g.total > 0)
              const LIMIT  = 8
              const show   = showAll ? active : active.slice(0, LIMIT)
              const hidden = active.length - LIMIT

              if (!active.length) return (
                <div style={{ color:'#9CA3AF', fontSize:12, padding:'16px 0', textAlign:'center' }}>
                  Không có dữ liệu trong kỳ
                </div>
              )
              return (
                <>
                  <div style={{ maxHeight: showAll ? 340 : 'none', overflowY: showAll ? 'auto' : 'visible' }}>
                    {show.map((g, i) => {
                      const pct   = grandTotal > 0 ? (g.total / grandTotal * 100).toFixed(1) : '0.0'
                      const color = GROUP_COLORS[i % GROUP_COLORS.length]
                      return (
                        <div className="bar-row" key={g.nhom}>
                          <div className="bar-rank">{i + 1}.</div>
                          <div className="bar-label" title={g.nhom}>{g.nhom}</div>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width:`${(g.total / maxVal) * 100}%`, background:color }}/>
                          </div>
                          <div className="bar-val">{fmt(g.total)} {unitLbl}</div>
                          <div className="bar-pct" style={{ color }}>{pct}%</div>
                        </div>
                      )
                    })}
                  </div>

                  {active.length > LIMIT && (
                    <button onClick={() => setShowAll(v => !v)} style={{
                      display:'block', width:'100%', marginTop:6, padding:'5px 0',
                      background:'none', border:'1px dashed #E0E7F0', borderRadius:6,
                      fontSize:11, color:'#6B7280', cursor:'pointer', fontFamily:'inherit',
                    }}>
                      {showAll ? '▲ Thu gọn' : `▼ Xem thêm ${hidden} nhóm còn lại`}
                    </button>
                  )}
                </>
              )
            })()}

            <div className="bar-total">
              <span>Tổng {mode === 'thu' ? 'Thu' : 'Chi'} ({nhomRanked.filter(g => g.total > 0).length} nhóm)</span>
              <span>{fmt(grandTotal)} {unitLbl}</span>
            </div>
          </div>

          {/* Tâm điểm quản trị */}
          <div className="ccard">
            <div className="ccard-title"><div className="cdot" style={{ background:'#EF4444' }}/>TÂM ĐIỂM QUẢN TRỊ CFO/CEO</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* Burn rate */}
              {(() => {
                const over = chiThuRatio > 100
                return (
                  <div className="focus" style={{ background: over ? '#FFF5F5' : '#F0FDF4', border:`1px solid ${over ? '#FECACA' : '#BBF7D0'}` }}>
                    <div className="focus-ic">{over ? '🚨' : '✅'}</div>
                    <div style={{ flex:1 }}>
                      <div className="focus-title" style={{ color: over ? '#B91C1C' : '#047857' }}>
                        Burn rate: {chiThuRatio.toFixed(1)}%{over ? ' — vượt ngưỡng an toàn 100%' : ''}
                      </div>
                      <div className="focus-body">
                        Thu {fmt(totalThu)} {unitLbl}, Chi {fmt(totalChi)} {unitLbl} →
                        {over ? ' chi vượt thu ' : ' thu vượt chi '}
                        {fmt(Math.abs(totalThu - totalChi))} {unitLbl}
                      </div>
                      <div className="focus-action" style={{ color: over ? '#B91C1C' : '#047857' }}>
                        {over ? '→ Rà soát khoản chi lớn, cắt giảm nhóm tỷ trọng cao nhất.' : '→ Duy trì kỷ luật chi. Dùng thặng dư trả nợ gốc.'}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Nhóm chiếm tỷ trọng cao nhất */}
              {topNhom && topNhom.total > 0 && (
                <div className="focus" style={{ background:'#FFF4E0', border:'1px solid #FDE68A' }}>
                  <div className="focus-ic">⚠️</div>
                  <div style={{ flex:1 }}>
                    <div className="focus-title" style={{ color:'#B45309' }}>
                      &ldquo;{topNhom.nhom}&rdquo; chiếm {topNhomPct.toFixed(1)}% tổng {mode === 'thu' ? 'thu' : 'chi'}
                    </div>
                    <div className="focus-body">
                      {fmt(topNhom.total)} {unitLbl} / {fmt(grandTotal)} {unitLbl}.
                      Tập trung cao — biến động nhóm này ảnh hưởng mạnh đến toàn cơ cấu.
                    </div>
                    <div className="focus-action" style={{ color:'#B45309' }}>
                      → Phân tách chi tiết nhóm này theo đối tượng/khoản mục để kiểm soát rủi ro.
                    </div>
                  </div>
                </div>
              )}

              {/* Biến động đột biến */}
              {topBienDong && (
                <div className="focus" style={{ background:'#FFF4E0', border:'1px solid #FDE68A' }}>
                  <div className="focus-ic">📊</div>
                  <div style={{ flex:1 }}>
                    <div className="focus-title" style={{ color:'#B45309' }}>
                      &ldquo;{topBienDong.nhom}&rdquo;{' '}
                      {topBienDong.pct === Infinity ? 'phát sinh mới' : `biến động ${topBienDong.pct >= 0 ? '+' : ''}${topBienDong.pct.toFixed(0)}%`}
                      {' '}so tháng trước
                    </div>
                    <div className="focus-body">
                      Tháng trước: {fmtS(topBienDong.prev)} {unitLbl} → Tháng này: {fmtS(topBienDong.cur)} {unitLbl}
                    </div>
                    <div className="focus-action" style={{ color:'#B45309' }}>
                      → Kiểm tra nguyên nhân, xác nhận tính hợp lệ giao dịch.
                    </div>
                  </div>
                </div>
              )}

              {/* Xu hướng ròng 3 tháng */}
              <div className="focus" style={{ background: trendDown ? '#FFF5F5' : '#F0FDF4', border:`1px solid ${trendDown ? '#FECACA' : '#BBF7D0'}` }}>
                <div className="focus-ic">{trendDown ? '🔻' : '✅'}</div>
                <div style={{ flex:1 }}>
                  <div className="focus-title" style={{ color: trendDown ? '#B91C1C' : '#047857' }}>
                    Dòng tiền ròng 3 tháng gần: {trendDown ? '▼ Suy giảm liên tiếp' : '▲ Ổn định / cải thiện'}
                  </div>
                  <div className="focus-body">
                    {MONTH_LBL.slice(-3).map((m, i) => `${m} (${(monthlyRong[MONTH_KEYS.length - 3 + i] ?? 0) >= 0 ? '+' : ''}${fmt(monthlyRong[MONTH_KEYS.length - 3 + i] ?? 0)} ${unitLbl})`).join(' → ')}
                  </div>
                  <div className="focus-action" style={{ color: trendDown ? '#B91C1C' : '#047857' }}>
                    {trendDown ? '→ Phân tích nguyên nhân giảm thu/tăng chi. Đặt chỉ tiêu cải thiện tháng tới.' : '→ Duy trì kế hoạch dòng tiền.'}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── 3. DIỄN BIẾN THU-CHI THEO THÁNG + CHỈ SỐ CẢNH BÁO CFO ── */}
        <div className="grid2ec">

          {/* Monthly table */}
          <div className="ccard">
            <div className="ccard-title"><div className="cdot" style={{ background:'#1C3557' }}/>DIỄN BIẾN THU - CHI THEO THÁNG</div>
            <div style={{ overflowX:'auto' }}>
              <table className="ctbl" style={{ tableLayout:'fixed', minWidth:380 }}>
                <colgroup>
                  <col style={{ width:60 }}/><col style={{ width:100 }}/><col style={{ width:100 }}/>
                  <col style={{ width:100 }}/><col style={{ width:70 }}/>
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left' }}>THÁNG</th>
                    <th style={{ color:'#15803D' }}>THU ({unitLbl})</th>
                    <th style={{ color:'#DC2626' }}>CHI ({unitLbl})</th>
                    <th>RÒNG ({unitLbl})</th>
                    <th>CHI/THU</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTH_LBL.map((lbl, i) => {
                    const ratio = monthlyThu[i] > 0 ? monthlyChi[i] / monthlyThu[i] * 100 : 0
                    return (
                      <tr key={lbl} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                        <td style={{ fontWeight:600, color:'#1C3557' }}>{lbl}</td>
                        <td style={{ color:'#15803D', fontWeight:500 }}>{fmt(monthlyThu[i])}</td>
                        <td style={{ color:'#DC2626', fontWeight:500 }}>{fmt(monthlyChi[i])}</td>
                        <td className={monthlyRong[i] >= 0 ? 'pos' : 'neg'}>{(monthlyRong[i] >= 0 ? '+' : '') + fmt(monthlyRong[i])}</td>
                        <td className={ratio > 100 ? 'neg' : 'pos'}>{ratio.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                  <tr className="ctbl-total">
                    <td>Tổng</td>
                    <td style={{ color:'#15803D' }}>{fmt(totalThu)}</td>
                    <td style={{ color:'#DC2626' }}>{fmt(totalChi)}</td>
                    <td className={totalThu - totalChi >= 0 ? 'pos' : 'neg'}>{(totalThu - totalChi >= 0 ? '+' : '') + fmt(totalThu - totalChi)}</td>
                    <td className={chiThuRatio > 100 ? 'neg' : 'pos'}>{chiThuRatio.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* CFO warning indices */}
          <div className="ccard">
            <div className="ccard-title"><div className="cdot" style={{ background:'#D4A64A' }}/>CHỈ SỐ CẢNH BÁO CFO</div>

            <div style={{ fontSize:12, fontWeight:600, color:'#3D3D3D', display:'flex', justifyContent:'space-between' }}>
              <span>Burn rate tổng thể</span>
              <span className={chiThuRatio > 100 ? 'neg' : 'pos'}>{chiThuRatio.toFixed(1)}%</span>
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{ width:`${Math.min(chiThuRatio / 130 * 100, 100)}%`, background: chiThuRatio > 100 ? '#DC2626' : '#15803D' }}/>
            </div>
            <div style={{ fontSize:10, color:'#9CA3AF' }}>
              Ngưỡng an toàn: 100% • {chiThuRatio > 100 ? `vượt ${(chiThuRatio - 100).toFixed(1)}%` : `còn dư ${(100 - chiThuRatio).toFixed(1)}%`}
            </div>

            <div className="sec-lbl">
              TOP BIẾN ĐỘNG {MONTH_LBL.at(-1)} vs {MONTH_LBL.at(-2) ?? '–'}
            </div>
            {bienDong.length === 0
              ? <div style={{ color:'#9CA3AF', fontSize:12 }}>Không đủ dữ liệu để so sánh</div>
              : bienDong.map(b => (
                <div className="ind-row" key={b.nhom}>
                  <span style={{ fontSize:11, color:'#3D3D3D', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160, whiteSpace:'nowrap' }}>{b.nhom}</span>
                  <span className={b.pct === Infinity || b.pct >= 0 ? 'pos' : 'neg'}>
                    {b.pct === Infinity ? '▲ Mới' : `${b.pct >= 0 ? '▲' : '▼'} ${Math.abs(b.pct).toFixed(0)}%`}
                  </span>
                </div>
              ))
            }

            <div className="sec-lbl">PHÂN BỔ {mode === 'thu' ? 'THU' : 'CHI'} TOP 3 NHÓM</div>
            {nhomRanked.slice(0, 3).map((g, i) => (
              <div key={g.nhom} style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
                  <span style={{ color:'#3D3D3D', overflow:'hidden', textOverflow:'ellipsis', maxWidth:150, whiteSpace:'nowrap' }}>{g.nhom}</span>
                  <span style={{ color:'#6B7280', flexShrink:0 }}>{grandTotal > 0 ? (g.total / grandTotal * 100).toFixed(1) : '0.0'}%</span>
                </div>
                <div className="prog-track" style={{ margin:0 }}>
                  <div className="prog-fill" style={{ width:`${grandTotal > 0 ? g.total / grandTotal * 100 : 0}%`, background:GROUP_COLORS[i] }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. HEATMAP NHÓM × THÁNG ── */}
        <div className="ccard" style={{ marginBottom:14 }}>
          <div className="ccard-title">
            <div className="cdot" style={{ background:'#0EA5E9' }}/>
            DIỄN BIẾN {mode === 'thu' ? 'THU' : 'CHI'} THEO NHÓM &amp; THÁNG
            <div className="tgl">
              <button className={`tgl-btn${mode==='thu'?' on':''}`} onClick={() => setMode('thu')}>Thu</button>
              <button className={`tgl-btn${mode==='chi'?' on':''}`} onClick={() => setMode('chi')}>Chi</button>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="ctbl" style={{ tableLayout:'fixed', minWidth: Math.max(360, 140 + MONTH_KEYS.length * 80 + 90 + 52) }}>
              <colgroup>
                <col style={{ width:140 }}/>
                {MONTH_KEYS.map((_, i) => <col key={i} style={{ width:80 }}/>)}
                <col style={{ width:90 }}/><col style={{ width:52 }}/>
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign:'left' }}>NHÓM GIAO DỊCH</th>
                  {MONTH_LBL.map(m => <th key={m}>{m}</th>)}
                  <th>TỔNG</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                {nhomData
                  .filter(g => (mode === 'thu' ? g.thuMonthly : g.chiMonthly).some(v => v > 0))
                  .map(g => {
                    const arr   = mode === 'thu' ? g.thuMonthly : g.chiMonthly
                    const total = arr.reduce((s, v) => s + v, 0)
                    return (
                      <tr key={g.nhom}>
                        <td style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={g.nhom}>{g.nhom}</td>
                        {arr.map((v, i) => (
                          <td key={i} style={{ background:heatBg(v), fontSize:11 }}>
                            {v === 0 ? <span style={{ color:'#D1D5DB' }}>–</span> : fmt(v)}
                          </td>
                        ))}
                        <td style={{ fontWeight:700, fontSize:11 }}>{fmt(total)}</td>
                        <td style={{ color:'#9CA3AF', fontSize:11 }}>{grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                    )
                  })
                }
                <tr className="ctbl-total">
                  <td>Tổng {mode === 'thu' ? 'Thu' : 'Chi'}</td>
                  {MONTH_KEYS.map((_, i) => {
                    const col = nhomData.reduce((s, g) => s + (mode === 'thu' ? g.thuMonthly[i] : g.chiMonthly[i]), 0)
                    return <td key={i} style={{ fontSize:11 }}>{fmt(col)}</td>
                  })}
                  <td style={{ fontSize:11 }}>{fmt(grandTotal)}</td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </>
  )
}
