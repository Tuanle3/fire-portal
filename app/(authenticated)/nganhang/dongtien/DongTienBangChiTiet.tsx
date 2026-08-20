// ============================================================
// BẢNG CHI TIẾT — danh sách khoản dòng tiền nhập tay (Phần 1)
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { KhoanDongTien, LoaiDongTien, NHOM_LABEL, DO_TIN_CAY_LABEL } from '@/lib/dong-tien-types'
import { deleteKhoanDongTien, deleteChuoiLap, markDongTienThucHien, unmarkDongTienThucHien } from '@/lib/dong-tien-store'

interface Props {
  rows:      KhoanDongTien[]
  onEdit:    (k: KhoanDongTien) => void
  onChanged: () => void
}

const VND = new Intl.NumberFormat('vi-VN')

export default function DongTienBangChiTiet({ rows, onEdit, onChanged }: Props) {
  const [locLoai, setLocLoai]     = useState<'all' | LoaiDongTien>('all')
  const [locTrang, setLocTrang]   = useState<'all' | 'du-kien' | 'thuc-te'>('all')
  const [markingId, setMarkingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return rows
      .filter(r => locLoai === 'all' || r.loai === locLoai)
      .filter(r => locTrang === 'all' ? true : locTrang === 'thuc-te' ? !!r.daThucHien : !r.daThucHien)
      .sort((a, b) => a.ngayDuKien.localeCompare(b.ngayDuKien))
  }, [rows, locLoai, locTrang])

  const tongThu = filtered.filter(r => r.loai === 'thu').reduce((s, r) => s + (r.daThucHien ? r.soTienThucTe ?? r.soTien : r.soTien), 0)
  const tongChi = filtered.filter(r => r.loai === 'chi').reduce((s, r) => s + (r.daThucHien ? r.soTienThucTe ?? r.soTien : r.soTien), 0)

  async function handleDelete(k: KhoanDongTien) {
    if (k.lapNhomId) {
      const xoaCaChuoi = window.confirm(
        `Khoản này thuộc chuỗi lặp (${k.soKyLap} kỳ). OK = xoá cả chuỗi, Cancel = chỉ xoá kỳ này.`,
      )
      if (xoaCaChuoi) { await deleteChuoiLap(k.lapNhomId); onChanged(); return }
    } else if (!window.confirm('Xoá khoản này?')) {
      return
    }
    await deleteKhoanDongTien(k.id)
    onChanged()
  }

  async function handleToggleThucHien(k: KhoanDongTien) {
    setMarkingId(k.id)
    try {
      if (k.daThucHien) await unmarkDongTienThucHien(k.id)
      else await markDongTienThucHien(k.id, k.ngayDuKien, k.soTien)
      onChanged()
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">Danh sách khoản dòng tiền</span>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <div className="nh-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Tổng thu</span>
            <span className="nh-kpi-val" style={{ color: 'var(--nh-green)' }}>{VND.format(tongThu)}</span>
          </div>
          <div className="nh-kpi">
            <span className="nh-kpi-label">Tổng chi</span>
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
              <th>Nhóm</th>
              <th>Mô tả</th>
              <th className="r">Số tiền</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(k => (
              <tr key={k.id}>
                <td>{k.ngayDuKien}</td>
                <td>{k.entity}</td>
                <td>
                  {NHOM_LABEL[k.nhom]}
                  {k.doTinCay && <span className="nh-badge nh-b-amber" style={{ marginLeft: 6 }}>{DO_TIN_CAY_LABEL[k.doTinCay]}</span>}
                  {k.lapNhomId && <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>lặp</span>}
                </td>
                <td>{k.moTa}</td>
                <td className="r" style={{ fontWeight: 700, color: k.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                  {k.loai === 'thu' ? '+' : '−'}{VND.format(k.daThucHien ? k.soTienThucTe ?? k.soTien : k.soTien)}
                </td>
                <td>
                  <button
                    onClick={() => handleToggleThucHien(k)}
                    disabled={markingId === k.id}
                    className={`nh-badge ${k.daThucHien ? 'nh-b-green' : 'nh-b-amber'}`}
                    style={{ cursor: 'pointer', border: '1px solid', fontFamily: 'inherit' }}
                  >
                    {k.daThucHien ? 'Đã thực hiện' : 'Dự kiến'}
                  </button>
                </td>
                <td>
                  <button onClick={() => onEdit(k)} className="btn-ghost" style={{ marginRight: 6, padding: '4px 10px' }}>Sửa</button>
                  <button onClick={() => handleDelete(k)} className="btn-danger">Xoá</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Chưa có khoản nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
