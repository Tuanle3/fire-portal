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
import { DEFAULT_ITEMS, type NganSachItem } from '@/lib/ngan-sach-types'

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


// ── ĐỒNG NHẤT NHÓM ────────────────────────────────────────────
// Trước đây `nh` lấy từ bản sao chuỗi `nhomBaoCao` lưu trong từng khoản → đổi tên/số thứ tự nhóm
// ở bảng ngân sách là các khoản cũ vẫn giữ tên cũ → báo cáo tách thành nhiều nhóm giống nhau.
// Giờ: tên nhóm luôn lấy từ bảng ngân sách HIỆN TẠI (nguồn duy nhất), tra theo mã KMCP của nhóm
// (hoặc theo tên nếu khoản cũ không có mã). Không tra được mới dùng chuỗi lưu sẵn.
export type NhomResolver = (k: KhoanDongTien) => string | undefined

const norm    = (v?: string) => (v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
const tenBang = (v?: string) => (v ?? '').replace(/^\s*\d+\s*[.)]\s*/, '')   // bỏ "1. " đầu tên

export function buildNhomResolver(items: NganSachItem[]): NhomResolver {
  const byMa  = new Map<string, string>()
  const byTen = new Map<string, string>()
  const groups = items.filter(g => g.is_group && (g.nhom === 'B' || g.nhom === 'C'))
  const groupById = new Map(groups.map(g => [g.id, g]))
  const byStt = new Map<string, NganSachItem>()
  const fullOf = (g: NganSachItem) => {
    const ten = (g.dien_giai ?? '').normalize('NFC').trim().replace(/\s+/g, ' ')
    const stt = String(g.stt ?? '').trim()
    return stt ? `${stt}. ${ten}` : ten
  }

  // Lượt 1: bản thân các nhóm (mã nhóm + tên nhóm)
  for (const g of groups) {
    const ten = (g.dien_giai ?? '').normalize('NFC').trim().replace(/\s+/g, ' ')
    if (!ten) continue
    const s = String(g.stt ?? '').trim()
    if (s) byStt.set(`${g.nhom}|${s}`, g)
    byMa.set(`${g.nhom}|${norm((g.kmcp ?? '').trim() || '@' + ten)}`, fullOf(g))
    byTen.set(`${g.nhom}|${norm(ten)}`, fullOf(g))
  }

  // Lượt 2: các dòng con (mã KMCP chi tiết) → nhóm chứa nó (cùng cách xác định như ownerOf ở TabKeHoach)
  let cur: NganSachItem | null = null
  for (const it of items) {
    if (it.is_section) { cur = null; continue }
    if (it.is_group)   { cur = groupById.get(it.id) ?? null; continue }
    const ma = (it.kmcp ?? '').trim()
    if (!ma) continue
    const s = String(it.stt ?? '').trim()
    const dot = s.lastIndexOf('.')
    let g: NganSachItem | undefined = dot > 0 ? byStt.get(`${it.nhom}|${s.slice(0, dot)}`) : undefined
    if (!g && it.parent_id) g = groupById.get(it.parent_id)
    if (!g && cur) g = cur
    const key = `${it.nhom}|${norm(ma)}`
    if (g && !byMa.has(key)) byMa.set(key, fullOf(g))
  }

  return k => {
    const sec = k.loai === 'thu' ? 'B' : 'C'
    return byMa.get(`${sec}|${norm(k.nhom as string)}`)
        ?? byTen.get(`${sec}|${norm(tenBang(k.nhomBaoCao))}`)
        ?? byTen.get(`${sec}|${norm(tenBang(k.nhomChaLabel))}`)
  }
}

export function khoanToRow(k: KhoanDongTien, resolveNhom?: NhomResolver): DongTienKHRow {
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
    nh:  resolveNhom?.(k) ?? k.nhomBaoCao ?? `${k.nhom} — ${label}`,
  }
}

export function khoanListToRows(list: KhoanDongTien[], resolveNhom?: NhomResolver): DongTienKHRow[] {
  return list
    .filter(k => (k.loaiKhoan ?? 'thuc-hien') === 'ke-hoach' && k.soTien > 0 && !!k.ngayDuKien)
    .map(k => khoanToRow(k, resolveNhom))
}
