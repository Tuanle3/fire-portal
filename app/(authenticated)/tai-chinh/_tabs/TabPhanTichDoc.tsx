import { Fragment, useMemo, useState } from 'react'
import { buildLineItemMatrix, FlatDoc, groupBsItems, LineItem } from '../_lib/compute'
import { MS_BS, MS_PL } from '../_lib/masocode'
import { ALL_DONVI, DonViInfo } from '../_lib/types'
import { PeriodBucket, PeriodFilter } from '../_lib/usePeriodFilter'

interface Props {
  docs: FlatDoc[]
  donViList: DonViInfo[]
  pf: PeriodFilter
  fmtS: (v: number) => string
  unitLbl: string
}

interface CompanyCol { key: string; label: string; color: string }

// Mỗi công ty 1 màu cố định (Hợp nhất luôn đứng đầu = navy thương hiệu) — dùng xuyên suốt header +
// viền phân vùng cột để mắt dễ tách nhóm cột của từng công ty khi bảng đã nhân thêm 4 kỳ.
const COMPANY_PALETTE = ['#1C3557', '#B08A3E', '#0F766E', '#7C3AED', '#B45309', '#2563EB', '#BE185D', '#4D7C0F']
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// 3 tầng header: Công ty (màu riêng) > Kỳ (4 cột gần nhất theo granularity đang chọn) > Giá trị/%.
function CommonSizeHead({ companies, buckets, baseLabel }: { companies: CompanyCol[]; buckets: PeriodBucket[]; baseLabel: string }) {
  return (
    <thead>
      <tr>
        <th className="lbl" rowSpan={3}>Chỉ tiêu</th>
        {companies.map(c => (
          <th key={c.key} className="num" colSpan={buckets.length * 2} style={{ background: c.color, color: '#fff', textAlign: 'center' }}>{c.label}</th>
        ))}
      </tr>
      <tr>
        {companies.flatMap(c => buckets.map((b, bi) => (
          <th key={`${c.key}-h-${bi}`} className="num" colSpan={2}
            style={{ background: withAlpha(c.color, 0.14), color: c.color, textAlign: 'center', borderLeft: bi === 0 ? `3px solid ${c.color}` : undefined }}>
            {b.label}
          </th>
        )))}
      </tr>
      <tr>
        {companies.flatMap(c => buckets.map((b, bi) => (
          <Fragment key={`${c.key}-s-${bi}`}>
            <th className="num" style={{ borderLeft: bi === 0 ? `3px solid ${c.color}` : undefined }}>Giá trị</th>
            <th className="num">% {baseLabel}</th>
          </Fragment>
        )))}
      </tr>
    </thead>
  )
}

function ValueCells({ v, base, fmtS, boundary, color }: {
  v: number; base: number; fmtS: (v: number) => string; boundary: boolean; color: string
}) {
  const p = base !== 0 ? v / base * 100 : 0
  const pLabel = p.toFixed(1)
  const isZero = pLabel === '0.0' || pLabel === '-0.0'
  return (
    <>
      <td className="num" style={{ color: v < 0 ? '#DC2626' : undefined, borderLeft: boundary ? `3px solid ${color}` : undefined }}>{fmtS(v)}</td>
      <td className="num" style={{ color: isZero ? '#C7CCD6' : '#7C3AED', fontStyle: isZero ? 'normal' : 'italic' }}>{pLabel}%</td>
    </>
  )
}

// Các dòng tổng/kết quả quan trọng (DTT, Lãi gộp, LN thuần HĐKD, LN trước thuế, LN sau thuế) —
// bôi đậm để nổi bật giữa các dòng chi tiết, cùng quy ước với Phân tích ngang (xem TabPhanTichNgang).
const KEY_PL_MASO = new Set<string>([MS_PL.DTT, MS_PL.LAI_GOP, MS_PL.LN_THUAN_HDKD, MS_PL.LN_TRUOC_THUE, MS_PL.LN_SAU_THUE])

// PL là số phát sinh trong kỳ nên mỗi cột kỳ (bucket) = tổng dồn các tháng thuộc kỳ đó (giống cách
// Phân tích ngang gộp Quý/Năm) — KHÁC với BS (số dư tại 1 thời điểm, xem endOfBucket bên dưới).
function sumOverBucket(item: LineItem | undefined, periods: string[]): number {
  return periods.reduce((s, p) => s + (item?.values[p] ?? 0), 0)
}

