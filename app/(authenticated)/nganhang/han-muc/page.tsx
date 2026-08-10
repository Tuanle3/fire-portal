'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCcw, ChevronLeft, Landmark } from 'lucide-react'
import { subscribeHopDong, subscribeLichTraNo } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo, EntityType } from '@/lib/han-muc-types'
import HopDongForm from '@/components/han-muc/HopDongForm'
import LichTraNoTable from '@/components/han-muc/LichTraNoTable'
import CoCauDialog from '@/components/han-muc/CoCauDialog'

const ENTITY_TABS: ('all' | EntityType)[] = ['all', 'SAG', 'SAHS', 'ĐTSA', 'YANA', 'Cá nhân']

const HD_STATUS_STYLE: Record<HopDongTinDung['trangThai'], string> = {
  'dang-vay':    'bg-blue-100 text-blue-700',
  'binh-thuong': 'bg-emerald-100 text-emerald-700',
  'gan-dao-han': 'bg-amber-100 text-amber-700',
  'qua-han':     'bg-red-100 text-red-700',
  'tat-toan':    'bg-gray-100 text-gray-500',
}
const HD_STATUS_LABEL: Record<HopDongTinDung['trangThai'], string> = {
  'dang-vay': 'Đang vay', 'binh-thuong': 'Bình thường', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}

const fmt = (n: number) => n.toLocaleString('vi-VN')

export default function HanMucPage() {
  const [entityFilter, setEntityFilter] = useState<'all' | EntityType>('all')
  const [hopDongs, setHopDongs]         = useState<HopDongTinDung[]>([])
  const [selected, setSelected]         = useState<HopDongTinDung | null>(null)
  const [kyList, setKyList]             = useState<KyTraNo[]>([])
  const [formOpen, setFormOpen]         = useState(false)
  const [editing, setEditing]           = useState<HopDongTinDung | null>(null)
  const [coCauOpen, setCoCauOpen]       = useState(false)

  useEffect(() => subscribeHopDong(setHopDongs, entityFilter), [entityFilter])

  useEffect(() => {
    if (!selected) { setKyList([]); return }
    return subscribeLichTraNo(selected.id, setKyList)
  }, [selected])

  // Giữ selected đồng bộ khi danh sách hợp đồng cập nhật realtime
  useEffect(() => {
    if (!selected) return
    const fresh = hopDongs.find(h => h.id === selected.id)
    if (fresh) setSelected(fresh)
  }, [hopDongs]) // eslint-disable-line react-hooks/exhaustive-deps

  const tongDuNo = useMemo(
    () => hopDongs.reduce((s, h) => s + h.soTienGiaiNgan, 0),
    [hopDongs],
  )
  const soQuaHan = hopDongs.filter(h => h.trangThai === 'qua-han').length

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-[#1C3557]">
            <Landmark size={22} className="text-[#D4A64A]" />
            Hạn mức tín dụng
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Theo dõi hợp đồng vay, lịch trả nợ và phương án cơ cấu theo từng pháp nhân.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormOpen(true) }}
          className="flex items-center gap-1.5 rounded-md bg-[#1C3557] px-4 py-2 text-sm font-medium text-white hover:bg-[#16294494]"
        >
          <Plus size={16} /> Thêm hợp đồng
        </button>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-4">
        <SummaryCard label="Số hợp đồng" value={String(hopDongs.length)} />
        <SummaryCard label="Tổng dư nợ giải ngân" value={`${fmt(tongDuNo)} triệu`} />
        <SummaryCard label="Hợp đồng quá hạn" value={String(soQuaHan)} highlight={soQuaHan > 0} />
      </div>

      {!selected ? (
        <>
          <div className="mb-4 flex gap-2 border-b border-gray-200">
            {ENTITY_TABS.map(t => (
              <button
                key={t}
                onClick={() => setEntityFilter(t)}
                className={`px-3 py-2 text-sm font-medium ${
                  entityFilter === t
                    ? 'border-b-2 border-[#D4A64A] text-[#1C3557]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'all' ? 'Tất cả' : t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {hopDongs.map(h => (
              <button
                key={h.id}
                onClick={() => setSelected(h)}
                className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-[#D4A64A] hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <div className="font-medium text-[#1C3557]">{h.soHopDong}</div>
                    <div className="text-xs text-gray-500">{h.entity} · {h.nganHang}{h.chiNhanh ? ` · ${h.chiNhanh}` : ''}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HD_STATUS_STYLE[h.trangThai]}`}>
                    {HD_STATUS_LABEL[h.trangThai]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-400">Hạn mức:</span> {fmt(h.hanMuc)} triệu</div>
                  <div><span className="text-gray-400">Giải ngân:</span> {fmt(h.soTienGiaiNgan)} triệu</div>
                  <div><span className="text-gray-400">Lãi suất:</span> {h.laiSuat}%/năm</div>
                  <div><span className="text-gray-400">Đáo hạn:</span> {h.ngayDaoHan}</div>
                </div>
              </button>
            ))}
            {hopDongs.length === 0 && (
              <div className="col-span-2 rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-400">
                Chưa có hợp đồng tín dụng nào trong nhóm này.
              </div>
            )}
          </div>
        </>
      ) : (
        <div>
          <button
            onClick={() => setSelected(null)}
            className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-[#1C3557]"
          >
            <ChevronLeft size={16} /> Quay lại danh sách
          </button>

          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-serif text-lg font-semibold text-[#1C3557]">{selected.soHopDong}</div>
                <div className="text-xs text-gray-500">
                  {selected.entity} · {selected.nganHang}{selected.chiNhanh ? ` · ${selected.chiNhanh}` : ''}
                  {selected.nguoiVay ? ` · ${selected.nguoiVay}` : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(selected); setFormOpen(true) }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Sửa hợp đồng
                </button>
                <button
                  onClick={() => setCoCauOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-[#D4A64A] px-3 py-1.5 text-sm font-medium text-[#8a6a1f] hover:bg-[#D4A64A]/10"
                >
                  <RefreshCcw size={14} /> Cơ cấu nợ
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-400">Hạn mức</span><div className="font-medium">{fmt(selected.hanMuc)} triệu</div></div>
              <div><span className="text-gray-400">Giải ngân</span><div className="font-medium">{fmt(selected.soTienGiaiNgan)} triệu</div></div>
              <div><span className="text-gray-400">Lãi suất</span><div className="font-medium">{selected.laiSuat}%/năm</div></div>
              <div><span className="text-gray-400">Kỳ trả</span><div className="font-medium">{selected.kyTra === 'monthly' ? 'Hàng tháng' : 'Hàng quý'}</div></div>
            </div>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-gray-600">Lịch trả nợ</h3>
          <LichTraNoTable hopDongId={selected.id} rows={kyList} />
        </div>
      )}

      <HopDongForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      {selected && (
        <CoCauDialog open={coCauOpen} onClose={() => setCoCauOpen(false)} hopDong={selected} kyList={kyList} />
      )}
    </div>
  )
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 font-serif text-xl font-semibold ${highlight ? 'text-red-600' : 'text-[#1C3557]'}`}>
        {value}
      </div>
    </div>
  )
}
