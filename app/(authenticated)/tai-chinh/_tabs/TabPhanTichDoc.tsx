import { Fragment, useMemo, useState } from 'react'
import { ChartConfiguration } from 'chart.js'
import { buildLineItemMatrix, FlatDoc, groupBsItems, LineItem, valueByMaSo } from '../_lib/compute'
import { MS_BS, MS_PL } from '../_lib/masocode'
import { periodLabel } from '../_lib/format'
import { ALL_DONVI, DonViInfo } from '../_lib/types'
import { ChartCanvas } from '../_lib/ChartCanvas'

interface Props {
  docs: FlatDoc[]
  donViList: DonViInfo[]
  snapshotPeriod: string
  fmtS: (v: number) => string
  unitLbl: string
}

interface CompanyCol { key: string; label: string }

function CommonSizeHead({ companies, baseLabel }: { companies: CompanyCol[]; baseLabel: string }) {
  return (
    <thead>
      <tr>
        <th className="lbl" rowSpan={2}>Chỉ tiêu</th>
        {companies.map(c => <th key={c.key} className="num" colSpan={2}>{c.label}</th>)}
      </tr>
      <tr>
        {companies.map(c => (
          <Fragment key={c.key}>
            <th className="num">Giá trị</th>
            <th className="num">% {baseLabel}</th>
          </Fragment>
        ))}
      </tr>
    </thead>
  )
}

function CompanyValueCells({ item, base, curP, fmtS }: {
  item: LineItem | undefined; base: number; curP: string; fmtS: (v: number) => string
}) {
  const v = item?.values[curP] ?? 0
  const p = base !== 0 ? v / base * 100 : 0
  const pLabel = p.toFixed(1)
  const isZero = pLabel === '0.0' || pLabel === '-0.0'
  return (
    <>
      <td className="num">{fmtS(v)}</td>
      <td className="num" style={{ color: isZero ? '#C7CCD6' : '#7C3AED', fontStyle: isZero ? 'normal' : 'italic' }}>{pLabel}%</td>
    </>
  )
}

// Các dòng tổng/kết quả quan trọng (DTT, Lãi gộp, LN thuần HĐKD, LN trước thuế, LN sau thuế) —
// bôi đậm để nổi bật giữa các dòng chi tiết, cùng quy ước với Phân tích ngang (xem TabPhanTichNgang).
const KEY_PL_MASO = new Set<string>([MS_PL.DTT, MS_PL.LAI_GOP, MS_PL.LN_THUAN_HDKD, MS_PL.LN_TRUOC_THUE, MS_PL.LN_SAU_THUE])

