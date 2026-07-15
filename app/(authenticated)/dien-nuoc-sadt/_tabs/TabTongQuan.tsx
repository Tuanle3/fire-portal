'use client'
import { useMemo } from 'react'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId, BAND_KEYS,
  meterLabel, meterAllocation, meterTotal, meterSubtotal,
  lastReadingBefore, bandsWithPriceChange, computeBqt, computeLightingSplit,
  METER_UNIT, BAND_LABELS,
} from '@/lib/dien-nuoc-types'
import { exportTongQuan } from '@/lib/dien-nuoc-excel'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')
const fmtShort = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace('.', ',') + ' tỷ'
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' tr'
  if (a >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(Math.round(n))
}
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
const addMonth = (m: string, delta: number) => {
  let [y, mm] = m.split('-').map(Number)
  mm += delta
  while (mm < 1) { mm += 12; y-- }
  while (mm > 12) { mm -= 12; y++ }
  return `${y}-${String(mm).padStart(2, '0')}`
}
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}
const billedOfMonth = (readings: MeterReading[], m: string) =>
  readings.filter(r => r.month === m).reduce((s, r) => s + meterTotal(r.bands, r.vatPercent), 0)

function dueMapForMonth(readings: MeterReading[], customers: Customer[], usages: CustomerUsage[], m: string) {
  const map = new Map<string, number>()
  for (const r of readings.filter(x => x.month === m))
    for (const row of meterAllocation(r, customers, usages).rows)
      map.set(row.customer.id, (map.get(row.customer.id) ?? 0) + row.amount)
  for (const c of customers) {
    // Phí QL: dùng feeByMonth (đã lưu/xác nhận) như TabCongNo — không dùng managementFeeOf (lý thuyết)
    const fee = c.feeByMonth?.[m] ?? 0
    if (fee > 0) map.set(c.id, (map.get(c.id) ?? 0) + fee)
    // Phí khác (mở lại điện, thu rác, ...)
    const other = Object.values(c.otherFeesByType ?? {}).reduce((s, byMonth) => s + (byMonth[m] ?? 0), 0)
    if (other > 0) map.set(c.id, (map.get(c.id) ?? 0) + other)
  }
  return map
}
function paidMapForMonth(payments: Payment[], m: string) {
  const map = new Map<string, number>()
  for (const p of payments) if (p.month === m) map.set(p.customerId, (map.get(p.customerId) ?? 0) + p.amount)
  return map
}

// ── Chia chi phí điện nước 1 tháng cho 3 bên (cộng khớp tổng đồng hồ) ──────────
//  • Khách thuê = tiền đã phân bổ cho khách định danh (ki-ốt/công ty) + khu 3 tầng TM chung (đồng hồ 1).
//  • Ban quản trị = điện/nước khu cư dân dùng CHUNG có đo đếm (số ghi tầng − phần khách thuê, bỏ khu 3 tầng TM).
//  • Sơn An chịu = phần còn lại chưa quy được cho ai = hao hụt/thất thoát (đồng hồ 1); với máy lạnh/nước dồn về BQT.
interface Split3 { total: number; tenant: number; bqt: number; sonan: number }
function splitThreeWay(readings: MeterReading[], customers: Customer[], usages: CustomerUsage[], m: string): Split3 {
  let total = 0, tenant = 0, sonan = 0, bqt = 0
  for (const id of [1, 2, 3] as MeterId[]) {
    const r = readings.find(x => x.meterId === id && x.month === m)
    if (!r) continue
    const t = meterTotal(r.bands, r.vatPercent)
    total += t
    const vatMul = 1 + (r.vatPercent || 0) / 100
    const allocated = meterAllocation(r, customers, usages).allocated
    if (id === 1) {
      // ① Khách thuê = khách định danh (ki-ốt/công ty) + khu 3 tầng TM chung (đo đếm riêng)
      const split = computeLightingSplit(r, customers, usages, r.bqtRatio)
      const commonVal = split.bands.reduce((s, b) => s + b.commonKwh * b.price, 0) * vatMul
      let tenantMeter = Math.min(allocated + commonVal, t)
      // ② BQT = điện cư dân dùng chung có đo đếm = Σ (ghi tầng − khách) của các khu KHÔNG phải 3 tầng TM
      const bqtc = computeBqt(r, customers, usages, r.bqtRatio)
      const commonGroups = new Set((r.floorReadings ?? []).filter(f => f.commonTM).map(f => (f.group || '').trim()))
      const bqtKwh = bqtc.floors.filter(fr => !commonGroups.has((fr.group || '').trim())).reduce((s, fr) => s + fr.bqtKwh, 0)
      const totKwh = BAND_KEYS.reduce((s, k) => s + (r.bands[k]?.kwh || 0), 0)
      const avg = totKwh > 0 ? meterSubtotal(r.bands) / totKwh : 0
      const bqtVal = Math.min(bqtKwh * avg * vatMul, t - tenantMeter)
      // ③ Sơn An = phần còn lại chưa quy được (hao hụt/thất thoát)
      tenant += tenantMeter; bqt += bqtVal; sonan += Math.max(0, t - tenantMeter - bqtVal)
    } else {
      // Máy lạnh TT & nước: chưa có mô hình tách hao hụt ⇒ khách thuê = đã phân bổ, phần chung dồn về BQT
      const tm = Math.min(allocated, t)
      tenant += tm; bqt += t - tm
    }
  }
  return { total, tenant, bqt, sonan }
}

