// ── Types & label maps cho module Ngân hàng ──────────────────────────────────

export interface BankContact {
  ten: string
  chucVu: string
  sdt: string
  email: string
}

export type BankDanhGia = 'tot' | 'binh_thuong' | 'can_cai_thien'
export type BankTrangThai = 'dang_hop_tac' | 'tiem_nang' | 'ngung_hop_tac'
export type LoaiHinhDoiTac = 'ngan_hang' | 'cong_ty_tai_chinh' | 'cho_thue_tai_chinh'

export interface BankRelation {
  id: string
  tenNganHang: string
  chiNhanh: string
  loaiHinh: LoaiHinhDoiTac
  nguoiLienHe: BankContact[]
  danhGia: BankDanhGia
  trangThai: BankTrangThai
  hanMucHienTai: number
  duNoHienTai: number
  laiSuatBinhQuan: number
  ghiChuChung: string
  updatedAt: string
}

// Loại vay/tài trợ — bao gồm cả các hình thức tài trợ phi ngân hàng (leasing...)
export type LoaiVay = 'ngan_han' | 'trung_dai_han' | 'bao_lanh' | 'thau_chi' | 'tai_tro_mua_hang'
// Trạng thái/tiến trình xử lý hồ sơ vay vốn — dùng chung cho cả so sánh phương án
// LẪN theo dõi tiến độ hồ sơ hằng ngày (soạn hồ sơ → nộp → thẩm định → duyệt → giải ngân).
export type TrangThaiPhuongAn =
  | 'soan_ho_so' | 'da_nop' | 'dang_tham_dinh' | 'cho_phe_duyet'
  | 'da_duyet' | 'da_giai_ngan' | 'tu_choi' | 'het_han'

// 1 bậc lãi suất ưu đãi theo kỳ hạn, vd { kyHan: "12 tháng", laiSuat: 9 }
export interface LaiSuatBac {
  kyHan: string
  laiSuat: number
}

// Dòng tiêu chí tự thêm — cho các đặc thù không nằm trong bộ trường chuẩn
// (vd đối tác cho thuê tài chính không có khái niệm TSĐB kiểu ngân hàng)
export interface CustomRow {
  id: string
  label: string
  noiDung: string
}

export interface BankProposal {
  id: string
  nganHangId: string
  tenPhuongAn: string
  loaiVay: LoaiVay
  thoiHan: string                 // Ẩn hạn / kỳ hạn vay, vd "2-5 năm tùy nhu cầu KH"
  ngayNopHoSo: string             // ngày nộp hồ sơ (để trống nếu chưa nộp)
  laiSuatBacThang: LaiSuatBac[]    // lãi suất ưu đãi theo từng kỳ hạn cố định
  laiSuatThaNoi: string           // công thức thả nổi sau ưu đãi, vd "LS huy động + 1,5%"
  hanMucDeXuat: number            // hạn mức/mức tài trợ tuyệt đối (đ) — để 0 nếu không áp dụng
  mucTaiTroMoTa: string           // mô tả mức tài trợ khi không phải số tuyệt đối, vd "80-100% giá trị mua bán"
  tyLeTSDB: number
  tsdbDieuKien: string            // TSĐB yêu cầu / điều kiện chấp nhận
  tsdbTuChoi: string              // TSĐB từ chối / loại trừ
  hoTroDacBiet: string            // vd hỗ trợ mượn tách sổ, hỗ trợ chuyển đổi chủ vay
  phuongThucTT: string            // phương thức thanh toán/trả nợ
  phiDichVu: string
  dieuKien: string                // điều kiện khác
  uuDiem: string[]
  nhuocDiem: string[]
  customRows: CustomRow[]
  trangThai: TrangThaiPhuongAn
  nguoiPhuTrach: string
  ngayCapNhat: string
}

// Tiến độ từng hạng mục trong checklist của 1 ghi chú — vd "đã cung cấp giải trình công nợ" hay chưa.
export type TienDoHangMuc = 'da_cung_cap' | 'chua_thuc_hien' | 'chua_xac_nhan'

export interface HangMuc {
  id: string
  noiDung: string
  tienDo: TienDoHangMuc
}

export interface BankNote {
  id: string
  nganHangId: string
  ngay: string
  nguoiLienHe: string
  hangMuc: HangMuc[]       // checklist các yêu cầu/hạng mục ngân hàng đưa ra, mỗi dòng tự có tiến độ riêng
  danhGiaChung: string     // đánh giá chung / ghi chú tổng cho lần cập nhật này
  viecCanLam: string
  hanXuLy: string
  nguoiPhuTrach: string
}

// ── Label maps ────────────────────────────────────────────────────────────

export const DANH_GIA_LABEL: Record<BankDanhGia, string> = {
  tot: 'Tốt',
  binh_thuong: 'Bình thường',
  can_cai_thien: 'Cần cải thiện',
}

export const TRANG_THAI_NH_LABEL: Record<BankTrangThai, string> = {
  dang_hop_tac: 'Đang hợp tác',
  tiem_nang: 'Tiềm năng',
  ngung_hop_tac: 'Ngừng hợp tác',
}

export const LOAI_HINH_LABEL: Record<LoaiHinhDoiTac, string> = {
  ngan_hang: 'Ngân hàng thương mại',
  cong_ty_tai_chinh: 'Công ty tài chính',
  cho_thue_tai_chinh: 'Cho thuê tài chính (Leasing)',
}

