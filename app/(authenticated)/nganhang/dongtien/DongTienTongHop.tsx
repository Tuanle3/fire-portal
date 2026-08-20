// ============================================================
// TỔNG HỢP — Bảng rollup theo kỳ, nâng cấp từ RollupPreview
// Phần 4: kiểu hiển thị mặc định khi mở tab Dòng tiền.
// Chi tiết bên trong mỗi kỳ dùng bảng GỘP NHÓM (cùng ngày +
// cùng ngân hàng + cùng pháp nhân → 1 dòng, mở ra xem từng
// khoản) cho gọn, đỡ rối khi 1 ngân hàng có nhiều kỳ trả nợ.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'
import { rollupTheoDonVi, gomNhomChiTiet, DonViThoiGian, CashFlowBucket } from '@/lib/dong-tien-engine'
import DongTienNhomChiTiet from './DongTienNhomChiTiet'

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
            const nhomChiTiet = daXem ? gomNhomChiTiet(b.chiTiet) : []
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
                        <DongTienNhomChiTiet rows={nhomChiTiet} />
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
      <p className="nh-hint" style={{ marginTop: 8 }}>
        ▶ Click vào dòng để xem chi tiết kỳ đó. Trong bảng chi tiết, các khoản cùng ngày + cùng ngân hàng đã được gộp 1 dòng — click tiếp để mở xem từng khoản con.
      </p>
    </div>
  )
}