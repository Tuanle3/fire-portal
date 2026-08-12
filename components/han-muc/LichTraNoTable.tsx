'use client'

import { useState } from 'react'
import { Check, X, CalendarDays, Banknote, Pencil } from 'lucide-react'
import { markKyDaTraThucTe } from '@/lib/han-muc-store'
import { HopDongTinDung, KyTraNo } from '@/lib/han-muc-types'

const fmt = (n: number) => n.toLocaleString('vi-VN')

const STATUS_STYLE: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'bg-slate-100 text-slate-500 border border-slate-200',
  'gan-han':  'bg-amber-50 text-amber-700 border border-amber-200',
  'qua-han':  'bg-red-50 text-red-700 border border-red-200',
  'da-tra':   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'co-cau':   'bg-blue-50 text-blue-700 border border-blue-200',
}
const STATUS_LABEL: Record<KyTraNo['trangThai'], string> = {
  'chua-tra': 'Chưa trả',
  'gan-han':  'Gần hạn',
  'qua-han':  'Quá hạn',
  'da-tra':   'Đã trả',
  'co-cau':   'Đã cơ cấu',
}

interface Props {
  hopDong: HopDongTinDung
  rows: KyTraNo[]
}

export default function LichTraNoTable({ hopDong, rows }: Props) {
  const [markingId, setMarkingId]     = useState<string | null>(null)
  const [ngayThucTra, setNgayThucTra] = useState('')
  const [gocThucTra, setGocThucTra]   = useState('')
  const [laiThucTra, setLaiThucTra]   = useState('')
  const [saving, setSaving]           = useState(false)

  const startMark = (ky: KyTraNo) => {
    setMarkingId(ky.id)
    const daTra = ky.trangThai === 'da-tra'
    setNgayThucTra(daTra && ky.ngayThucTra ? ky.ngayThucTra : new Date().toISOString().slice(0, 10))
    setGocThucTra(String(daTra && ky.gocThucTra != null ? ky.gocThucTra : ky.gocTra))
    setLaiThucTra(String(daTra && ky.laiThucTra != null ? ky.laiThucTra : ky.laiTra))
  }

  const confirmMark = async (ky: KyTraNo) => {
    setSaving(true)
    try {
      await markKyDaTraThucTe(
        hopDong, ky, rows, ngayThucTra,
        Number(gocThucTra) || 0, Number(laiThucTra) || 0,
      )
      setMarkingId(null)
    } finally {
      setSaving(false)
    }
  }

  const chenhLech = (ky: KyTraNo) => {
    if (ky.trangThai !== 'da-tra' || ky.gocThucTra == null) return null
    const d = (ky.gocThucTra + (ky.laiThucTra ?? 0)) - ky.tongTra
    return d === 0 ? null : d
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 1080 }}>
        <thead>
          <tr style={{ background: 'var(--nh-navy, #1C3557)', color: '#fff' }}>
            <th className="px-4 py-3 text-left font-medium text-xs opacity-80 whitespace-nowrap">Kỳ</th>
            <th className="px-4 py-3 text-left font-medium text-xs opacity-80 whitespace-nowrap">Ngày trả</th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap">Dư nợ đầu kỳ</th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap">
              <div>Gốc</div>
              <div className="font-normal opacity-60">Lãi</div>
            </th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap">Tổng trả</th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap">Dư nợ cuối kỳ</th>
            <th className="px-4 py-3 text-center font-medium text-xs opacity-80 whitespace-nowrap">Trạng thái</th>
            <th className="px-4 py-3 text-center font-medium text-xs opacity-80" style={{ minWidth: 220 }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ky, idx) => {
            const lech      = chenhLech(ky)
            const isMarking = markingId === ky.id
            const isDaTra   = ky.trangThai === 'da-tra'
            const isQuaHan  = ky.trangThai === 'qua-han'
            const rowBg     = isQuaHan ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#f8fafc'

            return (
              <tr
                key={ky.id}
                style={{ background: rowBg, borderBottom: '1px solid #e8ecf0' }}
              >
                {/* Kỳ */}
                <td className="px-4 py-3 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--nh-navy, #1C3557)' }}>
                  {ky.soKy}
                </td>

                {/* Ngày trả */}
                <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{ky.ngayTra}</td>

                {/* Dư nợ đầu kỳ */}
                <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(ky.dunNoDauKy)}</td>

                {/* Gốc + Lãi gộp trong 1 ô */}
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                  {/* Gốc */}
                  <div className="font-semibold" style={{ color: '#1C3557' }}>
                    {fmt(ky.gocTra)}
                    {isDaTra && ky.gocThucTra != null && ky.gocThucTra !== ky.gocTra && (
                      <span className="ml-1 text-[10px] text-amber-600 font-normal">→{fmt(ky.gocThucTra)}</span>
                    )}
                  </div>
                  {/* Lãi */}
                  <div className="text-xs" style={{ color: '#D4A64A' }}>
                    {fmt(ky.laiTra)}
                    {isDaTra && ky.laiThucTra != null && ky.laiThucTra !== ky.laiTra && (
                      <span className="ml-1 text-[10px] text-amber-600">→{fmt(ky.laiThucTra)}</span>
                    )}
                  </div>
                </td>

                {/* Tổng trả */}
                <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: isQuaHan ? '#b91c1c' : '#111' }}>
                  {fmt(ky.tongTra)}
                  {lech !== null && (
                    <div className={`text-[10px] font-normal ${lech > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {lech > 0 ? '+' : ''}{fmt(lech)}
                    </div>
                  )}
                </td>

                {/* Dư nợ cuối kỳ */}
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">{fmt(ky.dunNoCuoiKy)}</td>

                {/* Trạng thái */}
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[ky.trangThai]}`}>
                    {STATUS_LABEL[ky.trangThai]}
                  </span>
                </td>

                {/* Thao tác */}
                <td className="px-4 py-3 text-center">
                  {isDaTra && !isMarking ? (
                    <button
                      onClick={() => startMark(ky)}
                      style={{
                        fontSize: 11, padding: '4px 10px',
                        border: '1px solid #cbd5e1', borderRadius: 6,
                        background: '#fff', color: '#475569',
                        cursor: 'pointer', fontWeight: 500,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                      title="Sửa ngày/số tiền đã trả thực tế"
                    >
                      <Pencil size={12} /> {ky.ngayThucTra}
                    </button>
                  ) : isMarking ? (
                    /* ── Form xác nhận thanh toán ── */
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #dde3ea',
                      borderRadius: 8,
                      padding: '10px 10px 8px',
                      minWidth: 200,
                      textAlign: 'left',
                    }}>
                      {/* Ngày */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CalendarDays size={10} /> Ngày thực trả
                        </div>
                        <input
                          type="date" value={ngayThucTra}
                          onChange={e => setNgayThucTra(e.target.value)}
                          style={{
                            width: '100%', fontSize: 12, padding: '4px 6px',
                            border: '1px solid #d1d5db', borderRadius: 5,
                            background: '#fff', color: '#111',
                          }}
                        />
                      </div>

                      {/* Gốc + Lãi */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, marginBottom: 2, color: '#1C3557', fontWeight: 600 }}>
                            Gốc (₫)
                          </div>
                          <input
                            type="number" value={gocThucTra}
                            onChange={e => setGocThucTra(e.target.value)}
                            style={{
                              width: '100%', fontSize: 12, padding: '4px 6px',
                              border: '1px solid #1C355733', borderRadius: 5,
                              background: '#fff', color: '#1C3557',
                            }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, marginBottom: 2, color: '#b45309', fontWeight: 600 }}>
                            Lãi (₫)
                          </div>
                          <input
                            type="number" value={laiThucTra}
                            onChange={e => setLaiThucTra(e.target.value)}
                            style={{
                              width: '100%', fontSize: 12, padding: '4px 6px',
                              border: '1px solid #D4A64A55', borderRadius: 5,
                              background: '#fff', color: '#b45309',
                            }}
                          />
                        </div>
                      </div>

                      {/* Tổng preview */}
                      <div style={{
                        fontSize: 11, background: '#1C355710', borderRadius: 5,
                        padding: '4px 8px', marginBottom: 8, display: 'flex', justifyContent: 'space-between'
                      }}>
                        <span style={{ color: '#6b7280' }}>Tổng:</span>
                        <span style={{ fontWeight: 700, color: '#1C3557' }}>
                          {fmt((Number(gocThucTra) || 0) + (Number(laiThucTra) || 0))} ₫
                        </span>
                      </div>

                      {Number(gocThucTra) !== ky.gocTra && (
                        <div style={{ fontSize: 10, color: '#d97706', marginBottom: 6, lineHeight: 1.4 }}>
                          ⚠ Gốc lệch kế hoạch → tự tính lại các kỳ sau
                        </div>
                      )}

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setMarkingId(null)}
                          style={{
                            fontSize: 11, padding: '4px 10px',
                            border: '1px solid #d1d5db', borderRadius: 5,
                            background: '#fff', color: '#6b7280', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <X size={11} /> Hủy
                        </button>
                        <button
                          onClick={() => confirmMark(ky)}
                          disabled={saving}
                          style={{
                            fontSize: 11, padding: '4px 10px',
                            border: 'none', borderRadius: 5,
                            background: saving ? '#93aec8' : '#1C3557',
                            color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <Check size={11} /> {saving ? 'Đang lưu…' : isDaTra ? 'Cập nhật' : 'Xác nhận'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startMark(ky)}
                      style={{
                        fontSize: 11, padding: '4px 10px',
                        border: '1px solid #D4A64A', borderRadius: 6,
                        background: '#fffbf0', color: '#92600a',
                        cursor: 'pointer', fontWeight: 500,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Banknote size={12} /> Đánh dấu đã trả
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
                Chưa có lịch trả nợ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}