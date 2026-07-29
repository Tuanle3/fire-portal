import { BctcArApRow, BctcBsRow, BctcPlRow } from '@/lib/bctc-types'
import { ALL_DONVI, DonViInfo, FlatDoc, RawBctc } from './types'
import { MS_BS, MS_PL } from './masocode'

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
  return [...map.values()].sort((a, b) => (Number(a.maSo) || 0) - (Number(b.maSo) || 0))
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
