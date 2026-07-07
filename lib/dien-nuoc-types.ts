// ── Điện nước SA.ĐT — types & công thức tính toán ──────────────────────────────

export type BandKey = 'caoDiem' | 'thapDiem' | 'binhThuong' | 'toanThoiGian'

export const BAND_KEYS: BandKey[] = ['caoDiem', 'thapDiem', 'binhThuong', 'toanThoiGian']

export const BAND_LABELS: Record<BandKey, string> = {
  caoDiem: 'Cao điểm', thapDiem: 'Thấp điểm', binhThuong: 'Bình thường', toanThoiGian: 'Toàn thời gian',
}

export interface BandInput { kwh: number; donGia: number }

export type Bands = Record<BandKey, BandInput>

export const EMPTY_BANDS: Bands = {
  caoDiem: { kwh: 0, donGia: 0 }, thapDiem: { kwh: 0, donGia: 0 },
  binhThuong: { kwh: 0, donGia: 0 }, toanThoiGian: { kwh: 0, donGia: 0 },
}

// 1, 2 = 2 đồng hồ điện chính; 3 = đồng hồ nước
export type MeterId = 1 | 2 | 3

export const METER_LABELS: Record<MeterId, string> = {
  1: 'Đồng hồ điện 1', 2: 'Đồng hồ điện 2 (máy lạnh trung tâm)', 3: 'Đồng hồ nước',
}
export const METER_UNIT: Record<MeterId, string> = { 1: 'kWh', 2: 'kWh', 3: 'm³' }

// Tên đồng hồ hiển thị: dùng tên tùy chỉnh (do admin sửa) nếu có, không thì dùng mặc định.
export function meterLabel(customNames: Partial<Record<number, string>> | undefined, id: MeterId): string {
  return customNames?.[id]?.trim() || METER_LABELS[id]
}

// ── Đồng hồ 1: số ghi điện từng khu (tầng) & tỷ lệ chia khung giờ cho BQT ─────
// Mỗi khu khớp với "Nhóm khách hàng" (group) để trừ sản lượng khách trong khu đó.
export interface FloorReading { group: string; indexOld: number; indexNew: number }
export interface BqtRatio { caoDiem: number; thapDiem: number; binhThuong: number }
export const DEFAULT_BQT_RATIO: BqtRatio = { binhThuong: 50, caoDiem: 15, thapDiem: 35 }
export const DEFAULT_FLOOR_GROUPS = ['Tầng 1 + hầm', 'Tầng 2', 'Tầng 3']
export function defaultFloorReadings(): FloorReading[] {
  return DEFAULT_FLOOR_GROUPS.map(g => ({ group: g, indexOld: 0, indexNew: 0 }))
}

export interface MeterReading {
  id: string          // `${meterId}_${month}`
  meterId: MeterId
  month: string        // YYYY-MM
  bands: Bands
  vatPercent: number
  note: string
  floorReadings?: FloorReading[]   // chỉ dùng cho đồng hồ 1: số ghi điện từng khu
  bqtRatio?: BqtRatio              // chỉ dùng cho đồng hồ 1: tỷ lệ chia khung giờ cho BQT (%)
  createdAt: string
  updatedAt: string
}

// flat_vat_incl : khách ki-ốt — đơn giá cố định đã gồm VAT, nhân với tổng kWh dùng
// timeband_excl_vat : khách công ty — dùng theo từng khung giờ, đơn giá chưa VAT (lấy theo đơn giá của đồng hồ tháng đó) + VAT
// fixed_area : khách ký cố định theo diện tích (VD: Vin) — areaM2 * pricePerM2, không phụ thuộc chỉ số điện
// remainder : gánh phần còn lại sau khi trừ hết các khách khác (VD: Ban quản trị, SAG)
export type ChargeType = 'flat_vat_incl' | 'timeband_excl_vat' | 'fixed_area' | 'remainder'

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  flat_vat_incl:    'Giá cố định (đã gồm VAT)',
  timeband_excl_vat:'Theo khung giờ (chưa VAT)',
  fixed_area:       'Cố định theo diện tích (m²)',
  remainder:        'Gánh phần còn lại',
}

// Một mốc giá có hiệu lực từ tháng `fromMonth` (YYYY-MM). fromMonth rỗng = áp dụng từ đầu.
export interface PricePoint { fromMonth: string; price: number }

// Mốc đơn giá theo khung giờ (chưa VAT) cho khách timeband — 1 mốc gồm giá 3 khung giờ, áp dụng từ `fromMonth`.
export interface TimebandPricePoint { fromMonth: string; caoDiem: number; thapDiem: number; binhThuong: number }

