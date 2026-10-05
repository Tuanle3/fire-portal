// ============================================================
// TAB: KẾ HOẠCH DÒNG TIỀN — port y nguyên từ template
// dashboard_dong_tien.html (bộ lọc, KPI, ma trận theo tháng,
// 5 cách xem, tick Pending, bật/tắt dòng-cột).
//
// Dữ liệu: lấy từ Tab Nhập Data (dongTienItems loaiKhoan='ke-hoach')
// qua keHoachDongTienAdapter — không nhập tay ở tab này.
// CSS template đã scope trong .khdt (ke-hoach-dong-tien.css).
// Chưa có: xuất Excel / Word (template dùng exceljs + docx).
// ============================================================
'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { subscribeDongTien } from '@/lib/dong-tien-store'
import type { KhoanDongTien } from '@/lib/dong-tien-types'
import { khoanListToRows, buildNhomResolver, gopTenNhom, DongTienKHRow as Row } from './keHoachDongTienAdapter'
import type { NganSachItem } from '@/lib/ngan-sach-types'
import './ke-hoach-dong-tien.css'

type Dim = 'src' | 'co' | 'typ' | 'pt' | 'nh'
interface Filt { from: string; to: string; src: string; co: string; dir: string; typ: string; dim: Dim }

const nf = (n: number) => n ? Math.round(n).toLocaleString('vi-VN') : '–'
const sh = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '-' : ''
  return a >= 1e9 ? s + (a / 1e9).toFixed(2).replace('.', ',') + ' tỷ'
    : a >= 1e6 ? s + (a / 1e6).toFixed(1).replace('.', ',') + ' tr'
    : s + a.toLocaleString('vi-VN')
}
const nz = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
const rk = (s: string) => s.startsWith('[HM mới]') ? 0 : s.startsWith('[HM]') ? 1 : s.startsWith('Quỹ') ? 2 : s.startsWith('NOXH') ? 3 : 4

const DIMS: Record<Dim, [string, string, (r: Row) => string]> = {
  src: ['Nguồn', 'nguồn thanh toán', r => r.src],
  co:  ['Công ty', 'công ty', r => r.co],
  typ: ['Phân loại', 'loại giao dịch', r => r.typ],
  pt:  ['Đối tác', 'đối tác / NCC / KH', r => r.pt || '(Chưa có đối tác)'],
  nh:  ['Nhóm', 'nhóm', r => r.nh || '(Chưa phân nhóm)'],
}
const VL: [string, string][] = [['tt', 'Tổng thu'], ['ct', 'Chi thanh toán'], ['pd', 'Pending / trả sau'], ['cb', 'Cân đối trong tháng'], ['tm', 'Số tiền thiếu trong tháng'], ['lk', 'Cân đối lũy kế'], ['tl', 'Số tiền thiếu lũy kế'], ['tot', 'Cột “Tổng kỳ”'], ['h0', 'Ẩn nhóm có cân đối = 0']]
const DL: [string, string][] = [['c_d', 'Ngày'], ['c_n', 'Nội dung giao dịch'], ['c_pt', 'Đối tác / NCC / KH'], ['c_src', 'Nguồn thanh toán'], ['c_co', 'Công ty']]
const DEF: Record<string, number> = { tt: 1, ct: 1, pd: 1, cb: 1, tm: 0, lk: 0, tl: 0, tot: 1, h0: 0, c_d: 1, c_n: 1, c_pt: 1, c_src: 1, c_co: 1 }

const LS_PEND = 'khdt_pend', LS_V = 'khdt_v'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* bỏ qua */ } }

const mo = (a: Row[], m: string) => a.filter(r => r.d.slice(0, 7) === m)

