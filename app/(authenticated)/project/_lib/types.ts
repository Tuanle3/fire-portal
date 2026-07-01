export type ProjectUnit = 'ty' | 'trieu' | 'dong'

export const UNIT_MULT: Record<ProjectUnit, number> = { ty: 1, trieu: 1000, dong: 1e9 }
export const UNIT_SUFFIX: Record<ProjectUnit, string> = { ty: ' tỷ', trieu: ' tr', dong: ' đ' }

export function fmtU(val: number, unit: ProjectUnit, decimals = 2): string {
  const v = val * UNIT_MULT[unit]
  return v.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) + UNIT_SUFFIX[unit]
}

export interface ProjectInfo {
  area: string
  totalCap: number      // tỷ
  loan: number          // hạn mức vay
  giaiNgan: number      // đã giải ngân
  startDate: string
  estEnd: string
  totalUnits: number
  soldUnits: number
  thucThu: number       // tỷ
  progress: number      // 0-100
}

export interface ThiCongItem {
  key: string
  ma: string
  ten: string
  nhom: string
  nha_thau: string
  kl_ke_hoach: number
  kl_thuc_te: number
  pct: number
  ngay_bd: string
  ngay_kt: string
  trang_thai: 'dang_thi_cong' | 'hoan_thanh' | 'tre' | 'chua_bat_dau'
  delay_days: number
  goi_thau: string
  gia_tri: number   // tỷ
}

export interface LienDanhMember {
  key: string
  ten: string
  cam_ket: number  // tỷ
  da_gop: number   // tỷ
}

export interface PhapLyDoc {
  key: string
  ten: string
  loai: string
  so_hieu: string
  ngay_cap: string
  han: string
  trang_thai: 'hieu_luc' | 'het_han' | 'cho_duyet' | 'dang_lam'
  don_vi: string
  ghi_chu: string
}

export interface BanHangUnit {
  key: string
  can_ho: string
  loai: string
  dien_tich: number
  dien_tich_sd: number
  gia: number        // tỷ
  khach: string
  ngay_ban: string
  trang_thai: 'chua_ban' | 'dat_coc' | 'ky_hop_dong' | 'ban_giao'
  tang: string
}

export interface ThanhToanRow {
  key: string
  nhom: string    // 'Chi nhà thầu' | 'Chi trả NCC' | 'Chi hoạt động' | 'Thu'
  loai: string
  so_tien: number  // tỷ
  ngay: string
  thang: number
  nam: number
  trang_thai: 'da_thanh_toan' | 'cho_duyet' | 'huy'
  ghi_chu: string
  nha_thau: string
}

export interface VonVayTranche {
  key: string
  goi: string
  so_tien: number  // tỷ
  ngay_giai_ngan: string
  trang_thai: 'da_giai_ngan' | 'chua_giai_ngan' | 'dang_xet'
  ghi_chu: string
  lai_suat: number  // %/năm
}

export interface ProjectTask {
  key: string
  muc: 'khan' | 'uu_tien' | 'hom_nay' | 'binh_thuong'
  ten: string
  mo_ta: string
  han: string
  urgency: boolean
}

export interface Phase {
  key: string
  ten: string
  pct: number
  trang_thai: 'done' | 'active' | 'pending'
  thu_tu: number
}

export interface ChungTuRow {
  key: string
  ngay: string
  loai: 'Thu' | 'Chi'
  nhom: string
  mo_ta: string
  so_tien: number   // VND
  don_vi: string
  trang_thai: string
  chung_tu_so: string
  ghi_chu?: string
  link_file?: string
}

export const PREFIX = 'NOXH_NT'

export const DEFAULT_INFO: ProjectInfo = {
  area: '1.2 ha', totalCap: 285, loan: 196.78, giaiNgan: 0,
  startDate: '2024-01-01', estEnd: '2027-12-31',
  totalUnits: 309, soldUnits: 0, thucThu: 0, progress: 45,
}

export const DEFAULT_LIEN_DANH: Omit<LienDanhMember, 'key'>[] = [
  { ten: 'Sơn An Hương Sơn',       cam_ket: 96.60, da_gop: 1.42 },
  { ten: 'Đô Thị Sơn An',          cam_ket: 24.15, da_gop: 0.15 },
  { ten: 'Yana Dragon Holdings',    cam_ket: 40.25, da_gop: 7.91 },
]

