// ============================================================
// ENGINE — Gộp dòng tiền (nhập tay + tự động hạn mức) và rollup
// theo ngày/tuần/tháng/quý (Phần 3).
//
// Tồn quỹ hiện tính TƯƠNG ĐỐI (cộng dồn chênh lệch thu-chi từ
// mốc 0) vì chưa có số dư quỹ thật làm mốc — xem `soDuBanDau`
// bên dưới, khi có số liệu thật chỉ cần truyền thêm, không cần
// sửa lại logic rollup.
// ============================================================
import { KhoanDongTien, DongTienItem, tuKhoanDongTienRaItem } from './dong-tien-types'

export type DonViThoiGian = 'ngay' | 'tuan' | 'thang' | 'quy'

export interface CashFlowBucket {
  key:            string          // khoá bucket, dùng để sort/tra cứu — VD '2026-08-18' (đầu tuần)
  kyLabel:        string          // nhãn hiển thị — VD 'Tuần 34/2026'
  tuNgay:         string
  denNgay:        string
  tongThu:        number
  tongChi:        number
  chenhLech:      number          // tongThu - tongChi trong kỳ
  tonQuyDauKy:    number          // cộng dồn — tương đối nếu chưa có soDuBanDau thật
  tonQuyCuoiKy:   number
  coMocThat:      boolean         // true nếu đã truyền soDuBanDau (tồn quỹ là số thật, không phải tương đối)
  chiTiet:        DongTienItem[]
}

// ── Hợp nhất nguồn nhập tay (Phần 1) + nguồn tự động hạn mức (Phần 2) ──
export function hopNhatDongTien(
  khoanNhapTay:   KhoanDongTien[],
  khoanTuDongHM:  DongTienItem[],
): DongTienItem[] {
  const tuTay = khoanNhapTay.map(tuKhoanDongTienRaItem)
  return [...tuTay, ...khoanTuDongHM].sort((a, b) => a.ngay.localeCompare(b.ngay))
}

// ── Lọc theo khoảng ngày (tuỳ chọn) ─────────────────────────
export function locTheoKhoangNgay(
  items: DongTienItem[],
  tuNgay?: string,
  denNgay?: string,
): DongTienItem[] {
  return items.filter(it => {
    if (tuNgay && it.ngay < tuNgay) return false
    if (denNgay && it.ngay > denNgay) return false
    return true
  })
}

// ── Date helpers (local, tránh lệch UTC — đồng bộ pattern han-muc-store) ──
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

/** Đầu tuần (Thứ 2) chứa ngày d */
function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7 // Mon=0 .. Sun=6
  return addDays(d, -dow)
}
/** Số tuần ISO (Mon-Sun, tuần đầu năm là tuần chứa thứ Năm đầu tiên) */
function isoWeekNumber(d: Date): { nam: number; tuan: number } {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const dow = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dow + 3) // nhảy tới thứ Năm của tuần này
  const firstThu = new Date(date.getFullYear(), 0, 4)
  const firstDow = (firstThu.getDay() + 6) % 7
  firstThu.setDate(firstThu.getDate() - firstDow + 3)
  const tuan = 1 + Math.round((date.getTime() - firstThu.getTime()) / (7 * 86400000))
  return { nam: date.getFullYear(), tuan }
}

/** Khoảng [đầu, cuối] + nhãn hiển thị của bucket chứa ngày `iso`, theo đơn vị thời gian */
function bucketRange(iso: string, donVi: DonViThoiGian): { tuNgay: string; denNgay: string; kyLabel: string; key: string } {
  const d = parseDate(iso)

  if (donVi === 'ngay') {
    const s = fmtDate(d)
    return { tuNgay: s, denNgay: s, kyLabel: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, key: s }
  }

  if (donVi === 'tuan') {
    const start = startOfWeek(d)
    const end   = addDays(start, 6)
    const { nam, tuan } = isoWeekNumber(d)
    return { tuNgay: fmtDate(start), denNgay: fmtDate(end), kyLabel: `Tuần ${tuan}/${nam}`, key: fmtDate(start) }
  }

  if (donVi === 'thang') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { tuNgay: fmtDate(start), denNgay: fmtDate(end), kyLabel: `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, key: fmtDate(start) }
  }

  // quy
  const q     = Math.floor(d.getMonth() / 3) // 0..3
  const start = new Date(d.getFullYear(), q * 3, 1)
  const end   = new Date(d.getFullYear(), q * 3 + 3, 0)
  return { tuNgay: fmtDate(start), denNgay: fmtDate(end), kyLabel: `Quý ${q + 1}/${d.getFullYear()}`, key: fmtDate(start) }
}

// ─────────────────────────────────────────────────────────
// ROLLUP — gom nhóm theo đơn vị thời gian, cộng dồn tồn quỹ
// ─────────────────────────────────────────────────────────
export function rollupTheoDonVi(
  items:        DongTienItem[],
  donVi:        DonViThoiGian,
  soDuBanDau?:  number,   // tuỳ chọn — số dư quỹ thật tại thời điểm đầu kỳ đầu tiên (chưa có, để sau)
): CashFlowBucket[] {
  if (items.length === 0) return []

  const map = new Map<string, { info: ReturnType<typeof bucketRange>; chiTiet: DongTienItem[] }>()
  items.forEach(it => {
    const info = bucketRange(it.ngay, donVi)
    if (!map.has(info.key)) map.set(info.key, { info, chiTiet: [] })
    map.get(info.key)!.chiTiet.push(it)
  })

  const keysDaSort = Array.from(map.keys()).sort()
  const coMocThat  = soDuBanDau != null
  let tonLuyKe     = soDuBanDau ?? 0

  return keysDaSort.map(key => {
    const { info, chiTiet } = map.get(key)!
    const tongThu   = chiTiet.filter(i => i.loai === 'thu').reduce((s, i) => s + i.soTien, 0)
    const tongChi   = chiTiet.filter(i => i.loai === 'chi').reduce((s, i) => s + i.soTien, 0)
    const chenhLech = tongThu - tongChi

    const tonQuyDauKy  = tonLuyKe
    const tonQuyCuoiKy = tonLuyKe + chenhLech
    tonLuyKe = tonQuyCuoiKy

    return {
      key, kyLabel: info.kyLabel, tuNgay: info.tuNgay, denNgay: info.denNgay,
      tongThu, tongChi, chenhLech, tonQuyDauKy, tonQuyCuoiKy, coMocThat,
      chiTiet: [...chiTiet].sort((a, b) => a.ngay.localeCompare(b.ngay)),
    }
  })
}
