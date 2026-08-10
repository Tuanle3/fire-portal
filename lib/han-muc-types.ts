// ============================================================
// TYPES — Module Hạn mức tín dụng
// ============================================================
export type EntityType  = 'SAG' | 'SAHS' | 'ĐTSA' | 'YANA' | 'Cá nhân'
export type BankName    = 'Agribank' | 'ACB' | 'BIDV' | 'Vietinbank' | 'Khác'
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
export interface HopDongTinDung {
  id:              string
  soHopDong:       string
  entity:          EntityType
  nguoiVay?:       string
  nganHang:        BankName
  chiNhanh?:       string
  hanMuc:          number        // triệu đồng
  soTienGiaiNgan:  number
  laiSuat:         number        // %/năm
  phuongThuc:      PhuongThuc
  kyTra:           KyTra
  ngayKy:          string        // ISO date
  ngayDaoHan:      string
  trangThai:       TrangThaiHD
  ghiChu?:         string
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
