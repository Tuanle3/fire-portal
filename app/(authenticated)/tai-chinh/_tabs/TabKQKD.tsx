import { buildLineItemMatrix, FlatDoc } from '../_lib/compute'
import { periodLabel } from '../_lib/format'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  periods: string[]
  fmtS: (v: number) => string
  unitLbl: string
}

const BOLD_MASO = new Set(['10', '20', '30', '50', '60'])

export function TabKQKD({ docs, donViKey, periods, fmtS, unitLbl }: Props) {
  const cols = periods.slice(-6)
  const items = buildLineItemMatrix(docs, 'PL', donViKey, cols)
  const lastIdx = cols.length - 1
  const prevIdx = cols.length - 2

  return (
    <div className="panel">
      <div className="panel-h"><span>📈 Kết quả kinh doanh theo mã số (đơn vị: {unitLbl})</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="stbl">
          <thead>
            <tr>
              <th>Mã số</th>
              <th className="lbl">Chỉ tiêu</th>
              {cols.map(p => <th key={p} className="num">{periodLabel(p)}</th>)}
              {prevIdx >= 0 && <th className="num">±% MoM</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const isBold = BOLD_MASO.has(it.maSo)
              const last = it.values[cols[lastIdx]] ?? 0
              const prev = prevIdx >= 0 ? (it.values[cols[prevIdx]] ?? 0) : 0
              const mom = prevIdx >= 0 && prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null
              return (
                <tr key={it.maSo} className={isBold ? 'bold' : ''}>
                  <td>{it.maSo}</td>
                  <td className="lbl">{it.chiTieu}</td>
                  {cols.map(p => <td key={p} className="num">{fmtS(it.values[p] ?? 0)}</td>)}
                  {prevIdx >= 0 && (
                    <td className="num" style={{ color: mom == null ? '#9CA3AF' : mom < 0 ? '#DC2626' : '#16A34A' }}>
                      {mom == null ? '–' : `${mom > 0 ? '+' : ''}${mom.toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
