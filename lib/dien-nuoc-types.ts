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

// ── Loại sử dụng (dịch vụ) 1 khách có thể đăng ký cùng lúc ────────────────────
// dh1/dh2/nuoc = 3 đồng hồ; phiql = phí quản lý (không có đồng hồ). Một khách chọn
// nhiều dịch vụ ⇒ hiện ở nhiều tab, mỗi dịch vụ có cách tính tiền & đơn giá riêng.
export type ServiceId = 'dh1' | 'dh2' | 'nuoc' | 'phiql' | 'phi_khac'
export const SERVICE_IDS: ServiceId[] = ['dh1', 'dh2', 'nuoc', 'phiql']
export const METER_SERVICE: Record<MeterId, ServiceId> = { 1: 'dh1', 2: 'dh2', 3: 'nuoc' }
export const SERVICE_METER: Partial<Record<ServiceId, MeterId>> = { dh1: 1, dh2: 2, nuoc: 3 }
export function serviceLabel(s: ServiceId, customNames?: Partial<Record<number, string>>): string {
  return s === 'phiql' ? 'Phí quản lý' : meterLabel(customNames, SERVICE_METER[s]!)
}

// ── Đồng hồ 1: số ghi điện từng khu (tầng) & tỷ lệ chia khung giờ cho BQT ─────
// Mỗi khu khớp với "Nhóm khách hàng" (group) để trừ sản lượng khách trong khu đó.
// Số ghi từng tầng nhập theo 3 khung giờ (cao/thấp/bình), mỗi khung có chỉ số cũ/mới.
export type FloorBandKey = 'caoDiem' | 'thapDiem' | 'binhThuong'
export const FLOOR_BAND_KEYS: FloorBandKey[] = ['caoDiem', 'thapDiem', 'binhThuong']
export interface FloorBandIndex { indexOld: number; indexNew: number }
export type FloorBands = Record<FloorBandKey, FloorBandIndex>
// fixed = khu tính cố định (không theo khung giờ): chỉ dùng 1 chỉ số tổng, lưu ở khung Bình thường.
// commonTM = khu thuộc "3 tầng thương mại chung" (Tầng 1/2/3) — sản lượng gom vào phần Sơn An thu hộ, chia theo tỷ lệ khung giờ.
export interface FloorReading { group: string; bands: FloorBands; fixed?: boolean; commonTM?: boolean }

export interface BqtRatio { caoDiem: number; thapDiem: number; binhThuong: number }
export const DEFAULT_BQT_RATIO: BqtRatio = { binhThuong: 50, caoDiem: 15, thapDiem: 35 }
export const DEFAULT_FLOOR_GROUPS = ['Tầng 1 + hầm', 'Tầng 2', 'Tầng 3 - A1', 'Tầng 3 - A2']

export function emptyFloorBands(): FloorBands {
  return { caoDiem: { indexOld: 0, indexNew: 0 }, thapDiem: { indexOld: 0, indexNew: 0 }, binhThuong: { indexOld: 0, indexNew: 0 } }
}
export function defaultFloorReadings(): FloorReading[] {
  return DEFAULT_FLOOR_GROUPS.map(g => ({ group: g, bands: emptyFloorBands() }))
}

