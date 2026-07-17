'use client'
import { NganSachThang, NganSachItem, GiaiPhap } from '@/lib/ngan-sach-types'

const fmt = (n: number) =>
  n === 0 ? '—' : n.toLocaleString('vi-VN')

const fmtSigned = (n: number) => {
  if (n === 0) return '—'
  return n < 0
    ? `(${Math.abs(n).toLocaleString('vi-VN')})`
    : n.toLocaleString('vi-VN')
}

const numColor = (n: number) =>
  n < 0 ? '#B91C1C' : n > 0 ? '#166534' : '#6B7280'

// Compute section totals from items list
function computeTotals(items: NganSachItem[]) {
  let sumB_kh = 0, sumB_th = 0
  let sumC_kh = 0, sumC_th = 0
  let tonQuy_kh = 0, tonQuy_th = 0

  for (const it of items) {
    if (it.is_section) continue
    if (it.nhom === 'B') { sumB_kh += it.ke_hoach; sumB_th += it.thuc_hien }
    if (it.nhom === 'C') { sumC_kh += it.ke_hoach; sumC_th += it.thuc_hien }
    if (it.nhom === 'A') { tonQuy_kh = it.ke_hoach; tonQuy_th = it.thuc_hien }
  }

  const D_kh = tonQuy_kh + sumB_kh - sumC_kh
  const D_th = tonQuy_th + sumB_th - sumC_th
  return { sumB_kh, sumB_th, sumC_kh, sumC_th, D_kh, D_th }
}

function computeGiaiPhap(giai_phap: GiaiPhap[], trang_thai_filter?: string) {
  let kh = 0, th = 0
  for (const gp of giai_phap) {
    if (trang_thai_filter && gp.trang_thai !== trang_thai_filter) continue
    if (!trang_thai_filter || gp.trang_thai === 'yes' || gp.trang_thai === 'pending') {
      kh += gp.so_tien_ke_hoach
      th += gp.so_tien_thuc_hien
    }
  }
  return { kh, th }
}

interface Props {
  data: NganSachThang
  tonQuySoDu: number       // realtime from data_quy
  tonQuySoDuLoading: boolean
}

