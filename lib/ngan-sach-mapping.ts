// Maps Nhóm_CP values from data_quy → KMCP budget codes
// Uses lowercase substring matching, so "CPHĐ - Phí ngân hàng" → "CP-Bank"
//
// ⚠️ BỔ SUNG (gộp module Test Dòng tiền → Ngân sách): các dòng vay ngân hàng
// (Nhánh A doanh nghiệp, Nhánh B cá nhân, hoặc pattern lịch sử tự do
// NV_/Ngoai_/TTD_) được nhận diện qua `parseMaNganSach()` (nguồn công thức
// chân lý dùng chung với module Hạn mức tín dụng — xem lib/ma-ngan-sach.ts)
// và bị LOẠI khỏi `buildKmcpActual()` để không đếm trùng — module Hạn mức
// tín dụng đã có kỳ trả nợ riêng, chính xác hơn theo từng hợp đồng. Dùng
// `buildVayActual()` (mới) để lấy số liệu Thực hiện riêng cho 5 mã KMCP vay
// (VAY-GOC-DN, VAY-LAI-DN, VAY-GOC-CN, VAY-LAI-CN, THU-VAY) — page.tsx merge
// kết quả này vào cùng object `kmcpActual` truyền xuống UI, nên TabTongHop /
// TabKeHoach không cần sửa gì thêm cho phần "Đã thực hiện" của 5 dòng này.
import { parseMaNganSach } from '@/lib/ma-ngan-sach'

interface MappingRule {
  kmcp: string
  keywords: string[]   // any of these substrings (lowercase) in Nhóm_CP → match
  isIncome?: boolean   // true = Thu row
}

export const KMCP_RULES: MappingRule[] = [
  // ── Chi phí hoạt động ──────────────────────────────────────────────────────
  { kmcp: 'CP-BH',   keywords: ['bảo hiểm', 'bao hiem'] },
  { kmcp: 'CP-Thuế', keywords: ['thuế', 'thue', 'lệ phí', 'le phi', 'môn bài', 'mon bai'] },
  { kmcp: 'CP-HC',   keywords: ['hành chính', 'hanh chinh', 'văn phòng phẩm', 'van phong pham'] },
  { kmcp: 'CP-SH',   keywords: ['sinh hoạt', 'sinh hoat', 'ăn uống', 'an uong', 'điện nước', 'dien nuoc'] },
  { kmcp: 'CP-CT',   keywords: ['công tác', 'cong tac', 'đi lại', 'di lai', 'xăng xe', 'xang xe', 'phương tiện', 'phuong tien'] },
  { kmcp: 'CP-TK',   keywords: ['tiếp khách', 'tiep khach', 'đối tác', 'doi tac'] },
  { kmcp: 'CP-MAR',  keywords: ['marketing', 'hội nghị', 'hoi nghi', 'sự kiện', 'su kien', 'quảng cáo', 'quang cao'] },
  { kmcp: 'CP-Bank', keywords: ['phí ngân hàng', 'phi ngan hang', 'phí sms', 'phi sms', 'phí dịch vụ', 'phi dich vu', 'phí chuyển', 'phi chuyen'] },
  { kmcp: 'CP-TU',   keywords: ['tất toán', 'tat toan', 'căn hộ', 'can ho', 'tầng 21', 'tang 21'] },
  { kmcp: 'CP-XL',   keywords: ['hoa hồng', 'hoa hong', 'môi giới', 'moi gioi', 'hợp đồng', 'hop dong'] },
  { kmcp: 'CP-VM',   keywords: ['tiền mượn', 'tien muon', 'trả ncc', 'tra ncc', 'trả công nợ', 'tra cong no', 'hoàn ứng', 'hoan ung'] },
  { kmcp: 'CP-KHAC', keywords: ['chi phí khác', 'chi phi khac', 'phát sinh', 'phat sinh', 'cp khác'] },

  // ── Thu nhập ───────────────────────────────────────────────────────────────
  { kmcp: 'THU-KD',  isIncome: true, keywords: ['kinh doanh', 'dịch vụ', 'dich vu', 'cho thuê', 'cho thue', 'bán hàng', 'ban hang'] },
  { kmcp: 'THU-GV',  isIncome: true, keywords: ['góp vốn', 'gop von', 'cổ đông', 'co dong', 'liên danh', 'lien danh'] },
  { kmcp: 'THU-K',   isIncome: true, keywords: ['thu khác', 'thu khac', 'nộp quỹ', 'nop quy', 'hoàn trả', 'hoan tra'] },
]

// Returns KMCP code or null if no match
export function matchKMCP(nhomCP: string, ghi_chu: string): string | null {
  const text = (nhomCP + ' ' + ghi_chu).toLowerCase()
  for (const rule of KMCP_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) return rule.kmcp
  }
  return null
}

