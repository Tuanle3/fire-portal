// ============================================================
// TAB: KẾ HOẠCH DÒNG TIỀN — port y nguyên từ template
// dashboard_dong_tien.html (bộ lọc, KPI, ma trận theo tháng,
// 5 cách xem, tick Pending, bật/tắt dòng-cột).
//
// Dữ liệu: lấy từ dongTienItems loaiKhoan='ke-hoach' qua keHoachDongTienAdapter.
// Thêm khoản mới ngay tại tab này (nút "Thêm khoản") bằng cùng DongTienForm với Tab
// Nhập Data; sửa từng khoản bằng nút ✎ ở dòng chi tiết. Lưu xong bảng tự cập nhật.
// CSS template đã scope trong .khdt (ke-hoach-dong-tien.css).
// Xuất Excel: nút "Xuất Excel" → xuatExcelKeHoach.ts (cần npm i exceljs). Chưa có: xuất Word.
// ============================================================
'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { subscribeDongTien } from '@/lib/dong-tien-store'
import type { KhoanDongTien } from '@/lib/dong-tien-types'
import { khoanListToRows, buildNhomResolver, gopTenNhom, DongTienKHRow as Row } from './keHoachDongTienAdapter'
import type { NganSachItem } from '@/lib/ngan-sach-types'
import DongTienForm, { type NhomBang } from './DongTienForm'
import { phanLoaiNguon, TIERS, TIER_DEFAULT_OPEN, type TierId } from './nguonPhanLoai'
import { xuatExcelKeHoach } from './xuatExcelKeHoach'
import './ke-hoach-dong-tien.css'

type Dim = 'src' | 'co' | 'typ' | 'pt' | 'nh'
interface Filt { from: string; to: string; src: string; co: string; dir: string; typ: string; dim: Dim }

const nf = (n: number) => n ? Math.round(n).toLocaleString('vi-VN') : '–'
const nz = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
const rk = (s: string) => s.startsWith('[HM mới]') ? 0 : s.startsWith('[HM]') ? 1 : s.startsWith('Quỹ') ? 2 : s.startsWith('NOXH') ? 3 : 4

const DIMS: Record<Dim, [string, string, (r: Row) => string]> = {
  src: ['Nguồn', 'nguồn thanh toán', r => r.src],
  co:  ['Công ty', 'công ty', r => r.co],
  typ: ['Phân loại', 'loại giao dịch', r => r.typ],
  pt:  ['Đối tác', 'đối tác / NCC / KH', r => r.pt || '(Chưa có đối tác)'],
  nh:  ['Nhóm', 'nhóm', r => r.nh || '(Chưa phân nhóm)'],
}
const VL: [string, string][] = [['tt', 'Tổng thu'], ['ct', 'Chi thanh toán'], ['pd', 'Pending / trả sau'], ['cb', 'Cân đối trong tháng'], ['tm', 'Số tiền thiếu trong tháng'], ['lk', 'Cân đối lũy kế'], ['tl', 'Số tiền thiếu lũy kế'], ['tot', 'Cột “Tổng kỳ”'], ['h0', 'Ẩn nhóm có cân đối = 0'], ['tier', 'Gộp theo loại nguồn (khi xem theo Nguồn)'], ['pin', 'Ghim các dòng tổng khi cuộn bảng']]
const DL: [string, string][] = [['c_d', 'Ngày'], ['c_n', 'Nội dung giao dịch'], ['c_pt', 'Đối tác / NCC / KH'], ['c_src', 'Nguồn thanh toán'], ['c_co', 'Công ty'], ['c_gc', 'Ghi chú']]
const DEF: Record<string, number> = { tt: 1, ct: 1, pd: 1, cb: 1, tm: 0, lk: 0, tl: 0, tot: 1, h0: 0, tier: 1, pin: 1, c_d: 1, c_n: 1, c_pt: 1, c_src: 1, c_co: 1, c_gc: 1 }

const LS_PEND = 'khdt_pend', LS_V = 'khdt_v', LS_TIER = 'khdt_tier'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* bỏ qua */ } }