type Sev = 'critical' | 'warning' | 'info' | 'good'
const SEV_ORDER: Record<Sev, number> = { critical: 0, warning: 1, info: 2, good: 3 }
const SEV_META: Record<Sev, { ic: string; tag: string }> = {
  critical: { ic: '⛔', tag: 'Khẩn' }, warning: { ic: '⚠️', tag: 'Cảnh báo' },
  info: { ic: 'ℹ️', tag: 'Lưu ý' }, good: { ic: '✅', tag: 'Ổn định' },
}

// Chênh lệch % giữa cur và base (null nếu không có kỳ so sánh).
function delta(cur: number, base: number): number | null { return base > 0 ? (cur - base) / base * 100 : null }
function DeltaBadge({ d, invert = true }: { d: number | null; invert?: boolean }) {
  if (d === null) return <span className="ov-mini">—</span>
  const up = d > 1, down = d < -1
  // invert=true (chi phí/nợ): tăng = xấu (đỏ), giảm = tốt (xanh). invert=false (đã thu): ngược lại.
  const good = invert ? down : up
  const bad = invert ? up : down
  const cls = good ? 'ov-mom-good' : bad ? 'ov-mom-bad' : 'ov-mom-flat'
  return <span className={`ov-mom ${cls}`}>{up ? '▲' : down ? '▼' : '▬'} {Math.abs(d).toFixed(0)}%</span>
}
function Spark({ vals, cur }: { vals: number[]; cur: number }) {
  const max = Math.max(1, ...vals)
  return (
    <span className="ov-spark">
      {vals.map((v, i) => <span key={i} className="ov-spark-bar" style={{ height: `${Math.max(6, pct(v, max))}%`, background: i === vals.length - 1 ? (cur ? 'var(--navy)' : '#CBD5E1') : 'var(--navy3)' }} title={`${fmtShort(v)}`} />)}
    </span>
  )
}

