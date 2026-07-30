'use client'
import { useEffect, useMemo, useState } from 'react'
import { get, ref } from 'firebase/database'
import { getDb } from '@/lib/firebase'
import { useDashUnit } from '@/contexts/dash-unit'
import { useTopbarInfo } from '@/contexts/topbar-info'
import { ALL_DONVI, DonViInfo, RawBctc } from './_lib/types'
import { computeSnapshot, FlatDoc, flattenBctc, hasSnapshotData, listDonVi, listPeriods } from './_lib/compute'
import { moneyFmt } from './_lib/format'
import { Granularity, usePeriodFilter } from './_lib/usePeriodFilter'
import { TabTongQuan } from './_tabs/TabTongQuan'
import { TabPhanTichNgang } from './_tabs/TabPhanTichNgang'
import { TabPhanTichDoc } from './_tabs/TabPhanTichDoc'
import { TabSucKhoeTaiChinh } from './_tabs/TabSucKhoeTaiChinh'
import { TabSanPham } from './_tabs/TabSanPham'
import { TabCongNo } from './_tabs/TabCongNo'
import { TabNganSach } from './_tabs/TabNganSach'

type TabKey = 'tongquan' | 'ngang' | 'doc' | 'suckhoe' | 'sanpham' | 'congno' | 'ngansach'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'tongquan', label: 'Tổng quan', icon: '📊' },
  { key: 'ngang', label: 'Phân tích ngang', icon: '↔' },
  { key: 'doc', label: 'Phân tích dọc', icon: '↕' },
  { key: 'suckhoe', label: 'Tỷ lệ tài chính', icon: '⚖' },
  { key: 'sanpham', label: 'Sản phẩm', icon: '📦' },
  { key: 'congno', label: 'Công nợ', icon: '🧾' },
  { key: 'ngansach', label: 'Ngân sách chi phí', icon: '💰' },
]

// Bản compact cho thanh bộ lọc gắn vào Topbar chung (nền sáng, khác nền navy của module) — xem
// contexts/topbar-info.tsx (setLeft/setRight, đã có sẵn cho ngan-sach dùng theo đúng cách này).
const TOPBAR_STYLE = `
  .tb-filters{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow-x:auto;max-width:100%}
  .tb-flabel{font-size:9.5px;font-weight:700;color:#8A94A6;text-transform:uppercase;letter-spacing:.05em;flex-shrink:0}
  .tb-pillgroup{display:flex;gap:3px;flex-shrink:0}
  .tb-pill{background:#F3F5F8;border:1px solid #E0E7F0;color:#4B6A8A;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
  .tb-pill:hover{background:#EEF3FA;color:#1C3557}
  .tb-pill.act{background:#1C3557;border-color:#1C3557;color:#fff}
  .tb-pill:disabled{opacity:.4;cursor:not-allowed}
  .tb-sel{background:#fff;border:1px solid #E0E7F0;color:#1C3557;padding:3px 6px;border-radius:6px;font-size:11px;font-family:inherit;cursor:pointer;font-weight:600;flex-shrink:0}
  .tb-vsep{width:1px;height:16px;background:#E0E7F0;flex-shrink:0}
  .tb-unit{display:inline-flex;border-radius:12px;overflow:hidden;background:#F3F5F8;border:1px solid #E0E7F0}
  .tb-unit button{padding:3px 9px;font-size:11px;font-weight:700;border:none;background:transparent;color:#8A94A6;cursor:pointer;font-family:inherit}
  .tb-unit button.act{background:#D4A64A;color:#1C3557}
`

