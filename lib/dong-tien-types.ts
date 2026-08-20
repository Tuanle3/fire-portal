// ============================================================
// TYPES — Module Dòng tiền (Phần 1: khoản nhập tay)
// Các khoản KHÔNG có nguồn hệ thống (hạn mức tín dụng) — xem
// dong-tien-hanmuc-adapter.ts cho phần tự động lấy từ han-muc.
// ============================================================

import type { EntityType } from '@/lib/han-muc-types'

export type { EntityType }

export type LoaiDongTien = 'thu' | 'chi'

export type NhomDongTien =
  // nhóm THU
  | 'ban-hang'
  | 'cho-thue'
  | 'gop-von'
  | 'thu-khac'
  // nhóm CHI
  | 'luong'
  | 'nha-cung-cap'
  | 'thue'
  | 'xdcb'
  | 'chi-phi-van-hanh'
  | 'chi-khac'

export const NHOM_THEO_LOAI: Record<LoaiDongTien, NhomDongTien[]> = {
  thu: ['ban-hang', 'cho-thue', 'gop-von', 'thu-khac'],
  chi: ['luong', 'nha-cung-cap', 'thue', 'xdcb', 'chi-phi-van-hanh', 'chi-khac'],
}

export const NHOM_LABEL: Record<NhomDongTien, string> = {
  'ban-hang':          'Bán hàng / dịch vụ',
  'cho-thue':          'Cho thuê',
  'gop-von':           'Góp vốn / vay',
  'thu-khac':          'Thu khác',
  'luong':             'Lương',
  'nha-cung-cap':      'Nhà cung cấp',
  'thue':              'Thuế',
  'xdcb':              'Đầu tư XDCB',
  'chi-phi-van-hanh':  'Chi phí vận hành',
  'chi-khac':          'Chi khác',
}

/** Độ tin cậy — chỉ áp dụng cho khoản THU dự kiến, dùng để tính kịch bản rủi ro */
export type DoTinCay = 'chac-chan' | 'du-kien' | 'rui-ro'

export const DO_TIN_CAY_LABEL: Record<DoTinCay, string> = {
  'chac-chan': 'Chắc chắn',
  'du-kien':   'Dự kiến',
  'rui-ro':    'Rủi ro',
}

/** Chu kỳ lặp lại — sinh nhiều bản ghi cùng lúc (VD: tiền thuê văn phòng hàng tháng) */
export type ChuKyLap = 'mot-lan' | 'hang-thang' | 'hang-quy'

export interface KhoanDongTien {
  id:             string
  entity:         EntityType
  loai:           LoaiDongTien
  nhom:           NhomDongTien
  ngayDuKien:     string          // ISO date (YYYY-MM-DD)
  soTien:         number          // VNĐ, luôn số dương
  doTinCay?:      DoTinCay        // chỉ dùng khi loai === 'thu'
  moTa:           string

  // Khoản lặp lại: khi tạo, sinh ra nhiều bản ghi độc lập cùng nhóm `lapNhomId`
  lap?:           ChuKyLap
  soKyLap?:       number          // số kỳ sinh ra (kể cả kỳ đầu)
  lapNhomId?:     string          // liên kết các bản ghi cùng 1 lần tạo lặp, để sửa/xoá hàng loạt

  // Đối chiếu thực tế
  daThucHien?:    boolean
  ngayThucHien?:  string
  soTienThucTe?:  number

  ghiChu?:        string
  createdAt:      number
  updatedAt:      number
}

// ─────────────────────────────────────────────────────────
// Type hợp nhất dùng ở tầng Engine (Phần 3) — nhập tay + tự động
// đặt sẵn ở đây để Phần 1 export ra dùng chung ngay từ đầu.
// ─────────────────────────────────────────────────────────
export type NguonDongTien = 'nhap-tay' | 'kytra-no' | 'kythu-nh' | 'giai-ngan'

export interface DongTienItem {
  id:          string
  entity:      EntityType
  loai:        LoaiDongTien
  ngay:        string
  soTien:      number
  nguon:       NguonDongTien
  nhom:        NhomDongTien | 'tra-no-ngan-han'
  nhanNhan:    string
  trangThai:   'du-kien' | 'thuc-te'
  refId?:      string
  doTinCay?:   DoTinCay
}

/** Chuyển 1 KhoanDongTien (nhập tay) → DongTienItem (chuẩn hợp nhất) */
export function tuKhoanDongTienRaItem(k: KhoanDongTien): DongTienItem {
  const daXongThucTe = !!k.daThucHien
  return {
    id:        `kt-${k.id}`,
    entity:    k.entity,
    loai:      k.loai,
    ngay:      daXongThucTe && k.ngayThucHien ? k.ngayThucHien : k.ngayDuKien,
    soTien:    daXongThucTe && k.soTienThucTe != null ? k.soTienThucTe : k.soTien,
    nguon:     'nhap-tay',
    nhom:      k.nhom,
    nhanNhan:  k.moTa,
    trangThai: daXongThucTe ? 'thuc-te' : 'du-kien',
    refId:     k.id,
    doTinCay:  k.doTinCay,
  }
}
