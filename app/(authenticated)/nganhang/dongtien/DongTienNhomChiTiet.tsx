// ============================================================
// NHÓM CHI TIẾT — Bảng phụ dùng trong panel chi tiết của
// Tổng hợp / Timeline. Gộp các khoản cùng ngày + cùng ngân hàng
// + cùng pháp nhân thành 1 dòng (đỡ rối mắt khi 1 ngân hàng có
// hàng chục kỳ trả nợ cùng ngày) — click vào dòng để mở ra xem
// từng khoản con. Khoản nhập tay không gộp, giữ nguyên từng dòng.
// ============================================================
'use client'

import { useState } from 'react'
import { NhomChiTietRow } from '@/lib/dong-tien-engine'

interface Props {
  rows: NhomChiTietRow[]
}

const VND = new Intl.NumberFormat('vi-VN')

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

export default function DongTienNhomChiTiet({ rows }: Props) {
  const [moRong, setMoRong] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setMoRong(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <table className="nh-tbl" style={{ fontSize: 12, marginBottom: 0 }}>
      <thead>
        <tr>
          <th style={{ width: 20 }}></th>
          <th>Ngày</th>
          <th>Pháp nhân</th>
          <th>Nguồn</th>
          <th>Diễn giải</th>
          <th className="r">Số tiền</th>
          <th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(g => {
          const gopDuoc = g.soLuong > 1
          const daMo    = gopDuoc && moRong.has(g.key)
          return (
            <>
              <tr
                key={g.key}
                onClick={() => gopDuoc && toggle(g.key)}
                style={{ cursor: gopDuoc ? 'pointer' : 'default', background: daMo ? '#EEF3FA' : undefined }}
              >
                <td style={{ textAlign: 'center', color: 'var(--nh-muted2)' }}>
                  {gopDuoc ? (daMo ? '▲' : '▶') : ''}
                </td>
                <td>{g.ngay}</td>
                <td>{g.entity}</td>
                <td>
                  <span className={`nh-badge ${NGUON_BADGE[g.nguon] ?? 'nh-b-grey'}`}>
                    {NGUON_LABEL[g.nguon] ?? g.nguon}
                  </span>
                </td>
                <td>
                  {g.tieuDe}
                  {gopDuoc && (
                    <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>{g.soLuong} khoản</span>
                  )}
                </td>
                <td className="r" style={{ fontWeight: 700, color: g.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                  {g.loai === 'thu' ? '+' : '−'}{VND.format(g.soTien)}
                </td>
                <td>
                  {g.soDuKien === 0 ? (
                    <span className="nh-badge nh-b-green">Đã thực hiện</span>
                  ) : g.soDaThucHien === 0 ? (
                    <span className="nh-badge nh-b-amber">Dự kiến</span>
                  ) : (
                    <span className="nh-badge nh-b-amber">{g.soDaThucHien}/{g.soLuong} đã TH</span>
                  )}
                </td>
              </tr>

              {daMo && g.items.map(it => (
                <tr key={it.id} style={{ background: '#FAFBFC' }}>
                  <td></td>
                  <td style={{ color: 'var(--nh-muted2)' }}>{it.ngay}</td>
                  <td></td>
                  <td></td>
                  <td style={{ paddingLeft: 20, color: '#555' }}>↳ {it.nhanNhan}</td>
                  <td className="r" style={{ color: it.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                    {it.loai === 'thu' ? '+' : '−'}{VND.format(it.soTien)}
                  </td>
                  <td>
                    <span className={`nh-badge ${it.trangThai === 'thuc-te' ? 'nh-b-green' : 'nh-b-amber'}`}>
                      {it.trangThai === 'thuc-te' ? 'Đã thực hiện' : 'Dự kiến'}
                    </span>
                  </td>
                </tr>
              ))}
            </>
          )
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 20 }}>
              Không có khoản nào.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
