'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { saveHopDong } from '@/lib/han-muc-store'
import {
  HopDongTinDung, EntityType, BankName, PhuongThuc, KyTra, TrangThaiHD,
} from '@/lib/han-muc-types'

const ENTITIES: EntityType[]   = ['SAG', 'SAHS', 'ĐTSA', 'YANA', 'Cá nhân']
const BANKS:    BankName[]     = ['Agribank', 'ACB', 'BIDV', 'Vietinbank', 'Khác']
const TRANG_THAI: TrangThaiHD[] = ['dang-vay', 'binh-thuong', 'gan-dao-han', 'qua-han', 'tat-toan']

const TRANG_THAI_LABEL: Record<TrangThaiHD, string> = {
  'dang-vay':    'Đang vay',
  'binh-thuong': 'Bình thường',
  'gan-dao-han': 'Gần đáo hạn',
  'qua-han':     'Quá hạn',
  'tat-toan':    'Tất toán',
}

interface Props {
  open: boolean
  onClose: () => void
  editing?: HopDongTinDung | null
}

const emptyForm = {
  soHopDong: '', entity: 'SAG' as EntityType, nguoiVay: '',
  nganHang: 'Agribank' as BankName, chiNhanh: '',
  hanMuc: '', soTienGiaiNgan: '', laiSuat: '',
  phuongThuc: 'giam-dan' as PhuongThuc, kyTra: 'monthly' as KyTra,
  ngayKy: '', ngayDaoHan: '', trangThai: 'dang-vay' as TrangThaiHD, ghiChu: '',
}

export default function HopDongForm({ open, onClose, editing }: Props) {
  const [form, setForm] = useState(() =>
    editing
      ? {
          soHopDong: editing.soHopDong, entity: editing.entity, nguoiVay: editing.nguoiVay ?? '',
          nganHang: editing.nganHang, chiNhanh: editing.chiNhanh ?? '',
          hanMuc: String(editing.hanMuc), soTienGiaiNgan: String(editing.soTienGiaiNgan),
          laiSuat: String(editing.laiSuat), phuongThuc: editing.phuongThuc, kyTra: editing.kyTra,
          ngayKy: editing.ngayKy, ngayDaoHan: editing.ngayDaoHan,
          trangThai: editing.trangThai, ghiChu: editing.ghiChu ?? '',
        }
      : emptyForm,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  if (!open) return null

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.soHopDong || !form.hanMuc || !form.soTienGiaiNgan || !form.laiSuat || !form.ngayKy || !form.ngayDaoHan) {
      setError('Vui lòng điền đủ Số hợp đồng, Hạn mức, Số tiền giải ngân, Lãi suất, Ngày ký và Ngày đáo hạn.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveHopDong(
        {
          soHopDong: form.soHopDong, entity: form.entity, nguoiVay: form.nguoiVay || undefined,
          nganHang: form.nganHang, chiNhanh: form.chiNhanh || undefined,
          hanMuc: Number(form.hanMuc), soTienGiaiNgan: Number(form.soTienGiaiNgan),
          laiSuat: Number(form.laiSuat), phuongThuc: form.phuongThuc, kyTra: form.kyTra,
          ngayKy: form.ngayKy, ngayDaoHan: form.ngayDaoHan,
          trangThai: form.trangThai, ghiChu: form.ghiChu || undefined,
        },
        editing?.id,
      )
      onClose()
    } catch (e) {
      setError('Lưu thất bại, vui lòng thử lại.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-[#1C3557]">
            {editing ? 'Sửa hợp đồng tín dụng' : 'Thêm hợp đồng tín dụng'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Số hợp đồng *">
              <input className="input" value={form.soHopDong} onChange={e => set('soHopDong', e.target.value)} />
            </Field>
            <Field label="Pháp nhân">
              <select className="input" value={form.entity} onChange={e => set('entity', e.target.value)}>
                {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>

            <Field label="Người vay / đứng tên">
              <input className="input" value={form.nguoiVay} onChange={e => set('nguoiVay', e.target.value)} />
            </Field>
            <Field label="Ngân hàng">
              <select className="input" value={form.nganHang} onChange={e => set('nganHang', e.target.value)}>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>

            <Field label="Chi nhánh">
              <input className="input" value={form.chiNhanh} onChange={e => set('chiNhanh', e.target.value)} />
            </Field>
            <Field label="Trạng thái">
              <select className="input" value={form.trangThai} onChange={e => set('trangThai', e.target.value)}>
                {TRANG_THAI.map(t => <option key={t} value={t}>{TRANG_THAI_LABEL[t]}</option>)}
              </select>
            </Field>

            <Field label="Hạn mức (triệu đồng) *">
              <input type="number" className="input" value={form.hanMuc} onChange={e => set('hanMuc', e.target.value)} />
            </Field>
            <Field label="Số tiền giải ngân *">
              <input type="number" className="input" value={form.soTienGiaiNgan} onChange={e => set('soTienGiaiNgan', e.target.value)} />
            </Field>

            <Field label="Lãi suất (%/năm) *">
              <input type="number" step="0.01" className="input" value={form.laiSuat} onChange={e => set('laiSuat', e.target.value)} />
            </Field>
            <Field label="Phương thức trả gốc">
              <select className="input" value={form.phuongThuc} onChange={e => set('phuongThuc', e.target.value)}>
                <option value="giam-dan">Giảm dần</option>
                <option value="cuoi-ky">Trả cuối kỳ</option>
              </select>
            </Field>

            <Field label="Kỳ trả">
              <select className="input" value={form.kyTra} onChange={e => set('kyTra', e.target.value)}>
                <option value="monthly">Hàng tháng</option>
                <option value="quarterly">Hàng quý</option>
              </select>
            </Field>
            <div />

            <Field label="Ngày ký *">
              <input type="date" className="input" value={form.ngayKy} onChange={e => set('ngayKy', e.target.value)} />
            </Field>
            <Field label="Ngày đáo hạn *">
              <input type="date" className="input" value={form.ngayDaoHan} onChange={e => set('ngayDaoHan', e.target.value)} />
            </Field>

            <div className="col-span-2">
              <Field label="Ghi chú">
                <textarea className="input" rows={2} value={form.ghiChu} onChange={e => set('ghiChu', e.target.value)} />
              </Field>
            </div>
          </div>

          {!editing && (
            <p className="mt-3 text-xs text-gray-500">
              Lịch trả nợ sẽ được tự động sinh dựa trên ngày ký, ngày đáo hạn, kỳ trả và phương thức trả gốc.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
            {saving ? 'Đang lưu…' : 'Lưu hợp đồng'}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}
