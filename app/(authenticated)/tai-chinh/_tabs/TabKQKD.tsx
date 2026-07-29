import { useMemo, useState } from 'react'
import { breakdownByCode, FlatDoc, maSoSumOverPeriods } from '../_lib/compute'
import { MS_PL, PL_BREAKDOWN_CODES } from '../_lib/masocode'
import { pct } from '../_lib/format'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  periods: string[]
  fmtS: (v: number) => string
  unitLbl: string
}

type Mode = 'year' | 'quarter' | 'month'

function quarterOf(period: string): number {
  return Math.ceil(Number(period.slice(5, 7)) / 3)
}
function periodsForYear(all: string[], year: string): string[] {
  return all.filter(p => p.startsWith(`${year}-`))
}
function periodsForQuarter(all: string[], year: string, q: number): string[] {
  const months = [q * 3 - 2, q * 3 - 1, q * 3].map(m => `${year}-${String(m).padStart(2, '0')}`)
  return all.filter(p => months.includes(p))
}
function shiftYear(period: string, delta: number): string {
  const [y, m] = period.split('-')
  return `${Number(y) + delta}-${m}`
}
function rangeLabel(mode: Mode, year: string, quarter: number, month: string): string {
  if (mode === 'year') return `Cả năm ${year}`
  if (mode === 'quarter') return `Quý ${quarter}/${year}`
  const [y, m] = month.split('-')
  return m ? `Tháng ${m}/${y}` : '—'
}

function DeltaTag({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null) return <span style={{ color: '#9CA3AF', fontSize: 11 }}>–</span>
  if (prev === 0) return <span style={{ color: '#9CA3AF', fontSize: 11 }}>{cur === 0 ? '0%' : 'mới'}</span>
  const d = ((cur - prev) / Math.abs(prev)) * 100
  return <span style={{ color: d < 0 ? '#DC2626' : '#16A34A', fontSize: 11, fontWeight: 700 }}>{d > 0 ? '+' : ''}{d.toFixed(0)}%</span>
}

