import { buildLineItemMatrix, FlatDoc } from '../_lib/compute'
import { periodLabel } from '../_lib/format'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  periods: string[]
  fmtS: (v: number) => string
  unitLbl: string
}

const BOLD_MASO = new Set(['100', '200', '280', '300', '310', '330', '400', '440'])

export function TabCanDoiKT({ docs, donViKey, periods, fmtS, unitLbl }: Props) {
  const cols = periods.slice(-6)
  const items = buildLineItemMatrix(docs, 'BS', donViKey, cols)
  const lastP = cols[cols.length - 1]

  return (
    <div className="panel">
      <div className="panel-h"><span>⚖ Cân đối kế toán theo mã số (đơn vị: {unitLbl})</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="stbl">
          <thead>
            <tr>
              <th>Mã số</th>
              <th className="lbl">Chỉ tiêu</th>
              {cols.map(p => <th key={p} className="num">{periodLabel(p)}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.maSo} className={BOLD_MASO.has(it.maSo) ? 'bold' : ''}>
                <td>{it.maSo}</td>
                <td className="lbl">{it.chiTieu}</td>
                {cols.map(p => <td key={p} className="num">{fmtS(it.values[p] ?? 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <div style={{ padding: 12, color: '#9CA3AF', fontSize: 12.5 }}>Chưa có dữ liệu Cân đối kế toán cho kỳ {periodLabel(lastP ?? '')}.</div>
        )}
      </div>
    </div>
  )
}
