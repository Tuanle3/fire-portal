import { BctcArApRow, BctcBsRow, BctcPlRow } from '@/lib/bctc-types'
import { ALL_DONVI, DonViInfo, FlatDoc, RawBctc } from './types'
import { maSoLevelBS, maSoSortKey, MS_BS, MS_PL, PL_BREAKDOWN_CODES } from './masocode'

export type { FlatDoc } from './types'

export function flattenBctc(raw: RawBctc | null | undefined): FlatDoc[] {
  const out: FlatDoc[] = []
  if (!raw) return out
  for (const [donViKey, byReport] of Object.entries(raw)) {
    if (!byReport) continue
    for (const byPeriod of Object.values(byReport)) {
      if (!byPeriod) continue
      for (const [period, doc] of Object.entries(byPeriod)) {
        if (!doc) continue
        out.push({ donViKey, donVi: doc.donVi, report: doc.report, period, rows: doc.rows ?? [] })
      }
    }
  }
  return out
}

export function listDonVi(docs: FlatDoc[]): DonViInfo[] {
  const map = new Map<string, string>()
  for (const d of docs) map.set(d.donViKey, d.donVi)
  return [...map.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label))
}

export function listPeriods(docs: FlatDoc[]): string[] {
  return [...new Set(docs.map(d => d.period))].sort()
}

function safeDiv(a: number, b: number): number {
  return b !== 0 ? a / b : 0
}

// Cộng dồn 1 mã số PL qua nhiều kỳ (dùng cho bộ lọc Cả năm/Theo Quý — các chỉ tiêu PL là số phát
// sinh trong kỳ nên cộng dồn hợp lý; KHÔNG dùng cho BS vì BS là số dư tại 1 thời điểm).
export function maSoSumOverPeriods(docs: FlatDoc[], donViKey: string, periods: string[], maSo: string): number {
  return periods.reduce((s, p) => s + valueByMaSo(docs, 'PL', p, maSo, donViKey), 0)
}

export interface CodeBreakdownItem { chiTieu: string; value: number }

// So khớp code bỏ qua ký tự không phải chữ/số — Sheet gốc có lỗi đánh máy thật: dòng tiêu đề
// "Thuyết minh doanh thu theo sản phẩm" ghi code "TM_DT_SP" nhưng chính các dòng con (Kinh doanh
// BĐS/Dịch vụ/Hàng hóa - R) lại ghi "TM_DTSP" (thiếu 1 dấu gạch dưới) — so khớp chính xác chuỗi
// từng khiến "Doanh thu theo sản phẩm" luôn ra 0 dù Giá vốn/Lãi gộp cùng khối vẫn đúng.
function normCode(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}
function codeMatches(codes: string[], rowCode: string): boolean {
  const normRow = normCode(rowCode)
  return codes.some(c => normCode(c) === normRow)
}

// Gom các dòng thuyết minh PL theo `code` (TM_DT_SP, TM_CP, ...) — dùng cho card "Doanh thu theo
// sản phẩm" / "Cấu trúc chi phí" vốn không có mã số BCTC riêng.
export function breakdownByCode(docs: FlatDoc[], donViKey: string, periods: string[], codes: string[]): CodeBreakdownItem[] {
  const periodSet = new Set(periods)
  const map = new Map<string, number>()
  for (const d of docs) {
    if (d.report !== 'PL') continue
    if (!periodSet.has(d.period)) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    for (const row of d.rows as BctcPlRow[]) {
      if (!codeMatches(codes, row.code)) continue
      // Dòng đầu mỗi khối thuyết minh là tiêu đề nhóm ("Thuyết minh doanh thu theo sản phẩm"...),
      // giá trị của nó = tổng các dòng con bên dưới — bỏ qua để không đếm trùng vào breakdown.
      if (row.chiTieu.trim().toLowerCase().startsWith('thuyết minh')) continue
      const label = row.chiTieu || row.code
      map.set(label, (map.get(label) ?? 0) + row.value)
    }
  }
  return [...map.entries()].map(([chiTieu, value]) => ({ chiTieu, value })).filter(it => it.value !== 0)
}

