// ============================================================
// HỘP THOẠI DỜI NGÀY THANH TOÁN — gia hạn (dời ra sau) / trả trước (dời lên trước)
// • Dời nhiều lần: mỗi lần ghi 1 dòng lịch sử (Lần 1, 2, 3…), hiện đủ chuỗi ngày.
// • Dời nhầm: ✎ sửa ngày/lý do của từng lần, ✕ xoá lần đó (chuỗi tự tính lại từ ngày gốc).
// Dùng được cho cả khoản tự động từ List ngân hàng.
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { doiNgayKhoan, ghiLaiLichSuDoiNgay } from '@/lib/dong-tien-store'
import type { KhoanDongTien } from '@/lib/dong-tien-types'

const dmy = (d: string) => d.split('-').reverse().join('/')
const utc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const diff = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86400000)
const addDays = (s: string, n: number) => new Date(utc(s) + n * 86400000).toISOString().slice(0, 10)
const sgn = (n: number) => (n > 0 ? `+${n}` : String(n))

export default function DoiNgayDialog({ khoan, onClose }: { khoan: KhoanDongTien; onClose: () => void }) {
  const hienTai = khoan.ngayDuKien
  const goc = khoan.ngayGoc ?? khoan.ngayDuKien
  const ls = khoan.lichSuDoiNgay ?? []
  const [ngay, setNgay] = useState(hienTai)
  const [lyDo, setLyDo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // đang sửa 1 lần trong lịch sử
  const [sua, setSua] = useState<number | null>(null)
  const [suaDen, setSuaDen] = useState('')
  const [suaLyDo, setSuaLyDo] = useState('')

  useEffect(() => { setNgay(hienTai) }, [hienTai])   // lịch sử đổi (sửa/xoá) → ô ngày mới theo ngày hiện tại

  const lechGoc = ngay ? diff(goc, ngay) : 0
  const doi = ngay !== hienTai
  const kq = useMemo(() => {
    if (!ngay || !doi) return null
    if (lechGoc > 0) return { c: '#B45309', t: `⏩ Gia hạn +${lechGoc} ngày so với ngày gốc (${dmy(goc)})` }
    if (lechGoc < 0) return { c: '#166534', t: `⏪ Trả trước ${-lechGoc} ngày so với ngày gốc (${dmy(goc)})` }
    return { c: '#1C3557', t: `Về đúng ngày gốc (${dmy(goc)})` }
  }, [ngay, doi, lechGoc, goc])
  const sangThangKhac = doi && ngay && ngay.slice(0, 7) !== hienTai.slice(0, 7)
  const tongLech = ls.length ? diff(goc, hienTai) : 0

  async function chay(fn: () => Promise<void>, dong = false) {
    setBusy(true); setErr(null)
    try { await fn(); if (dong) onClose() }
    catch (e: any) { setErr(e?.message ?? 'Có lỗi khi lưu, thử lại.') }
    finally { setBusy(false) }
  }
  const luu = () => {
    if (!ngay) { setErr('Vui lòng chọn ngày mới.'); return }
    return chay(() => doiNgayKhoan(khoan.id, ngay, lyDo), true)
  }
  const ghi = (arr: typeof ls) => ghiLaiLichSuDoiNgay(khoan.id, arr.map(l => ({ den: l.den, lyDo: l.lyDo, luc: l.luc })))
  const moSua = (i: number) => { setSua(i); setSuaDen(ls[i].den); setSuaLyDo(ls[i].lyDo ?? ''); setErr(null) }
  const luuSua = () => {
    if (sua === null) return
    if (!suaDen) { setErr('Vui lòng chọn ngày.'); return }
    return chay(async () => { await ghi(ls.map((l, i) => (i === sua ? { ...l, den: suaDen, lyDo: suaLyDo } : l))); setSua(null) })
  }
  const xoa = (i: number) => {
    const sau = ls.filter((_, j) => j !== i)
    const ngayMoi = sau.length ? sau[sau.length - 1].den : goc
    const msg = `Xoá lần dời ${i + 1}?\nNgày thanh toán sẽ tính lại: ${dmy(ngayMoi)}${sau.length ? '' : ' (về đúng ngày gốc)'}.`
    if (!window.confirm(msg)) return
    return chay(() => ghi(sau))
  }

  const nut = (n: number) => (
    <button key={n} type="button" className="btn-ghost" onClick={() => setNgay(addDays(hienTai, n))}
      style={{ padding: '3px 9px', fontSize: 12 }}>{sgn(n)} ngày</button>
  )
  const nho = { padding: '2px 8px', fontSize: 12 } as const

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
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

        {ls.length ? (
          <div style={{ marginTop: 14, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1C3557' }}>
              Lịch sử: đã dời {ls.length} lần · {tongLech === 0 ? 'đang ở đúng ngày gốc' : `tổng ${sgn(tongLech)} ngày so với ngày gốc`}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 8px' }}>
              {[goc, ...ls.map(l => l.den)].map(dmy).join(' → ')}
            </div>
            {ls.map((l, i) => {
              const cuoi = i === ls.length - 1
              if (sua === i) return (
                <div key={i} style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, color: '#6B7280', marginBottom: 4 }}>Sửa lần {i + 1} (từ {dmy(l.tu)})</div>
                  <input type="date" className="nh-input" value={suaDen} onChange={e => setSuaDen(e.target.value)} />
                  <input type="text" className="nh-input" value={suaLyDo} onChange={e => setSuaLyDo(e.target.value)} placeholder="Lý do" style={{ marginTop: 6 }} />
                  {i < ls.length - 1 ? <div style={{ fontSize: 11, color: '#B45309', marginTop: 4 }}>Các lần sau sẽ tính lại theo ngày mới này.</div> : null}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                    <button type="button" className="btn-ghost" onClick={() => setSua(null)} style={nho}>Huỷ</button>
                    <button type="button" className="btn-save" disabled={busy} onClick={luuSua} style={nho}>Lưu sửa</button>
                  </div>
                </div>
              )
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 8px', borderRadius: 6, background: cuoi ? '#FFFBEB' : 'transparent', marginBottom: 2 }}>
                  <div style={{ flex: 1, fontSize: 12.5, color: '#374151', lineHeight: 1.5 }}>
                    <b>Lần {i + 1}:</b> {dmy(l.tu)} → <b>{dmy(l.den)}</b>{' '}
                    <span style={{ fontWeight: 600, color: l.soNgay > 0 ? '#B45309' : l.soNgay < 0 ? '#166534' : '#6B7280' }}>({sgn(l.soNgay)} ngày)</span>
                    {l.lyDo ? <> · {l.lyDo}</> : null}{' '}
                    <span style={{ color: '#9CA3AF' }}>· ghi {new Date(l.luc).toLocaleDateString('vi-VN')}</span>
                    {cuoi ? <span style={{ color: '#B45309' }}> · hiện tại</span> : null}
                  </div>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => moSua(i)} title="Sửa lần dời này" style={nho}>✎</button>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => xoa(i)} title="Xoá lần dời này (dời nhầm)" style={{ ...nho, color: '#991B1B' }}>✕</button>
                </div>
              )
            })}
          </div>
        ) : null}

        {err ? <div className="nh-err" style={{ marginTop: 8 }}>{err}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Đóng</button>
          <button type="button" className="btn-save" disabled={busy || !doi} onClick={luu}>{busy ? 'Đang lưu…' : 'Lưu ngày mới'}</button>
        </div>
      </div>
    </div>
  )
}
