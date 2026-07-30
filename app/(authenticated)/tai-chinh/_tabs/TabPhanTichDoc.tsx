import { Fragment, useMemo, useState } from 'react'
import { ChartConfiguration } from 'chart.js'
import { buildLineItemMatrix, FlatDoc, groupBsItems, LineItem, valueByMaSo } from '../_lib/compute'
import { MS_BS, MS_PL } from '../_lib/masocode'
import { periodLabel } from '../_lib/format'
import { shiftYear } from '../_lib/usePeriodFilter'
import { ChartCanvas } from '../_lib/ChartCanvas'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  snapshotPeriod: string
  periods: string[]
  fmtS: (v: number) => string
  unitLbl: string
}

function CommonSizeHead({ baseLabel, cmpP }: { baseLabel: string; cmpP: string | null }) {
  return (
    <thead>
      <tr>
        <th className="lbl">Chỉ tiêu</th>
        <th className="num">Giá trị</th><th className="num">% {baseLabel}</th>
        {cmpP && <th className="num">Cùng kỳ trước</th>}
        {cmpP && <th className="num">% {baseLabel}</th>}
        {cmpP && <th className="num">Δ điểm %</th>}
      </tr>
    </thead>
  )
}

function ValueCells({ item, base, curP, cmpP, fmtS }: {
  item: LineItem; base: number; curP: string; cmpP: string | null; fmtS: (v: number) => string
}) {
  const curV = item.values[curP] ?? 0
  const curPct = base !== 0 ? curV / base * 100 : 0
  const cmpV = cmpP ? (item.values[cmpP] ?? 0) : 0
  const cmpPct = cmpP && base !== 0 ? cmpV / base * 100 : 0
  const dp = curPct - cmpPct
  return (
    <>
      <td className="num">{fmtS(curV)}</td>
      <td className="num" style={{ color: '#4B6A8A' }}>{curPct.toFixed(1)}%</td>
      {cmpP && <td className="num">{fmtS(cmpV)}</td>}
      {cmpP && <td className="num" style={{ color: '#4B6A8A' }}>{cmpPct.toFixed(1)}%</td>}
      {cmpP && <td className="num" style={{ color: dp < 0 ? '#DC2626' : dp > 0 ? '#16A34A' : '#9CA3AF' }}>{dp > 0 ? '+' : ''}{dp.toFixed(1)}pp</td>}
    </>
  )
}