// Giống breakdownByCode nhưng lấy đúng 1 nhãn, KHÔNG lọc bỏ giá trị 0 — dùng khi cần hiện đủ cột
// (vd 1 sản phẩm không phát sinh ở quý này vẫn phải hiện "0" thay vì mất hẳn dòng khỏi bảng).
export function valueByCodeAndLabel(docs: FlatDoc[], donViKey: string, periods: string[], codes: string[], chiTieu: string): number {
  const periodSet = new Set(periods)
  let total = 0
  for (const d of docs) {
    if (d.report !== 'PL') continue
    if (!periodSet.has(d.period)) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    for (const row of d.rows as BctcPlRow[]) {
      if (codeMatches(codes, row.code) && row.chiTieu === chiTieu) total += row.value
    }
  }
  return total
}

export interface ProductPL { name: string; revenue: number; cogs: number; grossProfit: number }

// Ghép 3 khối thuyết minh theo sản phẩm (Doanh thu/Giá vốn/Lãi gộp) theo đúng tên dòng — dữ liệu
// đã có sẵn từ trước (breakdownByCode) nhưng chưa từng được ghép lại thành P&L theo từng sản phẩm.
export function productPL(docs: FlatDoc[], donViKey: string, periods: string[]): ProductPL[] {
  const rev = breakdownByCode(docs, donViKey, periods, [PL_BREAKDOWN_CODES.DOANH_THU_SP])
  const cogs = breakdownByCode(docs, donViKey, periods, [PL_BREAKDOWN_CODES.GIA_VON_SP])
  const gp = breakdownByCode(docs, donViKey, periods, [PL_BREAKDOWN_CODES.LAI_GOP_SP])
  const names = new Set([...rev, ...cogs, ...gp].map(i => i.chiTieu))
  return [...names]
    .map(name => ({
      name,
      revenue: rev.find(i => i.chiTieu === name)?.value ?? 0,
      cogs: cogs.find(i => i.chiTieu === name)?.value ?? 0,
      grossProfit: gp.find(i => i.chiTieu === name)?.value ?? 0,
    }))
    .filter(p => p.revenue !== 0 || p.cogs !== 0 || p.grossProfit !== 0)
    .sort((a, b) => b.revenue - a.revenue)
}

export function valueByMaSo(docs: FlatDoc[], report: 'BS' | 'PL', period: string, maSo: string, donViKey: string): number {
  let total = 0
  for (const d of docs) {
    if (d.report !== report || d.period !== period) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    for (const row of d.rows as (BctcBsRow | BctcPlRow)[]) {
      if (row.maSo === maSo) total += row.value
    }
  }
  return total
}

export interface Snapshot {
  period: string
  tsnh: number; tsdh: number; tongTS: number
  noNH: number; noDH: number; noPhaiTra: number
  vcsh: number; tongNguonVon: number
  hangTonKho: number; tien: number
  dtt: number; giaVon: number; laiGop: number
  cpLaiVay: number; lnThuanHDKD: number; lnTruocThue: number; lnSauThue: number
  arBalance: number; apBalance: number
}

// BS/PL của các kỳ tương lai chưa được nhập số liệu thực tế trong Sheet thường tồn tại như cột
// trống (toàn 0) — dùng để phân biệt "kỳ chưa có số liệu" với "kỳ có số liệu nhưng thực sự = 0".
export function hasSnapshotData(s: Snapshot): boolean {
  return s.tongTS !== 0 || s.dtt !== 0
}

