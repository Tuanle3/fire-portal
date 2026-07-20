'use client'
import { useState, useMemo } from 'react'
import { NganSachThang, NganSachItem, GiaiPhap } from '@/lib/ngan-sach-types'
import { exportNganSachExcel } from '@/lib/ngan-sach-export'

const fmt = (n: number) => n === 0 ? '—' : n.toLocaleString('vi-VN')
const fmtSigned = (n: number) => {
  if (n === 0) return '—'
  return n < 0 ? `(${Math.abs(n).toLocaleString('vi-VN')})` : n.toLocaleString('vi-VN')
}
const numColor = (n: number) => n < 0 ? '#B91C1C' : n > 0 ? '#166534' : '#6B7280'

interface TonQuyAcc { stk: string; bank: string; unit: string; dauKy: number; ton: number }

interface Props {
  data: NganSachThang
  tonQuySoDu: number       // opening balance (đầu tháng) → KH column
  tonQuyRealtime: number   // current real-time balance → Còn phải TH column
  tonQuySoDuLoading: boolean
  kmcpActual: Record<string, number>
  thuThang: number
  chiThang: number
  tonQuyDetail?: TonQuyAcc[]
}

function resolveThucHien(it: NganSachItem, kmcpActual: Record<string, number>, tonQuyRealtime: number) {
  if (it.nhom === 'A' && !it.is_section) return { val: tonQuyRealtime, isAuto: true }
  if (it.kmcp && it.kmcp in kmcpActual) return { val: kmcpActual[it.kmcp], isAuto: true }
  return { val: it.thuc_hien, isAuto: false }
}