export interface Customer {
  id: string
  name: string
  group?: string          // Nhóm khách hàng (tự do) — dùng để tổng hợp/gom nhóm
  meterId: MeterId
  chargeType: ChargeType
  flatUnitPrice: number   // (cũ, giữ để tương thích) đơn giá gồm VAT cho flat_vat_incl
  areaM2: number          // dùng cho fixed_area
  pricePerM2: number      // (cũ, giữ để tương thích) đơn giá/m²/tháng cho fixed_area
  flatPriceHistory?: PricePoint[]  // bảng giá theo thời điểm cho flat_vat_incl (đ/đơn vị, đã gồm VAT)
  areaPriceHistory?: PricePoint[]  // bảng giá theo thời điểm cho fixed_area (đ/m²/tháng)
  timebandPriceHistory?: TimebandPricePoint[]  // bảng đơn giá theo khung giờ & thời điểm cho timeband_excl_vat (chưa VAT)
  floor: string           // Tầng
  kioskCode: string       // Mã ki-ốt
  kioskOwner: string      // Chủ ki-ốt
  tenantName: string      // Khách hàng thuê (người đang thuê/vận hành thực tế)
  active: boolean
  note: string
  createdAt: string
}

// Giá có hiệu lực cho tháng `month`: lấy mốc mới nhất có fromMonth <= month.
// Nếu month đứng trước mọi mốc thì dùng mốc sớm nhất. Không có history thì dùng fallback (giá tĩnh cũ).
export function resolvePrice(history: PricePoint[] | undefined, fallback: number, month: string): number {
  const valid = (history ?? []).filter(p => Number(p.price) > 0)
  if (valid.length === 0) return fallback
  const applicable = valid.filter(p => (p.fromMonth || '') <= month).sort((a, b) => (b.fromMonth || '').localeCompare(a.fromMonth || ''))
  if (applicable.length > 0) return applicable[0].price
  const earliest = [...valid].sort((a, b) => (a.fromMonth || '').localeCompare(b.fromMonth || ''))[0]
  return earliest.price
}

// Mốc đơn giá khung giờ có hiệu lực cho tháng `month`: mốc mới nhất có fromMonth <= month (giống resolvePrice).
export function resolveTimebandPoint(history: TimebandPricePoint[] | undefined, month: string): TimebandPricePoint | null {
  const valid = (history ?? []).filter(p => p.caoDiem > 0 || p.thapDiem > 0 || p.binhThuong > 0)
  if (valid.length === 0) return null
  const applicable = valid.filter(p => (p.fromMonth || '') <= month).sort((a, b) => (b.fromMonth || '').localeCompare(a.fromMonth || ''))
  if (applicable.length > 0) return applicable[0]
  return [...valid].sort((a, b) => (a.fromMonth || '').localeCompare(b.fromMonth || ''))[0]
}

export interface CustomerUsage {
  id: string              // `${customerId}_${month}`
  customerId: string
  month: string
  totalUnit: number                          // dùng cho flat_vat_incl (tổng kWh/m³ trong tháng) = chỉ số mới − cũ
  bandsKwh: Partial<Record<BandKey, number>>  // dùng cho timeband_excl_vat = chỉ số mới − cũ từng khung
  // Chỉ số công tơ của khách (để tự tính sản lượng). Chỉ số cũ tháng này = chỉ số mới tháng trước.
  indexOld?: number                                 // flat_vat_incl: chỉ số cũ
  indexNew?: number                                 // flat_vat_incl: chỉ số mới
  bandsIndexOld?: Partial<Record<BandKey, number>>  // timeband: chỉ số cũ từng khung
  bandsIndexNew?: Partial<Record<BandKey, number>>  // timeband: chỉ số mới từng khung
  createdAt: string
  updatedAt: string
}

export interface Payment {
  id: string
  customerId: string
  month: string
  amount: number
  paidAt: string
  note: string
  createdAt: string
}

// ── Công thức ────────────────────────────────────────────────────────────────
export function bandMoney(b: BandInput): number { return b.kwh * b.donGia }

export function meterSubtotal(bands: Bands): number {
  return BAND_KEYS.reduce((s, k) => s + bandMoney(bands[k]), 0)
}
export function meterVat(bands: Bands, vatPercent: number): number {
  return meterSubtotal(bands) * vatPercent / 100
}
export function meterTotal(bands: Bands, vatPercent: number): number {
  return meterSubtotal(bands) + meterVat(bands, vatPercent)
}

