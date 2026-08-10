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

    if (option === 'giam-ls' && !laiSuatMoi) {
      setError('Vui lòng nhập lãi suất mới.')
      return
    }
    if (option === 'von-hoa-lai' && !gocMoi) {
      setError('Vui lòng nhập dư nợ gốc mới.')
      return
    }

    setSaving(true)
    setError('')
    try {
      // QUAN TRỌNG: chỉ đưa vào object các trường có giá trị thực.
      // Firestore không cho phép field value là undefined.
      const cc: any = {
        hopDongId: hopDong.id,
        tuKy,
        option,
        dunNoTruoc: kyMoc.dunNoDauKy,
        laiKyTruoc: kyMoc.laiTra,
        dunNoSau: option === 'von-hoa-lai' ? Number(gocMoi) : kyMoc.dunNoDauKy,
        laiKySau: option === 'giam-ls'
          ? Math.round(kyMoc.dunNoDauKy * (Number(laiSuatMoi) / 100 / (hopDong.kyTra === 'monthly' ? 12 : 4)))
          : kyMoc.laiTra,
        ngayTao: new Date().toISOString().slice(0, 10),
      }
      if (option === 'gia-han')     cc.ngayDaoHanMoi = ngayDaoHanMoi
      if (option === 'giam-ls')     cc.laiSuatMoi    = Number(laiSuatMoi)
      if (option === 'von-hoa-lai') cc.gocMoi        = Number(gocMoi)
      if (ghiChu)                   cc.ghiChu        = ghiChu

      await saveCoCauNo(cc, hopDong, kyList)
      onClose()
    } catch (e) {
      setError('Lưu phương án cơ cấu thất bại.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="nh-modal-overlay" onClick={onClose}>
      <div className="nh-modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="nh-modal-head">
          <span className="nh-modal-title">Cơ cấu nợ — {hopDong.soHopDong}</span>
          <button className="nh-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="nh-modal-body">
          <div style={{ marginBottom: 10 }}>
            <span className="nh-label">Áp dụng từ kỳ</span>
            <select className="nh-select" value={tuKy} onChange={e => setTuKy(Number(e.target.value))}>
              {kyList.filter(k => k.trangThai !== 'da-tra').map(k => (
                <option key={k.id} value={k.soKy}>
                  Kỳ {k.soKy} — {k.ngayTra} (dư nợ {k.dunNoDauKy.toLocaleString('vi-VN')})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <span className="nh-label">Hình thức cơ cấu</span>
            <select className="nh-select" value={option} onChange={e => setOption(e.target.value as CoCauOption)}>
              {(Object.keys(OPTION_LABEL) as CoCauOption[]).map(o => (
                <option key={o} value={o}>{OPTION_LABEL[o]}</option>
              ))}
            </select>
          </div>

          {option === 'gia-han' && (
            <div style={{ marginBottom: 10 }}>
              <span className="nh-label">Ngày đáo hạn mới</span>
              <input type="date" className="nh-input" value={ngayDaoHanMoi} onChange={e => setNgayDaoHanMoi(e.target.value)} />
            </div>
          )}
          {option === 'giam-ls' && (
            <div style={{ marginBottom: 10 }}>
              <span className="nh-label">Lãi suất mới (%/năm)</span>
              <input type="number" step="0.01" className="nh-input" value={laiSuatMoi} onChange={e => setLaiSuatMoi(e.target.value)} />
            </div>
          )}
          {option === 'von-hoa-lai' && (
            <div style={{ marginBottom: 10 }}>
              <span className="nh-label">Dư nợ gốc mới (đã gồm lãi vốn hóa)</span>
              <input type="number" className="nh-input" value={gocMoi} onChange={e => setGocMoi(e.target.value)} />
            </div>
          )}

          <div style={{ marginBottom: 4 }}>
            <span className="nh-label">Ghi chú</span>
            <textarea className="nh-textarea" rows={2} value={ghiChu} onChange={e => setGhiChu(e.target.value)} />
          </div>

          <p className="nh-hint">
            Sau khi lưu, hệ thống sẽ đánh dấu các kỳ từ kỳ {tuKy} trở đi là "Đã cơ cấu" và sinh lại
            lịch trả nợ mới dựa trên phương án đã chọn.
          </p>
          {error && <p className="nh-err">{error}</p>}
        </div>

        <div className="nh-modal-foot">
          <button className="btn-ghost" onClick={onClose}>Hủy</button>
          <button className="btn-save" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu phương án'}
          </button>
        </div>
      </div>
    </div>
  )
}