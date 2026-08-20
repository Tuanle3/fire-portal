// ============================================================
// TYPES — Module Dòng tiền (Phần 1: khoản nhập tay)
// Các khoản KHÔNG có nguồn hệ thống (hạn mức tín dụng) — xem
// dong-tien-hanmuc-adapter.ts cho phần tự động lấy từ han-muc.
// ============================================================

import type { EntityType } from '@/lib/han-muc-types'

export type { EntityType }

export type LoaiDongTien = 'thu' | 'chi'

// ── Nhóm dòng tiền — đúng danh mục báo cáo tháng (7 THU + 15 CHI) ──
// `nhom` là string tự do: hoặc 1 code chuẩn bên dưới, hoặc TÊN của
// 1 nhóm tuỳ chỉnh do người dùng tự thêm qua "+ Thêm nhóm mới"
// (lưu ở collection riêng — xem dong-tien-nhom-store.ts). Vì nhóm
// tuỳ chỉnh không có code, khi hiển thị LUÔN dùng
// `NHOM_LABEL[nhom] ?? nhom` để tự fallback về đúng tên đã lưu.
export type NhomDongTien = string

export const NHOM_THEO_LOAI: Record<LoaiDongTien, NhomDongTien[]> = {
  thu: ['cho-goi', 'nam-pho-chau', 'sap', 'dtsa', 'ban-ruou', 'thu-khac', 'vay-nh-dao-han'],
  chi: [
    'chi-tra-ncc', 'chi-khac', 'goc-vay-dn', 'lai-vay-dn',
    'goc-vay-ca-nhan', 'lai-vay-ca-nhan', 'goc-lai-vay-ngoai',
    'cphd-luong', 'cphd-hanh-chinh', 'cphd-sinh-hoat', 'cphd-thue-phi',
    'cphd-cong-tac', 'cphd-tiep-khach', 'cphd-marketing', 'cphd-phi-ngan-hang',
  ],
}

export const NHOM_LABEL: Record<string, string> = {
  'cho-goi':           'Thu từ Chợ Gôi',
  'nam-pho-chau':      'Thu từ Nam Phố Châu',
  'sap':               'Thu từ SAP',
  'dtsa':              'Thu từ Đô Thị Sơn An',
  'ban-ruou':          'Thu từ bán rượu',
  'thu-khac':          'Thu khác',
  'vay-nh-dao-han':    'Thu từ vay ngân hàng (đáo hạn)',

  'chi-tra-ncc':        'Chi trả nhà cung cấp',
  'chi-khac':           'Chi khác',
  'goc-vay-dn':         'Trả gốc vay doanh nghiệp',
  'lai-vay-dn':         'Trả lãi vay doanh nghiệp',
  'goc-vay-ca-nhan':    'Gốc vay cá nhân',
  'lai-vay-ca-nhan':    'Lãi vay cá nhân',
  'goc-lai-vay-ngoai':  'Gốc lãi vay cá nhân/tổ chức bên ngoài',
  'cphd-luong':         'CPHĐ - Lương & các khoản theo lương',
  'cphd-hanh-chinh':    'CPHĐ - Hành chính',
  'cphd-sinh-hoat':     'CPHĐ - Sinh hoạt',
  'cphd-thue-phi':      'CPHĐ - Thuế, phí, lệ phí',
  'cphd-cong-tac':      'CPHĐ - Công tác',
  'cphd-tiep-khach':    'CPHĐ - Tiếp khách, ngoại giao',
  'cphd-marketing':     'CPHĐ - Marketing, hội nghị, sự kiện',
  'cphd-phi-ngan-hang': 'CPHĐ - Phí ngân hàng',
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
  nhom:        NhomDongTien | 'tra-no' | 'giai-ngan'
  nhanNhan:    string
  trangThai:   'du-kien' | 'thuc-te'
  refId?:      string
  doTinCay?:   DoTinCay
  /** Tên ngân hàng — chỉ có ở khoản TỰ ĐỘNG từ hạn mức tín dụng,
   *  dùng để gộp nhóm nhiều khoản cùng ngày + cùng ngân hàng ở
   *  chế độ Tổng hợp/Timeline cho gọn (Phần 4 nâng cấp). */
  nganHang?:   string
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