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

// Rút gọn nội dung khoản vay tự động để các kỳ cùng hạn mức / cùng khoản vay gộp thành 1 dòng
// (cột tháng vẫn hiện đúng số của từng kỳ):
//   THU  "Vay đáo hạn 95% bộ hồ sơ 530476619 - hạn mức ACB_SAHS_3.800 (ACB, kỳ 8)"
//        → "Thu vay đáo hạn - Hạn mức ACB_SAHS_3.800"
//   CHI  "Trả gốc BIDV_VU_2.500 - BIDV (kỳ 40)"  → "Trả gốc BIDV_VU_2.500"
//        "Trả lãi ... (ACB, kỳ 8)"               → "Trả lãi ..."
function chuanHoaNoiDung(ct: string, thu: boolean): string {
  const s = (ct ?? '').normalize('NFC').trim()
  if (!s) return ct

  // 1) Thu vay đáo hạn: bỏ số hồ sơ + "(NH, kỳ n)"
  if (thu && /^vay\s+đáo\s+hạn/i.test(s)) {
    const m = s.match(/hạn\s+mức\s+(.+?)\s*\([^()]*\)\s*$/i) ?? s.match(/hạn\s+mức\s+(\S+)/i)
    return m ? `Thu vay đáo hạn - Hạn mức ${m[1].trim()}` : ct
  }

  // 2) Mọi khoản khác: bỏ hậu tố "(kỳ n)" / "(NH, kỳ n)", và tên ngân hàng thừa phía trước ("- BIDV")
  const boKy = s.replace(/\s*\((?:[^()]*,\s*)?kỳ\s*\d+\)\s*$/i, '')
  if (boKy === s) return ct
  return boKy.replace(/\s+-\s+[A-Za-z0-9]{2,12}$/, '').trim()
}

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
    ct:  chuanHoaNoiDung(k.moTa, thu),
    a:   thu ? k.soTien : -k.soTien,
    nh:  k.nhomBaoCao ?? `${k.nhom} — ${label}`,
  }
}

export function khoanListToRows(list: KhoanDongTien[]): DongTienKHRow[] {
  return list
    .filter(k => (k.loaiKhoan ?? 'thuc-hien') === 'ke-hoach' && k.soTien > 0 && !!k.ngayDuKien)
    .map(khoanToRow)
}
