import { computeRatios, levelForRatio, Ratios, Snapshot } from '../_lib/compute'
import { pct, periodLabel, ratioStr } from '../_lib/format'

interface Props {
  history: Snapshot[]
  donViLabel: string
}

type MetricKind = 'ratio' | 'pct'

interface Metric {
  key: keyof Ratios
  label: string
  kind: MetricKind
  desc: string
}

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
      { key: 'debtToAssets', label: 'Nợ phải trả / Tổng tài sản', kind: 'ratio', desc: 'Tỷ trọng tài sản được tài trợ bằng nợ' },
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

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values.map(Math.abs), 1e-9)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
      {values.map((v, i) => (
        <div key={i} title={ratioStr(v)} style={{
          width: 5, borderRadius: 1,
          height: Math.max(2, Math.round((Math.abs(v) / max) * 20)),
          background: v < 0 ? '#DC2626' : '#93C5FD',
        }} />
      ))}
    </div>
  )
}

export function TabSucKhoeTaiChinh({ history, donViLabel }: Props) {
  const ratioHistory = history.map(s => ({ period: s.period, r: computeRatios(s) }))
  const last = ratioHistory[ratioHistory.length - 1]
  const trendWindow = ratioHistory.slice(-6)

  return (
    <>
      <div className="tc-sub">{donViLabel} · Bộ chỉ số tham khảo theo cách ngân hàng thường thẩm định (điều chỉnh được khi có mẫu ngân hàng cụ thể)</div>

      {GROUPS.map(g => (
        <div className="panel" key={g.title}>
          <div className="panel-h"><span>{g.icon} {g.title}</span></div>
          <div className="panel-b">
            <table className="stbl">
              <thead>
                <tr><th className="lbl">Chỉ số</th><th className="num">Hiện tại</th><th>Đánh giá</th><th>Xu hướng {trendWindow.length} kỳ</th></tr>
              </thead>
              <tbody>
                {g.metrics.map(m => {
                  const value = last.r[m.key]
                  const level = levelForRatio(m.key, value)
                  const display = m.kind === 'pct' ? pct(value) : `${ratioStr(value)} lần`
                  const trendVals = trendWindow.map(t => t.r[m.key])
                  return (
                    <tr key={m.key}>
                      <td className="lbl">
                        <div style={{ fontWeight: 600 }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{m.desc}</div>
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>{display}</td>
                      <td><span className={`badge badge-${level}`}>{level === 'good' ? 'An toàn' : level === 'warn' ? 'Theo dõi' : level === 'bad' ? 'Rủi ro' : '—'}</span></td>
                      <td><Sparkline values={trendVals} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
        Kỳ: {trendWindow.map(t => periodLabel(t.period)).join(' · ')}
      </div>
    </>
  )
}
