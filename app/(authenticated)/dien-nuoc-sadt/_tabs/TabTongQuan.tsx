'use client'
import {
  MeterReading, Customer, CustomerUsage, Payment, MeterId,
  METER_LABELS, meterAllocation, meterTotal,
} from '@/lib/dien-nuoc-types'

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN')

export function TabTongQuan({ readings, customers, usages, payments, month }: {
  readings: MeterReading[]; customers: Customer[]; usages: CustomerUsage[]; payments: Payment[]; month: string
}) {
  const monthReadings = readings.filter(r => r.month === month)
  const totalBill = monthReadings.reduce((s, r) => s + meterTotal(r.bands, r.vatPercent), 0)

  const allAlloc = monthReadings.map(r => ({ meterId: r.meterId, alloc: meterAllocation(r, customers, usages) }))
  const allRows = allAlloc.flatMap(a => a.alloc.rows)
  const totalDue = allRows.reduce((s, r) => s + r.amount, 0)

  const paidByCustomer = (customerId: string) => payments.filter(p => p.customerId === customerId && p.month === month).reduce((s, p) => s + p.amount, 0)
  const totalPaid = allRows.reduce((s, r) => s + paidByCustomer(r.customer.id), 0)
  const totalRemain = Math.max(0, totalDue - totalPaid)

  const activeCustomers = customers.filter(c => c.active).length

  return (
    <div>
      <div className="ceo-kpi-row">
        <div className="ceo-kpi">
          <div className="ceo-kpi-label">⚡ TỔNG TIỀN ĐIỆN NƯỚC THÁNG</div>
          <div className="ceo-kpi-val">{fmt(totalBill)} đ</div>
          <div className="ceo-kpi-sub">{monthReadings.length}/3 đồng hồ đã nhập chỉ số</div>
        </div>
        <div className="ceo-kpi ceo-kpi-green">
          <div className="ceo-kpi-label">✓ ĐÃ THU</div>
          <div className="ceo-kpi-val">{fmt(totalPaid)} đ</div>
          <div className="ceo-kpi-sub">{totalDue ? Math.round(totalPaid / totalDue * 100) : 0}% tổng phải thu</div>
        </div>
        <div className="ceo-kpi ceo-kpi-red">
          <div className="ceo-kpi-label">⚠ CÔNG NỢ CÒN LẠI</div>
          <div className="ceo-kpi-val">{fmt(totalRemain)} đ</div>
          <div className="ceo-kpi-sub">Tổng phải thu: {fmt(totalDue)} đ</div>
        </div>
        <div className="ceo-kpi ceo-kpi-amber">
          <div className="ceo-kpi-label">👥 KHÁCH HÀNG</div>
          <div className="ceo-kpi-val">{activeCustomers}</div>
          <div className="ceo-kpi-sub">Đang hoạt động</div>
        </div>
      </div>

      <div className="sc">
        <div className="sc-head"><span className="sc-title">Tổng hợp theo đồng hồ — tháng {month}</span></div>
        <div className="sc-body">
          <table className="dn-table">
            <thead><tr>
              <th>Đồng hồ</th><th style={{ textAlign: 'right' }}>Tổng tiền</th><th style={{ textAlign: 'right' }}>Đã phân bổ khách</th><th style={{ textAlign: 'right' }}>Còn lại (Ban quản trị / gánh)</th>
            </tr></thead>
            <tbody>
              {([1, 2, 3] as MeterId[]).map(id => {
                const r = monthReadings.find(x => x.meterId === id)
                if (!r) return (
                  <tr key={id}><td style={{ fontWeight: 600 }}>{METER_LABELS[id]}</td><td colSpan={3} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Chưa nhập chỉ số</td></tr>
                )
                const alloc = meterAllocation(r, customers, usages)
                return (
                  <tr key={id}>
                    <td style={{ fontWeight: 600 }}>{METER_LABELS[id]}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(alloc.total)} đ</td>
                    <td style={{ textAlign: 'right' }}>{fmt(alloc.allocated)} đ</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(alloc.remainderTotal)} đ</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
