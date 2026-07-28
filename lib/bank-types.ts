// ── Types & label maps cho module Ngân hàng ──────────────────────────────────

export interface BankContact {
  ten: string
  chucVu: string
  sdt: string
  email: string
}

export type BankDanhGia = 'tot' | 'binh_thuong' | 'can_cai_thien'
export type BankTrangThai = 'dang_hop_tac' | 'tiem_nang' | 'ngung_hop_tac'

export interface BankRelation {
  id: string
  tenNganHang: string
  chiNhanh: string
  nguoiLienHe: BankContact[]
  danhGia: BankDanhGia
  trangThai: BankTrangThai
  hanMucHienTai: number
  duNoHienTai: number
  laiSuatBinhQuan: number
  ghiChuChung: string
  updatedAt: string
}

export type LoaiVay = 'ngan_han' | 'trung_dai_han' | 'bao_lanh' | 'thau_chi'
export type TrangThaiPhuongAn = 'dang_dam_phan' | 'da_duyet' | 'dang_su_dung' | 'tu_choi' | 'het_han'

export interface BankProposal {
  id: string
  nganHangId: string
  tenPhuongAn: string
  loaiVay: LoaiVay
  laiSuat: number
  hanMucDeXuat: number
  tyLeTSDB: number
  thoiHan: string
  phiDichVu: string
  dieuKien: string
  uuDiem: string[]
  nhuocDiem: string[]
  trangThai: TrangThaiPhuongAn
  nguoiPhuTrach: string
  ngayCapNhat: string
}

export type TrangThaiGhiChu = 'chua_xu_ly' | 'dang_xu_ly' | 'hoan_tat'

export interface BankNote {
  id: string
  nganHangId: string
  ngay: string
  nguoiLienHe: string
  noiDung: string
  viecCanLam: string
  hanXuLy: string
  trangThai: TrangThaiGhiChu
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

export const LOAI_VAY_LABEL: Record<LoaiVay, string> = {
  ngan_han: 'Ngắn hạn',
  trung_dai_han: 'Trung dài hạn',
  bao_lanh: 'Bảo lãnh',
  thau_chi: 'Thấu chi',
}

export const TRANG_THAI_PA_LABEL: Record<TrangThaiPhuongAn, string> = {
  dang_dam_phan: 'Đang đàm phán',
  da_duyet: 'Đã duyệt',
  dang_su_dung: 'Đang sử dụng',
  tu_choi: 'Từ chối',
  het_han: 'Hết hạn',
}

export const TRANG_THAI_GC_LABEL: Record<TrangThaiGhiChu, string> = {
  chua_xu_ly: 'Chưa xử lý',
  dang_xu_ly: 'Đang xử lý',
  hoan_tat: 'Hoàn tất',
}

export const EMPTY_BANK: Omit<BankRelation, 'id' | 'updatedAt'> = {
  tenNganHang: '', chiNhanh: '', nguoiLienHe: [], danhGia: 'binh_thuong',
  trangThai: 'dang_hop_tac', hanMucHienTai: 0, duNoHienTai: 0, laiSuatBinhQuan: 0, ghiChuChung: '',
}

export const EMPTY_PROPOSAL: Omit<BankProposal, 'id' | 'nganHangId' | 'ngayCapNhat'> = {
  tenPhuongAn: '', loaiVay: 'ngan_han', laiSuat: 0, hanMucDeXuat: 0, tyLeTSDB: 0,
  thoiHan: '', phiDichVu: '', dieuKien: '', uuDiem: [], nhuocDiem: [],
  trangThai: 'dang_dam_phan', nguoiPhuTrach: '',
}

export const EMPTY_NOTE: Omit<BankNote, 'id' | 'nganHangId'> = {
  ngay: new Date().toISOString().slice(0, 10), nguoiLienHe: '', noiDung: '',
  viecCanLam: '', hanXuLy: '', trangThai: 'chua_xu_ly', nguoiPhuTrach: '',
}