function PlCommonSizeTable({ title, icon, rows, companies, byCompany, curP, fmtS }: {
  title: string; icon: string; rows: LineItem[]; companies: CompanyCol[]
  byCompany: Record<string, { base: number; map: Map<string, LineItem> }>
  curP: string; fmtS: (v: number) => string
}) {
  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">% TRÊN DTT</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="stbl">
          <CommonSizeHead companies={companies} baseLabel="DTT" />
          <tbody>
            {rows.map(row => (
              <tr key={row.maSo} className={KEY_PL_MASO.has(row.maSo) ? 'bold' : ''}>
                <td className="lbl">{row.chiTieu}</td>
                {companies.map(c => (
                  <CompanyValueCells key={c.key} item={byCompany[c.key].map.get(row.maSo)} base={byCompany[c.key].base} curP={curP} fmtS={fmtS} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Cân đối kế toán common-size cũng nhiều dòng chi tiết như Phân tích ngang — nhóm + bung/thu tương tự.
// Cây nhóm dựng từ items của "Hợp nhất" (đủ mọi mã số xuất hiện ở bất kỳ công ty nào); từng công ty
// khác chỉ tra cứu giá trị theo mã số, công ty nào không có dòng đó thì hiện 0.
function BsCommonSizeTable({ title, icon, rows, companies, byCompany, curP, fmtS }: {
  title: string; icon: string; rows: LineItem[]; companies: CompanyCol[]
  byCompany: Record<string, { base: number; map: Map<string, LineItem> }>
  curP: string; fmtS: (v: number) => string
}) {
  const groups = groupBsItems(rows)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (maSo: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(maSo)) next.delete(maSo); else next.add(maSo)
    return next
  })

  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">% TRÊN TỔNG TS</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
          <button className="tc-linkbtn" onClick={() => setExpanded(new Set(groups.filter(g => g.children.length > 0).map(g => g.item.maSo)))}>Bung tất cả</button>
          <button className="tc-linkbtn" onClick={() => setExpanded(new Set())}>Thu gọn tất cả</button>
        </div>
        <table className="stbl">
          <CommonSizeHead companies={companies} baseLabel="TỔNG TS" />
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
                    {companies.map(c => (
                      <CompanyValueCells key={c.key} item={byCompany[c.key].map.get(node.item.maSo)} base={byCompany[c.key].base} curP={curP} fmtS={fmtS} />
                    ))}
                  </tr>
                  {canToggle && isOpen && node.children.map(child => (
                    <tr key={child.maSo}>
                      <td className="lbl indent">{child.chiTieu}</td>
                      {companies.map(c => (
                        <CompanyValueCells key={c.key} item={byCompany[c.key].map.get(child.maSo)} base={byCompany[c.key].base} curP={curP} fmtS={fmtS} />
                      ))}
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

export function TabPhanTichDoc({ docs, donViList, snapshotPeriod, fmtS, unitLbl }: Props) {
  const companies: CompanyCol[] = useMemo(
    () => [{ key: ALL_DONVI, label: 'Hợp nhất' }, ...donViList.map(d => ({ key: d.key, label: d.label }))],
    [donViList],
  )

  // Dựng cây/nhóm dòng chỉ tiêu từ dữ liệu "Hợp nhất" (đã gộp mọi mã số của mọi công ty), rồi tra
  // cứu giá trị riêng từng công ty theo đúng mã số đó — tránh mỗi công ty tự sắp xếp/nhóm khác nhau.
  const plRows = useMemo(() => buildLineItemMatrix(docs, 'PL', ALL_DONVI, [snapshotPeriod]), [docs, snapshotPeriod])
  const bsRows = useMemo(() => buildLineItemMatrix(docs, 'BS', ALL_DONVI, [snapshotPeriod]), [docs, snapshotPeriod])

  const plByCompany = useMemo(() => {
    const out: Record<string, { base: number; map: Map<string, LineItem> }> = {}
    for (const c of companies) {
      const items = c.key === ALL_DONVI ? plRows : buildLineItemMatrix(docs, 'PL', c.key, [snapshotPeriod])
      out[c.key] = { base: valueByMaSo(docs, 'PL', snapshotPeriod, MS_PL.DTT, c.key), map: new Map(items.map(i => [i.maSo, i])) }
    }
    return out
  }, [docs, companies, snapshotPeriod, plRows])

  const bsByCompany = useMemo(() => {
    const out: Record<string, { base: number; map: Map<string, LineItem> }> = {}
    for (const c of companies) {
      const items = c.key === ALL_DONVI ? bsRows : buildLineItemMatrix(docs, 'BS', c.key, [snapshotPeriod])
      out[c.key] = { base: valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TONG_TS, c.key), map: new Map(items.map(i => [i.maSo, i])) }
    }
    return out
  }, [docs, companies, snapshotPeriod, bsRows])

  const tien = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TIEN, ALL_DONVI)
  const htk = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.HANG_TON_KHO, ALL_DONVI)
  const tsnh = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TSNH, ALL_DONVI)
  const tsdh = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.TSDH, ALL_DONVI)
  const tsnhKhac = Math.max(0, tsnh - tien - htk)

  const noNH = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.NO_NGAN_HAN, ALL_DONVI)
  const noDH = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.NO_DAI_HAN, ALL_DONVI)
  const vcsh = valueByMaSo(docs, 'BS', snapshotPeriod, MS_BS.VON_CSH, ALL_DONVI)

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
  }), [snapshotPeriod, unitLbl])

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
  }), [snapshotPeriod, unitLbl])

  return (
    <>
      <div className="tc-sub">Kỳ {periodLabel(snapshotPeriod)} · so sánh cơ cấu giữa các công ty (đơn vị: {unitLbl})</div>
      <PlCommonSizeTable title="Kết quả kinh doanh — Phân tích dọc" icon="📈" rows={plRows} companies={companies} byCompany={plByCompany} curP={snapshotPeriod} fmtS={fmtS} />
      <BsCommonSizeTable title="Cân đối kế toán — Phân tích dọc" icon="⚖" rows={bsRows} companies={companies} byCompany={bsByCompany} curP={snapshotPeriod} fmtS={fmtS} />

      <div className="grid2-even">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🥧 Cơ cấu tài sản</span><span className="panel-badge">HỢP NHẤT</span></div>
          <div className="chart-box"><ChartCanvas config={assetCfg} ariaLabel="Cơ cấu tài sản" /></div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🥧 Cơ cấu nguồn vốn</span><span className="panel-badge">HỢP NHẤT</span></div>
          <div className="chart-box"><ChartCanvas config={capitalCfg} ariaLabel="Cơ cấu nguồn vốn" /></div>
        </div>
      </div>
    </>
  )
}
