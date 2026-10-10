// ============================================================
// BẢNG DỜI NGÀY / PENDING — xem ngay trên màn hình (không cần xuất Excel)
// Liệt kê các khoản đã gia hạn / trả trước / chuyển Pending trong phạm vi đang lọc ở tab.
// Gom nhóm tuỳ chọn: Khách hàng (đối tác) · Công ty · Nhóm · Nguồn · Không gom.
// Bấm 1 dòng → xem đủ lịch sử các lần dời; nút ⇄ mở hộp thoại để dời tiếp / sửa lịch sử.
// ============================================================
'use client'

import { Fragment, useMemo, useState } from 'react'
import { soNgayLech, type DongTienKHRow as Row } from './keHoachDongTienAdapter'
import type { KhoanDongTien } from '@/lib/dong-tien-types'

type Loai = 'all' | 'gh' | 'tt' | 'pd'
type Gom = 'pt' | 'co' | 'nh' | 'src' | 'none'

const dmy = (d: string) => d.split('-').reverse().join('/')
const nf = (n: number) => Math.round(n).toLocaleString('vi-VN')
const sgn = (n: number) => (n > 0 ? `+${n}` : String(n))
const GOM: [Gom, string][] = [['pt', 'Khách hàng / đối tác'], ['co', 'Công ty'], ['nh', 'Nhóm'], ['src', 'Nguồn'], ['none', 'Không gom']]
const LOAI: [Loai, string][] = [['all', 'Tất cả'], ['gh', 'Gia hạn'], ['tt', 'Trả trước'], ['pd', 'Pending']]

interface Props {
  rows:        Row[]                              // các khoản sau khi lọc ở tab
  pend:        Set<string>
  rawById:     Map<string, KhoanDongTien>
  onMoDoi:     (k: KhoanDongTien) => void         // mở hộp thoại Dời ngày
  onBoPending: (id: string) => void
  onClose:     () => void
}