// ── Đồng hồ nước (meterId 3): số ghi nước từng tầng ──────────────────────────
// Nước KHÔNG chia khung giờ. Tận dụng lại 3 khe của FloorBands làm 3 ĐỒNG HỒ NƯỚC vật lý
// mỗi tầng (như bảng "CHỈ SỐ NƯỚC THÁNG" trong Excel): mỗi đồng hồ có chỉ số cũ/mới ⇒ tiêu thụ.
// Nhờ vậy tái dùng nguyên prefill/normalize/lưu trữ, không phải đổi schema hay store.
export const WATER_METER_KEYS: FloorBandKey[] = FLOOR_BAND_KEYS
export const WATER_METER_LABELS: Record<FloorBandKey, string> = {
  caoDiem: 'Đồng hồ 1', thapDiem: 'Đồng hồ 2', binhThuong: 'Đồng hồ 3',
}
export const DEFAULT_WATER_FLOOR_GROUPS = ['Tầng 1', 'Tầng 2 - A1', 'Tầng 2 - A2', 'Tầng 3 - A1', 'Tầng 3 - A2']
export function defaultWaterFloorReadings(): FloorReading[] {
  return DEFAULT_WATER_FLOOR_GROUPS.map(g => ({ group: g, bands: emptyFloorBands() }))
}
// Tổng tiêu thụ nước 1 tầng = tổng (mới − cũ) của cả 3 đồng hồ.
export function waterFloorTotal(f: FloorReading): number {
  return WATER_METER_KEYS.reduce((s, k) => s + floorBandKwh(f.bands?.[k]), 0)
}
export function floorBandKwh(b: FloorBandIndex | undefined): number {
  return Math.max(0, (b?.indexNew || 0) - (b?.indexOld || 0))
}
export function floorTotalKwh(f: FloorReading): number {
  if (f.fixed) return floorBandKwh(f.bands?.binhThuong)  // khu cố định: chỉ tính 1 chỉ số tổng
  return FLOOR_BAND_KEYS.reduce((s, k) => s + floorBandKwh(f.bands?.[k]), 0)
}

