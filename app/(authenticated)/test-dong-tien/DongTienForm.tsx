// ============================================================
// FORM — Nhập tay khoản thu/chi dòng tiền (Phần 1)
// Nhóm THU/CHI lấy theo danh mục báo cáo tháng (7 THU + 15 CHI,
// dong-tien-types.ts) + nhóm tuỳ chỉnh do người dùng tự thêm
// (dong-tien-nhom-store.ts, lưu Firestore, dùng chung).
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  KhoanDongTien, LoaiDongTien, NhomDongTien, DoTinCay, ChuKyLap,
  NHOM_THEO_LOAI, NHOM_LABEL, DO_TIN_CAY_LABEL,
} from '@/lib/dong-tien-types'
import { saveKhoanDongTien } from '@/lib/dong-tien-store'
import { subscribeNhomTuyChinh, themNhomTuyChinh, NhomTuyChinh } from '@/lib/dong-tien-nhom-store'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: EntityType[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const NHOM_MOI = '__nhom_moi__' // giá trị đặc biệt cho option "+ Thêm nhóm mới"
const VND = new Intl.NumberFormat('vi-VN')

/** Bỏ mọi ký tự không phải số (đại ca gõ "100.000.000" hay "100,000,000" đều đọc đúng) */
function parseSoTien(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

const emptyForm = (entityMacDinh?: EntityType) => ({
  entity:     entityMacDinh ?? 'SAP',
  loai:       'thu' as LoaiDongTien,
  nhom:       NHOM_THEO_LOAI.thu[0] as NhomDongTien, // 'cho-goi'
  ngayDuKien: new Date().toISOString().slice(0, 10),
  soTien:     0,
  doTinCay:   'du-kien' as DoTinCay,
  moTa:       '',
  lap:        'mot-lan' as ChuKyLap,
  soKyLap:    1,
  ghiChu:     '',
})

interface Props {
  editing?:       KhoanDongTien | null
  entityMacDinh?: EntityType
  onSaved:        () => void
  onCancel:       () => void
}

export default function DongTienForm({ editing, entityMacDinh, onSaved, onCancel }: Props) {
  const [form, setForm]     = useState(emptyForm(entityMacDinh))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // ── Nhóm tuỳ chỉnh — subscribe 1 lần, lọc theo loai khi hiển thị ──
  const [nhomTuyChinh, setNhomTuyChinh] = useState<NhomTuyChinh[]>([])
  const [dangThemNhom, setDangThemNhom] = useState(false)
  const [tenNhomMoi,   setTenNhomMoi]   = useState('')
  const [luuNhomLoi,   setLuuNhomLoi]   = useState<string | null>(null)
  const [dangLuuNhom,  setDangLuuNhom]  = useState(false)

  useEffect(() => {
    const unsub = subscribeNhomTuyChinh(setNhomTuyChinh)
    return () => unsub()
  }, [])

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
    setDangThemNhom(false); setTenNhomMoi(''); setLuuNhomLoi(null)
  }, [editing, entityMacDinh])

  // ── Danh sách option nhóm: chuẩn + tuỳ chỉnh (đúng loai) + nhóm cũ đang
  //    chọn nếu nó không nằm trong 2 danh sách trên (dữ liệu cũ trước khi
  //    đổi danh mục, tránh mất lựa chọn hiện tại) ──
  const nhomOptions = useMemo(() => {
    const chuan  = NHOM_THEO_LOAI[form.loai].map(v => ({ value: v, label: NHOM_LABEL[v] ?? v }))
    const tuy    = nhomTuyChinh.filter(n => n.loai === form.loai).map(n => ({ value: n.ten, label: n.ten }))
    const list   = [...chuan, ...tuy]
    if (form.nhom && !list.some(o => o.value === form.nhom)) {
      list.push({ value: form.nhom, label: `${NHOM_LABEL[form.nhom] ?? form.nhom} (nhóm cũ)` })
    }
    return list
  }, [form.loai, form.nhom, nhomTuyChinh])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function chonLoai(loai: LoaiDongTien) {
    setForm(f => ({ ...f, loai, nhom: NHOM_THEO_LOAI[loai][0] }))
    setDangThemNhom(false)
  }

  function chonNhom(value: string) {
    if (value === NHOM_MOI) {
      setDangThemNhom(true)
      setTenNhomMoi('')
      setLuuNhomLoi(null)
      return
    }
    set('nhom', value)
  }

  async function luuNhomMoi() {
    setLuuNhomLoi(null)
    const ten = tenNhomMoi.trim()
    if (!ten) { setLuuNhomLoi('Vui lòng nhập tên nhóm.'); return }
    const daTrung = nhomOptions.some(o => o.label.toLowerCase() === ten.toLowerCase())
    if (daTrung) { setLuuNhomLoi('Nhóm này đã có sẵn, chọn lại trong danh sách.'); return }

    setDangLuuNhom(true)
    try {
      const tenDaLuu = await themNhomTuyChinh(form.loai, ten)
      set('nhom', tenDaLuu)
      setDangThemNhom(false)
      setTenNhomMoi('')
    } catch (err: any) {
      setLuuNhomLoi(err?.message ?? 'Có lỗi khi lưu nhóm, thử lại.')
    } finally {
      setDangLuuNhom(false)
    }
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
              <input type="radio" name="loai" checked={form.loai === 'thu'} onChange={() => chonLoai('thu')} />
              <span style={{ color: form.loai === 'thu' ? 'var(--nh-green)' : undefined }}>Khoản THU</span>
            </label>
            <label>
              <input type="radio" name="loai" checked={form.loai === 'chi'} onChange={() => chonLoai('chi')} />
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
              <select className="nh-select" value={form.nhom} onChange={e => chonNhom(e.target.value)}>
                {nhomOptions.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                <option value={NHOM_MOI}>+ Thêm nhóm mới…</option>
              </select>
            </div>
            <div>
              <label className="nh-label">Ngày dự kiến</label>
              <input type="date" className="nh-input" value={form.ngayDuKien} onChange={e => set('ngayDuKien', e.target.value)} />
            </div>
            <div>
              <label className="nh-label">Số tiền (VNĐ)</label>
              <input
                type="text" inputMode="numeric" className="nh-input"
                value={form.soTien ? VND.format(form.soTien) : ''} placeholder="0"
                onChange={e => set('soTien', parseSoTien(e.target.value))}
              />
            </div>
          </div>

          {dangThemNhom && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 10px',
              background: '#F8FAFC', border: '1px solid var(--nh-border)', borderRadius: 8, padding: 10,
            }}>
              <input
                type="text" className="nh-input" style={{ flex: 1 }}
                placeholder={`Tên nhóm ${form.loai === 'thu' ? 'thu' : 'chi'} mới...`}
                value={tenNhomMoi}
                onChange={e => setTenNhomMoi(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn-save" disabled={dangLuuNhom} onClick={luuNhomMoi}>
                {dangLuuNhom ? 'Đang lưu...' : 'Lưu nhóm'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDangThemNhom(false)}>Huỷ</button>
            </div>
          )}
          {luuNhomLoi && <div className="nh-err" style={{ marginBottom: 10 }}>{luuNhomLoi}</div>}

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