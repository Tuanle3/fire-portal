import { useMemo, useState } from 'react'
import { periodLabel } from './format'

export type Granularity = 'year' | 'quarter' | 'month'

// Cách dựng cột so sánh khi đang ở chế độ Quý:
//   'acrossYears'   = so cùng 1 quý qua N năm gần nhất (VD: Quý 2/2024, Quý 2/2025, Quý 2/2026)
//   'quartersInYear'= so 4 quý trong CÙNG 1 năm đang chọn (hành vi cũ)
export type QuarterCompareBasis = 'acrossYears' | 'quartersInYear'

export function quarterOf(period: string): number {
  return Math.ceil(Number(period.slice(5, 7)) / 3)
}
export function periodsForYear(all: string[], year: string): string[] {
  return all.filter(p => p.startsWith(`${year}-`))
}
export function periodsForQuarter(all: string[], year: string, q: number): string[] {
  const months = [q * 3 - 2, q * 3 - 1, q * 3].map(m => `${year}-${String(m).padStart(2, '0')}`)
  return all.filter(p => months.includes(p))
}
export function shiftYear(period: string, delta: number): string {
  const [y, m] = period.split('-')
  return `${Number(y) + delta}-${m}`
}
export function rangeLabel(mode: Granularity, year: string, quarter: number, month: string): string {
  if (mode === 'year') return `Cả năm ${year}`
  if (mode === 'quarter') return `Quý ${quarter}/${year}`
  const [y, m] = month.split('-')
  return m ? `Tháng ${m}/${y}` : '—'
}

export interface PeriodBucket { label: string; periods: string[] }

// N "cột" liên tiếp kết thúc tại lựa chọn hiện tại, theo đúng granularity đang chọn — dùng cho bảng
// Phân tích ngang (mỗi cột 1 tháng/quý/năm, đã gộp sẵn các kỳ con nếu granularity > tháng).
export function bucketsEndingAt(allPeriods: string[], mode: Granularity, year: string, quarter: number, month: string, count: number): PeriodBucket[] {
  if (mode === 'month') {
    const idx = allPeriods.indexOf(month)
    const end = idx >= 0 ? idx : allPeriods.length - 1
    if (end < 0) return []
    const start = Math.max(0, end - count + 1)
    return allPeriods.slice(start, end + 1).map(p => ({ label: p, periods: [p] }))
  }
  const buckets: PeriodBucket[] = []
  if (mode === 'quarter') {
    let y = Number(year), q = quarter
    for (let i = 0; i < count; i++) {
      buckets.push({ label: `Q${q}/${y}`, periods: periodsForQuarter(allPeriods, String(y), q) })
      ;[y, q] = q === 1 ? [y - 1, 4] : [y, q - 1]
    }
  } else {
    let y = Number(year)
    for (let i = 0; i < count; i++) {
      buckets.push({ label: `${y}`, periods: periodsForYear(allPeriods, String(y)) })
      y -= 1
    }
  }
  return buckets.reverse().filter(b => b.periods.length > 0)
}

// ── Các hàm dựng cột dùng riêng cho "trendBuckets" (Tổng quan + Phân tích ngang) — khác
// bucketsEndingAt ở chỗ các hàm này luôn neo vào lựa chọn Năm/Tháng hiện tại theo đúng ngữ nghĩa
// yêu cầu: "Năm" → 3 năm gần nhất; "Quý" → cùng 1 quý qua nhiều năm (hoặc 4 quý trong năm); "Tháng"
// → 3 tháng gần nhất NHƯNG chỉ trong năm đang chọn (không vắt sang năm trước).

// 3 năm gần nhất kết thúc tại `year` đang chọn (hoặc năm cuối cùng có dữ liệu nếu `year` không có).
export function recentYearBuckets(allPeriods: string[], year: string, count: number): PeriodBucket[] {
  const years = [...new Set(allPeriods.map(p => p.slice(0, 4)))].sort()
  let idx = years.indexOf(year)
  if (idx === -1) idx = years.length - 1
  if (idx < 0) return []
  const start = Math.max(0, idx - count + 1)
  return years.slice(start, idx + 1)
    .map(y => ({ label: y, periods: periodsForYear(allPeriods, y) }))
    .filter(b => b.periods.length > 0)
}