export function computeSnapshot(docs: FlatDoc[], donViKey: string, period: string): Snapshot {
  const bs = (ms: string) => valueByMaSo(docs, 'BS', period, ms, donViKey)
  const pl = (ms: string) => valueByMaSo(docs, 'PL', period, ms, donViKey)

  let arBalance = 0
  let apBalance = 0
  for (const d of docs) {
    if (d.period !== period) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    if (d.report === 'AR') for (const r of d.rows as BctcArApRow[]) arBalance += r.no - r.co
    if (d.report === 'AP') for (const r of d.rows as BctcArApRow[]) apBalance += r.co - r.no
  }

  return {
    period,
    tsnh: bs(MS_BS.TSNH), tsdh: bs(MS_BS.TSDH), tongTS: bs(MS_BS.TONG_TS),
    noNH: bs(MS_BS.NO_NGAN_HAN), noDH: bs(MS_BS.NO_DAI_HAN), noPhaiTra: bs(MS_BS.NO_PHAI_TRA),
    vcsh: bs(MS_BS.VON_CSH), tongNguonVon: bs(MS_BS.TONG_NGUON_VON),
    hangTonKho: bs(MS_BS.HANG_TON_KHO), tien: bs(MS_BS.TIEN),
    dtt: pl(MS_PL.DTT), giaVon: pl(MS_PL.GIA_VON), laiGop: pl(MS_PL.LAI_GOP),
    cpLaiVay: pl(MS_PL.CP_LAI_VAY), lnThuanHDKD: pl(MS_PL.LN_THUAN_HDKD),
    lnTruocThue: pl(MS_PL.LN_TRUOC_THUE), lnSauThue: pl(MS_PL.LN_SAU_THUE),
    arBalance, apBalance,
  }
}

export interface Ratios {
  currentRatio: number
  quickRatio: number
  debtToEquity: number
  debtToAssets: number
  icr: number
  grossMargin: number
  netMargin: number
  roa: number
  roe: number
}

export function computeRatios(s: Snapshot): Ratios {
  return {
    currentRatio: safeDiv(s.tsnh, s.noNH),
    quickRatio: safeDiv(s.tsnh - s.hangTonKho, s.noNH),
    debtToEquity: safeDiv(s.noPhaiTra, s.vcsh),
    debtToAssets: safeDiv(s.noPhaiTra, s.tongTS),
    icr: safeDiv(s.lnTruocThue + s.cpLaiVay, s.cpLaiVay),
    grossMargin: safeDiv(s.laiGop, s.dtt),
    netMargin: safeDiv(s.lnSauThue, s.dtt),
    roa: safeDiv(s.lnSauThue, s.tongTS),
    roe: safeDiv(s.lnSauThue, s.vcsh),
  }
}

export type RatioLevel = 'good' | 'warn' | 'bad' | 'neutral'

export function levelForRatio(key: keyof Ratios, value: number): RatioLevel {
  switch (key) {
    case 'currentRatio': return value <= 0 ? 'neutral' : value < 1 ? 'bad' : value < 1.5 ? 'warn' : 'good'
    case 'quickRatio': return value <= 0 ? 'neutral' : value < 0.8 ? 'bad' : value < 1 ? 'warn' : 'good'
    case 'debtToEquity': return value <= 0 ? 'neutral' : value > 3 ? 'bad' : value > 2 ? 'warn' : 'good'
    case 'debtToAssets': return value <= 0 ? 'neutral' : value > 0.7 ? 'warn' : 'good'
    case 'icr': return value <= 0 ? 'neutral' : value < 1 ? 'bad' : value < 1.5 ? 'warn' : 'good'
    default: return 'neutral'
  }
}

export type AlertLevel = 'red' | 'yellow'
export interface Alert { level: AlertLevel; text: string }

export function buildAlerts(s: Snapshot, r: Ratios, history: Snapshot[]): Alert[] {
  const alerts: Alert[] = []

  if (s.noNH > 0) {
    if (r.currentRatio < 1) alerts.push({ level: 'red', text: `Thanh khoản hiện hành ${r.currentRatio.toFixed(2)} lần (<1) — tài sản ngắn hạn không đủ trả nợ ngắn hạn` })
    else if (r.currentRatio < 1.5) alerts.push({ level: 'yellow', text: `Thanh khoản hiện hành ${r.currentRatio.toFixed(2)} lần — cần theo dõi` })
  }

  if (s.vcsh > 0) {
    if (r.debtToEquity > 3) alerts.push({ level: 'red', text: `Nợ/Vốn CSH ${r.debtToEquity.toFixed(2)} lần — đòn bẩy rất cao` })
    else if (r.debtToEquity > 2) alerts.push({ level: 'yellow', text: `Nợ/Vốn CSH ${r.debtToEquity.toFixed(2)} lần — đòn bẩy cần theo dõi` })
  }

  if (s.cpLaiVay > 0 && r.icr < 1.5) {
    alerts.push({ level: r.icr < 1 ? 'red' : 'yellow', text: `Khả năng trả lãi vay (ICR) ${r.icr.toFixed(2)} lần — thấp` })
  }

  const last3 = history.slice(-3)
  if (last3.length === 3 && last3.every(h => h.lnThuanHDKD < 0)) {
    alerts.push({ level: 'red', text: 'Lợi nhuận thuần HĐKD âm 3 kỳ liên tiếp' })
  }

  const last3Margin = history.slice(-3).map(h => safeDiv(h.laiGop, h.dtt))
  if (last3Margin.length === 3 && last3Margin[2] < last3Margin[1] && last3Margin[1] < last3Margin[0]) {
    alerts.push({ level: 'yellow', text: 'Biên lợi nhuận gộp giảm liên tục 3 kỳ' })
  }

  return alerts
}