const mo = (a: Row[], m: string) => a.filter(r => r.d.slice(0, 7) === m)
// Danh sách NHÓM thật của bảng ngân sách cho DongTienForm (cùng quy tắc xác định nhóm chứa dòng con như TabKeHoach)
function buildBangNhom(items: NganSachItem[]): NhomBang[] {
  const out: NhomBang[] = [], seen = new Set<string>()
  const groups = items.filter(g => g.is_group && (g.nhom === 'B' || g.nhom === 'C'))
  const groupById = new Map(groups.map(g => [g.id, g]))
  const byStt = new Map<string, NganSachItem>()
  groups.forEach(g => { const s = String(g.stt ?? '').trim(); if (s) byStt.set(`${g.nhom}|${s}`, g) })
  const con = new Map<string, string[]>()
  let cur: NganSachItem | null = null
  for (const it of items) {
    if (it.is_section) { cur = null; continue }
    if (it.is_group)   { cur = groupById.get(it.id) ?? null; continue }
    const ma = (it.kmcp ?? '').trim()
    if (!ma) continue
    const s = String(it.stt ?? '').trim(), dot = s.lastIndexOf('.')
    let g: NganSachItem | undefined = dot > 0 ? byStt.get(`${it.nhom}|${s.slice(0, dot)}`) : undefined
    if (!g && it.parent_id) g = groupById.get(it.parent_id)
    if (!g && cur) g = cur
    if (g) { const a = con.get(g.id) ?? []; a.push(ma); con.set(g.id, a) }
  }
  for (const g of groups) {
    const ten = (g.dien_giai ?? '').trim()
    if (!ten) continue
    const loai = g.nhom === 'B' ? 'thu' as const : 'chi' as const
    const value = (g.kmcp ?? '').trim() || '@' + ten
    if (seen.has(`${loai}|${value}`)) continue
    seen.add(`${loai}|${value}`)
    const stt = String(g.stt ?? '').trim()
    out.push({ value, loai, ten, stt, con: con.get(g.id) ?? [], label: `${stt ? stt + ' · ' : ''}${ten}`, nhomBC: stt ? `${stt}. ${ten}` : ten })
  }
  return out
}


