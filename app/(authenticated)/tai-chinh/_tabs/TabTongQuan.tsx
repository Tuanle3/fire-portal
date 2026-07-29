import { Alert, Ratios, Snapshot } from '../_lib/compute'
import { pct } from '../_lib/format'

interface Props {
  snapshot: Snapshot
  ratios: Ratios
  alerts: Alert[]
  fmt: (v: number) => string
  fmtS: (v: number) => string
  unitLbl: string
  donViLabel: string
}

export function TabTongQuan({ snapshot: s, ratios: r, alerts, fmtS, unitLbl, donViLabel }: Props) {
  const kpi1 = [
    { l: 'Tổng tài sản', v: s.tongTS, sub: `Nguồn vốn: ${fmtS(s.tongNguonVon)} ${unitLbl}` },
    { l: 'Nợ phải trả', v: s.noPhaiTra, sub: `NH ${fmtS(s.noNH)} · DH ${fmtS(s.noDH)}` },
    { l: 'Vốn chủ sở hữu', v: s.vcsh, sub: `ROE ${pct(r.roe)}` },
    { l: 'Doanh thu thuần', v: s.dtt, sub: `Biên LN gộp ${pct(r.grossMargin)}` },
  ]
  const kpi2 = [
    { l: 'Lãi gộp', v: s.laiGop, sub: `Giá vốn ${fmtS(s.giaVon)} ${unitLbl}` },
    { l: 'LN thuần HĐKD', v: s.lnThuanHDKD, sub: s.lnThuanHDKD < 0 ? 'Đang lỗ hoạt động kinh doanh' : 'Có lãi từ HĐKD' },
    { l: 'LN sau thuế', v: s.lnSauThue, sub: `Biên LNST ${pct(r.netMargin)}` },
    { l: 'Công nợ phải thu / trả', v: s.arBalance, sub: `Phải trả: ${fmtS(s.apBalance)} ${unitLbl}` },
  ]

  return (
    <>
      <div className="tc-sub">{donViLabel} · Kỳ {s.period}</div>

      {alerts.length > 0 && (
        <div className="panel">
          <div className="panel-h">🔔 Cảnh báo sức khỏe tài chính<span>{alerts.length} mục</span></div>
          <div className="panel-b">
            {alerts.map((a, i) => (
              <div key={i} className={`alert-row alert-${a.level}`}>
                <span>{a.level === 'red' ? '🔴' : '🟡'}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {alerts.length === 0 && (
        <div className="alert-row alert-ok">✅ Không có cảnh báo — các chỉ số nằm trong ngưỡng an toàn tham khảo.</div>
      )}

      <div className="grid4" style={{ marginTop: 14 }}>
        {kpi1.map(k => (
          <div key={k.l} className="kcard">
            <div className="kcard-h">{k.l}</div>
            <div className="kcard-b">
              <div className="kcard-v">{fmtS(k.v)} <span style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>{unitLbl}</span></div>
              <div className="kcard-s">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid4">
        {kpi2.map(k => (
          <div key={k.l} className="kcard">
            <div className="kcard-h">{k.l}</div>
            <div className="kcard-b">
              <div className="kcard-v" style={{ color: k.v < 0 ? '#DC2626' : '#1C3557' }}>
                {fmtS(k.v)} <span style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF' }}>{unitLbl}</span>
              </div>
              <div className="kcard-s">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
