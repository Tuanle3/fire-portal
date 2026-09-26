'use client'

/**
 * LichTraNoTongHop — Lịch trả nợ tổng hợp
 * Nâng cấp: ẩn/hiện cột linh động + chế độ Tổng hợp theo Ngân hàng / Pháp nhân
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, SlidersHorizontal, LayoutList, BarChart3 } from 'lucide-react'
import { markKyDaTraThucTe } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'

// ─── Badge trạng thái ────────────────────────────────────────
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

// ─── Định nghĩa cột ẩn/hiện ──────────────────────────────────
type ColKey = 'ngayTra' | 'hopDong' | 'phapNhanNganHang' | 'loai' | 'goc' | 'lai' | 'tongTra' | 'trangThai' | 'thaotac'

interface ColDef { key: ColKey; label: string; defaultOn: boolean }

const ALL_COLS: ColDef[] = [
  { key: 'ngayTra',          label: 'Ngày trả',              defaultOn: true  },
  { key: 'hopDong',          label: 'Hợp đồng / Bộ hồ sơ',  defaultOn: true  },
  { key: 'phapNhanNganHang', label: 'Pháp nhân · Ngân hàng', defaultOn: true  },
  { key: 'loai',             label: 'Loại kỳ',               defaultOn: true  },
  { key: 'goc',              label: 'Gốc',                   defaultOn: true  },
  { key: 'lai',              label: 'Lãi',                   defaultOn: true  },
  { key: 'tongTra',          label: 'Tổng trả',              defaultOn: true  },
  { key: 'trangThai',        label: 'Trạng thái',            defaultOn: true  },
  { key: 'thaotac',          label: 'Thao tác',              defaultOn: true  },
]

// ─── Chế độ xem ──────────────────────────────────────────────
type ViewMode = 'chitiet' | 'tonghop-nganHang' | 'tonghop-phapNhan'

interface Row { ky: KyTraNo; hopDong: HopDongTinDung }

interface Props {
  hopDongs: HopDongTinDung[]
  kyMap: Record<string, KyTraNo[]>
  fmtTien: (n: number) => string
  onOpenHopDong: (h: HopDongTinDung) => void
}

const monthStr = (d: Date) => d.toISOString().slice(0, 7)
const todayISO = () => new Date().toISOString().slice(0, 10)
const rowKey   = (r: Row) => `${r.hopDong.id}::${r.ky.id}`

// ─── Dropdown ẩn/hiện cột ────────────────────────────────────
function ColToggleDropdown({
  cols, visible, onChange,
}: {
  cols: ColDef[]
  visible: Set<ColKey>
  onChange: (key: ColKey, on: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn-ghost"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12.5 }}
        title="Ẩn/hiện cột"
      >
        <SlidersHorizontal size={13} />
        Cột hiển thị
        <span style={{
          marginLeft: 2, background: '#1C3557', color: '#fff',
          borderRadius: 99, fontSize: 10, padding: '1px 6px', fontWeight: 700,
        }}>
          {visible.size}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 999, marginTop: 4,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.10)', padding: '10px 4px', minWidth: 220,
        }}>
          <div style={{ padding: '0 12px 6px', fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Cột hiển thị
          </div>
          {cols.map(c => (
            <label key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
              fontSize: 12.5, cursor: 'pointer', borderRadius: 6,
              color: visible.has(c.key) ? '#111827' : '#9ca3af',
              background: 'transparent',
              transition: 'background .1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input
                type="checkbox"
                checked={visible.has(c.key)}
                onChange={e => onChange(c.key, e.target.checked)}
                style={{ accentColor: '#1C3557' }}
              />
              {c.label}
            </label>
          ))}
          <div style={{ borderTop: '1px solid #f1f5f9', margin: '6px 12px 0' }} />
          <div style={{ display: 'flex', gap: 8, padding: '6px 12px 2px' }}>
            <button
              style={{ fontSize: 11, color: '#1C3557', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
              onClick={() => cols.forEach(c => onChange(c.key, true))}
            >Chọn tất cả</button>
            <span style={{ color: '#d1d5db' }}>|</span>
            <button
              style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => cols.filter(c => c.key !== 'tongTra').forEach(c => onChange(c.key, false))}
            >Ẩn bớt</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bảng tổng hợp theo nhóm ─────────────────────────────────
function BangTongHop({
  rows, groupBy, fmtTien,
}: {
  rows: Row[]
  groupBy: 'nganHang' | 'phapNhan'
  fmtTien: (n: number) => string
}) {
  type GroupRow = { key: string; soKy: number; goc: number; lai: number; tong: number; chuaTra: number }

  const groups = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>()
    rows.forEach(r => {
      const key = groupBy === 'nganHang'
        ? `${r.hopDong.nganHang}${r.hopDong.chiNhanh ? ' · ' + r.hopDong.chiNhanh : ''}`
        : r.hopDong.entity
      if (!map.has(key)) map.set(key, { key, soKy: 0, goc: 0, lai: 0, tong: 0, chuaTra: 0 })
      const g = map.get(key)!
      g.soKy++
      g.goc += r.ky.gocTra
      g.lai += r.ky.laiTra
      g.tong += r.ky.tongTra
      if (r.ky.trangThai !== 'da-tra') g.chuaTra++
    })
    return [...map.values()].sort((a, b) => b.tong - a.tong)
  }, [rows, groupBy])

  const total = groups.reduce((s, g) => ({ goc: s.goc + g.goc, lai: s.lai + g.lai, tong: s.tong + g.tong }), { goc: 0, lai: 0, tong: 0 })

  return (
    <div className="nhp-stick" style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
      <table className="nh-tbl">
        <thead>
          <tr>
            <th style={{ minWidth: 180 }}>{groupBy === 'nganHang' ? 'Ngân hàng' : 'Pháp nhân'}</th>
            <th className="r">Số kỳ</th>
            <th className="r">Chưa trả</th>
            <th className="r" style={{ color: '#1C3557' }}>Gốc</th>
            <th className="r" style={{ color: '#b45309' }}>Lãi</th>
            <th className="r">Tổng trả</th>
            <th style={{ minWidth: 120 }}>Tỷ lệ</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const pct = total.tong > 0 ? (g.tong / total.tong) * 100 : 0
            return (
              <tr key={g.key}>
                <td style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>{g.key}</td>
                <td className="r" style={{ color: '#6b7280' }}>{g.soKy}</td>
                <td className="r">
                  {g.chuaTra > 0
                    ? <span style={{ color: '#b91c1c', fontWeight: 700 }}>{g.chuaTra}</span>
                    : <span style={{ color: '#15803d' }}>✓</span>}
                </td>
                <td className="r" style={{ color: '#1C3557', fontWeight: 600 }}>{fmtTien(g.goc)}</td>
                <td className="r" style={{ color: '#b45309' }}>{fmtTien(g.lai)}</td>
                <td className="r" style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtTien(g.tong)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#1C3557', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#6b7280', minWidth: 34, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
          {groups.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>Không có dữ liệu.</td></tr>
          )}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--nh-muted)' }}>
                Tổng cộng ({groups.length} nhóm):
              </td>
              <td className="r" style={{ color: '#1C3557' }}>{fmtTien(total.goc)}</td>
              <td className="r" style={{ color: '#b45309' }}>{fmtTien(total.lai)}</td>
              <td className="r">{fmtTien(total.tong)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function LichTraNoTongHop({ hopDongs, kyMap, fmtTien, onOpenHopDong }: Props) {
  const [thang, setThang]                 = useState(() => monthStr(new Date()))
  const [kemThangTruoc, setKemThangTruoc] = useState(true)
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [ngayTra, setNgayTra]             = useState(todayISO())
  const [saving, setSaving]               = useState(false)

  // ── Chế độ xem ──
  const [viewMode, setViewMode] = useState<ViewMode>('chitiet')

  // ── Cột ẩn/hiện (session only) ──
  const [visible, setVisible] = useState<Set<ColKey>>(
    () => new Set(ALL_COLS.filter(c => c.defaultOn).map(c => c.key))
  )
  const toggleCol = (key: ColKey, on: boolean) => {
    setVisible(prev => {
      const next = new Set(prev)
      on ? next.add(key) : next.delete(key)
      return next
    })
  }

  // ── Lọc dữ liệu ──
  const { rowsThang, rowsTruoc } = useMemo(() => {
    const rowsThang: Row[] = []
    const rowsTruoc: Row[] = []
    hopDongs.forEach(h => {
      ;(kyMap[h.id] ?? []).forEach(ky => {
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
      for (const r of list)
        await markKyDaTraThucTe(r.hopDong, r.ky, kyMap[r.hopDong.id] ?? [], ngayTra, r.ky.gocTra, r.ky.laiTra)
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

  // ── Số cột động (cho colSpan footer) ──
  const visibleCols = ALL_COLS.filter(c => visible.has(c.key))
  // Khi ở chế độ chi tiết: số cột thực = 1 (checkbox) + số cột visible
  const totalCols = 1 + visibleCols.length

  // colSpan trước cột Gốc
  const colsBefore = (() => {
    let n = 1 // checkbox luôn có
    for (const c of ALL_COLS) {
      if (c.key === 'goc') break
      if (visible.has(c.key)) n++
    }
    return n
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>

      {/* ── Thanh điều khiển ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 2px' }}>
        {/* Tháng */}
        <button className="btn-ghost" onClick={() => shiftMonth(-1)} style={{ padding: '4px 8px' }}><ChevronLeft size={14} /></button>
        <input type="month" className="nh-input" style={{ width: 140 }} value={thang} onChange={e => setThang(e.target.value)} />
        <button className="btn-ghost" onClick={() => shiftMonth(1)} style={{ padding: '4px 8px' }}><ChevronRight size={14} /></button>

        {/* Kỳ tồn đọng */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={kemThangTruoc} onChange={e => setKemThangTruoc(e.target.checked)} />
          Kèm kỳ chưa trả tháng trước
          {rowsTruoc.length > 0 && (
            <span style={{ color: '#b91c1c', fontWeight: 700 }}>
              &nbsp;· {rowsTruoc.length} kỳ · {fmtTien(rowsTruoc.reduce((s, r) => s + r.ky.tongTra, 0))}
            </span>
          )}
        </label>

        {/* ── Chế độ xem + cột toggle — đẩy sang phải ── */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>

          {/* View mode switcher */}
          <div style={{ display: 'inline-flex', border: '1px solid #dbe2ea', borderRadius: 8, overflow: 'hidden' }}>
            {([
              { key: 'chitiet',              label: 'Chi tiết',      icon: <LayoutList size={12} /> },
              { key: 'tonghop-nganHang',     label: 'Theo NH',       icon: <BarChart3 size={12} /> },
              { key: 'tonghop-phapNhan',     label: 'Theo pháp nhân',icon: <BarChart3 size={12} /> },
            ] as { key: ViewMode; label: string; icon: React.ReactNode }[]).map(v => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                style={{
                  border: 'none', padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                  background: viewMode === v.key ? '#1C3557' : '#fff',
                  color: viewMode === v.key ? '#fff' : '#6b7280',
                  transition: 'all .15s',
                }}
              >
                {v.icon}{v.label}
              </button>
            ))}
          </div>

          {/* Column toggle — chỉ hiện khi chi tiết */}
          {viewMode === 'chitiet' && (
            <ColToggleDropdown cols={ALL_COLS} visible={visible} onChange={toggleCol} />
          )}
        </div>
      </div>

      {/* ── Thanh xác nhận trả (chỉ chi tiết) ── */}
      {viewMode === 'chitiet' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0 2px' }}>
          <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>
            Đã chọn {selectedRows.length}/{chuaTraRows.length} kỳ · {fmtTien(selectedTong)}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--nh-muted)' }}>Ngày trả:</span>
            <input type="date" className="nh-input" style={{ width: 150 }} value={ngayTra} onChange={e => setNgayTra(e.target.value)} />
            <button className="btn-primary" disabled={selectedRows.length === 0 || saving} onClick={confirmSelected}>
              <Check size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              {saving ? 'Đang lưu…' : `Xác nhận đã trả ${selectedRows.length} kỳ`}
            </button>
          </div>
        </div>
      )}

      {/* ── Chế độ tổng hợp ── */}
      {viewMode !== 'chitiet' && (
        <BangTongHop
          rows={rows}
          groupBy={viewMode === 'tonghop-nganHang' ? 'nganHang' : 'phapNhan'}
          fmtTien={fmtTien}
        />
      )}

      {/* ── Chế độ chi tiết ── */}
      {viewMode === 'chitiet' && (
        <div className="nhp-stick" style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="nh-tbl" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                {/* Checkbox luôn hiện */}
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={chuaTraRows.length === 0} />
                </th>
                {visible.has('ngayTra')          && <th style={{ whiteSpace: 'nowrap' }}>Ngày trả</th>}
                {visible.has('hopDong')           && <th>Hợp đồng / Bộ hồ sơ</th>}
                {visible.has('phapNhanNganHang')  && <th>Pháp nhân · Ngân hàng</th>}
                {visible.has('loai')              && <th>Loại</th>}
                {visible.has('goc')               && <th className="r">Gốc</th>}
                {visible.has('lai')               && <th className="r">Lãi</th>}
                {visible.has('tongTra')           && <th className="r">Tổng trả</th>}
                {visible.has('trangThai')         && <th>Trạng thái</th>}
                {visible.has('thaotac')           && <th style={{ whiteSpace: 'nowrap' }}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const k      = rowKey(r)
                const daTra  = r.ky.trangThai === 'da-tra'
                const isTruoc = r.ky.ngayTra.slice(0, 7) < thang
                return (
                  <tr key={k} style={isTruoc ? { background: '#fff7ed' } : undefined}>
                    <td>
                      {!daTra && <input type="checkbox" checked={selected.has(k)} onChange={() => toggleOne(r)} />}
                    </td>
                    {visible.has('ngayTra') && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.ky.ngayTra}
                        {isTruoc && <span style={{ marginLeft: 4, fontSize: 10, color: '#c2410c' }}>(kỳ trước)</span>}
                      </td>
                    )}
                    {visible.has('hopDong') && (
                      <td style={{ fontWeight: 700, color: 'var(--nh-navy)', cursor: 'pointer' }} onClick={() => onOpenHopDong(r.hopDong)}>
                        {r.hopDong.soBoHoSo || r.hopDong.soHopDong}
                      </td>
                    )}
                    {visible.has('phapNhanNganHang') && (
                      <td style={{ fontSize: 12, color: '#6b7280' }}>
                        {r.hopDong.entity} · {r.hopDong.nganHang}{r.hopDong.chiNhanh ? ` · ${r.hopDong.chiNhanh}` : ''}
                      </td>
                    )}
                    {visible.has('loai') && (
                      <td>{r.ky.gocTra > 0 ? 'Gốc + Lãi' : 'Lãi'}</td>
                    )}
                    {visible.has('goc') && (
                      <td className="r" style={{ color: '#1C3557', fontWeight: 600 }}>
                        {r.ky.gocTra > 0 ? fmtTien(r.ky.gocTra) : '—'}
                      </td>
                    )}
                    {visible.has('lai') && (
                      <td className="r" style={{ color: '#b45309' }}>{fmtTien(r.ky.laiTra)}</td>
                    )}
                    {visible.has('tongTra') && (
                      <td className="r" style={{ fontWeight: 700 }}>{fmtTien(r.ky.tongTra)}</td>
                    )}
                    {visible.has('trangThai') && (
                      <td>
                        <span className={STATUS_STYLE[r.ky.trangThai]} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                          {STATUS_LABEL[r.ky.trangThai]}
                        </span>
                      </td>
                    )}
                    {visible.has('thaotac') && (
                      <td>
                        {!daTra && (
                          <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11.5 }} disabled={saving} onClick={() => markMany([r])}>
                            Trả
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={totalCols} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>
                    Không có kỳ trả nợ nào trong tháng này.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={colsBefore} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--nh-muted)' }}>
                    Tổng ({rows.length} kỳ · còn trả {tong.conKy} kỳ):
                  </td>
                  {visible.has('goc')     && <td className="r" style={{ color: '#1C3557' }}>{fmtTien(tong.goc)}</td>}
                  {visible.has('lai')     && <td className="r" style={{ color: '#b45309' }}>{fmtTien(tong.lai)}</td>}
                  {visible.has('tongTra') && <td className="r">{fmtTien(tong.tong)}</td>}
                  {/* fill remaining */}
                  {(['trangThai','thaotac'] as ColKey[]).filter(k => visible.has(k)).map(k => <td key={k} />)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
