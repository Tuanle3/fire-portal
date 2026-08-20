// ============================================================
// BẢNG — Khoản dòng tiền TỰ ĐỘNG từ hạn mức tín dụng (Phần 2)
// Chỉ xem — muốn sửa phải qua tab "Hạn mức tín dụng" vì đây là
// dữ liệu tính runtime từ hợp đồng/lịch trả nợ gốc, không lưu
// riêng để tránh lệch số liệu.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { DongTienItem } from '@/lib/dong-tien-types'

interface Props {
  items: DongTienItem[]
}

const VND = new Intl.NumberFormat('vi-VN')

export default function DongTienTuDong({ items }: Props) {
  const [locLoai, setLocLoai]   = useState<'all' | 'thu' | 'chi'>('all')
  const [locTrang, setLocTrang] = useState<'all' | 'du-kien' | 'thuc-te'>('all')

  const filtered = useMemo(() => {
    return items
      .filter(r => locLoai === 'all' || r.loai === locLoai)
      .filter(r => locTrang === 'all' ? true : r.trangThai === locTrang)
      .sort((a, b) => a.ngay.localeCompare(b.ngay))
  }, [items, locLoai, locTrang])

  const tongThu = filtered.filter(r => r.loai === 'thu').reduce((s, r) => s + r.soTien, 0)
  const tongChi = filtered.filter(r => r.loai === 'chi').reduce((s, r) => s + r.soTien, 0)

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">Tự động từ hạn mức tín dụng</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="nh-select" style={{ width: 150 }} value={locLoai} onChange={e => setLocLoai(e.target.value as any)}>
            <option value="all">Tất cả loại</option>
            <option value="thu">Chỉ khoản THU</option>
            <option value="chi">Chỉ khoản CHI</option>
          </select>
          <select className="nh-select" style={{ width: 160 }} value={locTrang} onChange={e => setLocTrang(e.target.value as any)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="du-kien">Chưa thực hiện</option>
            <option value="thuc-te">Đã thực hiện</option>
          </select>
        </div>
      </div>

      <div className="nh-card-body">
        <p className="nh-hint" style={{ marginTop: -4, marginBottom: 10 }}>
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
            {filtered.map(it => (
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>
                  Chưa có dữ liệu — kiểm tra đã có hợp đồng/hạn mức trong tab "Hạn mức tín dụng" chưa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
