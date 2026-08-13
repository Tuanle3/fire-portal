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

// ── Gộp 180 kỳ tháng thành nhóm quý (3 tháng/nhóm) ──────────
interface QuarterGroup {
  soQuy: number          // 1, 2, 3 ... 60
  thang: KyTraNo[]       // 3 kỳ tháng trong quý
  kyGoc: KyTraNo         // kỳ tháng cuối quý (có gốc)
}

// hasStub: hợp đồng có kỳ lẻ ngày đầu (Kỳ 0: chỉ tính lãi) — dòng đầu tiên
// của rows không tính vào nhóm quý, hiển thị riêng ở trên.
function groupByQuarter(rows: KyTraNo[], hasStub: boolean): { stub: KyTraNo | null; groups: QuarterGroup[] } {
  const stub = hasStub ? (rows[0] ?? null) : null
  const monthRows = hasStub ? rows.slice(1) : rows
  const groups: QuarterGroup[] = []
  for (let i = 0; i < monthRows.length; i += 3) {
    const thang = monthRows.slice(i, i + 3)
    if (!thang.length) break
    const kyGoc = thang[thang.length - 1]
    groups.push({ soQuy: groups.length + 1, thang, kyGoc })
  }
  return { stub, groups }
}

interface Props {
  hopDong: HopDongTinDung
  rows: KyTraNo[]
}

