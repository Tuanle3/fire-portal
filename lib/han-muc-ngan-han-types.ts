// ============================================================
// TYPES — Module Hạn mức tín dụng ngắn hạn (cấp theo bộ hồ sơ)
// ============================================================

import type { EntityType, BankName } from './han-muc-types'

export type { EntityType, BankName }

/** Chu kỳ trả lãi từng bộ hồ sơ ngắn hạn */
export type KyTraLaiNH = 'monthly' | 'quarterly' | 'cuoi-ky'

/** Trạng thái hạn mức khung */
export type TrangThaiKhung =
  | 'con-hieu-luc'   // đang trong thời hạn
  | 'gan-het-han'    // còn ≤ 30 ngày
  | 'het-han'        // đã quá ngày kết thúc
  | 'da-dong'        // ngân hàng đóng hạn mức

/** Trạng thái bộ hồ sơ giải ngân */
export type TrangThaiBoHoSo =
  | 'dang-vay'       // đang trong hạn, còn dư nợ
  | 'gan-dao-han'    // còn ≤ 10 ngày đến hạn
  | 'qua-han'        // đã quá ngày đáo hạn
  | 'tat-toan'       // đã trả hết gốc

/** Trạng thái 1 kỳ thu lãi/gốc bộ hồ sơ */
export type TrangThaiKyNH =
  | 'chua-thu'
  | 'gan-han'        // còn ≤ 7 ngày
  | 'qua-han'
  | 'da-thu'

// ─────────────────────────────────────────────────────────
// Hạn mức khung ngắn hạn
//   • NH cấp 1 hạn mức tổng (VD: 20 tỷ) cho cả năm
//   • Doanh nghiệp rút tiền theo từng bộ hồ sơ
//   • NH có thể điều chỉnh tăng/giảm/gia hạn → chỉ lưu giá trị hiện tại
// ─────────────────────────────────────────────────────────
export interface HanMucNganHan {
  id:            string
  soHopDong:     string        // số hợp đồng hạn mức với NH
  entity:        EntityType   // pháp nhân vay
  nganHang:      BankName
  chiNhanh?:     string
  nguoiVay?:     string       // tên người đại diện / bộ phận phụ trách

  tongHanMuc:    number       // VNĐ — giá trị hạn mức tổng (sau điều chỉnh mới nhất)
  ngayHieuLuc:   string       // ISO date — ngày bắt đầu hiệu lực
  ngayHetHan:    string       // ISO date — ngày hết hiệu lực hạn mức

  laiSuatMacDinh?: number     // %/năm — gợi ý khi tạo bộ hồ sơ, không bắt buộc
  ghiChu?:       string

  trangThai:     TrangThaiKhung

  // ── Mã ngân sách (tự sinh khi lưu, dùng để đối chiếu data_quy) ──────────
  // HanMucNganHan luôn là pháp nhân DN (Nhánh A, kyHan='ngan-han').
  // Xem lib/ma-ngan-sach.ts — taoBoMaNganSach() để biết công thức sinh mã.
  //   maNganSachLai = {ENTITY}_NH_{BANK}_Lai
  //   maNganSachGoc = {ENTITY}_NH_{BANK}_Goc
  //   maNganSachThu = T_VNH_{BANK}_{ENTITY}
  // Không có canhBaoMa vì HanMucNganHan chỉ dùng Nhánh A (DN), không bao
  // giờ thiếu dữ liệu để sinh mã (entity + nganHang luôn bắt buộc nhập).
  maNganSachLai?: string
  maNganSachGoc?: string
  maNganSachThu?: string

  createdAt:     number
  updatedAt:     number
}

// ─────────────────────────────────────────────────────────
// Bộ hồ sơ giải ngân (1 lần rút tiền từ hạn mức khung)
//   • Có số bộ hồ sơ riêng (ví dụ: HSTN-001)
//   • Tự nhập lãi suất, kỳ trả lãi, ngày giải ngân, ngày đáo hạn
//   • Trả gốc mặc định cuối kỳ; có thể thêm kỳ trả gốc giữa kỳ sau
//   • Khi trả gốc: hạn mức khả dụng tăng lại ngay
// ─────────────────────────────────────────────────────────
export interface BoHoSoGiaiNgan {
  id:            string
  hanMucId:      string        // FK → HanMucNganHan.id
  soBoHoSo:      string        // VD: HSTN-001

  soTienGiaiNgan: number      // VNĐ — số tiền rút lần này
  ngayGiaiNgan:   string      // ISO date
  ngayDaoHan:     string      // ISO date — hạn trả nợ của bộ hồ sơ này

  laiSuat:        number      // %/năm
  kyTraLai:       KyTraLaiNH  // chu kỳ trả lãi
  ngayTraLaiDauTien?: string  // ISO date — nếu có: kỳ 1 là kỳ lẻ ngày (neo ngày tháng)

  mucDichVay?:    string
  taiSanDamBao?:  string
  ghiChu?:        string

  trangThai:      TrangThaiBoHoSo
  createdAt:      number
  updatedAt:      number
}

// ─────────────────────────────────────────────────────────
// Kỳ thu lãi/gốc của 1 bộ hồ sơ (được tự động tạo khi save)
// ─────────────────────────────────────────────────────────
export interface KyThuNH {
  id:             string
  boHoSoId:       string
  hanMucId:       string
  soKy:           number

  ngayThu:        string      // ISO date — ngày thu theo kế hoạch
  loai:           'lai' | 'goc-va-lai' | 'goc'  // phân loại hiển thị

  dunNoDauKy:     number
  gocThu:         number      // 0 nếu chỉ thu lãi
  laiThu:         number
  tongThu:        number
  dunNoCuoiKy:    number

  trangThai:      TrangThaiKyNH
  // Thực tế khi đánh dấu đã thu:
  ngayThucThu?:   string
  gocThucThu?:    number
  laiThucThu?:    number
  tongThucThu?:   number
}

// ─────────────────────────────────────────────────────────
// Kỳ trả gốc giữa kỳ (trả trước hạn từng phần)
//   Được tạo thủ công bởi người dùng khi có phát sinh
// ─────────────────────────────────────────────────────────
export interface TraGocGiuaKy {
  id:             string
  boHoSoId:       string
  hanMucId:       string
  ngayTra:        string      // ISO date
  soTienGoc:      number      // VNĐ — gốc trả thực tế
  ghiChu?:        string
  createdAt:      number
}

// ─────────────────────────────────────────────────────────
// Snapshot tính toán hạn mức khả dụng (computed, không lưu DB)
// ─────────────────────────────────────────────────────────
export interface KhaDungSnapshot {
  tongHanMuc:     number
  tongGiaiNgan:   number      // tổng soTienGiaiNgan của các bộ chưa tất toán
  tongGocDaTra:   number      // gốc thực đã thu qua kỳ thu + trả giữa kỳ
  duNoHienTai:    number      // = tongGiaiNgan - tongGocDaTra
  khaDung:        number      // = tongHanMuc - duNoHienTai (≥ 0)
  phanTramSuDung: number      // %
  soBoDangVay:    number
}