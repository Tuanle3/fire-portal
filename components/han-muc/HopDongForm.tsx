'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { saveHopDong } from '@/lib/han-muc-store'
import {
  HopDongTinDung, EntityType, BankName, PhuongThuc, KyTra, TrangThaiHD, LaiSuatLoai,
} from '@/lib/han-muc-types'

const ENTITIES: EntityType[]    = ['SAG', 'SAHS', 'ĐTSA', 'YANA', 'Cá nhân']
const BANKS:    BankName[]      = ['Agribank', 'ACB', 'BIDV', 'Vietinbank', 'Khác']
const TRANG_THAI: TrangThaiHD[] = ['dang-vay', 'binh-thuong', 'gan-dao-han', 'qua-han', 'tat-toan']

const TRANG_THAI_LABEL: Record<TrangThaiHD, string> = {
  'dang-vay': 'Đang vay', 'binh-thuong': 'Bình thường', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}

interface Props { open: boolean; onClose: () => void; editing?: HopDongTinDung | null }

const emptyForm = {
  soHopDong: '', entity: 'SAG' as EntityType, nguoiVay: '',
  nganHang: 'Agribank' as BankName, chiNhanh: '',
  hanMuc: '', soTienGiaiNgan: '',
  laiSuatLoai: 'co-dinh' as LaiSuatLoai,
  laiSuat: '', soThangUuDai: '', laiSuatSauUuDai: '',
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
          laiSuatLoai: editing.laiSuatLoai ?? 'co-dinh',
          laiSuat: String(editing.laiSuat),
          soThangUuDai: editing.soThangUuDai != null ? String(editing.soThangUuDai) : '',
          laiSuatSauUuDai: editing.laiSuatSauUuDai != null ? String(editing.laiSuatSauUuDai) : '',
          phuongThuc: editing.phuongThuc, kyTra: editing.kyTra,
          ngayKy: editing.ngayKy, ngayDaoHan: editing.ngayDaoHan,
          trangThai: editing.trangThai, ghiChu: editing.ghiChu ?? '',
        }
      : emptyForm,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  
  useEffect(() => {
  if (!open) return
  setForm(editing ? {
    soHopDong: editing.soHopDong, entity: editing.entity, nguoiVay: editing.nguoiVay ?? '',
    nganHang: editing.nganHang, chiNhanh: editing.chiNhanh ?? '',
    hanMuc: String(editing.hanMuc), soTienGiaiNgan: String(editing.soTienGiaiNgan),
    laiSuatLoai: editing.laiSuatLoai ?? 'co-dinh',
    laiSuat: String(editing.laiSuat),
    soThangUuDai: editing.soThangUuDai != null ? String(editing.soThangUuDai) : '',
    laiSuatSauUuDai: editing.laiSuatSauUuDai != null ? String(editing.laiSuatSauUuDai) : '',
    phuongThuc: editing.phuongThuc, kyTra: editing.kyTra,
    ngayKy: editing.ngayKy, ngayDaoHan: editing.ngayDaoHan,
    trangThai: editing.trangThai, ghiChu: editing.ghiChu ?? '',
  } : emptyForm)
  setError('')
}, [open, editing])

const fmtInput = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? Number(num).toLocaleString('vi-VN') : ''
  }
  const parseInput = (v: string) => v.replace(/\./g, '').replace(/,/g, '')
  
