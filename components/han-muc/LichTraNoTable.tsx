'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { markKyDaTra } from '@/lib/han-muc-store'
import { KyTraNo } from '@/lib/han-muc-types'

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
  hopDongId: string
  rows: KyTraNo[]
}

export default function LichTraNoTable({ hopDongId, rows }: Props) {
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [ngayThucTra, setNgayThucTra] = useState('')
  const [soTienThucTra, setSoTienThucTra] = useState('')
  const [saving, setSaving] = useState(false)

  const startMark = (ky: KyTraNo) => {
    setMarkingId(ky.id)
    setNgayThucTra(new Date().toISOString().slice(0, 10))
    setSoTienThucTra(String(ky.tongTra))
  }

  const confirmMark = async (ky: KyTraNo) => {
    setSaving(true)
    try {
      await markKyDaTra(hopDongId, ky.id, ngayThucTra, Number(soTienThucTra))
      setMarkingId(null)
    } finally {
      setSaving(false)
    }
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
          {rows.map(ky => (
            <tr key={ky.id} className={ky.trangThai === 'qua-han' ? 'bg-red-50/40' : undefined}>
              <td className="px-3 py-2 font-medium text-gray-700">{ky.soKy}</td>
              <td className="px-3 py-2">{ky.ngayTra}</td>
              <td className="px-3 py-2 text-right">{fmt(ky.dunNoDauKy)}</td>
              <td className="px-3 py-2 text-right">{fmt(ky.gocTra)}</td>
              <td className="px-3 py-2 text-right">{fmt(ky.laiTra)}</td>
              <td className="px-3 py-2 text-right font-medium">{fmt(ky.tongTra)}</td>
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
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="date" value={ngayThucTra}
                      onChange={e => setNgayThucTra(e.target.value)}
                      className="w-[120px] rounded border border-gray-300 px-1 py-0.5 text-xs"
                    />
                    <input
                      type="number" value={soTienThucTra}
                      onChange={e => setSoTienThucTra(e.target.value)}
                      className="w-[90px] rounded border border-gray-300 px-1 py-0.5 text-xs"
                    />
                    <button
                      onClick={() => confirmMark(ky)}
                      disabled={saving}
                      className="rounded bg-[#1C3557] p-1 text-white hover:bg-[#16294494]"
                    >
                      <Check size={14} />
                    </button>
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
          ))}
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
