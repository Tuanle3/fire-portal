import { Fragment, useState } from 'react'
import { BsGroupNode, buildLineItemMatrix, FlatDoc, groupBsItems, LineItem } from '../_lib/compute'
import { PeriodBucket, PeriodFilter } from '../_lib/usePeriodFilter'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  pf: PeriodFilter
  fmtS: (v: number) => string
  unitLbl: string
}

const BOLD_PL = new Set(['10', '20', '30', '50', '60'])

function bucketValue(item: LineItem, bucket: PeriodBucket): number {
  return bucket.periods.reduce((s, p) => s + (item.values[p] ?? 0), 0)
}

function ValueCells({ item, buckets, fmtS }: { item: LineItem; buckets: PeriodBucket[]; fmtS: (v: number) => string }) {
  const lastIdx = buckets.length - 1
  const prevIdx = buckets.length - 2
  const vals = buckets.map(b => bucketValue(item, b))
  const last = vals[lastIdx] ?? 0
  const prev = prevIdx >= 0 ? (vals[prevIdx] ?? 0) : 0
  const delta = prevIdx >= 0 ? last - prev : null
  const deltaPct = prevIdx >= 0 && prev !== 0 ? (delta! / Math.abs(prev)) * 100 : null
  return (
    <>
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
    </>
  )
}

function TableHead({ buckets }: { buckets: PeriodBucket[] }) {
  const prevIdx = buckets.length - 2
  return (
    <thead>
      <tr>
        <th>Mã số</th><th className="lbl">Chỉ tiêu</th>
        {buckets.map(b => <th key={b.label} className="num">{b.label}</th>)}
        {prevIdx >= 0 && <th className="num">Δ</th>}
        {prevIdx >= 0 && <th className="num">%Δ</th>}
      </tr>
    </thead>
  )
}

function PlTable({ items, buckets, fmtS }: { items: LineItem[]; buckets: PeriodBucket[]; fmtS: (v: number) => string }) {
  return (
    <table className="stbl">
      <TableHead buckets={buckets} />
      <tbody>
        {items.map(it => (
          <tr key={it.maSo} className={BOLD_PL.has(it.maSo) ? 'bold' : ''}>
            <td>{it.maSo}</td>
            <td className="lbl">{it.chiTieu}</td>
            <ValueCells item={it} buckets={buckets} fmtS={fmtS} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Cân đối kế toán có quá nhiều dòng chi tiết để hiện phẳng — nhóm theo mã số (xem groupBsItems),
// mặc định thu gọn các dòng chi tiết cấp 2, bấm +/- ở dòng nhóm cấp 1 để bung ra khi cần.
function BsTable({ items, buckets, fmtS }: { items: LineItem[]; buckets: PeriodBucket[]; fmtS: (v: number) => string }) {
  const groups = groupBsItems(items)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (maSo: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(maSo)) next.delete(maSo); else next.add(maSo)
    return next
  })
  const expandableCount = groups.filter(g => g.children.length > 0).length

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
        <button className="tc-linkbtn" onClick={() => setExpanded(new Set(groups.filter(g => g.children.length > 0).map(g => g.item.maSo)))}>Bung tất cả</button>
        <button className="tc-linkbtn" onClick={() => setExpanded(new Set())}>Thu gọn tất cả</button>
      </div>
      <table className="stbl">
        <TableHead buckets={buckets} />
        <tbody>
          {groups.map((node: BsGroupNode) => {
            const canToggle = node.children.length > 0
            const isOpen = expanded.has(node.item.maSo)
            return (
              <Fragment key={node.item.maSo}>
                <tr
                  className={node.level === 0 ? 'bold' : canToggle ? 'grp' : ''}
                  onClick={canToggle ? () => toggle(node.item.maSo) : undefined}
                >
                  <td>{node.item.maSo}</td>
                  <td className="lbl">
                    {canToggle && <button className="tree-toggle" onClick={e => { e.stopPropagation(); toggle(node.item.maSo) }}>{isOpen ? '−' : '+'}</button>}
                    {node.item.chiTieu}
                    {canToggle && <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}> ({node.children.length} dòng)</span>}
                  </td>
                  <ValueCells item={node.item} buckets={buckets} fmtS={fmtS} />
                </tr>
                {canToggle && isOpen && node.children.map(child => (
                  <tr key={child.maSo}>
                    <td>{child.maSo}</td>
                    <td className="lbl indent">{child.chiTieu}</td>
                    <ValueCells item={child} buckets={buckets} fmtS={fmtS} />
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {expandableCount > 0 && (
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>{expandableCount} nhóm có thể bung chi tiết — bấm dòng hoặc nút +/-.</div>
      )}
    </>
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

      <div className="panel">
        <div className="panel-h"><span>📈 Kết quả kinh doanh — Phân tích ngang</span><span className="panel-badge">BIẾN ĐỘNG {buckets.length} KỲ</span></div>
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          {buckets.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Chưa có dữ liệu</div> : <PlTable items={plItems} buckets={buckets} fmtS={fmtS} />}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><span>⚖ Cân đối kế toán — Phân tích ngang</span><span className="panel-badge">BIẾN ĐỘNG {buckets.length} KỲ</span></div>
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          {buckets.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Chưa có dữ liệu</div> : <BsTable items={bsItems} buckets={buckets} fmtS={fmtS} />}
        </div>
      </div>
    </>
  )
}
