'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { markKyDaTraThucTe } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'

const fmt = (n: number) => n.toLocaleString('vi-VN')

const STATUS_STYLE: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'bg-gray-100 text-gray-600',
  'gan-han':  'bg-amber-100 text-amber-700',
  'qua-han':  'bg-red-100 text-red-700',
  'da-tra':   'bg-emerald-100 text-emerald-700',
  'co-cau':   'bg-blue-100 text-blue-700',
}
const STATUS_LABEL: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'Chưa trả',
  'gan-han':  'Gần hạn',
  'qua-han':  'Quá hạn',
  'da-tra':   'Đã trả',
  'co-cau':   'Đã cơ cấu',
}

interface Props {
  hopDong: HopDongTinDung
  rows: KyTraNo[]
}

export default function LichTraNoTable({ hopDong, rows }: Props) {
  const [markingId, setMarkingId]   = useState<string | null>(null)
  const [ngayThucTra, setNgayThucTra] = useState('')
  const [gocThucTra, setGocThucTra]   = useState('')
  const [laiThucTra, setLaiThucTra]   = useState('')
  const [saving, setSaving]         = useState(false)

  const startMark = (ky: KyTraNo) => {
    setMarkingId(ky.id)
    setNgayThucTra(new Date().toISOString().slice(0, 10))
    setGocThucTra(String(ky.gocTra))
    setLaiThucTra(String(ky.laiTra))
  }

  const confirmMark = async (ky: KyTraNo) => {
    setSaving(true)
    try {
      await markKyDaTraThucTe(
        hopDong, ky, rows, ngayThucTra,
        Number(gocThucTra) || 0, Number(laiThucTra) || 0,
      )
      setMarkingId(null)
    } finally {
      setSaving(false)
    }
  }

  const chenhLech = (ky: KyTraNo) => {
    if (ky.trangThai !== 'da-tra' || ky.gocThucTra == null) return null
    const d = (ky.gocThucTra + (ky.laiThucTra ?? 0)) - ky.tongTra
    if (d === 0) return null
    return d
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Kỳ</th>
            <th className="px-3 py-2 text-left">Ngày trả</th>
            <th className="px-3 py-2 text-right">Dư nợ đầu kỳ</th>
            <th className="px-3 py-2 text-right">Gốc</th>
            <th className="px-3 py-2 text-right">Lãi</th>
            <th className="px-3 py-2 text-right">Tổng trả</th>
            <th className="px-3 py-2 text-right">Dư nợ cuối kỳ</th>
            <th className="px-3 py-2 text-center">Trạng thái</th>
            <th className="px-3 py-2 text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(ky => {
            const lech = chenhLech(ky)
            return (
              <tr key={ky.id} className={ky.trangThai === 'qua-han' ? 'bg-red-50/40' : undefined}>
                <td className="px-3 py-2 font-medium text-gray-700">{ky.soKy}</td>
                <td className="px-3 py-2">{ky.ngayTra}</td>
                <td className="px-3 py-2 text-right">{fmt(ky.dunNoDauKy)}</td>
                <td className="px-3 py-2 text-right">
                  {fmt(ky.gocTra)}
                  {ky.trangThai === 'da-tra' && ky.gocThucTra != null && ky.gocThucTra !== ky.gocTra && (
                    <div className="text-[11px] text-gray-400">TT: {fmt(ky.gocThucTra)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {fmt(ky.laiTra)}
                  {ky.trangThai === 'da-tra' && ky.laiThucTra != null && ky.laiThucTra !== ky.laiTra && (
                    <div className="text-[11px] text-gray-400">TT: {fmt(ky.laiThucTra)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {fmt(ky.tongTra)}
                  {lech !== null && (
                    <div className={`text-[11px] font-normal ${lech > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {lech > 0 ? '+' : ''}{fmt(lech)} so KH
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{fmt(ky.dunNoCuoiKy)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[ky.trangThai]}`}>
                    {STATUS_LABEL[ky.trangThai]}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {ky.trangThai === 'da-tra' ? (
                    <span className="text-xs text-gray-400">{ky.ngayThucTra}</span>
                  ) : markingId === ky.id ? (
                    <div className="flex flex-col items-stretch gap-1 rounded-md border border-gray-200 p-2">
                      <div className="flex items-center gap-1">
                        <span className="w-8 text-left text-[10px] text-gray-400">Ngày</span>
                        <input
                          type="date" value={ngayThucTra}
                          onChange={e => setNgayThucTra(e.target.value)}
                          className="w-[118px] rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-8 text-left text-[10px] text-gray-400">Gốc</span>
                        <input
                          type="number" value={gocThucTra}
                          onChange={e => setGocThucTra(e.target.value)}
                          className="w-[118px] rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-8 text-left text-[10px] text-gray-400">Lãi</span>
                        <input
                          type="number" value={laiThucTra}
                          onChange={e => setLaiThucTra(e.target.value)}
                          className="w-[118px] rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                      </div>
                      {Number(gocThucTra) !== ky.gocTra && (
                        <div className="text-[10px] text-amber-600">
                          Gốc lệch kế hoạch → sẽ tự tính lại các kỳ sau
                        </div>
                      )}
                      <div className="flex justify-end gap-1 pt-1">
                        <button
                          onClick={() => setMarkingId(null)}
                          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={() => confirmMark(ky)}
                          disabled={saving}
                          className="flex items-center gap-1 rounded bg-[#1C3557] px-2 py-1 text-xs text-white hover:bg-[#16294494]"
                        >
                          <Check size={12} /> Xác nhận
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startMark(ky)}
                      className="rounded-md border border-[#D4A64A] px-2 py-1 text-xs font-medium text-[#8a6a1f] hover:bg-[#D4A64A]/10"
                    >
                      Đánh dấu đã trả
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-gray-400">Chưa có lịch trả nợ.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}