// ============================================================
// BẢNG CHI TIẾT — danh sách khoản dòng tiền nhập tay (Phần 1)
// Lọc theo entity / loại / nhóm / trạng thái, có thao tác
// sửa, xoá, đánh dấu đã thực hiện.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { KhoanDongTien, LoaiDongTien, NHOM_LABEL, DO_TIN_CAY_LABEL } from '@/lib/dong-tien-types'
import { deleteKhoanDongTien, deleteChuoiLap, markDongTienThucHien, unmarkDongTienThucHien } from '@/lib/dong-tien-store'

interface Props {
  rows:      KhoanDongTien[]
  onEdit:    (k: KhoanDongTien) => void
  onChanged: () => void   // gọi lại sau khi xoá/đánh dấu để refresh (subscribe realtime thường tự lo việc này)
}

const VND = new Intl.NumberFormat('vi-VN')

export default function DongTienBangChiTiet({ rows, onEdit, onChanged }: Props) {
  const [locLoai, setLocLoai]   = useState<'all' | LoaiDongTien>('all')
  const [locTrang, setLocTrang] = useState<'all' | 'du-kien' | 'thuc-te'>('all')
  const [markingId, setMarkingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return rows
      .filter(r => locLoai === 'all' || r.loai === locLoai)
      .filter(r => {
        if (locTrang === 'all') return true
        return locTrang === 'thuc-te' ? !!r.daThucHien : !r.daThucHien
      })
      .sort((a, b) => a.ngayDuKien.localeCompare(b.ngayDuKien))
  }, [rows, locLoai, locTrang])

  const tongThu = filtered.filter(r => r.loai === 'thu').reduce((s, r) => s + (r.daThucHien ? r.soTienThucTe ?? r.soTien : r.soTien), 0)
  const tongChi = filtered.filter(r => r.loai === 'chi').reduce((s, r) => s + (r.daThucHien ? r.soTienThucTe ?? r.soTien : r.soTien), 0)

  async function handleDelete(k: KhoanDongTien) {
    if (k.lapNhomId) {
      const xoaCaChuoi = window.confirm(
        `Khoản này thuộc chuỗi lặp (${k.soKyLap} kỳ). Chọn OK để xoá cả chuỗi, Cancel để chỉ xoá kỳ này.`,
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
      if (k.daThucHien) {
        await unmarkDongTienThucHien(k.id)
      } else {
        await markDongTienThucHien(k.id, k.ngayDuKien, k.soTien)
      }
      onChanged()
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Bộ lọc + tổng nhanh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select
            value={locLoai}
            onChange={e => setLocLoai(e.target.value as any)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="all">Tất cả loại</option>
            <option value="thu">Chỉ khoản THU</option>
            <option value="chi">Chỉ khoản CHI</option>
          </select>
          <select
            value={locTrang}
            onChange={e => setLocTrang(e.target.value as any)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="du-kien">Chưa thực hiện</option>
            <option value="thuc-te">Đã thực hiện</option>
          </select>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="text-emerald-700">Tổng thu: <b>{VND.format(tongThu)}</b></span>
          <span className="text-rose-700">Tổng chi: <b>{VND.format(tongChi)}</b></span>
          <span className="text-[#1C3557]">Chênh lệch: <b>{VND.format(tongThu - tongChi)}</b></span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Ngày</th>
              <th className="px-3 py-2 text-left">Pháp nhân</th>
              <th className="px-3 py-2 text-left">Nhóm</th>
              <th className="px-3 py-2 text-left">Mô tả</th>
              <th className="px-3 py-2 text-right">Số tiền</th>
              <th className="px-3 py-2 text-center">Trạng thái</th>
              <th className="px-3 py-2 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(k => (
              <tr key={k.id} className={k.daThucHien ? 'bg-gray-50/60' : ''}>
                <td className="px-3 py-2 whitespace-nowrap">{k.ngayDuKien}</td>
                <td className="px-3 py-2">{k.entity}</td>
                <td className="px-3 py-2">
                  {NHOM_LABEL[k.nhom]}
                  {k.doTinCay && (
                    <span className="ml-1.5 rounded bg-[#D4A64A]/15 px-1.5 py-0.5 text-[10px] text-[#8a6a1f]">
                      {DO_TIN_CAY_LABEL[k.doTinCay]}
                    </span>
                  )}
                  {k.lapNhomId && (
                    <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">lặp</span>
                  )}
                </td>
                <td className="px-3 py-2">{k.moTa}</td>
                <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${k.loai === 'thu' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {k.loai === 'thu' ? '+' : '−'}{VND.format(k.daThucHien ? k.soTienThucTe ?? k.soTien : k.soTien)}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => handleToggleThucHien(k)}
                    disabled={markingId === k.id}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      k.daThucHien
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {k.daThucHien ? 'Đã thực hiện' : 'Dự kiến'}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => onEdit(k)} className="mr-2 text-xs text-[#1C3557] hover:underline">Sửa</button>
                  <button onClick={() => handleDelete(k)} className="text-xs text-rose-600 hover:underline">Xoá</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">Chưa có khoản nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
