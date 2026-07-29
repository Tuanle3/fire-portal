import { FlatDoc, Snapshot, topCongNo } from '../_lib/compute'

interface Props {
  docs: FlatDoc[]
  donViKey: string
  period: string
  snapshot: Snapshot
  fmtS: (v: number) => string
  unitLbl: string
}

export function TabCongNo({ docs, donViKey, period, snapshot: s, fmtS, unitLbl }: Props) {
  const topAR = topCongNo(docs, 'AR', period, donViKey, 8)
  const topAP = topCongNo(docs, 'AP', period, donViKey, 8)
  const dso = s.dtt > 0 ? (s.arBalance / s.dtt) * 30 : null
  const dpo = s.giaVon > 0 ? (s.apBalance / s.giaVon) * 30 : null

  return (
    <>
      <div className="grid4">
        <div className="kcard">
          <div className="kcard-h">Công nợ phải thu (AR)</div>
          <div className="kcard-b">
            <div className="kcard-v">{fmtS(s.arBalance)} <span style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>{unitLbl}</span></div>
            <div className="kcard-s">DSO ước tính: {dso == null ? '–' : `${dso.toFixed(0)} ngày`}</div>
          </div>
        </div>
        <div className="kcard">
          <div className="kcard-h">Công nợ phải trả (AP)</div>
          <div className="kcard-b">
            <div className="kcard-v">{fmtS(s.apBalance)} <span style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>{unitLbl}</span></div>
            <div className="kcard-s">DPO ước tính: {dpo == null ? '–' : `${dpo.toFixed(0)} ngày`}</div>
          </div>
        </div>
        <div className="kcard">
          <div className="kcard-h">Chênh lệch phải thu − phải trả</div>
          <div className="kcard-b">
            <div className="kcard-v" style={{ color: s.arBalance - s.apBalance < 0 ? '#DC2626' : '#1C3557' }}>
              {fmtS(s.arBalance - s.apBalance)} <span style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>{unitLbl}</span>
            </div>
            <div className="kcard-s">Âm = đang bị chiếm dụng vốn nhiều hơn được chiếm dụng</div>
          </div>
        </div>
        <div className="kcard">
          <div className="kcard-h">Số khách nợ / NCC có dư</div>
          <div className="kcard-b">
            <div className="kcard-v">{topAR.length + topAP.length}+</div>
            <div className="kcard-s">Top hiển thị bên dưới (tối đa 8 mỗi bên)</div>
          </div>
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
