// ============================================================
// BẢNG — Khoản dòng tiền TỰ ĐỘNG từ hạn mức tín dụng (Phần 2)
// `items` truyền vào đã được lọc sẵn (ngày + loại + trạng thái)
// từ TabDongTien — không lọc riêng nữa (nguyên tắc: lọc 1 lần
// duy nhất ở trên cùng).
// Chỉ xem — muốn sửa phải qua tab "Hạn mức tín dụng" vì đây là
// dữ liệu tính runtime từ hợp đồng/lịch trả nợ gốc, không lưu
// riêng để tránh lệch số liệu.
// ============================================================
'use client'

import { useMemo } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'

interface Props {
  items: DongTienItem[]
}

const VND = new Intl.NumberFormat('vi-VN')

export default function DongTienTuDong({ items }: Props) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.ngay.localeCompare(b.ngay)),
    [items],
  )

  const tongThu = sorted.filter(r => r.loai === 'thu').reduce((s, r) => s + r.soTien, 0)
  const tongChi = sorted.filter(r => r.loai === 'chi').reduce((s, r) => s + r.soTien, 0)

  return (
    <div>
      <div style={{ padding: '14px 20px 0' }}>
        <p className="nh-hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Dữ liệu lấy tự động từ lịch trả nợ và giải ngân bên tab "Hạn mức tín dụng" — muốn sửa, vào tab đó chỉnh trực tiếp.
        </p>

        <div className="nh-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Tổng thu (giải ngân)</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-green)' }}>{VND.format(tongThu)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Tổng chi (trả nợ)</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-red)' }}>{VND.format(tongChi)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Chênh lệch</span>
            <span className="nh-kpi-val">{VND.format(tongThu - tongChi)}</span>
          </div>
        </div>
      </div>

      <table className="nh-tbl">
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
          {sorted.map(it => (
            <tr key={it.id}>
              <td>{it.ngay}</td>
              <td>{it.entity}</td>
              <td>
                <span className={`nh-badge ${it.nguon === 'giai-ngan' ? 'nh-b-blue' : 'nh-b-purple'}`}>
                  {it.nguon === 'kytra-no' ? 'Vay dài hạn' : it.nguon === 'kythu-nh' ? 'Hạn mức ngắn hạn' : 'Giải ngân'}
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
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>
                Không có khoản nào khớp bộ lọc.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}