// Đã thu gọn chữ/khoảng cách toàn bộ (padding, font-size) so với bản đầu để nhiều dữ liệu vừa
// màn hình hơn, đỡ phải cuộn — áp dụng chung cho mọi tab dùng các class này.
const STYLE = `
  .tc{flex:1;padding:14px 20px 24px;overflow-y:auto;background:#FAF8F3;--gold:#D4A64A;font-size:13px}
  .tc-sub{font-size:11px;color:#9CA3AF;margin-bottom:10px}

  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
  .grid2{display:grid;grid-template-columns:1.15fr 1fr;gap:12px;margin-bottom:12px;align-items:start}
  .grid2-even{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;align-items:start}
  .col-stack{display:flex;flex-direction:column;gap:12px}

  .kcard{background:#fff;border-radius:10px;border:1px solid #E0E7F0;border-left:3px solid var(--accent,#1C3557);box-shadow:0 1px 2px rgba(28,53,87,.05);padding:10px 12px}
  .kcard-h{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8A94A6;margin-bottom:7px;display:flex;align-items:center;gap:5px}
  .kcard-h .dot{width:6px;height:6px;border-radius:50%;background:var(--accent,#1C3557);flex-shrink:0}
  .kcard-v{font-family:var(--font-display,inherit);font-size:18px;font-weight:800;line-height:1.15;color:#1C2B3D;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
  .kcard-u{font-size:11px;font-weight:600;color:#9CA3AF;margin-left:3px}
  .kcard-s{font-size:10.5px;color:#8A94A6;margin-top:5px}

  .panel{background:#fff;border:1px solid #E0E7F0;border-radius:10px;overflow:hidden;margin-bottom:12px;box-shadow:0 1px 2px rgba(28,53,87,.04)}
  .panel-h{padding:7px 12px;background:#EEF3FA;border-bottom:1px solid #D9E3EF;font-size:10px;font-weight:700;letter-spacing:.04em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .panel-h span:last-child{color:#1C3557;font-weight:800;font-size:11.5px;text-transform:none;letter-spacing:0;font-variant-numeric:tabular-nums;white-space:nowrap;font-family:var(--font-display,inherit)}
  .panel-b{padding:10px 12px}
  .panel-badge{background:#1C3557;color:var(--gold);font-size:9px;font-weight:700;padding:2px 8px;border-radius:9px;letter-spacing:.05em}

  .alert-row{display:flex;align-items:flex-start;gap:6px;padding:6px 10px;border-radius:7px;font-size:11px;margin-bottom:5px}
  .alert-red{background:#FDECEC;color:#8C1F1F;border:1px solid #FECACA}
  .alert-yellow{background:#FFF4E0;color:#8A5A12;border:1px solid #FDE68A}
  .alert-ok{background:#F0FDF4;color:#1F6B3D;border:1px solid #BBF7D0}

  .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700}
  .badge-good{background:#F0FDF4;color:#16A34A}
  .badge-warn{background:#FFF4E0;color:#D97706}
  .badge-bad{background:#FDECEC;color:#DC2626}
  .badge-neutral{background:#F3F4F6;color:#6B7280}

  .stbl{width:100%;border-collapse:collapse;font-size:11px}
  .stbl th{text-align:left;padding:5px 7px;font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#4B6A8A;background:#EEF3FA;border-bottom:1px solid #D0DCE8;white-space:nowrap}
  .stbl td{padding:4px 7px;border-bottom:1px solid #F3F6FB;color:#1C3557;white-space:nowrap}
  .stbl tbody tr:nth-child(even) td{background:#FBFCFE}
  .stbl tr:hover td{background:#F3F7FC}
  .stbl .num{text-align:right;font-variant-numeric:tabular-nums}
  .stbl .lbl{text-align:left;white-space:normal;min-width:170px}
  .stbl .bold td{font-weight:700;border-top:1.5px solid #D0DCE8}
  .stbl tr.grp td{font-weight:700;color:#1C3557;background:#F6F9FC;cursor:pointer}
  .stbl tr.grp:hover td{background:#EEF3FA}
  .stbl td.indent{padding-left:22px;color:#64748B;font-size:10.5px;font-weight:400}
  .tree-toggle{background:#fff;border:1px solid #D0DCE8;border-radius:4px;width:14px;height:14px;line-height:1;font-size:10px;font-weight:700;color:#4B6A8A;cursor:pointer;margin-right:5px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
  .tree-toggle:hover{background:#EEF3FA;border-color:var(--gold)}
  .tc-linkbtn{background:none;border:none;color:#4B6A8A;font-size:10px;font-weight:700;cursor:pointer;padding:0;font-family:inherit}
  .tc-linkbtn:hover{color:var(--gold)}

  .pn-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
  .pn-section td{background:#EEF3FA;color:#1C3557;font-weight:800;font-size:10px;letter-spacing:.03em;padding:5px 7px}
  .pn-section.nv td{background:#FDF6E3;color:#7A5A16}
  .pn-grouplabel{background:#F8FAFD;color:#1C3557;font-weight:700;font-size:9.5px;vertical-align:middle;border-right:1px solid #E7ECF2;text-align:left;padding:5px 5px;width:64px;white-space:normal;line-height:1.25}
  .stbl tr.pct td{color:#7C3AED;font-style:italic;font-size:10px}
  .stbl td.company-badge{background:#1C3557;color:#fff;font-weight:700;text-align:center;border-radius:5px;padding:3px 8px;font-size:10.5px}

  .pn-ratio-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:2px 0 6px;font-size:11px;font-weight:700;color:#4B6A8A}
  .pn-ratio-h span:last-child{color:#1C3557;font-weight:800;font-size:12.5px;font-family:var(--font-display,inherit)}
  .pn-ratio-tbl .lbl{min-width:0}
  .pn-ratio-tbl td.lbl{white-space:normal}
  .pn-ratio-tbl th.num{width:52px}
  .pn-ratio-label{font-weight:600;color:#1C2B3D}
  .pn-ratio-meta{font-size:9px;color:#9CA3AF;line-height:1.35}
  .pn-ratio-note{color:#B08A3E}

  .rpt{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
  .rpt col.c-stt{width:28px}
  .rpt col.c-ms{width:48px}
  .rpt col.c-val{width:110px}
  .rpt col.c-delta{width:64px}
  .rpt th{text-align:left;padding:5px 7px;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8A94A6;background:#F8FAFD;border-bottom:1px solid #E7ECF2}
  .rpt th.num,.rpt td.num{text-align:right}
  .rpt td{padding:4px 7px;border-bottom:1px solid #F1F4F8;color:#334155;font-variant-numeric:tabular-nums}
  .rpt td.lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1C2B3D}
  .rpt td.indent{padding-left:18px;color:#64748B;font-size:10.5px}
  .rpt tbody tr:hover td{background:#F7FAFD}
  .rpt tr.group td{font-weight:700;color:#1C3557;background:#F3F7FC}
  .rpt tr.bold td{font-weight:700;color:#1C3557;border-top:1.5px solid #D9E3EF;background:#FAFBFD}
  .rpt tr.total td{font-weight:800;color:#7A5A16;background:#FDF6E3;border-top:1.5px solid var(--gold)}
  .rpt td.neg{color:#DC2626}
  .rpt td.pos{color:#16A34A}

  .bd-row{margin-bottom:9px}
  .bd-row:last-child{margin-bottom:0}
  .bd-row.top{background:#FFFBEB;margin:-4px -6px 9px;padding:4px 6px 6px;border-radius:7px}
  .bd-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px}
  .bd-label{font-size:11px;color:#374151;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bd-row.top .bd-label{color:#1C3557;font-weight:700}
  .bd-right{display:flex;align-items:baseline;gap:6px;flex-shrink:0}
  .bd-value{font-size:11px;font-weight:700;color:#1C2B3D;font-variant-numeric:tabular-nums;white-space:nowrap}
  .bd-pct{font-size:9.5px;color:#9CA3AF;width:30px;text-align:right;font-variant-numeric:tabular-nums}
  .bd-track{height:5px;background:#EEF3FA;border-radius:3px;overflow:hidden}
  .bd-fill{height:100%;border-radius:3px}

  .gauge-row{padding:6px 0;border-bottom:1px solid #F1F4F8}
  .gauge-row:last-child{border-bottom:none}
  .gauge-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:2px}
  .gauge-name{font-size:11px;color:#374151;font-weight:600}
  .gauge-desc{font-size:10px;color:#9CA3AF;margin-top:1px}
  .gauge-val{font-family:var(--font-display,inherit);font-size:14px;font-weight:800;color:#1C3557;font-variant-numeric:tabular-nums}
  .gauge-track{height:4px;background:#EEF3FA;border-radius:3px;overflow:hidden;margin-top:4px}
  .gauge-fill{height:100%;border-radius:3px}
  .gauge-fill.good{background:#16A34A}
  .gauge-fill.warn{background:#D97706}
  .gauge-fill.bad{background:#DC2626}
  .gauge-fill.neutral{background:#9CA3AF}

  .chart-box{padding:10px 12px}
  .chart-label{font-size:10px;font-weight:700;color:#8A94A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px}
  .chart-legend{display:flex;gap:10px;flex-wrap:wrap}
  .chart-legend-item{display:flex;align-items:center;gap:4px;font-size:10px;color:#8A94A6}
  .chart-legend-dot{width:8px;height:8px;border-radius:2px}

  .product-card{border:1px solid #E0E7F0;border-radius:8px;padding:9px 11px;background:#fff}
  .product-card-name{font-weight:700;color:#1C3557;font-size:11.5px;margin-bottom:7px;display:flex;align-items:center;gap:6px}
  .product-metric{display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #F3F6FB}
  .product-metric:last-of-type{border-bottom:none}
  .product-metric-label{font-size:10px;color:#8A94A6}
  .product-metric-val{font-size:11px;font-weight:700;color:#1C3557;font-variant-numeric:tabular-nums}
  .product-bar{height:5px;background:#EEF3FA;border-radius:3px;margin-top:6px;overflow:hidden}
  .product-bar-fill{height:100%;border-radius:3px}

  .budget-input{width:100%;border:1px solid #E0E7F0;border-radius:5px;padding:3px 6px;font-size:10.5px;font-family:inherit;text-align:right;font-variant-numeric:tabular-nums;color:#1C3557}
  .budget-input:focus{outline:2px solid var(--gold);outline-offset:-1px;border-color:var(--gold)}
  .budget-saved{font-size:9px;color:#16A34A;margin-left:3px}
`