export interface LineItem { maSo: string; code: string; chiTieu: string; values: Record<string, number> }

// Bảng chỉ tiêu BS/PL theo mã số, cộng dồn theo đơn vị (hoặc 1 đơn vị), giá trị theo từng kỳ trong `periods`
export function buildLineItemMatrix(docs: FlatDoc[], report: 'BS' | 'PL', donViKey: string, periods: string[]): LineItem[] {
  const periodSet = new Set(periods)
  const map = new Map<string, LineItem>()
  for (const d of docs) {
    if (d.report !== report) continue
    if (!periodSet.has(d.period)) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    for (const row of d.rows as (BctcBsRow | BctcPlRow)[]) {
      if (!row.maSo) continue
      let item = map.get(row.maSo)
      if (!item) { item = { maSo: row.maSo, code: row.code, chiTieu: row.chiTieu, values: {} }; map.set(row.maSo, item) }
      if (!item.chiTieu && row.chiTieu) item.chiTieu = row.chiTieu
      item.values[d.period] = (item.values[d.period] ?? 0) + row.value
    }
  }
  return [...map.values()].sort((a, b) => maSoSortKey(a.maSo) - maSoSortKey(b.maSo) || a.maSo.localeCompare(b.maSo))
}

export interface BsGroupNode { item: LineItem; level: 0 | 1 | 2; children: LineItem[] }

// Gom các dòng Cân đối kế toán (đã sort theo mã số) thành cây 3 cấp theo maSoLevelBS — dòng cấp 2
// (chi tiết) gắn vào dòng cấp 1 (nhóm La Mã) gần nhất phía trước để có thể bung/thu khi hiển thị.
// Bảng CĐKT có quá nhiều dòng chi tiết nếu hiện phẳng hết — nhóm lại giúp dễ đọc hơn nhiều.
export function groupBsItems(items: LineItem[]): BsGroupNode[] {
  const nodes: BsGroupNode[] = []
  let currentParent: BsGroupNode | null = null
  for (const it of items) {
    const level = maSoLevelBS(it.maSo, it.chiTieu)
    if (level <= 1) {
      const node: BsGroupNode = { item: it, level, children: [] }
      nodes.push(node)
      // Cấp 0 cũng làm currentParent: mục "D - Vốn chủ sở hữu" không có nhóm La Mã con (I./II...) mà
      // đi thẳng vào chi tiết đánh số Ả Rập (1., 2.,...) — nếu không, các dòng này rơi hết ra ngoài
      // thành node rời rạc, không bung/thu được như các nhóm khác. Với A/B/C có nhóm La Mã ngay sau,
      // node La Mã đó ghi đè currentParent ngay ở vòng lặp kế tiếp nên không ảnh hưởng.
      currentParent = node
    } else if (currentParent) {
      currentParent.children.push(it)
    } else {
      nodes.push({ item: it, level: 2, children: [] })
    }
  }
  return nodes
}

export interface TopEntry { code: string; name: string; balance: number }

// Top khách nợ (AR, balance = Nợ - Có) hoặc top NCC (AP, balance = Có - Nợ) tại 1 kỳ
export function topCongNo(docs: FlatDoc[], report: 'AR' | 'AP', period: string, donViKey: string, limit = 8): TopEntry[] {
  const map = new Map<string, TopEntry>()
  for (const d of docs) {
    if (d.report !== report || d.period !== period) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    for (const row of d.rows as BctcArApRow[]) {
      const balance = report === 'AR' ? row.no - row.co : row.co - row.no
      if (!row.maDoiTuong) continue
      const key = row.maDoiTuong
      const prev = map.get(key)
      map.set(key, { code: key, name: row.tenDoiTuong, balance: (prev?.balance ?? 0) + balance })
    }
  }
  return [...map.values()].filter(e => e.balance !== 0).sort((a, b) => b.balance - a.balance).slice(0, limit)
}