function PlCommonSizeTable({ title, icon, rows, companies, buckets, plByCompany, fmtS }: {
  title: string; icon: string; rows: LineItem[]; companies: CompanyCol[]; buckets: PeriodBucket[]
  plByCompany: Record<string, Map<string, LineItem>>
  fmtS: (v: number) => string
}) {
  return (
    <div className="panel">
      <div className="panel-h"><span>{icon} {title}</span><span className="panel-badge">% TRÊN DTT</span></div>
      <div className="panel-b" style={{ overflowX: 'auto' }}>
        <table className="stbl">
          <CommonSizeHead companies={companies} buckets={buckets} baseLabel="DTT" />
          <tbody>
            {rows.map(row => (
              <tr key={row.maSo} className={KEY_PL_MASO.has(row.maSo) ? 'bold' : ''}>
                <td className="lbl">{row.chiTieu}</td>
                {companies.flatMap(c => {
                  const map = plByCompany[c.key]
                  const item = map.get(row.maSo)
                  const dttItem = map.get(MS_PL.DTT)
                  return buckets.map((b, bi) => (
                    <ValueCells key={`${c.key}-${bi}`} v={sumOverBucket(item, b.periods)} base={sumOverBucket(dttItem, b.periods)} fmtS={fmtS} boundary={bi === 0} color={c.color} />
                  ))
                })}
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
function BsCommonSizeTable({ title, icon, rows, companies, buckets, bucketEndPeriods, bsByCompany, fmtS }: {
  title: string; icon: string; rows: LineItem[]; companies: CompanyCol[]; buckets: PeriodBucket[]; bucketEndPeriods: (string | null)[]
  bsByCompany: Record<string, Map<string, LineItem>>
  fmtS: (v: number) => string
}) {
  const groups = groupBsItems(rows)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (maSo: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(maSo)) next.delete(maSo); else next.add(maSo)
    return next
  })

  const cellsFor = (maSo: string) => companies.flatMap(c => {
    const item = bsByCompany[c.key].get(maSo)
    const tongTsItem = bsByCompany[c.key].get(MS_BS.TONG_TS)
    return bucketEndPeriods.map((p, bi) => (
      <ValueCells key={`${c.key}-${bi}`} v={p ? (item?.values[p] ?? 0) : 0} base={p ? (tongTsItem?.values[p] ?? 0) : 0} fmtS={fmtS} boundary={bi === 0} color={c.color} />
    ))
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
          <CommonSizeHead companies={companies} buckets={buckets} baseLabel="TỔNG TS" />
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
                    {cellsFor(node.item.maSo)}
                  </tr>
                  {canToggle && isOpen && node.children.map(child => (
                    <tr key={child.maSo}>
                      <td className="lbl indent">{child.chiTieu}</td>
                      {cellsFor(child.maSo)}
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

export function TabPhanTichDoc({ docs, donViList, pf, fmtS, unitLbl }: Props) {
  const companies: CompanyCol[] = useMemo(() => {
    const list = [{ key: ALL_DONVI, label: 'Hợp nhất' }, ...donViList.map(d => ({ key: d.key, label: d.label }))]
    return list.map((c, i) => ({ ...c, color: COMPANY_PALETTE[i % COMPANY_PALETTE.length] }))
  }, [donViList])

  // 4 cột kỳ gần nhất, đúng theo granularity đang chọn ở bộ lọc Kỳ (Năm/Quý/Tháng) — dùng lại
  // pf.buckets() đã có sẵn cho Phân tích ngang, để 2 tab luôn nhất quán cách gộp kỳ.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buckets = useMemo(() => pf.buckets(4), [pf.mode, pf.year, pf.quarter, pf.month, pf.periods])
  const allPeriods = useMemo(() => [...new Set(buckets.flatMap(b => b.periods))], [buckets])

  const plRows = useMemo(() => buildLineItemMatrix(docs, 'PL', ALL_DONVI, allPeriods), [docs, allPeriods])
  const bsRows = useMemo(() => buildLineItemMatrix(docs, 'BS', ALL_DONVI, allPeriods), [docs, allPeriods])

  const plByCompany = useMemo(() => {
    const out: Record<string, Map<string, LineItem>> = {}
    for (const c of companies) {
      const items = c.key === ALL_DONVI ? plRows : buildLineItemMatrix(docs, 'PL', c.key, allPeriods)
      out[c.key] = new Map(items.map(i => [i.maSo, i]))
    }
    return out
  }, [docs, companies, allPeriods, plRows])

  const bsByCompany = useMemo(() => {
    const out: Record<string, Map<string, LineItem>> = {}
    for (const c of companies) {
      const items = c.key === ALL_DONVI ? bsRows : buildLineItemMatrix(docs, 'BS', c.key, allPeriods)
      out[c.key] = new Map(items.map(i => [i.maSo, i]))
    }
    return out
  }, [docs, companies, allPeriods, bsRows])

  // BS là số dư tại 1 thời điểm — mỗi bucket (Quý/Năm) chốt vào tháng CUỐI CÙNG thực sự có số liệu
  // (không phải tháng cuối cùng theo lịch, có thể còn trống nếu chưa đồng bộ) — chọn theo Hợp nhất
  // làm mốc chung cho mọi công ty, cùng quy ước với snapshotPeriod ở page.tsx.
  const tongTsAllItem = useMemo(() => bsRows.find(i => i.maSo === MS_BS.TONG_TS), [bsRows])
  const bucketEndPeriods = useMemo(() => buckets.map(b => {
    for (let i = b.periods.length - 1; i >= 0; i--) {
      if ((tongTsAllItem?.values[b.periods[i]] ?? 0) !== 0) return b.periods[i]
    }
    return b.periods[b.periods.length - 1] ?? null
  }), [buckets, tongTsAllItem])

  const modeLabel = pf.mode === 'year' ? 'năm' : pf.mode === 'quarter' ? 'quý' : 'tháng'

  return (
    <>
      <div className="tc-sub">So sánh biến động cơ cấu {buckets.length} {modeLabel} gần nhất giữa các công ty (đơn vị: {unitLbl})</div>
      <PlCommonSizeTable title="Kết quả kinh doanh — Phân tích dọc" icon="📈" rows={plRows} companies={companies} buckets={buckets} plByCompany={plByCompany} fmtS={fmtS} />
      <BsCommonSizeTable title="Cân đối kế toán — Phân tích dọc" icon="⚖" rows={bsRows} companies={companies} buckets={buckets} bucketEndPeriods={bucketEndPeriods} bsByCompany={bsByCompany} fmtS={fmtS} />
    </>
  )
}
