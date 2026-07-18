// Maps Nhóm_CP values from data_quy → KMCP budget codes
// Uses lowercase substring matching, so "CPHĐ - Phí ngân hàng" → "CP-Bank"

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

// Tìm key cột "Mã ngân sách" — scan qua nhiều rows vì Firebase bỏ qua ô trống
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findMaNSKey(rows: any[]): string | undefined {
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const key = Object.keys(r).find(k => {
      const n = normalizeKey(k)
      return n === 'mangansach' || n === 'mansach' || n === 'mangansach'
    })
    if (key) return key  // dừng ngay khi tìm được (row này có cột M)
  }
  return undefined
}

// Build KMCP → total amount map from data_quy rows for a given month
// Đọc trực tiếp cột "Mã ngân sách" (tìm key tự động); fallback về keyword matching nếu ô trống
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildKmcpActual(rows: any[], month: string): Record<string, number> {
  const result: Record<string, number> = {}
  const maNSKey = findMaNSKey(rows)  // tìm key một lần cho toàn bộ rows

  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay.startsWith(month)) continue

    const ps     = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
    const ghiChu = String(r['Ghi_chu'] ?? '')

    if (ghiChu === 'Dư đầu kỳ' || ghiChu === 'Dư cuối kỳ') continue

    // Ưu tiên cột "Mã ngân sách" (key tìm động); fallback về keyword matching
    const maNS = maNSKey ? String(r[maNSKey] ?? '').trim() : ''
    const nhomCP = String(r['Nhóm_CP'] ?? r['Nhom_CP'] ?? '')
    const kmcp = maNS || matchKMCP(nhomCP, ghiChu)
    if (!kmcp) continue

    result[kmcp] = (result[kmcp] ?? 0) + Math.abs(ps)
  }

  return result
}

// Tồn quỹ đầu kỳ: sum Tồn của các dòng "Dư đầu kỳ" trong tháng được chọn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTonDauKy(rows: any[], month: string): number {
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
  let total = 0
  byAccount.forEach(v => { total += v })
  return total
}

// Sum total Chi (operating expenses only, Group starts with "1.")
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sumChiThang(rows: any[], month: string): number {
  let total = 0
  for (const r of rows) {
    const ngay  = String(r['Ngày'] ?? '')
    if (!ngay.startsWith(month)) continue
    const ghiChu = String(r['Ghi_chu'] ?? '')
    const ps     = Number(r['Số_tiền_PS'] ?? 0)
    if (ghiChu === 'Chi' || ps < 0) total += Math.abs(ps)
  }
  return total
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sumThuThang(rows: any[], month: string): number {
  let total = 0
  for (const r of rows) {
    const ngay  = String(r['Ngày'] ?? '')
    if (!ngay.startsWith(month)) continue
    const ghiChu = String(r['Ghi_chu'] ?? '')
    const ps     = Number(r['Số_tiền_PS'] ?? 0)
    if (ghiChu === 'Thu' || ps > 0) total += Math.abs(ps)
  }
  return total
}
