// ============================================================
// TYPES — Module Dòng tiền
// ============================================================

import type { EntityType } from '@/lib/han-muc-types'

export type { EntityType }

export type LoaiDongTien = 'thu' | 'chi'

// ── Loại khoản: kế hoạch (nhập đầu kỳ) hay thực hiện (nhập dần) ──
// Khoản cũ không có field này → mặc định 'thuc-hien' khi đọc
export type LoaiKhoan = 'ke-hoach' | 'thuc-hien'

export type NhomDongTien =
  // nhóm THU — chuẩn báo cáo SAG
  | 'cho-goi'           // Thu từ Chợ Gôi
  | 'nam-pho-chau'      // Thu từ Nam Phố Châu
  | 'sap'               // Thu từ SAP
  | 'dtsa'              // Thu từ Đô Thị Sơn An
  | 'ban-ruou'          // Thu từ bán rượu/cao
  | 'thu-khac'          // Thu khác (cho thuê MB, lãi gửi...)
  | 'vay-ngan-hang'     // Thu từ vay / đáo hạn ngân hàng
  // nhóm CHI — chuẩn báo cáo SAG
  | 'nha-cung-cap'      // Chi trả nhà cung cấp
  | 'chi-khac'          // Chi khác
  | 'goc-vay-dn'        // Trả gốc vay doanh nghiệp
  | 'lai-vay-dn'        // Trả lãi vay doanh nghiệp
  | 'goc-vay-cn'        // Gốc vay cá nhân
  | 'lai-vay-cn'        // Lãi vay cá nhân
  | 'luong'             // Chi lương
  | 'thue'              // Chi thuế
  | 'xdcb'              // Đầu tư XDCB
  | 'cphd-van-phong'    // CPHĐ văn phòng phẩm / dụng cụ
  | 'cphd-luong-ld'     // CPHĐ lương lao động thời vụ
  | 'cphd-sua-chua'     // CPHĐ sửa chữa tài sản
  | 'cphd-cong-tac'     // CPHĐ công tác
  | 'cphd-tiep-khach'   // CPHĐ tiếp khách, ngoại giao
  | 'cphd-marketing'    // CPHĐ marketing, hội nghị, sự kiện
  | 'cphd-phi-ngan-hang'// CPHĐ phí ngân hàng

// Label ngắn gọn để hiển thị trong form/bảng
export const NHOM_LABEL: Record<string, string> = {
  'cho-goi':             'Thu từ Chợ Gôi',
  'nam-pho-chau':        'Thu từ Nam Phố Châu',
  'sap':                 'Thu từ SAP',
  'dtsa':                'Thu từ Đô Thị Sơn An',
  'ban-ruou':            'Thu từ bán rượu/cao',
  'thu-khac':            'Thu khác',
  'vay-ngan-hang':       'Thu từ vay ngân hàng',
  'nha-cung-cap':        'Chi trả nhà cung cấp',
  'chi-khac':            'Chi khác',
  'goc-vay-dn':          'Trả gốc vay doanh nghiệp',
  'lai-vay-dn':          'Trả lãi vay doanh nghiệp',
  'goc-vay-cn':          'Gốc vay cá nhân',
  'lai-vay-cn':          'Lãi vay cá nhân',
  'luong':               'Chi lương',
  'thue':                'Chi thuế',
  'xdcb':                'Đầu tư XDCB',
  'cphd-van-phong':      'CPHĐ văn phòng phẩm',
  'cphd-luong-ld':       'CPHĐ lương lao động',
  'cphd-sua-chua':       'CPHĐ sửa chữa',
  'cphd-cong-tac':       'CPHĐ công tác',
  'cphd-tiep-khach':     'CPHĐ tiếp khách',
  'cphd-marketing':      'CPHĐ marketing',
  'cphd-phi-ngan-hang':  'CPHĐ phí ngân hàng',
}

export const NHOM_THEO_LOAI: Record<LoaiDongTien, NhomDongTien[]> = {
  thu: ['cho-goi', 'nam-pho-chau', 'sap', 'dtsa', 'ban-ruou', 'thu-khac', 'vay-ngan-hang'],
  chi: [
    'nha-cung-cap', 'chi-khac', 'goc-vay-dn', 'lai-vay-dn', 'goc-vay-cn', 'lai-vay-cn',
    'luong', 'thue', 'xdcb',
    'cphd-van-phong', 'cphd-luong-ld', 'cphd-sua-chua',
    'cphd-cong-tac', 'cphd-tiep-khach', 'cphd-marketing', 'cphd-phi-ngan-hang',
  ],
}

/** Độ tin cậy — chỉ áp dụng cho khoản THU dự kiến */
export type DoTinCay = 'chac-chan' | 'du-kien' | 'rui-ro'

export const DO_TIN_CAY_LABEL: Record<DoTinCay, string> = {
  'chac-chan': 'Chắc chắn',
  'du-kien':   'Dự kiến',
  'rui-ro':    'Rủi ro',
}