export default function LichTraNoTable({ hopDong, rows }: Props) {
  const isLaiThangGocQuy = hopDong.kyTra === 'monthly' && hopDong.kyTraGoc === 'quarterly'

  const [markingId, setMarkingId]     = useState<string | null>(null)
  const [ngayThucTra, setNgayThucTra] = useState('')
  const [gocThucTra, setGocThucTra]   = useState('')
  const [laiThucTra, setLaiThucTra]   = useState('')
  const [saving, setSaving]           = useState(false)
  // Quý đang mở rộng (null = tất cả thu gọn nếu muốn; hiện để expand theo click)
  const [expandedQuy, setExpandedQuy] = useState<Set<number>>(new Set())

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

  const toggleQuy = (soQuy: number) => {
    setExpandedQuy(prev => {
      const next = new Set(prev)
      next.has(soQuy) ? next.delete(soQuy) : next.add(soQuy)
      return next
    })
  }

  // ── Render form xác nhận thanh toán ─────────────────────────
  const renderMarkForm = (ky: KyTraNo) => {
    const isDaTra = ky.trangThai === 'da-tra'
    return (
      <div style={{
        background: '#f8fafc', border: '1px solid #dde3ea',
        borderRadius: 8, padding: '10px 10px 8px',
        minWidth: 200, textAlign: 'left',
      }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CalendarDays size={10} /> Ngày thực trả
          </div>
          <input
            type="date" value={ngayThucTra}
            onChange={e => setNgayThucTra(e.target.value)}
            style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#111' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10, marginBottom: 2, color: '#1C3557', fontWeight: 600 }}>Gốc (₫)</div>
            <input type="number" value={gocThucTra} onChange={e => setGocThucTra(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #1C355733', borderRadius: 5, background: '#fff', color: '#1C3557' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, marginBottom: 2, color: '#b45309', fontWeight: 600 }}>Lãi (₫)</div>
            <input type="number" value={laiThucTra} onChange={e => setLaiThucTra(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #D4A64A55', borderRadius: 5, background: '#fff', color: '#b45309' }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, background: '#1C355710', borderRadius: 5, padding: '4px 8px', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#6b7280' }}>Tổng:</span>
          <span style={{ fontWeight: 700, color: '#1C3557' }}>{fmt((Number(gocThucTra) || 0) + (Number(laiThucTra) || 0))} ₫</span>
        </div>
        {Number(gocThucTra) !== ky.gocTra && (
          <div style={{ fontSize: 10, color: '#d97706', marginBottom: 6, lineHeight: 1.4 }}>
            ⚠ Gốc lệch kế hoạch → tự tính lại các kỳ sau
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={() => setMarkingId(null)}
            style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            <X size={11} /> Hủy
          </button>
          <button onClick={() => confirmMark(ky)} disabled={saving}
            style={{ fontSize: 11, padding: '4px 10px', border: 'none', borderRadius: 5, background: saving ? '#93aec8' : '#1C3557', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Check size={11} /> {saving ? 'Đang lưu…' : isDaTra ? 'Cập nhật' : 'Xác nhận'}
          </button>
        </div>
      </div>
    )
  }

  // ── Render nút thao tác (dùng chung cho cả 2 chế độ) ────────
  const renderAction = (ky: KyTraNo) => {
    const isDaTra   = ky.trangThai === 'da-tra'
    const isMarking = markingId === ky.id
    if (isDaTra && !isMarking) return (
      <button onClick={() => startMark(ky)}
        style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title="Sửa ngày/số tiền đã trả thực tế">
        <Pencil size={12} /> {ky.ngayThucTra}
      </button>
    )
    if (isMarking) return renderMarkForm(ky)
    return (
      <button onClick={() => startMark(ky)}
        style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #D4A64A', borderRadius: 6, background: '#fffbf0', color: '#92600a', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Banknote size={12} /> Đánh dấu đã trả
      </button>
    )
  }

  // ── Render thao tác cho kỳ CHỈ TRẢ LÃI (tháng con trong quý) ──
  const renderActionLaiOnly = (ky: KyTraNo) => {
    const isDaTra   = ky.trangThai === 'da-tra'
    const isMarking = markingId === ky.id
    if (isMarking) {
      // Form rút gọn: chỉ ngày + lãi (gốc = 0 cố định)
      return (
        <div style={{
          background: '#f8fafc', border: '1px solid #dde3ea',
          borderRadius: 8, padding: '8px 10px',
          minWidth: 180, textAlign: 'left',
        }}>
          <div style={{ marginBottom: 5 }}>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>Ngày thực trả</div>
            <input
              type="date" value={ngayThucTra}
              onChange={e => setNgayThucTra(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#111' }}
            />
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, marginBottom: 2, color: '#b45309', fontWeight: 600 }}>Lãi thực trả (₫)</div>
            <input type="number" value={laiThucTra} onChange={e => setLaiThucTra(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #D4A64A55', borderRadius: 5, background: '#fff', color: '#b45309' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setMarkingId(null)}
              style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
              Hủy
            </button>
            <button onClick={async () => {
              setSaving(true)
              try {
                // gocThucTra = 0 (kỳ này chỉ trả lãi)
                await markKyDaTraThucTe(hopDong, ky, rows, ngayThucTra, 0, Number(laiThucTra) || 0)
                setMarkingId(null)
              } finally { setSaving(false) }
            }} disabled={saving}
              style={{ fontSize: 11, padding: '3px 8px', border: 'none', borderRadius: 5, background: saving ? '#93aec8' : '#1C3557', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '…' : isDaTra ? 'Cập nhật' : 'Xác nhận'}
            </button>
          </div>
        </div>
      )
    }
    if (isDaTra) {
      return (
        <button onClick={() => {
          setMarkingId(ky.id)
          setNgayThucTra(ky.ngayThucTra ?? new Date().toISOString().slice(0, 10))
          setGocThucTra('0')
          setLaiThucTra(String(ky.laiThucTra ?? ky.laiTra))
        }}
          style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          title="Sửa lãi đã trả">
          <Pencil size={11} /> {ky.ngayThucTra ?? ''}
        </button>
      )
    }
    return (
      <button onClick={() => {
        setMarkingId(ky.id)
        setNgayThucTra(new Date().toISOString().slice(0, 10))
        setGocThucTra('0')
        setLaiThucTra(String(ky.laiTra))
      }}
        style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #D4A64A', borderRadius: 6, background: '#fffbf0', color: '#92600a', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Banknote size={11} /> Đánh dấu lãi
      </button>
    )
  }

  // ════════════════════════════════════════════════════════════
  // CHẾ ĐỘ: Lãi tháng + Gốc quý → bảng nhóm quý
  // ════════════════════════════════════════════════════════════
  if (isLaiThangGocQuy) {
    // hasStub phải khớp CHÍNH XÁC với logic backend (buildScheduleLaiThangGocQuy):
    // nếu ngày-trong-tháng của "ngày trả gốc đầu tiên" TRÙNG ngày-trong-tháng của
    // "ngày ký" thì không có kỳ lẻ nào cả — rows[0] là kỳ thường, không phải Kỳ 0.
    const ngayKyDate = hopDong.ngayKy ? new Date(hopDong.ngayKy) : null
    const ankerDayFE = hopDong.ngayTraGocDauTien ? new Date(hopDong.ngayTraGocDauTien).getDate() : null
    const hasStub = !!hopDong.ngayTraGocDauTien && !!ngayKyDate && rows.length > 0
      && ankerDayFE !== ngayKyDate.getDate()
    const { stub, groups } = groupByQuarter(rows, hasStub)
    const totalQuarters = groups.length

    return (
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', width: '100%', position: 'relative' }}>
        <table style={{ width: '100%', minWidth: 1500, borderCollapse: 'collapse', fontSize: 12 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '8%'  }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--nh-navy, #1C3557)', color: '#fff' }}>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'left',   fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.03em', background: 'var(--nh-navy, #1C3557)' }}>Kỳ gốc</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'left',   fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Tháng / Ngày trả</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'right',  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Dư nợ đầu kỳ</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'right',  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>
                <div>Gốc trả</div>
                <div style={{ fontWeight: 400, opacity: 0.65, fontSize: 10 }}>chỉ cuối quý</div>
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'right',  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Lãi tháng</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'right',  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Tổng trả</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'right',  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Dư nợ cuối kỳ</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Trạng thái</th>
              <th style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--nh-navy, #1C3557)' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {stub && (
              <tr style={{ background: stub.trangThai === 'da-tra' ? '#f0fdf4' : '#fafbff', borderBottom: '2px solid #cbd5e1' }}>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: '50%',
                      background: '#EEF3FA', color: '#1C3557',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>
                      0
                    </span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1C3557' }}>Kỳ 0</div>
                      <div style={{ fontSize: 10.5, color: '#9ca3af' }}>tính lãi (kỳ lẻ ngày)</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: 11.5, color: '#6b7280' }}>{stub.ngayTra}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: '#374151' }}>
                  {fmt(stub.dunNoDauKy)}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontSize: 13, color: '#D4A64A', fontWeight: 700 }}>{fmt(stub.laiTra)}</div>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700, color: '#111' }}>
                  {fmt(stub.tongTra)}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: '#374151' }}>
                  {fmt(stub.dunNoCuoiKy)}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLE[stub.trangThai]}`}>
                    {STATUS_LABEL[stub.trangThai]}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  {renderActionLaiOnly(stub)}
                </td>
              </tr>
            )}
            {groups.map((grp) => {
              const isExpanded = expandedQuy.has(grp.soQuy)
              // Trạng thái tổng quý: ưu tiên qua-han > gan-han > da-tra (nếu tất cả đã trả) > chua-tra
              const allDaTra = grp.thang.every(k => k.trangThai === 'da-tra')
              const anyQuaHan = grp.thang.some(k => k.trangThai === 'qua-han')
              const anyGanHan = grp.thang.some(k => k.trangThai === 'gan-han')
              const quyTrangThai = anyQuaHan ? 'qua-han' : anyGanHan ? 'gan-han' : allDaTra ? 'da-tra' : 'chua-tra'

              // Tổng lãi cả quý
              const tongLaiQuy = grp.thang.reduce((s, k) => s + k.laiTra, 0)
              const tongTraQuy = grp.kyGoc.gocTra + tongLaiQuy
              const kyGoc = grp.kyGoc
              const lech = chenhLech(kyGoc)

              // Màu nền hàng quý
              const quyBg = anyQuaHan ? '#fff0f0'
                : allDaTra ? '#f0fdf4'
                : grp.soQuy % 2 === 0 ? '#f8fafc' : '#fff'

              return [
                // ── Hàng TỔNG QUÝ ──────────────────────────────
                <tr
                  key={`quy-${grp.soQuy}`}
                  style={{ background: quyBg, borderBottom: isExpanded ? 'none' : '1px solid #e0e7ef', cursor: 'pointer' }}
                  onClick={() => toggleQuy(grp.soQuy)}
                >
                  {/* Kỳ gốc */}
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 32, height: 32, borderRadius: '50%',
                        background: allDaTra ? '#d1fae5' : '#EEF3FA',
                        color: allDaTra ? '#065f46' : '#1C3557',
                        fontSize: 12, fontWeight: 800, flexShrink: 0,
                      }}>
                        {grp.soQuy}
                      </span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1C3557' }}>
                          Quý {grp.soQuy}<span style={{ color: '#9ca3af', fontWeight: 400 }}> / {totalQuarters}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: '#6b7280' }}>
                          {grp.thang.length} tháng lãi
                        </div>
                      </div>
                      <span style={{ marginLeft: 4, fontSize: 11, color: '#9ca3af', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
                    </div>
                  </td>

                  {/* Tháng / Ngày trả gốc */}
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 11.5, color: '#374151' }}>
                      {grp.thang[0]?.ngayTra?.slice(0, 7)} →
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1C3557' }}>
                      {kyGoc.ngayTra} <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>(gốc)</span>
                    </div>
                  </td>

                  {/* Dư nợ đầu quý */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: '#374151' }}>
                    {fmt(grp.thang[0].dunNoDauKy)}
                  </td>

                  {/* Gốc trả */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1C3557' }}>
                      {kyGoc.gocTra > 0 ? fmt(kyGoc.gocTra) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </div>
                    {allDaTra && kyGoc.gocThucTra != null && kyGoc.gocThucTra !== kyGoc.gocTra && (
                      <div style={{ fontSize: 10.5, color: '#d97706' }}>→ {fmt(kyGoc.gocThucTra)}</div>
                    )}
                  </td>

                  {/* Tổng lãi quý */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 13, color: '#D4A64A', fontWeight: 700 }}>{fmt(tongLaiQuy)}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>3 tháng cộng dồn</div>
                  </td>

                  {/* Tổng trả quý */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: anyQuaHan ? '#b91c1c' : '#111' }}>
                      {fmt(tongTraQuy)}
                    </div>
                    {lech !== null && (
                      <div style={{ fontSize: 10.5, color: lech > 0 ? '#ef4444' : '#10b981' }}>
                        {lech > 0 ? '+' : ''}{fmt(lech)}
                      </div>
                    )}
                  </td>

                  {/* Dư nợ cuối quý */}
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: '#374151' }}>
                    {fmt(kyGoc.dunNoCuoiKy)}
                  </td>

                  {/* Trạng thái quý */}
                  <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-medium ${STATUS_STYLE[quyTrangThai as KyTraNo['trangThai']]}`}>
                      {STATUS_LABEL[quyTrangThai as KyTraNo['trangThai']]}
                    </span>
                  </td>

                  {/* Thao tác gốc quý */}
                  <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {renderAction(kyGoc)}
                  </td>
                </tr>,

                // ── Hàng CHI TIẾT 3 tháng (khi mở rộng) ────────
                ...(isExpanded ? grp.thang.map((ky, mIdx) => {
                  const isLast = mIdx === grp.thang.length - 1
                  const monthBg = ky.trangThai === 'qua-han' ? '#fff5f5' : '#fafbff'
                  return (
                    <tr
                      key={`ky-${ky.id}`}
                      style={{
                        background: monthBg,
                        borderBottom: isLast ? '2px solid #cbd5e1' : '1px dashed #e5e7eb',
                      }}
                    >
                      {/* Tháng label */}
                      <td style={{ padding: '7px 14px 7px 40px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 3, height: 22, background: '#D4A64A', borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#374151' }}>
                              Tháng {mIdx + 1}
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>kỳ #{ky.soKy}</div>
                          </div>
                        </div>
                      </td>

                      {/* Ngày trả tháng */}
                      <td style={{ padding: '7px 14px', whiteSpace: 'nowrap', fontSize: 11.5, color: '#6b7280' }}>{ky.ngayTra}</td>

                      {/* Dư nợ đầu tháng */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: '#4b5563' }}>
                        {fmt(ky.dunNoDauKy)}
                      </td>

                      {/* Gốc tháng: chỉ tháng 3 mới có */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {isLast && ky.gocTra > 0
                          ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1C3557' }}>{fmt(ky.gocTra)}</span>
                          : <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                        }
                      </td>

                      {/* Lãi tháng */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#b45309', fontWeight: 600 }}>
                        {fmt(ky.laiTra)}
                      </td>

                      {/* Tổng trả tháng */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                        {fmt(ky.tongTra)}
                      </td>

                      {/* Dư nợ cuối tháng */}
                      <td style={{ padding: '7px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: '#4b5563' }}>
                        {fmt(ky.dunNoCuoiKy)}
                      </td>

                      {/* Trạng thái tháng */}
                      <td style={{ padding: '7px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[ky.trangThai]}`}>
                          {STATUS_LABEL[ky.trangThai]}
                        </span>
                      </td>

                      {/* Thao tác tháng */}
                      <td style={{ padding: '7px 14px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {isLast
                          ? <span style={{ fontSize: 10.5, color: '#9ca3af' }}>↑ xác nhận trên</span>
                          : renderActionLaiOnly(ky)
                        }
                      </td>
                    </tr>
                  )
                }) : []),
              ]
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                  Chưa có lịch trả nợ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  // CHẾ ĐỘ THÔNG THƯỜNG (monthly / quarterly đồng nhất)
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', position: 'relative' }}>
      <table className="w-full text-sm" style={{ minWidth: 1080 }}>
        <thead>
          <tr style={{ background: 'var(--nh-navy, #1C3557)', color: '#fff' }}>
            <th className="px-4 py-3 text-left font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>Kỳ</th>
            <th className="px-4 py-3 text-left font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>Ngày trả</th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>Dư nợ đầu kỳ</th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>
              <div>Gốc</div>
              <div className="font-normal opacity-60">Lãi</div>
            </th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>Tổng trả</th>
            <th className="px-4 py-3 text-right font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>Dư nợ cuối kỳ</th>
            <th className="px-4 py-3 text-center font-medium text-xs opacity-80 whitespace-nowrap" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)' }}>Trạng thái</th>
            <th className="px-4 py-3 text-center font-medium text-xs opacity-80" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--nh-navy, #1C3557)', minWidth: 220 }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ky, idx) => {
            const lech      = chenhLech(ky)
            const isMarking = markingId === ky.id
            const isDaTra   = ky.trangThai === 'da-tra'
            const isQuaHan  = ky.trangThai === 'qua-han'
            const rowBg     = isQuaHan ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#f8fafc'
            // Kỳ lẻ ngày đầu (chỉ tính lãi, không thu gốc) — luôn là dòng đầu tiên khi hợp đồng có ngayTraGocDauTien
            const isStubKy  = idx === 0 && !!hopDong.ngayTraGocDauTien && ky.gocTra === 0
            // Số hiển thị: kỳ stub = 0, các kỳ sau = 1, 2, 3... (soKy trong store bắt đầu từ 1 cho stub, 2 cho kỳ 1 thực sự)
            const soKyHienThi = isStubKy ? 0 : (hopDong.ngayTraGocDauTien ? ky.soKy - 1 : ky.soKy)

            return (
              <tr key={ky.id} style={{ background: rowBg, borderBottom: '1px solid #e8ecf0' }}>
                <td className="px-4 py-3 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--nh-navy, #1C3557)' }}>
                  {isStubKy
                    ? <>
                        <div>Kỳ 0</div>
                        <div style={{ fontSize: 9.5, fontWeight: 500, color: '#9ca3af' }}>tính lãi</div>
                      </>
                    : soKyHienThi
                  }
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{ky.ngayTra}</td>
                <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{fmt(ky.dunNoDauKy)}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                  <div className="font-semibold" style={{ color: '#1C3557' }}>
                    {fmt(ky.gocTra)}
                    {isDaTra && ky.gocThucTra != null && ky.gocThucTra !== ky.gocTra && (
                      <span className="ml-1 text-[10px] text-amber-600 font-normal">→{fmt(ky.gocThucTra)}</span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: '#D4A64A' }}>
                    {fmt(ky.laiTra)}
                    {isDaTra && ky.laiThucTra != null && ky.laiThucTra !== ky.laiTra && (
                      <span className="ml-1 text-[10px] text-amber-600">→{fmt(ky.laiThucTra)}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: isQuaHan ? '#b91c1c' : '#111' }}>
                  {fmt(ky.tongTra)}
                  {lech !== null && (
                    <div className={`text-[10px] font-normal ${lech > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {lech > 0 ? '+' : ''}{fmt(lech)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">{fmt(ky.dunNoCuoiKy)}</td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[ky.trangThai]}`}>
                    {STATUS_LABEL[ky.trangThai]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {renderAction(ky)}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                Chưa có lịch trả nợ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}