// kWh của 1 khu theo từng khung giờ.
// - Khu thường: lấy kWh thực từng khung (mới − cũ).
// - Khu cố định: tổng (mới − cũ) tự chia theo tỷ lệ BQT (mặc định BT 50% · CĐ 15% · TĐ 35%).
export function floorBandKwhSplit(f: FloorReading, k: FloorBandKey, ratio: BqtRatio): number {
  if (!f.fixed) return floorBandKwh(f.bands?.[k])
  const total = floorBandKwh(f.bands?.binhThuong)
  const sum = (ratio.caoDiem || 0) + (ratio.thapDiem || 0) + (ratio.binhThuong || 0)
  if (sum <= 0) return k === 'binhThuong' ? total : 0
  return total * (ratio[k] || 0) / sum
}
// Chuẩn hoá dữ liệu tầng (tương thích dữ liệu cũ dạng { indexOld, indexNew } gộp vào Bình thường).
export function normalizeFloor(f: unknown): FloorReading {
  const o = (f ?? {}) as Record<string, unknown>
  const fx = o.fixed === true ? { fixed: true as const } : {}  // chỉ gắn key khi thật sự cố định (tránh undefined khi lưu Firestore)
  const tm = o.commonTM === true ? { commonTM: true as const } : {}  // khu thuộc 3 tầng TM chung
  if (o.bands) {
    const rb = o.bands as Record<string, { indexOld?: number; indexNew?: number }>
    const bands = emptyFloorBands()
    for (const k of FLOOR_BAND_KEYS) bands[k] = { indexOld: Number(rb[k]?.indexOld ?? 0), indexNew: Number(rb[k]?.indexNew ?? 0) }
    return { group: (o.group as string) ?? '', bands, ...fx, ...tm }
  }
  const bands = emptyFloorBands()
  bands.binhThuong = { indexOld: Number(o.indexOld ?? 0), indexNew: Number(o.indexNew ?? 0) }
  return { group: (o.group as string) ?? '', bands, ...fx, ...tm }
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

// Cấu hình tính tiền cho 1 dịch vụ (dùng chung cho Customer cũ & từng ServiceSubscription mới).
// Với phí quản lý (phiql): dùng flatPriceHistory/flatUnitPrice làm mức phí đ/tháng (cố định, không nhân sản lượng).
export interface ChargeConfig {
  chargeType: ChargeType
  flatUnitPrice?: number
  areaM2?: number
  pricePerM2?: number
  flatPriceHistory?: PricePoint[]
  areaPriceHistory?: PricePoint[]
  timebandPriceHistory?: TimebandPricePoint[]
  // Chỉ dùng cho phí quản lý (phiql): đơn giá đã gồm VAT chưa (mặc định true). false ⇒ cộng thêm VAT.
  vatIncluded?: boolean
  vatPercent?: number     // % VAT áp khi vatIncluded = false (mặc định 8)
  // Chỉ dùng cho điện chiếu sáng (dh1): khách là "công ty dùng đồng hồ riêng" (VD VIN/PLT/Meta) ⇒
  // sản lượng từng khung giờ được gom vào phần "Sơn An thu hộ" khi tách Sơn An thu hộ / Ban quản trị.
  ownMeter?: boolean
}
// 1 dịch vụ mà khách đăng ký, kèm cấu hình tính tiền riêng của dịch vụ đó.
export interface ServiceSubscription extends ChargeConfig { service: ServiceId }

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
  inactiveMonths?: string[]  // Các tháng (YYYY-MM) ki-ốt KHÔNG thuê (trống) — override active theo từng tháng
  note: string
  // ── Loại sử dụng: danh sách dịch vụ khách đăng ký (nguồn chính khi có) ──
  // Vắng mặt ⇒ khách cũ: suy ra từ meterId + hasManagementFee (xem customerServices()).
  services?: ServiceSubscription[]
  // ── Phí quản lý (cũ — giữ để tương thích; khi có services[] thì dùng dịch vụ 'phiql') ──
  hasManagementFee?: boolean            // khách này có bị thu phí quản lý không
  managementFeePrice?: number           // (tương thích) mức phí tĩnh mới nhất (đ/tháng)
  managementFeeHistory?: PricePoint[]   // bảng phí quản lý theo thời điểm (đ/tháng)
  // ── Trạng thái tính phí quản lý theo từng tháng (ĐỘC LẬP với việc thuê ki-ốt) ──
  // Mặc định (không nằm trong list nào) = "Có tính phí" (thu trong tháng).
  feeInactiveMonths?: string[]  // Các tháng KHÔNG tính phí quản lý (phí = 0).
  feeAccruedMonths?: string[]   // Các tháng "tính dồn" (chưa có khách thuê nhưng vẫn tính phí cho chủ ki-ốt, thu bù sau).
  feeConfirmedMonths?: string[] // (cũ — không dùng nữa, giữ để không mất data)
  feeByMonth?: Record<string, number>         // Phí thu ngay (có khách thuê). Tháng nào có entry thì mới tính vào công nợ.
  feeAccruedByMonth?: Record<string, number>  // Phí tích lũy cộng dồn (chưa có KT, thu bù sau từ chủ ki-ốt). KHÔNG tính vào cảnh báo quá hạn.
  feeAccruedSettledHistory?: Array<{          // Lịch sử chốt PQL cộng dồn (mỗi lần chốt lưu 1 bản ghi)
    settledAt: string                         // Ngày chốt (YYYY-MM-DD)
    settledMonth: string                      // Tháng ghi nhận vào công nợ (feeByMonth key)
    total: number                             // Tổng số tiền được chốt
    breakdown: Record<string, number>         // Chi tiết từng tháng cộng dồn → số tiền
  }>
  // Phí khác (mở lại điện, thu rác, ...): feeTypeKey → month → amount
  waterSubMeters?: number       // Số đồng hồ nước con (mặc định 1). Hồ bơi = 2.
  otherFeesByType?: Record<string, Record<string, number>>
  oldDebt?: number              // Công nợ cũ trước khi dùng hệ thống (đ)
  internalSA?: boolean          // Ki-ốt nội bộ Sơn An — không theo dõi công nợ
  createdAt: string
}

// Danh sách loại phí khác — thêm vào đây để mở rộng
export const OTHER_FEE_TYPES: { key: string; label: string }[] = [
  { key: 'mo_lai_dien', label: 'Phí mở lại điện' },
]

// Trạng thái tính phí quản lý của 1 khách trong tháng.
//  charge = có khách thuê, thu trong tháng · accrue = chưa có khách, tính dồn cho chủ (thu bù sau) · none = không tính phí.
export type FeeStatus = 'charge' | 'accrue' | 'none'
export function feeStatus(c: Customer, month: string): FeeStatus {
  if ((c.feeInactiveMonths ?? []).includes(month)) return 'none'
  if ((c.feeAccruedMonths ?? []).includes(month)) return 'accrue'
  return 'charge'
}