export interface DebtAgingEntry { code: string; name: string; balance: number; monthsUnchanged: number }

// Công nợ "đứng yên" nhiều tháng — dư nợ cuối kỳ giữ NGUYÊN qua nhiều tháng liên tiếp nghĩa là
// không có khoản thu/chi nào phát sinh với khách/NCC đó, dấu hiệu tồn đọng rõ ràng hơn hẳn DSO/DPO
// bình quân (vốn bị pha loãng bởi các khách quay vòng nhanh). Đếm ngược từ kỳ đang xem: dư nợ phải
// GIỐNG HỆT kỳ hiện tại thì mới tính là "chưa phát sinh" — dư nợ tăng/giảm dù nhỏ vẫn coi là có phát
// sinh, dừng đếm; thiếu dữ liệu 1 kỳ (khách không xuất hiện trong Sheet tháng đó) cũng dừng đếm vì
// không chắc chắn được dư nợ có đổi hay không.
export function debtAging(
  docs: FlatDoc[], report: 'AR' | 'AP', donViKey: string, periods: string[], asOfPeriod: string, minMonths = 3,
): DebtAgingEntry[] {
  const relevantPeriods = periods.filter(p => p <= asOfPeriod).sort()
  const idx = relevantPeriods.indexOf(asOfPeriod)
  if (idx === -1) return []

  const byEntity = new Map<string, Map<string, number>>()
  const nameOf = new Map<string, string>()
  for (const d of docs) {
    if (d.report !== report) continue
    if (!relevantPeriods.includes(d.period)) continue
    if (donViKey !== ALL_DONVI && d.donViKey !== donViKey) continue
    for (const row of d.rows as BctcArApRow[]) {
      if (!row.maDoiTuong) continue
      const balance = report === 'AR' ? row.no - row.co : row.co - row.no
      const perPeriod = byEntity.get(row.maDoiTuong) ?? new Map<string, number>()
      perPeriod.set(d.period, (perPeriod.get(d.period) ?? 0) + balance)
      byEntity.set(row.maDoiTuong, perPeriod)
      if (row.tenDoiTuong) nameOf.set(row.maDoiTuong, row.tenDoiTuong)
    }
  }

  const out: DebtAgingEntry[] = []
  for (const [code, perPeriod] of byEntity) {
    const cur = perPeriod.get(asOfPeriod) ?? 0
    if (cur === 0) continue
    let months = 1
    for (let i = idx - 1; i >= 0; i--) {
      const v = perPeriod.get(relevantPeriods[i])
      if (v === undefined || v !== cur) break
      months++
    }
    if (months >= minMonths) out.push({ code, name: nameOf.get(code) ?? code, balance: cur, monthsUnchanged: months })
  }
  return out.sort((a, b) => b.monthsUnchanged - a.monthsUnchanged || b.balance - a.balance)
}

// DSO/DPO ước tính theo vòng quay 30 ngày — dùng chung cho card hiển thị lẫn cảnh báo để không lệch
// công thức giữa 2 nơi.
export function congNoDsoDpo(s: Snapshot): { dso: number | null; dpo: number | null } {
  return {
    dso: s.dtt > 0 ? (s.arBalance / s.dtt) * 30 : null,
    dpo: s.giaVon > 0 ? (s.apBalance / s.giaVon) * 30 : null,
  }
}

