import { useMemo } from 'react'
import { ChartConfiguration } from 'chart.js'
import { buildLineItemMatrix, FlatDoc, valueByMaSo } from '../_lib/compute'
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

function CommonSizeTable({ title, icon, items, base, baseLabel, curP, cmpP, fmtS }: {
  title: string; icon: string; items: ReturnType<typeof buildLineItemMatrix>
  base: number; baseLabel: string; curP: string; cmpP: string | null; fmtS: (v: number) => string
}) {
  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">% TRÊN {baseLabel}</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="stbl">
          <thead>
            <tr>
              <th className="lbl">Chỉ tiêu</th>
              <th className="num">{periodLabel(curP)}</th><th className="num">% {baseLabel}</th>
              {cmpP && <th className="num">{periodLabel(cmpP)}</th>}
              {cmpP && <th className="num">% {baseLabel}</th>}
              {cmpP && <th className="num">Δ điểm %</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const curV = it.values[curP] ?? 0
              const curPct = base !== 0 ? curV / base * 100 : 0
              const cmpV = cmpP ? (it.values[cmpP] ?? 0) : 0
              const cmpPct = cmpP && base !== 0 ? cmpV / base * 100 : 0
              const dp = curPct - cmpPct
              return (
                <tr key={it.maSo}>
                  <td className="lbl">{it.chiTieu}</td>
                  <td className="num">{fmtS(curV)}</td>
                  <td className="num" style={{ color: '#4B6A8A' }}>{curPct.toFixed(1)}%</td>
                  {cmpP && <td className="num">{fmtS(cmpV)}</td>}
                  {cmpP && <td className="num" style={{ color: '#4B6A8A' }}>{cmpPct.toFixed(1)}%</td>}
                  {cmpP && <td className="num" style={{ color: dp < 0 ? '#DC2626' : dp > 0 ? '#16A34A' : '#9CA3AF' }}>{dp > 0 ? '+' : ''}{dp.toFixed(1)}pp</td>}
                </tr>
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
      <CommonSizeTable title="Kết quả kinh doanh — Phân tích dọc" icon="📈" items={plItems} base={dtt} baseLabel="DTT" curP={snapshotPeriod} cmpP={cmpP} fmtS={fmtS} />
      <CommonSizeTable title="Cân đối kế toán — Phân tích dọc" icon="⚖" items={bsItems} base={tongTS} baseLabel="TỔNG TS" curP={snapshotPeriod} cmpP={cmpP} fmtS={fmtS} />

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
