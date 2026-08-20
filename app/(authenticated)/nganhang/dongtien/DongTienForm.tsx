// ============================================================
// FORM — Nhập tay khoản thu/chi dòng tiền (Phần 1)
// Dùng đúng bộ class CSS hệ thống fire-portal (định nghĩa ở
// app/(authenticated)/nganhang/page.tsx) — không dùng Tailwind.
// ============================================================
'use client'

import { useState, useEffect } from 'react'
import {
  KhoanDongTien, LoaiDongTien, NhomDongTien, DoTinCay, ChuKyLap,
  NHOM_THEO_LOAI, NHOM_LABEL, DO_TIN_CAY_LABEL,
} from '@/lib/dong-tien-types'
import { saveKhoanDongTien } from '@/lib/dong-tien-store'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: EntityType[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']

interface Props {
  editing?:       KhoanDongTien | null
  entityMacDinh?: EntityType
  onSaved:        () => void
  onCancel:       () => void
}

const emptyForm = (entityMacDinh?: EntityType) => ({
  entity:     entityMacDinh ?? 'SAP',
  loai:       'thu' as LoaiDongTien,
  nhom:       'ban-hang' as NhomDongTien,
  ngayDuKien: new Date().toISOString().slice(0, 10),
  soTien:     0,
  doTinCay:   'du-kien' as DoTinCay,
  moTa:       '',
  lap:        'mot-lan' as ChuKyLap,
  soKyLap:    1,
  ghiChu:     '',
})

export default function DongTienForm({ editing, entityMacDinh, onSaved, onCancel }: Props) {
  const [form, setForm]     = useState(emptyForm(entityMacDinh))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (editing) {
      setForm({
        entity: editing.entity, loai: editing.loai, nhom: editing.nhom,
        ngayDuKien: editing.ngayDuKien, soTien: editing.soTien,
        doTinCay: editing.doTinCay ?? 'du-kien', moTa: editing.moTa,
        lap: 'mot-lan', soKyLap: 1, ghiChu: editing.ghiChu ?? '',
      })
    } else {
      setForm(emptyForm(entityMacDinh))
    }
  }, [editing, entityMacDinh])

  const nhomHopLe = NHOM_THEO_LOAI[form.loai]
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.moTa.trim()) { setError('Vui lòng nhập mô tả khoản.'); return }
    if (!form.soTien || form.soTien <= 0) { setError('Số tiền phải lớn hơn 0.'); return }

    setSaving(true)
    try {
      await saveKhoanDongTien(
        {
          entity: form.entity, loai: form.loai, nhom: form.nhom,
          ngayDuKien: form.ngayDuKien, soTien: form.soTien,
          doTinCay: form.loai === 'thu' ? form.doTinCay : undefined,
          moTa: form.moTa.trim(), lap: form.lap,
          soKyLap: form.lap === 'mot-lan' ? undefined : form.soKyLap,
          ghiChu: form.ghiChu.trim() || undefined,
        },
        editing?.id,
      )
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Có lỗi khi lưu, thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">{editing ? 'Sửa khoản dòng tiền' : 'Thêm khoản dòng tiền'}</span>
      </div>
      <div className="nh-card-body">
        <form onSubmit={handleSubmit}>
          <div className="nh-radio-row" style={{ marginBottom: 12 }}>
            <label>
              <input type="radio" name="loai" checked={form.loai === 'thu'} onChange={() => set('loai', 'thu')} />
              <span style={{ color: form.loai === 'thu' ? 'var(--nh-green)' : undefined }}>Khoản THU</span>
            </label>
            <label>
              <input type="radio" name="loai" checked={form.loai === 'chi'} onChange={() => set('loai', 'chi')} />
              <span style={{ color: form.loai === 'chi' ? 'var(--nh-red)' : undefined }}>Khoản CHI</span>
            </label>
          </div>

          <div className="nh-form-grid">
            <div>
              <label className="nh-label">Pháp nhân</label>
              <select className="nh-select" value={form.entity} onChange={e => set('entity', e.target.value as EntityType)}>
                {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="nh-label">Nhóm</label>
              <select className="nh-select" value={form.nhom} onChange={e => set('nhom', e.target.value as NhomDongTien)}>
                {nhomHopLe.map(n => <option key={n} value={n}>{NHOM_LABEL[n]}</option>)}
              </select>
            </div>
            <div>
              <label className="nh-label">Ngày dự kiến</label>
              <input type="date" className="nh-input" value={form.ngayDuKien} onChange={e => set('ngayDuKien', e.target.value)} />
            </div>
            <div>
              <label className="nh-label">Số tiền (VNĐ)</label>
              <input
                type="number" min={0} className="nh-input"
                value={form.soTien || ''} placeholder="0"
                onChange={e => set('soTien', Number(e.target.value))}
              />
            </div>
          </div>

          {form.loai === 'thu' && (
            <div style={{ marginBottom: 10 }}>
              <label className="nh-label">Độ tin cậy</label>
              <div className="nh-radio-row">
                {(Object.keys(DO_TIN_CAY_LABEL) as DoTinCay[]).map(d => (
                  <label key={d}>
                    <input type="radio" name="doTinCay" checked={form.doTinCay === d} onChange={() => set('doTinCay', d)} />
                    {DO_TIN_CAY_LABEL[d]}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label className="nh-label">Mô tả</label>
            <input
              type="text" className="nh-input" value={form.moTa}
              onChange={e => set('moTa', e.target.value)}
              placeholder="VD: Thu tiền cho thuê kiot T09/2026"
            />
          </div>

          {!editing && (
            <div className="nh-form-grid" style={{ background: '#F8FAFC', padding: 10, borderRadius: 8, border: '1px solid var(--nh-border)' }}>
              <div>
                <label className="nh-label">Lặp lại</label>
                <select className="nh-select" value={form.lap} onChange={e => set('lap', e.target.value as ChuKyLap)}>
                  <option value="mot-lan">Một lần</option>
                  <option value="hang-thang">Hàng tháng</option>
                  <option value="hang-quy">Hàng quý</option>
                </select>
              </div>
              {form.lap !== 'mot-lan' && (
                <div>
                  <label className="nh-label">Số kỳ lặp</label>
                  <input
                    type="number" min={1} max={60} className="nh-input"
                    value={form.soKyLap} onChange={e => set('soKyLap', Number(e.target.value))}
                  />
                </div>
              )}
            </div>
          )}

          <div style={{ margin: '10px 0' }}>
            <label className="nh-label">Ghi chú (tuỳ chọn)</label>
            <input type="text" className="nh-input" value={form.ghiChu} onChange={e => set('ghiChu', e.target.value)} />
          </div>

          {error && <div className="nh-err">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn-ghost" onClick={onCancel}>Huỷ</button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm khoản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