export function TabTongQuan({ readings, customers, usages, payments, month, meterNames }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
  meterNames: Record<number, string>
}) {
  const M = useMemo(() => {
    // Tháng dữ liệu hiệu lực: nếu tháng đang chọn chưa nhập chỉ số điện nước, tự lùi về tháng gần nhất đã có số liệu.
    const monthsWithData = [...new Set(readings.map(r => r.month))].filter(mm => billedOfMonth(readings, mm) > 0).sort()
    const hasSelData = billedOfMonth(readings, month) > 0
    const mo = hasSelData ? month : (monthsWithData.filter(mm => mm <= month).pop() ?? month)
    const fellBack = mo !== month
    const prevM = addMonth(mo, -1), yoyM = addMonth(mo, -12)
    const monthReadings = readings.filter(r => r.month === mo)

    // ── Đồng hồ: sản lượng, tiền, MoM, YoY, sparkline, hao hụt ────────────
    const meters = ([1, 2, 3] as MeterId[]).map(id => {
      const r = monthReadings.find(x => x.meterId === id)
      const alloc = r ? meterAllocation(r, customers, usages) : null
      const consumption = r ? BAND_KEYS.reduce((s, k) => s + (r.bands[k]?.kwh || 0), 0) : 0
      const billed = r ? meterTotal(r.bands, r.vatPercent) : 0
      const prevBilled = billedOfMonth(readings.filter(x => x.meterId === id), prevM)
      const yoyBilled = billedOfMonth(readings.filter(x => x.meterId === id), yoyM)
      const spark = Array.from({ length: 6 }, (_, i) => billedOfMonth(readings.filter(x => x.meterId === id), addMonth(mo, -(5 - i))))
      let loss: { kwh: number; pct: number; negative: boolean } | null = null
      if (id === 1 && r && (r.floorReadings?.length ?? 0) > 0) {
        const bqt = computeBqt(r, customers, usages, r.bqtRatio)
        if (bqt.sumFloorKwh > 0) loss = { kwh: bqt.discrepancy, pct: pct(bqt.discrepancy, bqt.mainMeterKwh), negative: bqt.discrepancy < 0 }
      }
      return { id, reading: r, alloc, consumption, billed, prevBilled, yoyBilled, spark, loss }
    })

    // ── Dòng tiền Sơn An ──────────────────────────────────────────────────
    const rowsSum = (m: typeof meters[number]) => m.alloc?.rows.reduce((a, r) => a + r.amount, 0) ?? 0
    const inputCost = meters.reduce((s, m) => s + m.billed, 0)                 // trả điện lực + nước
    const prevInput = billedOfMonth(readings, prevM)
    const yoyInput = billedOfMonth(readings, yoyM)
    const allocatedToTenants = meters.reduce((s, m) => s + (m.alloc?.allocated ?? 0), 0)
    const remainderBorne = meters.reduce((s, m) => s + (m.alloc?.remainderTotal ?? 0), 0)
    // Phí QL & phí khác: dùng feeByMonth / otherFeesByType (đã lưu) như TabCongNo
    const managementDue = customers.reduce((s, c) => s + (c.feeByMonth?.[mo] ?? 0), 0)
    const otherFeesDue = customers.reduce((s, c) =>
      s + Object.values(c.otherFeesByType ?? {}).reduce((t, byMonth) => t + (byMonth[mo] ?? 0), 0), 0)
    // Chia 3 bên cho tháng hiệu lực + chuỗi các tháng có dữ liệu (mới → cũ) để thống kê
    const split3 = splitThreeWay(readings, customers, usages, mo)
    const split3Series = monthsWithData.filter(mm => mm <= mo).slice(-8).map(mm => {
      const s = splitThreeWay(readings, customers, usages, mm)
      // Phí QL tháng đó (đã lưu — nhất quán với dueMapForMonth)
      const mgmtFee = customers.reduce((sum, c) => sum + (c.feeByMonth?.[mm] ?? 0), 0)
      // SA thu hộ = phần điện/nước khách thuê chịu + phí quản lý tháng đó
      const saCollects = s.tenant + mgmtFee
      // SA net = SA thu hộ - hao hụt SA phải chịu (tenant + bqt + sonan = total → sau khi BQT trả lại thì net = mgmtFee - sonan)
      const saNet = mgmtFee - s.sonan
      return { m: mm, ...s, mgmtFee, saCollects, saNet }
    })
    const receivable = meters.reduce((s, m) => s + rowsSum(m), 0) + managementDue + otherFeesDue   // tổng phải thu hộ
    const collected = payments.filter(p => p.month === mo).reduce((s, p) => s + p.amount, 0)
    const recoveryPct = pct(collected, receivable)
    const gánhPct = pct(remainderBorne, inputCost)

    // ── Công nợ & tuổi nợ (aging) ─────────────────────────────────────────
    const monthsSet = new Set<string>()
    readings.forEach(r => monthsSet.add(r.month)); payments.forEach(p => monthsSet.add(p.month))
    const pastMonths = [...monthsSet].filter(m => m <= mo).sort()
    const custById = new Map(customers.map(c => [c.id, c]))
    const dueByCM = new Map<string, Map<string, number>>()   // month -> (cid -> due)
    const paidByCM = new Map<string, Map<string, number>>()
    for (const m of pastMonths) { dueByCM.set(m, dueMapForMonth(readings, customers, usages, m)); paidByCM.set(m, paidMapForMonth(payments, m)) }

    const aging = { cur: 0, m1: 0, m2: 0, m3: 0 }
    interface DebtRow { id: string; name: string; group: string; overdue: number; cur: number; age: number }
    const debtRows: DebtRow[] = []
    for (const c of customers) {
      // Pool approach: nhất quán với TabCongNo — tránh tính trùng khi khách trả thừa 1 tháng bù tháng khác
      let pool = c.oldDebt ?? 0   // pool > 0 = còn nợ, < 0 = đang thừa tiền
      let oldestAge = pool > 0 ? 999 : 0   // nợ cũ (oldDebt) = rất cũ, xếp vào bucket m3
      let foundOldest = pool > 0
      for (const m of pastMonths) {
        const due = dueByCM.get(m)!.get(c.id) ?? 0
        const paid = paidByCM.get(m)!.get(c.id) ?? 0
        pool = pool + due - paid
        if (pool > 0 && due > 0 && !foundOldest) {
          oldestAge = monthsBetween(m, mo)   // tháng đầu tiên bắt đầu phát sinh nợ mới
          foundOldest = true
        }
        if (pool <= 0) { foundOldest = false; oldestAge = 0 }  // tiền thừa xoá hết nợ cũ
      }
      const totalRemain = Math.max(0, pool)
      if (totalRemain <= 1) continue
      // Tách phần hiện tháng vs quá hạn
      const curDue = dueByCM.get(mo)?.get(c.id) ?? 0
      const curPaid = paidByCM.get(mo)?.get(c.id) ?? 0
      const curNet = Math.min(Math.max(0, curDue - curPaid), totalRemain)
      const overNet = totalRemain - curNet
      aging.cur += curNet
      if (overNet > 0) {
        if (oldestAge <= 1) aging.m1 += overNet
        else if (oldestAge === 2) aging.m2 += overNet
        else aging.m3 += overNet
      }
      debtRows.push({ id: c.id, name: c.name, group: c.group?.trim() || '', overdue: overNet, cur: curNet, age: oldestAge > 0 ? oldestAge : 0 })
    }
    const overdueTotal = aging.m1 + aging.m2 + aging.m3
    const outstandingTotal = aging.cur + overdueTotal
    const overdueRows = debtRows.filter(d => d.overdue > 1).sort((a, b) => b.age - a.age || b.overdue - a.overdue)
    const overdueCount = overdueRows.length
    const sev3Count = overdueRows.filter(d => d.age >= 3).length

    // ── Máy cảnh báo & đề xuất ───────────────────────────────────────────
    const alerts: { sev: Sev; title: string; detail: string }[] = []
    const missing = meters.filter(m => !m.reading)
    if (missing.length) alerts.push({ sev: 'critical', title: `Thiếu chỉ số ${missing.length}/3 đồng hồ`, detail: `${missing.map(m => meterLabel(meterNames, m.id)).join(', ')} — chưa thể chốt hoá đơn & công nợ tháng ${mo}.` })

    for (const m of meters) {
      if (m.loss?.negative) alerts.push({ sev: 'critical', title: `Ghi tầng vượt đồng hồ tổng (${meterLabel(meterNames, m.id)})`, detail: `Lệch ${fmt(-m.loss.kwh)} kWh — sai/nhập nhầm chỉ số. Rà soát lại số ghi các tầng.` })
      else if (m.loss && m.loss.pct > 15) alerts.push({ sev: 'warning', title: `Điện hao hụt cao ${m.loss.pct.toFixed(0)}% (${meterLabel(meterNames, m.id)})`, detail: `Chênh ${fmt(m.loss.kwh)} kWh do BQT/cư dân gánh (ngưỡng ≤15%). Kiểm tra rò rỉ, đấu nối, đồng hồ hỏng.` })
    }
    if (sev3Count > 0) alerts.push({ sev: 'critical', title: `${sev3Count} khách quá hạn ≥3 tháng (${fmt(aging.m3)} đ)`, detail: `Nợ khó đòi: ${overdueRows.filter(d => d.age >= 3).slice(0, 3).map(d => `${d.name} (${d.age}th)`).join(', ')}${sev3Count > 3 ? '…' : ''}. Đề xuất khoá dịch vụ / lập biên bản / cấn trừ tiền cọc.` })
    if (aging.m2 > 1) alerts.push({ sev: 'warning', title: `Quá hạn 2 tháng: ${fmt(aging.m2)} đ`, detail: `Gửi công văn nhắc nợ chính thức, hẹn mốc thanh toán trước khi chuyển nhóm nợ xấu.` })
    if (gánhPct > 25) alerts.push({ sev: 'warning', title: `Sơn An/BQT gánh ${gánhPct.toFixed(0)}% chi phí đầu vào`, detail: `${fmt(remainderBorne)} đ không phân bổ cho khách thuê. Rà soát phần hao hụt & ki-ốt trống; xem lại cách phân bổ.` })
    const inYoY = delta(inputCost, yoyInput)
    if (inYoY !== null && Math.abs(inYoY) > 20) alerts.push({ sev: 'warning', title: `Tiền điện nước ${inYoY > 0 ? 'tăng' : 'giảm'} ${Math.abs(inYoY).toFixed(0)}% so cùng kỳ năm trước`, detail: `Tháng ${mo}: ${fmt(inputCost)} đ vs ${yoyM}: ${fmt(yoyInput)} đ. Đối chiếu sản lượng & biểu giá.` })
    for (const m of meters) {
      if (!m.reading) continue
      const changed = bandsWithPriceChange(m.reading.bands, lastReadingBefore(readings, m.id, mo))
      if (changed.length) alerts.push({ sev: 'info', title: `Đơn giá đổi (${meterLabel(meterNames, m.id)})`, detail: `Khung: ${changed.map(k => BAND_LABELS[k]).join(', ')} — xác nhận đúng biểu giá EVN mới.` })
    }
    if (receivable > 0 && recoveryPct >= 99.5) alerts.push({ sev: 'good', title: 'Đã thu đủ công nợ tháng', detail: `Thu ${fmt(collected)} đ / ${fmt(receivable)} đ.` })
    else if (receivable > 0 && recoveryPct < 60) alerts.push({ sev: 'warning', title: `Tỷ lệ thu hồi thấp ${recoveryPct.toFixed(0)}%`, detail: `Còn ${fmt(Math.max(0, receivable - collected))} đ chưa thu trong tháng ${mo}. Đẩy nhanh phát hành thông báo & thu tiền.` })
    if (!alerts.some(a => a.sev !== 'good')) alerts.unshift({ sev: 'good', title: 'Vận hành ổn định', detail: 'Không phát hiện bất thường về chỉ số, hao hụt, biến động giá hay công nợ quá hạn.' })
    alerts.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev])

    return {
      meters, inputCost, prevInput, yoyInput, allocatedToTenants, remainderBorne, managementDue, otherFeesDue,
      receivable, collected, recoveryPct, gánhPct, aging, overdueTotal, outstandingTotal,
      overdueRows, overdueCount, sev3Count, alerts, missing, custById, yoyM,
      dataMonth: mo, fellBack, selectedMonth: month, split3, split3Series,
    }
  }, [readings, customers, usages, payments, month, meterNames])

  const critCount = M.alerts.filter(a => a.sev === 'critical').length
  const warnCount = M.alerts.filter(a => a.sev === 'warning').length

  const verdict = M.recoveryPct >= 90 ? 'tốt' : M.recoveryPct >= 70 ? 'khá' : M.recoveryPct >= 50 ? 'cần cải thiện' : 'yếu'

  return (
    <div>
      <style>{`
        .ov-narr { font-size:12.5px; line-height:1.6; color:var(--txt2); }
        .ov-narr b { color:var(--navy); }
        .ov-narr .up { color:#8C1F1F; font-weight:700; } .ov-narr .down { color:#1F6B3D; font-weight:700; }
        .ov-hl { font-weight:800; }

        .ov-kpi-row { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:12px; }
        @media (max-width:1100px){ .ov-kpi-row{ grid-template-columns:repeat(2,1fr);} }
        .ov-kpi { background:var(--surface); border:1px solid var(--border3); border-radius:9px; padding:9px 12px; box-shadow:var(--sh); }
        .ov-kpi-lbl { font-size:9.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#4B6A8A; display:flex; align-items:center; gap:5px; }
        .ov-kpi-val { font-size:18px; font-weight:800; color:var(--navy); line-height:1.15; margin-top:5px; }
        .ov-kpi-sub { font-size:10.5px; color:var(--muted); margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .ov-kpi-red .ov-kpi-val{color:#8C1F1F;} .ov-kpi-green .ov-kpi-val{color:#1F6B3D;} .ov-kpi-gold .ov-kpi-val{color:var(--gold2);}
        .ov-progress { height:5px; border-radius:4px; background:#E7EDF4; overflow:hidden; margin-top:6px; }
        .ov-progress > span { display:block; height:100%; border-radius:4px; }

        .ov-mom { display:inline-flex; align-items:center; gap:2px; font-size:10px; font-weight:800; padding:0 5px; border-radius:5px; white-space:nowrap; }
        .ov-mom-bad { background:#FDECEC; color:#8C1F1F; } .ov-mom-good { background:#EAF6EE; color:#1F6B3D; } .ov-mom-flat { background:#EEF3FA; color:#4B6A8A; }

        .ov-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:1100px){ .ov-grid2{ grid-template-columns:1fr; } }

        .ov-alerts { display:flex; flex-direction:column; gap:6px; }
        .ov-alert { display:flex; gap:9px; padding:8px 11px; border-radius:8px; border:1px solid; align-items:flex-start; }
        .ov-alert-critical{background:var(--redbg);border-color:#F3B4B4;} .ov-alert-warning{background:var(--amberbg);border-color:#F1D68A;}
        .ov-alert-info{background:var(--surf2);border-color:var(--border3);} .ov-alert-good{background:var(--greenbg);border-color:#B7E3C4;}
        .ov-alert-ic{font-size:14px;line-height:1.3;flex-shrink:0;}
        .ov-alert-t{font-weight:700;font-size:12px;color:var(--txt);} .ov-alert-d{font-size:11px;color:var(--txt2);margin-top:1px;line-height:1.4;}
        .ov-alert-tag{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:4px;white-space:nowrap;flex-shrink:0;}
        .ov-tag-critical{background:#8C1F1F;color:#fff;} .ov-tag-warning{background:#B78319;color:#fff;} .ov-tag-info{background:#4B6A8A;color:#fff;} .ov-tag-good{background:#1F6B3D;color:#fff;}

        .ov-bar { display:flex; height:22px; border-radius:6px; overflow:hidden; border:1px solid var(--border3); }
        .ov-bar-seg { display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#fff; min-width:0; white-space:nowrap; overflow:hidden; }
        .ov-legend { display:flex; flex-wrap:wrap; gap:12px 16px; }
        .ov-legend-item { display:flex; align-items:center; gap:6px; }
        .ov-legend-dot { width:10px; height:10px; border-radius:3px; flex-shrink:0; display:inline-block; }

        .ov-spark { display:inline-flex; align-items:flex-end; gap:2px; height:26px; width:64px; }
        .ov-spark-bar { flex:1; border-radius:2px 2px 0 0; min-height:2px; }

        .ov-age { display:flex; gap:6px; margin-bottom:10px; }
        .ov-age-cell { flex:1; border:1px solid var(--border3); border-radius:8px; padding:7px 9px; text-align:center; }
        .ov-age-v { font-size:14px; font-weight:800; line-height:1.1; } .ov-age-l { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); margin-top:2px; }
        .ov-age-cur .ov-age-v{color:var(--navy);} .ov-age-1 .ov-age-v{color:#B78319;} .ov-age-2 .ov-age-v{color:#C2410C;} .ov-age-3{background:#FDECEC;border-color:#F3B4B4;} .ov-age-3 .ov-age-v{color:#8C1F1F;}

        .ov-mini { font-size:10.5px; color:var(--muted); } .ov-sub { font-size:11px; color:var(--muted); font-weight:600; }
        .ov-tight .sc-body { padding:11px 13px; }
        .ov-dense td, .ov-dense th { padding:6px 9px !important; font-size:12px; }
        .ov-empty { font-size:12px; color:var(--muted2); font-style:italic; padding:14px; text-align:center; }
        .ov-flow { display:flex; align-items:stretch; gap:0; flex-wrap:wrap; }
      `}</style>

      {/* ── Tóm tắt điều hành tự động ─────────────────────────────────────── */}
      {M.fellBack && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--amberbg)', border: '1px solid #F1D68A', color: '#8A5A12', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          ⚠️ Tháng {M.selectedMonth} chưa nhập chỉ số điện nước — đang hiển thị số liệu tháng gần nhất có dữ liệu: <b>{M.dataMonth}</b>.
        </div>
      )}
      <div className="sc ov-tight">
        <div className="sc-head">
          <span className="sc-title">📌 Tóm tắt điều hành — tháng {M.dataMonth}</span>
          <button className="btn-ghost" onClick={() => exportTongQuan(readings, customers, usages, payments, M.dataMonth, meterNames)}>⬇ Xuất Excel</button>
        </div>
        <div className="sc-body">
          <p className="ov-narr" style={{ margin: 0 }}>
            Tháng {M.dataMonth}, Sơn An chi <b>{fmt(M.inputCost)} đ</b> trả tiền điện & nước
            {delta(M.inputCost, M.prevInput) !== null && <> (<span className={delta(M.inputCost, M.prevInput)! > 0 ? 'up' : 'down'}>{delta(M.inputCost, M.prevInput)! > 0 ? '▲' : '▼'}{Math.abs(delta(M.inputCost, M.prevInput)!).toFixed(0)}% so tháng trước</span>
            {delta(M.inputCost, M.yoyInput) !== null && <>, <span className={delta(M.inputCost, M.yoyInput)! > 0 ? 'up' : 'down'}>{delta(M.inputCost, M.yoyInput)! > 0 ? '▲' : '▼'}{Math.abs(delta(M.inputCost, M.yoyInput)!).toFixed(0)}% so cùng kỳ</span></>})</>}.
            {' '}Chia 3 bên: khách thuê chịu <b>{fmt(M.split3.tenant)} đ</b> ({pct(M.split3.tenant, M.split3.total).toFixed(0)}%),
            Ban quản trị chịu <b>{fmt(M.split3.bqt)} đ</b> ({pct(M.split3.bqt, M.split3.total).toFixed(0)}%),
            Sơn An chịu hao hụt <b style={{ color: '#8A5A12' }}>{fmt(M.split3.sonan)} đ</b> ({pct(M.split3.sonan, M.split3.total).toFixed(0)}%).
            {' '}Tổng phải thu hộ <b>{fmt(M.receivable)} đ</b> (gồm phí QL {fmt(M.managementDue)} đ{M.otherFeesDue > 0 ? `, phí khác ${fmt(M.otherFeesDue)} đ` : ''}); đã thu <b>{fmt(M.collected)} đ</b> —
            tỷ lệ thu hồi <span className={M.recoveryPct >= 70 ? 'down' : 'up'}>{M.recoveryPct.toFixed(0)}% ({verdict})</span>.
            {' '}Công nợ quá hạn <b className={M.overdueTotal > 0 ? undefined : undefined} style={{ color: M.overdueTotal > 0 ? '#8C1F1F' : '#1F6B3D' }}>{fmt(M.overdueTotal)} đ</b> từ {M.overdueCount} khách
            {M.sev3Count > 0 ? <>, trong đó <span className="up">{M.sev3Count} khách quá hạn ≥3 tháng ({fmt(M.aging.m3)} đ)</span> — cần biện pháp mạnh.</> : '.'}
          </p>
        </div>
      </div>

      {/* ── KPI dòng tiền ─────────────────────────────────────────────────── */}
      <div className="ov-kpi-row">
        <div className="ov-kpi">
          <div className="ov-kpi-lbl">⚡ Chi phí đầu vào</div>
          <div className="ov-kpi-val">{fmt(M.inputCost)} đ</div>
          <div className="ov-kpi-sub">MoM <DeltaBadge d={delta(M.inputCost, M.prevInput)} /> · YoY <DeltaBadge d={delta(M.inputCost, M.yoyInput)} /></div>
        </div>
        <div className="ov-kpi">
          <div className="ov-kpi-lbl">🧾 Phải thu hộ</div>
          <div className="ov-kpi-val">{fmt(M.receivable)} đ</div>
          <div className="ov-kpi-sub">Khách {fmtShort(M.allocatedToTenants)} · phí QL {fmtShort(M.managementDue)}{M.otherFeesDue > 0 ? ` · khác ${fmtShort(M.otherFeesDue)}` : ''}</div>
        </div>
        <div className="ov-kpi ov-kpi-green">
          <div className="ov-kpi-lbl">✓ Đã thu · {M.recoveryPct.toFixed(0)}%</div>
          <div className="ov-kpi-val">{fmt(M.collected)} đ</div>
          <div className="ov-progress"><span style={{ width: `${Math.min(100, M.recoveryPct)}%`, background: M.recoveryPct >= 80 ? 'var(--green)' : M.recoveryPct >= 50 ? 'var(--gold)' : '#DC2626' }} /></div>
        </div>
        <div className="ov-kpi ov-kpi-gold">
          <div className="ov-kpi-lbl">🏢 Sơn An chịu (hao hụt)</div>
          <div className="ov-kpi-val">{fmt(M.split3.sonan)} đ</div>
          <div className="ov-kpi-sub">Khách thuê {fmtShort(M.split3.tenant)} · BQT {fmtShort(M.split3.bqt)}</div>
        </div>
        <div className="ov-kpi ov-kpi-red">
          <div className="ov-kpi-lbl">⚠ Công nợ quá hạn</div>
          <div className="ov-kpi-val">{fmt(M.overdueTotal)} đ</div>
          <div className="ov-kpi-sub">{M.overdueCount} khách · tồn đọng {fmtShort(M.outstandingTotal)}</div>
        </div>
      </div>

      {/* ── Cảnh báo & đề xuất ───────────────────────────────────────────── */}
      <div className="sc ov-tight">
        <div className="sc-head">
          <span className="sc-title">🔎 Cảnh báo & đề xuất điều hành</span>
          <span className="ov-sub">{critCount} khẩn · {warnCount} cảnh báo</span>
        </div>
        <div className="sc-body">
          <div className="ov-alerts">
            {M.alerts.map((a, i) => (
              <div key={i} className={`ov-alert ov-alert-${a.sev}`}>
                <span className="ov-alert-ic">{SEV_META[a.sev].ic}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ov-alert-t">{a.title}</div>
                  <div className="ov-alert-d">{a.detail}</div>
                </div>
                <span className={`ov-alert-tag ov-tag-${a.sev}`}>{SEV_META[a.sev].tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 2 cột: biến động đồng hồ | công nợ tuổi nợ ───────────────────── */}
      <div className="ov-grid2">
        <div className="sc ov-tight" style={{ marginBottom: 0 }}>
          <div className="sc-head"><span className="sc-title">Biến động tiền điện – nước theo đồng hồ</span></div>
          <div className="sc-body">
            <div className="dn-scroll">
              <table className="dn-table ov-dense">
                <thead><tr>
                  <th>Đồng hồ</th><th style={{ textAlign: 'right' }}>Sản lượng</th><th style={{ textAlign: 'right' }}>Tiền tháng</th>
                  <th style={{ textAlign: 'right' }}>MoM</th><th style={{ textAlign: 'right' }}>YoY</th><th style={{ textAlign: 'center' }}>6 tháng</th>
                </tr></thead>
                <tbody>
                  {M.meters.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{meterLabel(meterNames, m.id)}
                        {m.loss && <div className="ov-mini" style={{ color: m.loss.negative ? '#DC2626' : m.loss.pct > 15 ? '#B78319' : 'var(--muted)' }}>hao hụt {fmt(m.loss.kwh)} kWh{!m.loss.negative && ` (${m.loss.pct.toFixed(0)}%)`}</div>}
                      </td>
                      {m.reading ? <>
                        <td style={{ textAlign: 'right' }}>{fmt(m.consumption)} <span className="ov-mini">{METER_UNIT[m.id]}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.billed)}</td>
                        <td style={{ textAlign: 'right' }}><DeltaBadge d={delta(m.billed, m.prevBilled)} /></td>
                        <td style={{ textAlign: 'right' }}><DeltaBadge d={delta(m.billed, m.yoyBilled)} /></td>
                        <td style={{ textAlign: 'center' }}><Spark vals={m.spark} cur={m.billed} /></td>
                      </> : <td colSpan={5} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Chưa nhập chỉ số</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background: '#E0EDFA' }}>
                  <td style={{ fontWeight: 700 }}>Tổng</td><td></td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(M.inputCost)}</td>
                  <td style={{ textAlign: 'right' }}><DeltaBadge d={delta(M.inputCost, M.prevInput)} /></td>
                  <td style={{ textAlign: 'right' }}><DeltaBadge d={delta(M.inputCost, M.yoyInput)} /></td>
                  <td></td>
                </tr></tfoot>
              </table>
            </div>
            {M.split3.total > 0 && (
              <div style={{ marginTop: 11 }}>
                <div className="ov-mini" style={{ marginBottom: 5, fontWeight: 700 }}>Chia 3 bên chịu chi phí — tháng {M.dataMonth}</div>
                <div className="ov-bar">
                  <div className="ov-bar-seg" style={{ width: `${pct(M.split3.tenant, M.split3.total)}%`, background: 'var(--navy)' }} title={`Khách thuê: ${fmt(M.split3.tenant)} đ`}>{pct(M.split3.tenant, M.split3.total) >= 10 ? `Khách ${pct(M.split3.tenant, M.split3.total).toFixed(0)}%` : ''}</div>
                  <div className="ov-bar-seg" style={{ width: `${pct(M.split3.bqt, M.split3.total)}%`, background: 'var(--navy3)' }} title={`Ban quản trị: ${fmt(M.split3.bqt)} đ`}>{pct(M.split3.bqt, M.split3.total) >= 10 ? `BQT ${pct(M.split3.bqt, M.split3.total).toFixed(0)}%` : ''}</div>
                  <div className="ov-bar-seg" style={{ width: `${pct(M.split3.sonan, M.split3.total)}%`, background: 'var(--gold)' }} title={`Sơn An chịu (hao hụt): ${fmt(M.split3.sonan)} đ`}>{pct(M.split3.sonan, M.split3.total) >= 10 ? `Sơn An ${pct(M.split3.sonan, M.split3.total).toFixed(0)}%` : ''}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sc ov-tight" style={{ marginBottom: 0 }}>
          <div className="sc-head">
            <span className="sc-title">Công nợ theo tuổi nợ</span>
            <span className="ov-sub">Tồn đọng {fmt(M.outstandingTotal)} đ</span>
          </div>
          <div className="sc-body">
            <div className="ov-age">
              <div className="ov-age-cell ov-age-cur"><div className="ov-age-v">{fmtShort(M.aging.cur)}</div><div className="ov-age-l">Trong tháng</div></div>
              <div className="ov-age-cell ov-age-1"><div className="ov-age-v">{fmtShort(M.aging.m1)}</div><div className="ov-age-l">Quá hạn 1th</div></div>
              <div className="ov-age-cell ov-age-2"><div className="ov-age-v">{fmtShort(M.aging.m2)}</div><div className="ov-age-l">Quá hạn 2th</div></div>
              <div className="ov-age-cell ov-age-3"><div className="ov-age-v">{fmtShort(M.aging.m3)}</div><div className="ov-age-l">Quá hạn ≥3th</div></div>
            </div>
            <div className="dn-scroll">
              <table className="dn-table ov-dense">
                <thead><tr>
                  <th>Khách quá hạn</th><th style={{ textAlign: 'center' }}>Số tháng</th><th style={{ textAlign: 'right' }}>Nợ quá hạn</th><th style={{ textAlign: 'center' }}>Biện pháp</th>
                </tr></thead>
                <tbody>
                  {M.overdueRows.length === 0 && <tr><td colSpan={4} className="ov-empty">Không có công nợ quá hạn. ✅</td></tr>}
                  {M.overdueRows.slice(0, 6).map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.name}{d.group && <span className="ov-mini"> · {d.group}</span>}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: d.age >= 3 ? '#8C1F1F' : d.age === 2 ? '#C2410C' : '#B78319' }}>{d.age} th</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{fmt(d.overdue)} đ</td>
                      <td style={{ textAlign: 'center' }}>
                        {d.age >= 3 ? <span className="badge badge-red">Khoá / cấn cọc</span> : d.age === 2 ? <span className="badge badge-amber">Công văn nhắc</span> : <span className="badge badge-amber">Nhắc lần 1</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {M.overdueRows.length > 6 && <div className="ov-mini" style={{ marginTop: 7 }}>… và {M.overdueRows.length - 6} khách khác — xem tab <b>Công nợ &amp; Thu tiền</b>.</div>}
          </div>
        </div>
      </div>

      {/* ── Chia 3 bên chịu chi phí — theo tháng ─────────────────────────── */}
      <div className="sc ov-tight" style={{ marginTop: 14 }}>
        <div className="sc-head">
          <span className="sc-title">Phân bổ chi phí điện nước cho 3 bên — theo tháng</span>
          <span className="ov-sub">Khách thuê · Ban quản trị · Sơn An chịu (hao hụt)</span>
        </div>
        <div className="sc-body">
          <div className="dn-scroll">
            <table className="dn-table ov-dense">
              <thead><tr>
                <th>Tháng</th>
                <th style={{ textAlign: 'right' }}>Chi phí điện nước</th>
                <th style={{ textAlign: 'right' }}>BQT chịu</th>
                <th style={{ textAlign: 'right', color: '#8A5A12' }}>SA chịu hao hụt</th>
                <th style={{ textAlign: 'right', color: '#1F6B3D' }}>SA thu hộ</th>
                <th style={{ textAlign: 'right' }}>Chênh lệch SA</th>
                <th style={{ width: 130 }}>Tỷ trọng 3 bên</th>
              </tr></thead>
              <tbody>
                {M.split3Series.length === 0 && <tr><td colSpan={7} className="ov-empty">Chưa có tháng nào nhập chỉ số điện nước.</td></tr>}
                {[...M.split3Series].reverse().map(s => (
                  <tr key={s.m} style={s.m === M.dataMonth ? { background: '#EEF3FA' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{s.m}{s.m === M.dataMonth && <span className="ov-mini"> ·hiện tại</span>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(s.total)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(s.bqt)} <span className="ov-mini">{pct(s.bqt, s.total).toFixed(0)}%</span></td>
                    <td style={{ textAlign: 'right', color: '#8A5A12', fontWeight: 600 }}>{fmt(s.sonan)} <span className="ov-mini">{pct(s.sonan, s.total).toFixed(0)}%</span></td>
                    <td style={{ textAlign: 'right', color: '#1F6B3D', fontWeight: 600 }}>{fmt(s.saCollects)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: s.saNet >= 0 ? '#1F6B3D' : '#8C1F1F' }}>
                      {s.saNet >= 0 ? '+' : ''}{fmt(s.saNet)}
                    </td>
                    <td>
                      <div className="ov-bar" style={{ height: 14, borderRadius: 4 }}>
                        <div style={{ width: `${pct(s.tenant, s.total)}%`, background: 'var(--navy)' }} title={`Khách thuê: ${fmt(s.tenant)}`} />
                        <div style={{ width: `${pct(s.bqt, s.total)}%`, background: 'var(--navy3)' }} title={`BQT: ${fmt(s.bqt)}`} />
                        <div style={{ width: `${pct(s.sonan, s.total)}%`, background: 'var(--gold)' }} title={`SA chịu: ${fmt(s.sonan)}`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ov-legend" style={{ marginTop: 10 }}>
            <span className="ov-legend-item ov-mini"><span className="ov-legend-dot" style={{ background: 'var(--navy)' }} />Khách thuê chịu (điện/nước)</span>
            <span className="ov-legend-item ov-mini"><span className="ov-legend-dot" style={{ background: 'var(--navy3)' }} />Ban quản trị chịu (khu chung cư dân)</span>
            <span className="ov-legend-item ov-mini"><span className="ov-legend-dot" style={{ background: 'var(--gold)' }} />SA chịu hao hụt kỹ thuật</span>
            <span className="ov-legend-item ov-mini" style={{ color: '#1F6B3D' }}>SA thu hộ = điện/nước khách + phí QL · Chênh lệch = phí QL − hao hụt</span>
          </div>
        </div>
      </div>
    </div>
  )
}
