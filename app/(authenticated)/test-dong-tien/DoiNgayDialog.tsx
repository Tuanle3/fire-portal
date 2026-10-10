// ============================================================
// HỘP THOẠI DỜI NGÀY THANH TOÁN — gia hạn (dời ra sau) / trả trước (dời lên trước)
// Ghi lịch sử từng lần (doiNgayKhoan). Dùng được cho cả khoản tự động từ List ngân hàng.
// Khoản chuyển sang tháng mới → bảng tự cập nhật (tháng cũ giảm, tháng mới tăng).
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import { doiNgayKhoan } from '@/lib/dong-tien-store'
import type { KhoanDongTien } from '@/lib/dong-tien-types'

const dmy = (d: string) => d.split('-').reverse().join('/')
const utc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const diff = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86400000)
const addDays = (s: string, n: number) => new Date(utc(s) + n * 86400000).toISOString().slice(0, 10)

export default function DoiNgayDialog({ khoan, onClose }: { khoan: KhoanDongTien; onClose: () => void }) {
  const hienTai = khoan.ngayDuKien
  const goc = khoan.ngayGoc ?? khoan.ngayDuKien
  const [ngay, setNgay] = useState(hienTai)
  const [lyDo, setLyDo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const lechGoc = ngay ? diff(goc, ngay) : 0
  const doi = ngay !== hienTai
  const kq = useMemo(() => {
    if (!ngay || !doi) return null
    if (lechGoc > 0) return { c: '#B45309', t: `⏩ Gia hạn +${lechGoc} ngày so với ngày gốc (${dmy(goc)})` }
    if (lechGoc < 0) return { c: '#166534', t: `⏪ Trả trước ${-lechGoc} ngày so với ngày gốc (${dmy(goc)})` }
    return { c: '#1C3557', t: `Về đúng ngày gốc (${dmy(goc)})` }
  }, [ngay, doi, lechGoc, goc])
  const sangThangKhac = doi && ngay && ngay.slice(0, 7) !== hienTai.slice(0, 7)

  async function luu() {
    if (!ngay) { setErr('Vui lòng chọn ngày mới.'); return }
    setBusy(true); setErr(null)
    try { await doiNgayKhoan(khoan.id, ngay, lyDo); onClose() }
    catch (e: any) { setErr(e?.message ?? 'Có lỗi khi lưu, thử lại.') }
    finally { setBusy(false) }
  }

  const nut = (n: number) => (
    <button key={n} type="button" className="btn-ghost" onClick={() => setNgay(addDays(hienTai, n))}
      style={{ padding: '3px 9px', fontSize: 12 }}>{n > 0 ? `+${n}` : n} ngày</button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#1C3557' }}>Dời ngày thanh toán</div>
        <div style={{ fontSize: 12.5, color: '#374151', marginTop: 6 }}>{khoan.moTa}</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
          {khoan.loai === 'thu' ? 'Thu' : 'Chi'} {khoan.soTien.toLocaleString('vi-VN')} ₫ · Ngày gốc <b>{dmy(goc)}</b>
          {goc !== hienTai ? <> · Hiện tại <b>{dmy(hienTai)}</b></> : null}
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, color: '#6B7280' }}>Ngày thanh toán mới</div>
        <input type="date" className="nh-input" value={ngay} onChange={e => setNgay(e.target.value)} style={{ marginTop: 4 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {[-7, 7, 15, 30].map(nut)}
          {goc !== hienTai ? (
            <button type="button" className="btn-ghost" onClick={() => setNgay(goc)} style={{ padding: '3px 9px', fontSize: 12 }}>Về ngày gốc</button>
          ) : null}
        </div>

        {kq ? <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: kq.c }}>{kq.t}</div> : null}
        {sangThangKhac ? (
          <div style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
            Khoản sẽ chuyển từ tháng {hienTai.slice(5, 7)}/{hienTai.slice(0, 4)} sang tháng {ngay.slice(5, 7)}/{ngay.slice(0, 4)}.
          </div>
        ) : null}

        <div style={{ marginTop: 12, fontSize: 11.5, color: '#6B7280' }}>Lý do (nên ghi)</div>
        <textarea rows={2} className="nh-input" value={lyDo} onChange={e => setLyDo(e.target.value)}
          placeholder="VD: Chủ đầu tư chưa giải ngân, đã xin NH gia hạn đến…" style={{ marginTop: 4, width: '100%', resize: 'vertical' }} />

        {khoan.lichSuDoiNgay?.length ? (
          <div style={{ marginTop: 12, borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
            <div style={{ fontSize: 11.5, color: '#6B7280', marginBottom: 4 }}>Lịch sử dời ngày</div>
            {khoan.lichSuDoiNgay.slice().reverse().map((l, i) => (
              <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                {dmy(l.tu)} → <b>{dmy(l.den)}</b> ({l.soNgay > 0 ? `+${l.soNgay}` : l.soNgay} ngày)
                {l.lyDo ? ` · ${l.lyDo}` : ''} <span style={{ color: '#9CA3AF' }}>· {new Date(l.luc).toLocaleDateString('vi-VN')}</span>
              </div>
            ))}
          </div>
        ) : null}

        {err ? <div className="nh-err" style={{ marginTop: 8 }}>{err}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn-save" disabled={busy || !doi} onClick={luu}>{busy ? 'Đang lưu…' : 'Lưu ngày mới'}</button>
        </div>
      </div>
    </div>
  )
}
