'use client'
/**
 * SoTraNoTungLan — sổ ghi nhận trả nợ NHIỀU LẦN cho hợp đồng Vay ngoài.
 * Mỗi lần trả: ngày + gốc + lãi + ghi chú. Dư nợ gốc còn lại tự trừ dần.
 *
 * Bố cục (mỗi thông tin chỉ hiện 1 lần):
 *   1. Thẻ tổng quan: DƯ NỢ GỐC CÒN LẠI (số to, thanh tiến độ) + lưới chỉ số phụ
 *   2. Thanh "Lịch sử trả nợ" + nút ＋ Ghi nhận (form chỉ mở khi bấm / khi sửa)
 *   3. Bảng lịch sử: cột dư nợ nổi bật, dòng tổng dính đáy
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, X, Pencil, Trash2, Plus } from 'lucide-react'
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
const inp: React.CSSProperties = { width: '100%', fontSize: 12.5, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--nh-muted)' }

export default function SoTraNoTungLan({ hopDong }: { hopDong: HopDongTinDung }) {
  const { fmtTien } = useDonViTien()
  const [rows, setRows] = useState<TraTungLan[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [moForm, setMoForm] = useState(false)
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
  const formOpen = moForm || !!editId
  const thaNoi = hopDong.laiSuatLoai === 'tha-noi'
  const conNam = hopDong.ngayDaoHan ? (new Date(hopDong.ngayDaoHan).getTime() - Date.now()) / (365.25 * 86400000) : null

  const reset = () => { setEditId(null); setMoForm(false); setNgay(homNay()); setGoc(''); setLai(''); setGhiChu(''); setErr(null) }
  const moSua = (r: TraTungLan) => {
    setEditId(r.id); setMoForm(true); setNgay(r.ngay); setGoc(String(r.goc)); setLai(String(r.lai)); setGhiChu(r.ghiChu ?? ''); setErr(null)
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

  const kpi = (label: string, main: React.ReactNode, sub?: React.ReactNode, color = '#1C3557') => (
    <div style={{ minWidth: 0 }}>
      <div style={lbl}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color, marginTop: 2, lineHeight: 1.25 }}>{main}</div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--nh-muted)', marginTop: 1 }}>{sub}</div> : null}
    </div>
  )

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 1. TỔNG QUAN — trọng tâm: dư nợ gốc còn lại ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ flex: '1 1 320px', padding: '16px 20px', background: 'linear-gradient(135deg,#FEF2F2 0%,#fff 75%)', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ ...lbl, color: '#b91c1c' }}>Dư nợ gốc còn lại</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#b91c1c', lineHeight: 1.15, marginTop: 4 }}>{fmtTien(Math.max(0, conLai))}</div>
          <div style={{ height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', marginTop: 14 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#166534' : 'linear-gradient(90deg,#166534,#22c55e)', transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 11.5, marginTop: 6 }}>
            <span style={{ color: '#166534', fontWeight: 700 }}>Đã trả {fmtTien(tongGoc)} · {pct.toFixed(1)}%</span>
            <span style={{ color: 'var(--nh-muted)' }}>Số vay {fmtTien(hopDong.soTienGiaiNgan)}</span>
          </div>
        </div>

        <div style={{ flex: '2 1 440px', padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '14px 24px', alignContent: 'center' }}>
          {kpi('Số tiền vay', fmtTien(hopDong.soTienGiaiNgan),
            hopDong.hanMuc && hopDong.hanMuc !== hopDong.soTienGiaiNgan ? `Hạn mức ${fmtTien(hopDong.hanMuc)}` : undefined)}
          {thaNoi
            ? kpi('Lãi suất', `${hopDong.laiSuat}%/năm`, `${hopDong.soThangUuDai} tháng ưu đãi → ${hopDong.laiSuatSauUuDai}% thả nổi`)
            : kpi('Lãi suất', `${hopDong.laiSuat}%/năm`, 'cố định')}
          {kpi('Hạn trả hết', hopDong.ngayDaoHan ? dmy(hopDong.ngayDaoHan) : '—',
            conNam !== null ? (conNam >= 1 ? `còn ~${conNam.toFixed(1)} năm` : conNam > 0 ? 'dưới 1 năm' : 'đã đến hạn') : undefined)}
          {kpi('Gốc đã trả', fmtTien(tongGoc),
            `${rows.length} lần${rows.length ? ` · gần nhất ${dmy(rows[rows.length - 1].ngay)}` : ''}`, '#166534')}
          {kpi('Lãi đã trả', fmtTien(tongLai), undefined, '#b45309')}
          {kpi('Tổng đã trả', fmtTien(tongGoc + tongLai))}
        </div>
      </div>

      {/* ── 2. THANH LỊCH SỬ + GHI NHẬN ── */}
      <div style={{ background: editId ? '#fffbeb' : '#f8fafc', border: '1px solid ' + (editId ? '#D4A64A' : '#dde3ea'), borderRadius: 10, padding: formOpen ? 12 : '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1C3557', flex: 1 }}>
            {editId ? '✎ Sửa lần trả' : 'Lịch sử trả nợ'}
            {!editId && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--nh-muted)' }}> · {rows.length} lần</span>}
          </div>
          {!formOpen
            ? <button type="button" className="btn-save" onClick={() => setMoForm(true)}><Plus size={13} style={{ verticalAlign: -2 }} /> Ghi nhận lần trả</button>
            : <button type="button" className="btn-ghost" onClick={reset}><X size={12} style={{ verticalAlign: -2 }} /> {editId ? 'Huỷ sửa' : 'Đóng'}</button>}
        </div>

        {formOpen && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
              <label><div style={{ ...lbl, marginBottom: 3 }}>Ngày trả</div>
                <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} style={inp} /></label>
              <label><div style={{ ...lbl, color: '#166534', marginBottom: 3 }}>Gốc đã trả (₫)</div>
                <input type="text" inputMode="numeric" value={soInput(goc)} placeholder="0" onChange={e => setGoc(e.target.value.replace(/\D/g, ''))}
                  style={{ ...inp, textAlign: 'right', borderColor: vuot ? '#dc2626' : '#d1d5db' }} /></label>
              <label><div style={{ ...lbl, color: '#b45309', marginBottom: 3 }}>Lãi đã trả (₫)</div>
                <input type="text" inputMode="numeric" value={soInput(lai)} placeholder="0" onChange={e => setLai(e.target.value.replace(/\D/g, ''))}
                  style={{ ...inp, textAlign: 'right' }} /></label>
              <label style={{ gridColumn: 'span 2' }}><div style={{ ...lbl, marginBottom: 3 }}>Ghi chú</div>
                <input type="text" value={ghiChu} placeholder="VD: Chuyển khoản đợt 1, trả cho anh A…" onChange={e => setGhiChu(e.target.value)} style={inp} /></label>
            </div>
            {vuot && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 6 }}>⚠ Gốc nhập lớn hơn dư nợ còn lại ({fmt(Math.max(0, conLaiKhiSua))} ₫).</div>}
            {err && <div className="nh-err">{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn-save" disabled={busy} onClick={luu}>
                {editId ? <Check size={13} style={{ verticalAlign: -2 }} /> : <Plus size={13} style={{ verticalAlign: -2 }} />} {busy ? 'Đang lưu…' : editId ? 'Lưu thay đổi' : 'Ghi nhận'}
              </button>
            </div>
          </>
        )}
        {!formOpen && err && <div className="nh-err">{err}</div>}
      </div>

      {/* ── 3. BẢNG LỊCH SỬ ── */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table className="nh-tbl" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>Lần</th><th>Ngày trả</th>
              <th className="r">Gốc</th><th className="r">Lãi</th><th className="r">Tổng trả</th>
              <th className="r" style={{ background: '#FEF2F2', color: '#b91c1c' }}>Dư nợ gốc sau trả</th>
              <th>Ghi chú</th><th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {dong.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>
                Chưa có lần trả nào — bấm “Ghi nhận lần trả” để nhập.</td></tr>
            )}
            {dong.map((r, i) => (
              <tr key={r.id} style={editId === r.id ? { background: '#fffbeb' } : undefined}>
                <td><span style={{ display: 'inline-block', minWidth: 24, textAlign: 'center', fontWeight: 700, fontSize: 11.5, color: '#1C3557', background: '#EEF2F7', borderRadius: 6, padding: '1px 6px' }}>{i + 1}</span></td>
                <td>{dmy(r.ngay)}</td>
                <td className="r" style={{ color: '#166534', fontWeight: 600 }}>{r.goc ? fmt(r.goc) : '—'}</td>
                <td className="r" style={{ color: r.lai ? '#b45309' : '#cbd5e1' }}>{r.lai ? fmt(r.lai) : '—'}</td>
                <td className="r" style={{ fontWeight: 700 }}>{fmt(r.goc + r.lai)}</td>
                <td className="r" style={{ color: '#b91c1c', fontWeight: 700, background: '#FFFAFA' }}>{fmt(Math.max(0, r.conSau))}</td>
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
