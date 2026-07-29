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
} as const

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
  LN_SAU_THUE: '60',
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