export function customerCharge(customer: Customer, usage: CustomerUsage | undefined, reading: MeterReading | undefined): number {
  const month = usage?.month || reading?.month || ''
  if (customer.chargeType === 'flat_vat_incl') {
    const price = resolvePrice(customer.flatPriceHistory, customer.flatUnitPrice, month)
    return (usage?.totalUnit ?? 0) * price
  }
  if (customer.chargeType === 'timeband_excl_vat') {
    if (!reading) return 0
    const bandsKwh = usage?.bandsKwh ?? {}
    // Đơn giá riêng của khách theo mốc thời điểm; khung nào chưa set thì dùng đơn giá của đồng hồ tháng đó.
    const pt = resolveTimebandPoint(customer.timebandPriceHistory, month)
    const subtotal = (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((s, k) => {
      const custPrice = pt?.[k] ?? 0
      const price = custPrice > 0 ? custPrice : reading.bands[k].donGia
      return s + (bandsKwh[k] ?? 0) * price
    }, 0)
    return subtotal * (1 + reading.vatPercent / 100)
  }
  if (customer.chargeType === 'fixed_area') {
    const price = resolvePrice(customer.areaPriceHistory, customer.pricePerM2, month)
    return customer.areaM2 * price
  }
  return 0 // remainder tính ở meterAllocation
}

export interface AllocationRow { customer: Customer; amount: number }
export interface Allocation {
  total: number          // tổng tiền đồng hồ tháng đó (đã gồm VAT)
  allocated: number       // tổng đã charge cho khách có đơn giá cụ thể (không tính remainder)
  remainderTotal: number  // phần còn lại, chia cho các khách loại "remainder"
  rows: AllocationRow[]
}

export function meterAllocation(reading: MeterReading, customers: Customer[], usages: CustomerUsage[]): Allocation {
  const meterCustomers    = customers.filter(c => c.meterId === reading.meterId && c.active)
  const priced            = meterCustomers.filter(c => c.chargeType !== 'remainder')
  const remainderCustomers = meterCustomers.filter(c => c.chargeType === 'remainder')
  const usageByCustomer   = new Map(usages.filter(u => u.month === reading.month).map(u => [u.customerId, u]))

  const pricedRows: AllocationRow[] = priced.map(c => ({ customer: c, amount: customerCharge(c, usageByCustomer.get(c.id), reading) }))
  const allocated = pricedRows.reduce((s, r) => s + r.amount, 0)
  const total = meterTotal(reading.bands, reading.vatPercent)
  const remainderTotal = Math.max(0, total - allocated)
  const perRemainder = remainderCustomers.length ? remainderTotal / remainderCustomers.length : 0
  const remainderRows: AllocationRow[] = remainderCustomers.map(c => ({ customer: c, amount: perRemainder }))

  return { total, allocated, remainderTotal, rows: [...pricedRows, ...remainderRows] }
}

// Chi tiết phần còn lại theo khung giờ (chỉ áp dụng ý nghĩa đầy đủ cho khách timeband_excl_vat;
// khách flat/fixed được trừ thẳng vào tổng, không gắn với khung giờ cụ thể).
export function remainderByBand(reading: MeterReading, customers: Customer[], usages: CustomerUsage[]): Record<BandKey, number> {
  const timebandCustomers = customers.filter(c => c.meterId === reading.meterId && c.active && c.chargeType === 'timeband_excl_vat')
  const usageByCustomer = new Map(usages.filter(u => u.month === reading.month).map(u => [u.customerId, u]))
  const out: Record<BandKey, number> = { caoDiem: 0, thapDiem: 0, binhThuong: 0, toanThoiGian: 0 }
  for (const k of BAND_KEYS) {
    const usedByCustomers = timebandCustomers.reduce((s, c) => s + (usageByCustomer.get(c.id)?.bandsKwh?.[k] ?? 0), 0)
    out[k] = Math.max(0, bandMoney(reading.bands[k]) - usedByCustomers * reading.bands[k].donGia)
  }
  return out
}

// ── Đơn giá tháng gần nhất & phát hiện sai lệch ──────────────────────────────

// Tìm reading gần nhất TRƯỚC tháng `beforeMonth` của 1 đồng hồ (readings đã sort theo month tăng dần hay không đều được).
export function lastReadingBefore(readings: MeterReading[], meterId: MeterId, beforeMonth: string): MeterReading | null {
  const candidates = readings.filter(r => r.meterId === meterId && r.month < beforeMonth).sort((a, b) => b.month.localeCompare(a.month))
  return candidates[0] ?? null
}

// Danh sách band mà đơn giá tháng này khác đơn giá tháng trước đó (đơn giá đổi bất thường, vì mặc định đã tự điền theo tháng trước).
export function bandsWithPriceChange(current: Bands, prevReading: MeterReading | null): BandKey[] {
  if (!prevReading) return []
  return BAND_KEYS.filter(k => current[k].donGia !== prevReading.bands[k].donGia && (current[k].donGia > 0 || prevReading.bands[k].donGia > 0))
}

// So sản lượng/tổng tiền tháng này với trung bình N tháng gần nhất trước đó — lệch quá `thresholdPct` (mặc định 30%) coi là bất thường.
export function isAmountAnomalous(currentTotal: number, priorReadings: MeterReading[], thresholdPct = 0.3): boolean {
  if (priorReadings.length === 0 || currentTotal === 0) return false
  const avg = priorReadings.reduce((s, r) => s + meterTotal(r.bands, r.vatPercent), 0) / priorReadings.length
  if (avg === 0) return false
  return Math.abs(currentTotal - avg) / avg > thresholdPct
}

// ── Tính tiền điện BQT (Ban quản trị) cho đồng hồ 1 ──────────────────────────
const ELECTRIC_BANDS = ['caoDiem', 'thapDiem', 'binhThuong'] as const

// Sản lượng (kWh) 1 khách đã dùng trong tháng (theo loại tính tiền).
export function usageKwh(customer: Customer, usage: CustomerUsage | undefined): number {
  if (!usage) return 0
  if (customer.chargeType === 'timeband_excl_vat') {
    const b = usage.bandsKwh ?? {}
    return (b.caoDiem ?? 0) + (b.thapDiem ?? 0) + (b.binhThuong ?? 0)
  }
  return usage.totalUnit ?? 0  // flat_vat_incl; các loại khác không theo kWh (=0)
}

export interface BqtFloorRow { group: string; floorKwh: number; customerKwh: number; bqtKwh: number }
export interface BqtBandRow { key: BandKey; ratioPct: number; kwh: number; price: number; amount: number }
export interface BqtCalc {
  floors: BqtFloorRow[]
  sumFloorKwh: number      // tổng kWh ghi các tầng
  mainMeterKwh: number     // tổng kWh đồng hồ chính (cao+thấp+bình)
  discrepancy: number      // chênh lệch đồng hồ chính − tổng ghi tầng (tính cho BQT)
  bqtTotalKwh: number      // tổng kWh BQT phải chịu
  bands: BqtBandRow[]
  subtotal: number
  vat: number
  total: number
  ratioSum: number         // tổng % (để cảnh báo nếu ≠ 100)
}

// Tính toàn bộ phần BQT: kWh từng khu (= ghi tầng − khách trong nhóm), cộng chênh lệch,
// rồi chia tổng theo tỷ lệ khung giờ × đơn giá đồng hồ tháng đó.
export function computeBqt(
  reading: MeterReading,
  customers: Customer[],
  usages: CustomerUsage[],
  ratio: BqtRatio = DEFAULT_BQT_RATIO,
): BqtCalc {
  const floorReadings = reading.floorReadings ?? []
  const usageByCustomer = new Map(usages.filter(u => u.month === reading.month).map(u => [u.customerId, u]))
  const meterCustomers = customers.filter(c => c.meterId === reading.meterId && c.active)

  const floors: BqtFloorRow[] = floorReadings.map(f => {
    const floorKwh = Math.max(0, (f.indexNew || 0) - (f.indexOld || 0))
    const g = (f.group || '').trim()
    const customerKwh = meterCustomers
      .filter(c => (c.group || '').trim() === g && g !== '')
      .reduce((s, c) => s + usageKwh(c, usageByCustomer.get(c.id)), 0)
    return { group: f.group, floorKwh, customerKwh, bqtKwh: Math.max(0, floorKwh - customerKwh) }
  })

  const sumFloorKwh = floors.reduce((s, f) => s + f.floorKwh, 0)
  const mainMeterKwh = ELECTRIC_BANDS.reduce((s, k) => s + (reading.bands[k]?.kwh || 0), 0)
  const discrepancy = mainMeterKwh - sumFloorKwh
  const bqtFloorKwh = floors.reduce((s, f) => s + f.bqtKwh, 0)
  const bqtTotalKwh = Math.max(0, bqtFloorKwh + discrepancy)

  const ratioSum = ratio.caoDiem + ratio.thapDiem + ratio.binhThuong
  const bands: BqtBandRow[] = ELECTRIC_BANDS.map(k => {
    const ratioPct = ratio[k] || 0
    const kwh = bqtTotalKwh * ratioPct / 100
    const price = reading.bands[k]?.donGia || 0
    return { key: k, ratioPct, kwh, price, amount: kwh * price }
  })
  const subtotal = bands.reduce((s, b) => s + b.amount, 0)
  const vat = subtotal * reading.vatPercent / 100
  return { floors, sumFloorKwh, mainMeterKwh, discrepancy, bqtTotalKwh, bands, subtotal, vat, total: subtotal + vat, ratioSum }
}
