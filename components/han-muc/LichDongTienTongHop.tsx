'use client'

/**
 * LichDongTienTongHop — Tab "Kế hoạch dòng tiền" (module Hạn mức tín dụng)
 * ─────────────────────────────────────────────────────────────
 * Gộp TẤT CẢ kỳ thu/trả gốc + lãi của CẢ 2 nhóm:
 *   • Ngắn hạn  (HanMucNganHan → BoHoSoGiaiNgan → KyThuNH)
 *   • Dài hạn   (HopDongTinDung → KyTraNo)
 * vào 1 bảng duy nhất, cho phép:
 *   • Chọn khoảng tháng xem (mặc định: tháng này → +2 tháng tới)
 *   • Lọc theo Loại vay (Ngắn hạn / Dài hạn) và Pháp nhân
 *   • Tuỳ biến sắp xếp/nhóm: theo Ngày (mặc định) / Loại vay / Ngân hàng / Pháp nhân
 *   • Xuất Excel đủ cột (Ngày, Loại vay, Pháp nhân, Ngân hàng, Chi nhánh, Số HĐ,
 *     Loại kỳ, Gốc, Lãi, Tổng, Trạng thái) + 2 sheet tổng hợp theo tháng / theo NH
 *     để copy thẳng vào file kế hoạch dòng tiền.
 *
 * Component TỰ SUBSCRIBE Firestore (không phụ thuộc state của TabHanMuc /
 * TabHanMucNganHan) — nhét vào tab nào cũng chạy độc lập được.
 * ─────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { subscribeHopDong, subscribeAllKyTraNo } from '@/lib/han-muc-store'
import { subscribeHanMucNganHan, subscribeBoHoSo, subscribeAllKyThuNH } from '@/lib/han-muc-ngan-han-store'
import { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'
import { HanMucNganHan, BoHoSoGiaiNgan, KyThuNH } from '@/lib/han-muc-ngan-han-types'
import { exportKeHoachDongTienExcel, DongTienRow } from '@/lib/ke-hoach-dong-tien-excel-export'
import { useFillHeight } from '@/components/han-muc/FillLayout'

// ── Badge trạng thái — gộp theo NHÓM ý nghĩa (không phân biệt câu chữ thu/trả) ──
type StatusCat = 'pending' | 'near' | 'overdue' | 'done' | 'restructured'
const CAT_STYLE: Record<StatusCat, string> = {
  pending:      'bg-slate-100 text-slate-500 border border-slate-200',
  near:         'bg-amber-50 text-amber-700 border border-amber-200',
  overdue:      'bg-red-50 text-red-700 border border-red-200',
  done:         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  restructured: 'bg-blue-50 text-blue-700 border border-blue-200',
}
function catDaiHan(s: KyTraNo['trangThai']): StatusCat {
  return s === 'da-tra' ? 'done' : s === 'qua-han' ? 'overdue' : s === 'gan-han' ? 'near' : s === 'co-cau' ? 'restructured' : 'pending'
}
function catNganHan(s: KyThuNH['trangThai']): StatusCat {
  return s === 'da-thu' ? 'done' : s === 'qua-han' ? 'overdue' : s === 'gan-han' ? 'near' : 'pending'
}
const LABEL_DAI_HAN: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'Chưa trả', 'gan-han': 'Gần hạn', 'qua-han': 'Quá hạn', 'da-tra': 'Đã trả', 'co-cau': 'Đã cơ cấu',
}
const LABEL_NGAN_HAN: Record<KyThuNH['trangThai'], string> = {
  'chua-thu': 'Chưa thu', 'gan-han': 'Gần hạn', 'qua-han': 'Quá hạn', 'da-thu': 'Đã thu',
}

// ── Row thống nhất cho cả 2 nhóm ─────────────────────────────
interface UnifiedRow {
  key:       string
  loaiVay:   'Ngắn hạn' | 'Dài hạn'
  ngay:      string
  entity:    string
  nganHang:  string
  chiNhanh?: string
  soHopDong: string
  ghiChuKhung?: string
  loaiKy:    string
  goc:       number
  lai:       number
  tong:      number
  trangThai: string
  cat:       StatusCat
  daXong:    boolean
}

type NhomTheo = 'ngay' | 'loai-vay' | 'ngan-hang' | 'phap-nhan'
type LoaiVayFilter = 'Ngắn hạn' | 'Dài hạn'

const fmt = (n: number) => n.toLocaleString('vi-VN')
const monthStr   = (d: Date) => d.toISOString().slice(0, 7)
const addMonths  = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number)
  return monthStr(new Date(y, mo - 1 + delta, 1))
}

// ══════════════════════════════════════════════════════════════
// Loader ẩn: gom bo + kỳ thu của 1 khung ngắn hạn, báo dữ liệu lên cha
// (tách riêng để mỗi khung tự quản lý effect/subscribe của mình,
//  tránh phải tự tay theo dõi n-cấp dependency ở component cha)
// ══════════════════════════════════════════════════════════════
function KhungNHLoader({
  khung, onRows,
}: {
  khung: HanMucNganHan
  onRows: (khungId: string, rows: { ky: KyThuNH; bo: BoHoSoGiaiNgan; khung: HanMucNganHan }[]) => void
}) {
  const [boList, setBoList] = useState<BoHoSoGiaiNgan[]>([])
  const [kyMap, setKyMap]   = useState<Record<string, KyThuNH[]>>({})

  useEffect(() => subscribeBoHoSo(khung.id, setBoList), [khung.id])

  const boIdsKey = boList.map(b => b.id).sort().join(',')
  useEffect(() => {
    return subscribeAllKyThuNH(khung.id, boList.map(b => b.id), setKyMap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khung.id, boIdsKey])

  useEffect(() => {
    const rows: { ky: KyThuNH; bo: BoHoSoGiaiNgan; khung: HanMucNganHan }[] = []
    boList.forEach(bo => {
      (kyMap[bo.id] ?? []).forEach(ky => rows.push({ ky, bo, khung }))
    })
    onRows(khung.id, rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boList, kyMap, khung])

  return null
}

interface Props {
  fmtTien: (n: number) => string
}

export default function LichDongTienTongHop({ fmtTien }: Props) {
  // ── Dữ liệu Dài hạn ──────────────────────────────────────────
  const [hopDongsDH, setHopDongsDH] = useState<HopDongTinDung[]>([])
  const [kyTraNoAll, setKyTraNoAll] = useState<KyTraNo[]>([])
  useEffect(() => subscribeHopDong(setHopDongsDH), [])
  const hopDongIdsKey = useMemo(() => hopDongsDH.map(h => h.id).sort().join(','), [hopDongsDH])
  useEffect(() => {
    return subscribeAllKyTraNo(hopDongsDH.map(h => h.id), setKyTraNoAll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hopDongIdsKey])
  const hopDongMapDH = useMemo(() => {
    const m = new Map<string, HopDongTinDung>()
    hopDongsDH.forEach(h => m.set(h.id, h))
    return m
  }, [hopDongsDH])

  // ── Dữ liệu Ngắn hạn (khung → bộ hồ sơ → kỳ thu, qua loader ẩn) ──
  const [khungListNH, setKhungListNH]   = useState<HanMucNganHan[]>([])
  const [rowsByKhung, setRowsByKhung]   = useState<Record<string, { ky: KyThuNH; bo: BoHoSoGiaiNgan; khung: HanMucNganHan }[]>>({})
  useEffect(() => subscribeHanMucNganHan(setKhungListNH), [])
  const handleKhungRows = useCallback((khungId: string, rows: { ky: KyThuNH; bo: BoHoSoGiaiNgan; khung: HanMucNganHan }[]) => {
    setRowsByKhung(prev => ({ ...prev, [khungId]: rows }))
  }, [])
  const rawNganHan = useMemo(() => Object.values(rowsByKhung).flat(), [rowsByKhung])

  // ── Bộ lọc / tuỳ biến hiển thị ───────────────────────────────
  const [tuThang, setTuThang]   = useState(() => monthStr(new Date()))
  const [denThang, setDenThang] = useState(() => addMonths(monthStr(new Date()), 2))
  const [kemQuaHan, setKemQuaHan] = useState(true)
  const [loaiVaySet, setLoaiVaySet] = useState<Set<LoaiVayFilter>>(new Set(['Ngắn hạn', 'Dài hạn']))
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [nhom, setNhom] = useState<NhomTheo>('ngay')

  const toggleLoaiVay = (lv: LoaiVayFilter) => setLoaiVaySet(prev => {
    const next = new Set(prev)
    if (next.has(lv)) { if (next.size > 1) next.delete(lv) } else next.add(lv)
    return next
  })

  // ── Gộp 2 nguồn thành UnifiedRow ─────────────────────────────
  const allRows: UnifiedRow[] = useMemo(() => {
    const out: UnifiedRow[] = []

    kyTraNoAll.forEach(ky => {
      const h = hopDongMapDH.get(ky.hopDongId)
      if (!h || h.loaiHD === 'han-muc-khung') return
      const khungCha = h.hanMucKhungId ? hopDongMapDH.get(h.hanMucKhungId) : undefined
      out.push({
        key: `dh::${ky.id}`,
        loaiVay: 'Dài hạn',
        ngay: ky.ngayTra,
        entity: h.entity,
        nganHang: h.nganHang,
        chiNhanh: h.chiNhanh,
        soHopDong: h.soBoHoSo || h.soHopDong,
        ghiChuKhung: khungCha ? `Khung: ${khungCha.soHopDong}` : undefined,
        loaiKy: ky.gocTra > 0 ? 'Gốc + Lãi' : 'Lãi',
        goc: ky.gocTra, lai: ky.laiTra, tong: ky.tongTra,
        trangThai: LABEL_DAI_HAN[ky.trangThai],
        cat: catDaiHan(ky.trangThai),
        daXong: ky.trangThai === 'da-tra',
      })
    })

    rawNganHan.forEach(({ ky, bo, khung }) => {
      out.push({
        key: `nh::${ky.id}`,
        loaiVay: 'Ngắn hạn',
        ngay: ky.ngayThu,
        entity: khung.entity,
        nganHang: khung.nganHang,
        chiNhanh: khung.chiNhanh,
        soHopDong: bo.soBoHoSo,
        ghiChuKhung: `Khung: ${khung.soHopDong}`,
        loaiKy: ky.loai === 'goc-va-lai' ? 'Gốc + Lãi' : ky.loai === 'goc' ? 'Gốc' : 'Lãi',
        goc: ky.gocThu, lai: ky.laiThu, tong: ky.tongThu,
        trangThai: LABEL_NGAN_HAN[ky.trangThai],
        cat: catNganHan(ky.trangThai),
        daXong: ky.trangThai === 'da-thu',
      })
    })

    return out
  }, [kyTraNoAll, hopDongMapDH, rawNganHan])

  // ── Danh sách pháp nhân xuất hiện trong dữ liệu (để làm dropdown lọc) ──
  const entityOptions = useMemo(() => {
    const s = new Set<string>()
    allRows.forEach(r => s.add(r.entity))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'vi'))
  }, [allRows])

  // ── Áp bộ lọc: khoảng tháng + kèm quá hạn + loại vay + pháp nhân ──
  const filteredRows = useMemo(() => {
    return allRows.filter(r => {
      if (!loaiVaySet.has(r.loaiVay)) return false
      if (entityFilter !== 'all' && r.entity !== entityFilter) return false
      const rThang = r.ngay.slice(0, 7)
      const trongKhoang = rThang >= tuThang && rThang <= denThang
      const quaHanTruoc = kemQuaHan && rThang < tuThang && !r.daXong
      return trongKhoang || quaHanTruoc
    })
  }, [allRows, loaiVaySet, entityFilter, tuThang, denThang, kemQuaHan])

  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => a.ngay.localeCompare(b.ngay)),
    [filteredRows],
  )

  // ── Nhóm hiển thị (nếu chọn nhóm theo Loại vay / NH / Pháp nhân) ──
  const groups = useMemo(() => {
    if (nhom === 'ngay') return null
    const keyOf = (r: UnifiedRow) => nhom === 'loai-vay' ? r.loaiVay : nhom === 'ngan-hang' ? r.nganHang : r.entity
    const map = new Map<string, UnifiedRow[]>()
    sortedRows.forEach(r => {
      const k = keyOf(r)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    })
    let keys = Array.from(map.keys())
    keys = nhom === 'loai-vay'
      ? (['Ngắn hạn', 'Dài hạn'] as const).filter(k => map.has(k))
      : keys.sort((a, b) => a.localeCompare(b, 'vi'))
    return keys.map(k => ({ ten: k, rows: map.get(k)! }))
  }, [sortedRows, nhom])

  // ── Tổng số liệu ──────────────────────────────────────────────
  const tong = useMemo(() => sortedRows.reduce((a, r) => {
    a.goc += r.goc; a.lai += r.lai; a.tong += r.tong
    if (r.loaiVay === 'Ngắn hạn') a.tongNH += r.tong; else a.tongDH += r.tong
    if (!r.daXong) a.conKy++
    return a
  }, { goc: 0, lai: 0, tong: 0, tongNH: 0, tongDH: 0, conKy: 0 }), [sortedRows])

  const { ref: fillRef, h: fillH } = useFillHeight([])

  const handleExport = () => {
    const rows: DongTienRow[] = sortedRows.map(r => ({
      ngay: r.ngay, loaiVay: r.loaiVay, entity: r.entity, nganHang: r.nganHang, chiNhanh: r.chiNhanh,
      soHopDong: r.ghiChuKhung ? `${r.soHopDong} (${r.ghiChuKhung})` : r.soHopDong,
      loaiKy: r.loaiKy, goc: r.goc, lai: r.lai, tong: r.tong, trangThai: r.trangThai,
    }))
    exportKeHoachDongTienExcel(rows, tuThang, denThang)
  }

  const renderRow = (r: UnifiedRow) => (
    <tr key={r.key}>
      <td style={{ whiteSpace: 'nowrap' }}>{r.ngay}</td>
      <td>
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
          background: r.loaiVay === 'Ngắn hạn' ? '#eef2f7' : '#fffbf0',
          color: r.loaiVay === 'Ngắn hạn' ? '#1C3557' : '#92600a',
        }}>
          {r.loaiVay}
        </span>
      </td>
      <td>{r.entity}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{r.nganHang}{r.chiNhanh ? ` · ${r.chiNhanh}` : ''}</td>
      <td>
        <div style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>{r.soHopDong}</div>
        {r.ghiChuKhung && <div style={{ fontSize: 10, color: '#6b7280' }}>{r.ghiChuKhung}</div>}
      </td>
      <td>{r.loaiKy}</td>
      <td className="r" style={{ color: '#1C3557', fontWeight: 600 }}>{r.goc > 0 ? fmtTien(r.goc) : '—'}</td>
      <td className="r" style={{ color: '#b45309' }}>{fmtTien(r.lai)}</td>
      <td className="r" style={{ fontWeight: 700 }}>{fmtTien(r.tong)}</td>
      <td>
        <span className={CAT_STYLE[r.cat]} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
          {r.trangThai}
        </span>
      </td>
    </tr>
  )

  return (
    <div ref={fillRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, height: fillH, minHeight: 0 }}>
      {/* ── Chỉ số tổng quan ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 28px', padding: '6px 2px', alignItems: 'baseline' }}>
        <MiniTotal label="Tổng cộng" value={fmtTien(tong.tong)} sub={`${sortedRows.length} kỳ · còn ${tong.conKy} chưa xong`} />
        <MiniTotal label="Trong đó — Ngắn hạn" value={fmtTien(tong.tongNH)} color="#1C3557" />
        <MiniTotal label="Trong đó — Dài hạn" value={fmtTien(tong.tongDH)} color="#92600a" />
        <MiniTotal label="Tổng gốc" value={fmtTien(tong.goc)} />
        <MiniTotal label="Tổng lãi" value={fmtTien(tong.lai)} color="#b45309" />
      </div>

      {/* ── Thanh bộ lọc / tuỳ biến ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 2px' }}>
        <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>Từ tháng</span>
        <input type="month" className="nh-input" style={{ width: 130 }} value={tuThang} onChange={e => setTuThang(e.target.value)} />
        <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>đến</span>
        <input type="month" className="nh-input" style={{ width: 130 }} value={denThang} onChange={e => setDenThang(e.target.value)} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={kemQuaHan} onChange={e => setKemQuaHan(e.target.checked)} />
          Kèm kỳ quá hạn/chưa xong trước đó
        </label>

        <div style={{ display: 'flex', gap: 4 }}>
          {(['Ngắn hạn', 'Dài hạn'] as LoaiVayFilter[]).map(lv => (
            <button
              key={lv} className="btn-ghost" onClick={() => toggleLoaiVay(lv)}
              style={loaiVaySet.has(lv) ? { background: 'var(--nh-navy)', color: '#fff', borderColor: 'var(--nh-navy)' } : undefined}
            >
              {lv}
            </button>
          ))}
        </div>

        <select className="nh-select" style={{ width: 150 }} value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
          <option value="all">Tất cả pháp nhân</option>
          {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        <span style={{ fontSize: 12, color: 'var(--nh-muted)', marginLeft: 4 }}>Sắp xếp / nhóm theo:</span>
        <select className="nh-select" style={{ width: 150 }} value={nhom} onChange={e => setNhom(e.target.value as NhomTheo)}>
          <option value="ngay">Ngày (mặc định)</option>
          <option value="loai-vay">Loại vay</option>
          <option value="ngan-hang">Ngân hàng</option>
          <option value="phap-nhan">Pháp nhân</option>
        </select>

        <button className="btn-primary" style={{ marginLeft: 'auto' }} disabled={sortedRows.length === 0} onClick={handleExport}>
          <FileSpreadsheet size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          Xuất Excel kế hoạch dòng tiền
        </button>
      </div>

      {/* ── Bảng ── */}
      <div className="nhp-stick" style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table className="nh-tbl" style={{ minWidth: 1180 }}>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Loại vay</th>
              <th>Pháp nhân</th>
              <th>Ngân hàng</th>
              <th>Số hợp đồng / Bộ hồ sơ</th>
              <th>Loại kỳ</th>
              <th className="r">Gốc</th>
              <th className="r">Lãi</th>
              <th className="r">Tổng</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          {groups === null ? (
            <tbody>
              {sortedRows.map(renderRow)}
              {sortedRows.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Không có kỳ thu/trả nào trong khoảng đã chọn.</td></tr>
              )}
            </tbody>
          ) : (
            groups.map(g => {
              const gTong = g.rows.reduce((a, r) => { a.goc += r.goc; a.lai += r.lai; a.tong += r.tong; return a }, { goc: 0, lai: 0, tong: 0 })
              return (
                <tbody key={g.ten}>
                  <tr style={{ background: '#eef2f7' }}>
                    <td colSpan={6} style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>{g.ten} ({g.rows.length} kỳ)</td>
                    <td className="r" style={{ fontWeight: 700, color: '#1C3557' }}>{fmtTien(gTong.goc)}</td>
                    <td className="r" style={{ fontWeight: 700, color: '#b45309' }}>{fmtTien(gTong.lai)}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{fmtTien(gTong.tong)}</td>
                    <td></td>
                  </tr>
                  {g.rows.map(renderRow)}
                </tbody>
              )
            })
          )}
          {sortedRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--nh-muted)' }}>
                  Tổng cộng ({sortedRows.length} kỳ · còn {tong.conKy} chưa xong):
                </td>
                <td className="r" style={{ color: '#1C3557' }}>{fmtTien(tong.goc)}</td>
                <td className="r" style={{ color: '#b45309' }}>{fmtTien(tong.lai)}</td>
                <td className="r">{fmtTien(tong.tong)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Loader ẩn — mỗi khung ngắn hạn tự gom bộ hồ sơ + kỳ thu của nó */}
      {khungListNH.map(k => <KhungNHLoader key={k.id} khung={k} onRows={handleKhungRows} />)}
    </div>
  )
}

function MiniTotal({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--nh-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: color ?? 'var(--nh-txt)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--nh-muted)' }}>{sub}</div>}
    </div>
  )
}
