'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { saveHopDong } from '@/lib/han-muc-store'
import EntitySelect from '@/components/han-muc/EntitySelect'
import {
  HopDongTinDung, EntityType, BankName, PhuongThuc, KyTra, KyTraGoc, TrangThaiHD, LaiSuatLoai,
} from '@/lib/han-muc-types'

const BANKS: BankName[] = [
  'Agribank', 'Vietcombank', 'BIDV', 'Vietinbank',
  'ACB', 'MB Bank', 'Techcombank', 'VPBank', 'Sacombank',
  'HDBank', 'VIB', 'TPBank', 'MSB', 'SeABank', 'LPBank',
  'OCB', 'SHB', 'Eximbank', 'Nam A Bank', 'NCB',
  'ABBank', 'BacABank', 'BaoViet Bank', 'CBBank', 'PGBank',
  'VietBank', 'VietABank', 'KienlongBank', 'Vikki Bank',
  'Chailease', 'Khác',
]
const TRANG_THAI: TrangThaiHD[] = ['dang-vay', 'binh-thuong', 'gan-dao-han', 'qua-han', 'tat-toan']

const TRANG_THAI_LABEL: Record<TrangThaiHD, string> = {
  'dang-vay': 'Đang vay', 'binh-thuong': 'Bình thường', 'gan-dao-han': 'Gần đáo hạn',
  'qua-han': 'Quá hạn', 'tat-toan': 'Tất toán',
}

interface Props {
  open: boolean
  onClose: () => void
  editing?: HopDongTinDung | null
  /** Danh sách các HĐ đóng vai trò "hạn mức khung" — để chọn khung cha khi tạo bộ hồ sơ con */
  khungList?: HopDongTinDung[]
  /** khungId → snapshot khả dụng (tongHanMuc/daSuDung/khaDung/soBoDangVay), hiển thị tham khảo khi chọn khung */
  khaDungMap?: Record<string, { tongHanMuc: number; daSuDung: number; khaDung: number; soBoDangVay: number }>
  /** Nếu mở form từ nút "+ Giải ngân bộ hồ sơ mới" của 1 khung cụ thể → khoá sẵn khung này */
  presetHanMucKhungId?: string
}

const emptyForm = {
  soHopDong: '', entity: 'SAP' as EntityType, nguoiVay: '',
  nganHang: 'Agribank' as BankName, chiNhanh: '',
  hanMuc: '', soTienGiaiNgan: '',
  laiSuatLoai: 'co-dinh' as LaiSuatLoai,
  laiSuat: '', soThangUuDai: '', laiSuatSauUuDai: '',
  phuongThuc: 'giam-dan' as PhuongThuc,
  kyTra: 'monthly' as KyTra,
  kyTraGoc: '' as KyTraGoc | '',   // để trống = đồng nhất với kyTra
  ngayKy: '', ngayTraGocDauTien: '', ngayDaoHan: '', trangThai: 'dang-vay' as TrangThaiHD, ghiChu: '',
  // ── gốc làm tròn theo NH ──
  gocTraCoDinh: '',
  // ── số kỳ trả gốc (chỉ dùng khi kyTraGoc='quarterly') ──
  soKyTraGoc: '',
  // ── ân hạn gốc ──
  soKyAnHan: '',
  // ── hạn mức khung ──
  loaiHD: 'thong-thuong' as 'thong-thuong' | 'han-muc-khung',
  hanMucKhungId: '',
  soBoHoSo: '',
}

/** Form khi thêm mới, có áp preset khung (nếu mở từ nút "+ Giải ngân bộ hồ sơ mới" của 1 khung) */
function buildEmptyForm(presetHanMucKhungId?: string) {
  return { ...emptyForm, hanMucKhungId: presetHanMucKhungId ?? '' }
}

