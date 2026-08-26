import { Timestamp } from 'firebase/firestore'

export type NhomRow = 'section' | 'item'

export interface NganSachItem {
  id: string           // unique within a month doc
  nhom: string         // "A" | "B" | "C" | "D" section
  is_section: boolean  // true = major section header (A/B/C/D)
  is_group?: boolean   // true = collapsible sub-group header (I/II/III...)
  parent_id?: string   // set on detail rows that belong to a group
  stt: string          // "A", "B", "I", "II", "11", "12", etc.
  dien_giai: string
  kmcp: string
  ke_hoach: number
  thuc_hien: number    // auto from data_quy or manual
  thuc_hien_manual: boolean
  ghi_chu: string
  ngay_du_kien?: string  // ISO date "2026-07-15" — expected payment/receipt date
  done_override?: boolean // chỉnh tay: true = đã thu/chi xong (đè lên auto theo KMCP)
  roll_count?: number     // số lần khoản này đã bị dời sang kỳ sau vì quá hạn
}

export interface GiaiPhap {
  id: string
  mo_ta: string
  so_tien_ke_hoach: number
  so_tien_thuc_hien: number
  trang_thai: 'yes' | 'no' | 'pending'
  ghi_chu: string
}

export interface NganSachThang {
  thang: string        // "2026-07"
  ngay_cap_nhat: string
  items: NganSachItem[]
  giai_phap: GiaiPhap[]
  updatedAt?: Timestamp
}

// computed derived from items + giai_phap
export interface NganSachRow extends NganSachItem {
  con_lai: number      // ke_hoach - thuc_hien
}

// ── Mã KMCP vay ngân hàng — cả cột Kế hoạch (tự động từ module Hạn mức tín
// dụng, xem ngan-sach-vay-mapping.ts) LẪN cột Thực hiện (tự động từ sổ quỹ,
// xem buildVayActual() trong ngan-sach-mapping.ts) đều KHÔNG nhập tay được.
// Không đổi các mã này nếu không đồng thời sửa 2 file trên.
export const VAY_KMCP_CODES = ['THU-VAY', 'VAY-GOC-DN', 'VAY-LAI-DN', 'VAY-GOC-CN', 'VAY-LAI-CN', 'VAY-KHAC'] as const

// Default template items for a new month
export const DEFAULT_ITEMS: Omit<NganSachItem, 'id'>[] = [
  { nhom: 'A', is_section: true,  stt: 'A',  dien_giai: 'TỒN QUỸ',                         kmcp: '',        ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: '' },
  { nhom: 'B', is_section: true,  stt: 'B',  dien_giai: 'KẾ HOẠCH THU',                    kmcp: '',        ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: '' },
  { nhom: 'B', is_section: false, stt: '1',  dien_giai: 'Thu từ hoạt động kinh doanh',      kmcp: 'THU-KD',  ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'B', is_section: false, stt: '2',  dien_giai: 'Thu từ góp vốn',                  kmcp: 'THU-GV',  ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'B', is_section: false, stt: '3',  dien_giai: 'Thu khác',                        kmcp: 'THU-K',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'B', is_section: false, stt: '4',  dien_giai: 'Thu từ vay/đáo hạn ngân hàng',    kmcp: 'THU-VAY', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: 'Tự động — Hạn mức tín dụng + sổ quỹ' },
  { nhom: 'C', is_section: true,  stt: 'C',  dien_giai: 'KẾ HOẠCH CHI',                    kmcp: '',        ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '11', dien_giai: 'CPHD - Bảo hiểm',                 kmcp: 'CP-BH',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: 'Bảo hiểm' },
  { nhom: 'C', is_section: false, stt: '12', dien_giai: 'CPHD - Thuế, phí, lệ phí',        kmcp: 'CP-Thuế', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '13', dien_giai: 'CPHD - Hành chính',               kmcp: 'CP-HC',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '14', dien_giai: 'CPHD - Sinh hoạt',                kmcp: 'CP-SH',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '15', dien_giai: 'CPHD - Công tác',                 kmcp: 'CP-CT',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '16', dien_giai: 'CPHD - Tiếp khách',               kmcp: 'CP-TK',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '17', dien_giai: 'CPHD - Marketing, hội nghị, sự kiện', kmcp: 'CP-MAR', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true, ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '18', dien_giai: 'CPHD - Phí ngân hàng',            kmcp: 'CP-Bank', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '19', dien_giai: 'CPHD - Tất toán căn hộ tầng 21', kmcp: 'CP-TU',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '20', dien_giai: 'CPHD - Hoa hồng HĐ',             kmcp: 'CP-XL',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '21', dien_giai: 'Chi phí khác',                    kmcp: 'CP-KHAC', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '22', dien_giai: 'Chi trả tiền mượn',               kmcp: 'CP-VM',   ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: '' },
  { nhom: 'C', is_section: false, stt: '23', dien_giai: 'Trả gốc vay ngân hàng - Doanh nghiệp', kmcp: 'VAY-GOC-DN', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: 'Tự động — Hạn mức tín dụng + sổ quỹ' },
  { nhom: 'C', is_section: false, stt: '24', dien_giai: 'Trả lãi vay ngân hàng - Doanh nghiệp', kmcp: 'VAY-LAI-DN', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: 'Tự động — Hạn mức tín dụng + sổ quỹ' },
  { nhom: 'C', is_section: false, stt: '25', dien_giai: 'Trả gốc vay - Cá nhân đứng tên',  kmcp: 'VAY-GOC-CN', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: 'Tự động — Hạn mức tín dụng + sổ quỹ' },
  { nhom: 'C', is_section: false, stt: '26', dien_giai: 'Trả lãi vay - Cá nhân đứng tên',  kmcp: 'VAY-LAI-CN', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: 'Tự động — Hạn mức tín dụng + sổ quỹ' },
  { nhom: 'C', is_section: false, stt: '27', dien_giai: 'Vay khác (chưa xác định mã)',     kmcp: 'VAY-KHAC', ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: true,  ghi_chu: 'Pattern lịch sử tự do (NV_/Ngoai_/TTD_) — soát tay riêng' },
  { nhom: 'D', is_section: true,  stt: 'D',  dien_giai: 'THỪA/THIẾU TIỀN = A + B - C',    kmcp: '',        ke_hoach: 0, thuc_hien: 0, thuc_hien_manual: false, ghi_chu: '' },
]

export const DEFAULT_GIAI_PHAP: Omit<GiaiPhap, 'id'>[] = [
  { mo_ta: '', so_tien_ke_hoach: 0, so_tien_thuc_hien: 0, trang_thai: 'pending', ghi_chu: '' },
]