export default function TabKeHoachDongTien({ nhomItems }: { nhomItems?: NganSachItem[] }) {
  const [raw, setRaw]     = useState<KhoanDongTien[]>([])
  const [S, setS]         = useState<Filt>({ from: '', to: '', src: '', co: '', dir: '', typ: '', dim: 'src' })
  const [pend, setPend]   = useState<Set<string>>(new Set())
  const [open, setOpen]   = useState<Set<string>>(new Set())
  const [V, setV]         = useState<Record<string, number>>(DEF)
  const [tierOpen, setTierOpen] = useState<Record<TierId, boolean>>(TIER_DEFAULT_OPEN)   // mở/thu gọn 3 nhóm cha
  const [q, setQ]         = useState('')   // tìm nhanh theo tên nhóm/nguồn
  const [pop, setPop]     = useState<{ top: number; left: number; maxH: number } | null>(null)
  const mainRef           = useRef<HTMLDivElement>(null)
  const rootRef           = useRef<HTMLDivElement>(null)
  const [rootH, setRootH] = useState<number | null>(null)   // chiều cao khung chính = vừa khít phần màn hình còn lại
  const [edit, setEdit]     = useState<KhoanDongTien | null>(null)   // khoản đang sửa trực tiếp từ bảng
  const [xuat, setXuat] = useState(false)                       // đang tạo file Excel
  const [adding, setAdding] = useState(false)                      // đang mở form THÊM khoản mới
  const [pick, setPick]     = useState<{ title: string; list: KhoanDongTien[] } | null>(null)   // ô tháng có nhiều khoản → chọn khoản cần sửa

  useEffect(() => subscribeDongTien(setRaw), [])
  useEffect(() => {
    try { setPend(new Set(JSON.parse(lsGet(LS_PEND) || '[]'))) } catch { /* */ }
    try { setV({ ...DEF, ...JSON.parse(lsGet(LS_V) || '{}') }) } catch { /* */ }
    try { setTierOpen({ ...TIER_DEFAULT_OPEN, ...JSON.parse(lsGet(LS_TIER) || '{}') }) } catch { /* */ }
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
  const rawById  = useMemo(() => new Map(raw.map(k => [k.id, k])), [raw])
  const bangNhom = useMemo(() => buildBangNhom(nhomItems ?? []), [nhomItems])
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

  // Khung chính cao đúng bằng phần màn hình còn lại → thanh cuộn ngang luôn nằm sát đáy màn hình,
  // không phải kéo trang xuống cuối mới thấy. Cuộn dọc/ngang đều nằm TRONG khung bảng.
  useLayoutEffect(() => {
    const fit = () => {
      const el = rootRef.current
      if (!el) return
      if (window.innerWidth < 900 || window.innerHeight < 680) { setRootH(null); return }
      let top = el.getBoundingClientRect().top + window.scrollY
      for (let p = el.parentElement; p; p = p.parentElement) top += p.scrollTop   // bù phần trang đã cuộn
      setRootH(Math.max(360, Math.floor(window.innerHeight - top - 8)))
    }
    fit()
    const t = setTimeout(fit, 300)
    window.addEventListener('resize', fit)
    return () => { clearTimeout(t); window.removeEventListener('resize', fit) }
  }, [])

  const setVk = (k: string, v: number) => setV(o => { const n = { ...o, [k]: v }; lsSet(LS_V, JSON.stringify(n)); return n })
  const resetV = (n: Record<string, number>) => { setV(n); lsSet(LS_V, JSON.stringify(n)) }
  const togglePend = (ids: string[], on: boolean) => setPend(o => {
    const n = new Set(o); ids.forEach(id => on ? n.add(id) : n.delete(id))
    lsSet(LS_PEND, JSON.stringify([...n])); return n
  })
  const tog = (k: string) => setOpen(o => { const n = new Set(o); n.has('g:' + k) ? n.delete('g:' + k) : n.add('g:' + k); return n })
  const saveTier = (n: Record<TierId, boolean>) => { lsSet(LS_TIER, JSON.stringify(n)); return n }
  const togTier = (id: TierId) => setTierOpen(o => saveTier({ ...o, [id]: !o[id] }))

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
    const kw = nz(q).trim()
    if (kw) keys = keys.filter(k => nz(k).includes(kw))
    return keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [M, S.dim, V.h0, ms, pend, q])

  // ── 3 nhóm cha (chỉ khi xem theo Nguồn) ──
  const tierMode = S.dim === 'src' && !!V.tier
  const tiers = useMemo(() => tierMode
    ? TIERS.map(t => ({ ...t, keys: dk.filter(k => phanLoaiNguon(k) === t.id) })).filter(t => t.keys.length)
    : [], [tierMode, dk])
  const tierIsOpen = (id: TierId) => !!q.trim() || tierOpen[id]   // đang tìm → luôn mở để thấy kết quả

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

  // Ghi chú của khoản (nhập ở form Thêm/Sửa khoản) — lấy từ bản gốc theo mã, không cần đổi adapter
  const dmy = (d?: string) => (d ? d.split('-').reverse().join('/') : '')
  const gc = (r: Row) => (rawById.get(r.id)?.ghiChu ?? '').trim()
  const sub = (r: Row) => (['pt', 'src', 'co'] as const).filter(f => f !== S.dim && V['c_' + f]).map(f => r[f]).filter(Boolean).join(' · ')

  const cell = (v: number, k: string, e?: string) => {
    const zero = !v || (k === 'x' && v >= 0)
    const c = zero ? 'z' : k === 't' ? 'pos' : k === 'c' ? 'neg' : k === 'p' ? 'wr' : v < 0 ? 'neg' : 'pos'
    return <td className={`n ${c}${k === 'x' && v < 0 ? ' lack' : ''}${e ? ' ' + e : ''}`}>{k === 'x' ? (v < 0 ? nf(-v) : '–') : nf(v)}</td>
  }
  // Các dòng tổng được GHIM dưới dòng tiêu đề tháng: cuộn xuống vẫn thấy số tổng.
  // Mỗi dòng nhận chỉ số --pi (0,1,2…) theo thứ tự đang hiển thị → CSS tự tính vị trí top.
  const nPin = V.pin ? ['tt', 'ct', 'pd', 'cb', 'tm', 'lk', 'tl'].filter(x => V[x]).length : 0
  let pinIdx = 0
  const sumRow = (lab: string, vals: number[], k: string, tv: number | null, cls: string) => {
    const pi = V.pin ? pinIdx++ : -1
    return (
      <tr className={`sm ${cls}${pi >= 0 ? ' pin' : ''}${pi >= 0 && pi === nPin - 1 ? ' pinlast' : ''}`}
        style={pi >= 0 ? { ['--pi' as string]: pi } : undefined}>
        <th className="f"><span className="lb">{lab}</span></th>
        {vals.map((v, i) => <Fragment key={i}>{cell(v, k)}</Fragment>)}
        {V.tot ? (tv == null ? <td className="tt" /> : cell(tv, k, 'tt')) : null}
      </tr>
    )
  }

  const groupRows = (k: string, tid?: TierId) => {
    const tc = tid ? ` in t-${tid}` : ''   // lớp tông màu theo loại nguồn của dòng cha
    const o = open.has('g:' + k), n = M[k].length
    const head = (
      <tr key={'g' + k} className={`gr${o ? ' open' : ''}${tc}`} tabIndex={0} aria-expanded={o}
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
      items.forEach(r => { const kk = (r.a > 0 ? 'T' : 'C') + '|' + (V.c_n ? r.ct : '') + '|' + sub(r) + '|' + (V.c_gc ? gc(r) : ''); if (!mp.has(kk)) mp.set(kk, []); mp.get(kk)!.push(r) })
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
            <tr key={k + gi} className={`dt${allP ? ' pd' : ''}${tc}`}>
              <th className="f"><div className="di" title={ttl}>
                {V.c_d ? <span className="dd">{r.d.slice(8)}/{r.d.slice(5, 7)}</span> : null}
                <div className="db">{V.c_n ? <div className="dn">{r.ct}</div> : null}{sub(r) ? <div className="ds">{sub(r)}</div> : null}{V.c_gc && gc(r) ? <div className="ds gc" title={gc(r)}><span className="gl">Ghi chú:</span> {gc(r)}</div> : null}</div>
                {g.length === 1 && rawById.get(r.id) ? (
                  rawById.get(r.id)!.nguonTuDong
                    ? <span className="ed lk" title="Khoản tự động từ List ngân hàng — không sửa tay">🔒</span>
                    : <button type="button" className="ed" title="Sửa khoản này (đổi nhóm, số tiền, ngày…)" onClick={e => { e.stopPropagation(); setEdit(rawById.get(r.id)!) }}>✎</button>
                ) : null}
              </div></th>
              {ms.map(m => {
                const cx = g.filter(x => x.d.slice(0, 7) === m)
                if (!cx.length) return <td key={m} className="n" />
                const sum = cx.reduce((t, x) => t + x.a, 0)
                const ng = cx.filter(x => x.a < 0).map(x => x.id)
                const pc = ng.filter(id => pend.has(id)).length, ap = ng.length > 0 && pc === ng.length
                const cc = sum === 0 ? 'z' : ap ? 'wr' : sum > 0 ? 'pos' : 'neg'
                // Khoản sửa tay được trong ô này (bỏ khoản tự động từ List ngân hàng). Bấm vào SỐ → sửa thẳng khoản của tháng đó.
                const eds = cx.map(x => rawById.get(x.id)).filter((k): k is KhoanDongTien => !!k && !k.nguonTuDong)
                const num = eds.length ? (
                  <button type="button" className="nv"
                    title={eds.length === 1 ? `Bấm để sửa khoản ngày ${dmy(eds[0].ngayDuKien)}` : `Tháng này có ${eds.length} khoản — bấm để chọn khoản cần sửa`}
                    onClick={e => { e.stopPropagation(); if (eds.length === 1) setEdit(eds[0]); else setPick({ title: r.ct, list: eds }) }}>{nf(sum)}</button>
                ) : <span title="Khoản tự động từ List ngân hàng — không sửa tay">{nf(sum)}</span>
                return (
                  <td key={m} className={`n ${cc}${ap ? ' pdc' : ''}`}>
                    {ng.length ? (
                      <div className="pc">
                        <label className="pkb" title={ng.length > 1 ? `Tích để chuyển ${ng.length} khoản sang Pending / trả sau` : 'Tích để chuyển sang Pending / trả sau'}>
                          <input type="checkbox" className="pk" checked={ap} aria-label="Pending / trả sau"
                            ref={el => { if (el) el.indeterminate = pc > 0 && !ap }}
                            onChange={e => togglePend(ng, e.target.checked)} />
                        </label>
                        {num}
                      </div>
                    ) : num}
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

  const tierRows = (t: (typeof tiers)[number]) => {
    const o = tierIsOpen(t.id), all = t.keys.flatMap(k => M[k])
    const n = t.keys.length
    return (
      <Fragment key={'t' + t.id}>
        <tr className={`tg t-${t.id}${o ? ' open' : ''}`} tabIndex={0} aria-expanded={o} title={t.desc}
          onClick={() => togTier(t.id)}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); togTier(t.id) } }}>
          <th className="f"><span className="gn"><span className="chev"><i className={`ar${o ? ' o' : ''}`} /></span>
            <span className="gt">{t.label}</span><span className="cnt" title={`${n} nguồn · ${all.length} khoản`}>{n} nguồn</span></span></th>
          {ms.map(m => <Fragment key={m}>{cell(st(mo(all, m)).b, 'b')}</Fragment>)}
          {V.tot ? cell(st(all).b, 'b', 'tt') : null}
        </tr>
        {o ? t.keys.map(k => groupRows(k, t.id)) : null}
      </Fragment>
    )
  }

  const xuatExcel = async () => {
    if (!ms.length || xuat) return
    setXuat(true)
    try {
      const dm = (d: string) => d.split('-').reverse().join('/')
      const loc = [`Kỳ: ${dm(from)} – ${dm(to)}`, `Nguồn: ${S.src || 'Tất cả'}`, `Công ty: ${S.co || 'Tất cả'}`, `Chiều tiền: ${S.dir || 'Thu + Chi'}`]
      if (S.typ.trim()) loc.push(`Loại giao dịch: “${S.typ.trim()}”`)
      // Mỗi cách xem = 1 sheet; cách xem đang chọn đứng đầu. Ô tìm nhanh chỉ để lọc trên màn hình, không áp dụng khi xuất.
      const layDim = (d: Dim) => {
        const df = DIMS[d][2], Md: Record<string, Row[]> = {}
        rs.forEach(r => (Md[df(r)] = Md[df(r)] || []).push(r))
        const dr = (k: string) => { const h = Md[k].some(r => r.a > 0), c = Md[k].some(r => r.a < 0); return h && !c ? 0 : h && c ? 1 : 2 }
        let ks = Object.keys(Md).sort(
          d === 'src' ? (a, b) => rk(a) - rk(b) || a.localeCompare(b, 'vi')
          : d === 'nh' ? (a, b) => dr(a) - dr(b) || (parseFloat(a) || 1e9) - (parseFloat(b) || 1e9) || a.localeCompare(b, 'vi')
          : (a, b) => dr(a) - dr(b) || a.localeCompare(b, 'vi'))
        if (V.h0) ks = ks.filter(k => ms.some(m => Math.round(st(mo(Md[k], m)).b) !== 0))
        const tm = d === 'src' && !!V.tier
        return {
          dim: d, dimLabel: DIMS[d][0], keys: ks, M: Md,
          tiers: tm ? TIERS.map(t => ({ id: t.id, label: t.label, keys: ks.filter(k => phanLoaiNguon(k) === t.id) })).filter(t => t.keys.length) : undefined,
        }
      }
      const order = [S.dim, ...(Object.keys(DIMS) as Dim[]).filter(d => d !== S.dim)]
      await xuatExcelKeHoach({ from, to, ms, rs, views: order.map(layDim), pend, V, gc, locText: loc })
    } catch (e) { alert('Xuất Excel lỗi: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setXuat(false) }
  }

  const cols = ms.length + (V.tot ? 1 : 0)
  const anyOpen = dk.some(k => open.has('g:' + k)) || (tierMode && tiers.some(t => tierOpen[t.id]))
  const setF = (p: Partial<Filt>) => setS(o => ({ ...o, ...p }))
  const dlOn = (k: string) => !!V[k]

  return (
    <div className={`khdt${rootH ? ' fit' : ''}`} ref={rootRef} style={rootH ? { height: rootH } : undefined}>
      {/* ── Bộ lọc ── */}
      <section className="panel" aria-label="Bộ lọc">
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
          <label className="srch"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Tìm ${DIMS[S.dim][0].toLowerCase()}…`} aria-label="Tìm nhanh" autoComplete="off" /></label>
          <div className="vwr">
            <div className="lgd">
              <span><i className="k-p" />Nhóm</span><span title="Khoản chi tiết trong nhóm"><i className="k-c" />Chi tiết</span>
              <span title="Tích ô vuông cạnh số tiền để chuyển khoản chi sang Pending / trả sau"><i className="k-w" />Pending</span>
            </div>
            <button className="btn" type="button"
              onClick={() => {
                setOpen(o => { const n = new Set(o); dk.forEach(k => anyOpen ? n.delete('g:' + k) : n.add('g:' + k)); return n })
                if (tierMode) setTierOpen(saveTier(Object.fromEntries(TIERS.map(t => [t.id, !anyOpen])) as Record<TierId, boolean>))
              }}>
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
            <button className="btn" type="button" disabled={!ms.length || xuat} onClick={xuatExcel}
              title="Xuất Excel đúng theo bộ lọc & cách xem đang chọn — có group đóng/mở">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
              {xuat ? 'Đang xuất…' : 'Xuất Excel'}</button>
            <button className="btn pri" type="button" title="Thêm khoản thu / chi kế hoạch mới — không cần quay lại Tab Nhập Data" onClick={() => setAdding(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Thêm khoản</button>
          </div>
        </div>

        <div ref={mainRef} className="mw">
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
                    <em>{dk.length} {tierMode ? 'nguồn' : 'nhóm'} · bấm vào nhóm để xem từng khoản, tick “Pending / trả sau” để hoãn chi</em></span></th></tr>
                  {tierMode ? tiers.map(tierRows) : dk.map(k => groupRows(k))}
                  {!dk.length ? <tr><th className="f" colSpan={cols + 1} style={{ position: 'static', fontWeight: 400, color: 'var(--ink-2)' }}>Không có kết quả khớp “{q}”</th></tr> : null}
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
          <small className="ph">Ẩn “Ngày” để gộp các khoản giống nhau thành 1 dòng (bật “Ghi chú” thì chỉ gộp khoản cùng ghi chú).</small>
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
      {/* ── Ô tháng có nhiều khoản: chọn đúng khoản cần sửa ── */}
      {pick && (
        <div className="pkov" onClick={() => setPick(null)}>
          <div className="pkc" role="dialog" aria-label="Chọn khoản cần sửa" onClick={e => e.stopPropagation()}>
            <div className="pkh"><b>Chọn khoản cần sửa</b><span title={pick.title}>{pick.title}</span></div>
            <div className="pkl">
              {pick.list.slice().sort((a, b) => (a.ngayDuKien ?? '').localeCompare(b.ngayDuKien ?? '')).map(k => (
                <button key={k.id} type="button" onClick={() => { setPick(null); setEdit(k) }}>
                  <span className="dd">{dmy(k.ngayDuKien)}</span>
                  <span className="pm">{k.moTa}{k.ghiChu ? <em> · {k.ghiChu}</em> : null}</span>
                  <span className={`pv ${k.loai === 'thu' ? 'pos' : 'neg'}`}>{k.loai === 'thu' ? '' : '-'}{Math.round(k.soTien).toLocaleString('vi-VN')}</span>
                </button>
              ))}
            </div>
            <div className="pkf"><button className="btn" type="button" onClick={() => setPick(null)}>Đóng</button></div>
          </div>
        </div>
      )}
      {/* ── Thêm mới (edit = null) hoặc sửa 1 khoản (edit = khoản đó) — lưu xong bảng tự cập nhật ── */}
      {(edit || adding) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 560 }}>
            <DongTienForm
              editing={edit}
              bangNhom={bangNhom}
              loaiKhoanMacDinh="ke-hoach"
              onSaved={() => { setEdit(null); setAdding(false) }}
              onCancel={() => { setEdit(null); setAdding(false) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
