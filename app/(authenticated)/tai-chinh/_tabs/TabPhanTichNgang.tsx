import { buildLineItemMatrix, FlatDoc, LineItem } from '../_lib/compute'
import { PeriodBucket, PeriodFilter } from '../_lib/usePeriodFilter'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  pf: PeriodFilter
  fmtS: (v: number) => string
  unitLbl: string
}

const BOLD_PL = new Set(['10', '20', '30', '50', '60'])
const BOLD_BS = new Set(['100', '200', '280', '300', '310', '330', '400', '440'])

function bucketValue(item: LineItem, bucket: PeriodBucket): number {
  return bucket.periods.reduce((s, p) => s + (item.values[p] ?? 0), 0)
}

function AnalysisTable({ title, icon, items, buckets, boldSet, fmtS }: {
  title: string; icon: string; items: LineItem[]; buckets: PeriodBucket[]; boldSet: Set<string>; fmtS: (v: number) => string
}) {
  const lastIdx = buckets.length - 1
  const prevIdx = buckets.length - 2
  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">BIẾN ĐỘNG {buckets.length} KỲ</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        {buckets.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Chưa có dữ liệu</div> : (
          <table className="stbl">
            <thead>
              <tr>
                <th>Mã số</th><th className="lbl">Chỉ tiêu</th>
                {buckets.map(b => <th key={b.label} className="num">{b.label}</th>)}
                {prevIdx >= 0 && <th className="num">Δ</th>}
                {prevIdx >= 0 && <th className="num">%Δ</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const isBold = boldSet.has(it.maSo)
                const vals = buckets.map(b => bucketValue(it, b))
                const last = vals[lastIdx] ?? 0
                const prev = prevIdx >= 0 ? (vals[prevIdx] ?? 0) : 0
                const delta = prevIdx >= 0 ? last - prev : null
                const deltaPct = prevIdx >= 0 && prev !== 0 ? (delta! / Math.abs(prev)) * 100 : null
                return (
                  <tr key={it.maSo} className={isBold ? 'bold' : ''}>
                    <td>{it.maSo}</td>
                    <td className="lbl">{it.chiTieu}</td>
                    {vals.map((v, i) => <td key={buckets[i].label} className="num">{fmtS(v)}</td>)}
                    {prevIdx >= 0 && (
                      <td className="num" style={{ color: delta == null ? undefined : delta < 0 ? '#DC2626' : '#16A34A' }}>
                        {delta == null ? '–' : `${delta > 0 ? '+' : ''}${fmtS(delta)}`}
                      </td>
                    )}
                    {prevIdx >= 0 && (
                      <td className="num" style={{ color: deltaPct == null ? '#9CA3AF' : deltaPct < 0 ? '#DC2626' : '#16A34A' }}>
                        {deltaPct == null ? '–' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function TabPhanTichNgang({ docs, donViKey, pf, fmtS, unitLbl }: Props) {
  const buckets = pf.buckets(pf.mode === 'month' ? 6 : 4)
  const flatPeriods = buckets.flatMap(b => b.periods)
  const plItems = buildLineItemMatrix(docs, 'PL', donViKey, flatPeriods)
  const bsItems = buildLineItemMatrix(docs, 'BS', donViKey, flatPeriods)

  return (
    <>
      <div className="tc-sub">So sánh {buckets.length} kỳ liên tiếp gần nhất (đơn vị: {unitLbl}) — Δ tính giữa 2 cột cuối</div>
      <AnalysisTable title="Kết quả kinh doanh — Phân tích ngang" icon="📈" items={plItems} buckets={buckets} boldSet={BOLD_PL} fmtS={fmtS} />
      <AnalysisTable title="Cân đối kế toán — Phân tích ngang" icon="⚖" items={bsItems} buckets={buckets} boldSet={BOLD_BS} fmtS={fmtS} />
    </>
  )
}
