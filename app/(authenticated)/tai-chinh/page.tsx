'use client'
import { useEffect, useMemo, useState } from 'react'
import { get, ref } from 'firebase/database'
import { getDb } from '@/lib/firebase'
import { useDashUnit } from '@/contexts/dash-unit'
import { ALL_DONVI, RawBctc } from './_lib/types'
import { buildAlerts, computeRatios, computeSnapshot, flattenBctc, hasSnapshotData, listDonVi, listPeriods } from './_lib/compute'
import { moneyFmt, periodLabel } from './_lib/format'
import { TabTongQuan } from './_tabs/TabTongQuan'
import { TabSucKhoeTaiChinh } from './_tabs/TabSucKhoeTaiChinh'
import { TabKQKD } from './_tabs/TabKQKD'
import { TabCanDoiKT } from './_tabs/TabCanDoiKT'
import { TabCongNo } from './_tabs/TabCongNo'

type TabKey = 'tongquan' | 'suckhoe' | 'kqkd' | 'candoiKT' | 'congno'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'tongquan', label: 'Tổng quan', icon: '⊞' },
  { key: 'suckhoe', label: 'Sức khỏe tài chính', icon: '❤' },
  { key: 'kqkd', label: 'Kết quả KD', icon: '📈' },
  { key: 'candoiKT', label: 'Cân đối kế toán', icon: '⚖' },
  { key: 'congno', label: 'Công nợ', icon: '🧾' },
]