export const LOAI_VAY_LABEL: Record<LoaiVay, string> = {
  ngan_han: 'Ngắn hạn',
  trung_dai_han: 'Trung dài hạn',
  bao_lanh: 'Bảo lãnh',
  thau_chi: 'Thấu chi',
  tai_tro_mua_hang: 'Tài trợ mua hàng/Leasing',
}

export const TRANG_THAI_PA_LABEL: Record<TrangThaiPhuongAn, string> = {
  soan_ho_so: 'Đang soạn hồ sơ',
  da_nop: 'Đã nộp hồ sơ',
  dang_tham_dinh: 'Đang thẩm định',
  cho_phe_duyet: 'Chờ phê duyệt',
  da_duyet: 'Đã duyệt',
  da_giai_ngan: 'Đã giải ngân',
  tu_choi: 'Từ chối',
  het_han: 'Hết hạn',
}

export const TIEN_DO_HM_LABEL: Record<TienDoHangMuc, string> = {
  da_cung_cap: 'Đã cung cấp',
  chua_thuc_hien: 'Chưa thực hiện',
  chua_xac_nhan: 'Chưa xác nhận',
}

export const EMPTY_BANK: Omit<BankRelation, 'id' | 'updatedAt'> = {
  tenNganHang: '', chiNhanh: '', loaiHinh: 'ngan_hang', nguoiLienHe: [], danhGia: 'binh_thuong',
  trangThai: 'dang_hop_tac', hanMucHienTai: 0, duNoHienTai: 0, laiSuatBinhQuan: 0, ghiChuChung: '',
}

export const EMPTY_PROPOSAL: Omit<BankProposal, 'id' | 'nganHangId' | 'ngayCapNhat'> = {
  tenPhuongAn: '', loaiVay: 'ngan_han', thoiHan: '', ngayNopHoSo: '',
  laiSuatBacThang: [], laiSuatThaNoi: '',
  hanMucDeXuat: 0, mucTaiTroMoTa: '', tyLeTSDB: 0,
  tsdbDieuKien: '', tsdbTuChoi: '', hoTroDacBiet: '', phuongThucTT: '',
  phiDichVu: '', dieuKien: '', uuDiem: [], nhuocDiem: [], customRows: [],
  trangThai: 'soan_ho_so', nguoiPhuTrach: '',
}

export const EMPTY_NOTE: Omit<BankNote, 'id' | 'nganHangId'> = {
  ngay: new Date().toISOString().slice(0, 10), nguoiLienHe: '', hangMuc: [], danhGiaChung: '',
  viecCanLam: '', hanXuLy: '', nguoiPhuTrach: '',
}

// ── Helpers dùng chung cho so sánh (UI + xuất Word) ──────────────────────────

// Lãi suất ưu đãi thấp nhất trong các bậc — dùng để highlight "tốt nhất" khi so sánh.
export function minLaiSuat(p: BankProposal): number {
  const vals = p.laiSuatBacThang.map(b => b.laiSuat).filter(v => v > 0)
  return vals.length ? Math.min(...vals) : 0
}

// Hiển thị lãi suất dạng nhiều dòng: từng bậc kỳ hạn + công thức thả nổi sau ưu đãi.
export function laiSuatDisplay(p: BankProposal): string {
  const lines = p.laiSuatBacThang
    .filter(b => b.kyHan.trim() || b.laiSuat)
    .map(b => `${b.kyHan.trim() || '—'}: ${b.laiSuat ? b.laiSuat.toFixed(2) + '%' : '—'}`)
  if (p.laiSuatThaNoi.trim()) lines.push(`Sau ưu đãi: ${p.laiSuatThaNoi.trim()}`)
  return lines.length ? lines.join('\n') : '—'
}

// Tập hợp (không trùng lặp, không phân biệt hoa/thường) các nhãn dòng tuỳ chỉnh
// xuất hiện ở bất kỳ phương án nào trong danh sách — dùng để dựng thêm hàng động
// trong bảng so sánh khi các phương án có tiêu chí đặc thù khác nhau.
export function customRowLabels(props: BankProposal[]): string[] {
  const seen = new Map<string, string>()
  for (const p of props) {
    for (const cr of p.customRows) {
      const key = cr.label.trim().toLowerCase()
      if (key && !seen.has(key)) seen.set(key, cr.label.trim())
    }
  }
  return [...seen.values()]
}

export function customRowValue(p: BankProposal, label: string): string {
  const key = label.trim().toLowerCase()
  return p.customRows.find(cr => cr.label.trim().toLowerCase() === key)?.noiDung.trim() || '—'
}

// Hồ sơ còn "đang xử lý" = chưa tới điểm dừng (đã giải ngân/từ chối/hết hạn) — dùng để lọc
// báo cáo hồ sơ vay vốn hằng ngày (chỉ liệt kê hồ sơ còn cần theo dõi tiếp).
const HO_SO_DA_XONG: TrangThaiPhuongAn[] = ['da_giai_ngan', 'tu_choi', 'het_han']
export function isHoSoDangXuLy(trangThai: TrangThaiPhuongAn): boolean {
  return !HO_SO_DA_XONG.includes(trangThai)
}

// Mức tài trợ hiển thị: ưu tiên số tuyệt đối (đ), kèm mô tả (vd "80-100% giá trị mua bán") nếu có.
export function mucTaiTroDisplay(p: BankProposal, fmtN: (n: number) => string): string {
  const parts: string[] = []
  if (p.hanMucDeXuat) parts.push(fmtN(p.hanMucDeXuat) + ' đ')
  if (p.mucTaiTroMoTa.trim()) parts.push(p.mucTaiTroMoTa.trim())
  return parts.length ? parts.join(' · ') : '—'
}
