export type BctcReport = 'PL' | 'BS' | 'TB' | 'AR' | 'AP'

export interface BctcPlRow {
  code: string
  maSo: string
  chiTieu: string
  tMinh: string
  value: number
  // Cột "Loại BC" trong Sheet (VD "Nội bộ" / "Ngân hàng") — 1 công ty/kỳ có thể có nhiều báo cáo
  // song song, cần giữ lại để lọc riêng từng loại thay vì cộng gộp. '' nếu Sheet không có cột này.
  loaiBC: string
}

export interface BctcBsRow {
  code: string
  maSo: string
  chiTieu: string
  tMinh: string
  value: number
  loaiBC: string
}

export interface BctcTbRow {
  code: string
  soTaiKhoan: string
  cap: string
  tenTaiKhoan: string
  value: number
}

export interface BctcArApRow {
  code: string
  maDoiTuong: string
  tenDoiTuong: string
  tkCongNo: string
  no: number
  co: number
}

export type BctcRow = BctcPlRow | BctcBsRow | BctcTbRow | BctcArApRow

export interface BctcPeriodDoc {
  donViKey: string
  donVi: string
  report: BctcReport
  period: string   // "YYYY-MM"
  rows: BctcRow[]
}