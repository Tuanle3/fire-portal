// ============================================================
// XUẤT EXCEL — Tab Kế hoạch dòng tiền
//
// Xuất ĐÚNG những gì đang hiển thị trên bảng: bộ lọc (ngày/nguồn/công ty/chiều tiền/loại GD/tìm nhanh),
// cách xem (Nguồn/Công ty/Phân loại/Đối tác/Nhóm), các dòng–cột bật ở nút "Hiển thị", tick Pending.
// 1 sheet, có GROUP đóng/mở (nút +/− bên trái và nút 1·2·3 góc trên trái):
//   • Xem theo Nguồn + bật "Gộp theo loại nguồn":  Loại nguồn (cấp 1) → Nguồn (cấp 2) → Khoản (cấp 3)
//   • Các cách xem còn lại:                         Nhóm/Công ty/… (cấp 1) → Khoản (cấp 2)
// Mặc định mở file ở trạng thái THU GỌN (chỉ thấy dòng nhóm).
//
// Cần: npm i exceljs   (import động → chỉ tải thư viện khi bấm Xuất)
// ============================================================
import type { Workbook, Row as XRow, Cell as XCell } from 'exceljs'
import type { DongTienKHRow as Row } from './keHoachDongTienAdapter'

export type Dim = 'src' | 'co' | 'typ' | 'pt' | 'nh'

export interface XuatExcelInput {
  dim:      Dim
  dimLabel: string                       // "Nhóm", "Nguồn"…
  from:     string                       // yyyy-mm-dd
  to:       string
  ms:       string[]                     // các tháng (yyyy-mm) đang hiển thị
  rs:       Row[]                        // toàn bộ khoản sau khi lọc
  keys:     string[]                     // các dòng nhóm theo đúng thứ tự trên màn hình (đã lọc/tìm)
  M:        Record<string, Row[]>        // khoản theo từng dòng nhóm
  tiers?:   { id: string; label: string; keys: string[] }[]   // có → đang xem theo Nguồn + gộp loại nguồn
  pend:     Set<string>                  // id khoản chi đã tick Pending
  V:        Record<string, number>       // cờ bật/tắt ở nút "Hiển thị"
  gc:       (r: Row) => string           // lấy ghi chú của khoản
  locText:  string[]                     // mô tả bộ lọc để in dưới tiêu đề
  thuGon?:  boolean                      // mặc định true: mở file ở trạng thái thu gọn
}

// ── màu theo bộ nhận diện SAG ─────────────────────────────────
const C = {
  navy: 'FF1C3557', navy2: 'FF2F4B73', gold: 'FFD4A64A', ink: 'FF1F2937', gray: 'FF9CA3AF',
  green: 'FF166534', red: 'FFB91C1C', amber: 'FFB45309',
  bgGroup: 'FFE8EEF7', bgTier: 'FFC9D6EA', bgSum: 'FFF3F4F6', bgGreen: 'FFECFDF5', bgRed: 'FFFEF2F2',
  bgAmber: 'FFFFFBEB', bgBal: 'FFDCE6F4', bgDiv: 'FFF8FAFC', line: 'FFD9DEE7',
}
const L = { style: 'thin' as const, color: { argb: C.line } }
const BORDER = { top: L, left: L, bottom: L, right: L }
const NUM = '#,##0;-#,##0;"–"'
const FONT = 'Calibri'

const INFO_HEAD = { pt: 'Đối tác / NCC / KH', src: 'Nguồn thanh toán', co: 'Công ty', gc: 'Ghi chú' }
const INFO_W    = { pt: 26, src: 30, co: 28, gc: 36 }

const dmy = (d: string) => d.split('-').reverse().join('/')
const ascii = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '')
const mo = (a: Row[], m: string) => a.filter(r => r.d.slice(0, 7) === m)
const solid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })

type Kind = 't' | 'c' | 'p' | 'b' | 'x'