/** Form khi sửa 1 HĐ có sẵn */
function buildFormFromHopDong(editing: HopDongTinDung) {
  return {
    soHopDong: editing.soHopDong, entity: editing.entity, nguoiVay: editing.nguoiVay ?? '',
    nganHang: editing.nganHang, chiNhanh: editing.chiNhanh ?? '',
    hanMuc: String(editing.hanMuc), soTienGiaiNgan: String(editing.soTienGiaiNgan),
    laiSuatLoai: editing.laiSuatLoai ?? 'co-dinh',
    laiSuat: String(editing.laiSuat),
    soThangUuDai: editing.soThangUuDai != null ? String(editing.soThangUuDai) : '',
    laiSuatSauUuDai: editing.laiSuatSauUuDai != null ? String(editing.laiSuatSauUuDai) : '',
    phuongThuc: editing.phuongThuc,
    kyTra: editing.kyTra,
    kyTraGoc: editing.kyTraGoc ?? '',
    ngayKy: editing.ngayKy, ngayTraGocDauTien: editing.ngayTraGocDauTien ?? '', ngayDaoHan: editing.ngayDaoHan,
    trangThai: editing.trangThai, ghiChu: editing.ghiChu ?? '',
    gocTraCoDinh: editing.gocTraCoDinh != null ? String(editing.gocTraCoDinh) : '',
    soKyTraGoc: editing.soKyTraGoc != null && !isNaN(Number(editing.soKyTraGoc)) ? String(editing.soKyTraGoc) : '',
    soKyAnHan: editing.soKyAnHan != null && !isNaN(Number(editing.soKyAnHan)) ? String(editing.soKyAnHan) : '',
    loaiHD: (editing.loaiHD ?? 'thong-thuong') as 'thong-thuong' | 'han-muc-khung',
    hanMucKhungId: editing.hanMucKhungId ?? '',
    soBoHoSo: editing.soBoHoSo ?? '',
  }
}

