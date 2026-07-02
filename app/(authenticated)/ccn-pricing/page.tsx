'use client'
import { useState, useEffect, useMemo } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
interface Inputs {
  totalAreaHa: number
  leasableAreaHa: number
  occupancyRate: number
  leaseCycleYears: number
  infraInvestTotalBil: number
  compensationCostBil: number
  opexPerYearBil: number
  loanInterestRatePct: number
  constructionYears: number
  targetProfitRatePct: number
  annualMgmtFeeExtra: number
  usdVndRate: number
  oneTimeDiscountRatePct: number
  fdiIncentiveRatePct: number
  annualEscalationRatePct: number
}

interface MarketRow { id: string; name: string; low: number; high: number; note: string }

const DEFAULT_INPUTS: Inputs = {
  totalAreaHa: 39.05,
  leasableAreaHa: 29.53,
  occupancyRate: 80,
  leaseCycleYears: 50,
  infraInvestTotalBil: 379.35,
  compensationCostBil: 69.29,
  opexPerYearBil: 6.47,
  loanInterestRatePct: 7.02,
  constructionYears: 3,
  targetProfitRatePct: 15,
  annualMgmtFeeExtra: 38000,
  usdVndRate: 26000,
  oneTimeDiscountRatePct: 5,
  fdiIncentiveRatePct: 10,
  annualEscalationRatePct: 3,
}

const DEFAULT_MARKET: MarketRow[] = [
  { id: 'm1', name: 'CCN Cẩm Nhượng',        low: 35, high: 55, note: 'Chu kỳ 50 năm' },
  { id: 'm2', name: 'CCN Hưng Trí',          low: 30, high: 50, note: 'Chu kỳ 50 năm' },
  { id: 'm3', name: 'Gần KKT Vũng Áng',      low: 55, high: 80, note: 'Chu kỳ 50 năm' },
  { id: 'm4', name: 'Thạch Hà, Đức Thọ',     low: 40, high: 60, note: 'Chu kỳ 50 năm' },
  { id: 'm5', name: 'H.Sơn, Vũ Quang, H.Khê',low: 20, high: 35, note: 'Chu kỳ 50 năm' },
]

const LS_INPUTS = 'ccn_pricing_inputs_v1'
const LS_MARKET = 'ccn_pricing_market_v1'

const OCC_STEPS = [60, 70, 80, 90, 100]
const PROFIT_STEPS = [10, 15, 20, 25, 30]
const INVEST_DELTAS = [-20, -15, -10, -5, 0, 5, 10, 15, 20]