// Ki-ốt có "đang thuê" trong tháng không: tắt hẳn (active=false) ⇒ luôn trống;
// hoặc admin bấm tắt tay 1 tháng cụ thể (month nằm trong inactiveMonths).
export function isActiveInMonth(c: Customer, month: string): boolean {
  if (!c.active) return false
  return !(c.inactiveMonths ?? []).includes(month)
}

// Dịch vụ "gốc" của khách cũ = đồng hồ đang gán (để nối dữ liệu usage/payment cũ chưa gắn service).
export function primaryService(c: Customer): ServiceId { return METER_SERVICE[c.meterId] }

// Danh sách dịch vụ của khách: ưu tiên services[]; nếu chưa có (dữ liệu cũ) suy ra từ
// đồng hồ đang gán + phí quản lý cũ ⇒ giữ tương thích, không cần migrate dữ liệu.
export function customerServices(c: Customer): ServiceSubscription[] {
  if (c.services && c.services.length) return c.services
  const out: ServiceSubscription[] = [{
    service: METER_SERVICE[c.meterId], chargeType: c.chargeType,
    flatUnitPrice: c.flatUnitPrice, areaM2: c.areaM2, pricePerM2: c.pricePerM2,
    flatPriceHistory: c.flatPriceHistory, areaPriceHistory: c.areaPriceHistory, timebandPriceHistory: c.timebandPriceHistory,
  }]
  if (c.hasManagementFee) out.push({ service: 'phiql', chargeType: 'flat_vat_incl', flatUnitPrice: c.managementFeePrice ?? 0, flatPriceHistory: c.managementFeeHistory })
  return out
}
export function customerHasService(c: Customer, s: ServiceId): boolean { return customerServices(c).some(x => x.service === s) }
export function subFor(c: Customer, s: ServiceId): ServiceSubscription | undefined { return customerServices(c).find(x => x.service === s) }

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

// Cách tính phí quản lý của 1 khách: cố định đ/tháng, hay theo diện tích (đơn giá × m²).
export function managementFeeIsArea(sub: ChargeConfig | undefined): boolean {
  return sub?.chargeType === 'fixed_area'
}
// Đơn giá phí quản lý áp cho tháng `month`:
//  - Cố định: mức phí đ/tháng (flatPriceHistory / flatUnitPrice).
//  - Theo diện tích: đơn giá đ/m²/tháng (areaPriceHistory / pricePerM2).
export function managementFeeUnitPrice(sub: ChargeConfig, month: string): number {
  return managementFeeIsArea(sub)
    ? resolvePrice(sub.areaPriceHistory, sub.pricePerM2 ?? 0, month)
    : resolvePrice(sub.flatPriceHistory, sub.flatUnitPrice ?? 0, month)
}