export default function TaiChinhPage() {
  const [raw, setRaw] = useState<RawBctc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    get(ref(getDb(), 'data_bctc'))
      .then(snap => setRaw(snap.exists() ? (snap.val() as RawBctc) : {}))
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  const docs = useMemo(() => flattenBctc(raw), [raw])
  const periods = useMemo(() => listPeriods(docs), [docs])
  const donViList = useMemo(() => listDonVi(docs), [docs])

  // Kỳ mặc định = kỳ gần nhất THỰC SỰ có số liệu (không phải kỳ cuối cùng trong mảng, có thể là
  // tháng tương lai còn trống trong Sheet) — tính trên "Hợp nhất" để không phụ thuộc lựa chọn đơn vị.
  const defaultMonth = useMemo(() => {
    for (let i = periods.length - 1; i >= 0; i--) {
      if (hasSnapshotData(computeSnapshot(docs, ALL_DONVI, periods[i]))) return periods[i]
    }
    return periods[periods.length - 1] ?? ''
  }, [docs, periods])

  return (
    <>
      <style>{STYLE}</style>
      <style>{TOPBAR_STYLE}</style>
      <div className="tc">
        {loading && (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 14 }}>
            ⏳ Đang tải dữ liệu tài chính...
          </div>
        )}
        {!loading && error && (
          <div style={{ margin: 24, padding: 16, background: '#FDECEC', borderRadius: 8, color: '#8C1F1F' }}>⚠ {error}</div>
        )}
        {!loading && !error && periods.length === 0 && (
          <div style={{ margin: 24, padding: 16, background: '#EEF3FA', borderRadius: 8, color: '#4B6A8A' }}>
            Chưa có dữ liệu tại <code>data_bctc</code>. Chạy “🔄 Đồng bộ Firebase” trong Google Sheet BCTC trước.
          </div>
        )}
        {!loading && !error && periods.length > 0 && (
          <TaiChinhShell key={periods.join('|')} docs={docs} periods={periods} donViList={donViList} defaultMonth={defaultMonth} />
        )}
      </div>
    </>
  )
}

