// ─── Types cho module SAP - Thi công ────────────────────────────
// Mỗi dự án (SapProject) có danh mục riêng: hangMuc / dongTien / vatTu /
// nhaThau (+ nghiemThu con) / khoanVay (+ kyTraNo con) / nguonVon / doiTac.
//
// NGUYÊN TẮC LIÊN KẾT DỮ LIỆU (tránh nhập trùng, dễ tổng hợp):
//   1. Gói thầu lớn → chia nhỏ thành Hạng mục (cây cha-con qua parentId).
//   2. Mỗi Hạng mục có thể do 1 hoặc nhiều Nhà thầu phụ đảm nhận (liên kết
//      nhiều-nhiều qua NhaThau.hangMucIds), hoặc để trống = tự thi công.
//   3. Nhà thầu phụ & Nhà cung cấp vật tư dùng chung 1 danh mục Đối tác
//      (DoiTac) — chọn từ danh mục thay vì gõ tay lặp lại nhiều nơi.
//   4. Mọi khoản thanh toán/giải ngân có dòng tiền (paid/paidAmount/amount)
//      đều tự động sinh 1 bản ghi Dòng tiền tương ứng (auto:true), lưu id
//      hai chiều qua `dongTienId` / `sourceId` để sửa/xoá luôn đồng bộ,
//      không phải nhập lại thủ công ở tab Dòng tiền.
//
// Toàn bộ lưu trong Firestore theo path:
//   sapThiCongProjects/{projectId}
//   sapThiCongProjects/{projectId}/hangMuc/{id}
//   sapThiCongProjects/{projectId}/dongTien/{id}
//   sapThiCongProjects/{projectId}/vatTu/{id}
//   sapThiCongProjects/{projectId}/nhaThau/{id}
//   sapThiCongProjects/{projectId}/nhaThau/{id}/nghiemThu/{id}
//   sapThiCongProjects/{projectId}/khoanVay/{id}
//   sapThiCongProjects/{projectId}/khoanVay/{id}/kyTraNo/{id}
//   sapThiCongProjects/{projectId}/nguonVon/{id}
//   sapThiCongProjects/{projectId}/doiTac/{id}

export type ProjectStatus = 'active' | 'upcoming' | 'done'

export type SapProject = {
  id: string
  name: string
  code?: string
  address?: string
  scope?: string
  contractValue?: number   // tổng mức đầu tư (đ)
  startDate?: string       // yyyy-mm-dd
  endDate?: string
  status: ProjectStatus
  createdAt?: number
}

// ─── Đối tác (dùng chung cho Nhà thầu phụ & Nhà cung cấp vật tư) ─
export type DoiTacType = 'nha-thau' | 'ncc' | 'khac'

export type DoiTac = {
  id: string
  name: string
  type: DoiTacType
  phone?: string
  contact?: string   // người liên hệ
  taxCode?: string
  address?: string
  note?: string
}

export const DOI_TAC_TYPE_LABEL: Record<DoiTacType, string> = {
  'nha-thau': 'Nhà thầu phụ',
  'ncc': 'Nhà cung cấp vật tư',
  'khac': 'Khác',
}

export type HangMucStatus = 'todo' | 'active' | 'done' | 'delay'

export type HangMuc = {
  id: string
  name: string
  parentId?: string | null
  startDate?: string
  endDate?: string
  progressPct: number
  status: HangMucStatus
  order?: number
  note?: string
}

// ─── Dòng tiền ──────────────────────────────────────────────────
export type DongTienType = 'thu' | 'chi'

// Nguồn phát sinh khi 1 dòng tiền được HỆ THỐNG tự tạo ra (không phải nhập tay)
export type DongTienSourceType = 'nghiem-thu' | 'vat-tu' | 'khoan-vay' | 'ky-tra-no'

export type DongTienItem = {
  id: string
  date: string
  type: DongTienType
  category: string
  amount: number
  doiTacId?: string        // đối tác liên quan (nếu có), để lọc/tổng hợp theo đối tác
  hangMucId?: string       // hạng mục thi công liên quan (nếu có), để tổng hợp thu/chi theo hạng mục
  note?: string
  // Đánh dấu bản ghi được tự động sinh ra từ nghiệp vụ khác (nghiệm thu, vật
  // tư, giải ngân vay, trả nợ) — không sửa/xoá trực tiếp ở đây, phải thao
  // tác tại màn hình nguồn để tránh lệch số liệu.
  auto?: boolean
  sourceType?: DongTienSourceType
  sourceId?: string        // id bản ghi nguồn (nghiemThu/vatTu/khoanVay/kyTraNo)
  sourceParentId?: string  // id cha của nguồn nếu là danh mục lồng nhau (vd nhaThau.id, khoanVay.id)
}