/** Chu kỳ lặp lại — sinh nhiều bản ghi cùng lúc */
export type ChuKyLap = 'mot-lan' | 'hang-thang' | 'hang-quy'

// ─────────────────────────────────────────────────────────
// KhoanDongTien — NHẬP TAY (Phần 1)
// Thêm 3 field mới (optional) — backward compatible 100%:
//   loaiKhoan:    'ke-hoach' | 'thuc-hien'  (undefined = 'thuc-hien')
//   nhomCha:      key nhóm cha — dùng để group trong báo cáo
//   nhomChaLabel: label hiển thị của nhóm cha (lưu cùng để report không phụ thuộc code)
// ─────────────────────────────────────────────────────────
export interface KhoanDongTien {
  id:             string
  entity:         EntityType
  loai:           LoaiDongTien
  nhom:           NhomDongTien | string   // string để tương thích nhóm tuỳ chỉnh cũ
  ngayDuKien:     string                  // ISO date (YYYY-MM-DD)
  soTien:         number                  // VNĐ, luôn dương

  // ── MỚI (Bước A) — optional để tương thích dữ liệu cũ ──
  loaiKhoan?:     LoaiKhoan              // undefined → coi là 'thuc-hien'
  nhomCha?:       string                 // key nhóm cha — VD 'cho-goi'
  nhomChaLabel?:  string                 // label nhóm cha — VD 'Thu từ Chợ Gôi'

  doTinCay?:      DoTinCay
  moTa:           string

  lap?:           ChuKyLap
  soKyLap?:       number
  lapNhomId?:     string

  // Đối chiếu thực tế
  daThucHien?:    boolean
  ngayThucHien?:  string
  soTienThucTe?:  number

  ghiChu?:        string
  createdAt:      number
  updatedAt:      number
}

// ── Helper: lấy loaiKhoan an toàn (dữ liệu cũ không có field này) ──
export function getLoaiKhoan(k: KhoanDongTien): LoaiKhoan {
  return k.loaiKhoan ?? 'thuc-hien'
}

// ─────────────────────────────────────────────────────────
// Type hợp nhất (Phần 3) — nhập tay + tự động hạn mức
// ─────────────────────────────────────────────────────────
export type NguonDongTien = 'nhap-tay' | 'kytra-no' | 'kythu-nh' | 'giai-ngan'

export interface DongTienItem {
  id:           string
  entity:       EntityType
  loai:         LoaiDongTien
  ngay:         string
  soTien:       number
  nguon:        NguonDongTien
  nhom:         NhomDongTien | string
  nhanNhan:     string
  trangThai:    'du-kien' | 'thuc-te'
  refId?:       string
  doTinCay?:    DoTinCay
  nganHang?:    string   // chỉ có ở khoản TỰ ĐỘNG từ hạn mức — dùng để gộp nhóm ở engine

  // ── MỚI — truyền xuống để báo cáo/engine dùng ──
  loaiKhoan?:   LoaiKhoan
  nhomCha?:     string
  nhomChaLabel?: string
}

/** Chuyển 1 KhoanDongTien (nhập tay) → DongTienItem */
export function tuKhoanDongTienRaItem(k: KhoanDongTien): DongTienItem {
  const daXong = !!k.daThucHien
  return {
    id:           `kt-${k.id}`,
    entity:       k.entity,
    loai:         k.loai,
    ngay:         daXong && k.ngayThucHien ? k.ngayThucHien : k.ngayDuKien,
    soTien:       daXong && k.soTienThucTe != null ? k.soTienThucTe : k.soTien,
    nguon:        'nhap-tay',
    nhom:         k.nhom,
    nhanNhan:     k.moTa,
    trangThai:    daXong ? 'thuc-te' : 'du-kien',
    refId:        k.id,
    doTinCay:     k.doTinCay,
    loaiKhoan:    k.loaiKhoan ?? 'thuc-hien',
    nhomCha:      k.nhomCha,
    nhomChaLabel: k.nhomChaLabel,
  }
}

// ─────────────────────────────────────────────────────────
// SoDuDauKy — Tồn quỹ đầu kỳ (nhập tay từ sổ quỹ)
// Collection: dongTienSoDuDauKy
// ─────────────────────────────────────────────────────────
export interface SoDuDauKy {
  id:            string          // docId = `${thang}__${entity}` VD: '2026-08__SAP'
  thang:         string          // 'YYYY-MM' VD: '2026-08'
  entity:        EntityType | 'all'
  tonQuy:        number          // VNĐ — số dư đầu kỳ từ sổ quỹ
  chuyenNoiBo?:  number          // chuyển quỹ nội bộ net (không đổi tổng quỹ)
  xlNet?:        number          // thu/chi xử lý net
  ghiChu?:       string
  updatedAt:     number
}