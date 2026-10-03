// ============================================================
// Ô CHỌN có danh sách gợi ý + "➕ Thêm mới…" + "✎ Sửa tên"
// Dùng cho "Loại giao dịch" và "Nhóm (báo cáo)" trong DongTienForm.
// Danh sách = gợi ý có sẵn (builtin, đã lọc) + mục tuỳ chỉnh lưu Firestore.
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { subscribeGoiY, themGoiY, doiTenGoiY, GoiYTuyChinh, KieuGoiY } from '@/lib/dong-tien-goi-y-store'

const MOI = '__goi_y_moi__'

interface Props {
  kieu:               KieuGoiY
  loai:               'thu' | 'chi'
  value:              string
  onChange:           (v: string) => void
  builtin:            string[]                     // gợi ý có sẵn trong code
  locBuiltin?:        (x: string) => boolean       // lọc gợi ý có sẵn theo Thu/Chi
  locCustomTheoLoai?: boolean                      // mục tuỳ chỉnh chỉ hiện đúng Thu/Chi
  emptyLabel:         string
  moiLabel:           string
  placeholderMoi:     string
  prefillMoi?:        string
  // Có → khi ĐỔI TÊN, chạy hàm này để cập nhật mọi khoản đã lưu đang dùng tên cũ (trả về số khoản đã cập nhật)
  onDoiTen?:          (cu: string, moi: string) => Promise<number>
}

export default function GoiYChon(p: Props) {
  const [list, setList] = useState<GoiYTuyChinh[]>([])
  const [mode, setMode] = useState<null | 'them' | 'sua'>(null)
  const [ten,  setTen]  = useState('')
  const [err,  setErr]  = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => subscribeGoiY(p.kieu, setList), [p.kieu])

  const { options, info } = useMemo(() => {
    const doiTen = new Map<string, GoiYTuyChinh>()   // tên gốc → bản ghi đổi tên
    list.filter(x => x.goc).forEach(x => doiTen.set(x.goc as string, x))
    const info = new Map<string, { id?: string; goc?: string }>()
    const out: string[] = []
    const push = (name: string, meta: { id?: string; goc?: string }) => {
      if (!info.has(name)) { info.set(name, meta); out.push(name) }
    }
    for (const b of p.builtin.filter(p.locBuiltin ?? (() => true))) {
      const o = doiTen.get(b)
      if (o) push(o.ten, { id: o.id, goc: b }); else push(b, { goc: b })
    }
    for (const x of list) {
      if (x.goc) continue
      if (p.locCustomTheoLoai && x.loai !== p.loai) continue
      push(x.ten, { id: x.id })
    }
    if (p.value && !info.has(p.value)) push(p.value, {})   // giá trị cũ ngoài danh sách vẫn giữ
    // Sắp xếp theo số thứ tự đầu tên (1, 2, 3 … 10, 11 — đúng thứ tự số), sau đó theo chữ cái
    out.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }))
    return { options: out, info }
  }, [list, p.builtin, p.locBuiltin, p.locCustomTheoLoai, p.loai, p.value])

  function moThem() { setMode('them'); setTen(p.prefillMoi ?? ''); setErr(null) }
  function moSua()  { if (!p.value) return; setMode('sua'); setTen(p.value); setErr(null) }
  function dong()   { setMode(null); setTen(''); setErr(null) }

  async function luu() {
    setErr(null)
    const t = ten.trim().replace(/\s+/g, ' ')
    if (!t) { setErr('Vui lòng nhập tên.'); return }
    if (options.some(o => o.toLowerCase() === t.toLowerCase() && !(mode === 'sua' && o === p.value))) {
      setErr('Tên này đã có trong danh sách.'); return
    }
    const cu = p.value
    setBusy(true)
    try {
      let daLuu: string
      if (mode === 'sua') {
        const meta = info.get(p.value)
        daLuu = (meta?.id || meta?.goc)
          ? await doiTenGoiY({ kieu: p.kieu, loai: p.loai, id: meta?.id, goc: meta?.goc, tenMoi: t })
          : await themGoiY(p.kieu, p.loai, t)       // giá trị cũ ngoài danh sách → thêm thành mục mới
      } else {
        daLuu = await themGoiY(p.kieu, p.loai, t)
      }
      let ghiChu: string | null = null
      if (mode === 'sua' && p.onDoiTen && cu && cu !== daLuu) {
        try {
          const n = await p.onDoiTen(cu, daLuu)
          ghiChu = `✅ Đã đổi tên và cập nhật ${n} khoản đã lưu.`
        } catch {
          ghiChu = '⚠️ Đã đổi tên trong danh sách nhưng cập nhật các khoản đã lưu bị lỗi — kiểm tra mạng rồi báo lại.'
        }
      }
      p.onChange(daLuu)
      dong()
      if (ghiChu) { setNote(ghiChu); setTimeout(() => setNote(null), 7000) }
    } catch (e: any) {
      setErr(e?.message ?? 'Có lỗi khi lưu, thử lại.')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select className="nh-select" style={{ flex: 1, minWidth: 0 }} value={p.value}
          onChange={e => { if (e.target.value === MOI) moThem(); else p.onChange(e.target.value) }}>
          <option value="">{p.emptyLabel}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value={MOI}>{p.moiLabel}</option>
        </select>
        <button type="button" className="btn-ghost" disabled={!p.value} onClick={moSua}
          title="Sửa tên mục đang chọn" style={{ padding: '0 10px', flexShrink: 0 }}>✎</button>
      </div>

      {note && <div style={{ marginTop: 4, fontSize: 11.5, color: '#374151' }}>{note}</div>}

      {mode && (
        <div style={{ marginTop: 6, background: '#F8FAFC', border: '1px solid var(--nh-border)', borderRadius: 8, padding: 8 }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
            {mode === 'sua'
              ? (p.onDoiTen ? 'Đổi tên mục đang chọn — các khoản đã lưu đang dùng tên cũ sẽ tự cập nhật theo' : 'Đổi tên mục đang chọn (không sửa các khoản đã lưu trước đó)')
              : 'Thêm mục mới vào danh sách'}
          </div>
          <input type="text" className="nh-input" autoFocus value={ten}
            placeholder={p.placeholderMoi} onChange={e => setTen(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); luu() } if (e.key === 'Escape') { e.preventDefault(); dong() } }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-ghost" onClick={dong}>Huỷ</button>
            <button type="button" className="btn-save" disabled={busy} onClick={luu}>
              {busy ? 'Đang lưu...' : mode === 'sua' ? 'Lưu tên mới' : 'Lưu'}
            </button>
          </div>
          {err && <div className="nh-err" style={{ marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}
