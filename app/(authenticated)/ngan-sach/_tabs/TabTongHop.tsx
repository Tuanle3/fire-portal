'use client'
import { NganSachThang, NganSachItem, GiaiPhap } from '@/lib/ngan-sach-types'

const fmt = (n: number) => n === 0 ? '—' : n.toLocaleString('vi-VN')

const fmtSigned = (n: number) => {
  if (n === 0) return '—'
  return n < 0
    ? `(${Math.abs(n).toLocaleString('vi-VN')})`
    : n.toLocaleString('vi-VN')
}

const numColor = (n: number) =>
  n < 0 ? '#B91C1C' : n > 0 ? '#166534' : '#6B7280'

interface Props {
  data: NganSachThang
  tonQuySoDu: number
  tonQuySoDuLoading: boolean
  kmcpActual: Record<string, number>  // KMCP → thực hiện from data_quy
  thuThang: number                    // total Thu from data_quy for the month
  chiThang: number                    // total Chi from data_quy for the month
}

// Resolve thực hiện for one item: auto from kmcpActual if available, else manual
function resolveThucHien(
  it: NganSachItem,
  kmcpActual: Record<string, number>,
  tonQuySoDu: number,
): { val: number; isAuto: boolean } {
  // TỒN QUỸ section → use live balance
  if (it.nhom === 'A' && !it.is_section) {
    return { val: tonQuySoDu, isAuto: true }
  }
  // Has KMCP and data_quy has data for it → auto
  if (it.kmcp && it.kmcp in kmcpActual) {
    return { val: kmcpActual[it.kmcp], isAuto: true }
  }
  // Fallback to manually entered value
  return { val: it.thuc_hien, isAuto: false }
}

