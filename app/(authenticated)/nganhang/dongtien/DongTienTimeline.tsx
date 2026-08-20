// ============================================================
// TIMELINE — Biểu đồ cột thu/chi + đường tồn quỹ luỹ kế
// Dùng recharts (npm i recharts). Phần 4.
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { DongTienItem } from '@/lib/dong-tien-types'
import { rollupTheoDonVi, DonViThoiGian, CashFlowBucket } from '@/lib/dong-tien-engine'

interface Props {
  items:       DongTienItem[]
  donVi:       DonViThoiGian
  soDuBanDau?: number
}

const VND    = new Intl.NumberFormat('vi-VN')
const VND_M  = (v: number) => {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} tỷ`
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(0)} tr`
  return VND.format(v)
}

// Tooltip tuỳ chỉnh
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as (CashFlowBucket & { tonQuy: number }) | undefined
  if (!d) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--nh-border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,.10)',
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--nh-navy)' }}>{d.kyLabel}</div>
      <div style={{ color: 'var(--nh-muted2)', fontSize: 11, marginBottom: 8 }}>
        {d.tuNgay} → {d.denNgay}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ color: '#22863a' }}>▲ Tổng thu</span>
        <span style={{ fontWeight: 700, color: '#22863a' }}>+{VND.format(d.tongThu)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ color: '#c0392b' }}>▼ Tổng chi</span>
        <span style={{ fontWeight: 700, color: '#c0392b' }}>−{VND.format(d.tongChi)}</span>
      </div>
      <div style={{ borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: 'var(--nh-navy)' }}>⬟ Tồn quỹ cuối kỳ</span>
        <span style={{ fontWeight: 700, color: d.tonQuyCuoiKy >= 0 ? 'var(--nh-navy)' : '#c0392b' }}>
          {VND.format(d.tonQuyCuoiKy)}
        </span>
      </div>
      <div style={{ marginTop: 4, color: 'var(--nh-muted2)', fontSize: 11 }}>
        {d.chiTiet.length} khoản trong kỳ
      </div>
    </div>
  )
}

export default function DongTienTimeline({ items, donVi, soDuBanDau }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const buckets = useMemo(
    () => rollupTheoDonVi(items, donVi, soDuBanDau),
    [items, donVi, soDuBanDau],
  )

  // recharts cần dữ liệu phẳng
  const chartData = useMemo(() =>
    buckets.map(b => ({
      ...b,
      tonQuy: b.tonQuyCuoiKy,
    })),
    [buckets],
  )

  const selectedBucket = buckets.find(b => b.key === selectedKey)

  if (buckets.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 40 }}>
        Chưa có dữ liệu trong khoảng thời gian đã chọn.
      </div>
    )
  }

  return (
    <div>
      {!soDuBanDau && (
        <p className="nh-hint" style={{ marginBottom: 12 }}>
          ⚠️ Đường tồn quỹ đang tính <strong>tương đối</strong> từ mốc 0 — chưa có số dư quỹ thật.
        </p>
      )}

      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
            onClick={(d: any) => {
              const key = d?.activePayload?.[0]?.payload?.key
              if (key) setSelectedKey((prev: string | null) => prev === key ? null : key)
            }}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />
            <XAxis
              dataKey="kyLabel"
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="tien"
              tickFormatter={VND_M}
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              width={68}
            />
            <YAxis
              yAxisId="tonquy"
              orientation="right"
              tickFormatter={VND_M}
              tick={{ fontSize: 11, fill: 'var(--nh-navy)' }}
              axisLine={false}
              tickLine={false}
              width={68}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => {
                if (value === 'tongThu') return 'Tổng thu'
                if (value === 'tongChi') return 'Tổng chi'
                if (value === 'tonQuy') return 'Tồn quỹ cuối kỳ'
                return value
              }}
            />
            <Bar yAxisId="tien" dataKey="tongThu" name="tongThu" radius={[3, 3, 0, 0]} maxBarSize={40}>
              {chartData.map(b => (
                <Cell
                  key={b.key}
                  fill={selectedKey === b.key ? '#15803d' : '#22863a'}
                  opacity={selectedKey && selectedKey !== b.key ? 0.45 : 1}
                />
              ))}
            </Bar>
            <Bar yAxisId="tien" dataKey="tongChi" name="tongChi" radius={[3, 3, 0, 0]} maxBarSize={40}>
              {chartData.map(b => (
                <Cell
                  key={b.key}
                  fill={selectedKey === b.key ? '#a93226' : '#c0392b'}
                  opacity={selectedKey && selectedKey !== b.key ? 0.45 : 1}
                />
              ))}
            </Bar>
            <Line
              yAxisId="tonquy"
              type="monotone"
              dataKey="tonQuy"
              name="tonQuy"
              stroke="var(--nh-navy)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--nh-navy)', strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Panel chi tiết kỳ đang chọn */}
      {selectedBucket && (
        <div style={{
          marginTop: 16, background: '#F7F9FC', borderRadius: 8,
          border: '1px solid var(--nh-border)', padding: '12px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: 'var(--nh-navy)' }}>
              Chi tiết {selectedBucket.kyLabel}
            </span>
            <button
              className="btn-ghost"
              style={{ padding: '3px 10px', fontSize: 12 }}
              onClick={() => setSelectedKey(null)}
            >✕ Đóng</button>
          </div>
          <table className="nh-tbl" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Pháp nhân</th>
                <th>Diễn giải</th>
                <th className="r">Số tiền</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {selectedBucket.chiTiet.map(it => (
                <tr key={it.id}>
                  <td>{it.ngay}</td>
                  <td>{it.entity}</td>
                  <td>{it.nhanNhan}</td>
                  <td className="r" style={{ fontWeight: 700, color: it.loai === 'thu' ? 'var(--nh-green)' : 'var(--nh-red)' }}>
                    {it.loai === 'thu' ? '+' : '−'}{VND.format(it.soTien)}
                  </td>
                  <td>
                    <span className={`nh-badge ${it.trangThai === 'thuc-te' ? 'nh-b-green' : 'nh-b-amber'}`}>
                      {it.trangThai === 'thuc-te' ? 'Đã thực hiện' : 'Dự kiến'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!selectedBucket && (
        <p className="nh-hint" style={{ marginTop: 8 }}>
          Click vào cột bất kỳ trên biểu đồ để xem chi tiết các khoản trong kỳ đó.
        </p>
      )}
    </div>
  )
}
