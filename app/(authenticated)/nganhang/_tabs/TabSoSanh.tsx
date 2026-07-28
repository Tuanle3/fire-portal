'use client'
import { useMemo, useState } from 'react'
import { BankRelation, BankProposal, BankNote, LOAI_VAY_LABEL, TRANG_THAI_PA_LABEL } from '@/lib/bank-types'
import { exportBankWord } from '@/lib/bank-baocao-word'

function fmtN(v: number): string { return v.toLocaleString('vi-VN') }

interface Props {
  relations: BankRelation[]
  proposals: BankProposal[]
  notes: BankNote[]
}

const ROWS: { label: string; get: (p: BankProposal, bankName: string) => string; bestOf?: (p: BankProposal) => number; better?: 'min' | 'max' }[] = [
  { label: 'Ngân hàng', get: (_p, bankName) => bankName },
  { label: 'Loại vay', get: p => LOAI_VAY_LABEL[p.loaiVay] },
  { label: 'Lãi suất (%/năm)', get: p => (p.laiSuat ? p.laiSuat.toFixed(2) + '%' : '—'), bestOf: p => p.laiSuat, better: 'min' },
  { label: 'Hạn mức đề xuất (đ)', get: p => (p.hanMucDeXuat ? fmtN(p.hanMucDeXuat) : '—'), bestOf: p => p.hanMucDeXuat, better: 'max' },
  { label: 'Tỷ lệ TSĐB', get: p => (p.tyLeTSDB ? p.tyLeTSDB.toFixed(1) + '%' : '—') },
  { label: 'Thời hạn', get: p => p.thoiHan || '—' },
  { label: 'Phí dịch vụ', get: p => p.phiDichVu || '—' },
  { label: 'Điều kiện kèm theo', get: p => p.dieuKien || '—' },
  { label: 'Ưu điểm', get: p => p.uuDiem.length ? p.uuDiem.map(s => '+ ' + s).join('\n') : '—' },
  { label: 'Nhược điểm', get: p => p.nhuocDiem.length ? p.nhuocDiem.map(s => '− ' + s).join('\n') : '—' },
  { label: 'Trạng thái', get: p => TRANG_THAI_PA_LABEL[p.trangThai] },
]

export function TabSoSanh({ relations, proposals, notes }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deXuat, setDeXuat] = useState('')
  const [exporting, setExporting] = useState<'compact' | 'full' | null>(null)

  const bankName = (id: string) => relations.find(r => r.id === id)?.tenNganHang ?? '—'
  const chosen = useMemo(() => proposals.filter(p => selected.has(p.id)), [proposals, selected])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const doExport = async (mode: 'compact' | 'full') => {
    setExporting(mode)
    try {
      await exportBankWord({
        printDate: new Date().toLocaleDateString('vi-VN'),
        relations,
        proposals: chosen.map(p => ({ ...p, tenNganHang: bankName(p.nganHangId) })),
        notes: [...notes].sort((a, b) => b.ngay.localeCompare(a.ngay)).slice(0, 10).map(n => ({ ...n, tenNganHang: bankName(n.nganHangId) })),
        deXuat,
        mode,
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Chọn phương án để so sánh</span>
          <span style={{ fontSize: 10.5, color: '#9CA3AF' }}>{selected.size} đã chọn</span>
        </div>
        <div className="nh-card-body">
          {proposals.length === 0 ? (
            <div style={{ padding: 12, color: '#9CA3AF', fontSize: 12.5 }}>Chưa có phương án nào — thêm ở tab &quot;Ngân hàng &amp; Phương án&quot;.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proposals.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span style={{ fontWeight: 600 }}>{p.tenPhuongAn}</span>
                  <span style={{ color: '#6B7280' }}>— {bankName(p.nganHangId)} · {LOAI_VAY_LABEL[p.loaiVay]}{p.laiSuat ? ` · ${p.laiSuat.toFixed(2)}%` : ''}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="nh-card">
          <div className="nh-card-head">
            <span className="nh-card-title">Bảng so sánh</span>
          </div>
          <div className="nh-card-body" style={{ overflowX: 'auto' }}>
            <table className="nh-tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>CHỈ TIÊU</th>
                  {chosen.map(p => <th key={p.id} style={{ minWidth: 160 }}>{p.tenPhuongAn}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(rd => {
                  let bestVal: number | null = null
                  if (rd.bestOf) {
                    const vals = chosen.map(rd.bestOf).filter(v => v !== 0)
                    if (vals.length) bestVal = rd.better === 'min' ? Math.min(...vals) : Math.max(...vals)
                  }
                  return (
                    <tr key={rd.label}>
                      <td style={{ fontWeight: 700, color: '#4B6A8A', fontSize: 11 }}>{rd.label}</td>
                      {chosen.map(p => {
                        const isBest = bestVal !== null && rd.bestOf?.(p) === bestVal
                        return (
                          <td key={p.id} style={{ whiteSpace: 'pre-wrap', color: isBest ? '#1F6B3D' : undefined, fontWeight: isBest ? 700 : undefined, background: isBest ? '#EAF6EE' : undefined }}>
                            {rd.get(p, bankName(p.nganHangId))}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Đề xuất / Kết luận</span>
        </div>
        <div className="nh-card-body">
          <textarea className="nh-textarea" rows={4} placeholder="Nhập nhận định, đề xuất phương án tối ưu để đưa vào báo cáo..."
            value={deXuat} onChange={e => setDeXuat(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" disabled={exporting !== null} onClick={() => doExport('compact')}>
              {exporting === 'compact' ? 'Đang xuất...' : '⬇ Xuất Word (gọn)'}
            </button>
            <button className="btn-ghost" disabled={exporting !== null} onClick={() => doExport('full')}>
              {exporting === 'full' ? 'Đang xuất...' : '⬇ Xuất Word (đầy đủ)'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
