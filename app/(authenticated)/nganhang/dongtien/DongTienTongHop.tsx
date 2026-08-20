// ============================================================
// TỔNG HỢP — Bảng rollup theo kỳ, nâng cấp từ RollupPreview
// Phần 4: kiểu hiển thị mặc định khi mở tab Dòng tiền.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'
import { rollupTheoDonVi, DonViThoiGian, CashFlowBucket } from '@/lib/dong-tien-engine'

interface Props {
  items:        DongTienItem[]
  donVi:        DonViThoiGian
  soDuBanDau?:  number
}

const VND = new Intl.NumberFormat('vi-VN')

function badgeTrangThai(b: CashFlowBucket) {
  if (b.tonQuyCuoiKy < 0)
    return <span className="nh-badge nh-b-red">🔴 Thiếu</span>
  if (b.tonQuyCuoiKy < 500_000_000)
    return <span className="nh-badge nh-b-amber">🟡 Cảnh báo</span>
  return <span className="nh-badge nh-b-green">🟢 Dư</span>
}

const NGUON_LABEL: Record<string, string> = {
  'nhap-tay':  'Nhập tay',
  'kytra-no':  'Vay dài hạn',
  'kythu-nh':  'Hạn mức NH',
  'giai-ngan': 'Giải ngân',
}
const NGUON_BADGE: Record<string, string> = {
  'nhap-tay':  'nh-b-grey',
  'kytra-no':  'nh-b-purple',
  'kythu-nh':  'nh-b-purple',
  'giai-ngan': 'nh-b-blue',
}

export default function DongTienTongHop({ items, donVi, soDuBanDau }: Props) {
  const [mocRong, setMocRong] = useState<string | null>(null)

  const buckets = useMemo(
    () => rollupTheoDonVi(items, donVi, soDuBanDau),
    [items, donVi, soDuBanDau],
  )

  const tongThuAll = buckets.reduce((s, b) => s + b.tongThu, 0)
  const tongChiAll = buckets.reduce((s, b) => s + b.tongChi, 0)

  if (buckets.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 40 }}>
        Chưa có dữ liệu trong khoảng thời gian đã chọn.
      </div>
    )
  }

  return (
    <div>
      {!soDuBanDau && (
        <p className="nh-hint" style={{ marginBottom: 10 }}>
          ⚠️ Tồn quỹ đang tính <strong>tương đối</strong> (cộng dồn từ mốc 0) — chưa có số dư quỹ thật.
          Khi đại ca gửi bảng tính Excel, tồn quỹ sẽ ra số tuyệt đối chính xác.
        </p>
      )}

      <table className="nh-tbl">
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>Kỳ</th>
            <th>Từ ngày</th>
            <th>Đến ngày</th>
            <th className="r">Tổng thu</th>
            <th className="r">Tổng chi</th>
            <th className="r">Chênh lệch</th>
            <th className="r">Tồn quỹ cuối kỳ</th>
            <th style={{ textAlign: 'center' }}>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map(b => {
            const daXem = mocRong === b.key
            return (
              <>
                <tr
                  key={b.key}
                  onClick={() => setMocRong(daXem ? null : b.key)}
                  style={{ cursor: 'pointer', background: daXem ? '#EEF3FA' : undefined }}
                >
                  <td style={{ textAlign: 'center', color: 'var(--nh-muted2)', fontSize: 11 }}>
                    {daXem ? '▲' : '▶'}
                  </td>
                  <td style={{ fontWeight: 700 }}>{b.kyLabel}</td>
                  <td style={{ color: 'var(--nh-muted2)', fontSize: 12 }}>{b.tuNgay}</td>
                  <td style={{ color: 'var(--nh-muted2)', fontSize: 12 }}>{b.denNgay}</td>
                  <td className="r" style={{ color: 'var(--nh-green)', fontWeight: 600 }}>
                    +{VND.format(b.tongThu)}
                  </td>
                  <td className="r" style={{ color: 'var(--nh-red)', fontWeight: 600 }}>
                    −{VND.format(b.tongChi)}
                  </td>
                  <td className="r" style={{ fontWeight: 700, color: b.chenhLech >= 0 ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                    {b.chenhLech >= 0 ? '+' : ''}{VND.format(b.chenhLech)}
                  </td>
                  <td className="r" style={{ fontWeight: 700, color: b.tonQuyCuoiKy >= 0 ? 'var(--nh-navy)' : 'var(--nh-red)' }}>
                    {VND.format(b.tonQuyCuoiKy)}
                  </td>
                  <td style={{ textAlign: 'center' }}>{badgeTrangThai(b)}</td>
                </tr>

                {daXem && (
                  <tr key={`${b.key}-detail`}>
                    <td colSpan={9} style={{ padding: 0, background: '#F7F9FC' }}>
                      <div style={{ padding: '10px 20px 14px' }}>
                        <table className="nh-tbl" style={{ fontSize: 12, marginBottom: 0 }}>
                          <thead>
                            <tr>
                              <th>Ngày</th>
                              <th>Pháp nhân</th>
                              <th>Nguồn</th>
                              <th>Diễn giải</th>
                              <th className="r">Số tiền</th>
                              <th>Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b.chiTiet.map(it => (
                              <tr key={it.id}>
                                <td>{it.ngay}</td>
                                <td>{it.entity}</td>
                                <td>
                                  <span className={`nh-badge ${NGUON_BADGE[it.nguon] ?? 'nh-b-grey'}`}>
                                    {NGUON_LABEL[it.nguon] ?? it.nguon}
                                  </span>
                                </td>
                                <td>{it.nhanNhan}</td>
                                <td className="r" style={{ fontWeight: 700, color: it.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                                  {it.loai === 'thu' ? '+' : '−'}{VND.format(it.soTien)}
                                </td>
                                <td>
                                  <span className={`nh-badge ${it.trangThai === 'thuc-te' ? 'nh-b-green' : 'nh-b-amber'}`}>
                                    {it.trangThai === 'thuc-te' ? 'Đã thực hiện' : 'Dự kiến'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}

          {/* Hàng tổng cộng */}
          <tr style={{ background: '#EEF3FA', fontWeight: 700, borderTop: '2px solid var(--nh-border)' }}>
            <td colSpan={4} style={{ fontWeight: 700 }}>Tổng cộng ({buckets.length} kỳ)</td>
            <td className="r" style={{ color: 'var(--nh-green)' }}>+{VND.format(tongThuAll)}</td>
            <td className="r" style={{ color: 'var(--nh-red)' }}>−{VND.format(tongChiAll)}</td>
            <td className="r" style={{ color: tongThuAll - tongChiAll >= 0 ? 'var(--nh-green)' : 'var(--nh-red)' }}>
              {tongThuAll - tongChiAll >= 0 ? '+' : ''}{VND.format(tongThuAll - tongChiAll)}
            </td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>
      <p className="nh-hint" style={{ marginTop: 8 }}>▶ Click vào dòng để xem chi tiết các khoản trong kỳ đó.</p>
    </div>
  )
}