export function TabTongHop({ data, tonQuySoDu, tonQuySoDuLoading, kmcpActual, thuThang, chiThang }: Props) {
  const { thang, ngay_cap_nhat, items, giai_phap } = data
  const [year, mon] = thang.split('-')
  const thangLabel = `T${parseInt(mon)}.${year}`

  // Resolve all items with auto values
  const resolved = items.map(it => ({
    ...it,
    ...resolveThucHien(it, kmcpActual, tonQuySoDu),
  }))

  // Section totals
  let tonQuyKH = 0, tonQuyTH = 0
  let sumB_kh = 0, sumB_th = 0
  let sumC_kh = 0, sumC_th = 0

  for (const it of resolved) {
    if (it.is_section) continue
    if (it.nhom === 'A') { tonQuyKH = it.ke_hoach; tonQuyTH = it.val }
    if (it.nhom === 'B') { sumB_kh += it.ke_hoach; sumB_th += it.val }
    if (it.nhom === 'C') { sumC_kh += it.ke_hoach; sumC_th += it.val }
  }

  const D_kh = tonQuyKH + sumB_kh - sumC_kh
  const D_th = tonQuyTH + sumB_th - sumC_th

  const gpTotal = { kh: 0, th: 0 }
  for (const gp of giai_phap) {
    if (gp.trang_thai !== 'no') {
      gpTotal.kh += gp.so_tien_ke_hoach
      gpTotal.th += gp.so_tien_thuc_hien
    }
  }

  const F_kh = D_kh + gpTotal.kh
  const F_th = D_th + gpTotal.th

  // Unallocated chi: total Chi from Quỹ minus sum of matched KMCP Chi amounts
  const matchedChi = Object.entries(kmcpActual)
    .filter(([k]) => k.startsWith('CP-'))
    .reduce((s, [, v]) => s + v, 0)
  const unallocatedChi = Math.max(0, chiThang - matchedChi)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1C3557', textTransform: 'uppercase', letterSpacing: '.02em' }}>
          Kế hoạch dòng tiền {thangLabel}
        </span>
        <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>cập nhật ngày {ngay_cap_nhat}</span>
        {unallocatedChi > 0 && (
          <span style={{ fontSize: 11.5, background: '#FEF9C3', color: '#854D0E', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
            ⚠ {unallocatedChi.toLocaleString('vi-VN')} ₫ chi chưa phân loại KMCP
          </span>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'inherit' }}>
        <thead>
          <tr style={{ background: '#1C3557', color: '#fff' }}>
            <th style={TH(36)}>STT</th>
            <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10 }}>Diễn giải</th>
            <th style={TH(80)}>KMCP</th>
            <th style={TH(150)}>{thangLabel} (KH)</th>
            <th style={TH(160)}>Đã thực hiện</th>
            <th style={TH(150)}>Còn phải TH</th>
            <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10, minWidth: 140 }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {resolved.map(it => {
            if (it.is_section) {
              let kh = 0, th = 0
              if (it.nhom === 'A') { kh = tonQuyKH; th = tonQuyTH }
              if (it.nhom === 'B') { kh = sumB_kh;  th = sumB_th  }
              if (it.nhom === 'C') { kh = sumC_kh;  th = sumC_th  }
              if (it.nhom === 'D') { kh = D_kh;     th = D_th     }

              const bg = it.nhom === 'A' ? '#ECFDF5'
                       : it.nhom === 'B' ? '#EFF6FF'
                       : it.nhom === 'C' ? '#FFF7ED'
                       : '#FEF3C7'

              return (
                <tr key={it.id} style={{ background: bg, fontWeight: 700 }}>
                  <td style={TD({ center: true })}>{it.stt}</td>
                  <td style={TD({})}>{it.dien_giai}</td>
                  <td />
                  {it.nhom === 'A' ? (
                    <>
                      <td style={TD({ right: true })}>{fmt(kh)}</td>
                      <td style={TD({ right: true, color: '#166534' })}>
                        {tonQuySoDuLoading
                          ? <span style={{ color: '#9CA3AF', fontSize: 11 }}>Đang tải…</span>
                          : <span>{fmt(tonQuySoDu)} <AutoBadge /></span>}
                      </td>
                      <td style={TD({ right: true })}>0</td>
                    </>
                  ) : it.nhom === 'B' || it.nhom === 'C' ? (
                    <>
                      <td style={TD({ right: true })}>{fmt(kh)}</td>
                      <td style={TD({ right: true })}>{fmt(th)}</td>
                      <td style={TD({ right: true, color: numColor(kh - th) })}>{fmtSigned(kh - th)}</td>
                    </>
                  ) : it.nhom === 'D' ? (
                    <>
                      <td style={TD({ right: true, color: numColor(kh) })}>{fmtSigned(kh)}</td>
                      <td style={TD({ right: true, color: numColor(th) })}>{fmtSigned(th)}</td>
                      <td style={TD({ right: true, color: numColor(kh - th) })}>{fmtSigned(kh - th)}</td>
                    </>
                  ) : (
                    <><td /><td /><td /></>
                  )}
                  <td style={TD({})}>{it.ghi_chu}</td>
                </tr>
              )
            }

            // Regular item row
            const conlai = it.ke_hoach - it.val
            return (
              <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={TD({ center: true, muted: true })}>{it.stt}</td>
                <td style={TD({})}>{it.dien_giai}</td>
                <td style={TD({ center: true, muted: true, mono: true })}>{it.kmcp}</td>
                <td style={TD({ right: true })}>{fmt(it.ke_hoach)}</td>
                <td style={TD({ right: true })}>
                  {it.val > 0
                    ? <span style={{ color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        {fmt(it.val)}
                        {it.isAuto && <AutoBadge />}
                      </span>
                    : <span style={{ color: '#D1D5DB' }}>—</span>}
                </td>
                <td style={TD({ right: true, color: numColor(conlai) })}>{fmtSigned(conlai)}</td>
                <td style={TD({ muted: true })}>{it.ghi_chu}</td>
              </tr>
            )
          })}

          {/* Section E: Giải pháp */}
          <tr style={{ background: '#F0FDF4', fontWeight: 700, borderTop: '2px solid #166534' }}>
            <td style={TD({ center: true })}>E</td>
            <td style={TD({})}>GIẢI PHÁP CÂN ĐỐI</td>
            <td /><td style={TD({ right: true })}>{fmt(gpTotal.kh)}</td>
            <td style={TD({ right: true, color: '#166534' })}>{fmt(gpTotal.th)}</td>
            <td style={TD({ right: true, color: numColor(gpTotal.kh - gpTotal.th) })}>{fmtSigned(gpTotal.kh - gpTotal.th)}</td>
            <td />
          </tr>
          {giai_phap.map((gp: GiaiPhap) => (
            <tr key={gp.id} style={{
              background: gp.trang_thai === 'yes' ? '#F0FDF4' : gp.trang_thai === 'no' ? '#FEF2F2' : '#FFFBEB',
              borderBottom: '1px solid #F3F4F6',
            }}>
              <td style={TD({ center: true })}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: gp.trang_thai === 'yes' ? '#DCFCE7' : gp.trang_thai === 'no' ? '#FEE2E2' : '#FEF9C3',
                  color: gp.trang_thai === 'yes' ? '#166534' : gp.trang_thai === 'no' ? '#991B1B' : '#854D0E',
                }}>
                  {gp.trang_thai === 'yes' ? 'Yes' : gp.trang_thai === 'no' ? 'No' : '?'}
                </span>
              </td>
              <td style={TD({})}>{gp.mo_ta}</td>
              <td />
              <td style={TD({ right: true })}>{fmt(gp.so_tien_ke_hoach)}</td>
              <td style={TD({ right: true, color: '#166534' })}>{fmt(gp.so_tien_thuc_hien)}</td>
              <td style={TD({ right: true, color: numColor(gp.so_tien_ke_hoach - gp.so_tien_thuc_hien) })}>
                {fmtSigned(gp.so_tien_ke_hoach - gp.so_tien_thuc_hien)}
              </td>
              <td style={{ ...TD({}), whiteSpace: 'normal', color: '#6B7280', maxWidth: 200, fontSize: 11.5 }}>{gp.ghi_chu}</td>
            </tr>
          ))}

          {/* Section F */}
          <tr style={{ background: '#EFF6FF', fontWeight: 700, borderTop: '2px solid #1C3557' }}>
            <td style={TD({ center: true })}>F</td>
            <td style={TD({})}>DÒNG TIỀN SAU CÂN ĐỐI</td>
            <td /><td style={TD({ right: true, color: numColor(F_kh) })}>{fmtSigned(F_kh)}</td>
            <td style={TD({ right: true, color: numColor(F_th) })}>{fmtSigned(F_th)}</td>
            <td style={TD({ right: true, color: numColor(F_kh - F_th) })}>{fmtSigned(F_kh - F_th)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#6B7280', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <AutoBadge /> = Tự động từ Firebase data_quy (Nhóm_CP)
        </span>
        <span>Số âm hiển thị trong ngoặc (xxx)</span>
        {unallocatedChi > 0 && (
          <span style={{ color: '#854D0E' }}>
            ⚠ {unallocatedChi.toLocaleString('vi-VN')} ₫ giao dịch Chi chưa khớp KMCP nào
          </span>
        )}
      </div>
    </div>
  )
}

function AutoBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
      background: '#DCFCE7', color: '#166534', letterSpacing: '.02em', verticalAlign: 'middle',
    }}>AUTO</span>
  )
}

function TH(w?: number): React.CSSProperties {
  return {
    padding: '8px 10px', textAlign: 'center', fontSize: 11.5,
    fontWeight: 600, whiteSpace: 'nowrap',
    ...(w ? { width: w, minWidth: w } : {}),
  }
}

function TD({ center, right, color, muted, mono }: {
  center?: boolean; right?: boolean; color?: string; muted?: boolean; mono?: boolean
} = {}): React.CSSProperties {
  return {
    padding: '6px 10px',
    textAlign: center ? 'center' : right ? 'right' : 'left',
    color: color ?? (muted ? '#6B7280' : 'inherit'),
    fontFamily: mono ? 'monospace' : 'inherit',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  }
}
