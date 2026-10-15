'use client'
/**
 * BangGocLaiTheoThang — bảng gốc/lãi theo tháng (mỗi cột 1 tháng), dùng chung:
 *   • ChiTietKhung (TabHanMucNganHan): mục = bộ hồ sơ, không nhóm
 *   • LichDongTienTongHop: nhóm (loại vay/ngân hàng/pháp nhân) → mục = hợp đồng/bộ hồ sơ
 * Bấm nhóm/mục để mở xuống; nút "Hiển thị" bật/tắt dòng & cột; nút Excel xuất đúng bảng này.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet, SlidersHorizontal } from 'lucide-react'
import { useDonViTien } from '@/lib/don-vi-tien-context'
import { stickyTh } from '@/components/han-muc/FillLayout'
import {
  buildMatrix, DEFAULT_MATRIX_OPT, exportGocLaiTheoThangExcel, monthLabel, SUM_LINES, sumCells,
  type Cell, type GocLaiRow, type MatrixOpt,
} from '@/lib/goc-lai-theo-thang'

interface Props {
  rows: GocLaiRow[]
  calMonth?: string                    // tháng được tô sáng
  onPickMonth?: (m: string) => void    // bấm tên tháng
  title?: string                       // tiêu đề trong file Excel
  fileName?: string
}

const OPT_LABEL: [keyof MatrixOpt, string][] = [
  ['goc', 'Gốc'], ['lai', 'Lãi'], ['tong', 'Tổng thu/trả (gốc + lãi)'],
  ['daThu', 'Đã thu/trả xong'], ['conPhaiThu', 'Còn phải thu/trả'],
  ['theoBo', 'Chi tiết theo bộ hồ sơ / hợp đồng'], ['cotTong', 'Cột "Tổng"'], ['anThangTrong', 'Ẩn tháng không phát sinh'],
]
const TOP = 36

export default function BangGocLaiTheoThang({ rows, calMonth, onPickMonth, title = 'Gốc / lãi theo tháng', fileName = 'GocLai_theo_thang' }: Props) {
  const { fmtTien } = useDonViTien()
  const [opt, setOpt]           = useState<MatrixOpt>(DEFAULT_MATRIX_OPT)
  const [openMenu, setOpenMenu] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [openMenu])

  const mx = useMemo(() => buildMatrix(rows, opt.anThangTrong), [rows, opt.anThangTrong])
  const hasGroup = mx.groups.some(g => g.key !== '')
  const nItems = mx.groups.reduce((s, g) => s + g.items.length, 0)

  const num = (v: number, color?: string, bold?: boolean): React.ReactNode =>
    v ? <span style={{ color, fontWeight: bold ? 700 : undefined }}>{fmtTien(v)}</span> : <span style={{ color: '#cbd5e1' }}>—</span>
  const labelTd = (bg: string): React.CSSProperties => ({
    position: 'sticky', left: 0, zIndex: 2, background: bg, minWidth: 220, maxWidth: 300,
    borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  })
  const monthCls = (m: string): React.CSSProperties => (m === calMonth ? { boxShadow: 'inset 2px 0 0 #1C3557, inset -2px 0 0 #1C3557' } : {})
  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const expandAll = () => {
    const s = new Set<string>()
    for (const g of mx.groups) { s.add('g::' + g.key); for (const it of g.items) s.add(`i::${g.key}::${it.key}`) }
    setExpanded(s)
  }
  const nOpt = OPT_LABEL.filter(([k]) => opt[k]).length
  const colSpanAll = mx.months.length + (opt.cotTong ? 2 : 1)

  const doExport = async () => {
    setExporting(true)
    try { await exportGocLaiTheoThangExcel({ mx, opt, title, fileName }) } finally { setExporting(false) }
  }

  const itemRows = (gKey: string, it: { key: string; cells: Record<string, Cell> }, indent: number) => {
    const id = `i::${gKey}::${it.key}`
    const open = expanded.has(id)
    return (
      <Fragment key={id}>
        <tr style={{ cursor: 'pointer' }} onClick={() => toggle(id)}>
          <td style={{ ...labelTd('#fff'), fontWeight: 700, color: 'var(--nh-navy)', paddingLeft: indent }}>
            {open ? <ChevronDown size={13} style={{ verticalAlign: -2 }} /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} />} {it.key}
          </td>
          {mx.months.map(m => <td key={m} className="r" style={monthCls(m)}>{num(it.cells[m]?.tong ?? 0, undefined, true)}</td>)}
          {opt.cotTong && <td className="r">{num(sumCells(it.cells, mx.months, 'tong'), undefined, true)}</td>}
        </tr>
        {open && (['goc', 'lai'] as const).map(f => (
          <tr key={f} style={{ background: '#fafafa' }}>
            <td style={{ ...labelTd('#fafafa'), paddingLeft: indent + 22, fontSize: 12, color: f === 'goc' ? '#b91c1c' : '#b45309' }}>{f === 'goc' ? 'Gốc' : 'Lãi'}</td>
            {mx.months.map(m => <td key={m} className="r" style={{ fontSize: 12, ...monthCls(m) }}>{num(it.cells[m]?.[f] ?? 0, f === 'goc' ? '#b91c1c' : '#b45309')}</td>)}
            {opt.cotTong && <td className="r" style={{ fontSize: 12 }}>{num(sumCells(it.cells, mx.months, f), f === 'goc' ? '#b91c1c' : '#b45309')}</td>}
          </tr>
        ))}
      </Fragment>
    )
  }

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 6, height: TOP, background: '#fff', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--nh-muted)' }}>
          {mx.months.length} tháng · {nItems} {hasGroup ? 'mục' : 'bộ hồ sơ'}{onPickMonth ? ' · bấm tên tháng để chọn tháng' : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {opt.theoBo && (
            <>
              <button className="btn-ghost" style={{ padding: '3px 9px', fontSize: 12 }} onClick={expandAll}>Mở gốc/lãi tất cả</button>
              <button className="btn-ghost" style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => setExpanded(new Set())}>Thu gọn</button>
            </>
          )}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setOpenMenu(o => !o)}>
              <SlidersHorizontal size={12} style={{ marginRight: 4, verticalAlign: -1 }} />Hiển thị <b>{nOpt}</b>
            </button>
            {openMenu && (
              <div style={{ position: 'absolute', right: 0, top: TOP - 6, width: 270, background: '#fff', border: '1px solid #cbd5e1',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: 12, zIndex: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nh-navy)', marginBottom: 8 }}>Hiển thị dòng / cột</div>
                {OPT_LABEL.map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={opt[k]} onChange={e => setOpt(p => ({ ...p, [k]: e.target.checked }))} />{label}
                  </label>
                ))}
                <button className="btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={() => setOpt(DEFAULT_MATRIX_OPT)}>Mặc định</button>
              </div>
            )}
          </div>
          <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={!mx.months.length || exporting} onClick={doExport}>
            <FileSpreadsheet size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{exporting ? 'Đang xuất…' : 'Excel bảng này'}
          </button>
        </div>
      </div>

      {mx.months.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--nh-muted2)', fontSize: 13 }}>Không có kỳ thu/trả nào</div>
      ) : (
        <table className="nh-tbl" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, top: TOP, left: 0, zIndex: 5, minWidth: 220 }}>Chỉ tiêu</th>
              {mx.months.map(m => (
                <th key={m} className="r" style={{ ...stickyTh, top: TOP, minWidth: 110, cursor: onPickMonth ? 'pointer' : undefined,
                  background: m === calMonth ? '#dbeafe' : undefined, ...monthCls(m) }}
                  onClick={() => onPickMonth?.(m)}>{monthLabel(m)}</th>
              ))}
              {opt.cotTong && <th className="r" style={{ ...stickyTh, top: TOP, minWidth: 120 }}>Tổng</th>}
            </tr>
          </thead>
          <tbody>
            {SUM_LINES.filter(r => opt[r.key]).map(r => (
              <tr key={r.key} style={{ background: r.bg, fontWeight: r.bold ? 700 : 600 }}>
                <td style={labelTd(r.bg)}><span style={{ color: r.color }}>● </span>{r.label}</td>
                {mx.months.map(m => <td key={m} className="r" style={monthCls(m)}>{num(mx.tot[m]?.[r.f] ?? 0, r.color, r.bold)}</td>)}
                {opt.cotTong && <td className="r">{num(sumCells(mx.tot, mx.months, r.f), r.color, true)}</td>}
              </tr>
            ))}

            {opt.theoBo && nItems > 0 && (
              <tr>
                <td colSpan={colSpanAll} style={{ background: '#f8fafc', fontSize: 11.5, fontWeight: 700, color: 'var(--nh-muted)', padding: '6px 10px' }}>
                  Chi tiết theo {hasGroup ? 'nhóm → hợp đồng / bộ hồ sơ' : 'bộ hồ sơ'} ({nItems}) — bấm vào dòng để xem gốc / lãi
                </td>
              </tr>
            )}

            {opt.theoBo && mx.groups.map(g => {
              if (g.key === '') return g.items.map(it => itemRows('', it, 10))
              const gid = 'g::' + g.key
              const open = expanded.has(gid)
              return (
                <Fragment key={gid}>
                  <tr style={{ cursor: 'pointer', background: '#eef2f7', fontWeight: 700 }} onClick={() => toggle(gid)}>
                    <td style={{ ...labelTd('#eef2f7'), color: 'var(--nh-navy)' }}>
                      {open ? <ChevronDown size={13} style={{ verticalAlign: -2 }} /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} />} {g.key} <span style={{ fontWeight: 400, color: 'var(--nh-muted)' }}>({g.items.length})</span>
                    </td>
                    {mx.months.map(m => <td key={m} className="r" style={monthCls(m)}>{num(g.cells[m]?.tong ?? 0, undefined, true)}</td>)}
                    {opt.cotTong && <td className="r">{num(sumCells(g.cells, mx.months, 'tong'), undefined, true)}</td>}
                  </tr>
                  {open && g.items.map(it => itemRows(g.key, it, 26))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
