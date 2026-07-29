export type Unit = 'đ' | 'tr' | 'tỷ'

export function moneyFmt(unit: Unit) {
  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmt = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtS = (v: number) => (v === 0 ? '–' : fmt(v))
  return { fmt, fmtS, unitLbl }
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}

export function ratioStr(v: number, digits = 2): string {
  return v.toFixed(digits)
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `T${m}/${y.slice(2)}`
}
