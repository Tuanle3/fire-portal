'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { saveCoCauNo } from '@/lib/han-muc-store'
import { CoCauOption, HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'

interface Props {
  open: boolean
  onClose: () => void
  hopDong: HopDongTinDung
  kyList: KyTraNo[]
}

const OPTION_LABEL: Record<CoCauOption, string> = {
  'gia-han':     'Gia hạn nợ (kéo dài thời gian trả)',
  'giam-ls':     'Giảm lãi suất',
  'von-hoa-lai': 'Vốn hóa lãi vào gốc',
}

// Cơ cấu nợ giữ nguyên nhóm nợ theo Thông tư 02/2023/NHNN và các văn bản
// gia hạn — không phản ánh vào CIC là nợ quá hạn nếu thực hiện đúng điều kiện.
export default function CoCauDialog({ open, onClose, hopDong, kyList }: Props) {
  const [tuKy, setTuKy]     = useState<number>(() => {
    const first = kyList.find(k => k.trangThai !== 'da-tra')
    return first ? first.soKy : 1
  })
  const [option, setOption] = useState<CoCauOption>('gia-han')
  const [ngayDaoHanMoi, setNgayDaoHanMoi] = useState(hopDong.ngayDaoHan)
  const [laiSuatMoi, setLaiSuatMoi]       = useState(String(hopDong.laiSuat))
  const [gocMoi, setGocMoi]               = useState('')
  const [ghiChu, setGhiChu]               = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  const kyMoc = useMemo(() => kyList.find(k => k.soKy === tuKy), [kyList, tuKy])

  if (!open) return null

  const handleSubmit = async () => {
    if (!kyMoc) { setError('Không tìm thấy kỳ mốc.'); return }
    setSaving(true)
    setError('')
    try {
      await saveCoCauNo(
        {
          hopDongId: hopDong.id,
          tuKy,
          option,
          ngayDaoHanMoi: option === 'gia-han' ? ngayDaoHanMoi : undefined,
          laiSuatMoi: option === 'giam-ls' ? Number(laiSuatMoi) : undefined,
          gocMoi: option === 'von-hoa-lai' ? Number(gocMoi) : undefined,
          dunNoTruoc: kyMoc.dunNoDauKy,
          laiKyTruoc: kyMoc.laiTra,
          dunNoSau: option === 'von-hoa-lai' ? Number(gocMoi) : kyMoc.dunNoDauKy,
          laiKySau: option === 'giam-ls'
            ? Math.round(kyMoc.dunNoDauKy * (Number(laiSuatMoi) / 100 / (hopDong.kyTra === 'monthly' ? 12 : 4)))
            : kyMoc.laiTra,
          ngayTao: new Date().toISOString().slice(0, 10),
          ghiChu: ghiChu || undefined,
        },
        hopDong,
        kyList,
      )
      onClose()
    } catch (e) {
      setError('Lưu phương án cơ cấu thất bại.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-[#1C3557]">
            Cơ cấu nợ — {hopDong.soHopDong}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Áp dụng từ kỳ</span>
            <select
              className="input"
              value={tuKy}
              onChange={e => setTuKy(Number(e.target.value))}
            >
              {kyList.filter(k => k.trangThai !== 'da-tra').map(k => (
                <option key={k.id} value={k.soKy}>
                  Kỳ {k.soKy} — {k.ngayTra} (dư nợ {k.dunNoDauKy.toLocaleString('vi-VN')})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Hình thức cơ cấu</span>
            <select className="input" value={option} onChange={e => setOption(e.target.value as CoCauOption)}>
              {(Object.keys(OPTION_LABEL) as CoCauOption[]).map(o => (
                <option key={o} value={o}>{OPTION_LABEL[o]}</option>
              ))}
            </select>
          </label>

          {option === 'gia-han' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Ngày đáo hạn mới</span>
              <input type="date" className="input" value={ngayDaoHanMoi} onChange={e => setNgayDaoHanMoi(e.target.value)} />
            </label>
          )}
          {option === 'giam-ls' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Lãi suất mới (%/năm)</span>
              <input type="number" step="0.01" className="input" value={laiSuatMoi} onChange={e => setLaiSuatMoi(e.target.value)} />
            </label>
          )}
          {option === 'von-hoa-lai' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Dư nợ gốc mới (đã gồm lãi vốn hóa)</span>
              <input type="number" className="input" value={gocMoi} onChange={e => setGocMoi(e.target.value)} />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Ghi chú</span>
            <textarea className="input" rows={2} value={ghiChu} onChange={e => setGhiChu(e.target.value)} />
          </label>

          <p className="text-xs text-gray-500">
            Sau khi lưu, hệ thống sẽ đánh dấu các kỳ từ kỳ {tuKy} trở đi là "Đã cơ cấu" và sinh lại
            lịch trả nợ mới dựa trên phương án đã chọn.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-[#1C3557] px-4 py-2 text-sm font-medium text-white hover:bg-[#16294494] disabled:opacity-60"
          >
            {saving ? 'Đang lưu…' : 'Lưu phương án'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
        }
        .input:focus {
          outline: none;
          border-color: #d4a64a;
          box-shadow: 0 0 0 2px rgba(212, 166, 74, 0.25);
        }
      `}</style>
    </div>
  )
}