export async function taoWorkbook(inp: XuatExcelInput): Promise<Workbook> {
  const { dim, ms, keys, M, tiers, pend, V, gc, rs } = inp
  const thuGon = inp.thuGon !== false
  const tierMode = !!tiers?.length

  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const wb: Workbook = new ExcelJS.Workbook()
  wb.creator = 'Sơn An Group'; wb.created = new Date()
  const ws = wb.addWorksheet('Kế hoạch dòng tiền', {
    properties: { tabColor: { argb: C.navy }, defaultRowHeight: 20, outlineProperties: { summaryBelow: false, summaryRight: false } },
    views: [{ showGridLines: false }],
  })

  // ── cột ───────────────────────────────────────────────────
  const subF = (['pt', 'src', 'co'] as const).filter(f => f !== dim && V['c_' + f])
  const info: { key: 'pt' | 'src' | 'co' | 'gc'; head: string; w: number }[] = [
    ...subF.map(f => ({ key: f, head: INFO_HEAD[f], w: INFO_W[f] })),
    ...(V.c_gc ? [{ key: 'gc' as const, head: INFO_HEAD.gc, w: INFO_W.gc }] : []),
  ]
  const cInfo0 = 2 + ms.length + (V.tot ? 1 : 0)
  const nCols  = cInfo0 - 1 + info.length
  ws.getColumn(1).width = 54
  ms.forEach((_, i) => { ws.getColumn(2 + i).width = 17 })
  if (V.tot) ws.getColumn(2 + ms.length).width = 19
  info.forEach((x, i) => { ws.getColumn(cInfo0 + i).width = x.w })

  // ── số liệu tổng ──────────────────────────────────────────
  const st = (a: Row[]) => {
    let t = 0, c = 0, p = 0
    a.forEach(r => { if (r.a > 0) t += r.a; else if (pend.has(r.id)) p += r.a; else c += r.a })
    return { t, c, p, b: t + c }
  }
  const tot = st(rs)
  const Z = ms.map(m => st(mo(rs, m)))
  let cu = 0; const LK = Z.map(z => cu += z.b)

  // ── helper định dạng ──────────────────────────────────────
  const paint = (row: XRow, o: { fill?: string; color?: string; bold?: boolean; italic?: boolean; size?: number; h?: number; border?: boolean }) => {
    for (let i = 1; i <= nCols; i++) {
      const c = row.getCell(i)
      if (o.fill) c.fill = solid(o.fill)
      c.font = { name: FONT, size: o.size ?? 10.5, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color ?? C.ink } }
      if (o.border !== false) c.border = BORDER
      c.alignment = { vertical: 'middle' }
    }
    if (o.h) row.height = o.h
  }
  const setNum = (c: XCell, v: number, kind: Kind, bold = false, pending = false) => {
    const r = Math.round(v)
    c.value = r
    c.numFmt = NUM
    c.alignment = { horizontal: 'right', vertical: 'middle' }
    const color = r === 0 ? C.gray : pending ? C.amber
      : kind === 't' ? C.green : kind === 'c' || kind === 'x' ? C.red : kind === 'p' ? C.amber : r < 0 ? C.red : C.green
    c.font = { name: FONT, size: 10.5, bold, italic: pending, color: { argb: color } }
    if (pending) c.fill = solid(C.bgAmber)
  }
  const setLabel = (c: XCell, text: string, indent: number, bold = false, color?: string) => {
    c.value = text
    c.alignment = { horizontal: 'left', vertical: 'middle', indent, wrapText: false }
    c.font = { name: FONT, size: 10.5, bold, color: { argb: color ?? C.ink } }
  }
  // Dòng có nhóm: level = cấp group; collapsedParent = dòng cha đang thu gọn (nút hiện dấu +)
  const mk = (level = 0, hidden = false, collapsedParent = false): XRow => {
    const row = ws.addRow([])
    if (level) row.outlineLevel = level
    if (hidden) row.hidden = true
    // exceljs tự suy "collapsed" từ outlineLevel → ghi đè cho đúng ý (dòng cha thu gọn = dấu +)
    try { Object.defineProperty(row, 'collapsed', { value: collapsedParent, configurable: true }) } catch { /* bỏ qua */ }
    return row
  }

  // ── 1) Tiêu đề ────────────────────────────────────────────
  ws.addRow([]); ws.mergeCells(1, 1, 1, nCols)
  paint(ws.getRow(1), { fill: C.navy, color: 'FFFFFFFF', bold: true, size: 17, h: 34, border: false })
  setLabel(ws.getCell(1, 1), `KẾ HOẠCH DÒNG TIỀN — THEO ${inp.dimLabel.toUpperCase()}`, 1, true, 'FFFFFFFF')
  ws.getCell(1, 1).font = { name: FONT, size: 17, bold: true, color: { argb: 'FFFFFFFF' } }

  ws.addRow([]); ws.mergeCells(2, 1, 2, nCols)
  paint(ws.getRow(2), { fill: C.navy2, color: 'FFFFFFFF', size: 10, h: 34, border: false })
  const sub2 = ws.getCell(2, 1)
  sub2.value = `${inp.locText.join('  ·  ')}\nĐơn vị: VNĐ  ·  Xuất lúc ${new Date().toLocaleString('vi-VN')}`
  sub2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true }
  sub2.font = { name: FONT, size: 10, color: { argb: 'FFFFFFFF' } }

  ws.addRow([]); ws.getRow(3).height = 4
  for (let i = 1; i <= nCols; i++) ws.getCell(3, i).fill = solid(C.gold)

  // ── 2) Dòng tiêu đề cột ───────────────────────────────────
  const HR = 4
  const hr = ws.addRow([])
  paint(hr, { fill: C.navy, color: 'FFFFFFFF', bold: true, h: 26 })
  setLabel(hr.getCell(1), 'Chỉ tiêu', 1, true, 'FFFFFFFF')
  ms.forEach((m, i) => { const c = hr.getCell(2 + i); c.value = `T${m.slice(5)}/${m.slice(0, 4)}`; c.alignment = { horizontal: 'right', vertical: 'middle' } })
  if (V.tot) { const c = hr.getCell(2 + ms.length); c.value = 'Tổng kỳ'; c.alignment = { horizontal: 'right', vertical: 'middle' } }
  info.forEach((x, i) => { const c = hr.getCell(cInfo0 + i); c.value = x.head; c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 } })

  // ── 3) Các dòng tổng ──────────────────────────────────────
  const sumRow = (lab: string, vals: number[], kind: Kind, tv: number | null, fill: string, bold = false) => {
    const r = mk(); paint(r, { fill, bold, h: 22 })
    setLabel(r.getCell(1), lab, 1, true, kind === 'b' ? C.navy : undefined)
    vals.forEach((v, i) => setNum(r.getCell(2 + i), kind === 'x' ? (v < 0 ? -v : 0) : v, kind, bold))
    if (V.tot && tv != null) setNum(r.getCell(2 + ms.length), kind === 'x' ? (tv < 0 ? -tv : 0) : tv, kind, true)
  }
  let lastSum = HR
  const before = ws.rowCount
  if (V.tt)  sumRow('Tổng thu',                   Z.map(z => z.t), 't', tot.t, C.bgGreen)
  if (V.ct)  sumRow('Chi thanh toán',             Z.map(z => z.c), 'c', tot.c, C.bgRed)
  if (V.pd)  sumRow('Pending / trả sau',          Z.map(z => z.p), 'p', tot.p, C.bgAmber)
  if (V.cb)  sumRow('Cân đối trong tháng',        Z.map(z => z.b), 'b', tot.b, C.bgBal, true)
  if (V.tm)  sumRow('Số tiền thiếu trong tháng',  Z.map(z => z.b), 'x', tot.b, C.bgSum)
  if (V.lk)  sumRow('Cân đối lũy kế',             LK,              'b', null,  C.bgBal, true)
  if (V.tl)  sumRow('Số tiền thiếu lũy kế',       LK,              'x', null,  C.bgSum)
  if (ws.rowCount > before) lastSum = ws.rowCount

  // dòng phân cách
  const nGroupLabel = tierMode ? `${keys.length} nguồn` : `${keys.length} nhóm`
  const dv = mk(); ws.mergeCells(dv.number, 1, dv.number, nCols)
  paint(dv, { fill: C.bgDiv, color: C.navy, bold: true, h: 24 })
  setLabel(dv.getCell(1), `Cân đối theo ${inp.dimLabel.toLowerCase()}  ·  ${nGroupLabel}  ·  bấm +/− bên trái (hoặc nút 1·2·3 góc trên trái) để xem từng khoản`, 1, true, C.navy)

  // ── 4) Dòng nhóm + khoản chi tiết ─────────────────────────
  const sub = (r: Row) => subF.map(f => r[f]).filter(Boolean).join(' · ')

  const addGroup = (k: string, level: number, hiddenSelf: boolean) => {
    const rows = M[k]
    const gr = mk(level, hiddenSelf, thuGon); paint(gr, { fill: C.bgGroup, bold: true, h: 22, color: C.navy })
    setLabel(gr.getCell(1), `${k}   (${rows.length})`, level ? 2 : 1, true, C.navy)
    ms.forEach((m, i) => setNum(gr.getCell(2 + i), st(mo(rows, m)).b, 'b', true))
    if (V.tot) setNum(gr.getCell(2 + ms.length), st(rows).b, 'b', true)

    const items = rows.slice().sort((x, y) => (Number(y.a > 0) - Number(x.a > 0)) || (x.d < y.d ? -1 : x.d > y.d ? 1 : x.id.localeCompare(y.id)))
    let grps: Row[][]
    if (V.c_d) grps = items.map(r => [r])
    else {
      const mp = new Map<string, Row[]>()
      items.forEach(r => {
        const kk = (r.a > 0 ? 'T' : 'C') + '|' + (V.c_n ? r.ct : '') + '|' + sub(r) + '|' + (V.c_gc ? gc(r) : '')
        if (!mp.has(kk)) mp.set(kk, [])
        mp.get(kk)!.push(r)
      })
      grps = [...mp.values()]
    }
    const hideDetail = hiddenSelf || thuGon
    grps.forEach(g => {
      const r0 = g[0]
      const dr = mk(level + 1, hideDetail, false); paint(dr, { h: 19 })
      const text = [V.c_d ? `${r0.d.slice(8)}/${r0.d.slice(5, 7)}` : '', V.c_n ? r0.ct : ''].filter(Boolean).join(' · ') || sub(r0) || r0.ct
      setLabel(dr.getCell(1), text, level + 3)
      ms.forEach((m, i) => {
        const cx = g.filter(x => x.d.slice(0, 7) === m)
        if (!cx.length) return
        const ng = cx.filter(x => x.a < 0)
        setNum(dr.getCell(2 + i), cx.reduce((t, x) => t + x.a, 0), 'b', false, ng.length > 0 && ng.every(x => pend.has(x.id)))
      })
      if (V.tot) {
        const ng = g.filter(x => x.a < 0)
        setNum(dr.getCell(2 + ms.length), g.reduce((t, x) => t + x.a, 0), 'b', true, ng.length > 0 && ng.every(x => pend.has(x.id)))
      }
      info.forEach((x, i) => {
        const c = dr.getCell(cInfo0 + i)
        c.value = x.key === 'gc' ? gc(r0) : r0[x.key]
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
        c.font = { name: FONT, size: 10, color: { argb: 'FF4B5563' } }
      })
    })
  }

  if (tierMode) {
    tiers!.forEach(t => {
      const all = t.keys.flatMap(k => M[k])
      const tr = mk(0, false, false); paint(tr, { fill: C.bgTier, bold: true, h: 24, color: C.navy })
      setLabel(tr.getCell(1), `${t.label}   (${t.keys.length} nguồn)`, 1, true, C.navy)
      ms.forEach((m, i) => setNum(tr.getCell(2 + i), st(mo(all, m)).b, 'b', true))
      if (V.tot) setNum(tr.getCell(2 + ms.length), st(all).b, 'b', true)
      t.keys.forEach(k => addGroup(k, 1, false))
    })
  } else keys.forEach(k => addGroup(k, 0, false))

  // ── 5) Chú thích cuối bảng ────────────────────────────────
  ws.addRow([])
  const note = (txt: string, bg?: string) => {
    const r = ws.addRow([]); ws.mergeCells(r.number, 1, r.number, nCols)
    const c = r.getCell(1); c.value = txt
    c.font = { name: FONT, size: 9.5, italic: true, color: { argb: 'FF6B7280' } }
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    if (bg) c.fill = solid(bg)
  }
  note('Quy ước: Thu = số dương (xanh) · Chi = số âm (đỏ) · “–” = không phát sinh.')
  note('Ô nền vàng, chữ nghiêng: khoản chi đã chuyển sang Pending / trả sau — không tính vào “Chi thanh toán” và “Cân đối”.', C.bgAmber)

  // ── 6) Đóng băng, in ấn ───────────────────────────────────
  const maxLevel = tierMode ? 2 : 1
  ws.properties.outlineLevelRow = keys.length ? maxLevel : 0
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: V.pin ? lastSum : HR, showGridLines: false, zoomScale: 100 }]
  ws.pageSetup = {
    orientation: 'landscape', paperSize: 8 /* A3 */, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    printTitlesRow: `${HR}:${HR}`,
  } as any
  ws.headerFooter.oddFooter = '&L&8Sơn An Group — Kế hoạch dòng tiền&C&8Trang &P / &N&R&8&D'
  return wb
}

export async function xuatExcelKeHoach(inp: XuatExcelInput): Promise<void> {
  const wb = await taoWorkbook(inp)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `KeHoach_DongTien_${ascii(inp.dimLabel)}_${inp.from.replace(/-/g, '')}_${inp.to.replace(/-/g, '')}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
