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

// Build KMCP → total amount map from data_quy rows for a given month
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildKmcpActual(rows: any[], month: string): Record<string, number> {
  const result: Record<string, number> = {}

  for (const r of rows) {
    const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
    if (!ngay.startsWith(month)) continue

    const ps       = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
    const nhomCP   = String(r['Nhóm_CP'] ?? r['Nhom_CP'] ?? '')
    const ghiChu   = String(r['Ghi_chu'] ?? '')
    const loai     = ghiChu  // "Thu" | "Chi" | "Dư đầu kỳ"

    if (loai === 'Dư đầu kỳ' || loai === 'Dư cuối kỳ') continue

    const kmcp = matchKMCP(nhomCP, ghiChu)
    if (!kmcp) continue

    const amount = Math.abs(ps)
    result[kmcp] = (result[kmcp] ?? 0) + amount
  }

  return result
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
