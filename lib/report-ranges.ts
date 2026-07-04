export function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

// Việc đến hạn đúng trong kỳ [from,to] luôn được tính, bất kể trạng thái.
// Việc đang làm/trễ hạn (đang active thật, chưa xong) thì được tính thêm ở MỌI kỳ
// nó còn "sống" (createdAt → deadline), để không mất dấu khi theo dõi xuyên tuần/tháng.
// Việc "chưa bắt đầu" hoặc "hoàn thành" thì chỉ hiện đúng kỳ có deadline, không lan ra.
export function taskOverlapsRange(deadline: string, createdAt: string | undefined, from: string | undefined, to: string | undefined, status?: string): boolean {
  if (!deadline) return false
  const dueInRange = (!from || deadline >= from) && (!to || deadline <= to)
  if (dueInRange) return true
  if (status !== 'dang_lam' && status !== 'tre') return false
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