// Cùng 1 quý, so qua `count` năm gần nhất kết thúc tại `year` đang chọn.
export function sameQuarterAcrossYears(allPeriods: string[], year: string, quarter: number, count: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  let y = Number(year)
  for (let i = 0; i < count; i++) {
    buckets.push({ label: `Quý ${quarter}/${y}`, periods: periodsForQuarter(allPeriods, String(y), quarter) })
    y -= 1
  }
  return buckets.reverse().filter(b => b.periods.length > 0)
}

// 4 quý trong đúng 1 năm đang chọn (hành vi "so các quý cùng năm").
export function quartersOfYear(allPeriods: string[], year: string): PeriodBucket[] {
  return [1, 2, 3, 4]
    .map(q => ({ label: `Quý ${q}/${year}`, periods: periodsForQuarter(allPeriods, year, q) }))
    .filter(b => b.periods.length > 0)
}

// 3 tháng gần nhất, CHỈ trong năm đang chọn (tháng 1-2 thì ít hơn 3 cột, theo đúng yêu cầu).
export function recentMonthBucketsInYear(allPeriods: string[], year: string, month: string, count: number): PeriodBucket[] {
  const monthsInYear = periodsForYear(allPeriods, year)
  let idx = monthsInYear.indexOf(month)
  if (idx === -1) idx = monthsInYear.length - 1
  if (idx < 0) return []
  const start = Math.max(0, idx - count + 1)
  return monthsInYear.slice(start, idx + 1).map(p => ({ label: periodLabel(p), periods: [p] }))
}

export interface QuarterYearOption { key: string; year: string; quarter: number; label: string }

// Danh sách Quý×Năm THỰC SỰ có dữ liệu — dùng cho popover "Tùy chỉnh" (multi-select).
export function allQuarterOptions(allPeriods: string[]): QuarterYearOption[] {
  const years = [...new Set(allPeriods.map(p => p.slice(0, 4)))].sort()
  const out: QuarterYearOption[] = []
  for (const y of years) {
    for (let q = 1; q <= 4; q++) {
      if (periodsForQuarter(allPeriods, y, q).length > 0) out.push({ key: `${y}-Q${q}`, year: y, quarter: q, label: `Quý ${q}/${y}` })
    }
  }
  return out
}

export interface PeriodFilter {
  mode: Granularity
  setMode: (m: Granularity) => void
  year: string
  setYear: (y: string) => void
  quarter: number
  setQuarter: (q: number) => void
  month: string
  setMonth: (m: string) => void
  years: string[]
  periods: string[]
  selectedPeriods: string[]
  comparePeriods: string[]
  hasCompare: boolean
  label: string
  /** N kỳ gần nhất (theo tháng thực tế trong dữ liệu, không phụ thuộc granularity) tính đến kỳ cuối của selectedPeriods — dùng cho biểu đồ xu hướng. */
  historyWindow: (n: number) => string[]
  /** N cột liên tiếp theo granularity hiện tại kết thúc tại lựa chọn hiện tại — dùng cho Phân tích dọc. */
  buckets: (count: number) => PeriodBucket[]

  // ── So sánh linh hoạt ở chế độ Quý ──
  compareBasis: QuarterCompareBasis
  setCompareBasis: (b: QuarterCompareBasis) => void
  /** Danh sách khoá (VD "2026-Q2") người dùng đã tự chọn ở popover Tùy chỉnh; null = dùng mặc định theo compareBasis. */
  customQuarterKeys: string[] | null
  setCustomQuarterSelection: (keys: string[] | null) => void
  /** Toàn bộ Quý×Năm có dữ liệu, để dựng UI multi-select Tùy chỉnh. */
  quarterOptions: QuarterYearOption[]

  /**
   * Cột kỳ dùng cho Tổng quan + Phân tích ngang, tự đổi theo `mode`:
   *  - year: `count` năm gần nhất (mặc định gọi với 3).
   *  - month: `count` tháng gần nhất TRONG năm đang chọn.
   *  - quarter: theo `compareBasis` (hoặc `customQuarterKeys` nếu đã tự chọn) —
   *      'acrossYears' → cùng quý qua `count` năm gần nhất; 'quartersInYear' → 4 quý của năm đang chọn.
   */
  trendBuckets: (count: number) => PeriodBucket[]
}