export default function HopDongForm({
  open, onClose, editing,
  khungList = [], khaDungMap = {}, presetHanMucKhungId,
}: Props) {
  const [form, setForm] = useState(() =>
    editing ? buildFormFromHopDong(editing) : buildEmptyForm(presetHanMucKhungId),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!open) return
    setForm(editing ? buildFormFromHopDong(editing) : buildEmptyForm(presetHanMucKhungId))
    setError('')
  }, [open, editing, presetHanMucKhungId])

  const fmtInput = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? Number(num).toLocaleString('vi-VN') : ''
  }
  const parseInput = (v: string) => v.replace(/\D/g, '')

  if (!open) return null

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ── Preview: tính gốc lý thuyết để hiển thị gợi ý ──
  const gocLyThuyet = (() => {
    const gn  = Number(form.soTienGiaiNgan)
    const nk  = form.ngayKy
    const ndh = form.ngayDaoHan
    if (!gn || !nk || !ndh) return null
    const d1 = new Date(nk), d2 = new Date(ndh)
    const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())
    if (months <= 0) return null
    const n = form.kyTra === 'quarterly' ? Math.ceil(months / 3) : months
    return Math.floor(gn / n)
  })()

  const handleSubmit = async () => {
    const thieuCoBan  = !form.soHopDong || !form.hanMuc || !form.soTienGiaiNgan || !form.laiSuat || !form.ngayKy || !form.ngayDaoHan
    const thieuThaNoi = form.laiSuatLoai === 'tha-noi' && (!form.soThangUuDai || !form.laiSuatSauUuDai)
    const thieuSoKyGoc = form.kyTra === 'monthly' && form.kyTraGoc === 'quarterly' && !form.soKyTraGoc
    if (thieuCoBan || thieuThaNoi || thieuSoKyGoc) {
      setError('Vui lòng điền đủ các trường bắt buộc (đánh dấu *).')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Bỏ dấu chấm phân cách hàng nghìn (format Việt Nam) trước khi parse số
      const stripDots = (v: string) => v.replace(/\./g, '').replace(/,/g, '')
      const hanMucNum         = Number(stripDots(form.hanMuc))
      const soTienGiaiNganNum = Number(stripDots(form.soTienGiaiNgan))
      const laiSuatNum        = Number(form.laiSuat)
      if (isNaN(hanMucNum) || isNaN(soTienGiaiNganNum) || isNaN(laiSuatNum)) {
        setError('Giá trị số không hợp lệ, vui lòng kiểm tra lại.')
        setSaving(false)
        return
      }
      const payload: any = {
        soHopDong: form.soHopDong,
        entity: form.entity,
        nganHang: form.nganHang,
        hanMuc: hanMucNum,
        soTienGiaiNgan: soTienGiaiNganNum,
        laiSuat: laiSuatNum,
        laiSuatLoai: form.laiSuatLoai,
        phuongThuc: form.phuongThuc,
        kyTra: form.kyTra,
        ngayKy: form.ngayKy,
        ngayDaoHan: form.ngayDaoHan,
        trangThai: form.trangThai,
      }
      if (form.nguoiVay)    payload.nguoiVay    = form.nguoiVay
      if (form.chiNhanh)    payload.chiNhanh    = form.chiNhanh
      if (form.ghiChu)      payload.ghiChu      = form.ghiChu
      if (form.kyTraGoc)    payload.kyTraGoc    = form.kyTraGoc
      if (form.ngayTraGocDauTien) payload.ngayTraGocDauTien = form.ngayTraGocDauTien
      // ── Số kỳ trả gốc: lưu khi đã nhập (kyTraGoc quarterly hoặc kyTra quarterly) ──
      if (form.soKyTraGoc) {
        const soKyNum = Number(form.soKyTraGoc)
        if (!isNaN(soKyNum) && soKyNum > 0) payload.soKyTraGoc = soKyNum
      }
      if (form.laiSuatLoai === 'tha-noi') {
        payload.soThangUuDai    = Number(form.soThangUuDai)
        payload.laiSuatSauUuDai = Number(form.laiSuatSauUuDai)
      }
      // ── Ân hạn gốc: chỉ lưu nếu có nhập ──
      const soKyAnHanNum = Number(form.soKyAnHan)
      if (form.soKyAnHan && !isNaN(soKyAnHanNum) && soKyAnHanNum > 0) {
        payload.soKyAnHan = soKyAnHanNum
      }
      // ── Gốc cứng: chỉ lưu nếu có nhập ──
      const gocCung = Number(stripDots(form.gocTraCoDinh))
      if (form.gocTraCoDinh && !isNaN(gocCung) && gocCung > 0) {
        payload.gocTraCoDinh = gocCung
      }
      // ── Hạn mức khung: HĐ khung hoặc bộ hồ sơ con thuộc 1 khung ──
      if (form.loaiHD === 'han-muc-khung') {
        payload.loaiHD = 'han-muc-khung'
      } else if (form.hanMucKhungId) {
        payload.hanMucKhungId = form.hanMucKhungId
        if (form.soBoHoSo) payload.soBoHoSo = form.soBoHoSo
      }

      await saveHopDong(payload, editing?.id)
      onClose()
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      setError(`Lưu thất bại: ${msg}`)
      console.error('[HopDongForm] saveHopDong error:', e)
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
          {/* ══════════════════════════════════════════
              Hạn mức khung — phân loại HĐ (ẩn khi đang sửa để tránh đổi loại giữa chừng)
          ══════════════════════════════════════════ */}
          {!editing && !presetHanMucKhungId && (
            <div style={{
              marginBottom: 14, background: '#eff6ff', border: '1px solid #93c5fd88',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#1d4ed8' }}>
                <input
                  type="checkbox"
                  checked={form.loaiHD === 'han-muc-khung'}
                  onChange={e => setForm(f => ({
                    ...f,
                    loaiHD: e.target.checked ? 'han-muc-khung' : 'thong-thuong',
                    hanMucKhungId: e.target.checked ? '' : f.hanMucKhungId,
                    soTienGiaiNgan: e.target.checked ? '0' : f.soTienGiaiNgan,
                  }))}
                />
                🏦 Đây là hạn mức khung (không giải ngân trực tiếp — các bộ hồ sơ con sẽ trỏ về đây)
              </label>
            </div>
          )}

          {form.loaiHD !== 'han-muc-khung' && (khungList.length > 0 || presetHanMucKhungId) && (
            <div style={{ marginBottom: 14, background: '#fffbf0', border: '1px solid #D4A64A55', borderRadius: 8, padding: '10px 14px' }}>
              <Field label="Thuộc hạn mức khung (bỏ trống nếu là HĐ vay độc lập)">
                <select
                  className="nh-select"
                  value={form.hanMucKhungId}
                  disabled={!!presetHanMucKhungId}
                  onChange={e => set('hanMucKhungId', e.target.value)}
                >
                  <option value="">— Không thuộc khung nào (HĐ độc lập) —</option>
                  {khungList.map(k => {
                    const kd = khaDungMap[k.id]
                    return (
                      <option key={k.id} value={k.id}>
                        {k.soHopDong}{kd ? ` — khả dụng ${kd.khaDung.toLocaleString('vi-VN')} đ` : ''}
                      </option>
                    )
                  })}
                </select>
              </Field>
              {form.hanMucKhungId && (
                <Field label="Số bộ hồ sơ (VD: HSTN-001)">
                  <input className="nh-input" value={form.soBoHoSo} onChange={e => set('soBoHoSo', e.target.value)} placeholder="VD: HSTN-001" style={{ marginTop: 8 }} />
                </Field>
              )}
            </div>
          )}

          <div className="nh-form-grid">
            <Field label="Số hợp đồng *">
              <input className="nh-input" value={form.soHopDong} onChange={e => set('soHopDong', e.target.value)} />
            </Field>
            <Field label="Pháp nhân">
              <EntitySelect value={form.entity} onChange={v => set('entity', v)} className="nh-select" />
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

            <Field label="Kỳ trả lãi">
              <select className="nh-select" value={form.kyTra} onChange={e => {
                set('kyTra', e.target.value)
                // lưu động: phuongThuc luôn là cuoi-ky, kyTraGoc không cần
                if (e.target.value === 'luu-dong') {
                  setForm(f => ({ ...f, kyTra: 'luu-dong', phuongThuc: 'cuoi-ky', kyTraGoc: '' }))
                }
              }}>
                <option value="monthly">Hàng tháng</option>
                <option value="quarterly">Hàng quý</option>
                <option value="luu-dong">Lưu động (lãi tháng, gốc cuối kỳ)</option>
              </select>
            </Field>
            {/* Kỳ trả gốc riêng — chỉ hiện khi kyTra=monthly và không phải lưu động */}
            {form.kyTra === 'monthly' && (
              <Field label="Kỳ trả gốc">
                <select
                  className="nh-select"
                  value={form.kyTraGoc}
                  onChange={e => set('kyTraGoc', e.target.value)}
                  style={{ borderColor: form.kyTraGoc && form.kyTraGoc !== 'monthly' ? '#D4A64A' : undefined }}
                >
                  <option value="">Đồng nhất với kỳ lãi (hàng tháng)</option>
                  <option value="quarterly">Hàng quý (lãi tháng, gốc quý)</option>
                  <option value="cuoi-ky">Cuối kỳ (lãi tháng, gốc 1 lần)</option>
                </select>
                {form.kyTraGoc === 'quarterly' && (
                  <div style={{ fontSize: 11, color: '#92600a', marginTop: 4 }}>
                    ⚡ Lịch sẽ sinh hàng tháng — tháng 3, 6, 9… mới có gốc
                  </div>
                )}
                {form.kyTraGoc === 'cuoi-ky' && (
                  <div style={{ fontSize: 11, color: '#92600a', marginTop: 4 }}>
                    ⚡ Mỗi tháng chỉ trả lãi, gốc trả 1 lần cuối hợp đồng
                  </div>
                )}
              </Field>
            )}
            {/* Số kỳ trả gốc — chỉ hiện khi chọn Kỳ trả gốc = Hàng quý */}
            {form.kyTra === 'monthly' && form.kyTraGoc === 'quarterly' && (
              <Field label="Số kỳ trả gốc (theo NH) *">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" className="nh-input"
                  value={form.soKyTraGoc}
                  onChange={e => set('soKyTraGoc', e.target.value.replace(/\D/g, ''))}
                  placeholder="VD: 12 (mỗi kỳ cách nhau 1 quý)"
                  style={{ borderColor: form.soKyTraGoc ? '#D4A64A' : undefined }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>
                  Tổng gốc giải ngân sẽ chia đều cho đúng số kỳ này (mỗi kỳ cách nhau 3 tháng). Nhập theo hợp đồng ngân hàng, hệ thống không tự suy ra từ ngày đáo hạn nữa.
                </div>
              </Field>
            )}
            {/* Ân hạn gốc — số kỳ đầu chỉ trả lãi, không trả gốc */}
            <Field label={`Ân hạn gốc (số ${form.kyTra === 'quarterly' ? 'quý' : 'tháng'} đầu chỉ trả lãi)`}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" className="nh-input"
                value={form.soKyAnHan}
                onChange={e => set('soKyAnHan', e.target.value.replace(/\D/g, ''))}
                placeholder={`VD: 3 (${form.kyTra === 'quarterly' ? '3 quý' : '3 tháng'} đầu không trả gốc)`}
                style={{ borderColor: form.soKyAnHan ? '#7c3aed' : undefined }}
              />
              {form.soKyAnHan && Number(form.soKyAnHan) > 0 && (
                <div style={{ fontSize: 11, color: '#5b21b6', marginTop: 4, lineHeight: 1.4 }}>
                  ⏳ {Number(form.soKyAnHan)} {form.kyTra === 'quarterly' ? 'quý' : 'tháng'} đầu chỉ trả lãi — gốc bắt đầu trả từ kỳ {Number(form.soKyAnHan) + 1}
                </div>
              )}
            </Field>
            <Field label="Ngày ký *">
              <input type="date" className="nh-input" value={form.ngayKy} onChange={e => set('ngayKy', e.target.value)} />
            </Field>
            <Field label="Ngày trả gốc đầu tiên (nếu có kỳ lẻ ngày)">
              <input
                type="date" className="nh-input"
                value={form.ngayTraGocDauTien}
                onChange={e => set('ngayTraGocDauTien', e.target.value)}
                style={{ borderColor: form.ngayTraGocDauTien ? '#D4A64A' : undefined }}
              />
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>
                Để trống nếu kỳ trả đều đặn từ ngày ký. Nếu ngày ký lệch với ngày trả định kỳ (VD: ký 02/12 nhưng trả gốc đầu vào 25/01),
                nhập ngày này — kỳ 1 sẽ tự tính lãi lẻ theo số ngày thực từ ngày ký đến ngày này, các kỳ sau neo theo ngày này hàng {form.kyTra === 'quarterly' ? 'quý' : 'tháng'}.
              </div>
            </Field>
            <Field label="Ngày đáo hạn *">
              <input type="date" className="nh-input" value={form.ngayDaoHan} onChange={e => set('ngayDaoHan', e.target.value)} />
            </Field>
          </div>

          {/* ── Loại lãi suất ── */}
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

          {/* ══════════════════════════════════════════
              Gốc làm tròn theo ngân hàng (TÙY CHỌN)
          ══════════════════════════════════════════ */}
          <div style={{
            marginTop: 14,
            background: '#fffbf0',
            border: '1px solid #D4A64A55',
            borderRadius: 8,
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92600a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏦</span> Gốc trả mỗi kỳ theo ngân hàng (tùy chọn)
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, lineHeight: 1.5 }}>
              Nếu ngân hàng đã làm tròn số gốc cố định, nhập vào đây. Hệ thống sẽ dùng số này thay vì tự tính.
              Lãi vẫn tính theo dư nợ đầu kỳ. Kỳ cuối tự động điều chỉnh số dư còn lại.
              {gocLyThuyet && (
                <span style={{ color: '#1C3557', fontWeight: 600 }}>
                  {' '}(Gốc lý thuyết: {gocLyThuyet.toLocaleString('vi-VN')} đ/kỳ)
                </span>
              )}
            </div>
            <Field label="">
              <input
                className="nh-input"
                value={fmtInput(form.gocTraCoDinh)}
                onChange={e => set('gocTraCoDinh', parseInput(e.target.value))}
                placeholder={gocLyThuyet ? `Lý thuyết: ${gocLyThuyet.toLocaleString('vi-VN')} — nhập số NH làm tròn` : 'VD: 56.041.672'}
                style={{ borderColor: form.gocTraCoDinh ? '#D4A64A' : undefined }}
              />
            </Field>
            {form.gocTraCoDinh && gocLyThuyet && (
              <div style={{ fontSize: 11, marginTop: 6, color: '#92600a' }}>
                Lệch so lý thuyết: {(Number(form.gocTraCoDinh) - gocLyThuyet).toLocaleString('vi-VN')} đ/kỳ
              </div>
            )}
          </div>

          <Field label="Ghi chú">
            <textarea className="nh-textarea" rows={2} value={form.ghiChu} onChange={e => set('ghiChu', e.target.value)} style={{ marginTop: 10 }} />
          </Field>

          {!editing && (
            <p className="nh-hint">
              {form.kyTra === 'luu-dong'
                ? 'Lưu động: lãi trả hàng tháng, gốc trả 1 lần khi đáo hạn.'
                : form.kyTraGoc === 'quarterly'
                  ? 'Lịch sinh hàng tháng — tháng 3, 6, 9… mới trả gốc, các tháng còn lại chỉ trả lãi.'
                  : form.kyTraGoc === 'cuoi-ky'
                    ? 'Lịch sinh hàng tháng — mỗi tháng chỉ trả lãi, gốc trả 1 lần cuối kỳ.'
                    : 'Lịch trả nợ tự động sinh theo kỳ trả và phương thức trả gốc.'}
              {form.soKyAnHan && Number(form.soKyAnHan) > 0 && ` Ân hạn ${form.soKyAnHan} ${form.kyTra === 'quarterly' ? 'quý' : 'tháng'} đầu — chỉ trả lãi, chưa thu gốc.`}
              {form.gocTraCoDinh && ' Gốc cứng áp dụng cho tất cả kỳ trả gốc, kỳ cuối tự điều chỉnh.'}
              {form.laiSuatLoai === 'tha-noi' && ' Sau ưu đãi hệ thống tự chuyển sang lãi suất thả nổi.'}
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
      {label && <span className="nh-label">{label}</span>}
      {children}
    </label>
  )
}