'use client'

/**
 * LichTraNoTongHop — Lịch trả nợ tổng hợp (module Hạn mức tín dụng, tab "Tín dụng dài hạn")
 * ─────────────────────────────────────────────────────────────
 * Gộp TẤT CẢ kỳ trả nợ của TẤT CẢ hợp đồng dài hạn (và bộ hồ sơ con thuộc
 * hạn mức khung) vào 1 bảng theo tháng — giống cách tab "Hạn mức ngắn hạn"
 * đang hiển thị "Lịch thu tổng hợp", để đại ca nhìn 1 màn là biết tháng này
 * cần trả những khoản nào, ở ngân hàng nào, và tick chọn xác nhận trả hàng loạt
 * thay vì phải mở từng hợp đồng một.
 *
 * Dữ liệu (hopDongs + kyMap) dùng LẠI đúng state đã có sẵn ở TabHanMuc.tsx —
 * component này không tự subscribe Firestore, chỉ nhận props vào.
 * ─────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { markKyDaTraThucTe } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'

// ── Badge trạng thái kỳ — giữ nguyên style đang dùng ở LichTraNoTable ──
const STATUS_STYLE: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'bg-slate-100 text-slate-500 border border-slate-200',
  'gan-han':  'bg-amber-50 text-amber-700 border border-amber-200',
  'qua-han':  'bg-red-50 text-red-700 border border-red-200',
  'da-tra':   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'co-cau':   'bg-blue-50 text-blue-700 border border-blue-200',
}
const STATUS_LABEL: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'Chưa trả', 'gan-han': 'Gần hạn', 'qua-han': 'Quá hạn', 'da-tra': 'Đã trả', 'co-cau': 'Đã cơ cấu',
}

interface Row { ky: KyTraNo; hopDong: HopDongTinDung }

interface Props {
  /** Chỉ truyền các hợp đồng CÓ kỳ trả nợ thật (loaiHD !== 'han-muc-khung') */
  hopDongs: HopDongTinDung[]
  kyMap: Record<string, KyTraNo[]>
  fmtTien: (n: number) => string
  onOpenHopDong: (h: HopDongTinDung) => void
}

const monthStr = (d: Date) => d.toISOString().slice(0, 7)
const todayISO = () => new Date().toISOString().slice(0, 10)
const rowKey   = (r: Row) => `${r.hopDong.id}::${r.ky.id}`

