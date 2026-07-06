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

export interface MeterReading {
  id: string          // `${meterId}_${month}`
  meterId: MeterId
  month: string        // YYYY-MM
  bands: Bands
  vatPercent: number
  note: string
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

export interface Customer {
  id: string
  name: string
  meterId: MeterId
  chargeType: ChargeType
  flatUnitPrice: number   // (cũ, giữ để tương thích) đơn giá gồm VAT cho flat_vat_incl
  areaM2: number          // dùng cho fixed_area
  pricePerM2: number      // (cũ, giữ để tương thích) đơn giá/m²/tháng cho fixed_area
  flatPriceHistory?: PricePoint[]  // bảng giá theo thời điểm cho flat_vat_incl (đ/đơn vị, đã gồm VAT)
  areaPriceHistory?: PricePoint[]  // bảng giá theo thời điểm cho fixed_area (đ/m²/tháng)
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

export interface CustomerUsage {
  id: string              // `${customerId}_${month}`
  customerId: string
  month: string
  totalUnit: number                          // dùng cho flat_vat_incl (tổng kWh/m³ trong tháng)
  bandsKwh: Partial<Record<BandKey, number>>  // dùng cho timeband_excl_vat
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
    const subtotal = BAND_KEYS.reduce((s, k) => s + (bandsKwh[k] ?? 0) * reading.bands[k].donGia, 0)
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