function BreakdownCard({ title, icon, items, total, fmtS, unitLbl, highlightTop }: {
  title: string; icon: string; items: { chiTieu: string; value: number; deltaPct?: number | null }[]
  total: number; fmtS: (v: number) => string; unitLbl: string; highlightTop?: boolean
}) {
  const maxAbs = Math.max(...items.map(it => Math.abs(it.value)), 1)
  const topIdx = highlightTop && items.length > 0
    ? items.reduce((best, it, i) => Math.abs(it.value) > Math.abs(items[best].value) ? i : best, 0)
    : -1
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-h"><span>{icon} {title}</span><span>{fmtS(total)} {unitLbl}</span></div>
      <div className="panel-b">
        {items.length === 0 && <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Không có dữ liệu</div>}
        {items.map((it, i) => (
          <div key={it.chiTieu} style={{ marginBottom: 9, background: i === topIdx ? '#FFFBEB' : 'transparent', borderRadius: 6, padding: i === topIdx ? '4px 6px' : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3, gap: 8 }}>
              <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{it.chiTieu}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1C3557', whiteSpace: 'nowrap' }}>{fmtS(it.value)} {unitLbl}</span>
              <span style={{ fontSize: 11, color: '#9CA3AF', width: 44, textAlign: 'right' }}>{total !== 0 ? pct(it.value / total, 0) : '–'}</span>
              {it.deltaPct !== undefined && <span style={{ width: 44, textAlign: 'right' }}><DeltaTag cur={it.value} prev={it.deltaPct == null ? null : it.value / (1 + it.deltaPct)} /></span>}
            </div>
            <div style={{ height: 5, background: '#EEF3FA', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.round(Math.abs(it.value) / maxAbs * 100))}%`, height: '100%', background: it.value < 0 ? '#F59E0B' : '#2563EB', borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TabKQKD({ docs, donViKey, periods, fmtS, unitLbl }: Props) {
  const years = useMemo(() => [...new Set(periods.map(p => p.slice(0, 4)))].sort(), [periods])
  const latestPeriod = periods[periods.length - 1] ?? ''

  const [mode, setMode] = useState<Mode>('month')
  const [year, setYear] = useState(latestPeriod.slice(0, 4) || years[years.length - 1] || '')
  const [quarter, setQuarter] = useState(latestPeriod ? quarterOf(latestPeriod) : 1)
  const [month, setMonth] = useState(latestPeriod)

  const selectedPeriods = useMemo(() => {
    if (mode === 'year') return periodsForYear(periods, year)
    if (mode === 'quarter') return periodsForQuarter(periods, year, quarter)
    return periods.includes(month) ? [month] : []
  }, [mode, year, quarter, month, periods])

  const comparePeriods = useMemo(
    () => selectedPeriods.map(p => shiftYear(p, -1)).filter(p => periods.includes(p)),
    [selectedPeriods, periods],
  )
  const hasCompare = comparePeriods.length > 0 && comparePeriods.length === selectedPeriods.length

  const sum = (ms: string, ps: string[]) => maSoSumOverPeriods(docs, donViKey, ps, ms)
  const cur = {
    dtt: sum(MS_PL.DTT, selectedPeriods),
    giaVon: sum(MS_PL.GIA_VON, selectedPeriods),
    laiGop: sum(MS_PL.LAI_GOP, selectedPeriods),
    dtTaiChinh: sum(MS_PL.DT_TAI_CHINH, selectedPeriods),
    cpTaiChinh: sum(MS_PL.CP_TAI_CHINH, selectedPeriods),
    cpBanHang: sum(MS_PL.CP_BAN_HANG, selectedPeriods),
    cpQldn: sum(MS_PL.CP_QLDN, selectedPeriods),
    lnThuanHDKD: sum(MS_PL.LN_THUAN_HDKD, selectedPeriods),
    thuNhapKhac: sum(MS_PL.THU_NHAP_KHAC, selectedPeriods),
    chiPhiKhac: sum(MS_PL.CHI_PHI_KHAC, selectedPeriods),
    lnKhac: sum(MS_PL.LN_KHAC, selectedPeriods),
    lnTruocThue: sum(MS_PL.LN_TRUOC_THUE, selectedPeriods),
    lnSauThue: sum(MS_PL.LN_SAU_THUE, selectedPeriods),
  }
  const prev = hasCompare ? {
    dtt: sum(MS_PL.DTT, comparePeriods),
    giaVon: sum(MS_PL.GIA_VON, comparePeriods),
    laiGop: sum(MS_PL.LAI_GOP, comparePeriods),
    lnThuanHDKD: sum(MS_PL.LN_THUAN_HDKD, comparePeriods),
    lnTruocThue: sum(MS_PL.LN_TRUOC_THUE, comparePeriods),
    lnSauThue: sum(MS_PL.LN_SAU_THUE, comparePeriods),
  } : null

  const grossMargin = cur.dtt !== 0 ? cur.laiGop / cur.dtt : 0
  const chiPhiTong = cur.cpBanHang + cur.cpQldn + cur.cpTaiChinh

  const doanhThuSP = breakdownByCode(docs, donViKey, selectedPeriods, [PL_BREAKDOWN_CODES.DOANH_THU_SP])
  const thuNhapKhacCT = breakdownByCode(docs, donViKey, selectedPeriods, [PL_BREAKDOWN_CODES.THU_NHAP_KHAC])
  const cauTrucChiPhi = breakdownByCode(docs, donViKey, selectedPeriods, [PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, PL_BREAKDOWN_CODES.CHI_PHI_KHAC_CT])
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const KQKD_ROWS: { stt: number; label: string; maSo: string; value: number; prevValue?: number; bold?: boolean }[] = [
    { stt: 1, label: 'Doanh thu bán hàng và cung cấp dịch vụ', maSo: '01', value: sum(MS_PL.DT_BAN_HANG, selectedPeriods) },
    { stt: 2, label: 'Các khoản giảm trừ doanh thu', maSo: '02', value: sum(MS_PL.GIAM_TRU, selectedPeriods) },
    { stt: 3, label: 'Doanh thu thuần', maSo: '10', value: cur.dtt, prevValue: prev?.dtt, bold: true },
    { stt: 4, label: 'Giá vốn hàng bán', maSo: '11', value: cur.giaVon, prevValue: prev?.giaVon },
    { stt: 5, label: 'Lợi nhuận gộp', maSo: '20', value: cur.laiGop, prevValue: prev?.laiGop, bold: true },
    { stt: 6, label: 'Doanh thu hoạt động tài chính', maSo: '22', value: cur.dtTaiChinh },
    { stt: 7, label: 'Chi phí tài chính', maSo: '23', value: cur.cpTaiChinh },
    { stt: 8, label: 'Chi phí bán hàng', maSo: '25', value: cur.cpBanHang },
    { stt: 9, label: 'Chi phí quản lý doanh nghiệp', maSo: '26', value: cur.cpQldn },
    { stt: 10, label: 'Lợi nhuận thuần từ hoạt động kinh doanh', maSo: '30', value: cur.lnThuanHDKD, prevValue: prev?.lnThuanHDKD, bold: true },
    { stt: 11, label: 'Thu nhập khác', maSo: '31', value: cur.thuNhapKhac },
    { stt: 12, label: 'Chi phí khác', maSo: '32', value: cur.chiPhiKhac },
    { stt: 13, label: 'Lợi nhuận khác', maSo: '40', value: cur.lnKhac },
    { stt: 14, label: 'Tổng lợi nhuận kế toán trước thuế', maSo: '50', value: cur.lnTruocThue, prevValue: prev?.lnTruocThue, bold: true },
    { stt: 15, label: 'Lợi nhuận sau thuế thu nhập doanh nghiệp', maSo: '60', value: cur.lnSauThue, prevValue: prev?.lnSauThue, bold: true },
  ]

  return (
    <>
      <div className="panel">
        <div className="panel-h"><span>📅 Kỳ báo cáo</span><span>{rangeLabel(mode, year, quarter, month)}</span></div>
        <div className="panel-b" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="tc-unit">
            {([['year', 'Cả năm'], ['quarter', 'Theo Quý'], ['month', 'Theo Tháng']] as [Mode, string][]).map(([m, l]) => (
              <button key={m} className={mode === m ? 'act' : ''} onClick={() => setMode(m)}>{l}</button>
            ))}
          </div>
          <select className="tc-sel" value={year} onChange={e => setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>Năm {y}</option>)}
          </select>
          {mode === 'quarter' && (
            <div className="tc-unit">
              {[1, 2, 3, 4].map(q => (
                <button key={q} className={quarter === q ? 'act' : ''} onClick={() => setQuarter(q)}>Q{q}</button>
              ))}
            </div>
          )}
          {mode === 'month' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((p, i) => (
                <button key={p} className={`tc-tab${month === p ? ' act' : ''}`} style={{ padding: '5px 10px', opacity: periods.includes(p) ? 1 : 0.4 }}
                  disabled={!periods.includes(p)} onClick={() => setMonth(p)}>Th.{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid4">
        <div className="kcard"><div className="kcard-h">Doanh thu thuần</div><div className="kcard-b">
          <div className="kcard-v">{fmtS(cur.dtt)} <span style={{ fontSize: 13, color: '#9CA3AF' }}>{unitLbl}</span></div>
          <div className="kcard-s">So cùng kỳ: <DeltaTag cur={cur.dtt} prev={prev?.dtt ?? null} /></div>
        </div></div>
        <div className="kcard"><div className="kcard-h">Giá vốn</div><div className="kcard-b">
          <div className="kcard-v">{fmtS(cur.giaVon)} <span style={{ fontSize: 13, color: '#9CA3AF' }}>{unitLbl}</span></div>
          <div className="kcard-s">{cur.dtt !== 0 ? pct(cur.giaVon / cur.dtt) : '–'} doanh thu</div>
        </div></div>
        <div className="kcard"><div className="kcard-h">Lợi nhuận gộp</div><div className="kcard-b">
          <div className="kcard-v" style={{ color: cur.laiGop < 0 ? '#DC2626' : '#1C3557' }}>{fmtS(cur.laiGop)} <span style={{ fontSize: 13, color: '#9CA3AF' }}>{unitLbl}</span></div>
          <div className="kcard-s">Biên LN gộp {pct(grossMargin)}</div>
        </div></div>
        <div className="kcard"><div className="kcard-h">Lợi nhuận sau thuế</div><div className="kcard-b">
          <div className="kcard-v" style={{ color: cur.lnSauThue < 0 ? '#DC2626' : '#1C3557' }}>{fmtS(cur.lnSauThue)} <span style={{ fontSize: 13, color: '#9CA3AF' }}>{unitLbl}</span></div>
          <div className="kcard-s">So cùng kỳ: <DeltaTag cur={cur.lnSauThue} prev={prev?.lnSauThue ?? null} /></div>
        </div></div>
      </div>

      <div className="grid2">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>📈 Kết quả kinh doanh</span><span>{unitLbl}</span></div>
          <div className="panel-b" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="stbl">
              <thead><tr><th>STT</th><th className="lbl">Nội dung</th><th>Mã số</th><th className="num">Giá trị</th>{hasCompare && <th className="num">±% CK</th>}</tr></thead>
              <tbody>
                {KQKD_ROWS.map(r => (
                  <tr key={r.maSo} className={r.bold ? 'bold' : ''}>
                    <td>{r.stt}</td>
                    <td className="lbl">{r.label}</td>
                    <td>{r.maSo}</td>
                    <td className="num" style={{ color: r.value < 0 ? '#DC2626' : undefined }}>{fmtS(r.value)}</td>
                    {hasCompare && <td className="num"><DeltaTag cur={r.value} prev={r.prevValue ?? null} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <BreakdownCard title="Doanh thu theo sản phẩm" icon="🏷" items={doanhThuSP} total={cur.dtt} fmtS={fmtS} unitLbl={unitLbl} />
          {thuNhapKhacCT.length > 0 && (
            <BreakdownCard title="Doanh thu & thu nhập khác" icon="➕" items={thuNhapKhacCT} total={cur.dtTaiChinh + cur.thuNhapKhac} fmtS={fmtS} unitLbl={unitLbl} />
          )}
        </div>
      </div>

      <BreakdownCard title="Cấu trúc chi phí" icon="🧮" items={cauTrucChiPhi} total={chiPhiTong} fmtS={fmtS} unitLbl={unitLbl} highlightTop />
    </>
  )
}
