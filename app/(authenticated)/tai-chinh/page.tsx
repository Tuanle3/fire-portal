'use client'
import { useEffect, useMemo, useState } from 'react'
import { get, ref } from 'firebase/database'
import { getDb } from '@/lib/firebase'
import { useDashUnit } from '@/contexts/dash-unit'
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

const STYLE = `
  .tc{flex:1;padding:20px 28px 32px;overflow-y:auto;background:#FAF8F3;--gold:#D4A64A}
  .tc-pillbar{background:#1C3557;border-radius:12px;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .tc-flabel{color:rgba(255,255,255,.5);font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
  .tc-pillgroup{display:flex;gap:6px;flex-wrap:wrap}
  .pill{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.72);padding:5px 13px;border-radius:20px;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap}
  .pill:hover{background:rgba(212,166,74,.18);border-color:rgba(212,166,74,.5);color:var(--gold)}
  .pill.act{background:var(--gold);border-color:var(--gold);color:#1C3557;font-weight:700}
  .pill:disabled{opacity:.35;cursor:not-allowed}
  .tc-vsep{width:1px;height:20px;background:rgba(255,255,255,.14)}
  .tc-sel{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.9);padding:5px 11px;border-radius:6px;font-size:12px;font-family:inherit;cursor:pointer}
  .tc-sel option{background:#132840;color:#fff}
  .tc-unit{display:inline-flex;border-radius:20px;overflow:hidden;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16)}
  .tc-unit button{padding:5px 12px;font-size:12px;font-weight:700;border:none;background:transparent;color:rgba(255,255,255,.6);cursor:pointer;font-family:inherit}
  .tc-unit button.act{background:var(--gold);color:#1C3557}

  .tabnav{display:flex;gap:2px;flex-wrap:wrap;background:#fff;border:1px solid #E0E7F0;border-radius:12px;padding:4px;margin-bottom:20px}
  .tabnav-btn{padding:9px 16px;font-size:12.5px;font-weight:600;color:#6B7280;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;border-radius:8px;display:inline-flex;align-items:center;gap:6px}
  .tabnav-btn:hover{color:#1C3557;background:#FAFBFD}
  .tabnav-btn.act{color:#1C3557;border-bottom-color:var(--gold);background:#FAFBFD;font-weight:700}
  .tc-sub{font-size:12px;color:#9CA3AF;margin-bottom:16px}

  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}
  .grid2{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;margin-bottom:20px;align-items:start}
  .grid2-even{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;align-items:start}
  .col-stack{display:flex;flex-direction:column;gap:20px}

  .kcard{background:#fff;border-radius:12px;border:1px solid #E0E7F0;border-left:3px solid var(--accent,#1C3557);box-shadow:0 1px 2px rgba(28,53,87,.05);padding:16px 18px}
  .kcard-h{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A94A6;margin-bottom:11px;display:flex;align-items:center;gap:6px}
  .kcard-h .dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#1C3557);flex-shrink:0}
  .kcard-v{font-family:var(--font-display,inherit);font-size:23px;font-weight:800;line-height:1.15;color:#1C2B3D;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
  .kcard-u{font-size:13px;font-weight:600;color:#9CA3AF;margin-left:3px}
  .kcard-s{font-size:11.5px;color:#8A94A6;margin-top:7px}

  .panel{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 2px rgba(28,53,87,.04)}
  .panel-h{padding:12px 18px;background:#EEF3FA;border-bottom:1px solid #D9E3EF;font-size:11px;font-weight:700;letter-spacing:.05em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .panel-h span:last-child{color:#1C3557;font-weight:800;font-size:12.5px;text-transform:none;letter-spacing:0;font-variant-numeric:tabular-nums;white-space:nowrap;font-family:var(--font-display,inherit)}
  .panel-b{padding:18px 20px}
  .panel-badge{background:#1C3557;color:var(--gold);font-size:9.5px;font-weight:700;padding:2px 9px;border-radius:10px;letter-spacing:.06em}

  .alert-row{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:8px;font-size:12.5px;margin-bottom:6px}
  .alert-red{background:#FDECEC;color:#8C1F1F;border:1px solid #FECACA}
  .alert-yellow{background:#FFF4E0;color:#8A5A12;border:1px solid #FDE68A}
  .alert-ok{background:#F0FDF4;color:#1F6B3D;border:1px solid #BBF7D0}

  .badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700}
  .badge-good{background:#F0FDF4;color:#16A34A}
  .badge-warn{background:#FFF4E0;color:#D97706}
  .badge-bad{background:#FDECEC;color:#DC2626}
  .badge-neutral{background:#F3F4F6;color:#6B7280}

  .stbl{width:100%;border-collapse:collapse;font-size:12.5px}
  .stbl th{text-align:left;padding:9px 10px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4B6A8A;background:#EEF3FA;border-bottom:1px solid #D0DCE8;white-space:nowrap}
  .stbl td{padding:8px 10px;border-bottom:1px solid #F3F6FB;color:#1C3557;white-space:nowrap}
  .stbl tbody tr:nth-child(even) td{background:#FBFCFE}
  .stbl tr:hover td{background:#F3F7FC}
  .stbl .num{text-align:right;font-variant-numeric:tabular-nums}
  .stbl .lbl{text-align:left;white-space:normal;min-width:220px}
  .stbl .bold td{font-weight:700;border-top:1.5px solid #D0DCE8}

  .rpt{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}
  .rpt col.c-stt{width:36px}
  .rpt col.c-ms{width:60px}
  .rpt col.c-val{width:130px}
  .rpt col.c-delta{width:76px}
  .rpt th{text-align:left;padding:9px 10px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8A94A6;background:#F8FAFD;border-bottom:1px solid #E7ECF2}
  .rpt th.num,.rpt td.num{text-align:right}
  .rpt td{padding:8px 10px;border-bottom:1px solid #F1F4F8;color:#334155;font-variant-numeric:tabular-nums}
  .rpt td.lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1C2B3D}
  .rpt td.indent{padding-left:22px;color:#64748B;font-size:12px}
  .rpt tbody tr:hover td{background:#F7FAFD}
  .rpt tr.group td{font-weight:700;color:#1C3557;background:#F3F7FC}
  .rpt tr.bold td{font-weight:700;color:#1C3557;border-top:1.5px solid #D9E3EF;background:#FAFBFD}
  .rpt tr.total td{font-weight:800;color:#7A5A16;background:#FDF6E3;border-top:1.5px solid var(--gold)}
  .rpt td.neg{color:#DC2626}
  .rpt td.pos{color:#16A34A}

  .bd-row{margin-bottom:13px}
  .bd-row:last-child{margin-bottom:0}
  .bd-row.top{background:#FFFBEB;margin:-6px -8px 13px;padding:6px 8px 8px;border-radius:8px}
  .bd-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:5px}
  .bd-label{font-size:12.5px;color:#374151;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bd-row.top .bd-label{color:#1C3557;font-weight:700}
  .bd-right{display:flex;align-items:baseline;gap:8px;flex-shrink:0}
  .bd-value{font-size:12.5px;font-weight:700;color:#1C2B3D;font-variant-numeric:tabular-nums;white-space:nowrap}
  .bd-pct{font-size:11px;color:#9CA3AF;width:34px;text-align:right;font-variant-numeric:tabular-nums}
  .bd-track{height:6px;background:#EEF3FA;border-radius:3px;overflow:hidden}
  .bd-fill{height:100%;border-radius:3px}

  .gauge-row{padding:10px 0;border-bottom:1px solid #F1F4F8}
  .gauge-row:last-child{border-bottom:none}
  .gauge-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:3px}
  .gauge-name{font-size:12.5px;color:#374151;font-weight:600}
  .gauge-desc{font-size:11px;color:#9CA3AF;margin-top:1px}
  .gauge-val{font-family:var(--font-display,inherit);font-size:17px;font-weight:800;color:#1C3557;font-variant-numeric:tabular-nums}
  .gauge-track{height:5px;background:#EEF3FA;border-radius:3px;overflow:hidden;margin-top:6px}
  .gauge-fill{height:100%;border-radius:3px}
  .gauge-fill.good{background:#16A34A}
  .gauge-fill.warn{background:#D97706}
  .gauge-fill.bad{background:#DC2626}
  .gauge-fill.neutral{background:#9CA3AF}

  .chart-box{padding:16px 18px}
  .chart-label{font-size:11px;font-weight:700;color:#8A94A6;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
  .chart-legend{display:flex;gap:12px;flex-wrap:wrap}
  .chart-legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#8A94A6}
  .chart-legend-dot{width:9px;height:9px;border-radius:2px}

  .product-card{border:1px solid #E0E7F0;border-radius:10px;padding:14px 16px;background:#fff}
  .product-card-name{font-weight:700;color:#1C3557;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
  .product-metric{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #F3F6FB}
  .product-metric:last-of-type{border-bottom:none}
  .product-metric-label{font-size:11px;color:#8A94A6}
  .product-metric-val{font-size:13px;font-weight:700;color:#1C3557;font-variant-numeric:tabular-nums}
  .product-bar{height:6px;background:#EEF3FA;border-radius:3px;margin-top:9px;overflow:hidden}
  .product-bar-fill{height:100%;border-radius:3px}

  .budget-input{width:100%;border:1px solid #E0E7F0;border-radius:6px;padding:5px 7px;font-size:12px;font-family:inherit;text-align:right;font-variant-numeric:tabular-nums;color:#1C3557}
  .budget-input:focus{outline:2px solid var(--gold);outline-offset:-1px;border-color:var(--gold)}
  .budget-saved{font-size:10px;color:#16A34A;margin-left:4px}
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
  const [donViKey, setDonViKey] = useState<string>(ALL_DONVI)
  const [tab, setTab] = useState<TabKey>('tongquan')
  const pf = usePeriodFilter(periods, defaultMonth)

  const snapshotPeriod = pf.selectedPeriods[pf.selectedPeriods.length - 1] ?? ''
  const { fmtS, unitLbl } = moneyFmt(unit)
  const donViLabel = donViKey === ALL_DONVI ? 'Hợp nhất Sơn An Group' : (donViList.find(d => d.key === donViKey)?.label ?? donViKey)

  return (
    <>
      <div className="tc-pillbar">
        <span className="tc-flabel">Đơn vị</span>
        <div className="tc-pillgroup">
          <button className={`pill${donViKey === ALL_DONVI ? ' act' : ''}`} onClick={() => setDonViKey(ALL_DONVI)}>Hợp nhất</button>
          {donViList.map(d => (
            <button key={d.key} className={`pill${donViKey === d.key ? ' act' : ''}`} onClick={() => setDonViKey(d.key)}>{d.label}</button>
          ))}
        </div>
        <div className="tc-vsep" />
        <span className="tc-flabel">Kỳ</span>
        <div className="tc-pillgroup">
          {([['year', 'Năm'], ['quarter', 'Quý'], ['month', 'Tháng']] as [Granularity, string][]).map(([m, l]) => (
            <button key={m} className={`pill${pf.mode === m ? ' act' : ''}`} onClick={() => pf.setMode(m)}>{l}</button>
          ))}
        </div>
        <select className="tc-sel" value={pf.year} onChange={e => pf.setYear(e.target.value)}>
          {pf.years.map(y => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        {pf.mode === 'quarter' && (
          <div className="tc-pillgroup">
            {[1, 2, 3, 4].map(q => (
              <button key={q} className={`pill${pf.quarter === q ? ' act' : ''}`} onClick={() => pf.setQuarter(q)}>Q{q}</button>
            ))}
          </div>
        )}
        {pf.mode === 'month' && (
          <div className="tc-pillgroup">
            {Array.from({ length: 12 }, (_, i) => `${pf.year}-${String(i + 1).padStart(2, '0')}`).map((p, i) => (
              <button key={p} className={`pill${pf.month === p ? ' act' : ''}`} disabled={!periods.includes(p)} onClick={() => pf.setMonth(p)}>Th.{i + 1}</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div className="tc-unit">
          {(['đ', 'tr', 'tỷ'] as const).map(u => (
            <button key={u} className={unit === u ? 'act' : ''} onClick={() => setUnit(u)}>{u}</button>
          ))}
        </div>
      </div>

      <div className="tabnav">
        {TABS.map(t => (
          <button key={t.key} className={`tabnav-btn${tab === t.key ? ' act' : ''}`} onClick={() => setTab(t.key)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'tongquan' && (
        <TabTongQuan docs={docs} donViKey={donViKey} donViLabel={donViLabel} periods={periods} snapshotPeriod={snapshotPeriod} fmtS={fmtS} unitLbl={unitLbl} />
      )}
      {tab === 'ngang' && (
        <TabPhanTichNgang docs={docs} donViKey={donViKey} pf={pf} fmtS={fmtS} unitLbl={unitLbl} />
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
