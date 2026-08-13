// ============================================================
// TYPES — Module Hạn mức tín dụng
// ============================================================
export type EntityType  = 'SAG' | 'SAHS' | 'ĐTSA' | 'YANA' | 'Cá nhân'
export type BankName =
  | 'Agribank' | 'Vietcombank' | 'BIDV' | 'Vietinbank'
  | 'ACB' | 'MB Bank' | 'Techcombank' | 'VPBank' | 'Sacombank'
  | 'HDBank' | 'VIB' | 'TPBank' | 'MSB' | 'SeABank' | 'LPBank'
  | 'OCB' | 'SHB' | 'Eximbank' | 'Nam A Bank' | 'NCB'
  | 'ABBank' | 'BacABank' | 'BaoViet Bank' | 'CBBank' | 'PGBank'
  | 'VietBank' | 'VietABank' | 'KienlongBank' | 'Vikki Bank'
  | 'Chailease' | 'Khác'
export type PhuongThuc  = 'giam-dan' | 'cuoi-ky'
export type KyTra       = 'monthly'  | 'quarterly'
export type TrangThaiHD =
  | 'dang-vay'
  | 'binh-thuong'
  | 'gan-dao-han'
  | 'qua-han'
  | 'tat-toan'
export type TrangThaiKy =
  | 'chua-tra'
  | 'gan-han'
  | 'qua-han'
  | 'da-tra'
  | 'co-cau'
export type CoCauOption = 'gia-han' | 'giam-ls' | 'von-hoa-lai'
export type LaiSuatLoai = 'co-dinh' | 'tha-noi'
export interface HopDongTinDung {
  id:              string
  soHopDong:       string
  entity:          EntityType
  nguoiVay?:       string
  nganHang:        BankName
  chiNhanh?:       string
  hanMuc:           number        // đồng (VNĐ) — không còn là triệu
  soTienGiaiNgan:   number        // đồng (VNĐ)
  laiSuat:          number        // %/năm — lãi suất cố định, hoặc lãi ưu đãi nếu thả nổi
  laiSuatLoai:      LaiSuatLoai
  soThangUuDai?:    number        // chỉ dùng khi thả nổi
  laiSuatSauUuDai?: number        // %/năm — chỉ dùng khi thả nổi
  phuongThuc:      PhuongThuc
  kyTra:           KyTra
  ngayKy:          string        // ISO date
  ngayDaoHan:      string
  trangThai:       TrangThaiHD
  ghiChu?:         string
  gocTraCoDinh?:   number        // gốc làm tròn do NH quy định — nếu có sẽ override gốc tự tính
  createdAt:       number
  updatedAt:       number
}
export interface KyTraNo {
  id:              string
  hopDongId:       string
  soKy:            number
  ngayTra:         string
  dunNoDauKy:      number
  gocTra:          number
  laiTra:          number
  tongTra:         number
  dunNoCuoiKy:     number
  trangThai:       TrangThaiKy
  ngayThucTra?:    string
  soTienThucTra?:  number
  gocThucTra?:     number   // gốc thực trả — có thể lệch với gocTra kế hoạch
  laiThucTra?:     number   // lãi thực trả — có thể lệch với laiTra kế hoạch
  coCauId?:        string
}
export interface CoCauNo {
  id:              string
  hopDongId:       string
  tuKy:            number
  option:          CoCauOption
  giaHanThang?:    number
  ngayDaoHanMoi?:  string
  laiSuatMoi?:     number
  laiVonHoa?:      number
  gocMoi?:         number
  dunNoTruoc:      number
  laiKyTruoc:      number
  dunNoSau:        number
  laiKySau:        number
  ngayTao:         string
  ghiChu?:         string
  createdAt:       number
}