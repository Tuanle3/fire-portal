import { useMemo, useState } from 'react'

export type Granularity = 'year' | 'quarter' | 'month'

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
  /** N cột liên tiếp theo granularity hiện tại kết thúc tại lựa chọn hiện tại — dùng cho Phân tích ngang. */
  buckets: (count: number) => PeriodBucket[]
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

  return {
    mode, setMode, year, setYear, quarter, setQuarter, month, setMonth, years, periods,
    selectedPeriods, comparePeriods, hasCompare,
    label: rangeLabel(mode, year, quarter, month),
    historyWindow,
    buckets,
  }
}
