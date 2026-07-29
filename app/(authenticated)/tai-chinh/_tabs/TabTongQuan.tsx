import { Alert, Ratios, Snapshot } from '../_lib/compute'
import { pct } from '../_lib/format'

interface Props {
  snapshot: Snapshot
  ratios: Ratios
  alerts: Alert[]
  hasData: boolean
  fmt: (v: number) => string
  fmtS: (v: number) => string
  unitLbl: string
  donViLabel: string
}

export function TabTongQuan({ snapshot: s, ratios: r, alerts, hasData, fmtS, unitLbl, donViLabel }: Props) {
  const kpi1 = [
    { l: 'Tổng tài sản', v: s.tongTS, sub: `Nguồn vốn: ${fmtS(s.tongNguonVon)} ${unitLbl}`, accent: '#2563EB' },
    { l: 'Nợ phải trả', v: s.noPhaiTra, sub: `NH ${fmtS(s.noNH)} · DH ${fmtS(s.noDH)}`, accent: '#D97706' },
    { l: 'Vốn chủ sở hữu', v: s.vcsh, sub: `ROE ${pct(r.roe)}`, accent: '#0891B2' },
    { l: 'Doanh thu thuần', v: s.dtt, sub: `Biên LN gộp ${pct(r.grossMargin)}`, accent: '#1C3557' },
  ]
  const kpi2 = [
    { l: 'Lãi gộp', v: s.laiGop, sub: `Giá vốn ${fmtS(s.giaVon)} ${unitLbl}`, accent: '#16A34A' },
    { l: 'LN thuần HĐKD', v: s.lnThuanHDKD, sub: s.lnThuanHDKD < 0 ? 'Đang lỗ hoạt động kinh doanh' : 'Có lãi từ HĐKD', accent: '#16A34A' },
    { l: 'LN sau thuế', v: s.lnSauThue, sub: `Biên LNST ${pct(r.netMargin)}`, accent: '#16A34A' },
    { l: 'Công nợ phải thu / trả', v: s.arBalance, sub: `Phải trả: ${fmtS(s.apBalance)} ${unitLbl}`, accent: '#7C3AED' },
  ]

  return (
    <>
      <div className="tc-sub">{donViLabel} · Kỳ {s.period}</div>

      {!hasData && (
        <div className="alert-row alert-yellow">
          ⚠ Kỳ này chưa có số liệu BCTC thực tế (cột trống trong Sheet) — các số dưới đây chỉ là 0, không phải kết quả kinh doanh thật. Chọn kỳ khác ở toolbar để xem số liệu đã nhập.
        </div>
      )}
      {hasData && alerts.length > 0 && (
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
      {hasData && alerts.length === 0 && (
        <div className="alert-row alert-ok">✅ Không có cảnh báo — các chỉ số nằm trong ngưỡng an toàn tham khảo.</div>
      )}

      <div className="grid4" style={{ marginTop: 14 }}>
        {kpi1.map(k => (
          <div key={k.l} className="kcard" style={{ '--accent': k.accent } as React.CSSProperties}>
            <div className="kcard-h"><span className="dot" />{k.l}</div>
            <div><span className="kcard-v">{fmtS(k.v)}</span><span className="kcard-u">{unitLbl}</span></div>
            <div className="kcard-s">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid4">
        {kpi2.map(k => (
          <div key={k.l} className="kcard" style={{ '--accent': k.accent } as React.CSSProperties}>
            <div className="kcard-h"><span className="dot" />{k.l}</div>
            <div><span className="kcard-v" style={{ color: k.v < 0 ? '#DC2626' : undefined }}>{fmtS(k.v)}</span><span className="kcard-u">{unitLbl}</span></div>
            <div className="kcard-s">{k.sub}</div>
          </div>
        ))}
      </div>
    </>
  )
}
