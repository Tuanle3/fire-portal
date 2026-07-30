import { useMemo } from 'react'
import { ChartConfiguration } from 'chart.js'
import { breakdownByCode, FlatDoc, productPL } from '../_lib/compute'
import { PL_BREAKDOWN_CODES } from '../_lib/masocode'
import { pct } from '../_lib/format'
import { PeriodFilter } from '../_lib/usePeriodFilter'
import { ChartCanvas } from '../_lib/ChartCanvas'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  pf: PeriodFilter
  fmtS: (v: number) => string
  unitLbl: string
}

const PALETTE = ['#1C3557', '#D4A64A', '#16A34A', '#2563EB', '#7C3AED', '#0891B2', '#D97706', '#DC2626']

export function TabSanPham({ docs, donViKey, pf, fmtS, unitLbl }: Props) {
  const products = productPL(docs, donViKey, pf.selectedPeriods)
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalCogs = products.reduce((s, p) => s + p.cogs, 0)
  const totalGP = products.reduce((s, p) => s + p.grossProfit, 0)

  const withMargin = products.map(p => ({ ...p, margin: p.revenue !== 0 ? p.grossProfit / p.revenue : 0 }))
  const topRevenue = [...withMargin].sort((a, b) => b.revenue - a.revenue)[0]
  const topMargin = [...withMargin].filter(p => p.revenue !== 0).sort((a, b) => b.margin - a.margin)[0]
  const worstMargin = [...withMargin].filter(p => p.revenue !== 0).sort((a, b) => a.margin - b.margin)[0]

  const buckets = pf.buckets(pf.mode === 'month' ? 6 : 4)
  const bucketsKey = buckets.map(b => b.label).join(',')
  const perBucketRevenue = buckets.map(b => breakdownByCode(docs, donViKey, b.periods, [PL_BREAKDOWN_CODES.DOANH_THU_SP]))
  const productNames = [...new Set(perBucketRevenue.flat().map(i => i.chiTieu))].slice(0, 8)

  const compareCfg = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: productNames.map((name, ni) => ({
        label: name,
        data: perBucketRevenue.map(list => list.find(i => i.chiTieu === name)?.value ?? 0),
        backgroundColor: PALETTE[ni % PALETTE.length],
        borderRadius: 3,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtS(c.raw as number)} ${unitLbl}` } } },
      scales: { y: { ticks: { callback: v => fmtS(v as number) }, grid: { color: '#F1F4F8' } }, x: { grid: { display: false } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [bucketsKey, donViKey, unitLbl])

  return (
    <>
      <div className="tc-sub">{pf.label} · đơn vị: {unitLbl}</div>

      <div className="grid4">
        <div className="kcard" style={{ '--accent': '#1C3557' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Số dòng sản phẩm</div>
          <div><span className="kcard-v">{products.length}</span></div>
          <div className="kcard-s">Có phát sinh doanh thu/giá vốn trong kỳ</div>
        </div>
        <div className="kcard" style={{ '--accent': '#2563EB' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Doanh thu cao nhất</div>
          <div><span className="kcard-v" style={{ fontSize: 17 }}>{topRevenue?.name ?? '–'}</span></div>
          <div className="kcard-s">{topRevenue ? `${fmtS(topRevenue.revenue)} ${unitLbl} · ${pct(totalRevenue !== 0 ? topRevenue.revenue / totalRevenue : 0)} tổng DT` : '–'}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Biên gộp tốt nhất</div>
          <div><span className="kcard-v" style={{ fontSize: 17 }}>{topMargin?.name ?? '–'}</span></div>
          <div className="kcard-s">{topMargin ? `Biên gộp ${pct(topMargin.margin)}` : '–'}</div>
        </div>
        <div className="kcard" style={{ '--accent': worstMargin && worstMargin.margin < 0.15 ? '#DC2626' : '#D97706' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Sản phẩm cần chú ý</div>
          <div><span className="kcard-v" style={{ fontSize: 17 }}>{worstMargin?.name ?? '–'}</span></div>
          <div className="kcard-s">{worstMargin ? `Biên gộp ${pct(worstMargin.margin)}${worstMargin.margin < 0.15 ? ' — gần điểm hoà vốn' : ''}` : '–'}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><span>📦 Hiệu quả từng dòng sản phẩm</span><span>{pf.label}</span></div>
        <div className="panel-b">
          {withMargin.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Chưa có dữ liệu sản phẩm cho kỳ này</div> : (
            <div className="grid3">
              {withMargin.map((p, i) => {
                const marginColor = p.margin > 0.25 ? '#16A34A' : p.margin > 0.12 ? '#D97706' : '#DC2626'
                return (
                  <div className="product-card" key={p.name} style={{ marginBottom: 0 }}>
                    <div className="product-card-name">
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
                      {p.name}
                    </div>
                    <div className="product-metric"><span className="product-metric-label">Doanh thu</span><span className="product-metric-val">{fmtS(p.revenue)} {unitLbl}</span></div>
                    <div className="product-metric"><span className="product-metric-label">Giá vốn</span><span className="product-metric-val">{fmtS(p.cogs)} {unitLbl}</span></div>
                    <div className="product-metric"><span className="product-metric-label">LN gộp</span><span className="product-metric-val" style={{ color: marginColor }}>{fmtS(p.grossProfit)} {unitLbl}</span></div>
                    <div className="product-metric"><span className="product-metric-label">Biên gộp</span><span className="product-metric-val" style={{ color: marginColor }}>{pct(p.margin)}</span></div>
                    <div className="product-bar"><div className="product-bar-fill" style={{ width: `${Math.min(100, Math.max(0, p.margin * 100 * 2))}%`, background: marginColor }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><span>📊 So sánh doanh thu theo sản phẩm ({buckets.length} kỳ)</span></div>
        <div className="chart-box" style={{ height: 280 }}>
          {productNames.length === 0
            ? <div style={{ color: '#9CA3AF', fontSize: 12.5, textAlign: 'center', paddingTop: 100 }}>Chưa có dữ liệu</div>
            : <ChartCanvas config={compareCfg} height={250} ariaLabel="So sánh doanh thu sản phẩm qua các kỳ" />}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><span>📋 Bảng biên lợi nhuận theo sản phẩm</span></div>
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          <table className="stbl">
            <thead>
              <tr><th className="lbl">Sản phẩm</th><th className="num">Doanh thu</th><th className="num">Giá vốn</th><th className="num">LN gộp</th><th>Biên gộp</th><th>Đóng góp DT</th></tr>
            </thead>
            <tbody>
              {withMargin.map(p => (
                <tr key={p.name}>
                  <td className="lbl">{p.name}</td>
                  <td className="num">{fmtS(p.revenue)}</td>
                  <td className="num">{fmtS(p.cogs)}</td>
                  <td className="num">{fmtS(p.grossProfit)}</td>
                  <td>{pct(p.margin)}</td>
                  <td>{totalRevenue !== 0 ? pct(p.revenue / totalRevenue) : '–'}</td>
                </tr>
              ))}
              {withMargin.length > 0 && (
                <tr className="bold">
                  <td className="lbl">TỔNG CỘNG</td>
                  <td className="num">{fmtS(totalRevenue)}</td>
                  <td className="num">{fmtS(totalCogs)}</td>
                  <td className="num">{fmtS(totalGP)}</td>
                  <td>{totalRevenue !== 0 ? pct(totalGP / totalRevenue) : '–'}</td>
                  <td>100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