export default function TabKeHoachDongTien({ nhomItems }: { nhomItems?: NganSachItem[] }) {
  const [raw, setRaw]     = useState<KhoanDongTien[]>([])
  const [S, setS]         = useState<Filt>({ from: '', to: '', src: '', co: '', dir: '', typ: '', dim: 'src' })
  const [pend, setPend]   = useState<Set<string>>(new Set())
  const [open, setOpen]   = useState<Set<string>>(new Set())
  const [V, setV]         = useState<Record<string, number>>(DEF)
  const [pop, setPop]     = useState<{ top: number; left: number; maxH: number } | null>(null)
  const mainRef           = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeDongTien(setRaw), [])
  useEffect(() => {
    try { setPend(new Set(JSON.parse(lsGet(LS_PEND) || '[]'))) } catch { /* */ }
    try { setV({ ...DEF, ...JSON.parse(lsGet(LS_V) || '{}') }) } catch { /* */ }
  }, [])
  useEffect(() => {
    if (!pop) return
    const close = () => setPop(null)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc) }
  }, [pop])

  // Tên nhóm lấy từ bảng ngân sách hiện tại (nguồn duy nhất) → đổi tên/số thứ tự nhóm là báo cáo tự khớp, không cần Lưu lại
  const resolver = useMemo(() => buildNhomResolver(nhomItems ?? []), [nhomItems])
  const R = useMemo(() => gopTenNhom(khoanListToRows(raw, resolver), resolver.labels), [raw, resolver])
  const ds = useMemo(() => R.map(r => r.d).sort(), [R])
  const MIN = ds[0] ?? '', MAX = ds[ds.length - 1] ?? ''
  const from = S.from || MIN, to = S.to || MAX

  const uq = (f: (r: Row) => string) => [...new Set(R.map(f))].sort()
  const rs = useMemo(() => R.filter(r =>
    r.d >= from && r.d <= to &&
    (!S.src || r.src === S.src) && (!S.co || r.co === S.co) &&
    (!S.dir || (r.a > 0 ? 'Thu' : 'Chi') === S.dir) &&
    (!S.typ || r.typ === S.typ || nz(r.typ).includes(nz(S.typ).trim()) || nz(r.ct).includes(nz(S.typ).trim())),
  ), [R, S, from, to])

  const st = (a: Row[]) => {
    let t = 0, c = 0, p = 0
    a.forEach(r => { if (r.a > 0) t += r.a; else if (pend.has(r.id)) p += r.a; else c += r.a })
    return { t, c, p, b: t + c }
  }

  const setVk = (k: string, v: number) => setV(o => { const n = { ...o, [k]: v }; lsSet(LS_V, JSON.stringify(n)); return n })
  const resetV = (n: Record<string, number>) => { setV(n); lsSet(LS_V, JSON.stringify(n)) }
  const togglePend = (ids: string[], on: boolean) => setPend(o => {
    const n = new Set(o); ids.forEach(id => on ? n.add(id) : n.delete(id))
    lsSet(LS_PEND, JSON.stringify([...n])); return n
  })
  const tog = (k: string) => setOpen(o => { const n = new Set(o); n.has('g:' + k) ? n.delete('g:' + k) : n.add('g:' + k); return n })

  // ── dữ liệu ma trận ─────────────────────────────────────────
  const ms = useMemo(() => [...new Set(rs.map(r => r.d.slice(0, 7)))].sort(), [rs])
  const M = useMemo(() => {
    const df = DIMS[S.dim][2], m: Record<string, Row[]> = {}
    rs.forEach(r => (m[df(r)] = m[df(r)] || []).push(r))
    return m
  }, [rs, S.dim])
  const dk = useMemo(() => {
    const dr = (k: string) => { const h = M[k].some(r => r.a > 0), c = M[k].some(r => r.a < 0); return h && !c ? 0 : h && c ? 1 : 2 }
    let keys = Object.keys(M).sort(
      S.dim === 'src' ? (a, b) => rk(a) - rk(b) || a.localeCompare(b, 'vi')
      : S.dim === 'nh' ? (a, b) => dr(a) - dr(b) || (parseFloat(a) || 1e9) - (parseFloat(b) || 1e9) || a.localeCompare(b, 'vi')
      : (a, b) => dr(a) - dr(b) || a.localeCompare(b, 'vi'))
    if (V.h0) keys = keys.filter(k => ms.some(m => Math.round(st(mo(M[k], m)).b) !== 0))
    return keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [M, S.dim, V.h0, ms, pend])

  // tự giảm cỡ chữ tên nhóm cho vừa khung
  useLayoutEffect(() => {
    mainRef.current?.querySelectorAll<HTMLElement>('.gt').forEach(e => {
      e.style.fontSize = ''
      let f = parseFloat(getComputedStyle(e).fontSize)
      while (e.scrollWidth > e.clientWidth + 1 && f > 10) { f -= .5; e.style.fontSize = f + 'px' }
    })
  })

  const tot = st(rs)
  const Z = ms.map(m => st(mo(rs, m)))
  let cu = 0; const L = Z.map(z => cu += z.b)
  let mn = 0, mm = ''; { let c2 = 0; ms.forEach((m, i) => { c2 += Z[i].b; if (c2 < mn) { mn = c2; mm = m } }) }
  const nIn = rs.filter(r => r.a > 0).length
  const nPd = rs.filter(r => r.a < 0 && pend.has(r.id)).length
  const nOut = rs.filter(r => r.a < 0 && !pend.has(r.id)).length

  const sub = (r: Row) => (['pt', 'src', 'co'] as const).filter(f => f !== S.dim && V['c_' + f]).map(f => r[f]).filter(Boolean).join(' · ')

  const cell = (v: number, k: string, e?: string) => {
    const zero = !v || (k === 'x' && v >= 0)
    const c = zero ? 'z' : k === 't' ? 'pos' : k === 'c' ? 'neg' : k === 'p' ? 'wr' : v < 0 ? 'neg' : 'pos'
    return <td className={`n ${c}${k === 'x' && v < 0 ? ' lack' : ''}${e ? ' ' + e : ''}`}>{k === 'x' ? (v < 0 ? nf(-v) : '–') : nf(v)}</td>
  }
  const sumRow = (lab: string, vals: number[], k: string, tv: number | null, cls: string) => (
    <tr className={`sm ${cls}`}>
      <th className="f"><span className="lb">{lab}</span></th>
      {vals.map((v, i) => <Fragment key={i}>{cell(v, k)}</Fragment>)}
      {V.tot ? (tv == null ? <td className="tt" /> : cell(tv, k, 'tt')) : null}
    </tr>
  )

  const groupRows = (k: string) => {
    const o = open.has('g:' + k), n = M[k].length
    const head = (
      <tr key={'g' + k} className={`gr${o ? ' open' : ''}`} tabIndex={0} aria-expanded={o}
        onClick={() => tog(k)}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); tog(k) } }}>
        <th className="f"><span className="gn"><span className="chev"><i className={`ar${o ? ' o' : ''}`} /></span>
          <span className="gt" title={k}>{k}</span><span className="cnt" title={`${n} khoản`}>{n}</span></span></th>
        {ms.map(m => <Fragment key={m}>{cell(st(mo(M[k], m)).b, 'b')}</Fragment>)}
        {V.tot ? cell(st(M[k]).b, 'b', 'tt') : null}
      </tr>
    )
    if (!o) return head
    const items = M[k].slice().sort((x, y) => (Number(y.a > 0) - Number(x.a > 0)) || (x.d < y.d ? -1 : x.d > y.d ? 1 : x.id.localeCompare(y.id)))
    let grps: Row[][]
    if (V.c_d) grps = items.map(r => [r])
    else {
      const mp = new Map<string, Row[]>()
      items.forEach(r => { const kk = (r.a > 0 ? 'T' : 'C') + '|' + (V.c_n ? r.ct : '') + '|' + sub(r); if (!mp.has(kk)) mp.set(kk, []); mp.get(kk)!.push(r) })
      grps = [...mp.values()]
    }
    return (
      <Fragment key={'g' + k}>
        {head}
        {grps.map((g, gi) => {
          const r = g[0], negIds = g.filter(x => x.a < 0).map(x => x.id)
          const allP = negIds.length > 0 && negIds.every(id => pend.has(id))
          const sumAll = g.reduce((t, x) => t + x.a, 0)
          const cT = sumAll === 0 ? 'z' : allP ? 'wr' : sumAll > 0 ? 'pos' : 'neg'
          const ttl = V.c_d ? `${r.d.slice(8)}/${r.d.slice(5, 7)} · ${r.ct}` : r.ct
          return (
            <tr key={k + gi} className={`dt${allP ? ' pd' : ''}`}>
              <th className="f"><div className="di" title={ttl}>
                {V.c_d ? <span className="dd">{r.d.slice(8)}/{r.d.slice(5, 7)}</span> : null}
                <div className="db">{V.c_n ? <div className="dn">{r.ct}</div> : null}{sub(r) ? <div className="ds">{sub(r)}</div> : null}</div>
              </div></th>
              {ms.map(m => {
                const cx = g.filter(x => x.d.slice(0, 7) === m)
                if (!cx.length) return <td key={m} className="n" />
                const sum = cx.reduce((t, x) => t + x.a, 0)
                const ng = cx.filter(x => x.a < 0).map(x => x.id)
                const pc = ng.filter(id => pend.has(id)).length, ap = ng.length > 0 && pc === ng.length
                const cc = sum === 0 ? 'z' : ap ? 'wr' : sum > 0 ? 'pos' : 'neg'
                return (
                  <td key={m} className={`n ${cc}${ap ? ' pdc' : ''}`}>
                    {ng.length ? (
                      <label className="pc" title={ng.length > 1 ? `Tích để chuyển ${ng.length} khoản sang Pending / trả sau` : 'Tích để chuyển sang Pending / trả sau'}>
                        <input type="checkbox" className="pk" checked={ap} aria-label="Pending / trả sau"
                          ref={el => { if (el) el.indeterminate = pc > 0 && !ap }}
                          onChange={e => togglePend(ng, e.target.checked)} />
                        <span>{nf(sum)}</span>
                      </label>
                    ) : nf(sum)}
                  </td>
                )
              })}
              {V.tot ? <td className={`n ${cT} tt`}>{nf(sumAll)}</td> : null}
            </tr>
          )
        })}
      </Fragment>
    )
  }

  const cols = ms.length + (V.tot ? 1 : 0)
  const anyOpen = dk.some(k => open.has('g:' + k))
  const setF = (p: Partial<Filt>) => setS(o => ({ ...o, ...p }))
  const dlOn = (k: string) => !!V[k]

  return (
    <div className="khdt">
      {/* ── Tiêu đề + bộ lọc ── */}
      <section className="panel" aria-label="Bộ lọc">
        <div className="hd">
          <div className="brand">
            <span className="mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 14l4-5 3 3 7-8" stroke="#8DA2FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 17h14" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" /></svg></span>
            <div><h1>Kế hoạch dòng tiền</h1><p className="sub">Theo dõi thu – chi và số tiền thiếu theo tháng</p></div>
          </div>
          <span className="chip">{rs.length}/{R.length} giao dịch</span>
        </div>
        <div className="flt">
          <label className="fld">Từ ngày<input type="date" value={from} onChange={e => setF({ from: e.target.value })} /></label>
          <label className="fld">Đến ngày<input type="date" value={to} onChange={e => setF({ to: e.target.value })} /></label>
          <label className="fld">Nguồn thanh toán
            <select value={S.src} onChange={e => setF({ src: e.target.value })}><option value="">Tất cả nguồn</option>{uq(r => r.src).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="fld">Công ty
            <select value={S.co} onChange={e => setF({ co: e.target.value })}><option value="">Tất cả công ty</option>{uq(r => r.co).map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="fld">Chiều tiền
            <select value={S.dir} onChange={e => setF({ dir: e.target.value })}><option value="">Thu + Chi</option><option>Thu</option><option>Chi</option></select></label>
          <label className="fld wide">Loại giao dịch
            <input type="search" list="khdt-tl" placeholder="Gõ để tìm: lương, trả lãi, thuế…" autoComplete="off" value={S.typ} onChange={e => setF({ typ: e.target.value })} />
            <datalist id="khdt-tl">{uq(r => r.typ).map(x => <option key={x} value={x} />)}</datalist></label>
          <button className="btn" type="button" onClick={() => setS({ from: '', to: '', src: '', co: '', dir: '', typ: '', dim: S.dim })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>Đặt lại</button>
        </div>
      </section>

      {/* ── KPI ── */}
      {rs.length > 0 && (
        <section className="kpi" aria-label="Tổng quan kỳ đang xem">
          <div className="kp k-in"><span className="kl">Tổng thu</span><b className="kv" title={`${nf(tot.t)} đ`}>{sh(tot.t)}</b><span className="ks">{nIn} khoản thu</span></div>
          <div className="kp k-out"><span className="kl">Chi thanh toán</span><b className="kv" title={`${nf(tot.c)} đ`}>{sh(tot.c)}</b><span className="ks">{nOut} khoản chi</span></div>
          <div className="kp k-pd"><span className="kl">Pending / trả sau</span><b className="kv" title={`${nf(tot.p)} đ`}>{sh(tot.p)}</b><span className="ks">{nPd} khoản hoãn</span></div>
          <div className={`kp ${tot.b < 0 ? 'k-neg' : 'k-pos'}`}><span className="kl">Cân đối cuối kỳ</span><b className="kv" title={`${nf(tot.b)} đ`}>{sh(tot.b)}</b>
            <span className="ks">{mn < 0 ? `Lũy kế thấp nhất ${sh(mn)} · T${mm.slice(5)}/${mm.slice(0, 4)}` : 'Không có tháng nào thiếu tiền'}</span></div>
        </section>
      )}

      {/* ── Bảng ma trận ── */}
      <section className="card2" aria-label="Bảng dòng tiền">
        <div className="sh">
          <div className="shl"><b>Dòng tiền theo tháng</b></div>
          <div className="vwl"><span className="vwt">Xem theo</span>
            <div className="seg" role="group" aria-label="Xem theo">
              {(Object.keys(DIMS) as Dim[]).map(d => (
                <button key={d} className={S.dim === d ? 'on' : ''} aria-pressed={S.dim === d}
                  onClick={() => { setOpen(new Set()); setF({ dim: d }) }}>{DIMS[d][0]}</button>
              ))}
            </div>
          </div>
          <div className="vwr">
            <div className="lgd">
              <span><i className="k-p" />Nhóm</span><span title="Khoản chi tiết trong nhóm"><i className="k-c" />Chi tiết</span>
              <span title="Tích ô vuông cạnh số tiền để chuyển khoản chi sang Pending / trả sau"><i className="k-w" />Pending</span>
            </div>
            <button className="btn" type="button"
              onClick={() => setOpen(o => { const n = new Set(o); dk.forEach(k => anyOpen ? n.delete('g:' + k) : n.add('g:' + k)); return n })}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
              <span>{anyOpen ? 'Thu gọn' : 'Mở tất cả'}</span></button>
            <button className="btn" type="button" onClick={e => {
              e.stopPropagation()
              if (pop) { setPop(null); return }
              const b = e.currentTarget.getBoundingClientRect()
              setPop({ top: b.bottom + 6, left: Math.max(8, Math.min(b.right - 270, window.innerWidth - 278)), maxH: Math.max(220, window.innerHeight - b.bottom - 20) })
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>
              Hiển thị <span className="bdg">{VL.concat(DL).filter(l => V[l[0]]).length}</span></button>
          </div>
        </div>

        <div ref={mainRef}>
          {!ms.length ? (
            <div className="em">{R.length ? 'Không có giao dịch với bộ lọc này' : 'Chưa có khoản kế hoạch nào — nhập ở Tab Nhập Data (chọn loại “Kế hoạch”).'}</div>
          ) : (
            <div className="sc">
              <table className="mx" style={{ ['--cols' as string]: cols }}>
                <thead><tr>
                  <th className="f">Chỉ tiêu</th>
                  {ms.map(m => <th key={m} className="n">T{m.slice(5)}/{m.slice(0, 4)}</th>)}
                  {V.tot ? <th className="n tt">Tổng kỳ</th> : null}
                </tr></thead>
                <tbody>
                  {V.tt ? sumRow('Tổng thu', Z.map(z => z.t), 't', tot.t, 's-t') : null}
                  {V.ct ? sumRow('Chi thanh toán', Z.map(z => z.c), 'c', tot.c, 's-c') : null}
                  {V.pd ? sumRow('Pending / trả sau', Z.map(z => z.p), 'p', tot.p, 's-p') : null}
                  {V.cb ? sumRow('Cân đối trong tháng', Z.map(z => z.b), 'b', tot.b, 'hl s-b') : null}
                  {V.tm ? sumRow('Số tiền thiếu trong tháng', Z.map(z => z.b), 'x', tot.b, 'sub s-x') : null}
                  {V.lk ? sumRow('Cân đối lũy kế', L, 'b', null, 'hl s-l') : null}
                  {V.tl ? sumRow('Số tiền thiếu lũy kế', L, 'x', null, 'sub s-x') : null}
                  <tr className="divr"><th className="f" colSpan={cols + 1}><span className="stk">
                    <b>Cân đối theo {DIMS[S.dim][1]}</b>
                    <em>{dk.length} nhóm · bấm vào nhóm để xem từng khoản, tick “Pending / trả sau” để hoãn chi</em></span></th></tr>
                  {dk.map(groupRows)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Popover Hiển thị ── */}
      {pop && (
        <div className="pop" style={{ top: pop.top, left: pop.left, maxHeight: pop.maxH }} onClick={e => e.stopPropagation()}>
          <b>Hiển thị dòng / cột</b>
          {VL.map(([k, l]) => <label key={k}><input type="checkbox" checked={dlOn(k)} onChange={e => setVk(k, e.target.checked ? 1 : 0)} /> {l}</label>)}
          <b className="b2">Thông tin ở dòng chi tiết</b>
          <small className="ph">Ẩn “Ngày” để gộp các khoản giống nhau thành 1 dòng.</small>
          {DL.map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={dlOn(k)} onChange={e => {
              if (!e.target.checked && !DL.some(([x]) => x !== k && V[x])) return   // luôn giữ ≥1 thông tin chi tiết
              setVk(k, e.target.checked ? 1 : 0)
            }} /> {l}</label>
          ))}
          <div className="plk">
            <button type="button" onClick={() => { const n = { ...V }; DL.forEach(([k]) => n[k] = 1); resetV(n) }}>Chọn tất cả</button>
            <button type="button" onClick={() => { const n = { ...V }; DL.forEach(([k]) => n[k] = k === 'c_n' ? 1 : 0); resetV(n) }}>Chỉ nội dung</button>
          </div>
          <button className="btn" type="button" onClick={() => resetV({ ...DEF })}>Mặc định</button>
        </div>
      )}
    </div>
  )
}
