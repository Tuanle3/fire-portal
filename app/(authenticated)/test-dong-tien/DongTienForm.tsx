// ============================================================
// FORM — Nhập tay khoản thu/chi dòng tiền (Phần 1 + Bước B)
// Thêm trường loaiKhoan (Kế hoạch / Thực hiện) + nhomCha (nhóm cha)
// để link được khi đối chiếu ở Bước C.
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  KhoanDongTien, LoaiDongTien, NhomDongTien, DoTinCay, ChuKyLap, LoaiKhoan,
  NHOM_THEO_LOAI, NHOM_LABEL, DO_TIN_CAY_LABEL,
} from '@/lib/dong-tien-types'
import { saveKhoanDongTien } from '@/lib/dong-tien-store'
import { subscribeNhomTuyChinh, themNhomTuyChinh, NhomTuyChinh } from '@/lib/dong-tien-nhom-store'
import type { EntityType } from '@/lib/han-muc-types'

const ENTITIES: EntityType[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']
const NHOM_MOI = '__nhom_moi__'
const VND = new Intl.NumberFormat('vi-VN')

function parseSoTien(raw: string): number {
  return Number(raw.replace(/\D/g, '')) || 0
}

const emptyForm = (entityMacDinh?: EntityType) => ({
  entity:       entityMacDinh ?? 'SAP',
  loai:         'thu' as LoaiDongTien,
  loaiKhoan:    'thuc-hien' as LoaiKhoan,
  nhomCha:      NHOM_THEO_LOAI.thu[0] as string,  // nhóm cha = nhóm chính
  nhomChaLabel: NHOM_LABEL[NHOM_THEO_LOAI.thu[0]] ?? '',
  nhom:         NHOM_THEO_LOAI.thu[0] as NhomDongTien,
  ngayDuKien:   new Date().toISOString().slice(0, 10),
  soTien:       0,
  doTinCay:     'du-kien' as DoTinCay,
  moTa:         '',
  lap:          'mot-lan' as ChuKyLap,
  soKyLap:      1,
  ghiChu:       '',
})

interface Props {
  editing?:       KhoanDongTien | null
  entityMacDinh?: EntityType
  loaiKhoanMacDinh?: LoaiKhoan   // Cho phép mở form sẵn ở chế độ KH hoặc TH
  onSaved:        () => void
  onCancel:       () => void
}

export default function DongTienForm({ editing, entityMacDinh, loaiKhoanMacDinh, onSaved, onCancel }: Props) {
  const [form,         setForm]         = useState(emptyForm(entityMacDinh))
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
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
        entity:       editing.entity,
        loai:         editing.loai,
        loaiKhoan:    editing.loaiKhoan ?? 'thuc-hien',
        nhomCha:      editing.nhomCha ?? editing.nhom,
        nhomChaLabel: editing.nhomChaLabel ?? (NHOM_LABEL[editing.nhom as NhomDongTien] ?? editing.nhom),
        nhom:         editing.nhom as NhomDongTien,
        ngayDuKien:   editing.ngayDuKien,
        soTien:       editing.soTien,
        doTinCay:     editing.doTinCay ?? 'du-kien',
        moTa:         editing.moTa,
        lap:          'mot-lan',
        soKyLap:      1,
        ghiChu:       editing.ghiChu ?? '',
      })
    } else {
      const base = emptyForm(entityMacDinh)
      if (loaiKhoanMacDinh) base.loaiKhoan = loaiKhoanMacDinh
      setForm(base)
    }
    setDangThemNhom(false); setTenNhomMoi(''); setLuuNhomLoi(null)
  }, [editing, entityMacDinh, loaiKhoanMacDinh])

  const nhomOptions = useMemo(() => {
    const chuan = NHOM_THEO_LOAI[form.loai].map(v => ({ value: v, label: NHOM_LABEL[v] ?? v }))
    const tuy   = nhomTuyChinh.filter(n => n.loai === form.loai).map(n => ({ value: n.ten, label: n.ten }))
    const list  = [...chuan, ...tuy]
    if (form.nhom && !list.some(o => o.value === form.nhom))
      list.push({ value: form.nhom, label: `${NHOM_LABEL[form.nhom as NhomDongTien] ?? form.nhom} (cũ)` })
    return list
  }, [form.loai, form.nhom, nhomTuyChinh])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function chonLoai(loai: LoaiDongTien) {
    const nhomMacDinh = NHOM_THEO_LOAI[loai][0]
    setForm(f => ({
      ...f, loai,
      nhom: nhomMacDinh,
      nhomCha: nhomMacDinh,
      nhomChaLabel: NHOM_LABEL[nhomMacDinh] ?? nhomMacDinh,
    }))
    setDangThemNhom(false)
  }

  function chonNhom(value: string) {
    if (value === NHOM_MOI) { setDangThemNhom(true); setTenNhomMoi(''); setLuuNhomLoi(null); return }
    setForm(f => ({
      ...f,
      nhom: value as NhomDongTien,
      nhomCha: value,
      nhomChaLabel: NHOM_LABEL[value as NhomDongTien] ?? value,
    }))
  }

  async function luuNhomMoi() {
    setLuuNhomLoi(null)
    const ten = tenNhomMoi.trim()
    if (!ten) { setLuuNhomLoi('Vui lòng nhập tên nhóm.'); return }
    if (nhomOptions.some(o => o.label.toLowerCase() === ten.toLowerCase()))
      { setLuuNhomLoi('Nhóm này đã có, chọn lại trong danh sách.'); return }

    setDangLuuNhom(true)
    try {
      const tenDaLuu = await themNhomTuyChinh(form.loai, ten)
      setForm(f => ({ ...f, nhom: tenDaLuu as NhomDongTien, nhomCha: tenDaLuu, nhomChaLabel: tenDaLuu }))
      setDangThemNhom(false); setTenNhomMoi('')
    } catch (err: any) {
      setLuuNhomLoi(err?.message ?? 'Có lỗi, thử lại.')
    } finally { setDangLuuNhom(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
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
          // ── MỚI: loại khoản + nhóm cha ──
          loaiKhoan:    form.loaiKhoan,
          nhomCha:      form.nhomCha,
          nhomChaLabel: form.nhomChaLabel,
        },
        editing?.id,
      )
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Có lỗi khi lưu, thử lại.')
    } finally { setSaving(false) }
  }

  return (
    <div className="nh-card">
      <div className="nh-card-head">
        <span className="nh-card-title">
          {editing ? 'Sửa khoản dòng tiền' : form.loaiKhoan === 'ke-hoach' ? '📋 Thêm khoản KẾ HOẠCH' : '✏️ Thêm khoản THỰC HIỆN'}
        </span>
      </div>
      <div className="nh-card-body">
        <form onSubmit={handleSubmit}>

          {/* ── Kế hoạch hay Thực hiện ── */}
          <div className="nh-radio-row" style={{ marginBottom: 10 }}>
            <label>
              <input type="radio" name="loaiKhoan" checked={form.loaiKhoan === 'ke-hoach'}
                onChange={() => set('loaiKhoan', 'ke-hoach')} />
              <span style={{ color: 'var(--nh-navy)', fontWeight: 600 }}>📋 Kế hoạch</span>
            </label>
            <label>
              <input type="radio" name="loaiKhoan" checked={form.loaiKhoan === 'thuc-hien'}
                onChange={() => set('loaiKhoan', 'thuc-hien')} />
              <span>✏️ Thực hiện</span>
            </label>
          </div>

          {/* ── Thu / Chi ── */}
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
              <label className="nh-label">Nhóm khoản mục</label>
              <select className="nh-select" value={form.nhom} onChange={e => chonNhom(e.target.value)}>
                {nhomOptions.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                <option value={NHOM_MOI}>+ Thêm nhóm mới…</option>
              </select>
            </div>
            <div>
              <label className="nh-label">Ngày {form.loaiKhoan === 'ke-hoach' ? 'kế hoạch' : 'dự kiến'}</label>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 10px', background: '#F8FAFC', border: '1px solid var(--nh-border)', borderRadius: 8, padding: 10 }}>
              <input type="text" className="nh-input" style={{ flex: 1 }}
                placeholder={`Tên nhóm ${form.loai === 'thu' ? 'thu' : 'chi'} mới...`}
                value={tenNhomMoi} onChange={e => setTenNhomMoi(e.target.value)} autoFocus />
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
            <input type="text" className="nh-input" value={form.moTa}
              onChange={e => set('moTa', e.target.value)}
              placeholder={form.loaiKhoan === 'ke-hoach' ? 'VD: Thu tiền chợ T09/2026' : 'VD: Đã nhận tiền chợ ngày 15/9'} />
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
                  <input type="number" min={1} max={60} className="nh-input"
                    value={form.soKyLap} onChange={e => set('soKyLap', Number(e.target.value))} />
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
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : form.loaiKhoan === 'ke-hoach' ? 'Lưu kế hoạch' : 'Thêm thực hiện'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
