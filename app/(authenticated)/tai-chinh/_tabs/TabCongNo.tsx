import { buildCongNoAlerts, computeSnapshot, congNoDsoDpo, FlatDoc, Snapshot, topCongNo } from '../_lib/compute'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  period: string
  periods: string[]
  snapshot: Snapshot
  fmtS: (v: number) => string
  unitLbl: string
}

export function TabCongNo({ docs, donViKey, period, periods, snapshot: s, fmtS, unitLbl }: Props) {
  const topAR = topCongNo(docs, 'AR', period, donViKey, 8)
  const topAP = topCongNo(docs, 'AP', period, donViKey, 8)
  const { dso, dpo } = congNoDsoDpo(s)
  const history = periods.filter(p => p <= period).slice(-3).map(p => computeSnapshot(docs, donViKey, p))
  const alerts = buildCongNoAlerts(s, dso, dpo, topAR, topAP, history)

  return (
    <>
      {alerts.length > 0 && (
        <div className="panel">
          <div className="panel-h"><span>🔔 Cảnh báo công nợ</span><span className="panel-badge">{alerts.length} MỤC</span></div>
          <div className="panel-b">
            {alerts.map((a, i) => (
              <div key={i} className={`alert-row alert-${a.level}`}>
                <span>{a.level === 'red' ? '🔴' : '🟡'}</span><span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {alerts.length === 0 && (
        <div className="alert-row alert-ok">✅ Không có cảnh báo — công nợ phải thu/phải trả trong ngưỡng an toàn tham khảo.</div>
      )}

      <div className="grid4" style={{ marginTop: 14 }}>
        <div className="kcard" style={{ '--accent': '#2563EB' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Công nợ phải thu (AR)</div>
          <div><span className="kcard-v">{fmtS(s.arBalance)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">DSO ước tính: {dso == null ? '–' : `${dso.toFixed(0)} ngày`}</div>
        </div>
        <div className="kcard" style={{ '--accent': '#D97706' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Công nợ phải trả (AP)</div>
          <div><span className="kcard-v">{fmtS(s.apBalance)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">DPO ước tính: {dpo == null ? '–' : `${dpo.toFixed(0)} ngày`}</div>
        </div>
        <div className="kcard" style={{ '--accent': s.arBalance - s.apBalance < 0 ? '#DC2626' : '#16A34A' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Chênh lệch phải thu − phải trả</div>
          <div><span className="kcard-v" style={{ color: s.arBalance - s.apBalance < 0 ? '#DC2626' : undefined }}>{fmtS(s.arBalance - s.apBalance)}</span><span className="kcard-u">{unitLbl}</span></div>
          <div className="kcard-s">Âm = đang bị chiếm dụng vốn nhiều hơn được chiếm dụng</div>
        </div>
        <div className="kcard" style={{ '--accent': '#7C3AED' } as React.CSSProperties}>
          <div className="kcard-h"><span className="dot" />Số khách nợ / NCC có dư</div>
          <div><span className="kcard-v">{topAR.length + topAP.length}+</span></div>
          <div className="kcard-s">Top hiển thị bên dưới (tối đa 8 mỗi bên)</div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🧾 Top khách nợ (phải thu)</span><span>{topAR.length} khách</span></div>
          <div className="panel-b">
            {topAR.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Không có dư nợ</div> : (
              <table className="stbl">
                <thead><tr><th className="lbl">Khách hàng</th><th className="num">Dư nợ</th></tr></thead>
                <tbody>
                  {topAR.map(t => (
                    <tr key={t.code}><td className="lbl">{t.name || t.code}</td><td className="num">{fmtS(t.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-h"><span>🏭 Top nhà cung cấp (phải trả)</span><span>{topAP.length} NCC</span></div>
          <div className="panel-b">
            {topAP.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Không có dư nợ</div> : (
              <table className="stbl">
                <thead><tr><th className="lbl">Nhà cung cấp</th><th className="num">Dư nợ</th></tr></thead>
                <tbody>
                  {topAP.map(t => (
                    <tr key={t.code}><td className="lbl">{t.name || t.code}</td><td className="num">{fmtS(t.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
