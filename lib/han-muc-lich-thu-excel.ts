/**
 * Xuất Excel lịch thu theo THÁNG đang chọn:
 *   Sheet 1 "Tổng hợp T10-2026": gốc / lãi / tổng thu theo từng bộ hồ sơ
 *   Sheet 2 "Chi tiết T10-2026": từng kỳ thu (ngày, bộ hồ sơ, loại, gốc, lãi, trạng thái)
 * Số tiền xuất nguyên VND (không phụ thuộc đơn vị tỷ/triệu đang chọn trên màn hình).
 * Yêu cầu thư viện `xlsx` (SheetJS).
 */
import type { BoHoSoGiaiNgan, HanMucNganHan, KyThuNH } from './han-muc-ngan-han-types'

interface Args {
  khung: HanMucNganHan
  boList: BoHoSoGiaiNgan[]
  kyList: KyThuNH[]      // kỳ của tháng chọn (+ kỳ cũ chưa thu nếu đang bật)
  month: string          // 'YYYY-MM'
}

export async function exportLichThuThangExcel({ khung, boList, kyList, month }: Args) {
  const XLSX = await import('xlsx')
  const [y, m] = month.split('-')
  const label = `T${Number(m)}-${y}`
  const boMap = Object.fromEntries(boList.map(b => [b.id, b]))
  const soBo = (k: KyThuNH) => boMap[k.boHoSoId]?.soBoHoSo ?? k.boHoSoId
  const isCu = (k: KyThuNH) => k.ngayThu < `${month}-01`
  const daThu = (k: KyThuNH) => k.trangThai === 'da-thu'
  const loai = (k: KyThuNH) => (k.loai === 'goc-va-lai' ? 'Gốc + Lãi' : k.loai === 'goc' ? 'Gốc' : 'Lãi')
  const tt = (k: KyThuNH) =>
    daThu(k) ? 'Đã thu' : k.trangThai === 'qua-han' ? 'Quá hạn' : k.trangThai === 'gan-han' ? 'Gần hạn' : 'Chưa thu'

  const sorted = [...kyList].sort((a, b) => a.ngayThu.localeCompare(b.ngayThu) || soBo(a).localeCompare(soBo(b)))
  const soKyCu = sorted.filter(isCu).length
  const head = [
    [`LỊCH THU GỐC & LÃI ${label} — ${khung.soHopDong}`],
    [`${khung.entity} · ${khung.nganHang}${khung.chiNhanh ? ' · ' + khung.chiNhanh : ''}`],
    soKyCu ? [`Đã gồm ${soKyCu} kỳ chưa thu của các tháng trước`] : [],
    [],
  ]

  // ── Sheet 1: tổng hợp theo bộ hồ sơ ──
  const agg = new Map<string, { goc: number; lai: number; tong: number; da: number; con: number }>()
  for (const k of sorted) {
    const a = agg.get(k.boHoSoId) ?? { goc: 0, lai: 0, tong: 0, da: 0, con: 0 }
    a.goc += k.gocThu; a.lai += k.laiThu; a.tong += k.tongThu
    if (daThu(k)) a.da += k.tongThucThu ?? k.tongThu; else a.con += k.tongThu
    agg.set(k.boHoSoId, a)
  }
  const s1 = [...head, ['STT', 'Bộ hồ sơ', 'Gốc', 'Lãi', 'Tổng thu', 'Đã thu', 'Còn phải thu']]
  const s1Start = s1.length + 1
  const rows1 = [...agg.entries()].sort((a, b) => soBo({ boHoSoId: a[0] } as KyThuNH).localeCompare(soBo({ boHoSoId: b[0] } as KyThuNH)))
  rows1.forEach(([id, a], i) => s1.push([i + 1, boMap[id]?.soBoHoSo ?? id, a.goc, a.lai, a.tong, a.da, a.con] as any))
  const s1End = s1.length
  const sum1 = (c: string) => ({ t: 'n', f: `SUM(${c}${s1Start}:${c}${s1End})`, v: rows1.reduce((s, [, a]) => s + a[({ C: 'goc', D: 'lai', E: 'tong', F: 'da', G: 'con' } as any)[c] as 'goc'], 0) })
  if (rows1.length) s1.push(['', 'TỔNG CỘNG', sum1('C'), sum1('D'), sum1('E'), sum1('F'), sum1('G')] as any)

  // ── Sheet 2: chi tiết từng kỳ ──
  const s2: any[][] = [...head, ['Ngày thu', 'Bộ hồ sơ', 'Kỳ', 'Loại', 'Gốc', 'Lãi', 'Tổng thu', 'Trạng thái', 'Ngày thực thu', 'Ghi chú']]
  const d0 = s2.length + 1
  sorted.forEach(k => s2.push([k.ngayThu, soBo(k), k.soKy ?? '', loai(k), k.gocThu, k.laiThu, k.tongThu, tt(k), daThu(k) ? (k.ngayThucThu ?? '') : '', isCu(k) ? 'Kỳ tháng trước chưa thu' : '']))
  const d1 = s2.length
  const sum2 = (c: string, f: 'gocThu' | 'laiThu' | 'tongThu') => ({ t: 'n', f: `SUM(${c}${d0}:${c}${d1})`, v: sorted.reduce((s, k) => s + k[f], 0) })
  if (sorted.length) s2.push(['TỔNG CỘNG', '', '', '', sum2('E', 'gocThu'), sum2('F', 'laiThu'), sum2('G', 'tongThu'), '', '', ''])

  const mk = (aoa: any[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = widths.map(wch => ({ wch }))
    for (const key of Object.keys(ws)) {
      if (key[0] === '!') continue
      const c = ws[key]
      if (c && c.t === 'n' && !/^A\d+$/.test(key)) c.z = '#,##0'   // bỏ cột A (STT)
    }
    return ws
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, mk(s1, [6, 24, 16, 16, 16, 16, 16]), `Tổng hợp ${label}`)
  XLSX.utils.book_append_sheet(wb, mk(s2, [13, 24, 6, 11, 16, 16, 16, 12, 14, 26]), `Chi tiết ${label}`)
  XLSX.writeFile(wb, `LichThu_${khung.soHopDong.replace(/[\\/:*?"<>|\s]+/g, '_')}_${y}-${m}.xlsx`)
}