// Chuẩn hoá tên key Firebase về dạng không dấu, không ký tự đặc biệt
function normalizeKey(k: string): string {
  return k.toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

// Tìm key theo normalized name — scan nhiều rows vì Firebase bỏ ô trống
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findKey(rows: any[], normTarget: string): string | undefined {
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const key = Object.keys(r).find(k => normalizeKey(k) === normTarget)
    if (key) return key
  }
  return undefined
}

// Build KMCP → total amount map from data_quy rows for a given month
// Chỉ tính "Thực hiện" cho các row có cột Loại = "Thực tế"
// ⚠️ Dòng vay ngân hàng (parseMaNganSach khớp) bị LOẠI khỏi hàm này — xem
// buildVayActual() bên dưới.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildKmcpActual(rows: any[], month: string): Record<string, number> {
  const result: Record<string, number> = {}
  const maNSKey  = findKey(rows, 'mangansach')  // cột M: Mã ngân sách
  const loaiKey  = findKey(rows, 'loai')        // cột L: Loại

  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay.startsWith(month)) continue

    // Chỉ lấy dòng "Thực tế", bỏ qua Nội bộ / Kế hoạch / các loại khác
    if (loaiKey) {
      const loai = String(r[loaiKey] ?? '').trim()
      if (loai && loai !== 'Thực tế') continue
    }

    const ps     = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
    const ghiChu = String(r['Ghi_chu'] ?? '')
    if (ghiChu === 'Dư đầu kỳ' || ghiChu === 'Dư cuối kỳ') continue

    const maNS  = maNSKey ? String(r[maNSKey] ?? '').trim() : ''

    // ── Dòng vay NH (Nhánh A/B hoặc pattern lịch sử tự do) — loại khỏi tổng
    //     KMCP thường, xem riêng qua buildVayActual() để tránh đếm 2 lần ──
    if (maNS && parseMaNganSach(maNS)) continue

    const nhomCP = String(r['Nhóm_CP'] ?? r['Nhom_CP'] ?? '')
    const kmcp  = maNS || matchKMCP(nhomCP, ghiChu)
    if (!kmcp) continue

    result[kmcp] = (result[kmcp] ?? 0) + Math.abs(ps)
  }

  return result
}

// Build map "Đã thực hiện" RIÊNG cho 5 mã KMCP vay ngân hàng (khai báo ở
// DEFAULT_ITEMS trong ngan-sach-types.ts), khớp qua parseMaNganSach() —
// dùng CHUNG công thức mã với module Hạn mức tín dụng nên không lệch số.
// Dòng "xacDinh: false" (pattern lịch sử tự do NV_/Ngoai_/TTD_) gom vào
// 'VAY-KHAC' — đại ca cần soát tay riêng, không tự động khớp được.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildVayActual(rows: any[], month: string): Record<string, number> {
  const result: Record<string, number> = {}
  const maNSKey = findKey(rows, 'mangansach')
  const loaiKey = findKey(rows, 'loai')

  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay.startsWith(month)) continue
    if (loaiKey) {
      const loai = String(r[loaiKey] ?? '').trim()
      if (loai && loai !== 'Thực tế') continue
    }

    const maNS = maNSKey ? String(r[maNSKey] ?? '').trim() : ''
    if (!maNS) continue
    const parsed = parseMaNganSach(maNS)
    if (!parsed) continue

    const ps = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
    let kmcp: string
    if (!parsed.xacDinh) {
      kmcp = 'VAY-KHAC'
    } else if (parsed.loaiKhoan === 'thu-giai-ngan') {
      kmcp = 'THU-VAY'
    } else if (parsed.nhanh === 'ca-nhan') {
      kmcp = parsed.loaiKhoan === 'lai' ? 'VAY-LAI-CN' : 'VAY-GOC-CN'
    } else {
      kmcp = parsed.loaiKhoan === 'lai' ? 'VAY-LAI-DN' : 'VAY-GOC-DN'
    }
    result[kmcp] = (result[kmcp] ?? 0) + Math.abs(ps)
  }

  return result
}