export type VatTuItem = {
  id: string
  name: string
  unit: string
  qtyPlanned: number
  qtyUsed: number
  unitPrice: number      // đơn giá CHƯA VAT
  vatPercent?: number    // thuế suất VAT (%) — 0/5/8/10 hoặc % nhập tay khác, mặc định coi là 0 nếu chưa có (dữ liệu cũ)
  vatAmount?: number     // số tiền thuế VAT (đ) — tự tính theo vatPercent, nhưng có thể gõ tay đè lên nếu lệch số làm tròn với hoá đơn thực tế
  soHopDong?: string
  hangMucId?: string   // hạng mục thi công dùng vật tư này (nếu có) — để biết chi phí vật tư thuộc hạng mục nào
  doiTacId?: string    // liên kết Đối tác (NCC) — ưu tiên dùng thay cho `supplier` tự do
  supplier?: string    // tên NCC hiển thị (đồng bộ theo doiTacId nếu có, hoặc nhập tay cho dữ liệu cũ)
  paidAmount: number   // đã thanh toán cho NCC — tự động đồng bộ 1 dòng "chi" tương ứng
  dongTienId?: string  // id bản ghi Dòng tiền tự động tạo cho khoản đã thanh toán ở trên
  date?: string
  note?: string
}

export type NghiemThuStatus = 'done' | 'pending'

export type NghiemThu = {
  id: string
  dot: string
  bbNo?: string
  bbDate?: string
  invNo?: string
  invDate?: string
  value: number          // giá trị nghiệm thu CHƯA VAT
  vatPercent?: number    // thuế suất VAT (%) của đợt này — mặc định lấy theo NhaThau.vatPercent, coi là 0 nếu chưa có (dữ liệu cũ)
  vatAmount?: number     // số tiền thuế VAT (đ) — tự tính theo vatPercent, có thể gõ tay đè lên nếu lệch số làm tròn với hoá đơn thực tế
  retainPct: number
  retain: number
  netPayable: number
  paid: number
  khoanVayId?: string   // liên kết đợt giải ngân ngân hàng tài trợ cho khoản TT này
  dongTienId?: string   // id bản ghi Dòng tiền "chi" tự động tạo cho khoản `paid` ở trên
  status: NghiemThuStatus
  note?: string
}

export type NhaThauStatus = 'active' | 'done' | 'paused'

export type NhaThau = {
  id: string
  doiTacId?: string        // liên kết danh mục Đối tác (nếu chọn từ danh mục thay vì gõ tay)
  name: string
  scope?: string
  hangMucIds?: string[]    // các hạng mục thi công mà nhà thầu này phụ trách (nhiều-nhiều)
  soHopDong?: string
  contractValue: number   // giá trị hợp đồng CHƯA VAT
  vatPercent?: number     // thuế suất VAT (%) mặc định của hợp đồng — coi là 0 nếu chưa có (dữ liệu cũ)
  vatAmount?: number      // số tiền thuế VAT (đ) — tự tính theo vatPercent, có thể gõ tay đè lên nếu lệch số làm tròn với hoá đơn thực tế
  retainPct: number
  status: NhaThauStatus
}

export type KhoanVay = {
  id: string
  batch: string
  date: string
  amount: number
  bank?: string
  interestRate?: number
  dongTienId?: string   // id bản ghi Dòng tiền "thu" tự động tạo khi giải ngân
  note?: string
}

export type KyTraNo = {
  id: string
  dueDate: string
  goc: number
  lai: number
  paid: boolean
  dongTienId?: string   // id bản ghi Dòng tiền "chi" tự động tạo khi đánh dấu đã trả
}

export type NguonVonType = 'von-tu-co' | 'vay' | 'khac'

export type NguonVon = {
  id: string
  source: string
  type: NguonVonType
  amount: number
  note?: string
}

export const SAP_TABS = [
  { id: 'tien-do',   label: 'Tiến độ' },
  { id: 'dong-tien', label: 'Dòng tiền' },
  { id: 'vat-tu',    label: 'Vật tư' },
  { id: 'nha-thau',  label: 'Nhà thầu phụ' },
  { id: 'doi-tac',   label: 'Đối tác' },
  { id: 'vay',       label: 'Vay & giải ngân' },
  { id: 'nguon-von', label: 'Nguồn vốn' },
  { id: 'hieu-qua',  label: 'Hiệu quả' },
] as const

export type SapTab = typeof SAP_TABS[number]['id']

export const fmt = (n?: number) => (n ?? 0).toLocaleString('vi-VN')
