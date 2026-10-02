// ============================================================
// ADAPTER — KhoanDongTien (loaiKhoan='ke-hoach', từ Tab Nhập Data)
//           → DongTienKHRow (dạng phẳng cho Tab Kế hoạch dòng tiền)
//
// Quy ước số tiền: Thu = +, Chi = − (đúng như template HTML).
//
// 4 trường nguonThanhToan / doiTac / loaiGiaoDich / nhomBaoCao nhập ở
// DongTienForm (chế độ Kế hoạch). Để trống thì tự suy ra từ pháp nhân + nhóm.
// ============================================================
import type { KhoanDongTien } from '@/lib/dong-tien-types'
import { DEFAULT_ITEMS } from '@/lib/ngan-sach-types'

export interface DongTienKHRow {
  id:  string
  d:   string   // yyyy-mm-dd
  src: string   // nguồn thanh toán
  co:  string   // công ty
  typ: string   // loại giao dịch
  pt:  string   // đối tác / NCC / KH
  ct:  string   // nội dung giao dịch
  a:   number   // + thu, − chi
  nh:  string   // nhóm
}

const CO_LABEL: Record<string, string> = {
  'SAP':      'Công ty CP Xây dựng Sơn An Phát',
  'SAHS':     'Công ty CP Sơn An Hương Sơn',
  'ĐTSA':     'Công ty CP ĐTPT Đô Thị Sơn An',
  'YANA':     'Yana Dragon Holdings',
  'Sao Việt': 'Sao Việt',
  'Cá nhân':  'Cá nhân',
}

const KMCP_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_ITEMS.filter(d => d.kmcp).map(d => [d.kmcp as string, d.dien_giai]),
)

export function khoanToRow(k: KhoanDongTien): DongTienKHRow {
  const thu   = k.loai === 'thu'
  const label = KMCP_LABEL[k.nhom as string] ?? k.nhomChaLabel ?? String(k.nhom)
  return {
    id:  k.id,
    d:   k.ngayDuKien,
    src: k.nguonThanhToan ?? `Quỹ - ${k.entity}`,
    co:  CO_LABEL[k.entity] ?? k.entity,
    typ: k.loaiGiaoDich   ?? `${thu ? 'Thu' : 'Chi'} - ${k.entity} - ${label}`,
    pt:  k.doiTac ?? '',
    ct:  k.moTa,
    a:   thu ? k.soTien : -k.soTien,
    nh:  k.nhomBaoCao ?? `${k.nhom} — ${label}`,
  }
}

export function khoanListToRows(list: KhoanDongTien[]): DongTienKHRow[] {
  return list
    .filter(k => (k.loaiKhoan ?? 'thuc-hien') === 'ke-hoach' && k.soTien > 0 && !!k.ngayDuKien)
    .map(khoanToRow)
}
