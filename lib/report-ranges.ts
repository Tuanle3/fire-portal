export function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

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
