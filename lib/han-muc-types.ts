// ============================================================
// TYPES — Module Hạn mức tín dụng
// ============================================================
// EntityType: liệt kê các pháp nhân đã biết để gợi ý/autocomplete, nhưng
// vẫn nhận bất kỳ chuỗi nào (pháp nhân tuỳ chỉnh do người dùng thêm qua
// "+ Thêm pháp nhân khác" — xem han-muc-entities-store.ts).
export type EntityType = 'SAP' | 'SAHS' | 'ĐTSA' | 'YANA' | 'Sao Việt' | 'Cá nhân' | (string & {})
export type BankName =
  | 'Agribank' | 'Vietcombank' | 'BIDV' | 'Vietinbank'
  | 'ACB' | 'MB Bank' | 'Techcombank' | 'VPBank' | 'Sacombank'
  | 'HDBank' | 'VIB' | 'TPBank' | 'MSB' | 'SeABank' | 'LPBank'
  | 'OCB' | 'SHB' | 'Eximbank' | 'Nam A Bank' | 'NCB'
  | 'ABBank' | 'BacABank' | 'BaoViet Bank' | 'CBBank' | 'PGBank'
  | 'VietBank' | 'VietABank' | 'KienlongBank' | 'Vikki Bank'
  | 'Chailease' | 'Khác'
export type PhuongThuc  = 'giam-dan' | 'cuoi-ky'
export type KyTra       = 'monthly' | 'quarterly' | 'luu-dong'
export type KyTraGoc    = 'monthly' | 'quarterly' | 'cuoi-ky'
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
/** Phân loại hợp đồng: HĐ vay thông thường, hoặc HĐ đóng vai trò "hạn mức khung"
 *  (bản thân không giải ngân trực tiếp — các HĐ con trỏ về qua hanMucKhungId
 *  mới là các bộ hồ sơ thực rút vốn). Không set (undefined) = HĐ thông thường,
 *  tương đương 'thong-thuong'. */
export type LoaiHopDong = 'thong-thuong' | 'han-muc-khung'

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
  kyTra:           KyTra          // chu kỳ trả LÃI
  kyTraGoc?:       KyTraGoc       // chu kỳ trả GỐC — nếu khác kyTra (VD: lãi tháng, gốc quý)
  ngayKy:          string        // ISO date
  ngayTraGocDauTien?: string     // ISO date — nếu có: kỳ 1 là kỳ LẺ NGÀY (chỉ tính lãi, từ ngayKy → ngày này), các kỳ sau neo theo ngày-trong-tháng của field này (áp dụng cho MỌI kỳ thu lãi hàng tháng, kể cả kỳ lẻ)
  soKyTraGoc?:     number        // chỉ dùng khi kyTraGoc='quarterly' — số kỳ trả gốc do NH quy định, nhập tay (không tự suy ra từ diffM nữa)
  soKyAnHan?:      number        // số kỳ đầu được ân hạn (chỉ trả lãi, không trả gốc) — tính theo kyTra (monthly→tháng, quarterly→quý)
  ngayDaoHan:      string
  trangThai:       TrangThaiHD
  ghiChu?:         string
  gocTraCoDinh?:   number        // gốc làm tròn do NH quy định — nếu có sẽ override gốc tự tính
  loaiHD?:         LoaiHopDong   // 'han-muc-khung' nếu đây là HĐ hạn mức khung, không giải ngân trực tiếp
  hanMucKhungId?:  string        // FK → HopDongTinDung.id của HĐ hạn mức khung (nếu đây là bộ hồ sơ con thuộc 1 khung)
  soBoHoSo?:       string        // số bộ hồ sơ giải ngân (chỉ dùng khi hanMucKhungId có giá trị) — hiển thị thay soHopDong nếu có

  // ── Mã ngân sách (tự sinh khi lưu, dùng để đối chiếu data_quy) ──────────
  // Xem lib/ma-ngan-sach.ts — taoBoMaNganSach() để biết công thức sinh mã.
  // Nhánh DN:  maNganSachLai = {ENTITY}_{NH|DH}_{BANK}_Lai
  //            maNganSachGoc = {ENTITY}_{NH|DH}_{BANK}_Goc
  //            maNganSachThu = T_VNH_{BANK}_{ENTITY}    (chỉ ngắn hạn)
  // Nhánh CN:  maNganSachLai = {NguoiVay}_{BANK}_{Ty}_Lai
  //            maNganSachGoc = {NguoiVay}_{BANK}_{Ty}_Goc
  //            maNganSachThu = undefined (CN không có mã Thu)
  // canhBaoMa: set khi nhánh Cá nhân thiếu nguoiVay hoặc soTienGiaiNgan
  //            → UI HopDongForm hiển thị cảnh báo vàng cho người dùng biết
  maNganSachLai?: string
  maNganSachGoc?: string
  maNganSachThu?: string
  canhBaoMa?:    string

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