export default function BangDoiNgay({ rows, pend, rawById, onMoDoi, onBoPending, onClose }: Props) {
  const [loai, setLoai] = useState<Loai>('all')
  const [gom, setGom]   = useState<Gom>('pt')
  const [q, setQ]       = useState('')
  const [dong, setDong] = useState<Set<string>>(new Set())     // nhóm đang thu gọn
  const [xem, setXem]   = useState<string | null>(null)        // dòng đang xem lịch sử

  const kindsOf = (r: Row) => {
    const l = soNgayLech(r.og, r.d), k: Loai[] = []
    if (l > 0) k.push('gh'); else if (l < 0) k.push('tt')
    if (pend.has(r.id)) k.push('pd')
    return k
  }

  const all = useMemo(() => rows.filter(r => soNgayLech(r.og, r.d) !== 0 || (r.ls?.length ?? 0) > 0 || pend.has(r.id)), [rows, pend])

  const sum = useMemo(() => {
    const s = { gh: [0, 0], tt: [0, 0], pd: [0, 0] }
    all.forEach(r => { const v = Math.abs(r.a); kindsOf(r).forEach(k => { if (k !== 'all') { s[k][0]++; s[k][1] += v } }) })
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, pend])

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return all.filter(r =>
      (loai === 'all' || kindsOf(r).includes(loai)) &&
      (!kw || [r.ct, r.pt, r.src, r.nh, r.co].some(x => (x ?? '').toLowerCase().includes(kw))),
    ).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.id.localeCompare(b.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, loai, q, pend])

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    list.forEach(r => { const k = gom === 'none' ? '' : ((r[gom] as string) || '(chưa có)'); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'))
  }, [list, gom])

  const toggle = (k: string) => setDong(o => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n })
  const th: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#1C3557', position: 'sticky', top: 0, zIndex: 1, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid #E5E7EB', verticalAlign: 'top' }
  const chip = (on: boolean): React.CSSProperties => ({ padding: '4px 11px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: '1px solid ' + (on ? '#1C3557' : '#D1D5DB'), background: on ? '#1C3557' : '#fff', color: on ? '#fff' : '#374151', fontWeight: on ? 700 : 500 })

  const card = (lab: string, v: number[], c: string, bg: string) => (
    <div style={{ flex: 1, background: bg, border: '1px solid ' + c + '55', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 11.5, color: '#6B7280' }}>{lab}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: c }}>{v[0]} khoản · {nf(v[1])} ₫</div>
    </div>
  )

  const badge = (r: Row) => {
    const l = soNgayLech(r.og, r.d), p = pend.has(r.id)
    const out: React.ReactNode[] = []
    if (l > 0) out.push(<span key="g" style={{ color: '#B45309', fontWeight: 700 }}>⏩ Gia hạn</span>)
    else if (l < 0) out.push(<span key="t" style={{ color: '#166534', fontWeight: 700 }}>⏪ Trả trước</span>)
    else if ((r.ls?.length ?? 0) > 0) out.push(<span key="v" style={{ color: '#6B7280', fontWeight: 700 }}>↺ Về ngày gốc</span>)
    if (p) out.push(<div key="p" style={{ color: '#92400E', fontWeight: 700 }}>⏸ Pending</div>)
    return out
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1240, background: '#fff', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 56px)' }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1C3557', flex: 1 }}>⇄ Dời ngày thanh toán &amp; Pending
              <span style={{ fontSize: 12, fontWeight: 400, color: '#6B7280' }}> · theo bộ lọc đang chọn ở tab</span></div>
            <button type="button" className="btn-ghost" onClick={onClose}>✕ Đóng</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {card('Gia hạn (dời ra sau)', sum.gh, '#B45309', '#FFFBEB')}
            {card('Trả trước (dời lên trước)', sum.tt, '#166534', '#F0FDF4')}
            {card('Pending / trả sau', sum.pd, '#92400E', '#FEF3C7')}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: '#6B7280' }}>Loại</span>
              {LOAI.map(([k, l]) => <button key={k} type="button" style={chip(loai === k)} onClick={() => setLoai(k)}>{l}</button>)}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: '#6B7280' }}>Gom theo</span>
              {GOM.map(([k, l]) => <button key={k} type="button" style={chip(gom === k)} onClick={() => setGom(k)}>{l}</button>)}
            </div>
            <input type="search" className="nh-input" placeholder="Tìm khách hàng, nội dung, nguồn…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} />
            {gom !== 'none' && groups.length > 1 ? (
              <button type="button" className="btn-ghost" onClick={() => setDong(dong.size ? new Set() : new Set(groups.map(g => g[0])))}>
                {dong.size ? 'Mở tất cả' : 'Thu gọn tất cả'}</button>
            ) : null}
          </div>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          {list.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Chưa có khoản nào gia hạn, trả trước hoặc Pending trong phạm vi đang lọc.<br />
              Bấm nút ⇄ ở từng khoản trên bảng để dời ngày, hoặc tick Pending.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Loại</th><th style={th}>Ngày gốc</th><th style={th}>Hiện tại</th>
                  <th style={{ ...th, textAlign: 'right' }}>Số ngày</th><th style={{ ...th, textAlign: 'right' }}>Số tiền</th>
                  <th style={th}>Nội dung / khách hàng</th><th style={{ ...th, textAlign: 'right' }}>Số lần</th>
                  <th style={th}>Lý do gần nhất</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {groups.map(([k, items]) => {
                  const shut = dong.has(k)
                  const thu = items.filter(r => r.a > 0).reduce((t, r) => t + r.a, 0)
                  const chi = items.filter(r => r.a < 0).reduce((t, r) => t + r.a, 0)
                  return (
                    <Fragment key={k || 'all'}>
                      {gom !== 'none' ? (
                        <tr onClick={() => toggle(k)} style={{ cursor: 'pointer', background: '#E8EEF7' }}>
                          <td colSpan={9} style={{ ...td, fontWeight: 700, color: '#1C3557', borderBottom: '1px solid #CBD5E1' }}>
                            {shut ? '▸' : '▾'} {k} <span style={{ fontWeight: 400, color: '#6B7280' }}>({items.length} khoản)</span>
                            {thu ? <span style={{ marginLeft: 14, color: '#166534' }}>Thu {nf(thu)}</span> : null}
                            {chi ? <span style={{ marginLeft: 14, color: '#B91C1C' }}>Chi {nf(chi)}</span> : null}
                          </td>
                        </tr>
                      ) : null}
                      {shut ? null : items.map(r => {
                        const l = soNgayLech(r.og, r.d), ls = r.ls ?? [], kh = rawById.get(r.id), mo = xem === r.id
                        const lyDo = (ls.length ? ls[ls.length - 1].lyDo : '') || r.pl || ''
                        return (
                          <Fragment key={r.id}>
                            <tr onClick={() => setXem(mo ? null : r.id)} style={{ cursor: 'pointer', background: pend.has(r.id) ? '#FFFBEB' : undefined }}>
                              <td style={{ ...td, whiteSpace: 'nowrap' }}>{badge(r)}</td>
                              <td style={td}>{r.og ? dmy(r.og) : '–'}</td>
                              <td style={{ ...td, fontWeight: 700 }}>{dmy(r.d)}</td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: l > 0 ? '#B45309' : l < 0 ? '#166534' : '#6B7280' }}>{l ? sgn(l) : '0'}</td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.a < 0 ? '#B91C1C' : '#166534' }}>{nf(r.a)}</td>
                              <td style={td}>
                                <div style={{ fontWeight: 600 }}>{r.ct}</div>
                                <div style={{ fontSize: 11.5, color: '#6B7280' }}>{[gom !== 'pt' ? r.pt : '', gom !== 'src' ? r.src : '', gom !== 'co' ? r.co : '', gom !== 'nh' ? r.nh : ''].filter(Boolean).join(' · ')}</div>
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>{ls.length || '–'}</td>
                              <td style={{ ...td, maxWidth: 260, color: '#374151' }}>{lyDo}</td>
                              <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                {kh ? <button type="button" className="btn-ghost" title="Dời ngày / sửa lịch sử" onClick={() => onMoDoi(kh)} style={{ padding: '2px 8px', fontSize: 12 }}>⇄</button> : null}
                                {pend.has(r.id) ? <button type="button" className="btn-ghost" title="Bỏ Pending" onClick={() => onBoPending(r.id)} style={{ padding: '2px 8px', fontSize: 12, marginLeft: 4 }}>Bỏ Pending</button> : null}
                              </td>
                            </tr>
                            {mo ? (
                              <tr>
                                <td colSpan={9} style={{ ...td, background: '#F8FAFC' }}>
                                  {ls.length ? (
                                    <>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1C3557', marginBottom: 3 }}>
                                        Lịch sử {ls.length} lần dời: {[r.og, ...ls.map(x => x.den)].filter(Boolean).map(x => dmy(x as string)).join(' → ')}
                                      </div>
                                      {ls.map((x, i) => (
                                        <div key={i} style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                                          <b>Lần {i + 1}:</b> {dmy(x.tu)} → <b>{dmy(x.den)}</b>{' '}
                                          <span style={{ fontWeight: 600, color: x.soNgay > 0 ? '#B45309' : x.soNgay < 0 ? '#166534' : '#6B7280' }}>({sgn(x.soNgay)} ngày)</span>
                                          {x.lyDo ? <> · {x.lyDo}</> : null} <span style={{ color: '#9CA3AF' }}>· ghi {new Date(x.luc).toLocaleDateString('vi-VN')}</span>
                                        </div>
                                      ))}
                                    </>
                                  ) : <div style={{ fontSize: 12.5, color: '#6B7280' }}>Chưa có lần dời nào được ghi.</div>}
                                  {pend.has(r.id) ? (
                                    <div style={{ fontSize: 12.5, marginTop: 4, color: '#92400E' }}>
                                      ⏸ Pending{kh?.ngayPending ? ` từ ${new Date(kh.ngayPending).toLocaleDateString('vi-VN')}` : ''}{r.pl ? ` · ${r.pl}` : ''}
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