// Chi tiết phí quản lý 1 khách trong tháng: đơn giá gốc, diện tích, VAT, tổng phải thu.
export interface ManagementFeeBreakdown {
  isArea: boolean; unitPrice: number; areaM2: number
  base: number; vatIncluded: boolean; vatPercent: number; vat: number; total: number
}
export function managementFeeBreakdown(c: Customer, month: string): ManagementFeeBreakdown {
  const sub = subFor(c, 'phiql')
  // Phí quản lý tính trên CHỦ ki-ốt, độc lập với việc có khách thuê hay không.
  // Chỉ = 0 khi tháng đó được đánh dấu "Không tính phí" (feeInactiveMonths); "tính dồn" vẫn tính phí.
  if (!sub || feeStatus(c, month) === 'none') return { isArea: false, unitPrice: 0, areaM2: 0, base: 0, vatIncluded: true, vatPercent: 0, vat: 0, total: 0 }
  const isArea = managementFeeIsArea(sub)
  const unitPrice = managementFeeUnitPrice(sub, month)
  const areaM2 = isArea ? (sub.areaM2 ?? 0) : 0
  const base = isArea ? areaM2 * unitPrice : unitPrice   // phí quản lý = đơn giá × diện tích (nếu theo m²)
  const vatIncluded = sub.vatIncluded !== false               // mặc định coi như đã gồm VAT (tương thích cũ)
  const vatPercent = vatIncluded ? 0 : (sub.vatPercent ?? 8)
  const vat = vatIncluded ? 0 : base * vatPercent / 100
  return { isArea, unitPrice, areaM2, base, vatIncluded, vatPercent, vat, total: base + vat }
}
// Phí quản lý phải thu (đã gồm VAT) của 1 khách cho tháng `month` (đ). = 0 nếu không đăng ký hoặc trống tháng đó.
export function managementFeeOf(c: Customer, month: string): number {
  return managementFeeBreakdown(c, month).total
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
  id: string              // `${customerId}_${service}_${month}` (cũ: `${customerId}_${month}`)
  customerId: string
  service?: ServiceId     // dịch vụ của bản ghi này; vắng mặt = dữ liệu cũ ⇒ thuộc đồng hồ gốc của khách
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

// Tìm bản usage của (khách, dịch vụ, tháng): ưu tiên bản gắn đúng service; nếu không có thì
// dùng bản cũ (chưa gắn service) khi service đó là đồng hồ gốc của khách ⇒ đọc được dữ liệu lịch sử.
export function findUsage(usages: CustomerUsage[], customerId: string, service: ServiceId, month: string, primary: ServiceId): CustomerUsage | undefined {
  return usages.find(u => u.customerId === customerId && u.month === month && u.service === service)
    ?? (service === primary ? usages.find(u => u.customerId === customerId && u.month === month && !u.service) : undefined)
}

export type PaymentKind = 'meter' | 'management'  // (cũ) khoản thu cho đồng hồ hay phí quản lý
export interface Payment {
  id: string
  customerId: string
  month: string
  amount: number
  paidAt: string         // ngày thanh toán YYYY-MM-DD
  note: string
  service?: ServiceId    // dịch vụ được thu; vắng mặt = dữ liệu cũ (suy từ kind / đồng hồ gốc)
  kind?: PaymentKind     // (cũ) 'management' ⇒ phiql; còn lại ⇒ đồng hồ gốc của khách
  createdAt: string
  paymentMethod?: 'transfer' | 'cash'  // chuyển khoản / tiền mặt
  bankAccount?: string   // tài khoản ngân hàng nhận tiền
  transactionRef?: string // mã giao dịch / số chứng từ
}

// Dịch vụ mà 1 khoản thu áp vào: ưu tiên service; nếu cũ thì kind='management' ⇒ phiql, còn lại ⇒ đồng hồ gốc.
export function paymentService(p: Payment, primary: ServiceId): ServiceId {
  if (p.service) return p.service
  if (p.kind === 'management') return 'phiql'
  return primary
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

// Tính tiền cho 1 dịch vụ (subscription) trong tháng. `reading` để lấy đơn giá đồng hồ (timeband) & VAT.
export function subCharge(cfg: ChargeConfig, usage: CustomerUsage | undefined, reading: MeterReading | undefined, month: string): number {
  if (cfg.chargeType === 'flat_vat_incl') {
    const price = resolvePrice(cfg.flatPriceHistory, cfg.flatUnitPrice ?? 0, month)
    return (usage?.totalUnit ?? 0) * price
  }
  if (cfg.chargeType === 'timeband_excl_vat') {
    if (!reading) return 0
    const bandsKwh = usage?.bandsKwh ?? {}
    // Đơn giá riêng của khách theo mốc thời điểm; khung nào chưa set thì dùng đơn giá của đồng hồ tháng đó.
    const pt = resolveTimebandPoint(cfg.timebandPriceHistory, month)
    const subtotal = (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((s, k) => {
      const custPrice = pt?.[k] ?? 0
      const price = custPrice > 0 ? custPrice : reading.bands[k].donGia
      return s + (bandsKwh[k] ?? 0) * price
    }, 0)
    return subtotal * (1 + reading.vatPercent / 100)
  }
  if (cfg.chargeType === 'fixed_area') {
    const price = resolvePrice(cfg.areaPriceHistory, cfg.pricePerM2 ?? 0, month)
    return (cfg.areaM2 ?? 0) * price
  }
  return 0 // remainder tính ở meterAllocation
}

// Tương thích: tính tiền của khách cho đồng hồ của `reading` (dùng đúng cấu hình dịch vụ tương ứng).
export function customerCharge(customer: Customer, usage: CustomerUsage | undefined, reading: MeterReading | undefined): number {
  const month = usage?.month || reading?.month || ''
  const service = reading ? METER_SERVICE[reading.meterId] : primaryService(customer)
  const sub = subFor(customer, service)
  if (!sub) return 0
  return subCharge(sub, usage, reading, month)
}

export interface AllocationRow { customer: Customer; amount: number }
export interface Allocation {
  total: number          // tổng tiền đồng hồ tháng đó (đã gồm VAT)
  allocated: number       // tổng đã charge cho khách có đơn giá cụ thể (không tính remainder)
  remainderTotal: number  // phần còn lại, chia cho các khách loại "remainder"
  rows: AllocationRow[]
}

export function meterAllocation(reading: MeterReading, customers: Customer[], usages: CustomerUsage[]): Allocation {
  const service = METER_SERVICE[reading.meterId]
  const meterCustomers    = customers.filter(c => customerHasService(c, service) && isActiveInMonth(c, reading.month))
  const isRemainder = (c: Customer) => subFor(c, service)?.chargeType === 'remainder'
  const priced            = meterCustomers.filter(c => !isRemainder(c))
  const remainderCustomers = meterCustomers.filter(isRemainder)
  const usageOf = (c: Customer) => findUsage(usages, c.id, service, reading.month, primaryService(c))

  const pricedRows: AllocationRow[] = priced.map(c => ({ customer: c, amount: customerCharge(c, usageOf(c), reading) }))
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
  const service = METER_SERVICE[reading.meterId]
  const timebandCustomers = customers.filter(c => customerHasService(c, service) && isActiveInMonth(c, reading.month) && subFor(c, service)?.chargeType === 'timeband_excl_vat')
  const usageOf = (c: Customer) => findUsage(usages, c.id, service, reading.month, primaryService(c))
  const out: Record<BandKey, number> = { caoDiem: 0, thapDiem: 0, binhThuong: 0, toanThoiGian: 0 }
  for (const k of BAND_KEYS) {
    const usedByCustomers = timebandCustomers.reduce((s, c) => s + (usageOf(c)?.bandsKwh?.[k] ?? 0), 0)
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

// Sản lượng (kWh) của 1 dịch vụ đã dùng trong tháng (theo loại tính tiền của dịch vụ đó).
export function usageKwh(cfg: ChargeConfig, usage: CustomerUsage | undefined): number {
  if (!usage) return 0
  if (cfg.chargeType === 'timeband_excl_vat') {
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
  const service = METER_SERVICE[reading.meterId]
  const meterCustomers = customers.filter(c => customerHasService(c, service) && isActiveInMonth(c, reading.month))
  const kwhOf = (c: Customer) => usageKwh(subFor(c, service)!, findUsage(usages, c.id, service, reading.month, primaryService(c)))

  const floors: BqtFloorRow[] = floorReadings.map(raw => {
    const f = normalizeFloor(raw)
    const floorKwh = floorTotalKwh(f)
    const g = (f.group || '').trim()
    const customerKwh = meterCustomers
      .filter(c => (c.group || '').trim() === g && g !== '')
      .reduce((s, c) => s + kwhOf(c), 0)
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

// ── Đồng hồ 1: tách "Sơn An thu hộ" ↔ "Ban quản trị" (theo sheet Điện chiếu sáng) ──
// Sơn An thu hộ = tiền điện Sơn An thu hộ cho khách, gồm:
//   ① Chung 3 tầng TM (các khu đánh dấu commonTM): tổng kWh chia theo tỷ lệ khung giờ (CĐ/TĐ/BT).
//   ② Công ty dùng đồng hồ riêng (ownMeter, VD VIN/PLT/Meta): kWh thực từng khung giờ.
//   ⇒ (①+②) × đơn giá điện lực từng khung + VAT.
// Ban quản trị (cư dân) = Tổng tiền đồng hồ − Sơn An thu hộ (gánh cả điện Toàn thời gian + hao hụt).

// kWh từng khung (CĐ/TĐ/BT) của 1 dịch vụ: timeband lấy sản lượng thực từng khung;
// giá cố định (flat) phân bổ tổng sản lượng theo tỷ lệ khung giờ (giống khu cố định).
export function customerBandKwh(cfg: ChargeConfig, usage: CustomerUsage | undefined, ratio: BqtRatio): Record<FloorBandKey, number> {
  const out: Record<FloorBandKey, number> = { caoDiem: 0, thapDiem: 0, binhThuong: 0 }
  if (!usage) return out
  if (cfg.chargeType === 'timeband_excl_vat') {
    const b = usage.bandsKwh ?? {}
    return { caoDiem: b.caoDiem ?? 0, thapDiem: b.thapDiem ?? 0, binhThuong: b.binhThuong ?? 0 }
  }
  if (cfg.chargeType === 'flat_vat_incl') {
    const total = usage.totalUnit ?? 0
    const sum = (ratio.caoDiem || 0) + (ratio.thapDiem || 0) + (ratio.binhThuong || 0)
    if (sum <= 0) return { caoDiem: 0, thapDiem: 0, binhThuong: total }
    for (const k of FLOOR_BAND_KEYS) out[k] = total * (ratio[k] || 0) / sum
  }
  return out
}

export interface LightingCompanyRow { customer: Customer; caoDiem: number; thapDiem: number; binhThuong: number; total: number }
export interface LightingBandRow { key: FloorBandKey; commonKwh: number; companyKwh: number; kwh: number; price: number; amount: number }
export interface LightingSplit {
  ratio: BqtRatio
  commonFloors: { group: string; kwh: number }[]  // các khu 3 tầng TM chung
  commonPoolKwh: number                            // tổng kWh chung 3 tầng TM
  companies: LightingCompanyRow[]                  // công ty đồng hồ riêng
  bands: LightingBandRow[]                         // CĐ/TĐ/BT: chung + công ty, × đơn giá
  sonAnSubtotal: number
  sonAnVat: number
  sonAnTotal: number       // Sơn An thu hộ (đã VAT)
  meterTotal: number       // tổng tiền đồng hồ (đủ 4 khung, đã VAT)
  bqtTotal: number         // Ban quản trị = meterTotal − sonAnTotal
  vatPercent: number
}

// ── Chia tiền ĐH1 cho 3 bên (Sơn An thu hộ / SA chịu EVN / BQT chịu) ──────────
export interface Dh1Split3 {
  total: number
  sonanRevenue: number    // tiền thực thu từ khách ki ốt + công ty (theo đơn giá của họ)
  sonanEVNCost: number    // tiền Sơn An trả EVN cho phần kWh của khách (theo đơn giá EVN)
  sonanProfit: number     // chênh lệch SA hưởng = sonanRevenue − sonanEVNCost
  bqtBorne: number        // BQT chịu = tổng đồng hồ − sonanEVNCost
  totalKwh: number; commonKwh: number; companyKwh: number
  tenantKwh: number; bqtKwh: number
}
// Tỷ lệ phân bổ khung giờ cho ki ốt (chung 3 tầng TM) khi tính chi phí EVN
export const KIOSK_BAND_RATIO = { caoDiem: 0.15, thapDiem: 0.35, binhThuong: 0.50 } as const

export function splitDh1ThreeWay(split: LightingSplit, reading: MeterReading, customers: Customer[], usages: CustomerUsage[]): Dh1Split3 {
  const total = split.meterTotal
  const vatMul = 1 + (reading.vatPercent || 0) / 100
  const sonanRevenue = meterAllocation(reading, customers, usages).allocated
  const commonKwh = split.commonPoolKwh
  const kioskEVNCost = (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((s, k) =>
    s + commonKwh * KIOSK_BAND_RATIO[k] * (reading.bands[k]?.donGia || 0), 0) * vatMul
  const companyEVNCost = split.companies.reduce((s, co) =>
    s + (['caoDiem', 'thapDiem', 'binhThuong'] as const).reduce((ss, k) =>
      ss + co[k] * (reading.bands[k]?.donGia || 0), 0) * vatMul, 0)
  const sonanEVNCost = kioskEVNCost + companyEVNCost
  const sonanProfit = sonanRevenue - sonanEVNCost
  const bqtBorne = Math.max(0, total - sonanEVNCost)
  const companyKwh = split.companies.reduce((s, co) => s + co.total, 0)
  const tenantKwh = commonKwh + companyKwh
  const totKwh = BAND_KEYS.reduce((s, k) => s + (reading.bands[k]?.kwh || 0), 0)
  const bqtc = computeBqt(reading, customers, usages, reading.bqtRatio ?? DEFAULT_BQT_RATIO)
  const commonGroups = new Set((reading.floorReadings ?? []).filter(f => f.commonTM).map(f => (f.group || '').trim()))
  const bqtKwh = bqtc.floors.filter(fr => !commonGroups.has((fr.group || '').trim())).reduce((s, fr) => s + fr.bqtKwh, 0)
  return { total, sonanRevenue, sonanEVNCost, sonanProfit, bqtBorne, totalKwh: totKwh, commonKwh, companyKwh, tenantKwh, bqtKwh }
}

export function computeLightingSplit(
  reading: MeterReading, customers: Customer[], usages: CustomerUsage[],
  ratio: BqtRatio = reading.bqtRatio ?? DEFAULT_BQT_RATIO,
): LightingSplit {
  const service = METER_SERVICE[reading.meterId]  // 'dh1'
  const sum = (ratio.caoDiem || 0) + (ratio.thapDiem || 0) + (ratio.binhThuong || 0)

  // ① Chung 3 tầng TM
  const commonFloorReadings = (reading.floorReadings ?? []).map(normalizeFloor).filter(f => f.commonTM)
  const commonFloors = commonFloorReadings.map(f => ({ group: f.group, kwh: floorTotalKwh(f) }))
  const commonPoolKwh = commonFloors.reduce((s, f) => s + f.kwh, 0)
  const commonBand = (k: FloorBandKey) => sum > 0 ? commonPoolKwh * (ratio[k] || 0) / sum : (k === 'binhThuong' ? commonPoolKwh : 0)

  // ② Công ty dùng đồng hồ riêng
  const companyCustomers = customers.filter(c => customerHasService(c, service) && isActiveInMonth(c, reading.month) && subFor(c, service)?.ownMeter)
  const companies: LightingCompanyRow[] = companyCustomers.map(c => {
    const bk = customerBandKwh(subFor(c, service)!, findUsage(usages, c.id, service, reading.month, primaryService(c)), ratio)
    return { customer: c, caoDiem: bk.caoDiem, thapDiem: bk.thapDiem, binhThuong: bk.binhThuong, total: bk.caoDiem + bk.thapDiem + bk.binhThuong }
  })

  const bands: LightingBandRow[] = FLOOR_BAND_KEYS.map(k => {
    const common = commonBand(k)
    const company = companies.reduce((s, co) => s + co[k], 0)
    const kwh = common + company
    const price = reading.bands[k]?.donGia || 0
    return { key: k, commonKwh: common, companyKwh: company, kwh, price, amount: kwh * price }
  })
  const sonAnSubtotal = bands.reduce((s, b) => s + b.amount, 0)
  const vatPercent = reading.vatPercent
  const sonAnVat = sonAnSubtotal * vatPercent / 100
  const sonAnTotal = sonAnSubtotal + sonAnVat
  const mTotal = meterTotal(reading.bands, reading.vatPercent)
  return { ratio, commonFloors, commonPoolKwh, companies, bands, sonAnSubtotal, sonAnVat, sonAnTotal, meterTotal: mTotal, bqtTotal: Math.max(0, mTotal - sonAnTotal), vatPercent }
}
