import { useMemo } from 'react'
import { ChartConfiguration } from 'chart.js'
import { breakdownByCode, buildAlerts, computeRatios, computeSnapshot, FlatDoc, hasSnapshotData } from '../_lib/compute'
import { PL_BREAKDOWN_CODES } from '../_lib/masocode'
import { pct, periodLabel } from '../_lib/format'
import { ChartCanvas } from '../_lib/ChartCanvas'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  donViLabel: string
  periods: string[]
  snapshotPeriod: string
  fmtS: (v: number) => string
  unitLbl: string
}

const PALETTE = ['#1C3557', '#D4A64A', '#16A34A', '#2563EB', '#7C3AED', '#0891B2', '#D97706', '#DC2626']

export function TabTongQuan({ docs, donViKey, donViLabel, periods, snapshotPeriod, fmtS, unitLbl }: Props) {
  const s = computeSnapshot(docs, donViKey, snapshotPeriod)
  const r = computeRatios(s)
  const hasData = hasSnapshotData(s)
  const history = periods.filter(p => p <= snapshotPeriod)
  const alerts = hasData ? buildAlerts(s, r, history.map(p => computeSnapshot(docs, donViKey, p))) : []

  const idx = periods.indexOf(snapshotPeriod)
  const trail = idx >= 0 ? periods.slice(Math.max(0, idx - 5), idx + 1) : periods.slice(-6)
  const trailKey = trail.join(',')
  const trailLabels = trail.map(periodLabel)
  const trailSnaps = trail.map(p => computeSnapshot(docs, donViKey, p))

  const productMix = breakdownByCode(docs, donViKey, [snapshotPeriod], [PL_BREAKDOWN_CODES.DOANH_THU_SP])
  const perPeriodCost = trail.map(p => breakdownByCode(docs, donViKey, [p], [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, PL_BREAKDOWN_CODES.CHI_PHI_KHAC_CT]))
  const costCategories = [...new Set(perPeriodCost.flat().map(i => i.chiTieu))]
    .sort((a, b) => perPeriodCost.reduce((s, l) => s + (l.find(i => i.chiTieu === b)?.value ?? 0), 0) - perPeriodCost.reduce((s, l) => s + (l.find(i => i.chiTieu === a)?.value ?? 0), 0))
    .slice(0, 6)

  const revProfitCfg = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: {
      labels: trailLabels,
      datasets: [
        { label: 'Doanh thu thuần', data: trailSnaps.map(x => x.dtt), backgroundColor: '#1C3557', borderRadius: 4 },
        { label: 'LN thuần HĐKD', data: trailSnaps.map(x => x.lnThuanHDKD), backgroundColor: '#D4A64A', borderRadius: 4 },
        { label: 'LN sau thuế', data: trailSnaps.map(x => x.lnSauThue), backgroundColor: '#16A34A', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtS(c.raw as number)} ${unitLbl}` } } },
      scales: { y: { ticks: { callback: v => fmtS(v as number) }, grid: { color: '#F1F4F8' } }, x: { grid: { display: false } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trailKey, donViKey, unitLbl])

  const productMixCfg = useMemo<ChartConfiguration>(() => ({
    type: 'doughnut',
    data: {
      labels: productMix.map(i => i.chiTieu),
      datasets: [{ data: productMix.map(i => i.value), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtS(c.raw as number)} ${unitLbl}` } },
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snapshotPeriod, donViKey, unitLbl])

  const marginCfg = useMemo<ChartConfiguration>(() => ({
    type: 'line',
    data: {
      labels: trailLabels,
      datasets: [
        { label: 'Biên gộp', data: trailSnaps.map(x => x.dtt !== 0 ? x.laiGop / x.dtt * 100 : 0), borderColor: '#1C3557', backgroundColor: 'rgba(28,53,87,.08)', fill: true, tension: .4, pointRadius: 3, borderWidth: 2 },
        { label: 'Biên HĐKD', data: trailSnaps.map(x => x.dtt !== 0 ? x.lnThuanHDKD / x.dtt * 100 : 0), borderColor: '#D4A64A', tension: .4, pointRadius: 3, borderWidth: 2 },
        { label: 'Biên ròng', data: trailSnaps.map(x => x.dtt !== 0 ? x.lnSauThue / x.dtt * 100 : 0), borderColor: '#16A34A', tension: .4, pointRadius: 3, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${(c.raw as number).toFixed(1)}%` } } },
      scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: '#F1F4F8' } }, x: { grid: { display: false } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trailKey, donViKey])

  const costCfg = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: {
      labels: trailLabels,
      datasets: costCategories.map((cat, ci) => ({
        label: cat,
        data: perPeriodCost.map(list => list.find(i => i.chiTieu === cat)?.value ?? 0),
        backgroundColor: PALETTE[ci % PALETTE.length],
        borderRadius: 3,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtS(c.raw as number)} ${unitLbl}` } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => fmtS(v as number) }, grid: { color: '#F1F4F8' } } },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trailKey, donViKey, unitLbl])

  return (
    <>
      <div className="tc-sub">{donViLabel} · Kỳ {periodLabel(snapshotPeriod)}</div>

      {!hasData && (
        <div className="alert-row alert-yellow">
          ⚠ Kỳ này chưa có số liệu BCTC thực tế (cột trống trong Sheet) — các số dưới đây chỉ là 0, không phải kết quả kinh doanh thật.
        </div>
      )}
      {hasData && alerts.length > 0 && (
        <div className="panel">
          <div className="panel-h"><span>🔔 Cảnh báo sức khỏe tài chính</span><span className="panel-badge">{alerts.length} MỤC</span></div>
          <div className="panel-b">
            {alerts.map((a, i) => (
              <div key={i} className={`alert-row alert-${a.level}`}>
                <span>{a.level === 'red' ? '🔴' : '🟡'}</span><span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasData && alerts.length === 0 && (
        <div className="alert-row alert-ok">✅ Không có cảnh báo — các chỉ số nằm trong ngưỡng an toàn tham khảo.</div>
      )}

      <div className="grid4" style={{ marginTop: 14 }}>
        <div className="kcard" style={{ '--accent': '#2563EB' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Tổng tài sản</div>
          <div><span className="kcard-v">{fmtS(s.tongTS)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Nguồn vốn: {fmtS(s.tongNguonVon)} {unitLbl}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#D97706' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Nợ phải trả</div>
          <div><span className="kcard-v">{fmtS(s.noPhaiTra)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">NH {fmtS(s.noNH)} · DH {fmtS(s.noDH)}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#0891B2' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Vốn chủ sở hữu</div>
          <div><span className="kcard-v">{fmtS(s.vcsh)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">ROE {pct(r.roe)}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#1C3557' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Doanh thu thuần</div>
          <div><span className="kcard-v">{fmtS(s.dtt)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Biên LN gộp {pct(r.grossMargin)}</div>
        </div>
      </div>

      <div className="grid4">
        <div className="kcard" style={{ '--accent': '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Lãi gộp</div>
          <div><span className="kcard-v" style={{ color: s.laiGop < 0 ? '#DC2626' : undefined }}>{fmtS(s.laiGop)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Giá vốn {fmtS(s.giaVon)} {unitLbl}</div>
        </div>
        <div className="kcard" style={{ '--accent': s.lnThuanHDKD < 0 ? '#DC2626' : '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />LN thuần HĐKD</div>
          <div><span className="kcard-v" style={{ color: s.lnThuanHDKD < 0 ? '#DC2626' : undefined }}>{fmtS(s.lnThuanHDKD)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">{s.lnThuanHDKD < 0 ? 'Đang lỗ hoạt động kinh doanh' : 'Có lãi từ HĐKD'}</div>
        </div>
        <div className="kcard" style={{ '--accent': s.lnSauThue < 0 ? '#DC2626' : '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />LN sau thuế</div>
          <div><span className="kcard-v" style={{ color: s.lnSauThue < 0 ? '#DC2626' : undefined }}>{fmtS(s.lnSauThue)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Biên LNST {pct(r.netMargin)}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#7C3AED' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Công nợ thu / trả</div>
          <div><span className="kcard-v">{fmtS(s.arBalance)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Phải trả: {fmtS(s.apBalance)} {unitLbl}</div>
        </div>
      </div>

      <div className="grid2-even">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>📈 Xu hướng doanh thu & lợi nhuận</span></div>
          <div className="chart-box"><ChartCanvas config={revProfitCfg} ariaLabel="Biểu đồ doanh thu và lợi nhuận theo kỳ" /></div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🏷 Cơ cấu doanh thu theo sản phẩm</span></div>
          <div className="chart-box">
            {productMix.length === 0
              ? <div style={{ color: '#9CA3AF', fontSize: 12.5, textAlign: 'center', paddingTop: 60 }}>Chưa có dữ liệu</div>
              : <ChartCanvas config={productMixCfg} ariaLabel="Cơ cấu doanh thu theo sản phẩm" />}
          </div>
        </div>
      </div>

      <div className="grid2-even">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>📉 Xu hướng biên lợi nhuận</span></div>
          <div className="chart-box"><ChartCanvas config={marginCfg} ariaLabel="Xu hướng biên lợi nhuận" /></div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🧮 Cơ cấu chi phí hoạt động</span></div>
          <div className="chart-box">
            {costCategories.length === 0
              ? <div style={{ color: '#9CA3AF', fontSize: 12.5, textAlign: 'center', paddingTop: 60 }}>Chưa có dữ liệu</div>
              : <ChartCanvas config={costCfg} ariaLabel="Cơ cấu chi phí hoạt động theo kỳ" />}
          </div>
        </div>
      </div>
    </>
  )
}