export default function LichTraNoTongHop({ hopDongs, kyMap, fmtTien, onOpenHopDong }: Props) {
  const [thang, setThang]                 = useState(() => monthStr(new Date()))
  const [kemThangTruoc, setKemThangTruoc] = useState(true)
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [ngayTra, setNgayTra]             = useState(todayISO())
  const [saving, setSaving]               = useState(false)

  // ── Gom kỳ của tháng đang chọn + kỳ CHƯA TRẢ còn tồn đọng từ các tháng trước ──
  const { rowsThang, rowsTruoc } = useMemo(() => {
    const rowsThang: Row[] = []
    const rowsTruoc: Row[] = []
    hopDongs.forEach(h => {
      (kyMap[h.id] ?? []).forEach(ky => {
        const kyThang = ky.ngayTra.slice(0, 7)
        if (kyThang === thang) rowsThang.push({ ky, hopDong: h })
        else if (kyThang < thang && ky.trangThai !== 'da-tra') rowsTruoc.push({ ky, hopDong: h })
      })
    })
    const byDate = (a: Row, b: Row) => a.ky.ngayTra.localeCompare(b.ky.ngayTra)
    rowsThang.sort(byDate)
    rowsTruoc.sort(byDate)
    return { rowsThang, rowsTruoc }
  }, [hopDongs, kyMap, thang])

  const rows = kemThangTruoc ? [...rowsTruoc, ...rowsThang] : rowsThang

  const tong = useMemo(() => rows.reduce((a, r) => {
    a.goc += r.ky.gocTra; a.lai += r.ky.laiTra; a.tong += r.ky.tongTra
    if (r.ky.trangThai !== 'da-tra') a.conKy++
    return a
  }, { goc: 0, lai: 0, tong: 0, conKy: 0 }), [rows])

  const chuaTraRows  = rows.filter(r => r.ky.trangThai !== 'da-tra')
  const allSelected  = chuaTraRows.length > 0 && chuaTraRows.every(r => selected.has(rowKey(r)))
  const selectedRows = rows.filter(r => selected.has(rowKey(r)))
  const selectedTong = selectedRows.reduce((s, r) => s + r.ky.tongTra, 0)

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(chuaTraRows.map(rowKey)))
  const toggleOne = (r: Row) => setSelected(prev => {
    const next = new Set(prev)
    next.has(rowKey(r)) ? next.delete(rowKey(r)) : next.add(rowKey(r))
    return next
  })

  const shiftMonth = (delta: number) => {
    const [y, m] = thang.split('-').map(Number)
    setThang(monthStr(new Date(y, m - 1 + delta, 1)))
  }

  const markMany = async (list: Row[]) => {
    setSaving(true)
    try {
      for (const r of list) {
        await markKyDaTraThucTe(r.hopDong, r.ky, kyMap[r.hopDong.id] ?? [], ngayTra, r.ky.gocTra, r.ky.laiTra)
      }
      setSelected(new Set())
    } finally {
      setSaving(false)
    }
  }

  const confirmSelected = () => {
    if (selectedRows.length === 0) return
    if (!confirm(`Xác nhận đã trả ${selectedRows.length} kỳ vào ngày ${ngayTra}?`)) return
    markMany(selectedRows)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>
      {/* Thanh chọn tháng + tuỳ chọn kỳ tồn đọng */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 2px' }}>
        <button className="btn-ghost" onClick={() => shiftMonth(-1)} style={{ padding: '4px 8px' }}><ChevronLeft size={14} /></button>
        <input type="month" className="nh-input" style={{ width: 140 }} value={thang} onChange={e => setThang(e.target.value)} />
        <button className="btn-ghost" onClick={() => shiftMonth(1)} style={{ padding: '4px 8px' }}><ChevronRight size={14} /></button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#374151', marginLeft: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={kemThangTruoc} onChange={e => setKemThangTruoc(e.target.checked)} />
          Kèm kỳ chưa trả tháng trước
          {rowsTruoc.length > 0 && (
            <span style={{ color: '#b91c1c', fontWeight: 700 }}>
              &nbsp;· còn {rowsTruoc.length} kỳ · {fmtTien(rowsTruoc.reduce((s, r) => s + r.ky.tongTra, 0))}
            </span>
          )}
        </label>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>Ngày trả:</span>
          <input type="date" className="nh-input" style={{ width: 150 }} value={ngayTra} onChange={e => setNgayTra(e.target.value)} />
          <button className="btn-primary" disabled={selectedRows.length === 0 || saving} onClick={confirmSelected}>
            <Check size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {saving ? 'Đang lưu…' : `Xác nhận đã trả ${selectedRows.length} kỳ`}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--nh-muted)', padding: '0 2px' }}>
        Đã chọn {selectedRows.length}/{chuaTraRows.length} kỳ · {fmtTien(selectedTong)}
      </div>

      {/* Bảng kỳ trả nợ */}
      <div className="nhp-stick" style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table className="nh-tbl" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={chuaTraRows.length === 0} />
              </th>
              <th>Ngày trả</th>
              <th>Hợp đồng / Bộ hồ sơ</th>
              <th>Pháp nhân · Ngân hàng</th>
              <th>Loại</th>
              <th className="r">Gốc</th>
              <th className="r">Lãi</th>
              <th className="r">Tổng trả</th>
              <th>Trạng thái</th>
              <th style={{ whiteSpace: 'nowrap' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const k     = rowKey(r)
              const daTra = r.ky.trangThai === 'da-tra'
              const isTruoc = r.ky.ngayTra.slice(0, 7) < thang
              return (
                <tr key={k} style={isTruoc ? { background: '#fff7ed' } : undefined}>
                  <td>
                    {!daTra && <input type="checkbox" checked={selected.has(k)} onChange={() => toggleOne(r)} />}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.ky.ngayTra}
                    {isTruoc && <span style={{ marginLeft: 4, fontSize: 10, color: '#c2410c' }}>(kỳ trước)</span>}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--nh-navy)', cursor: 'pointer' }} onClick={() => onOpenHopDong(r.hopDong)}>
                    {r.hopDong.soBoHoSo || r.hopDong.soHopDong}
                  </td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>
                    {r.hopDong.entity} · {r.hopDong.nganHang}{r.hopDong.chiNhanh ? ` · ${r.hopDong.chiNhanh}` : ''}
                  </td>
                  <td>{r.ky.gocTra > 0 ? 'Gốc + Lãi' : 'Lãi'}</td>
                  <td className="r" style={{ color: '#1C3557', fontWeight: 600 }}>{r.ky.gocTra > 0 ? fmtTien(r.ky.gocTra) : '—'}</td>
                  <td className="r" style={{ color: '#b45309' }}>{fmtTien(r.ky.laiTra)}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{fmtTien(r.ky.tongTra)}</td>
                  <td>
                    <span className={`${STATUS_STYLE[r.ky.trangThai]}`} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      {STATUS_LABEL[r.ky.trangThai]}
                    </span>
                  </td>
                  <td>
                    {!daTra && (
                      <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11.5 }} disabled={saving} onClick={() => markMany([r])}>
                        Trả
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Không có kỳ trả nợ nào trong tháng này.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--nh-muted)' }}>
                  Tổng cộng ({rows.length} kỳ · còn phải trả {tong.conKy} kỳ):
                </td>
                <td className="r" style={{ color: '#1C3557' }}>{fmtTien(tong.goc)}</td>
                <td className="r" style={{ color: '#b45309' }}>{fmtTien(tong.lai)}</td>
                <td className="r">{fmtTien(tong.tong)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