export const DEFAULT_THI_CONG: Omit<ThiCongItem, 'key'>[] = [
  { ma:'GT-001', ten:'CP khác',           nhom:'CP khác',         nha_thau:'Sơn An Phát', kl_ke_hoach:100, kl_thuc_te:100, pct:100, ngay_bd:'2024-01-01', ngay_kt:'2024-06-30', trang_thai:'hoan_thanh', delay_days:0,   goi_thau:'GT-001', gia_tri:5    },
  { ma:'GT-002', ten:'Tư vấn ĐTXD (HM1)', nhom:'Tư vấn ĐTXD',   nha_thau:'Sao Việt',    kl_ke_hoach:100, kl_thuc_te:93,  pct:93,  ngay_bd:'2024-02-01', ngay_kt:'2024-08-31', trang_thai:'dang_thi_cong', delay_days:197, goi_thau:'GT-002', gia_tri:3.5  },
  { ma:'GT-003', ten:'Tư vấn ĐTXD (HM2)', nhom:'Tư vấn ĐTXD',   nha_thau:'Sao Việt',    kl_ke_hoach:100, kl_thuc_te:93,  pct:93,  ngay_bd:'2024-02-01', ngay_kt:'2024-08-31', trang_thai:'tre',          delay_days:161, goi_thau:'GT-003', gia_tri:2.8  },
  { ma:'GT-006', ten:'Thiết kế thi công',  nhom:'Thiết kế thi công', nha_thau:'Sao Việt', kl_ke_hoach:100, kl_thuc_te:10,  pct:10,  ngay_bd:'2024-03-01', ngay_kt:'2024-09-30', trang_thai:'tre',          delay_days:181, goi_thau:'GT-006', gia_tri:1.2  },
]

export const DEFAULT_PHASES: Omit<Phase, 'key'>[] = [
  { ten:'Chuẩn bị & Pháp lý', pct:90, trang_thai:'done',    thu_tu:1 },
  { ten:'Thiết kế',            pct:80, trang_thai:'done',    thu_tu:2 },
  { ten:'Thi công',            pct:30, trang_thai:'active',  thu_tu:3 },
  { ten:'Bàn giao',            pct:0,  trang_thai:'pending', thu_tu:4 },
]

export const DEFAULT_PHAP_LY: Omit<PhapLyDoc, 'key'>[] = [
  { ten:'Quyết định phê duyệt đầu tư',  loai:'Quyết định', so_hieu:'QĐ-001/2024', ngay_cap:'2024-01-15', han:'', trang_thai:'hieu_luc', don_vi:'UBND Tỉnh', ghi_chu:'' },
  { ten:'Giấy phép xây dựng',            loai:'Giấy phép',  so_hieu:'GP-023/2024', ngay_cap:'2024-03-10', han:'2027-03-10', trang_thai:'hieu_luc', don_vi:'Sở XD',    ghi_chu:'' },
  { ten:'Thiết kế cơ sở được duyệt',    loai:'Quyết định', so_hieu:'TK-CB/2024',  ngay_cap:'2024-02-20', han:'', trang_thai:'hieu_luc', don_vi:'Sở XD',       ghi_chu:'' },
  { ten:'Thẩm định giá đất',             loai:'Báo cáo',    so_hieu:'',            ngay_cap:'',           han:'', trang_thai:'dang_lam', don_vi:'Đơn vị TĐG',   ghi_chu:'Đang thực hiện' },
  { ten:'Hợp đồng EPC tổng thầu',        loai:'Hợp đồng',   so_hieu:'',            ngay_cap:'',           han:'', trang_thai:'dang_lam', don_vi:'Ban DA',        ghi_chu:'Đang soạn thảo' },
]

export const TRANG_THAI_LABEL: Record<string, string> = {
  hieu_luc:      'Hiệu lực',
  het_han:       'Hết hạn',
  cho_duyet:     'Chờ duyệt',
  dang_lam:      'Đang thực hiện',
  dang_thi_cong: 'Đang TC',
  hoan_thanh:    'Hoàn thành',
  tre:           'Trễ tiến độ',
  chua_bat_dau:  'Chưa bắt đầu',
  da_thanh_toan: 'Đã thanh toán',
  huy:           'Hủy',
  chua_ban:      'Chưa bán',
  dat_coc:       'Đặt cọc',
  ky_hop_dong:   'Ký HĐ',
  ban_giao:      'Bàn giao',
  da_giai_ngan:  'Đã giải ngân',
  chua_giai_ngan:'Chưa giải ngân',
  dang_xet:      'Đang xét',
}