// Tồn quỹ đầu kỳ: sum Tồn của các dòng "Dư đầu kỳ" trong tháng được chọn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTonDauKy(rows: any[], month: string): number {
  // Method 1: explicit "Dư đầu kỳ" rows for this month
  const byAccount = new Map<string, number>()
  for (const r of rows) {
    const ngay   = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay.startsWith(month)) continue
    const ghiChu = String(r['Ghi_chu'] ?? '')
    if (ghiChu !== 'Dư đầu kỳ') continue
    const stk = String(r['Số_tài_khoản'] ?? r['So_tai_khoan'] ?? '')
    const ton = Number(r['Tồn'] ?? r['Ton'] ?? 0)
    if (stk) byAccount.set(stk, ton)
  }
  if (byAccount.size > 0) {
    let total = 0; byAccount.forEach(v => { total += v }); return total
  }
  // Method 2: fallback — last known Tồn per account strictly before this month.
  // Phải sort theo ngày trước, vì "last row per account" theo thứ tự mảng gốc
  // có thể lấy nhầm số Tồn cũ (không phải mới nhất).
  const sorted = [...rows].sort((a, b) =>
    String(a['Ngày'] ?? a['Ngay'] ?? '').localeCompare(String(b['Ngày'] ?? b['Ngay'] ?? '')))
  const fallback = new Map<string, number>()
  for (const r of sorted) {
    const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay || ngay >= month) continue  // skip current month and future
    const stk = String(r['Số_tài_khoản'] ?? r['So_tai_khoan'] ?? '')
    const ton = Number(r['Tồn'] ?? r['Ton'] ?? 0)
    if (stk) fallback.set(stk, ton)  // keep overwriting → last row per account = latest balance
  }
  let total = 0; fallback.forEach(v => { total += v }); return total
}

// Số dư quỹ theo Tồn THỰC TẾ cho khoảng tháng [startMi..endMi] (0-based) trong 1 năm.
// Dùng ĐÚNG thuật toán số dư của Dashboard CEO (sort theo ngày → chạy running "Tồn"
// theo từng tài khoản) để hai màn hình luôn đối chiếu khớp nhau.
//   opening = tổng Tồn cuối tháng (startMi − 1) = số dư đầu kỳ.
//   closing = tổng Tồn cuối tháng endMi        = số dư cuối kỳ thực tế (sổ quỹ).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTonKy(rows: any[], year: number, startMi: number, endMi: number): { opening: number; closing: number } {
  const yPrefix = `${year}-`
  const dateOf = (r: any) => String(r['Ngày'] ?? r['Ngay'] ?? '')  // eslint-disable-line @typescript-eslint/no-explicit-any
  const stkOf  = (r: any) => String(r['Số_tài_khoản'] ?? r['So_tai_khoan'] ?? '')  // eslint-disable-line @typescript-eslint/no-explicit-any
  const tonOf  = (r: any) => Number(r['Tồn'] ?? r['Ton'] ?? 0)  // eslint-disable-line @typescript-eslint/no-explicit-any

  const sorted = [...rows].sort((a, b) => dateOf(a).localeCompare(dateOf(b)))

  // Đầu năm: Tồn cuối cùng của mỗi TK trước năm `year`
  const openAcc = new Map<string, number>()
  for (const r of sorted) {
    if (dateOf(r) >= yPrefix) break
    const stk = stkOf(r)
    if (stk) openAcc.set(stk, tonOf(r))
  }
  const yearRows = sorted.filter(r => dateOf(r).startsWith(yPrefix))
  const sumTon = (m: Map<string, number>) => { let s = 0; m.forEach(v => { s += v }); return s }

  // Tổng Tồn tới hết tháng `targetMi` (0-based). targetMi < 0 → số dư đầu năm.
  const tonThrough = (targetMi: number) => {
    if (targetMi < 0) return sumTon(openAcc)
    const t = new Map(openAcc)
    for (const r of yearRows) {
      const mi = parseInt(dateOf(r).slice(5, 7)) - 1
      if (mi > targetMi) break  // yearRows đã sort tăng dần → tháng không giảm
      const stk = stkOf(r)
      if (stk) t.set(stk, tonOf(r))
    }
    return sumTon(t)
  }

  return { opening: tonThrough(startMi - 1), closing: tonThrough(endMi) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sumChiThang(rows: any[], month: string, loaiKey?: string): number {
  let total = 0
  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? '')
    if (!ngay.startsWith(month)) continue
    if (loaiKey) { const l = String(r[loaiKey] ?? '').trim(); if (l && l !== 'Thực tế') continue }
    const ghiChu = String(r['Ghi_chu'] ?? '')
    const ps     = Number(r['Số_tiền_PS'] ?? 0)
    if (ghiChu === 'Chi' || ps < 0) total += Math.abs(ps)
  }
  return total
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sumThuThang(rows: any[], month: string, loaiKey?: string): number {
  let total = 0
  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? '')
    if (!ngay.startsWith(month)) continue
    if (loaiKey) { const l = String(r[loaiKey] ?? '').trim(); if (l && l !== 'Thực tế') continue }
    const ghiChu = String(r['Ghi_chu'] ?? '')
    const ps     = Number(r['Số_tiền_PS'] ?? 0)
    if (ghiChu === 'Thu' || ps > 0) total += Math.abs(ps)
  }
  return total
}