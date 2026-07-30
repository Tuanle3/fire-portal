'use client'
import { Fragment, useEffect, useState } from 'react'
import { get, ref, update } from 'firebase/database'
import { getDb } from '@/lib/firebase'
import { breakdownByCode, FlatDoc, valueByMaSo } from '../_lib/compute'
import { BUDGET_CATEGORIES, BudgetCategory } from '../_lib/masocode'
import { periodLabel } from '../_lib/format'
import { PeriodFilter } from '../_lib/usePeriodFilter'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  pf: PeriodFilter
  fmtS: (v: number) => string
  unitLbl: string
}

type BudgetMap = Record<string, Record<string, number>> // period -> categoryKey -> value NS

function actualFor(docs: FlatDoc[], donViKey: string, period: string, cat: BudgetCategory): number {
  const act = cat.actual
  if (act.kind === 'maSo') return valueByMaSo(docs, 'PL', period, act.maSo, donViKey)
  return breakdownByCode(docs, donViKey, [period], [act.code]).find(i => i.chiTieu === act.chiTieu)?.value ?? 0
}

export function TabNganSach({ docs, donViKey, pf, fmtS, unitLbl }: Props) {
  const [budget, setBudget] = useState<BudgetMap>({})
  const [loading, setLoading] = useState(true)
  const [savedCell, setSavedCell] = useState<string | null>(null)

  useEffect(() => {
    // Không reset loading=true khi đổi đơn vị — giữ bảng cũ hiển thị (stale) cho tới khi dữ liệu
    // mới về, tránh nháy màn hình liên tục khi người dùng bấm qua lại giữa các đơn vị.
    get(ref(getDb(), `data_bctc_budget/${donViKey}`))
      .then(snap => setBudget(snap.exists() ? (snap.val() as BudgetMap) : {}))
      .finally(() => setLoading(false))
  }, [donViKey])

  const periodsCols = pf.selectedPeriods

  function saveCell(period: string, key: string, raw: string) {
    const value = raw.trim() === '' ? 0 : Number(raw.replace(/[.,]/g, ''))
    if (Number.isNaN(value)) return
    setBudget(prev => ({ ...prev, [period]: { ...prev[period], [key]: value } }))
    update(ref(getDb(), `data_bctc_budget/${donViKey}/${period}`), { [key]: value }).then(() => {
      const cellId = `${period}:${key}`
      setSavedCell(cellId)
      setTimeout(() => setSavedCell(prev => (prev === cellId ? null : prev)), 1500)
    })
  }

  if (loading) return <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>⏳ Đang tải kế hoạch ngân sách...</div>
  if (periodsCols.length === 0) return <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Chọn 1 kỳ ở bộ lọc phía trên để nhập/xem ngân sách.</div>

  const totalsByCategory = BUDGET_CATEGORIES.map(cat => {
    const ns = periodsCols.reduce((s, p) => s + (budget[p]?.[cat.key] ?? 0), 0)
    const tt = periodsCols.reduce((s, p) => s + actualFor(docs, donViKey, p, cat), 0)
    return { cat, ns, tt }
  })
  const grandNS = totalsByCategory.reduce((s, r) => s + r.ns, 0)
  const grandTT = totalsByCategory.reduce((s, r) => s + r.tt, 0)
  const overCount = totalsByCategory.filter(r => r.ns > 0 && r.tt > r.ns).length

  return (
    <>
      <div className="tc-sub">{pf.label} · Nhập kế hoạch chi phí tay — tự lưu khi rời khỏi ô nhập · đơn vị: {unitLbl}</div>

      <div className="grid4">
        <div className="kcard" style={{ '--accent': '#1C3557' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Tổng NS chi phí</div>
          <div><span className="kcard-v">{fmtS(grandNS)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">{pf.label}</div>
        </div>
        <div className="kcard" style={{ '--accent': grandTT > grandNS && grandNS > 0 ? '#DC2626' : '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Đã thực chi</div>
          <div><span className="kcard-v">{fmtS(grandTT)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">{grandNS > 0 ? `${grandTT > grandNS ? 'Vượt' : 'Còn'} ${fmtS(Math.abs(grandTT - grandNS))} ${unitLbl}` : 'Chưa có ngân sách để so sánh'}</div>
        </div>
        <div className="kcard" style={{ '--accent': overCount > 0 ? '#D97706' : '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Mục vượt ngân sách</div>
          <div><span className="kcard-v">{overCount} / {BUDGET_CATEGORIES.length}</span></div>
          <div className="kcard-s">{overCount > 0 ? 'Cần theo dõi' : 'Trong tầm kiểm soát'}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#0891B2' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Chênh lệch tổng</div>
          <div><span className="kcard-v" style={{ color: grandTT - grandNS > 0 ? '#DC2626' : '#16A34A' }}>{fmtS(grandTT - grandNS)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Thực tế trừ kế hoạch</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><span>💰 Theo dõi ngân sách chi phí — Kế hoạch vs Thực tế</span><span className="panel-badge">BUDGET CONTROL</span></div>
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          <table className="stbl">
            <thead>
              <tr>
                <th className="lbl">Khoản mục chi phí</th>
                {periodsCols.map(p => (
                  <th key={p} className="num" colSpan={2}>{periodLabel(p)}</th>
                ))}
                <th className="num">Chênh lệch</th>
                <th className="num">% NS</th>
              </tr>
              <tr>
                <th className="lbl" />
                {periodsCols.map(p => (
                  <Fragment key={p}>
                    <th className="num" style={{ fontWeight: 600 }}>NS</th>
                    <th className="num" style={{ fontWeight: 600 }}>TT</th>
                  </Fragment>
                ))}
                <th /><th />
              </tr>
            </thead>
            <tbody>
              {totalsByCategory.map(({ cat, ns, tt }) => (
                <tr key={cat.key}>
                  <td className="lbl">{cat.label}</td>
                  {periodsCols.map(p => {
                    const cellNS = budget[p]?.[cat.key] ?? 0
                    const cellTT = actualFor(docs, donViKey, p, cat)
                    const cellId = `${p}:${cat.key}`
                    return (
                      <Fragment key={cellId}>
                        <td style={{ minWidth: 100 }}>
                          <input
                            className="budget-input"
                            type="text"
                            inputMode="numeric"
                            defaultValue={cellNS === 0 ? '' : cellNS.toLocaleString('vi-VN')}
                            placeholder="0"
                            onBlur={e => saveCell(p, cat.key, e.target.value)}
                          />
                          {savedCell === cellId && <span className="budget-saved">✓ đã lưu</span>}
                        </td>
                        <td className="num">{fmtS(cellTT)}</td>
                      </Fragment>
                    )
                  })}
                  <td className="num" style={{ color: tt > ns && ns > 0 ? '#DC2626' : tt < ns ? '#16A34A' : undefined }}>
                    {ns > 0 || tt > 0 ? `${tt - ns > 0 ? '+' : ''}${fmtS(tt - ns)}` : '–'}
                  </td>
                  <td className="num" style={{ color: tt > ns && ns > 0 ? '#DC2626' : '#16A34A' }}>
                    {ns > 0 ? `${tt > ns ? '+' : ''}${((tt - ns) / ns * 100).toFixed(1)}%` : '–'}
                  </td>
                </tr>
              ))}
              <tr className="bold">
                <td className="lbl">TỔNG CHI PHÍ</td>
                {periodsCols.map(p => {
                  const nsP = BUDGET_CATEGORIES.reduce((s, c) => s + (budget[p]?.[c.key] ?? 0), 0)
                  const ttP = BUDGET_CATEGORIES.reduce((s, c) => s + actualFor(docs, donViKey, p, c), 0)
                  return (
                    <Fragment key={p}>
                      <td className="num">{fmtS(nsP)}</td>
                      <td className="num">{fmtS(ttP)}</td>
                    </Fragment>
                  )
                })}
                <td className="num" style={{ color: grandTT - grandNS > 0 ? '#DC2626' : '#16A34A' }}>{grandTT - grandNS > 0 ? '+' : ''}{fmtS(grandTT - grandNS)}</td>
                <td className="num" style={{ color: grandTT - grandNS > 0 ? '#DC2626' : '#16A34A' }}>{grandNS > 0 ? `${grandTT > grandNS ? '+' : ''}${((grandTT - grandNS) / grandNS * 100).toFixed(1)}%` : '–'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