function fmt0(n: number): string {
  if (!isFinite(n)) return '—'
  return Math.round(n).toLocaleString('vi-VN')
}
function fmtUsd(n: number): string {
  if (!isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function computePrice(input: {
  effAreaM2: number
  totalCostBil: number
  profitRatePct: number
  usdVndRate: number
}): number {
  const profit = input.totalCostBil * input.profitRatePct / 100
  const revenueBil = input.totalCostBil + profit
  if (input.effAreaM2 <= 0) return NaN
  const priceVnd = revenueBil * 1e9 / input.effAreaM2
  return priceVnd / input.usdVndRate
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const saved = localStorage.getItem(key)
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback
  } catch { return fallback }
}

export default function CcnPricingPage() {
  const [inp, setInp] = useState<Inputs>(() => loadFromStorage(LS_INPUTS, DEFAULT_INPUTS))
  const [market, setMarket] = useState<MarketRow[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_MARKET
    try {
      const saved = localStorage.getItem(LS_MARKET)
      return saved ? JSON.parse(saved) : DEFAULT_MARKET
    } catch { return DEFAULT_MARKET }
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => { try { localStorage.setItem(LS_INPUTS, JSON.stringify(inp)) } catch {} }, [inp])
  useEffect(() => { try { localStorage.setItem(LS_MARKET, JSON.stringify(market)) } catch {} }, [market])

  function set<K extends keyof Inputs>(key: K, v: number) {
    setInp(prev => ({ ...prev, [key]: isNaN(v) ? 0 : v }))
  }
  function resetDefaults() { setInp(DEFAULT_INPUTS); setMarket(DEFAULT_MARKET) }

  // ── Core calculation ────────────────────────────────────────────────────
  const r = useMemo(() => {
    const infraCostExGPMB = inp.infraInvestTotalBil - inp.compensationCostBil
    // Assumption: average outstanding balance during construction ≈ 50% of total capital
    const constructionInterestBil = inp.infraInvestTotalBil * inp.loanInterestRatePct / 100 * inp.constructionYears * 0.5
    const totalActualCostBil = inp.infraInvestTotalBil + constructionInterestBil
    const targetProfitBil = totalActualCostBil * inp.targetProfitRatePct / 100
    const totalRevenueRequiredBil = totalActualCostBil + targetProfitBil

    const totalAreaM2 = inp.totalAreaHa * 10000
    const leasableAreaM2 = inp.leasableAreaHa * 10000
    const effAreaM2 = leasableAreaM2 * inp.occupancyRate / 100

    const unitOneTimeBeforeVnd = effAreaM2 > 0 ? totalRevenueRequiredBil * 1e9 / effAreaM2 : NaN
    const unitOneTimeBeforeUsd = unitOneTimeBeforeVnd / inp.usdVndRate
    const unitOneTimeAfterDiscVnd = unitOneTimeBeforeVnd * (1 - inp.oneTimeDiscountRatePct / 100)
    const unitOneTimeAfterDiscUsd = unitOneTimeAfterDiscVnd / inp.usdVndRate
    const unitFdiVnd = unitOneTimeBeforeVnd * (1 - inp.fdiIncentiveRatePct / 100)
    const unitFdiUsd = unitFdiVnd / inp.usdVndRate

    const denomAnnual = effAreaM2 * inp.leaseCycleYears
    const unitAnnualVnd = denomAnnual > 0 ? totalRevenueRequiredBil * 1e9 / denomAnnual : NaN
    const unitAnnualUsd = unitAnnualVnd / inp.usdVndRate
    const unitAnnualAfterDiscVnd = unitAnnualVnd * (1 - inp.oneTimeDiscountRatePct / 100)
    const unitAnnualAfterDiscUsd = unitAnnualAfterDiscVnd / inp.usdVndRate

    const mgmtFeePerM2PerYearVnd = leasableAreaM2 > 0 ? inp.opexPerYearBil * 1e9 / leasableAreaM2 : NaN
    const mgmtFeePerM2PerYearUsd = mgmtFeePerM2PerYearVnd / inp.usdVndRate
    const mgmtFeeExtraUsd = inp.annualMgmtFeeExtra / inp.usdVndRate

    // Escalation: giá thuê hàng năm tăng dần theo % trượt giá, chiếu tới năm cuối chu kỳ
    const escalatedFinalYearVnd = unitAnnualAfterDiscVnd * Math.pow(1 + inp.annualEscalationRatePct / 100, Math.max(inp.leaseCycleYears - 1, 0))
    const escalatedFinalYearUsd = escalatedFinalYearVnd / inp.usdVndRate

    return {
      infraCostExGPMB, constructionInterestBil, totalActualCostBil, targetProfitBil, totalRevenueRequiredBil,
      totalAreaM2, leasableAreaM2, effAreaM2,
      unitOneTimeBeforeVnd, unitOneTimeBeforeUsd, unitOneTimeAfterDiscVnd, unitOneTimeAfterDiscUsd,
      unitFdiVnd, unitFdiUsd, unitAnnualVnd, unitAnnualUsd, unitAnnualAfterDiscVnd, unitAnnualAfterDiscUsd,
      mgmtFeePerM2PerYearVnd, mgmtFeePerM2PerYearUsd, mgmtFeeExtraUsd,
      escalatedFinalYearVnd, escalatedFinalYearUsd,
    }
  }, [inp])

  // ── Sensitivity table 1: occupancy × target profit ─────────────────────
  const table1 = useMemo(() => {
    const constructionInterestBil = inp.infraInvestTotalBil * inp.loanInterestRatePct / 100 * inp.constructionYears * 0.5
    const totalCostBil = inp.infraInvestTotalBil + constructionInterestBil
    const leasableAreaM2 = inp.leasableAreaHa * 10000
    return PROFIT_STEPS.map(pr => ({
      profit: pr,
      cells: OCC_STEPS.map(occ => {
        const effAreaM2 = leasableAreaM2 * occ / 100
        return computePrice({ effAreaM2, totalCostBil, profitRatePct: pr, usdVndRate: inp.usdVndRate })
      }),
    }))
  }, [inp])

  // ── Sensitivity table 2: total investment × occupancy ──────────────────
  const table2 = useMemo(() => {
    const leasableAreaM2 = inp.leasableAreaHa * 10000
    return INVEST_DELTAS.map(delta => {
      const investBil = inp.infraInvestTotalBil * (1 + delta / 100)
      const constructionInterestBil = investBil * inp.loanInterestRatePct / 100 * inp.constructionYears * 0.5
      const totalCostBil = investBil + constructionInterestBil
      return {
        delta, investBil,
        cells: OCC_STEPS.map(occ => {
          const effAreaM2 = leasableAreaM2 * occ / 100
          return computePrice({ effAreaM2, totalCostBil, profitRatePct: inp.targetProfitRatePct, usdVndRate: inp.usdVndRate })
        }),
      }
    })
  }, [inp])

  // ── Verdict vs. market ───────────────────────────────────────────────────
  const verdict = useMemo(() => {
    if (market.length === 0) return null
    const minLow = Math.min(...market.map(m => m.low))
    const maxHigh = Math.max(...market.map(m => m.high))
    const price = r.unitOneTimeAfterDiscUsd
    if (!isFinite(price)) return null
    if (price > maxHigh) {
      return { level: 'critical' as const, minLow, maxHigh, price,
        text: `Giá đề xuất CAO HƠN vùng giá thị trường ($${fmtUsd(maxHigh)}) — cần giảm chi phí đầu tư, tăng tỷ lệ lấp đầy hoặc giảm lợi nhuận mục tiêu trước khi quyết định.` }
    }
    if (price < minLow) {
      return { level: 'safe' as const, minLow, maxHigh, price,
        text: `Giá đề xuất THẤP HƠN vùng giá thị trường ($${fmtUsd(minLow)}) — còn dư địa tăng giá thuê hoặc lợi nhuận mục tiêu.` }
    }
    return { level: 'safe' as const, minLow, maxHigh, price,
      text: `Giá đề xuất nằm TRONG vùng giá thị trường ($${fmtUsd(minLow)} – $${fmtUsd(maxHigh)}) — khả thi để đầu tư.` }
  }, [r, market])

  function addMarketRow() {
    setMarket(prev => [...prev, { id: `m${Date.now()}`, name: 'Dự án mới', low: 30, high: 50, note: '' }])
  }
  function updateMarketRow(id: string, patch: Partial<MarketRow>) {
    setMarket(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row))
  }
  function removeMarketRow(id: string) {
    setMarket(prev => prev.filter(row => row.id !== id))
  }

  function copySummary() {
    const lines = [
      `TÍNH GIÁ CHO THUÊ CCN`,
      `Diện tích cho thuê hiệu dụng: ${fmt0(r.effAreaM2)} m²`,
      `Tổng chi phí thực tế: ${inp.infraInvestTotalBil.toFixed(2)} tỷ + lãi vay XD ${r.constructionInterestBil.toFixed(2)} tỷ = ${r.totalActualCostBil.toFixed(2)} tỷ`,
      `Tổng doanh thu cần thu về: ${r.totalRevenueRequiredBil.toFixed(2)} tỷ`,
      ``,
      `Đơn giá thu 1 lần (trước ưu đãi): ${fmt0(r.unitOneTimeBeforeVnd)} đ/m² · $${fmtUsd(r.unitOneTimeBeforeUsd)}/m²`,
      `Đơn giá thu 1 lần (sau chiết khấu ${inp.oneTimeDiscountRatePct}%): ${fmt0(r.unitOneTimeAfterDiscVnd)} đ/m² · $${fmtUsd(r.unitOneTimeAfterDiscUsd)}/m²`,
      `Đơn giá ưu đãi FDI (giảm ${inp.fdiIncentiveRatePct}%): ${fmt0(r.unitFdiVnd)} đ/m² · $${fmtUsd(r.unitFdiUsd)}/m²`,
      `Đơn giá thu hàng năm: ${fmt0(r.unitAnnualVnd)} đ/m²/năm · $${fmtUsd(r.unitAnnualUsd)}/m²/năm`,
      verdict ? `\nKết luận: ${verdict.text}` : '',
    ].join('\n')
    navigator.clipboard?.writeText(lines).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
  }

  return (
    <>
      <style>{`
        .ccn-wrap { font-family:'Be Vietnam Pro',sans-serif; font-size:13px; color:var(--txt); padding:16px; max-width:1100px; margin:0 auto; }
        .ccn-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .ccn-title { font-size:18px; font-weight:800; color:var(--navy); }
        .ccn-sub { font-size:11.5px; color:var(--muted); margin-top:2px; }
        .ccn-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .ccn-btn { border-radius:8px; padding:7px 12px; font-size:11.5px; font-weight:700; cursor:pointer; font-family:inherit; border:1px solid var(--border2); background:#fff; color:var(--txt2); }
        .ccn-btn:hover { border-color:var(--navy); background:var(--surf2); }
        .ccn-btn.gold { background:var(--gold); border-color:var(--gold); color:var(--navy-dark); }
        .ccn-btn.gold:hover { background:var(--gold2); }

        /* ── verdict banner ─────────────────────────── */
        .ccn-verdict { border-radius:14px; padding:16px 18px; margin-bottom:14px; box-shadow:var(--sh); }
        .ccn-verdict.safe     { background:var(--status-safe-bg);     border:1px solid var(--status-safe-border); }
        .ccn-verdict.critical { background:var(--status-critical-bg); border:1px solid var(--status-critical-border); }
        .ccn-verdict-row { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
        .ccn-verdict-price { font-size:30px; font-weight:800; font-family:'Roboto Mono',monospace; line-height:1; }
        .ccn-verdict.safe .ccn-verdict-price     { color:var(--status-safe-text); }
        .ccn-verdict.critical .ccn-verdict-price { color:var(--status-critical-text); }
        .ccn-verdict-unit { font-size:11px; font-weight:600; color:var(--muted); margin-top:3px; }
        .ccn-verdict-badge { font-size:11px; font-weight:800; padding:5px 12px; border-radius:20px; white-space:nowrap; }
        .ccn-verdict.safe .ccn-verdict-badge     { background:var(--status-safe-text);     color:#fff; }
        .ccn-verdict.critical .ccn-verdict-badge { background:var(--status-critical-text); color:#fff; }
        .ccn-verdict-text { font-size:12px; margin-top:8px; line-height:1.5; }
        .ccn-verdict.safe .ccn-verdict-text     { color:var(--status-safe-text); }
        .ccn-verdict.critical .ccn-verdict-text { color:var(--status-critical-text); }

        /* ── quick KPI row ──────────────────────────── */
        .ccn-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
        .ccn-kpi { background:#fff; border:1px solid var(--border3); border-radius:10px; padding:10px 12px; box-shadow:var(--sh); }
        .ccn-kpi-label { font-size:9.5px; font-weight:700; letter-spacing:.06em; color:var(--muted); text-transform:uppercase; margin-bottom:4px; }
        .ccn-kpi-val { font-size:15px; font-weight:800; font-family:'Roboto Mono',monospace; color:var(--navy); }
        .ccn-kpi-sub { font-size:10px; color:var(--muted2); margin-top:2px; }

        /* ── accordion sections ─────────────────────── */
        .ccn-acc { background:#fff; border:1px solid var(--border3); border-radius:12px; margin-bottom:10px; overflow:hidden; box-shadow:var(--sh); }
        .ccn-acc > summary { list-style:none; cursor:pointer; padding:12px 16px; font-size:12.5px; font-weight:700; color:var(--navy); background:var(--surf2); display:flex; align-items:center; justify-content:space-between; }
        .ccn-acc > summary::-webkit-details-marker { display:none; }
        .ccn-acc > summary::after { content:'▾'; color:var(--muted); transition:transform .15s; }
        .ccn-acc[open] > summary::after { transform:rotate(180deg); }
        .ccn-acc-body { padding:14px 16px; }

        .ccn-field-grid { display:grid; grid-template-columns:1fr; gap:10px; }
        @media(min-width:640px) { .ccn-field-grid { grid-template-columns:1fr 1fr; } }
        .ccn-field { display:flex; flex-direction:column; gap:4px; }
        .ccn-field label { font-size:11px; font-weight:600; color:var(--txt2); }
        .ccn-field-input { display:flex; align-items:center; border:1px solid var(--border2); border-radius:8px; overflow:hidden; background:#fff; }
        .ccn-field-input input { flex:1; min-width:0; border:none; outline:none; padding:9px 10px; font-size:14px; font-family:'Roboto Mono',monospace; color:var(--txt); background:transparent; }
        .ccn-field-input .unit { padding:0 10px; font-size:10.5px; font-weight:700; color:var(--muted); background:var(--surf2); align-self:stretch; display:flex; align-items:center; white-space:nowrap; }
        .ccn-field-input:focus-within { border-color:var(--navy2); }

        /* ── result cards ───────────────────────────── */
        .ccn-sc-title { font-size:10.5px; font-weight:700; letter-spacing:.07em; color:#4B6A8A; text-transform:uppercase; margin-bottom:10px; }
        .ccn-result-row { display:flex; align-items:baseline; justify-content:space-between; padding:7px 0; border-bottom:1px dashed var(--border); gap:10px; }
        .ccn-result-row:last-child { border-bottom:none; }
        .ccn-result-label { font-size:12px; color:var(--txt2); }
        .ccn-result-val { font-size:13px; font-weight:700; color:var(--navy); font-family:'Roboto Mono',monospace; text-align:right; white-space:nowrap; }
        .ccn-result-val .usd { display:block; font-size:11px; font-weight:600; color:var(--gold2); }
        .ccn-result-val.strong { font-size:15px; color:var(--navy-dark); }

        /* ── sensitivity tables ─────────────────────── */
        .ccn-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--border3); border-radius:10px; }
        table.ccn-table { border-collapse:collapse; width:100%; min-width:420px; font-size:11.5px; }
        table.ccn-table th, table.ccn-table td { padding:7px 9px; text-align:center; white-space:nowrap; border-bottom:1px solid var(--border); }
        table.ccn-table thead th { background:var(--surf2); color:#4B6A8A; font-weight:700; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; }
        table.ccn-table td:first-child, table.ccn-table th:first-child { position:sticky; left:0; background:var(--surf2); font-weight:700; color:var(--navy); z-index:1; }
        table.ccn-table td.hit { background:var(--gold); color:var(--navy-dark); font-weight:800; border-radius:4px; }
        .ccn-table-note { font-size:10.5px; color:var(--muted); padding:8px 10px; }

        /* ── market comparison ──────────────────────── */
        .ccn-market-row { display:grid; grid-template-columns:1fr auto auto auto; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid var(--border); }
        .ccn-market-row input[type=text] { border:1px solid var(--border2); border-radius:6px; padding:6px 8px; font-size:12px; font-family:inherit; width:100%; }
        .ccn-market-row input[type=number] { border:1px solid var(--border2); border-radius:6px; padding:6px 6px; font-size:12px; font-family:'Roboto Mono',monospace; width:56px; text-align:center; }
        .ccn-market-del { background:none; border:none; color:var(--status-critical-text); font-size:16px; cursor:pointer; padding:2px 6px; }
        .ccn-market-bar-wrap { position:relative; height:8px; background:var(--surf2); border-radius:4px; margin-top:4px; }
        .ccn-market-bar { position:absolute; top:0; bottom:0; background:var(--navy3); border-radius:4px; }
        .ccn-market-marker { position:absolute; top:-3px; width:2px; height:14px; background:var(--status-critical-text); }

        .ccn-note { font-size:10.5px; color:var(--muted2); font-style:italic; margin-top:8px; line-height:1.5; }

        @media(max-width:640px) {
          .ccn-wrap { padding:10px; }
          .ccn-kpi-row { grid-template-columns:1fr 1fr; }
          .ccn-verdict-price { font-size:24px; }
          .ccn-actions { width:100%; }
          .ccn-actions .ccn-btn { flex:1; }
          .ccn-market-row { grid-template-columns:1fr; }
          .ccn-market-row .ccn-market-nums { display:flex; gap:8px; align-items:center; }
        }
      `}</style>

      <div className="ccn-wrap">
        <div className="ccn-head">
          <div>
            <div className="ccn-title">🏭 Tính giá cho thuê CCN</div>
            <div className="ccn-sub">Nhập số liệu đầu vào → xem ngay giá đề xuất & độ nhạy để quyết định đầu tư</div>
          </div>
          <div className="ccn-actions">
            <button className="ccn-btn" onClick={resetDefaults}>↺ Mặc định</button>
            <button className="ccn-btn gold" onClick={copySummary}>{copied ? '✓ Đã copy' : '📋 Copy kết quả'}</button>
          </div>
        </div>

        {/* ── Verdict banner ─────────────────────────────────────── */}
        {verdict && (
          <div className={`ccn-verdict ${verdict.level}`}>
            <div className="ccn-verdict-row">
              <div>
                <div className="ccn-verdict-price">${fmtUsd(r.unitOneTimeAfterDiscUsd)}<span style={{ fontSize: 14, fontWeight: 700 }}>/m²</span></div>
                <div className="ccn-verdict-unit">Giá đề xuất (thu 1 lần, sau chiết khấu {inp.oneTimeDiscountRatePct}%) · chu kỳ {inp.leaseCycleYears} năm</div>
              </div>
              <div className="ccn-verdict-badge">{verdict.level === 'critical' ? '⚠ CẦN XEM LẠI' : '✓ KHẢ THI'}</div>
            </div>
            <div className="ccn-verdict-text">{verdict.text}</div>
          </div>
        )}

        {/* ── Quick KPI row ──────────────────────────────────────── */}
        <div className="ccn-kpi-row">
          <div className="ccn-kpi">
            <div className="ccn-kpi-label">Diện tích hiệu dụng</div>
            <div className="ccn-kpi-val">{fmt0(r.effAreaM2)} m²</div>
            <div className="ccn-kpi-sub">lấp đầy {inp.occupancyRate}%</div>
          </div>
          <div className="ccn-kpi">
            <div className="ccn-kpi-label">Tổng chi phí thực tế</div>
            <div className="ccn-kpi-val">{r.totalActualCostBil.toFixed(1)} tỷ</div>
            <div className="ccn-kpi-sub">gồm lãi vay XD {r.constructionInterestBil.toFixed(1)} tỷ</div>
          </div>
          <div className="ccn-kpi">
            <div className="ccn-kpi-label">Doanh thu cần thu</div>
            <div className="ccn-kpi-val">{r.totalRevenueRequiredBil.toFixed(1)} tỷ</div>
            <div className="ccn-kpi-sub">LN mục tiêu {inp.targetProfitRatePct}%</div>
          </div>
          <div className="ccn-kpi">
            <div className="ccn-kpi-label">Giá thu hàng năm</div>
            <div className="ccn-kpi-val">${fmtUsd(r.unitAnnualAfterDiscUsd)}</div>
            <div className="ccn-kpi-sub">USD/m²/năm</div>
          </div>
        </div>

        {/* ── Inputs A ───────────────────────────────────────────── */}
        <details className="ccn-acc" open>
          <summary>A. Quy mô dự án CCN</summary>
          <div className="ccn-acc-body">
            <div className="ccn-field-grid">
              <Field label="Tổng diện tích cụm công nghiệp" unit="ha" value={inp.totalAreaHa} onChange={v => set('totalAreaHa', v)} />
              <Field label="Diện tích đất công nghiệp cho thuê" unit="ha" value={inp.leasableAreaHa} onChange={v => set('leasableAreaHa', v)} />
              <Field label="Tỷ lệ lấp đầy kỳ vọng" unit="%" value={inp.occupancyRate} onChange={v => set('occupancyRate', v)} />
              <Field label="Chu kỳ cho thuê" unit="năm" value={inp.leaseCycleYears} onChange={v => set('leaseCycleYears', v)} />
            </div>
          </div>
        </details>

        <details className="ccn-acc">
          <summary>B. Chi phí đầu tư</summary>
          <div className="ccn-acc-body">
            <div className="ccn-field-grid">
              <Field label="Tổng vốn đầu tư hạ tầng CCN (gồm GPMB)" unit="tỷ đồng" value={inp.infraInvestTotalBil} onChange={v => set('infraInvestTotalBil', v)} />
              <Field label="Chi phí đền bù GPMB" unit="tỷ đồng" value={inp.compensationCostBil} onChange={v => set('compensationCostBil', v)} />
              <Field label="Chi phí quản lý & vận hành / năm" unit="tỷ đồng" value={inp.opexPerYearBil} onChange={v => set('opexPerYearBil', v)} />
              <Field label="Lãi vay vốn đầu tư" unit="%/năm" value={inp.loanInterestRatePct} onChange={v => set('loanInterestRatePct', v)} />
              <Field label="Thời gian xây dựng trước khi cho thuê" unit="năm" value={inp.constructionYears} onChange={v => set('constructionYears', v)} />
            </div>
            <div className="ccn-note">* Lãi vay trong thời gian xây dựng ước tính trên dư nợ bình quân = 50% tổng vốn đầu tư × lãi suất × số năm xây dựng.</div>
          </div>
        </details>

        <details className="ccn-acc">
          <summary>C. Mục tiêu lợi nhuận</summary>
          <div className="ccn-acc-body">
            <div className="ccn-field-grid">
              <Field label="Tỷ suất lợi nhuận mục tiêu" unit="%/TP" value={inp.targetProfitRatePct} onChange={v => set('targetProfitRatePct', v)} />
              <Field label="Phí quản lý hàng năm tính thêm" unit="đ/m²/năm" value={inp.annualMgmtFeeExtra} onChange={v => set('annualMgmtFeeExtra', v)} />
              <Field label="Tỷ giá USD/VND" unit="đ/USD" value={inp.usdVndRate} onChange={v => set('usdVndRate', v)} />
            </div>
          </div>
        </details>

        <details className="ccn-acc">
          <summary>D. Chiết khấu và ưu đãi</summary>
          <div className="ccn-acc-body">
            <div className="ccn-field-grid">
              <Field label="Chiết khấu khách thuê trả 1 lần" unit="%" value={inp.oneTimeDiscountRatePct} onChange={v => set('oneTimeDiscountRatePct', v)} />
              <Field label="Ưu đãi khách hàng đặc biệt (FDI lớn)" unit="%" value={inp.fdiIncentiveRatePct} onChange={v => set('fdiIncentiveRatePct', v)} />
              <Field label="Tăng giá thuê hàng năm (escalation)" unit="%/năm" value={inp.annualEscalationRatePct} onChange={v => set('annualEscalationRatePct', v)} />
            </div>
          </div>
        </details>

        {/* ── Results ────────────────────────────────────────────── */}
        <details className="ccn-acc" open>
          <summary>Kết quả định giá cho thuê</summary>
          <div className="ccn-acc-body">
            <div className="ccn-sc-title">I. Xác định chi phí thực tế</div>
            <Row label="Chi phí đền bù GPMB" val={`${fmt0(inp.compensationCostBil * 1e9)} đ`} />
            <Row label="Chi phí đầu tư hạ tầng (không gồm GPMB)" val={`${fmt0(r.infraCostExGPMB * 1e9)} đ`} />
            <Row label="Lãi vay trong thời gian xây dựng" val={`${fmt0(r.constructionInterestBil * 1e9)} đ`} />
            <Row label="Tổng chi phí thực tế" val={`${fmt0(r.totalActualCostBil * 1e9)} đ`} strong />
            <Row label={`Lợi nhuận mục tiêu (${inp.targetProfitRatePct}%)`} val={`${fmt0(r.targetProfitBil * 1e9)} đ`} />
            <Row label="Tổng doanh thu cần thu về" val={`${fmt0(r.totalRevenueRequiredBil * 1e9)} đ`} strong />

            <div className="ccn-sc-title" style={{ marginTop: 16 }}>II. Diện tích tính giá</div>
            <Row label="Tổng diện tích cụm công nghiệp" val={`${fmt0(r.totalAreaM2)} m²`} />
            <Row label="Diện tích đất cho thuê" val={`${fmt0(r.leasableAreaM2)} m²`} />
            <Row label="Diện tích thực tế phát sinh doanh thu" val={`${fmt0(r.effAreaM2)} m²`} strong />

            <div className="ccn-sc-title" style={{ marginTop: 16 }}>III. Đơn giá đề xuất (thu tiền 1 lần)</div>
            <Row label="Đơn giá trước ưu đãi" val={`${fmt0(r.unitOneTimeBeforeVnd)} đ/m²/chu kỳ`} usd={`$${fmtUsd(r.unitOneTimeBeforeUsd)}/m²`} />
            <Row label={`Đơn giá sau chiết khấu ${inp.oneTimeDiscountRatePct}%`} val={`${fmt0(r.unitOneTimeAfterDiscVnd)} đ/m²/chu kỳ`} usd={`$${fmtUsd(r.unitOneTimeAfterDiscUsd)}/m²`} strong />
            <Row label={`Đơn giá ưu đãi FDI (giảm ${inp.fdiIncentiveRatePct}%)`} val={`${fmt0(r.unitFdiVnd)} đ/m²/chu kỳ`} usd={`$${fmtUsd(r.unitFdiUsd)}/m²`} />

            <div className="ccn-sc-title" style={{ marginTop: 16 }}>IV. Đơn giá đề xuất (thu tiền hàng năm)</div>
            <Row label="Đơn giá hằng năm (chia đều)" val={`${fmt0(r.unitAnnualVnd)} đ/m²/năm`} usd={`$${fmtUsd(r.unitAnnualUsd)}/m²/năm`} />
            <Row label={`Đơn giá hằng năm sau chiết khấu ${inp.oneTimeDiscountRatePct}%`} val={`${fmt0(r.unitAnnualAfterDiscVnd)} đ/m²/năm`} usd={`$${fmtUsd(r.unitAnnualAfterDiscUsd)}/m²/năm`} strong />
            <Row label={`Giá thuê năm cuối chu kỳ (trượt giá ${inp.annualEscalationRatePct}%/năm)`} val={`${fmt0(r.escalatedFinalYearVnd)} đ/m²/năm`} usd={`$${fmtUsd(r.escalatedFinalYearUsd)}/m²/năm`} />

            <div className="ccn-sc-title" style={{ marginTop: 16 }}>V. Phí quản lý hàng năm</div>
            <Row label="Chi phí vận hành / năm" val={`${fmt0(inp.opexPerYearBil * 1e9)} đ/năm`} />
            <Row label="Phí quản lý / m² / năm (từ chi phí vận hành)" val={`${fmt0(r.mgmtFeePerM2PerYearVnd)} đ/m²/năm`} usd={`$${fmtUsd(r.mgmtFeePerM2PerYearUsd)}/m²/năm`} />
            <Row label="Phí quản lý tính thêm (nhập tay)" val={`${fmt0(inp.annualMgmtFeeExtra)} đ/m²/năm`} usd={`$${fmtUsd(r.mgmtFeeExtraUsd)}/m²/năm`} />
          </div>
        </details>

        {/* ── Sensitivity 1 ──────────────────────────────────────── */}
        <details className="ccn-acc">
          <summary>Phân tích độ nhạy 1 · Lấp đầy × Lợi nhuận mục tiêu</summary>
          <div className="ccn-acc-body">
            <div className="ccn-table-wrap">
              <table className="ccn-table">
                <thead>
                  <tr>
                    <th>LN mục tiêu ＼ Lấp đầy</th>
                    {OCC_STEPS.map(o => <th key={o}>{o}%</th>)}
                  </tr>
                </thead>
                <tbody>
                  {table1.map(row => (
                    <tr key={row.profit}>
                      <td>{row.profit}%</td>
                      {row.cells.map((v, i) => {
                        const hit = row.profit === inp.targetProfitRatePct && OCC_STEPS[i] === inp.occupancyRate
                        return <td key={i} className={hit ? 'hit' : ''}>${fmtUsd(v)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ccn-table-note">Đơn giá USD/m²/chu kỳ (trước chiết khấu). Ô vàng = kịch bản hiện tại đang nhập.</div>
          </div>
        </details>

        {/* ── Sensitivity 2 ──────────────────────────────────────── */}
        <details className="ccn-acc">
          <summary>Phân tích độ nhạy 2 · Tổng vốn đầu tư × Lấp đầy</summary>
          <div className="ccn-acc-body">
            <div className="ccn-table-wrap">
              <table className="ccn-table">
                <thead>
                  <tr>
                    <th>Vốn đầu tư ＼ Lấp đầy</th>
                    {OCC_STEPS.map(o => <th key={o}>{o}%</th>)}
                  </tr>
                </thead>
                <tbody>
                  {table2.map(row => (
                    <tr key={row.delta}>
                      <td>{row.investBil.toFixed(0)} tỷ<br /><span style={{ fontWeight: 400, fontSize: 9.5 }}>({row.delta > 0 ? '+' : ''}{row.delta}%)</span></td>
                      {row.cells.map((v, i) => {
                        const hit = row.delta === 0 && OCC_STEPS[i] === inp.occupancyRate
                        return <td key={i} className={hit ? 'hit' : ''}>${fmtUsd(v)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ccn-table-note">Đơn giá USD/m²/chu kỳ (trước chiết khấu), tại lợi nhuận mục tiêu hiện tại ({inp.targetProfitRatePct}%). Ô vàng = kịch bản gốc.</div>
          </div>
        </details>

        {/* ── Market comparison ─────────────────────────────────── */}
        <details className="ccn-acc" open>
          <summary>Bảng 3 · So sánh với đơn giá thị trường</summary>
          <div className="ccn-acc-body">
            {market.map(row => {
              const maxScale = Math.max(...market.map(m => m.high), r.unitOneTimeAfterDiscUsd || 0) * 1.1 || 1
              const barLeft = row.low / maxScale * 100
              const barWidth = (row.high - row.low) / maxScale * 100
              const markerLeft = isFinite(r.unitOneTimeAfterDiscUsd) ? Math.min(r.unitOneTimeAfterDiscUsd / maxScale * 100, 100) : null
              return (
                <div key={row.id} style={{ marginBottom: 12 }}>
                  <div className="ccn-market-row">
                    <input type="text" value={row.name} onChange={e => updateMarketRow(row.id, { name: e.target.value })} />
                    <div className="ccn-market-nums">
                      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>$</span>
                      <input type="number" value={row.low} onChange={e => updateMarketRow(row.id, { low: Number(e.target.value) })} />
                      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>–</span>
                      <input type="number" value={row.high} onChange={e => updateMarketRow(row.id, { high: Number(e.target.value) })} />
                    </div>
                    <button className="ccn-market-del" onClick={() => removeMarketRow(row.id)} aria-label="Xóa">✕</button>
                  </div>
                  <div className="ccn-market-bar-wrap">
                    <div className="ccn-market-bar" style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />
                    {markerLeft !== null && <div className="ccn-market-marker" style={{ left: `${markerLeft}%` }} />}
                  </div>
                </div>
              )
            })}
            <button className="ccn-btn" onClick={addMarketRow}>+ Thêm dự án so sánh</button>
            <div className="ccn-note">Vạch đỏ trên thanh so sánh = giá đề xuất hiện tại của dự án bạn (${fmtUsd(r.unitOneTimeAfterDiscUsd)}/m²).</div>
          </div>
        </details>
      </div>
    </>
  )
}

// ── Small components ─────────────────────────────────────────────────────────
function Field({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="ccn-field">
      <label>{label}</label>
      <div className="ccn-field-input">
        <input type="number" inputMode="decimal" value={value} onChange={e => onChange(parseFloat(e.target.value))} />
        <span className="unit">{unit}</span>
      </div>
    </div>
  )
}

function Row({ label, val, usd, strong }: { label: string; val: string; usd?: string; strong?: boolean }) {
  return (
    <div className="ccn-result-row">
      <div className="ccn-result-label">{label}</div>
      <div className={`ccn-result-val${strong ? ' strong' : ''}`}>
        {val}
        {usd && <span className="usd">{usd}</span>}
      </div>
    </div>
  )
}
