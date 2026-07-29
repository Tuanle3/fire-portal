'use client'
import { useEffect, useMemo, useState } from 'react'
import { get, ref } from 'firebase/database'
import { getDb } from '@/lib/firebase'
import { useDashUnit } from '@/contexts/dash-unit'
import { ALL_DONVI, RawBctc } from './_lib/types'
import { buildAlerts, computeRatios, computeSnapshot, flattenBctc, listDonVi, listPeriods } from './_lib/compute'
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

  // Mặc định = kỳ mới nhất; người dùng có thể chọn kỳ khác qua toolbar (setPeriodOverride).
  const period = periods.includes(periodOverride) ? periodOverride : (periods[periods.length - 1] ?? '')
  const setPeriod = setPeriodOverride

  const historyAll = useMemo(() => periods.map(p => computeSnapshot(docs, donViKey, p)), [docs, donViKey, periods])
  const periodIdx = periods.indexOf(period)
  const snapshot = periodIdx >= 0 ? historyAll[periodIdx] : null
  const history = periodIdx >= 0 ? historyAll.slice(0, periodIdx + 1) : []
  const ratios = snapshot ? computeRatios(snapshot) : null
  const alerts = snapshot && ratios ? buildAlerts(snapshot, ratios, history) : []

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
        .tc{flex:1;padding:16px 24px 24px;overflow-y:auto;background:#FAF8F3}
        .tc-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
        .tc-sel{padding:7px 12px;border:1px solid #E0E7F0;border-radius:8px;font-size:12.5px;font-family:inherit;background:#fff;cursor:pointer;color:#1C3557;font-weight:600}
        .tc-unit{display:inline-flex;border:1px solid #E0E7F0;border-radius:8px;overflow:hidden}
        .tc-unit button{padding:7px 12px;font-size:12px;font-weight:700;border:none;background:#fff;color:#6B7280;cursor:pointer;font-family:inherit}
        .tc-unit button.act{background:#1C3557;color:#fff}
        .tc-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
        .tc-tab{padding:8px 16px;font-size:12.5px;font-weight:700;border-radius:8px;border:1px solid #E0E7F0;background:#fff;cursor:pointer;color:#6B7280;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
        .tc-tab.act{background:#1C3557;color:#fff;border-color:#1C3557}
        .tc-sub{font-size:12px;color:#9CA3AF;margin-bottom:14px}

        .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .kcard{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E7F0}
        .kcard-h{padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid;background:#EEF3FA;border-bottom-color:#D0DCE8;color:#4B6A8A}
        .kcard-b{padding:12px 14px 14px}
        .kcard-v{font-size:22px;font-weight:800;line-height:1.15;color:#1C3557}
        .kcard-s{font-size:11px;color:#6B7280;margin-top:4px}

        .panel{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden;margin-bottom:14px}
        .panel-h{padding:10px 14px;background:#EEF3FA;border-bottom:.5px solid #D0DCE8;font-size:11px;font-weight:700;letter-spacing:.06em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
        .panel-b{padding:14px}

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
        .stbl th{text-align:left;padding:8px 10px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4B6A8A;background:#EEF3FA;border-bottom:1px solid #D0DCE8;white-space:nowrap}
        .stbl td{padding:7px 10px;border-bottom:1px solid #F3F6FB;color:#1C3557;white-space:nowrap}
        .stbl tr:hover td{background:#FAFBFD}
        .stbl .num{text-align:right;font-variant-numeric:tabular-nums}
        .stbl .lbl{text-align:left;white-space:normal;min-width:220px}
        .stbl .bold td{font-weight:700}
      `}</style>

      <div className="tc">
        <div className="tc-toolbar">
          <select className="tc-sel" value={donViKey} onChange={e => setDonViKey(e.target.value)}>
            <option value={ALL_DONVI}>🏢 Hợp nhất Sơn An Group</option>
            {donViList.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <select className="tc-sel" value={period} onChange={e => setPeriod(e.target.value)}>
            {periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
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
              <TabTongQuan snapshot={snapshot} ratios={ratios} alerts={alerts} fmt={fmt} fmtS={fmtS} unitLbl={unitLbl} donViLabel={donViLabel} />
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
