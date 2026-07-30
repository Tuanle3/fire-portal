import { useMemo } from 'react'
import { ChartConfiguration } from 'chart.js'
import { computeRatios, computeSnapshot, FlatDoc, levelForRatio, Ratios } from '../_lib/compute'
import { pct, periodLabel, ratioStr } from '../_lib/format'
import { ChartCanvas } from '../_lib/ChartCanvas'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  periods: string[]
  snapshotPeriod: string
  donViLabel: string
}

type MetricKind = 'ratio' | 'pct'
interface Metric { key: keyof Ratios; label: string; kind: MetricKind; desc: string }

const GROUPS: { title: string; icon: string; metrics: Metric[] }[] = [
  {
    title: 'Thanh khoản', icon: '💧',
    metrics: [
      { key: 'currentRatio', label: 'Current ratio (TSNH / Nợ NH)', kind: 'ratio', desc: 'Khả năng trả nợ ngắn hạn bằng tài sản ngắn hạn' },
      { key: 'quickRatio', label: 'Quick ratio ((TSNH − Tồn kho) / Nợ NH)', kind: 'ratio', desc: 'Khả năng trả nợ ngắn hạn không tính hàng tồn kho' },
    ],
  },
  {
    title: 'Đòn bẩy tài chính', icon: '⚖',
    metrics: [
      { key: 'debtToEquity', label: 'Nợ phải trả / Vốn CSH', kind: 'ratio', desc: 'Mức độ phụ thuộc vào nợ so với vốn tự có' },
      { key: 'debtToAssets', label: 'Nợ phải trả / Tổng tài sản', kind: 'pct', desc: 'Tỷ trọng tài sản được tài trợ bằng nợ' },
    ],
  },
  {
    title: 'Khả năng trả nợ', icon: '🏦',
    metrics: [
      { key: 'icr', label: 'ICR — (LNTT + Lãi vay) / Lãi vay', kind: 'ratio', desc: 'Khả năng trả lãi vay từ lợi nhuận' },
    ],
  },
  {
    title: 'Sinh lời & hiệu quả', icon: '📈',
    metrics: [
      { key: 'grossMargin', label: 'Biên lợi nhuận gộp', kind: 'pct', desc: 'Lãi gộp / Doanh thu thuần' },
      { key: 'netMargin', label: 'Biên lợi nhuận sau thuế', kind: 'pct', desc: 'LNST / Doanh thu thuần' },
      { key: 'roa', label: 'ROA', kind: 'pct', desc: 'LNST / Tổng tài sản' },
      { key: 'roe', label: 'ROE', kind: 'pct', desc: 'LNST / Vốn chủ sở hữu' },
    ],
  },
]

const GAUGE_MAX: Partial<Record<keyof Ratios, number>> = {
  currentRatio: 3, quickRatio: 2, debtToEquity: 4, debtToAssets: 1, icr: 5,
  grossMargin: 0.6, netMargin: 0.4, roa: 0.3, roe: 0.5,
}

function gaugeFillPct(key: keyof Ratios, value: number): number {
  const max = GAUGE_MAX[key] ?? 1
  return Math.max(2, Math.min(100, (value / max) * 100))
}

export function TabSucKhoeTaiChinh({ docs, donViKey, periods, snapshotPeriod, donViLabel }: Props) {
  const trail = periods.filter(p => p <= snapshotPeriod).slice(-6)
  const trailKey = trail.join(',')
  const trailSnaps = trail.map(p => computeSnapshot(docs, donViKey, p))
  const ratioHistory = trailSnaps.map(s => ({ period: s.period, r: computeRatios(s) }))
  const last = ratioHistory[ratioHistory.length - 1]

  const roeRoaCfg = useMemo<ChartConfiguration>(() => ({
    type: 'line',
    data: {
      labels: trail.map(periodLabel),
      datasets: [
        { label: 'ROE', data: ratioHistory.map(t => t.r.roe * 100), borderColor: '#1C3557', tension: .4, pointRadius: 4, borderWidth: 2 },
        { label: 'ROA', data: ratioHistory.map(t => t.r.roa * 100), borderColor: '#D4A64A', tension: .4, pointRadius: 4, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#F1F4F8' } }, x: { grid: { display: false } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trailKey, donViKey])

  const leverageCfg = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: {
      labels: trail.map(periodLabel),
      datasets: [
        { label: 'Current ratio', data: ratioHistory.map(t => t.r.currentRatio), backgroundColor: '#1C3557', borderRadius: 4 },
        { label: 'Nợ/VCSH', data: ratioHistory.map(t => t.r.debtToEquity), backgroundColor: '#D4A64A', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } },
      scales: { y: { ticks: { callback: v => v + 'x' }, grid: { color: '#F1F4F8' } }, x: { grid: { display: false } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trailKey, donViKey])

  if (!last) return <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Chưa có dữ liệu.</div>

  return (
    <>
      <div className="tc-sub">{donViLabel} · Kỳ {periodLabel(snapshotPeriod)} · Bộ chỉ số tham khảo theo cách ngân hàng thường thẩm định (điều chỉnh được khi có mẫu ngân hàng cụ thể)</div>

      {GROUPS.map(g => (
        <div className="panel" key={g.title}>
          <div className="panel-h"><span>{g.icon} {g.title}</span></div>
          <div className="panel-b" style={{ padding: '4px 20px' }}>
            {g.metrics.map(m => {
              const value = last.r[m.key]
              const level = levelForRatio(m.key, value)
              const display = m.kind === 'pct' ? pct(value) : `${ratioStr(value)} lần`
              return (
                <div className="gauge-row" key={m.key}>
                  <div className="gauge-top">
                    <div>
                      <div className="gauge-name">{m.label}</div>
                      <div className="gauge-desc">{m.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="gauge-val">{display}</div>
                      <span className={`badge badge-${level}`} style={{ marginTop: 3 }}>{level === 'good' ? 'An toàn' : level === 'warn' ? 'Theo dõi' : level === 'bad' ? 'Rủi ro' : '—'}</span>
                    </div>
                  </div>
                  <div className="gauge-track"><div className={`gauge-fill ${level}`} style={{ width: `${gaugeFillPct(m.key, value)}%` }} /></div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="panel">
        <div className="panel-h"><span>📊 Xu hướng tỷ lệ tài chính ({trail.length} kỳ)</span></div>
        <div className="grid2-even" style={{ margin: 0, padding: 16 }}>
          <div className="chart-box" style={{ padding: 0 }}>
            <div className="chart-label">ROE / ROA (%)</div>
            <ChartCanvas config={roeRoaCfg} ariaLabel="Xu hướng ROE và ROA" />
          </div>
          <div className="chart-box" style={{ padding: 0 }}>
            <div className="chart-label">Thanh khoản & Đòn bẩy (lần)</div>
            <ChartCanvas config={leverageCfg} ariaLabel="Xu hướng thanh khoản và đòn bẩy" />
          </div>
        </div>
      </div>
    </>
  )
}