export function TabTongHop({ data, tonQuySoDu, tonQuySoDuLoading }: Props) {
  const { thang, ngay_cap_nhat, items, giai_phap } = data

  const [year, mon] = thang.split('-')
  const thangLabel = `T${parseInt(mon)}.${year}`

  const { sumB_kh, sumB_th, sumC_kh, sumC_th, D_kh, D_th } = computeTotals(items)
  const gpTotal = { kh: 0, th: 0 }
  for (const gp of giai_phap) {
    if (gp.trang_thai !== 'no') {
      gpTotal.kh += gp.so_tien_ke_hoach
      gpTotal.th += gp.so_tien_thuc_hien
    }
  }

  const F_kh = D_kh + gpTotal.kh
  const F_th = D_th + gpTotal.th

  // Merge thực hiện: TỒN QUỸ section row uses realtime balance
  const displayItems = items.map(it => {
    if (it.nhom === 'A' && !it.is_section && !it.thuc_hien_manual) {
      return { ...it, thuc_hien: tonQuySoDuLoading ? it.thuc_hien : tonQuySoDu }
    }
    return it
  })

  // recompute D with real tồn quỹ
  let realTonQuy_th = 0
  for (const it of displayItems) {
    if (it.nhom === 'A' && !it.is_section) realTonQuy_th = it.thuc_hien
  }
  const D_th_real = realTonQuy_th + sumB_th - sumC_th
  const F_th_real = D_th_real + gpTotal.th

  const S: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse', fontSize: 12.5,
    fontFamily: 'inherit',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1C3557', textTransform: 'uppercase', letterSpacing: '.02em' }}>
          Kế hoạch dòng tiền {thangLabel}
        </span>
        <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>
          cập nhật ngày {ngay_cap_nhat}
        </span>
      </div>

      <table style={S}>
        <thead>
          <tr style={{ background: '#1C3557', color: '#fff' }}>
            <th style={TH({ w: 36 })}>STT</th>
            <th style={TH({ align: 'left' })}>Diễn giải</th>
            <th style={TH({ w: 80 })}>KMCP</th>
            <th style={TH({ w: 140 })}>{thangLabel} (Kế hoạch)</th>
            <th style={TH({ w: 140 })}>Đã thực hiện</th>
            <th style={TH({ w: 140 })}>Còn phải thực hiện</th>
            <th style={TH({ align: 'left', w: 160 })}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map(it => {
            if (it.is_section) {
              let kh = 0, th = 0, conlai = 0
              if (it.nhom === 'B') { kh = sumB_kh; th = sumB_th; conlai = kh - th }
              if (it.nhom === 'C') { kh = sumC_kh; th = sumC_th; conlai = kh - th }
              if (it.nhom === 'D') { kh = D_kh; th = D_th_real; conlai = kh - th }
              const isD = it.nhom === 'D'
              const bg = isD ? '#FEF3C7' : it.nhom === 'A' ? '#ECFDF5' : '#EFF6FF'
              return (
                <tr key={it.id} style={{ background: bg, fontWeight: 700 }}>
                  <td style={TD({ center: true })}>{it.stt}</td>
                  <td style={TD({})}>{it.dien_giai}</td>
                  <td style={TD({ center: true })}></td>
                  {it.nhom === 'A' ? (
                    <>
                      <td style={TD({ right: true })}>{fmt(it.ke_hoach)}</td>
                      <td style={TD({ right: true, color: '#166534' })}>
                        {tonQuySoDuLoading
                          ? <span style={{ color: '#9CA3AF' }}>…</span>
                          : fmt(tonQuySoDu)}
                      </td>
                      <td style={TD({ right: true })}>0</td>
                    </>
                  ) : it.nhom === 'B' || it.nhom === 'C' ? (
                    <>
                      <td style={TD({ right: true })}>{fmt(kh)}</td>
                      <td style={TD({ right: true })}>{fmt(th)}</td>
                      <td style={TD({ right: true, color: numColor(conlai) })}>{fmtSigned(conlai)}</td>
                    </>
                  ) : it.nhom === 'D' ? (
                    <>
                      <td style={TD({ right: true, color: numColor(kh) })}>{fmtSigned(kh)}</td>
                      <td style={TD({ right: true, color: numColor(th) })}>{fmtSigned(th)}</td>
                      <td style={TD({ right: true, color: numColor(kh - th) })}>{fmtSigned(kh - th)}</td>
                    </>
                  ) : (
                    <><td style={TD({})}></td><td style={TD({})}></td><td style={TD({})}></td></>
                  )}
                  <td style={TD({})}>{it.ghi_chu}</td>
                </tr>
              )
            }

            const conlai = it.ke_hoach - it.thuc_hien
            return (
              <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={TD({ center: true, color: '#6B7280' })}>{it.stt}</td>
                <td style={TD({})}>{it.dien_giai}</td>
                <td style={TD({ center: true, color: '#6B7280', mono: true })}>{it.kmcp}</td>
                <td style={TD({ right: true })}>{fmt(it.ke_hoach)}</td>
                <td style={TD({ right: true, color: '#166534' })}>{fmt(it.thuc_hien)}</td>
                <td style={TD({ right: true, color: numColor(conlai) })}>{fmtSigned(conlai)}</td>
                <td style={TD({ color: '#6B7280' })}>{it.ghi_chu}</td>
              </tr>
            )
          })}

          {/* Section E: Giải pháp */}
          <tr style={{ background: '#F0FDF4', fontWeight: 700, borderTop: '2px solid #166534' }}>
            <td style={TD({ center: true })}>E</td>
            <td style={TD({})}>GIẢI PHÁP CÂN ĐỐI</td>
            <td></td>
            <td style={TD({ right: true })}>{fmt(gpTotal.kh)}</td>
            <td style={TD({ right: true, color: '#166534' })}>{fmt(gpTotal.th)}</td>
            <td style={TD({ right: true, color: numColor(gpTotal.kh - gpTotal.th) })}>{fmtSigned(gpTotal.kh - gpTotal.th)}</td>
            <td></td>
          </tr>
          {giai_phap.map(gp => (
            <tr key={gp.id} style={{ background: gp.trang_thai === 'yes' ? '#F0FDF4' : gp.trang_thai === 'no' ? '#FEF2F2' : '#FFFBEB', borderBottom: '1px solid #F3F4F6' }}>
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
              <td></td>
              <td style={TD({ right: true })}>{fmt(gp.so_tien_ke_hoach)}</td>
              <td style={TD({ right: true, color: '#166534' })}>{fmt(gp.so_tien_thuc_hien)}</td>
              <td style={TD({ right: true, color: numColor(gp.so_tien_ke_hoach - gp.so_tien_thuc_hien) })}>
                {fmtSigned(gp.so_tien_ke_hoach - gp.so_tien_thuc_hien)}
              </td>
              <td style={TD({ color: '#6B7280', wrap: true })}>{gp.ghi_chu}</td>
            </tr>
          ))}

          {/* Section F */}
          <tr style={{ background: '#EFF6FF', fontWeight: 700, borderTop: '2px solid #1C3557' }}>
            <td style={TD({ center: true })}>F</td>
            <td style={TD({})}>DÒNG TIỀN SAU CÂN ĐỐI</td>
            <td></td>
            <td style={TD({ right: true, color: numColor(F_kh) })}>{fmtSigned(F_kh)}</td>
            <td style={TD({ right: true, color: numColor(F_th_real) })}>{fmtSigned(F_th_real)}</td>
            <td style={TD({ right: true, color: numColor(F_kh - F_th_real) })}>{fmtSigned(F_kh - F_th_real)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#6B7280', flexWrap: 'wrap' }}>
        <span>■ <span style={{ color: '#ECFDF5', background: '#166534', padding: '1px 4px', borderRadius: 3 }}>Tồn quỹ</span> tự động từ Firebase data_quy</span>
        <span>■ Số âm hiển thị trong ngoặc (xxx)</span>
        <span style={{ color: '#9CA3AF' }}>Tồn quỹ thực tế: {tonQuySoDuLoading ? '...' : tonQuySoDu.toLocaleString('vi-VN')} ₫</span>
      </div>
    </div>
  )
}

// style helpers
function TH({ align = 'center', w }: { align?: string; w?: number }): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align as any,
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    ...(w ? { width: w, minWidth: w } : {}),
  }
}

function TD({ center, right, color, mono, wrap }: {
  center?: boolean; right?: boolean; color?: string; mono?: boolean; wrap?: boolean
} = {}): React.CSSProperties {
  return {
    padding: '6px 10px',
    textAlign: center ? 'center' : right ? 'right' : 'left',
    color: color ?? 'inherit',
    fontFamily: mono ? 'monospace' : 'inherit',
    whiteSpace: wrap ? 'normal' : 'nowrap',
    verticalAlign: 'middle',
  }
}
