// Mã số theo chuẩn TT200/TT99 dùng để tính các chỉ số sức khỏe tài chính.
// Tách riêng file này để dễ chỉnh khi có mẫu thẩm định ngân hàng cụ thể hoặc khi
// đồng bộ thật cho thấy mã số khác với giả định (đặc biệt Hàng tồn kho, Nợ dài hạn).
export const MS_BS = {
  TSNH: '100',
  TSDH: '200',
  TONG_TS: '280',
  NO_PHAI_TRA: '300',
  NO_NGAN_HAN: '310',
  NO_DAI_HAN: '330',
  VON_CSH: '400',
  TONG_NGUON_VON: '440',
  HANG_TON_KHO: '140',
  TIEN: '110',
  TSCD: '220',
  DAU_TU_DH: '260',
} as const

// Cân đối kế toán theo TT200 có 3 cấp — KHÔNG suy được đáng tin cậy chỉ từ mã số (mã số chi tiết
// thứ #10, #20... cũng tận cùng bằng 0 giống mã nhóm, ví dụ "320 - 10. Phải trả ngắn hạn khác" dễ
// bị nhầm thành nhóm ngang hàng "I./II."). Sheet đã tự đánh số thứ tự ngay trong tên chỉ tiêu
// ("A - ...", "I. ...", "1. ...") nên dùng đúng tiền tố đó để phân cấp, đáng tin hơn nhiều:
//   cấp 0 = "A -"/"B -"/"C -"/"D -" hoặc "TỔNG CỘNG..." — mục lớn, luôn hiện.
//   cấp 1 = "I."/"II."/"III."... (La Mã) — nhóm có thể bung/thu.
//   cấp 2 = còn lại (đánh số Ả Rập "1.","10."... hoặc dòng phụ "- ...") — chi tiết, gộp vào nhóm cấp 1 gần nhất.
const SECTION_PREFIX = /^[A-ZĐ]\s*-\s/
const ROMAN_PREFIX = /^[IVXLCDM]+\.\s/
const KNOWN_LEVEL0_MASO = new Set(['100', '200', '280', '300', '400', '440'])

export function maSoLevelBS(maSo: string, chiTieu: string): 0 | 1 | 2 {
  const label = (chiTieu ?? '').trim()
  if (SECTION_PREFIX.test(label) || label.toUpperCase().startsWith('TỔNG CỘNG')) return 0
  if (ROMAN_PREFIX.test(label)) return 1
  if (KNOWN_LEVEL0_MASO.has(maSo)) return 0
  return 2
}

// buildLineItemMatrix sort theo mã số — Number("411a")/Number("420b") = NaN nên các mã có hậu tố
// chữ (411a, 411b, 420a, 420b...) từng bị rơi về 0 và dạt lên đầu bảng. parseInt lấy đúng phần số
// đứng đầu ("411a" → 411); so bằng chuỗi đầy đủ khi trùng số để "411a" đứng trước "411b".
export function maSoSortKey(maSo: string): number {
  const n = parseInt(maSo, 10)
  return Number.isNaN(n) ? 0 : n
}

export const MS_PL = {
  DT_BAN_HANG: '01',
  GIAM_TRU: '02',
  DTT: '10',
  GIA_VON: '11',
  LAI_GOP: '20',
  DT_TAI_CHINH: '22',
  CP_TAI_CHINH: '23',
  CP_LAI_VAY: '24',
  CP_BAN_HANG: '25',
  CP_QLDN: '26',
  LN_THUAN_HDKD: '30',
  THU_NHAP_KHAC: '31',
  CHI_PHI_KHAC: '32',
  LN_KHAC: '40',
  LN_TRUOC_THUE: '50',
  THUE_HIEN_HANH: '51',
  THUE_HOAN_LAI: '52',
  LN_SAU_THUE: '60',
} as const

// Số tài khoản GL (report TB) theo Thông tư 200 — ổn định giữa các công ty hơn nhiều so với mã số
// Cân đối kế toán tự đặt (đã có 2 lần đoán sai theo mã số/tên chỉ tiêu ở phần trước).
export const TK = {
  PHAI_TRA_NGUOI_BAN: '331',
  VAY_NGAN_HAN: '34111',
  VAY_DAI_HAN: '34112',
  VON_GOP: '4111',
  THANG_DU_VON: '412',
  LNST_CHUA_PHAN_PHOI: '421',
} as const

// Code (không phải mã số) của các dòng thuyết minh chi tiết trong Data_PL — dùng để lên
// card "Doanh thu theo sản phẩm" / "Cấu trúc chi phí" chứ không nằm trong bảng KQKD chính.
export const PL_BREAKDOWN_CODES = {
  DOANH_THU_SP: 'TM_DT_SP',
  GIA_VON_SP: 'TM_GV_SP',
  LAI_GOP_SP: 'TM_LG_SP',
  THU_NHAP_KHAC: 'TM_DT_K',
  CAU_TRUC_CHI_PHI: 'TM_CP',
  CHI_PHI_KHAC_CT: 'TM_CP_K',
} as const

export interface BudgetCategory {
  key: string
  label: string
  actual: { kind: 'maSo'; maSo: string } | { kind: 'breakdown'; code: string; chiTieu: string }
}

// Danh mục khoản mục cho tab "Ngân sách chi phí" (nhập kế hoạch tay) — lấy đúng theo các dòng
// thuyết minh chi phí thật đã thấy trong Data_PL, để "Thực tế" tra được ngay từ data_bctc hiện có.
export const BUDGET_CATEGORIES: BudgetCategory[] = [
  { key: 'gia_von', label: 'Giá vốn hàng bán', actual: { kind: 'maSo', maSo: MS_PL.GIA_VON } },
  { key: 'cp_ban_hang', label: 'Chi phí bán hàng', actual: { kind: 'maSo', maSo: MS_PL.CP_BAN_HANG } },
  { key: 'cp_tai_chinh', label: 'Chi phí tài chính', actual: { kind: 'maSo', maSo: MS_PL.CP_TAI_CHINH } },
  { key: 'cp_nhan_su', label: 'Chi phí nhân sự', actual: { kind: 'breakdown', code: PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, chiTieu: 'Chi phí nhân sự' } },
  { key: 'cp_hanh_chinh', label: 'Chi phí hành chính', actual: { kind: 'breakdown', code: PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, chiTieu: 'Chi phí hành chính' } },
  { key: 'cp_tiep_khach', label: 'Chi phí tiếp khách', actual: { kind: 'breakdown', code: PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, chiTieu: 'Chi phí tiếp khách' } },
  { key: 'cp_cong_tac', label: 'Chi phí công tác', actual: { kind: 'breakdown', code: PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, chiTieu: 'Chi phí công tác' } },
  { key: 'khau_hao', label: 'Khấu hao - Phân bổ', actual: { kind: 'breakdown', code: PL_BREAKDOWN_CODES.CAU_TRUC_CHI_PHI, chiTieu: 'Khấu hao - Phân bổ' } },
]