// Bộ lọc kỳ dùng chung nhiều tab: Cả năm / Theo Quý / Theo Tháng → danh sách kỳ đã chọn + kỳ so
// sánh cùng kỳ năm trước (nếu dữ liệu có). Trước đây logic này nằm cục bộ trong TabKQKD.tsx.
//
// `preferredMonth` (tuỳ chọn): kỳ mặc định khi mở trang — dùng để mặc định vào kỳ gần nhất THỰC SỰ
// có số liệu (do page.tsx tính, vì hook này không biết gì về nội dung dữ liệu) thay vì luôn là kỳ
// cuối cùng trong mảng `periods` (có thể là tháng tương lai còn trống). Component gọi hook này nên
// được remount bằng `key` khi `periods`/`preferredMonth` chuyển từ rỗng sang có dữ liệu thật, vì
// giá trị này chỉ được đọc ở lần khởi tạo state đầu tiên.
export function usePeriodFilter(periods: string[], preferredMonth?: string): PeriodFilter {
  const years = useMemo(() => [...new Set(periods.map(p => p.slice(0, 4)))].sort(), [periods])
  const initialMonth = (preferredMonth && periods.includes(preferredMonth))
    ? preferredMonth
    : (periods[periods.length - 1] ?? '')

  const [mode, setMode] = useState<Granularity>('month')
  const [year, setYear] = useState(initialMonth.slice(0, 4) || years[years.length - 1] || '')
  const [quarter, setQuarter] = useState(initialMonth ? quarterOf(initialMonth) : 1)
  const [month, setMonth] = useState(initialMonth)
  const [compareBasis, setCompareBasisState] = useState<QuarterCompareBasis>('acrossYears')
  const [customQuarterKeys, setCustomQuarterKeys] = useState<string[] | null>(null)

  const selectedPeriods = useMemo(() => {
    if (mode === 'year') return periodsForYear(periods, year)
    if (mode === 'quarter') return periodsForQuarter(periods, year, quarter)
    return periods.includes(month) ? [month] : []
  }, [mode, year, quarter, month, periods])

  const comparePeriods = useMemo(
    () => selectedPeriods.map(p => shiftYear(p, -1)).filter(p => periods.includes(p)),
    [selectedPeriods, periods],
  )
  const hasCompare = comparePeriods.length > 0 && comparePeriods.length === selectedPeriods.length

  const historyWindow = (n: number) => periods.slice(-n)
  const buckets = (count: number) => bucketsEndingAt(periods, mode, year, quarter, month, count)

  // Đổi granularity/năm/quý thì bỏ tuỳ chỉnh cũ (khoá quý theo năm khác dễ gây hiểu nhầm nếu giữ
  // nguyên) — người dùng bấm lại "Tuỳ chỉnh" để chọn bộ mới nếu cần.
  const setCompareBasis = (b: QuarterCompareBasis) => { setCompareBasisState(b); setCustomQuarterKeys(null) }
  const setCustomQuarterSelection = (keys: string[] | null) => setCustomQuarterKeys(keys && keys.length > 0 ? keys : null)

  const quarterOptions = useMemo(() => allQuarterOptions(periods), [periods])

  const quarterKeyToBucket = (key: string): PeriodBucket => {
    const [y, qStr] = key.split('-Q')
    const q = Number(qStr)
    return { label: `Quý ${q}/${y}`, periods: periodsForQuarter(periods, y, q) }
  }

  const trendBuckets = (count: number): PeriodBucket[] => {
    if (mode === 'year') return recentYearBuckets(periods, year, count)
    if (mode === 'month') return recentMonthBucketsInYear(periods, year, month, count)
    // mode === 'quarter'
    if (customQuarterKeys && customQuarterKeys.length > 0) {
      return [...customQuarterKeys]
        .sort((a, b) => a.localeCompare(b))
        .map(quarterKeyToBucket)
        .filter(b => b.periods.length > 0)
    }
    return compareBasis === 'acrossYears'
      ? sameQuarterAcrossYears(periods, year, quarter, count)
      : quartersOfYear(periods, year)
  }

  return {
    mode, setMode, year, setYear, quarter, setQuarter, month, setMonth, years, periods,
    selectedPeriods, comparePeriods, hasCompare,
    label: rangeLabel(mode, year, quarter, month),
    historyWindow,
    buckets,
    compareBasis, setCompareBasis, customQuarterKeys, setCustomQuarterSelection, quarterOptions,
    trendBuckets,
  }
}