function TaiChinhShell({ docs, periods, donViList, defaultMonth }: {
  docs: FlatDoc[]; periods: string[]; donViList: DonViInfo[]; defaultMonth: string
}) {
  const { unit, setUnit } = useDashUnit()
  const { setLeft, setRight } = useTopbarInfo()
  const [donViKey, setDonViKey] = useState<string>(ALL_DONVI)
  const [tab, setTab] = useState<TabKey>('tongquan')
  const pf = usePeriodFilter(periods, defaultMonth)

  const snapshotPeriod = pf.selectedPeriods[pf.selectedPeriods.length - 1] ?? ''
  const { fmtS, unitLbl } = moneyFmt(unit)
  const donViLabel = donViKey === ALL_DONVI ? 'Hợp nhất Sơn An Group' : (donViList.find(d => d.key === donViKey)?.label ?? donViKey)

  // Bộ lọc đơn vị/kỳ chuyển lên Topbar chung (giữa, trước Admin) để nhường chỗ cho dữ liệu — dùng
  // đúng cơ chế setLeft/setRight có sẵn (xem app/(authenticated)/ngan-sach/page.tsx làm tương tự).
  useEffect(() => {
    setLeft(
      <div className="tb-filters">
        <div className="tb-pillgroup">
          {TABS.map(t => (
            <button key={t.key} className={`tb-pill${tab === t.key ? ' act' : ''}`} onClick={() => setTab(t.key)} title={t.label}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="tb-vsep" />
        <span className="tb-flabel">Đơn vị</span>
        <div className="tb-pillgroup">
          <button className={`tb-pill${donViKey === ALL_DONVI ? ' act' : ''}`} onClick={() => setDonViKey(ALL_DONVI)}>Hợp nhất</button>
          {donViList.map(d => (
            <button key={d.key} className={`tb-pill${donViKey === d.key ? ' act' : ''}`} onClick={() => setDonViKey(d.key)}>{d.label}</button>
          ))}
        </div>
        <div className="tb-vsep" />
        <span className="tb-flabel">Kỳ</span>
        <div className="tb-pillgroup">
          {([['year', 'Năm'], ['quarter', 'Quý'], ['month', 'Tháng']] as [Granularity, string][]).map(([m, l]) => (
            <button key={m} className={`tb-pill${pf.mode === m ? ' act' : ''}`} onClick={() => pf.setMode(m)}>{l}</button>
          ))}
        </div>
        <select className="tb-sel" value={pf.year} onChange={e => pf.setYear(e.target.value)}>
          {pf.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {pf.mode === 'quarter' && (
          <select className="tb-sel" value={pf.quarter} onChange={e => pf.setQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map(q => <option key={q} value={q}>Quý {q}</option>)}
          </select>
        )}
        {pf.mode === 'month' && (
          <select className="tb-sel" value={pf.month} onChange={e => pf.setMonth(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => `${pf.year}-${String(i + 1).padStart(2, '0')}`).map((p, i) => (
              <option key={p} value={p} disabled={!periods.includes(p)}>Tháng {i + 1}</option>
            ))}
          </select>
        )}
      </div>,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setLeft, tab, donViKey, donViList, pf.mode, pf.year, pf.quarter, pf.month, pf.years, periods])

  useEffect(() => {
    setRight(
      <div className="tb-unit">
        {(['đ', 'tr', 'tỷ'] as const).map(u => (
          <button key={u} className={unit === u ? 'act' : ''} onClick={() => setUnit(u)}>{u}</button>
        ))}
      </div>,
    )
  }, [setRight, unit, setUnit])

  useEffect(() => () => { setLeft(null); setRight(null) }, [setLeft, setRight])

  return (
    <>
      {tab === 'tongquan' && (
        <TabTongQuan docs={docs} donViKey={donViKey} donViLabel={donViLabel} periods={periods} snapshotPeriod={snapshotPeriod} fmtS={fmtS} unitLbl={unitLbl} />
      )}
      {tab === 'ngang' && (
        <TabPhanTichNgang docs={docs} donViKey={donViKey} donViLabel={donViLabel} pf={pf} fmtS={fmtS} unitLbl={unitLbl} />
      )}
      {tab === 'doc' && (
        <TabPhanTichDoc docs={docs} donViKey={donViKey} snapshotPeriod={snapshotPeriod} periods={periods} fmtS={fmtS} unitLbl={unitLbl} />
      )}
      {tab === 'suckhoe' && (
        <TabSucKhoeTaiChinh docs={docs} donViKey={donViKey} periods={periods} snapshotPeriod={snapshotPeriod} donViLabel={donViLabel} />
      )}
      {tab === 'sanpham' && (
        <TabSanPham docs={docs} donViKey={donViKey} pf={pf} fmtS={fmtS} unitLbl={unitLbl} />
      )}
      {tab === 'congno' && (
        <TabCongNo docs={docs} donViKey={donViKey} period={snapshotPeriod} snapshot={computeSnapshot(docs, donViKey, snapshotPeriod)} fmtS={fmtS} unitLbl={unitLbl} />
      )}
      {tab === 'ngansach' && (
        <TabNganSach docs={docs} donViKey={donViKey} pf={pf} fmtS={fmtS} unitLbl={unitLbl} />
      )}
    </>
  )
}
