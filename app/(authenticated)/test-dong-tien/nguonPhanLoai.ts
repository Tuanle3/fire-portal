// ============================================================
// PHÂN LOẠI NGUỒN THANH TOÁN → 3 nhóm cha cho Tab Kế hoạch dòng tiền
//
//   hm  : Hạn mức công ty   — rút/trả liên tục, cần theo dõi từng nhóm, từng khoản
//   quy : Quỹ & nguồn khác  — Quỹ, NOXH, các nguồn không theo quy ước [HM]
//   vay : Vay công ty (TKV) — tài khoản vay của công ty, nguồn có đuôi [TKV_xxxx];
//                             đã giải ngân, đến hạn chỉ trả → tách riêng để theo dõi
//   cn  : Vay cá nhân       — đã giải ngân, đến hạn chỉ trả → mặc định thu gọn 1 dòng
//
// Quy ước tên nguồn hạn mức:  "[HM] NGÂNHÀNG_CHỦ_SỐTIỀN"  (vd "[HM] AGR_SON_15.345").
// Token thứ 2 là CHỦ HẠN MỨC. Chủ thuộc PERSONAL_OWNERS → vay cá nhân.
// Mặc định mọi hạn mức khác vào "hm" (sai về phía an toàn: không bao giờ vô tình
// giấu một hạn mức công ty vào dòng gộp).
//
// Muốn chuyển sang trường dữ liệu thật (Firestore) sau này: chỉ cần sửa hàm
// phanLoaiNguon() bên dưới, UI không phải đổi.
// ============================================================

export type TierId = 'hm' | 'quy' | 'vay' | 'cn'

export interface TierDef {
  id: TierId
  label: string
  desc: string
  /** mặc định mở sẵn hay thu gọn */
  open: boolean
}

// Thứ tự hiển thị trên bảng
export const TIERS: TierDef[] = [
  { id: 'hm',  label: 'Hạn mức công ty',    desc: 'Hạn mức ngắn hạn — rút/trả liên tục',                 open: true  },
  { id: 'quy', label: 'Quỹ & nguồn khác',   desc: 'Quỹ, NOXH và các nguồn khác',                         open: true  },
  { id: 'vay', label: 'Vay công ty (TKV)',  desc: 'Tài khoản vay của công ty — đến hạn chỉ trả gốc/lãi',    open: false },
  { id: 'cn',  label: 'Vay cá nhân',        desc: 'Đã giải ngân — đến hạn chỉ trả nợ định kỳ',            open: false },
]

export const TIER_DEFAULT_OPEN = Object.fromEntries(TIERS.map(t => [t.id, t.open])) as Record<TierId, boolean>

/** Chủ hạn mức là cá nhân (token thứ 2 trong tên nguồn). Thêm tên mới vào đây. */
const PERSONAL_OWNERS = new Set(['SON', 'DAI', 'TRANG', 'VU'])

/** Ngoại lệ gõ tay theo tên nguồn đầy đủ — thắng mọi quy tắc khác. */
const OVERRIDE: Record<string, TierId> = {
  // '[HM] ACB_SAP_2.000 [TKV_2289]': 'cn',
}

/** Tài khoản vay: đuôi [TKV_2289] (khác [TK_9819] là tài khoản hạn mức). */
const RE_TKV = /\[\s*TKV[\s_\-]*\w*\s*\]/i

const RE_HM = /^\[HM(?:\s*mới)?\]\s*([A-Za-z0-9]+)_([A-Za-z0-9]+)/i

export function phanLoaiNguon(src: string): TierId {
  const s = (src ?? '').trim()
  if (OVERRIDE[s]) return OVERRIDE[s]
  const m = RE_HM.exec(s)
  if (!m) return 'quy'
  if (PERSONAL_OWNERS.has(m[2].toUpperCase())) return 'cn'
  return RE_TKV.test(s) ? 'vay' : 'hm'
}
