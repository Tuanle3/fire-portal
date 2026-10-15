/**
 * Lõi dùng chung cho "Gốc/lãi theo tháng":
 *   • buildMatrix  — gom danh sách kỳ thu/trả thành ma trận [nhóm → mục → tháng]
 *   • exportGocLaiTheoThangExcel — xuất đúng ma trận đó ra Excel (đủ chi tiết, không phụ thuộc đang mở/thu gọn)
 * Dùng ở: ChiTietKhung (TabHanMucNganHan) và LichDongTienTongHop.
 */

/** 1 kỳ thu/trả đã chuẩn hoá (ngắn hạn hay dài hạn đều quy về dạng này) */
export interface GocLaiRow {
  ngay: string        // YYYY-MM-DD
  item: string        // mục chi tiết: số bộ hồ sơ / số hợp đồng
  group?: string      // nhóm cấp trên (pháp nhân / ngân hàng / loại vay) — bỏ trống = không nhóm
  goc: number
  lai: number
  tong: number
  daXong: boolean     // đã thu / đã trả
  daThu?: number      // số thực thu (nếu có), mặc định = tong
}

export interface Cell { goc: number; lai: number; tong: number; daThu: number; con: number }
export const zeroCell = (): Cell => ({ goc: 0, lai: 0, tong: 0, daThu: 0, con: 0 })

export interface Matrix {
  months: string[]
  tot: Record<string, Cell>
  groups: { key: string; cells: Record<string, Cell>; items: { key: string; cells: Record<string, Cell> }[] }[]
}

/** Các ô tích trong nút "Hiển thị" */
export interface MatrixOpt {
  goc: boolean; lai: boolean; tong: boolean
  daThu: boolean; conPhaiThu: boolean
  theoBo: boolean          // chi tiết theo bộ hồ sơ / hợp đồng
  cotTong: boolean
  anThangTrong: boolean    // ẩn tháng không phát sinh
}
export const DEFAULT_MATRIX_OPT: MatrixOpt = {
  goc: true, lai: true, tong: true, daThu: false, conPhaiThu: false,
  theoBo: true, cotTong: true, anThangTrong: true,
}
export const SUM_LINES: { key: keyof MatrixOpt; label: string; f: keyof Cell; color: string; bg: string; bold?: boolean }[] = [
  { key: 'goc',        label: 'Gốc',          f: 'goc',   color: '#b91c1c', bg: '#fef2f2' },
  { key: 'lai',        label: 'Lãi',          f: 'lai',   color: '#b45309', bg: '#fffbeb' },
  { key: 'tong',       label: 'Tổng thu/trả', f: 'tong',  color: '#1C3557', bg: '#e0e7ff', bold: true },
  { key: 'daThu',      label: 'Đã xong',      f: 'daThu', color: '#15803d', bg: '#f0fdf4' },
  { key: 'conPhaiThu', label: 'Còn phải thu/trả', f: 'con', color: '#b91c1c', bg: '#fff5f5' },
]

export const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `T${Number(mm)}/${y}` }

const addTo = (c: Cell, r: GocLaiRow) => {
  c.goc += r.goc; c.lai += r.lai; c.tong += r.tong
  if (r.daXong) c.daThu += r.daThu ?? r.tong; else c.con += r.tong
}

export function buildMatrix(rows: GocLaiRow[], anThangTrong: boolean): Matrix {
  const tot: Record<string, Cell> = {}
  const gMap = new Map<string, { cells: Record<string, Cell>; items: Map<string, Record<string, Cell>> }>()
  for (const r of rows) {
    const m = r.ngay.slice(0, 7)
    ;(tot[m] ??= zeroCell()); addTo(tot[m], r)
    const gk = r.group ?? ''
    let g = gMap.get(gk); if (!g) { g = { cells: {}, items: new Map() }; gMap.set(gk, g) }
    ;(g.cells[m] ??= zeroCell()); addTo(g.cells[m], r)
    let it = g.items.get(r.item); if (!it) { it = {}; g.items.set(r.item, it) }
    ;(it[m] ??= zeroCell()); addTo(it[m], r)
  }
  const ms = Object.keys(tot).sort()
  let months = ms
  if (ms.length && !anThangTrong) {
    months = []
    let [y, m] = ms[0].split('-').map(Number)
    for (;;) {
      const s = `${y}-${String(m).padStart(2, '0')}`
      months.push(s)
      if (s >= ms[ms.length - 1]) break
      m++; if (m > 12) { m = 1; y++ }
    }
  }
  const groups = [...gMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
    .map(([key, g]) => ({
      key, cells: g.cells,
      items: [...g.items.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([k, cells]) => ({ key: k, cells })),
    }))
  return { months, tot, groups }
}

export const sumCells = (cells: Record<string, Cell>, months: string[], f: keyof Cell) =>
  months.reduce((s, m) => s + (cells[m]?.[f] ?? 0), 0)

// ── Xuất Excel ───────────────────────────────────────────────
export async function exportGocLaiTheoThangExcel(
  { mx, opt, title, fileName }: { mx: Matrix; opt: MatrixOpt; title: string; fileName: string },
) {
  const XLSX = await import('xlsx')
  const hasGroup = mx.groups.some(g => g.key !== '')
  const aoa: any[][] = [[title], [], ['Nhóm', 'Bộ hồ sơ / Hợp đồng', 'Chỉ tiêu', ...mx.months.map(monthLabel), 'Tổng']]
  const push = (a: string, b: string, c: string, cells: Record<string, Cell>, f: keyof Cell) => {
    const vals = mx.months.map(m => cells[m]?.[f] ?? 0)
    aoa.push([a, b, c, ...vals, vals.reduce((s, v) => s + v, 0)])
  }
  for (const l of SUM_LINES.filter(l => opt[l.key])) push('TỔNG', '', l.label, mx.tot, l.f)
  if (opt.theoBo) {
    const lines = SUM_LINES.filter(l => (l.key === 'goc' || l.key === 'lai' || l.key === 'tong') && opt[l.key])
    const use = lines.length ? lines : SUM_LINES.filter(l => l.key === 'tong')
    for (const g of mx.groups) {
      if (hasGroup) push(g.key, '(Cộng nhóm)', 'Tổng thu/trả', g.cells, 'tong')
      for (const it of g.items) for (const l of use) push(g.key, it.key, l.label, it.cells, l.f)
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 18 }, ...mx.months.map(() => ({ wch: 15 })), { wch: 17 }]
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue
    const r = Number(k.replace(/\D/g, ''))
    if (r >= 4 && ws[k].t === 'n') ws[k].z = '#,##0'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gốc lãi theo tháng')
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx')
}
