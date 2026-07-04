export function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

// Việc kéo dài nhiều tuần/tháng (createdAt → deadline) phải xuất hiện ở MỌI kỳ báo
// cáo mà nó còn đang chạy, không chỉ đúng kỳ trùng deadline. So khoảng [createdAt,
// deadline] của việc có giao với khoảng [from, to] của kỳ báo cáo hay không.
export function taskOverlapsRange(deadline: string, createdAt: string | undefined, from?: string, to?: string): boolean {
  if (!deadline) return false
  const start = createdAt || deadline
  if (to   && start    > to)   return false
  if (from && deadline < from) return false
  return true
}

export function getWeekRange(offsetWeeks = 0): { from: string; to: string; label: string } {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offsetWeeks * 7)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return {
    from: isoDate(mon),
    to:   isoDate(sun),
    label: `${mon.getDate().toString().padStart(2,'0')}/${(mon.getMonth()+1).toString().padStart(2,'0')} – ${sun.getDate().toString().padStart(2,'0')}/${(sun.getMonth()+1).toString().padStart(2,'0')}/${sun.getFullYear()}`,
  }
}

export function getMonthRange(offsetMonths = 0): { from: string; to: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offsetMonths
  const first = new Date(y, m, 1)
  const last  = new Date(y, m + 1, 0)
  return {
    from: isoDate(first),
    to:   isoDate(last),
    label: `Tháng ${(first.getMonth()+1).toString().padStart(2,'0')}/${first.getFullYear()}`,
  }
}