if (!open) return null

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    const thieuCoBan  = !form.soHopDong || !form.hanMuc || !form.soTienGiaiNgan || !form.laiSuat || !form.ngayKy || !form.ngayDaoHan
    const thieuThaNoi = form.laiSuatLoai === 'tha-noi' && (!form.soThangUuDai || !form.laiSuatSauUuDai)
    if (thieuCoBan || thieuThaNoi) {
      setError('Vui lòng điền đủ các trường bắt buộc (đánh dấu *).')
      return
    }
    setSaving(true)
    setError('')
    try {
      // QUAN TRỌNG: chỉ đưa vào payload các trường có giá trị.
      // Firestore không cho phép field value là undefined.
      const payload: any = {
        soHopDong: form.soHopDong,
        entity: form.entity,
        nganHang: form.nganHang,
        hanMuc: Number(form.hanMuc),
        soTienGiaiNgan: Number(form.soTienGiaiNgan),
        laiSuat: Number(form.laiSuat),
        laiSuatLoai: form.laiSuatLoai,
        phuongThuc: form.phuongThuc,
        kyTra: form.kyTra,
        ngayKy: form.ngayKy,
        ngayDaoHan: form.ngayDaoHan,
        trangThai: form.trangThai,
      }
      if (form.nguoiVay) payload.nguoiVay = form.nguoiVay
      if (form.chiNhanh) payload.chiNhanh = form.chiNhanh
      if (form.ghiChu)   payload.ghiChu   = form.ghiChu
      if (form.laiSuatLoai === 'tha-noi') {
        payload.soThangUuDai    = Number(form.soThangUuDai)
        payload.laiSuatSauUuDai = Number(form.laiSuatSauUuDai)
      }

      await saveHopDong(payload, editing?.id)
      onClose()
    } catch (e) {
      setError('Lưu thất bại, vui lòng thử lại.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="nh-modal-overlay" onClick={onClose}>
      <div className="nh-modal-card" onClick={e => e.stopPropagation()}>
        <div className="nh-modal-head">
          <span className="nh-modal-title">{editing ? 'Sửa hợp đồng tín dụng' : 'Thêm hợp đồng tín dụng'}</span>
          <button className="nh-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="nh-modal-body">
          <div className="nh-form-grid">
            <Field label="Số hợp đồng *">
              <input className="nh-input" value={form.soHopDong} onChange={e => set('soHopDong', e.target.value)} />
            </Field>
            <Field label="Pháp nhân">
              <select className="nh-select" value={form.entity} onChange={e => set('entity', e.target.value)}>
                {ENTITIES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Người vay / đứng tên">
              <input className="nh-input" value={form.nguoiVay} onChange={e => set('nguoiVay', e.target.value)} />
            </Field>

            <Field label="Ngân hàng">
              <select className="nh-select" value={form.nganHang} onChange={e => set('nganHang', e.target.value)}>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Chi nhánh">
              <input className="nh-input" value={form.chiNhanh} onChange={e => set('chiNhanh', e.target.value)} />
            </Field>
            <Field label="Trạng thái">
              <select className="nh-select" value={form.trangThai} onChange={e => set('trangThai', e.target.value)}>
                {TRANG_THAI.map(t => <option key={t} value={t}>{TRANG_THAI_LABEL[t]}</option>)}
              </select>
            </Field>

            <Field label="Hạn mức (VNĐ) *">
              <input className="nh-input" value={fmtInput(form.hanMuc)} onChange={e => set('hanMuc', parseInput(e.target.value))} placeholder="VD: 3.640.000.000" />
            </Field>
            <Field label="Số tiền giải ngân (VNĐ) *">
              <input className="nh-input" value={fmtInput(form.soTienGiaiNgan)} onChange={e => set('soTienGiaiNgan', parseInput(e.target.value))} placeholder="VD: 3.640.000.000" />
            </Field>
            <Field label="Phương thức trả gốc">
              <select className="nh-select" value={form.phuongThuc} onChange={e => set('phuongThuc', e.target.value)}>
                <option value="giam-dan">Giảm dần</option>
                <option value="cuoi-ky">Trả cuối kỳ</option>
              </select>
            </Field>

            <Field label="Kỳ trả">
              <select className="nh-select" value={form.kyTra} onChange={e => set('kyTra', e.target.value)}>
                <option value="monthly">Hàng tháng</option>
                <option value="quarterly">Hàng quý</option>
              </select>
            </Field>
            <Field label="Ngày ký *">
              <input type="date" className="nh-input" value={form.ngayKy} onChange={e => set('ngayKy', e.target.value)} />
            </Field>
            <Field label="Ngày đáo hạn *">
              <input type="date" className="nh-input" value={form.ngayDaoHan} onChange={e => set('ngayDaoHan', e.target.value)} />
            </Field>
          </div>

          <span className="nh-label">Loại lãi suất</span>
          <div className="nh-radio-row">
            <label>
              <input type="radio" checked={form.laiSuatLoai === 'co-dinh'} onChange={() => set('laiSuatLoai', 'co-dinh')} />
              Cố định
            </label>
            <label>
              <input type="radio" checked={form.laiSuatLoai === 'tha-noi'} onChange={() => set('laiSuatLoai', 'tha-noi')} />
              Thả nổi (có ưu đãi ban đầu)
            </label>
          </div>

          <div className="nh-form-grid" style={{ marginTop: 2 }}>
            {form.laiSuatLoai === 'co-dinh' ? (
              <Field label="Lãi suất (%/năm) *">
                <input type="number" step="0.01" className="nh-input" value={form.laiSuat} onChange={e => set('laiSuat', e.target.value)} />
              </Field>
            ) : (
              <>
                <Field label="Lãi suất ưu đãi (%/năm) *">
                  <input type="number" step="0.01" className="nh-input" value={form.laiSuat} onChange={e => set('laiSuat', e.target.value)} />
                </Field>
                <Field label="Số tháng ưu đãi *">
                  <input type="number" className="nh-input" value={form.soThangUuDai} onChange={e => set('soThangUuDai', e.target.value)} placeholder="VD: 12" />
                </Field>
                <Field label="Lãi suất sau ưu đãi (%/năm) *">
                  <input type="number" step="0.01" className="nh-input" value={form.laiSuatSauUuDai} onChange={e => set('laiSuatSauUuDai', e.target.value)} />
                </Field>
              </>
            )}
          </div>

          <Field label="Ghi chú">
            <textarea className="nh-textarea" rows={2} value={form.ghiChu} onChange={e => set('ghiChu', e.target.value)} />
          </Field>

          {!editing && (
            <p className="nh-hint">
              Lịch trả nợ sẽ được tự động sinh dựa trên ngày ký, ngày đáo hạn, kỳ trả và phương thức trả gốc.
              {form.laiSuatLoai === 'tha-noi' && ' Sau khi hết số tháng ưu đãi, hệ thống tự chuyển sang lãi suất thả nổi cho các kỳ tiếp theo.'}
            </p>
          )}
          {error && <p className="nh-err">{error}</p>}
        </div>

        <div className="nh-modal-foot">
          <button className="btn-ghost" onClick={onClose}>Hủy</button>
          <button className="btn-save" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu hợp đồng'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="nh-label">{label}</span>
      {children}
    </label>
  )
}