'use client'
/**
 * SoTraNoTungLan — sổ ghi nhận trả nợ NHIỀU LẦN cho hợp đồng Vay ngoài.
 * Mỗi lần trả: ngày + gốc + lãi + ghi chú. Dư nợ gốc còn lại tự trừ dần.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, X, Pencil, Trash2, Plus } from 'lucide-react'
import { MiniStat } from '@/components/han-muc/FillLayout'
import { useDonViTien } from '@/lib/don-vi-tien-context'
import type { HopDongTinDung } from '@/lib/han-muc-types'
import {
  subscribeTraTungLan, addTraTungLan, updateTraTungLan, deleteTraTungLan,
  type TraTungLan,
} from '@/lib/han-muc-tra-tung-lan-store'

const fmt = (n: number) => n.toLocaleString('vi-VN')
const dmy = (d: string) => d.split('-').reverse().join('/')
const homNay = () => new Date().toISOString().slice(0, 10)
const soInput = (raw: string) => { const d = raw.replace(/\D/g, ''); return d ? Number(d).toLocaleString('vi-VN') : '' }
const inp: React.CSSProperties = { width: '100%', fontSize: 12.5, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' }

export default function SoTraNoTungLan({ hopDong }: { hopDong: HopDongTinDung }) {
  const { fmtTien } = useDonViTien()
  const [rows, setRows] = useState<TraTungLan[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [ngay, setNgay] = useState(homNay())
  const [goc, setGoc] = useState('')
  const [lai, setLai] = useState('')
  const [ghiChu, setGhiChu] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => subscribeTraTungLan(hopDong.id, setRows), [hopDong.id])

  // Dư nợ gốc sau từng lần trả (rows đã sắp theo ngày)
  const { dong, tongGoc, tongLai } = useMemo(() => {
    let con = hopDong.soTienGiaiNgan
    const dong = rows.map(r => { con -= r.goc; return { ...r, conSau: con } })
    return { dong, tongGoc: rows.reduce((s, r) => s + r.goc, 0), tongLai: rows.reduce((s, r) => s + r.lai, 0) }
  }, [rows, hopDong.soTienGiaiNgan])

  const conLai = hopDong.soTienGiaiNgan - tongGoc
  const pct = hopDong.soTienGiaiNgan > 0 ? Math.min(100, (tongGoc / hopDong.soTienGiaiNgan) * 100) : 0
  const gocNhap = Number(goc.replace(/\D/g, '')) || 0
  const conLaiKhiSua = editId ? conLai + (rows.find(r => r.id === editId)?.goc ?? 0) : conLai
  const vuot = gocNhap > conLaiKhiSua

  const reset = () => { setEditId(null); setNgay(homNay()); setGoc(''); setLai(''); setGhiChu(''); setErr(null) }
  const moSua = (r: TraTungLan) => {
    setEditId(r.id); setNgay(r.ngay); setGoc(String(r.goc)); setLai(String(r.lai)); setGhiChu(r.ghiChu ?? ''); setErr(null)
  }

  const luu = async () => {
    const g = Number(goc.replace(/\D/g, '')) || 0
    const l = Number(lai.replace(/\D/g, '')) || 0
    if (!ngay) { setErr('Vui lòng chọn ngày trả.'); return }
    if (g <= 0 && l <= 0) { setErr('Nhập số gốc hoặc số lãi đã trả.'); return }
    if (g > conLaiKhiSua && !window.confirm(`Gốc nhập (${fmt(g)}) lớn hơn dư nợ còn lại (${fmt(conLaiKhiSua)}). Vẫn lưu?`)) return
    setBusy(true); setErr(null)
    try {
      if (editId) await updateTraTungLan(editId, { ngay, goc: g, lai: l, ghiChu })
      else await addTraTungLan(hopDong.id, { ngay, goc: g, lai: l, ghiChu })
      reset()
    } catch (e: any) { setErr(e?.message ?? 'Lưu thất bại, thử lại.') }
    finally { setBusy(false) }
  }

  const xoa = async (r: TraTungLan) => {
    if (!window.confirm(`Xoá lần trả ngày ${dmy(r.ngay)} (gốc ${fmt(r.goc)}, lãi ${fmt(r.lai)})?`)) return
    setBusy(true)
    try { await deleteTraTungLan(r.id); if (editId === r.id) reset() }
    catch (e: any) { setErr(e?.message ?? 'Xoá thất bại.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Tổng quan dư nợ ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px', alignItems: 'flex-start' }}>
        <MiniStat label="Số tiền vay" value={fmtTien(hopDong.soTienGiaiNgan)} />
        <MiniStat label="Số lần đã trả" value={rows.length} sub={rows.length ? `Gần nhất ${dmy(rows[rows.length - 1].ngay)}` : 'Chưa trả lần nào'} color="#1C3557" />
        <MiniStat label="Gốc đã trả" value={fmtTien(tongGoc)} sub={`${pct.toFixed(1)}% số vay`} color="#166534" />
        <MiniStat label="Dư nợ gốc còn lại" value={fmtTien(Math.max(0, conLai))} color="#b91c1c" />
        <MiniStat label="Lãi đã trả" value={fmtTien(tongLai)} color="#b45309" />
        <MiniStat label="Hạn trả hết" value={hopDong.ngayDaoHan ? dmy(hopDong.ngayDaoHan) : '—'} />
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#166534' : '#1C3557', transition: 'width .3s' }} />
      </div>

      {/* ── Form ghi nhận 1 lần trả ── */}
      <div style={{ background: editId ? '#fffbeb' : '#f8fafc', border: '1px solid ' + (editId ? '#D4A64A' : '#dde3ea'), borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1C3557', marginBottom: 8 }}>
          {editId ? '✎ Sửa lần trả' : '＋ Ghi nhận 1 lần trả'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Ngày trả</div>
            <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} style={inp} /></label>
          <label><div style={{ fontSize: 11, color: '#1C3557', fontWeight: 600, marginBottom: 3 }}>Gốc đã trả (₫)</div>
            <input type="text" inputMode="numeric" value={soInput(goc)} placeholder="0" onChange={e => setGoc(e.target.value.replace(/\D/g, ''))}
              style={{ ...inp, textAlign: 'right', borderColor: vuot ? '#dc2626' : '#d1d5db' }} /></label>
          <label><div style={{ fontSize: 11, color: '#b45309', fontWeight: 600, marginBottom: 3 }}>Lãi đã trả (₫)</div>
            <input type="text" inputMode="numeric" value={soInput(lai)} placeholder="0" onChange={e => setLai(e.target.value.replace(/\D/g, ''))}
              style={{ ...inp, textAlign: 'right' }} /></label>
          <label style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Ghi chú</div>
            <input type="text" value={ghiChu} placeholder="VD: Chuyển khoản đợt 1, trả cho anh A…" onChange={e => setGhiChu(e.target.value)} style={inp} /></label>
        </div>
        {vuot && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 6 }}>⚠ Gốc nhập lớn hơn dư nợ còn lại ({fmt(Math.max(0, conLaiKhiSua))} ₫).</div>}
        {err && <div className="nh-err">{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          {editId && <button type="button" className="btn-ghost" onClick={reset}><X size={12} style={{ verticalAlign: -2 }} /> Huỷ sửa</button>}
          <button type="button" className="btn-save" disabled={busy} onClick={luu}>
            {editId ? <Check size={13} style={{ verticalAlign: -2 }} /> : <Plus size={13} style={{ verticalAlign: -2 }} />} {busy ? 'Đang lưu…' : editId ? 'Lưu thay đổi' : 'Ghi nhận'}
          </button>
        </div>
      </div>

      {/* ── Lịch sử các lần trả ── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="nh-tbl" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Lần</th><th>Ngày trả</th>
              <th className="r">Gốc</th><th className="r">Lãi</th><th className="r">Tổng trả</th>
              <th className="r">Dư nợ gốc sau trả</th><th>Ghi chú</th><th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {dong.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>
                Chưa có lần trả nào — nhập ở khung phía trên rồi bấm “Ghi nhận”.</td></tr>
            )}
            {dong.map((r, i) => (
              <tr key={r.id} style={editId === r.id ? { background: '#fffbeb' } : undefined}>
                <td style={{ fontWeight: 700 }}>{i + 1}</td>
                <td>{dmy(r.ngay)}</td>
                <td className="r" style={{ color: '#166534', fontWeight: 600 }}>{r.goc ? fmt(r.goc) : '—'}</td>
                <td className="r" style={{ color: '#b45309' }}>{r.lai ? fmt(r.lai) : '—'}</td>
                <td className="r" style={{ fontWeight: 700 }}>{fmt(r.goc + r.lai)}</td>
                <td className="r" style={{ color: '#b91c1c', fontWeight: 600 }}>{fmt(Math.max(0, r.conSau))}</td>
                <td style={{ color: '#374151' }}>{r.ghiChu || ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-ghost" disabled={busy} title="Sửa" onClick={() => moSua(r)} style={{ padding: '2px 7px' }}><Pencil size={12} /></button>{' '}
                  <button type="button" className="btn-danger" disabled={busy} title="Xoá" onClick={() => xoa(r)} style={{ padding: '2px 7px' }}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          {dong.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ textAlign: 'right', color: 'var(--nh-muted)' }}>Tổng cộng ({dong.length} lần)</td>
                <td className="r" style={{ color: '#166534' }}>{fmt(tongGoc)}</td>
                <td className="r" style={{ color: '#b45309' }}>{fmt(tongLai)}</td>
                <td className="r">{fmt(tongGoc + tongLai)}</td>
                <td className="r" style={{ color: '#b91c1c' }}>{fmt(Math.max(0, conLai))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
