export type BctcReport = 'PL' | 'BS' | 'TB' | 'AR' | 'AP'

export interface BctcPlRow {
  code: string
  maSo: string
  chiTieu: string
  tMinh: string
  value: number
}

export interface BctcBsRow {
  code: string
  maSo: string
  chiTieu: string
  tMinh: string
  value: number
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
