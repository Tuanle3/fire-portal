import { buildCongNoAlerts, computeSnapshot, congNoDsoDpo, DebtAgingEntry, debtAging, FlatDoc, Snapshot, topCongNo, TopEntry } from '../_lib/compute'
import { ALL_DONVI } from '../_lib/types'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  period: string
  periods: string[]
  snapshot: Snapshot
  fmtS: (v: number) => string
  unitLbl: string
}

// Khoản còn đứng yên 3-5 tháng cần nhắc/theo dõi; ≥6 tháng coi là rủi ro cao, cần xử lý ngay
// (đòi/đàm phán hoặc cân nhắc trích lập dự phòng nợ khó đòi với AR).
function actionBadge(months: number, kind: 'AR' | 'AP') {
  if (months >= 6) return <span className="badge badge-bad">🔴 Xử lý ngay</span>
  return <span className="badge badge-warn">🟡 {kind === 'AR' ? 'Cần nhắc nợ' : 'Cần rà soát'}</span>
}

// showDonVi: chỉ hiện cột Đơn vị khi đang xem Hợp nhất — lọc theo 1 đơn vị rồi thì cột này luôn ra
// cùng 1 giá trị, thừa thông tin.
function TopTable({ title, icon, kind, rows, showDonVi, fmtS }: {
  title: string; icon: string; kind: 'AR' | 'AP'; rows: TopEntry[]; showDonVi: boolean; fmtS: (v: number) => string
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-h"><span>{icon} {title}</span><span>{rows.length} {kind === 'AR' ? 'khách' : 'NCC'}</span></div>
      <div className="panel-b">
        {rows.length === 0 ? <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Không có dư nợ</div> : (
          <table className="stbl">
            <thead>
              <tr>
                <th className="lbl">{kind === 'AR' ? 'Khách hàng' : 'Nhà cung cấp'}</th>
                {showDonVi && <th className="lbl">Đơn vị</th>}
                <th className="num">Dư nợ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.code}>
                  <td className="lbl">{t.name || t.code}</td>
                  {showDonVi && <td className="lbl">{t.donVi}</td>}
                  <td className="num">{fmtS(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AgingTable({ title, icon, kind, rows, showDonVi, fmtS }: {
  title: string; icon: string; kind: 'AR' | 'AP'; rows: DebtAgingEntry[]; showDonVi: boolean; fmtS: (v: number) => string
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-h"><span>{icon} {title}</span><span>{rows.length} {kind === 'AR' ? 'khách' : 'NCC'}</span></div>
      <div className="panel-b">
        {rows.length === 0 ? (
          <div style={{ color: '#9CA3AF', fontSize: 12.5 }}>Không có khoản nào tồn đọng ≥3 tháng</div>
        ) : (
          <table className="stbl">
            <thead>
              <tr>
                <th className="lbl">{kind === 'AR' ? 'Khách hàng' : 'Nhà cung cấp'}</th>
                {showDonVi && <th className="lbl">Đơn vị</th>}
                <th className="num">Dư nợ</th><th className="num">Số tháng chưa đổi</th><th className="lbl">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.code}>
                  <td className="lbl">{t.name || t.code}</td>
                  {showDonVi && <td className="lbl">{t.donVi}</td>}
                  <td className="num">{fmtS(t.balance)}</td>
                  <td className="num">{t.monthsUnchanged}</td>
                  <td className="lbl">{actionBadge(t.monthsUnchanged, kind)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function TabCongNo({ docs, donViKey, period, periods, snapshot: s, fmtS, unitLbl }: Props) {
  const showDonVi = donViKey === ALL_DONVI
  const topAR = topCongNo(docs, 'AR', period, donViKey, 8)
  const topAP = topCongNo(docs, 'AP', period, donViKey, 8)
  const { dso, dpo } = congNoDsoDpo(s)
  const history = periods.filter(p => p <= period).slice(-3).map(p => computeSnapshot(docs, donViKey, p))
  const arAging = debtAging(docs, 'AR', donViKey, periods, period)
  const apAging = debtAging(docs, 'AP', donViKey, periods, period)
  const alerts = buildCongNoAlerts(s, dso, dpo, topAR, topAP, history, arAging, apAging)

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
        <TopTable title="Top khách nợ (phải thu)" icon="🧾" kind="AR" rows={topAR} showDonVi={showDonVi} fmtS={fmtS} />
        <TopTable title="Top nhà cung cấp (phải trả)" icon="🏭" kind="AP" rows={topAP} showDonVi={showDonVi} fmtS={fmtS} />
      </div>

      <div className="grid2-even">
        <AgingTable title="Phải thu tồn đọng ≥3 tháng" icon="⏳" kind="AR" rows={arAging} showDonVi={showDonVi} fmtS={fmtS} />
        <AgingTable title="Phải trả tồn đọng ≥3 tháng" icon="⏳" kind="AP" rows={apAging} showDonVi={showDonVi} fmtS={fmtS} />
      </div>
    </>
  )
}