export default function TaiChinhPage() {
  const { unit, setUnit } = useDashUnit()
  const [raw, setRaw] = useState<RawBctc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [donViKey, setDonViKey] = useState<string>(ALL_DONVI)
  const [periodOverride, setPeriodOverride] = useState<string>('')
  const [tab, setTab] = useState<TabKey>('tongquan')

  useEffect(() => {
    get(ref(getDb(), 'data_bctc'))
      .then(snap => setRaw(snap.exists() ? (snap.val() as RawBctc) : {}))
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  const docs = useMemo(() => flattenBctc(raw), [raw])
  const donViList = useMemo(() => listDonVi(docs), [docs])
  const periods = useMemo(() => listPeriods(docs), [docs])

  const historyAll = useMemo(() => periods.map(p => computeSnapshot(docs, donViKey, p)), [docs, donViKey, periods])

  // Mặc định = kỳ gần nhất THỰC SỰ có số liệu BS/PL (không phải kỳ cuối cùng trong danh sách —
  // các kỳ tương lai trong Sheet thường là cột trống chưa nhập, chọn kỳ đó mặc định sẽ hiện toàn 0
  // và trông như "không có cảnh báo" một cách sai lệch).
  const lastPeriodWithData = [...historyAll].reverse().find(hasSnapshotData)?.period
  const defaultPeriod = lastPeriodWithData ?? periods[periods.length - 1] ?? ''
  const period = periods.includes(periodOverride) ? periodOverride : defaultPeriod
  const setPeriod = setPeriodOverride

  const periodIdx = periods.indexOf(period)
  const snapshot = periodIdx >= 0 ? historyAll[periodIdx] : null
  const history = periodIdx >= 0 ? historyAll.slice(0, periodIdx + 1) : []
  const ratios = snapshot ? computeRatios(snapshot) : null
  const snapshotHasData = snapshot ? hasSnapshotData(snapshot) : false
  const alerts = snapshot && ratios && snapshotHasData ? buildAlerts(snapshot, ratios, history) : []

  const { fmt, fmtS, unitLbl } = moneyFmt(unit)
  const donViLabel = donViKey === ALL_DONVI ? 'Hợp nhất Sơn An Group' : (donViList.find(d => d.key === donViKey)?.label ?? donViKey)

  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 14 }}>
      ⏳ Đang tải dữ liệu tài chính...
    </div>
  )
  if (error) return (
    <div style={{ margin: 24, padding: 16, background: '#FDECEC', borderRadius: 8, color: '#8C1F1F' }}>⚠ {error}</div>
  )
  if (periods.length === 0) return (
    <div style={{ margin: 24, padding: 16, background: '#EEF3FA', borderRadius: 8, color: '#4B6A8A' }}>
      Chưa có dữ liệu tại <code>data_bctc</code>. Chạy “🔄 Đồng bộ Firebase” trong Google Sheet BCTC trước.
    </div>
  )

  return (
    <>
      <style>{`
        .tc{flex:1;padding:20px 28px 32px;overflow-y:auto;background:#FAF8F3}
        .tc-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
        .tc-sel{padding:8px 14px;border:1px solid #E0E7F0;border-radius:8px;font-size:12.5px;font-family:inherit;background:#fff;cursor:pointer;color:#1C3557;font-weight:600}
        .tc-unit{display:inline-flex;border:1px solid #E0E7F0;border-radius:8px;overflow:hidden;background:#fff}
        .tc-unit button{padding:8px 13px;font-size:12px;font-weight:700;border:none;background:transparent;color:#6B7280;cursor:pointer;font-family:inherit}
        .tc-unit button.act{background:#1C3557;color:#fff}
        .tc-tabs{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}
        .tc-tab{padding:9px 18px;font-size:12.5px;font-weight:700;border-radius:8px;border:1px solid #E0E7F0;background:#fff;cursor:pointer;color:#6B7280;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
        .tc-tab.act{background:#1C3557;color:#fff;border-color:#1C3557}
        .tc-sub{font-size:12px;color:#9CA3AF;margin-bottom:16px}

        .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
        .grid2{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;margin-bottom:20px;align-items:start}
        .col-stack{display:flex;flex-direction:column;gap:20px}

        .kcard{background:#fff;border-radius:12px;border:1px solid #E0E7F0;border-left:3px solid var(--accent,#1C3557);box-shadow:0 1px 2px rgba(28,53,87,.05);padding:16px 18px}
        .kcard-h{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A94A6;margin-bottom:11px;display:flex;align-items:center;gap:6px}
        .kcard-h .dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#1C3557);flex-shrink:0}
        .kcard-v{font-size:23px;font-weight:800;line-height:1.15;color:#1C2B3D;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
        .kcard-u{font-size:13px;font-weight:600;color:#9CA3AF;margin-left:3px}
        .kcard-s{font-size:11.5px;color:#8A94A6;margin-top:7px}

        .panel{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 2px rgba(28,53,87,.04)}
        .panel-h{padding:12px 18px;background:#EEF3FA;border-bottom:1px solid #D9E3EF;font-size:11px;font-weight:700;letter-spacing:.05em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;gap:10px}
        .panel-h span:last-child{color:#1C3557;font-weight:800;font-size:12.5px;text-transform:none;letter-spacing:0;font-variant-numeric:tabular-nums;white-space:nowrap}
        .panel-b{padding:18px 20px}

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
        .rpt col.c-val{width:150px}
        .rpt col.c-delta{width:76px}
        .rpt th{text-align:left;padding:9px 10px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8A94A6;background:#F8FAFD;border-bottom:1px solid #E7ECF2}
        .rpt th.num,.rpt td.num{text-align:right}
        .rpt td{padding:8px 10px;border-bottom:1px solid #F1F4F8;color:#334155;font-variant-numeric:tabular-nums}
        .rpt td.lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1C2B3D}
        .rpt tbody tr:hover td{background:#F7FAFD}
        .rpt tr.bold td{font-weight:700;color:#1C3557;border-top:1.5px solid #D9E3EF;background:#FAFBFD}
        .rpt td.neg{color:#DC2626}

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
      `}</style>

      <div className="tc">
        <div className="tc-toolbar">
          <select className="tc-sel" value={donViKey} onChange={e => setDonViKey(e.target.value)}>
            <option value={ALL_DONVI}>🏢 Hợp nhất Sơn An Group</option>
            {donViList.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <select className="tc-sel" value={period} onChange={e => setPeriod(e.target.value)}>
            {periods.map((p, i) => (
              <option key={p} value={p}>{periodLabel(p)}{hasSnapshotData(historyAll[i]) ? '' : ' (chưa có số liệu)'}</option>
            ))}
          </select>
          <div className="tc-unit">
            {(['đ', 'tr', 'tỷ'] as const).map(u => (
              <button key={u} className={unit === u ? 'act' : ''} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
        </div>

        <div className="tc-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`tc-tab${tab === t.key ? ' act' : ''}`} onClick={() => setTab(t.key)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {snapshot && ratios && (
          <>
            {tab === 'tongquan' && (
              <TabTongQuan snapshot={snapshot} ratios={ratios} alerts={alerts} hasData={snapshotHasData} fmt={fmt} fmtS={fmtS} unitLbl={unitLbl} donViLabel={donViLabel} />
            )}
            {tab === 'suckhoe' && (
              <TabSucKhoeTaiChinh history={history} donViLabel={donViLabel} />
            )}
            {tab === 'kqkd' && (
              <TabKQKD docs={docs} donViKey={donViKey} periods={periods} fmtS={fmtS} unitLbl={unitLbl} />
            )}
            {tab === 'candoiKT' && (
              <TabCanDoiKT docs={docs} donViKey={donViKey} periods={periods} fmtS={fmtS} unitLbl={unitLbl} />
            )}
            {tab === 'congno' && (
              <TabCongNo docs={docs} donViKey={donViKey} period={period} snapshot={snapshot} fmtS={fmtS} unitLbl={unitLbl} />
            )}
          </>
        )}
      </div>
    </>
  )
}