function PlCommonSizeTable({ title, icon, items, base, baseLabel, curP, cmpP, fmtS }: {
  title: string; icon: string; items: LineItem[]; base: number; baseLabel: string
  curP: string; cmpP: string | null; fmtS: (v: number) => string
}) {
  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">% TRÊN {baseLabel}</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="stbl">
          <CommonSizeHead baseLabel={baseLabel} cmpP={cmpP} />
          <tbody>
            {items.map(it => (
              <tr key={it.maSo}>
                <td className="lbl">{it.chiTieu}</td>
                <ValueCells item={it} base={base} curP={curP} cmpP={cmpP} fmtS={fmtS} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Cân đối kế toán common-size cũng nhiều dòng chi tiết như Phân tích ngang — nhóm + bung/thu tương tự.
function BsCommonSizeTable({ title, icon, items, base, baseLabel, curP, cmpP, fmtS }: {
  title: string; icon: string; items: LineItem[]; base: number; baseLabel: string
  curP: string; cmpP: string | null; fmtS: (v: number) => string
}) {
  const groups = groupBsItems(items)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (maSo: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(maSo)) next.delete(maSo); else next.add(maSo)
    return next
  })

  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">% TRÊN {baseLabel}</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
          <button className="tc-linkbtn" onClick={() => setExpanded(new Set(groups.filter(g => g.children.length > 0).map(g => g.item.maSo)))}>Bung tất cả</button>
          <button className="tc-linkbtn" onClick={() => setExpanded(new Set())}>Thu gọn tất cả</button>
        </div>
        <table className="stbl">
          <CommonSizeHead baseLabel={baseLabel} cmpP={cmpP} />
          <tbody>
            {groups.map(node => {
              const canToggle = node.children.length > 0
              const isOpen = expanded.has(node.item.maSo)
              return (
                <Fragment key={node.item.maSo}>
                  <tr className={node.level === 0 ? 'bold' : canToggle ? 'grp' : ''} onClick={canToggle ? () => toggle(node.item.maSo) : undefined}>
                    <td className="lbl">
                      {canToggle && <button className="tree-toggle" onClick={e => { e.stopPropagation(); toggle(node.item.maSo) }}>{isOpen ? '−' : '+'}</button>}
                      {node.item.chiTieu}
                      {canToggle && <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}> ({node.children.length} dòng)</span>}
                    </td>
                    <ValueCells item={node.item} base={base} curP={curP} cmpP={cmpP} fmtS={fmtS} />
                  </tr>
                  {canToggle && isOpen && node.children.map(child => (
                    <tr key={child.maSo}>
                      <td className="lbl indent">{child.chiTieu}</td>
                      <ValueCells item={child} base={base} curP={curP} cmpP={cmpP} fmtS={fmtS} />
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TabPhanTichDoc({ docs, donViKey, snapshotPeriod, periods, fmtS, unitLbl }: Props) {
  const cmp = shiftYear(snapshotPeriod, -1)
  const cmpP = periods.includes(cmp) ? cmp : null
  const relevant = cmpP ? [snapshotPeriod, cmpP] : [snapshotPeriod]

  const dtt = valueByMaSo(docs, 'PL', snapshotPeriod, MS_PL.DTT, donViKey)
  const tongTS = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TONG_TS, donViKey)
  const plItems = buildLineItemMatrix(docs, 'PL', donViKey, relevant)
  const bsItems = buildLineItemMatrix(docs, 'BS', donViKey, relevant)

  const tien = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TIEN, donViKey)
  const htk = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.HANG_TON_KHO, donViKey)
  const tsnh = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TSNH, donViKey)
  const tsdh = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TSDH, donViKey)
  const tsnhKhac = Math.max(0, tsnh - tien - htk)

  const noNH = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.NO_NGAN_HAN, donViKey)
  const noDH = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.NO_DAI_HAN, donViKey)
  const vcsh = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.VON_CSH, donViKey)

  const assetCfg = useMemo<ChartConfiguration>(() => ({
    type: 'doughnut',
    data: {
      labels: ['Tiền & tương đương', 'Hàng tồn kho', 'TSNH khác', 'Tài sản dài hạn'],
      datasets: [{ data: [tien, htk, tsnhKhac, tsdh], backgroundColor: ['#16A34A', '#D4A64A', '#2563EB', '#1C3557'], borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.label}: ${fmtS(c.raw as number)} ${unitLbl}` } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snapshotPeriod, donViKey, unitLbl])

  const capitalCfg = useMemo<ChartConfiguration>(() => ({
    type: 'doughnut',
    data: {
      labels: ['Nợ ngắn hạn', 'Nợ dài hạn', 'Vốn chủ sở hữu'],
      datasets: [{ data: [noNH, noDH, vcsh], backgroundColor: ['#DC2626', '#D4A64A', '#1C3557'], borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.label}: ${fmtS(c.raw as number)} ${unitLbl}` } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snapshotPeriod, donViKey, unitLbl])

  return (
    <>
      <div className="tc-sub">
        Kỳ {periodLabel(snapshotPeriod)}{cmpP ? ` · so cùng kỳ ${periodLabel(cmpP)}` : ' · chưa có dữ liệu cùng kỳ năm trước để so sánh'} (đơn vị: {unitLbl})
      </div>
      <PlCommonSizeTable title="Kết quả kinh doanh — Phân tích dọc" icon="📈" items={plItems} base={dtt} baseLabel="DTT" curP={snapshotPeriod} cmpP={cmpP} fmtS={fmtS} />
      <BsCommonSizeTable title="Cân đối kế toán — Phân tích dọc" icon="⚖" items={bsItems} base={tongTS} baseLabel="TỔNG TS" curP={snapshotPeriod} cmpP={cmpP} fmtS={fmtS} />

      <div className="grid2-even">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🥧 Cơ cấu tài sản</span></div>
          <div className="chart-box"><ChartCanvas config={assetCfg} ariaLabel="Cơ cấu tài sản" /></div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🥧 Cơ cấu nguồn vốn</span></div>
          <div className="chart-box"><ChartCanvas config={capitalCfg} ariaLabel="Cơ cấu nguồn vốn" /></div>
        </div>
      </div>
    </>
  )
}