// Cảnh báo công nợ — dựa trên đúng dữ liệu đang có (số dư Nợ/Có theo tháng), KHÔNG có ngày đến hạn
// hoá đơn nên không tính được "quá hạn" thật; thay bằng các dấu hiệu rủi ro suy ra được: vòng quay
// thu/trả chậm bất thường, tập trung công nợ vào 1 khách/NCC, và phải thu phình to hơn doanh thu.
export function buildCongNoAlerts(
  s: Snapshot, dso: number | null, dpo: number | null,
  topAR: TopEntry[], topAP: TopEntry[], history: Snapshot[],
  arAging: DebtAgingEntry[] = [], apAging: DebtAgingEntry[] = [],
): Alert[] {
  const alerts: Alert[] = []

  if (arAging.length > 0) {
    const worst = arAging[0].monthsUnchanged
    alerts.push({
      level: worst >= 6 ? 'red' : 'yellow',
      text: `${arAging.length} khách hàng có dư nợ phải thu không đổi ≥3 tháng (cao nhất ${worst} tháng, "${arAging[0].name}") — cần lên kế hoạch thu hồi, xem chi tiết bên dưới`,
    })
  }
  if (apAging.length > 0) {
    const worst = apAging[0].monthsUnchanged
    alerts.push({
      level: worst >= 6 ? 'red' : 'yellow',
      text: `${apAging.length} nhà cung cấp có dư nợ phải trả không đổi ≥3 tháng (cao nhất ${worst} tháng, "${apAging[0].name}") — cần rà soát lý do chưa thanh toán, xem chi tiết bên dưới`,
    })
  }

  if (dso != null) {
    if (dso > 90) alerts.push({ level: 'red', text: `Vòng quay thu tiền (DSO) ước tính ${dso.toFixed(0)} ngày — khách hàng thanh toán rất chậm, rủi ro thu hồi` })
    else if (dso > 60) alerts.push({ level: 'yellow', text: `Vòng quay thu tiền (DSO) ước tính ${dso.toFixed(0)} ngày — cần theo dõi tốc độ thu hồi công nợ` })
  }

  if (dpo != null) {
    if (dpo > 120) alerts.push({ level: 'red', text: `Vòng quay trả tiền (DPO) ước tính ${dpo.toFixed(0)} ngày — trả NCC rất chậm, rủi ro ảnh hưởng quan hệ nhà cung cấp` })
    else if (dpo > 90) alerts.push({ level: 'yellow', text: `Vòng quay trả tiền (DPO) ước tính ${dpo.toFixed(0)} ngày — cần theo dõi` })
  }

  if (s.arBalance > 0 && topAR.length > 0) {
    const pct = topAR[0].balance / s.arBalance
    if (pct > 0.6) alerts.push({ level: 'red', text: `${topAR[0].name || topAR[0].code} chiếm ${(pct * 100).toFixed(0)}% tổng phải thu — rủi ro tập trung vào 1 khách hàng` })
    else if (pct > 0.4) alerts.push({ level: 'yellow', text: `${topAR[0].name || topAR[0].code} chiếm ${(pct * 100).toFixed(0)}% tổng phải thu — cần theo dõi mức độ tập trung` })
  }

  if (s.apBalance > 0 && topAP.length > 0) {
    const pct = topAP[0].balance / s.apBalance
    if (pct > 0.6) alerts.push({ level: 'red', text: `${topAP[0].name || topAP[0].code} chiếm ${(pct * 100).toFixed(0)}% tổng phải trả — rủi ro phụ thuộc vào 1 nhà cung cấp` })
    else if (pct > 0.4) alerts.push({ level: 'yellow', text: `${topAP[0].name || topAP[0].code} chiếm ${(pct * 100).toFixed(0)}% tổng phải trả — cần theo dõi mức độ tập trung` })
  }

  const last3 = history.slice(-3)
  if (last3.length === 3 && last3[2].arBalance > last3[1].arBalance && last3[1].arBalance > last3[0].arBalance && last3[2].dtt <= last3[0].dtt) {
    alerts.push({ level: 'yellow', text: 'Công nợ phải thu tăng liên tục 3 kỳ trong khi doanh thu không tăng tương ứng — rủi ro thu hồi' })
  }

  if (s.vcsh > 0 && s.arBalance - s.apBalance < 0 && Math.abs(s.arBalance - s.apBalance) > 0.2 * s.vcsh) {
    alerts.push({ level: 'yellow', text: 'Đang bị đối tác chiếm dụng vốn đáng kể so với vốn chủ sở hữu — ảnh hưởng dòng tiền' })
  }

  return alerts
}
