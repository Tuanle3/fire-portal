// ============================================================
// FORM — Nhập tay khoản thu/chi dòng tiền (Phần 1)
// ============================================================
'use client'

import { useState, useEffect } from 'react'
import {
  KhoanDongTien, LoaiDongTien, NhomDongTien, DoTinCay, ChuKyLap,
  NHOM_THEO_LOAI, NHOM_LABEL, DO_TIN_CAY_LABEL,
} from '@/lib/dong-tien-types'
import { saveKhoanDongTien } from '@/lib/dong-tien-store'
import type { EntityType } from '@/lib/han-muc-types'

// Danh sách pháp nhân gợi ý — đồng bộ với han-muc-entities-store nếu có sẵn trong dự án.
const ENTITIES: EntityType[] = ['SAP', 'SAHS', 'ĐTSA', 'YANA', 'Sao Việt', 'Cá nhân']

interface Props {
  editing?:   KhoanDongTien | null   // truyền vào khi sửa, null/undefined khi tạo mới
  entityMacDinh?: EntityType         // gợi ý sẵn entity đang được chọn ở tab cha
  onSaved:    () => void
  onCancel:   () => void
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
  const [form, setForm] = useState(emptyForm(entityMacDinh))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (editing) {
      setForm({
        entity:     editing.entity,
        loai:       editing.loai,
        nhom:       editing.nhom,
        ngayDuKien: editing.ngayDuKien,
        soTien:     editing.soTien,
        doTinCay:   editing.doTinCay ?? 'du-kien',
        moTa:       editing.moTa,
        lap:        'mot-lan', // sửa 1 bản ghi, không đổi chuỗi lặp
        soKyLap:    1,
        ghiChu:     editing.ghiChu ?? '',
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
          entity:     form.entity,
          loai:       form.loai,
          nhom:       form.nhom,
          ngayDuKien: form.ngayDuKien,
          soTien:     form.soTien,
          doTinCay:   form.loai === 'thu' ? form.doTinCay : undefined,
          moTa:       form.moTa.trim(),
          lap:        form.lap,
          soKyLap:    form.lap === 'mot-lan' ? undefined : form.soKyLap,
          ghiChu:     form.ghiChu.trim() || undefined,
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-[#1C3557]/15 bg-white p-5">
      <h3 className="font-serif text-lg font-semibold text-[#1C3557]">
        {editing ? 'Sửa khoản dòng tiền' : 'Thêm khoản dòng tiền'}
      </h3>

      {/* Loại thu/chi — chọn trước để lọc nhóm phù hợp */}
      <div className="flex gap-2">
        {(['thu', 'chi'] as LoaiDongTien[]).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => set('loai', l)}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              form.loai === l
                ? l === 'thu'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-rose-600 bg-rose-50 text-rose-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {l === 'thu' ? 'Khoản THU' : 'Khoản CHI'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Pháp nhân</label>
          <select
            value={form.entity}
            onChange={e => set('entity', e.target.value as EntityType)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nhóm</label>
          <select
            value={form.nhom}
            onChange={e => set('nhom', e.target.value as NhomDongTien)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {nhomHopLe.map(n => <option key={n} value={n}>{NHOM_LABEL[n]}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Ngày dự kiến</label>
          <input
            type="date"
            value={form.ngayDuKien}
            onChange={e => set('ngayDuKien', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Số tiền (VNĐ)</label>
          <input
            type="number"
            min={0}
            value={form.soTien || ''}
            onChange={e => set('soTien', Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="0"
          />
        </div>
      </div>

      {form.loai === 'thu' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Độ tin cậy</label>
          <div className="flex gap-2">
            {(Object.keys(DO_TIN_CAY_LABEL) as DoTinCay[]).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => set('doTinCay', d)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  form.doTinCay === d
                    ? 'border-[#D4A64A] bg-[#D4A64A]/15 text-[#8a6a1f]'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {DO_TIN_CAY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Mô tả</label>
        <input
          type="text"
          value={form.moTa}
          onChange={e => set('moTa', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="VD: Thu tiền cho thuê kiot T09/2026"
        />
      </div>

      {/* Khoản lặp lại — chỉ hiện khi tạo mới */}
      {!editing && (
        <div className="grid grid-cols-2 gap-3 rounded-md bg-gray-50 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Lặp lại</label>
            <select
              value={form.lap}
              onChange={e => set('lap', e.target.value as ChuKyLap)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="mot-lan">Một lần</option>
              <option value="hang-thang">Hàng tháng</option>
              <option value="hang-quy">Hàng quý</option>
            </select>
          </div>
          {form.lap !== 'mot-lan' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Số kỳ lặp</label>
              <input
                type="number"
                min={1}
                max={60}
                value={form.soKyLap}
                onChange={e => set('soKyLap', Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Ghi chú (tuỳ chọn)</label>
        <input
          type="text"
          value={form.ghiChu}
          onChange={e => set('ghiChu', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Huỷ
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[#1C3557] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1C3557]/90 disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm khoản'}
        </button>
      </div>
    </form>
  )
}
