// ============================================================
// Thanh "Kế hoạch vay từ List ngân hàng" — nằm trên cùng Tab Nhập Data.
// Bấm nút → ghi các kỳ trả nợ CHƯA TRẢ của tháng đang chọn thành khoản
// kế hoạch (khoá, không sửa tay). Chi tiết quy tắc: dong-tien-vay-ke-hoach.ts
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  subscribeKeHoachVay, capNhatKeHoachVay, KeHoachVayLine, TY_LE_DAO_HAN,
} from '@/lib/dong-tien-vay-ke-hoach'

const fmt = (n: number) => n.toLocaleString('vi-VN')

export default function KeHoachVayAuto({ month }: { month: string }) {
  const [lines, setLines]   = useState<KeHoachVayLine[]>([])
  const [ready, setReady]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  useEffect(() => {
    setReady(false); setMsg('')
    const t = setTimeout(() => setReady(true), 2500)   // chờ các tầng subscribe nạp xong
    const unsub = subscribeKeHoachVay(month, setLines)
    return () => { clearTimeout(t); unsub() }
  }, [month])

  const tong = useMemo(() => {
    const s = { goc: 0, lai: 0, thu: 0 }
    lines.forEach(l => {
      if (l.loai === 'thu') s.thu += l.soTien
      else if (String(l.nhom).startsWith('VAY-GOC')) s.goc += l.soTien
      else s.lai += l.soTien
    })
    return s
  }, [lines])

  async function capNhat() {
    if (lines.length === 0 && !window.confirm('Không có kỳ chưa trả nào trong tháng này. Cập nhật sẽ XOÁ các dòng vay tự động đã tạo trước đó của tháng. Tiếp tục?')) return
    setSaving(true); setMsg('')
    try {
      const r = await capNhatKeHoachVay(month, lines)
      setMsg(`✅ Đã cập nhật: ${r.ghi} dòng${r.xoa ? `, xoá ${r.xoa} dòng cũ` : ''}`)
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'Lỗi cập nhật, thử lại.'}`)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 280 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1C3557' }}>🏦 Kế hoạch vay từ List ngân hàng — tháng {month.slice(5)}/{month.slice(0, 4)}</div>
        <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
          {ready || lines.length ? (
            <>{lines.length} dòng chưa trả · Trả gốc <b>{fmt(tong.goc)}</b> · Trả lãi <b>{fmt(tong.lai)}</b> · Thu đáo hạn ({Math.round(TY_LE_DAO_HAN * 100)}%) <b>{fmt(tong.thu)}</b> ₫</>
          ) : 'Đang đọc dữ liệu hạn mức…'}
        </div>
        {msg && <div style={{ fontSize: 12, marginTop: 4 }}>{msg}</div>}
      </div>
      <button
        onClick={capNhat} disabled={saving || !ready}
        title="Ghi các kỳ chưa trả của tháng này vào kế hoạch (bấm lại để cập nhật khi lịch trả nợ thay đổi)"
        style={{ padding: '7px 14px', background: saving || !ready ? '#9CA3AF' : '#1C3557', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12.5, cursor: saving || !ready ? 'not-allowed' : 'pointer' }}
      >{saving ? 'Đang cập nhật…' : '⟳ Cập nhật kế hoạch vay'}</button>
    </div>
  )
}