export function TabTongHop({ data, tonQuySoDu, tonQuyRealtime, tonQuySoDuLoading, kmcpActual, chiThang, tonQuyDetail = [] }: Props) {
  const { thang, ngay_cap_nhat, items, giai_phap } = data
  const [year, mon] = thang.split('-')
  const thangLabel = `T${parseInt(mon)}.${year}`

  // Collapsed group IDs — default all groups collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(items.filter(it => it.is_group).map(it => it.id))
  )
  const [showTonQuyDetail, setShowTonQuyDetail] = useState(false)
  const toggle = (id: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try { await exportNganSachExcel(data, tonQuySoDu, kmcpActual, thangLabel, tonQuyRealtime) }
    finally { setExporting(false) }
  }

  // Resolve all items with auto values
  const resolved = useMemo(() =>
    items.map(it => ({ ...it, ...resolveThucHien(it, kmcpActual, tonQuyRealtime) })),
    [items, kmcpActual, tonQuyRealtime]
  )

  // Build group subtotals: group_id → { kh, th }
  const groupTotals = useMemo(() => {
    const m = new Map<string, { kh: number; th: number }>()
    for (const it of resolved) {
      if (!it.parent_id) continue
      if (!m.has(it.parent_id)) m.set(it.parent_id, { kh: 0, th: 0 })
      const g = m.get(it.parent_id)!
      g.kh += it.ke_hoach
      g.th += it.val
    }
    return m
  }, [resolved])

  // Section totals (sum of all non-section, non-group items + group subtotals)
  const sectionTotals = useMemo(() => {
    let B_kh = 0, B_th = 0, C_kh = 0, C_th = 0
    // Add standalone B/C items (no parent_id)
    for (const it of resolved) {
      if (it.is_section || it.is_group || it.parent_id) continue
      if (it.nhom === 'B') { B_kh += it.ke_hoach; B_th += it.val }
      if (it.nhom === 'C') { C_kh += it.ke_hoach; C_th += it.val }
    }
    // Add group subtotals for B/C
    for (const it of resolved) {
      if (!it.is_group) continue
      const gt = groupTotals.get(it.id) ?? { kh: 0, th: 0 }
      if (it.nhom === 'B') { B_kh += gt.kh; B_th += gt.th }
      if (it.nhom === 'C') { C_kh += gt.kh; C_th += gt.th }
    }
    // Section A uses props directly: KH = opening balance, TH = real-time balance
    const D_kh = tonQuySoDu + B_kh - C_kh
    const D_th = tonQuyRealtime + B_th - C_th
    return { B_kh, B_th, C_kh, C_th, D_kh, D_th }
  }, [resolved, groupTotals, tonQuySoDu, tonQuyRealtime])

  const gpTotal = useMemo(() => {
    let kh = 0, th = 0
    for (const gp of giai_phap) if (gp.trang_thai !== 'no') { kh += gp.so_tien_ke_hoach; th += gp.so_tien_thuc_hien }
    return { kh, th }
  }, [giai_phap])

  const F_kh = sectionTotals.D_kh + gpTotal.kh
  const F_th = sectionTotals.D_th + gpTotal.th

  const matchedChi = Object.entries(kmcpActual).filter(([k]) => k.startsWith('CP-')).reduce((s, [, v]) => s + v, 0)
  const unallocatedChi = Math.max(0, chiThang - matchedChi)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1C3557', textTransform: 'uppercase' }}>
          Kế hoạch dòng tiền {thangLabel}
        </span>
        <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>cập nhật {ngay_cap_nhat}</span>
        {collapsed.size > 0 && (
          <button onClick={() => setCollapsed(new Set())}
            style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
            Mở rộng tất cả
          </button>
        )}
        {unallocatedChi > 0 && (
          <span style={{ fontSize: 11.5, background: '#FEF9C3', color: '#854D0E', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
            ⚠ {unallocatedChi.toLocaleString('vi-VN')} ₫ chi chưa phân loại
          </span>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            marginLeft: 'auto', padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: exporting ? '#F3F4F6' : '#166534', color: exporting ? '#9CA3AF' : '#fff',
            border: 'none', borderRadius: 7, cursor: exporting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {exporting ? '⏳ Đang xuất…' : '⬇ Xuất Excel'}
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'inherit' }}>
        <thead>
          <tr style={{ background: '#1C3557', color: '#fff' }}>
            <th style={TH(36)}>STT</th>
            <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10 }}>Diễn giải</th>
            <th style={TH(80)}>KMCP</th>
            <th style={TH(150)}>{thangLabel} (KH)</th>
            <th style={TH(160)}>Đã thực hiện</th>
            <th style={TH(150)}>Còn phải TH</th>
            <th style={{ ...TH(), textAlign: 'left', paddingLeft: 10, minWidth: 120 }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {resolved.map(it => {
            // Hide children of collapsed groups
            if (it.parent_id && collapsed.has(it.parent_id)) return null

            // ── MAJOR SECTION (A/B/C/D) ──────────────────────────────────────
            if (it.is_section) {
              const { B_kh, B_th, C_kh, C_th, D_kh, D_th } = sectionTotals
              let kh = 0, th = 0
              if (it.nhom === 'B') { kh = B_kh; th = B_th }
              if (it.nhom === 'C') { kh = C_kh; th = C_th }
              const bg = it.nhom === 'A' ? '#ECFDF5' : it.nhom === 'B' ? '#EFF6FF'
                       : it.nhom === 'C' ? '#FFF7ED' : '#FEF3C7'
              return (
                <>
                <tr key={it.id} style={{ background: bg, fontWeight: 700, borderTop: '2px solid #E5E7EB' }}>
                  <td style={TD({ center: true })}>
                    {it.nhom === 'A' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>A</span>
                        <button
                          onClick={() => setShowTonQuyDetail(v => !v)}
                          title={showTonQuyDetail ? 'Thu gọn' : 'Xem chi tiết từng tài khoản'}
                          style={{
                            width: 20, height: 20, borderRadius: 4, border: '1px solid #6EE7B7',
                            background: showTonQuyDetail ? '#059669' : '#fff',
                            color: showTonQuyDetail ? '#fff' : '#059669',
                            cursor: 'pointer', fontWeight: 700, fontSize: 13, lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >{showTonQuyDetail ? '−' : '+'}</button>
                      </div>
                    ) : it.stt}
                  </td>
                  <td style={TD({})}>{it.dien_giai}</td>
                  <td />
                  {it.nhom === 'A' ? (
                    <>
                      <td style={TD({ right: true })}>
                        {tonQuySoDuLoading
                          ? <span style={{ color: '#9CA3AF' }}>…</span>
                          : <span>{fmt(tonQuySoDu)}</span>}
                      </td>
                      <td style={TD({ right: true, color: '#9CA3AF' })}>—</td>
                      <td style={TD({ right: true })}>
                        {tonQuySoDuLoading
                          ? <span style={{ color: '#9CA3AF' }}>…</span>
                          : <span style={{ color: '#166534' }}>{fmt(tonQuyRealtime)} <AutoBadge /></span>}
                      </td>
                    </>
                  ) : it.nhom === 'B' || it.nhom === 'C' ? (
                    <>
                      <td style={TD({ right: true })}>{fmt(kh)}</td>
                      <td style={TD({ right: true })}>{fmt(th)}</td>
                      <td style={TD({ right: true, color: numColor(kh - th) })}>{fmtSigned(kh - th)}</td>
                    </>
                  ) : it.nhom === 'D' ? (
                    <>
                      <td style={TD({ right: true, color: numColor(D_kh) })}>{fmtSigned(D_kh)}</td>
                      <td style={TD({ right: true, color: numColor(D_th) })}>{fmtSigned(D_th)}</td>
                      <td style={TD({ right: true, color: numColor(D_kh - D_th) })}>{fmtSigned(D_kh - D_th)}</td>
                    </>
                  ) : <><td /><td /><td /></>}
                  <td style={TD({})}>{it.ghi_chu}</td>
                </tr>
                {it.nhom === 'A' && showTonQuyDetail && tonQuyDetail.map(d => (
                  <tr key={d.stk} style={{ background: '#F0FDF4', borderBottom: '1px solid #D1FAE5' }}>
                    <td />
                    <td style={{ ...TD({}), paddingLeft: 24, color: '#374151', fontSize: 12 }}>
                      <span style={{ color: '#6B7280', marginRight: 6 }}>└</span>
                      {d.unit || '—'}
                      {d.bank && <span style={{ marginLeft: 8, color: '#9CA3AF', fontSize: 11 }}>{d.bank}</span>}
                      {d.stk && <span style={{ marginLeft: 6, color: '#9CA3AF', fontSize: 11, fontFamily: 'monospace' }}>({d.stk})</span>}
                    </td>
                    <td />
                    <td style={{ ...TD({ right: true }), color: d.dauKy < 0 ? '#991B1B' : '#374151', fontSize: 12 }}>
                      {d.dauKy !== 0 ? d.dauKy.toLocaleString('vi-VN') + ' ₫' : '—'}
                    </td>
                    <td />
                    <td style={{ ...TD({ right: true }), fontWeight: 600, color: d.ton < 0 ? '#991B1B' : '#166534', fontSize: 12 }}>
                      {d.ton !== 0 ? d.ton.toLocaleString('vi-VN') + ' ₫' : '—'}
                    </td>
                    <td />
                  </tr>
                ))}
                </>
              )
            }

            // ── SUB-GROUP HEADER (I/II/III...) ───────────────────────────────
            if (it.is_group) {
              const gt = groupTotals.get(it.id) ?? { kh: 0, th: 0 }
              const isOpen = !collapsed.has(it.id)
              const bg = it.nhom === 'B' ? '#DBEAFE' : it.nhom === 'C' ? '#FFEDD5' : '#F3F4F6'
              const conlai = gt.kh - gt.th
              return (
                <tr key={it.id} style={{ background: bg, fontWeight: 600, borderBottom: '1px solid #E5E7EB' }}>
                  <td style={{ ...TD({ center: true }), padding: '6px 4px' }}>
                    <button
                      onClick={() => toggle(it.id)}
                      title={isOpen ? 'Thu gọn' : 'Mở rộng'}
                      style={{
                        width: 22, height: 22, borderRadius: 4, border: '1px solid',
                        borderColor: it.nhom === 'B' ? '#93C5FD' : '#FBB6A0',
                        background: isOpen ? (it.nhom === 'B' ? '#3B82F6' : '#F97316') : '#fff',
                        color: isOpen ? '#fff' : (it.nhom === 'B' ? '#3B82F6' : '#F97316'),
                        cursor: 'pointer', fontWeight: 700, fontSize: 14, lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: 'auto',
                      }}
                    >{isOpen ? '−' : '+'}</button>
                  </td>
                  <td style={{ ...TD({}), paddingLeft: 12 }}>
                    <span style={{ marginRight: 6, fontSize: 11.5, color: '#6B7280' }}>{it.stt}</span>
                    {it.dien_giai}
                    <span style={{ marginLeft: 8, fontSize: 10, color: '#9CA3AF' }}>
                      ({(groupTotals.get(it.id)?.kh !== undefined
                        ? groupTotals.get(it.id)!.kh
                        : 0).toLocaleString('vi-VN')} KH)
                    </span>
                  </td>
                  <td style={TD({ center: true, muted: true, mono: true })}>{it.kmcp}</td>
                  <td style={TD({ right: true })}>{fmt(gt.kh)}</td>
                  <td style={TD({ right: true })}>
                    {gt.th > 0
                      ? <span style={{ color: '#166534' }}>{fmt(gt.th)}</span>
                      : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </td>
                  <td style={TD({ right: true, color: numColor(conlai) })}>{fmtSigned(conlai)}</td>
                  <td style={TD({ muted: true })}>{it.ghi_chu}</td>
                </tr>
              )
            }

            // ── DETAIL ITEM ───────────────────────────────────────────────────
            const conlai = it.ke_hoach - it.val
            const isChild = !!it.parent_id
            return (
              <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={TD({ center: true, muted: true })}>{it.stt}</td>
                <td style={{ ...TD({}), paddingLeft: isChild ? 28 : 10 }}>
                  {isChild && <span style={{ marginRight: 6, color: '#D1D5DB' }}>└</span>}
                  {it.dien_giai}
                </td>
                <td style={TD({ center: true, muted: true, mono: true })}>{it.kmcp}</td>
                <td style={TD({ right: true })}>{fmt(it.ke_hoach)}</td>
                <td style={TD({ right: true })}>
                  {it.val > 0
                    ? <span style={{ color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        {fmt(it.val)}{it.isAuto && <AutoBadge />}
                      </span>
                    : <span style={{ color: '#D1D5DB' }}>—</span>}
                </td>
                <td style={TD({ right: true, color: numColor(conlai) })}>{fmtSigned(conlai)}</td>
                <td style={TD({ muted: true })}>{it.ghi_chu}</td>
              </tr>
            )
          })}

          {/* Section E */}
          <tr style={{ background: '#F0FDF4', fontWeight: 700, borderTop: '2px solid #166534' }}>
            <td style={TD({ center: true })}>E</td>
            <td style={TD({})}>GIẢI PHÁP CÂN ĐỐI</td>
            <td /><td style={TD({ right: true })}>{fmt(gpTotal.kh)}</td>
            <td style={TD({ right: true, color: '#166534' })}>{fmt(gpTotal.th)}</td>
            <td style={TD({ right: true, color: numColor(gpTotal.kh - gpTotal.th) })}>{fmtSigned(gpTotal.kh - gpTotal.th)}</td>
            <td />
          </tr>
          {giai_phap.map((gp: GiaiPhap) => (
            <tr key={gp.id} style={{
              background: gp.trang_thai === 'yes' ? '#F0FDF4' : gp.trang_thai === 'no' ? '#FEF2F2' : '#FFFBEB',
              borderBottom: '1px solid #F3F4F6',
            }}>
              <td style={TD({ center: true })}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: gp.trang_thai === 'yes' ? '#DCFCE7' : gp.trang_thai === 'no' ? '#FEE2E2' : '#FEF9C3',
                  color: gp.trang_thai === 'yes' ? '#166534' : gp.trang_thai === 'no' ? '#991B1B' : '#854D0E',
                }}>{gp.trang_thai === 'yes' ? 'Yes' : gp.trang_thai === 'no' ? 'No' : '?'}</span>
              </td>
              <td style={TD({})}>{gp.mo_ta}</td><td />
              <td style={TD({ right: true })}>{fmt(gp.so_tien_ke_hoach)}</td>
              <td style={TD({ right: true, color: '#166534' })}>{fmt(gp.so_tien_thuc_hien)}</td>
              <td style={TD({ right: true, color: numColor(gp.so_tien_ke_hoach - gp.so_tien_thuc_hien) })}>
                {fmtSigned(gp.so_tien_ke_hoach - gp.so_tien_thuc_hien)}
              </td>
              <td style={{ ...TD({}), whiteSpace: 'normal', color: '#6B7280', fontSize: 11.5 }}>{gp.ghi_chu}</td>
            </tr>
          ))}

          {/* Section F */}
          <tr style={{ background: '#EFF6FF', fontWeight: 700, borderTop: '2px solid #1C3557' }}>
            <td style={TD({ center: true })}>F</td>
            <td style={TD({})}>DÒNG TIỀN SAU CÂN ĐỐI</td>
            <td /><td style={TD({ right: true, color: numColor(F_kh) })}>{fmtSigned(F_kh)}</td>
            <td style={TD({ right: true, color: numColor(F_th) })}>{fmtSigned(F_th)}</td>
            <td style={TD({ right: true, color: numColor(F_kh - F_th) })}>{fmtSigned(F_kh - F_th)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#6B7280', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><AutoBadge /> Tự động từ Firebase (Nhóm_CP)</span>
        <span>Số âm = (xxx)</span>
        <span>+/− để bung/thu nhóm</span>
      </div>
    </div>
  )
}

function AutoBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#DCFCE7', color: '#166534', letterSpacing: '.02em', verticalAlign: 'middle' }}>
      AUTO
    </span>
  )
}

function TH(w?: number): React.CSSProperties {
  return { padding: '8px 10px', textAlign: 'center', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', ...(w ? { width: w, minWidth: w } : {}) }
}

function TD({ center, right, color, muted, mono }: { center?: boolean; right?: boolean; color?: string; muted?: boolean; mono?: boolean } = {}): React.CSSProperties {
  return {
    padding: '6px 10px', textAlign: center ? 'center' : right ? 'right' : 'left',
    color: color ?? (muted ? '#6B7280' : 'inherit'), fontFamily: mono ? 'monospace' : 'inherit',
    whiteSpace: 'nowrap', verticalAlign: 'middle',
  }
}
