'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { NganSachThang, NganSachItem } from '@/lib/ngan-sach-types'
import { getNganSach } from '@/lib/ngan-sach-store'
import { findKey, buildTonKy, buildKmcpActual } from '@/lib/ngan-sach-mapping'
import { exportBaoCaoWord } from '@/lib/ngan-sach-baocao-word'

interface Props {
  month: string            // "2026-07" — tháng đang chọn ở topbar
  localData: NganSachThang
  tonDauKy: number
  tonQuyRealtime: number
  kmcpActual: Record<string, number>
}

type Row = Record<string, any>
type View = 'year' | 'quarter' | 'month'
type Mode = 'KH' | 'TH' | 'SO'   // KH=kế hoạch · TH=thực hiện · SO=thực hiện vs kế hoạch
type ColDef = { key: string; label: string; months: number[]; loai: 'TH' | 'KH' }

interface UnitAgg { unit: string; cols: Record<string, number>; total: number }
interface GroupAgg { nhom: string; cols: Record<string, number>; total: number; units: UnitAgg[] }
interface Section { rows: GroupAgg[]; colTotals: Record<string, number>; grandTotal: number }

const MONTH_SHORT = ['Th.1', 'Th.2', 'Th.3', 'Th.4', 'Th.5', 'Th.6', 'Th.7', 'Th.8', 'Th.9', 'Th.10', 'Th.11', 'Th.12']

const fmt = (n: number) => (n === 0 ? '—' : Math.round(n).toLocaleString('vi-VN'))
const fmtSigned = (n: number) => (n === 0 ? '—' : (n < 0 ? '−' : '+') + Math.abs(Math.round(n)).toLocaleString('vi-VN'))
const pad2 = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

// đọc snapshot Firebase Realtime DB → mảng object
function toArr(snap: any): Row[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? v : {})) as Row[]
  return []
}

// phân loại 1 dòng: thu / chi / null (bỏ qua)
function rowType(r: Row): 'thu' | 'chi' | null {
  const ghi = String(r['Ghi_chu'] ?? '')
  if (ghi === 'Dư đầu kỳ' || ghi === 'Dư cuối kỳ') return null
  const ps = Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0)
  if (ghi === 'Thu') return 'thu'
  if (ghi === 'Chi') return 'chi'
  if (ps > 0) return 'thu'
  if (ps < 0) return 'chi'
  return null
}

export function TabDuBao({ month, localData }: Props) {
  const curYear = parseInt(month.split('-')[0])
  const curMon = parseInt(month.split('-')[1])

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('month')
  const [mode, setMode] = useState<Mode>('SO')   // KH | TH | SO (so sánh)
  const [selectedYear, setSelectedYear] = useState(curYear)
  const [quarter, setQuarter] = useState(Math.ceil(curMon / 3))  // 1..4
  const [monthSel, setMonthSel] = useState(curMon)               // 1..12
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fetchedDoc, setFetchedDoc] = useState<NganSachThang | null>(null)
  const [scopeDocs, setScopeDocs] = useState<Map<string, NganSachThang>>(new Map())

  useEffect(() => {
    let alive = true
    get(ref(getDb(), 'data_quy'))
      .then(snap => { if (alive) setRows(toArr(snap)) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const loaiKey = useMemo(() => findKey(rows, 'loai'), [rows])

  // Kế hoạch cho chế độ Tháng: doc ngân sách tháng đang chọn (nhập tay ở tab Kế hoạch).
  // Tháng ở topbar dùng localData (bản đang chỉnh); tháng khác thì tải từ Firestore.
  const monthStr = `${selectedYear}-${pad2(monthSel)}`
  useEffect(() => {
    if (view !== 'month' || monthStr === month) return
    let alive = true
    getNganSach(monthStr).then(d => { if (alive) setFetchedDoc(d) }).catch(() => {})
    return () => { alive = false }
  }, [view, monthStr, month])
  const planDoc = monthStr === month ? localData : (fetchedDoc?.thang === monthStr ? fetchedDoc : null)

  // ── Định nghĩa cột theo chế độ xem + chế độ hiển thị (KH/TH/SO) ─────────────────
  const cols: ColDef[] = useMemo(() => {
    // Kỳ con: Năm → 4 quý, Quý → 3 tháng, Tháng → 1 tháng
    const periods: { key: string; label: string; months: number[] }[] =
      view === 'year'
        ? [1, 2, 3, 4].map(q => ({ key: 'Q' + q, label: 'Quý ' + q, months: [(q - 1) * 3, (q - 1) * 3 + 1, (q - 1) * 3 + 2] }))
        : view === 'quarter'
          ? [(quarter - 1) * 3, (quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2].map(m => ({ key: 'M' + m, label: MONTH_SHORT[m], months: [m] }))
          : [{ key: 'M' + (monthSel - 1), label: MONTH_SHORT[monthSel - 1], months: [monthSel - 1] }]

    // SO (so sánh): gộp cả kỳ thành 2 cột Kế hoạch | Thực hiện
    if (mode === 'SO') {
      const allMonths = [...new Set(periods.flatMap(p => p.months))].sort((a, b) => a - b)
      return [
        { key: 'KH', label: 'Kế hoạch', months: allMonths, loai: 'KH' as const },
        { key: 'TH', label: 'Thực hiện', months: allMonths, loai: 'TH' as const },
      ]
    }
    // KH hoặc TH: mỗi kỳ con 1 cột theo loại tương ứng
    const loai: 'KH' | 'TH' = mode === 'KH' ? 'KH' : 'TH'
    return periods.map(p => ({ key: p.key, label: p.label, months: p.months, loai }))
  }, [view, mode, quarter, monthSel])

  const scopeMonths = useMemo(() => [...new Set(cols.flatMap(c => c.months))].sort((a, b) => a - b), [cols])

  // Kế hoạch theo từng tháng trong kỳ (gộp theo KMCP) — để hiện KH ở chế độ Quý/Năm.
  // Tháng ở topbar dùng localData; tháng khác lấy từ scopeDocs (đã tải cho giải pháp).
  const monthPlanKH = useMemo(() => {
    const m = new Map<number, Record<string, number>>()
    for (const mi of scopeMonths) {
      const ms = `${selectedYear}-${pad2(mi + 1)}`
      const doc = ms === month ? localData : scopeDocs.get(ms)
      const map: Record<string, number> = {}
      for (const it of doc?.items ?? []) {
        if (it.is_section || it.is_group || !it.kmcp) continue
        map[it.kmcp] = (map[it.kmcp] ?? 0) + (Number(it.ke_hoach) || 0)
      }
      m.set(mi, map)
    }
    return m
  }, [scopeMonths, selectedYear, month, localData, scopeDocs])

  // ── Bảng theo cấu trúc khoản mục của tab Kế hoạch & Thực hiện (mọi chế độ) ──────
  // Cấu trúc dòng lấy từ doc ngân sách; TH khớp theo mã ngân sách theo từng kỳ;
  // KH (chỉ chế độ Tháng) lấy trực tiếp số nhập tay.
  const { thu, chi } = useMemo(() => {
    const planItems = (planDoc ?? localData)?.items ?? []
    const monthMaps = new Map<number, Record<string, number>>()
    for (const mi of scopeMonths) monthMaps.set(mi, buildKmcpActual(rows, `${selectedYear}-${pad2(mi + 1)}`))
    const thOver = (kmcp: string, months: number[]) => {
      if (!kmcp) return 0
      let s = 0
      for (const mi of months) s += Number(monthMaps.get(mi)?.[kmcp] ?? 0)
      return s
    }
    const cellFor = (it: NganSachItem, col: ColDef) => {
      if (col.loai === 'KH') {
        if (view === 'month') return Number(it.ke_hoach) || 0
        if (!it.kmcp) return 0
        let s = 0; for (const mi of col.months) s += monthPlanKH.get(mi)?.[it.kmcp] ?? 0
        return s
      }
      return thOver(it.kmcp, col.months)
    }
    // Tổng dòng (dùng cho tỷ trọng): SO → theo Thực hiện; KH/TH → cộng các cột.
    const totalOf = (c: Record<string, number>) =>
      mode === 'SO' ? (c['TH'] ?? 0) : cols.reduce((s, col) => s + (c[col.key] ?? 0), 0)

    const build = (want: 'B' | 'C'): Section => {
      const items = planItems.filter(it => it.nhom === want)
      // Xác định nhóm sở hữu của 1 dòng con — 3 tín hiệu theo thứ tự ưu tiên:
      // (1) STT phân cấp ("11.1" → nhóm STT "11"); (2) parent_id (nếu còn khớp id
      // nhóm thật); (3) VỊ TRÍ trong mảng — dòng ngay sau 1 nhóm (trước nhóm/section
      // kế tiếp) luôn là con của nhóm đó, vì "+Dòng" trên 1 nhóm luôn chèn ngay sau
      // nhóm ấy. Vị trí không bao giờ bị lệch do import Excel hay tạo tháng mới
      // (cloneStructure), nên đây là tín hiệu bền nhất — đảm bảo dòng con không bao
      // giờ "rơi ra ngoài" thành dòng đứng riêng chỉ vì STT/parent_id bị lệch.
      const groups = items.filter(g => g.is_group)
      const byStt = new Map<string, string>()
      for (const g of groups) { const s = String(g.stt).trim(); if (s) byStt.set(s, g.id) }
      const groupIds = new Set(groups.map(g => g.id))
      const ownerMap = new Map<string, string | null>()
      let currentGroup: string | null = null
      for (const it of items) {
        if (it.is_section) { currentGroup = null; continue }
        if (it.is_group) { ownerMap.set(it.id, null); currentGroup = it.id; continue }
        const s = String(it.stt).trim(); const dot = s.lastIndexOf('.')
        let gid: string | null = null
        if (dot > 0) gid = byStt.get(s.slice(0, dot)) ?? null
        if (!gid && it.parent_id && groupIds.has(it.parent_id)) gid = it.parent_id
        if (!gid) gid = currentGroup
        ownerMap.set(it.id, gid)
      }
      const ownerOf = (x: NganSachItem): string | null => ownerMap.get(x.id) ?? null
      const kidsOf = new Map<string, NganSachItem[]>()
      for (const it of items) {
        if (it.is_section || it.is_group) continue
        const gid = ownerOf(it)
        if (gid) { const a = kidsOf.get(gid) ?? []; a.push(it); kidsOf.set(gid, a) }
      }
      // Giữ nguyên thứ tự như tab Kế hoạch (không sắp lại)
      const rowsArr: GroupAgg[] = []
      for (const it of items) {
        if (it.is_section) continue
        if (!it.is_group && ownerOf(it)) continue   // dòng con đã gộp vào nhóm cha, không hiện riêng
        const c: Record<string, number> = {}
        let units: UnitAgg[] = []
        const kids = kidsOf.get(it.id) ?? []
        if (it.is_group && kids.length > 0) {
          units = kids.map(k => {
            const kc: Record<string, number> = {}
            cols.forEach(col => { kc[col.key] = cellFor(k, col); c[col.key] = (c[col.key] ?? 0) + kc[col.key] })
            return { unit: k.dien_giai || '(không tên)', cols: kc, total: totalOf(kc) }
          })
        } else {
          cols.forEach(col => { c[col.key] = cellFor(it, col) })
        }
        rowsArr.push({ nhom: it.dien_giai || '(không tên)', cols: c, total: totalOf(c), units })
      }
      const colTotals: Record<string, number> = {}
      cols.forEach(col => { colTotals[col.key] = rowsArr.reduce((s, r) => s + (r.cols[col.key] ?? 0), 0) })
      const grandTotal = rowsArr.reduce((s, r) => s + r.total, 0)
      return { rows: rowsArr, colTotals, grandTotal }
    }
    return { thu: build('B'), chi: build('C') }
  }, [rows, cols, scopeMonths, selectedYear, planDoc, localData, monthPlanKH, mode, view])

  // ── Tóm tắt kỳ ─────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    // Số dư đầu/cuối kỳ theo "Tồn" THỰC TẾ (sổ quỹ) — cùng thuật toán Dashboard CEO,
    // nên số dư cuối kỳ luôn khớp Dashboard. Thu/chi tách theo cột "Loại":
    //   • "Thực tế"  → Tổng thu / Tổng chi (đã phân loại)
    //   • "Nội bộ"   → chuyển quỹ nội bộ (không đổi tổng quỹ, chỉ dịch chuyển giữa TK)
    //   • "XL"       → thu/chi xử lý
    //   • còn lại/trống → chưa gán loại
    // Phần Tồn dịch chuyển mà KHÔNG có bút toán PS tương ứng = "Chênh lệch sổ quỹ"
    // (thiếu/nhập sai chứng từ). Bốn khoản này là THUYẾT MINH để bảng cân tuyệt đối:
    //   opening + (thu − chi) + nội bộ + XL + khác + chênh lệch = closing.
    const yPrefix = String(selectedYear) + '-'
    let thuTT = 0, chiTT = 0, noiBoNet = 0, xlNet = 0, khacNet = 0
    for (const r of rows) {
      const ngay = String(r['Ngày'] ?? r['Ngay'] ?? '')
      if (!ngay.startsWith(yPrefix)) continue
      const mi = parseInt(ngay.slice(5, 7)) - 1
      if (!scopeMonths.includes(mi)) continue
      const t = rowType(r); if (!t) continue
      const amt = Math.abs(Number(r['Số_tiền_PS'] ?? r['So_tien_PS'] ?? 0))
      const signed = t === 'thu' ? amt : -amt
      const loai = loaiKey ? String(r[loaiKey] ?? '').trim() : ''
      if (loai === 'Thực tế') { if (t === 'thu') thuTT += amt; else chiTT += amt }
      else if (loai === 'Nội bộ') noiBoNet += signed
      else if (loai === 'XL') xlNet += signed
      else khacNet += signed   // trống + loại khác
    }
    const startMonth = scopeMonths.length ? scopeMonths[0] : (view === 'year' ? 0 : monthSel - 1)
    const endMonth   = scopeMonths.length ? scopeMonths[scopeMonths.length - 1] : startMonth
    const { opening, closing } = buildTonKy(rows, selectedYear, startMonth, endMonth)
    const netTT = thuTT - chiTT
    // Chênh lệch sổ quỹ = phần biến động Tồn không giải thích được bằng bất kỳ bút toán PS nào
    const residual = closing - opening - netTT - noiBoNet - xlNet - khacNet
    return { opening, closing, thu: thuTT, chi: chiTT, netTT, noiBoNet, xlNet, khacNet, residual }
  }, [rows, scopeMonths, loaiKey, selectedYear, view, monthSel])

  // ── Giải pháp cân đối (chỉ Năm/Quý): gom từ các doc ngân sách trong kỳ ─────────
  useEffect(() => {
    if (view === 'month') return
    const need = scopeMonths.map(mi => `${selectedYear}-${pad2(mi + 1)}`)
    let alive = true
    Promise.all(need.map(ms =>
      ms === month ? Promise.resolve([ms, localData] as [string, NganSachThang])
        : getNganSach(ms).then(d => [ms, d] as [string, NganSachThang])
    )).then(pairs => {
      if (!alive) return
      setScopeDocs(prev => { const m = new Map(prev); pairs.forEach(([k, d]) => m.set(k, d)); return m })
    }).catch(() => {})
    return () => { alive = false }
  }, [view, scopeMonths, selectedYear, month, localData])

  const giaiPhap = useMemo(() => {
    const items: { mo_ta: string; kh: number; th: number; trang_thai: string; thang: string }[] = []
    let kh = 0, th = 0
    const scan = (doc: NganSachThang | null | undefined, ms: string) => {
      if (!doc) return
      for (const gp of doc.giai_phap ?? []) {
        if (!gp.mo_ta?.trim()) continue
        items.push({ mo_ta: gp.mo_ta, kh: gp.so_tien_ke_hoach || 0, th: gp.so_tien_thuc_hien || 0, trang_thai: gp.trang_thai, thang: ms })
        if (gp.trang_thai !== 'no') { kh += gp.so_tien_ke_hoach || 0; th += gp.so_tien_thuc_hien || 0 }
      }
    }
    if (view === 'month') {
      scan(planDoc, monthStr)
    } else {
      for (const mi of scopeMonths) {
        const ms = `${selectedYear}-${pad2(mi + 1)}`
        scan(ms === month ? localData : scopeDocs.get(ms), ms)
      }
    }
    return { items, kh, th }
  }, [view, planDoc, monthStr, scopeMonths, selectedYear, month, localData, scopeDocs])

  // ── Nhãn kỳ / tiêu đề ───────────────────────────────────────────────────────────
  const scopeLabel =
    view === 'year' ? `NĂM ${selectedYear}`
      : view === 'quarter' ? `QUÝ ${quarter}/${selectedYear}`
        : `THÁNG ${monthSel}/${selectedYear}`
  const kyLabel =
    view === 'year' ? `01/01/${selectedYear} – 31/12/${selectedYear}`
      : view === 'quarter'
        ? `01/${pad2((quarter - 1) * 3 + 1)}/${selectedYear} – ${lastDay(selectedYear, quarter * 3)}/${pad2(quarter * 3)}/${selectedYear}`
        : `01/${pad2(monthSel)}/${selectedYear} – ${lastDay(selectedYear, monthSel)}/${pad2(monthSel)}/${selectedYear}`
  const printDate = useMemo(() => new Date().toLocaleDateString('vi-VN'), [])

  const YEARS = [curYear - 2, curYear - 1, curYear, curYear + 1, curYear + 2]
  const toggle = (key: string) => setExpanded(prev => {
    const s = new Set(prev)
    if (s.has(key)) s.delete(key); else s.add(key)
    return s
  })

  // ── Xuất báo cáo Word (.docx) ────────────────────────────────────────────────────
  // "gọn" = chỉ các nhóm chính; "đầy đủ" = mở hết chi tiết từng đơn vị.
  // Word tự phân trang → hiện đầy đủ mọi trang (khác với in PDF cũ chỉ ra 1 trang).
  const [exporting, setExporting] = useState<'compact' | 'full' | null>(null)
  const exportReport = async (detail: 'compact' | 'full') => {
    if (exporting) return
    setExporting(detail)
    try {
      await exportBaoCaoWord({
        scopeLabel, kyLabel, printDate, view, dispMode: mode,
        cols: cols.map(c => ({ key: c.key, label: c.label })),
        thu, chi, summary, giaiPhap, mode: detail,
      })
    } catch (e) {
      console.error('Xuất Word thất bại:', e)
      alert('Xuất Word thất bại. Vui lòng thử lại.')
    } finally {
      setExporting(null)
    }
  }

  // Còn phải thực hiện = max(0, Kế hoạch − Thực hiện). Nếu TH ≥ KH → 0 (hiển thị "—").
  const conPhaiThucHien = (c: Record<string, number>) => Math.max(0, (c['KH'] ?? 0) - (c['TH'] ?? 0))

  // ── Render 1 dòng giá trị (các cột + cột cuối + tỷ trọng) ────────────────────────
  const valueCells = (c: Record<string, number>, total: number, grand: number) => (
    <>
      {cols.map(col => (
        <td key={col.key} className="bc-num">{fmt(c[col.key] ?? 0)}</td>
      ))}
      {mode === 'SO' ? (
        <td className="bc-num bc-strong">{fmt(conPhaiThucHien(c))}</td>
      ) : (
        <td className="bc-num bc-strong">{fmt(total)}</td>
      )}
      <td className="bc-pct">{grand > 0 ? (total / grand * 100).toFixed(1) + '%' : '—'}</td>
    </>
  )

  const renderSection = (sec: Section, type: 'thu' | 'chi', roman: string, title: string, nameHead: string) => {
    const isThu = type === 'thu'
    const totalColor = isThu ? 'var(--bc-green)' : 'var(--bc-red)'
    return (
      <div className="bc-section">
        <div className="bc-sec-head">
          <span className="bc-sec-title">{roman}. {title}</span>
          <span className="bc-sec-total" style={{ color: totalColor }}>{fmt(sec.grandTotal)} đ</span>
        </div>
        <div className="bc-scroll">
          <table className="bc-table">
            <thead>
              <tr>
                <th className="bc-idx">#</th>
                <th className="bc-name">{nameHead}</th>
                {cols.map(c => <th key={c.key} className="bc-num-h">{c.label}</th>)}
                <th className="bc-num-h">{mode === 'SO' ? 'Còn phải thực hiện' : 'Tổng (đ)'}</th>
                <th className="bc-pct-h">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody>
              {sec.rows.length === 0 && (
                <tr><td className="bc-empty" colSpan={cols.length + 3}>Không có dữ liệu trong kỳ.</td></tr>
              )}
              {sec.rows.map((g, i) => {
                const ek = type + '|' + g.nhom
                const open = expanded.has(ek)
                return (
                  <>
                    <tr key={ek} className={'bc-row bc-group' + (open ? ' open' : '')} onClick={() => g.units.length > 1 && toggle(ek)}>
                      <td className="bc-idx">{i + 1}</td>
                      <td className="bc-name">
                        {g.units.length > 1 && <span className="bc-caret">▶</span>}
                        <span className="bc-gname">{g.nhom}</span>
                      </td>
                      {valueCells(g.cols, g.total, sec.grandTotal)}
                    </tr>
                    {open && g.units.map(u => (
                      <tr key={ek + '|' + u.unit} className="bc-row bc-unit">
                        <td className="bc-idx" />
                        <td className="bc-name"><span className="bc-uname">└ {u.unit}</span></td>
                        {valueCells(u.cols, u.total, sec.grandTotal)}
                      </tr>
                    ))}
                  </>
                )
              })}
              <tr className="bc-total-row">
                <td className="bc-idx" />
                <td className="bc-name">TỔNG {isThu ? 'THU' : 'CHI'}</td>
                {cols.map(c => <td key={c.key} className="bc-num">{fmt(sec.colTotals[c.key] ?? 0)}</td>)}
                <td className="bc-num">{mode === 'SO' ? fmt(sec.rows.reduce((s, g) => s + conPhaiThucHien(g.cols), 0)) : fmt(sec.grandTotal)}</td>
                <td className="bc-pct">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="baocao">
      <style>{CSS}</style>

      {/* ── CONTROLS (ngoài giấy) ── */}
      <div className="bc-controls">
        <div className="bc-switch">
          {([['year', 'Cả năm'], ['quarter', 'Theo Quý'], ['month', 'Theo Tháng']] as [View, string][]).map(([v, l]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <select className="bc-select" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        {view === 'quarter' && (
          <div className="bc-chips">
            {[1, 2, 3, 4].map(q => (
              <button key={q} className={'bc-chip' + (quarter === q ? ' active' : '')} onClick={() => setQuarter(q)}>Quý {q}</button>
            ))}
          </div>
        )}
        {view === 'month' && (
          <div className="bc-chips">
            {MONTH_SHORT.map((l, i) => (
              <button key={i} className={'bc-chip' + (monthSel === i + 1 ? ' active' : '')} onClick={() => setMonthSel(i + 1)}>{l}</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {loading && <span className="bc-loading">⏳ Đang tải…</span>}
        <div className="bc-switch" title="Chọn nội dung hiển thị: Kế hoạch / Thực hiện / So sánh">
          {([['SO', 'TH vs KH'], ['KH', 'Kế hoạch'], ['TH', 'Thực hiện']] as [Mode, string][]).map(([m, l]) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>
        <button className="bc-print bc-print-ghost" onClick={() => exportReport('compact')} disabled={exporting !== null} title="Xuất Word — chỉ hiện các nhóm chính (không mở chi tiết đơn vị)">{exporting === 'compact' ? '⏳ Đang xuất…' : '⬇ Xuất Word (gọn)'}</button>
        <button className="bc-print" onClick={() => exportReport('full')} disabled={exporting !== null} title="Xuất Word — mở hết chi tiết từng đơn vị trong mọi nhóm">{exporting === 'full' ? '⏳ Đang xuất…' : '⬇ Xuất Word (đầy đủ)'}</button>
      </div>

      <div className="bc-paper">
      {/* ── HEADER ── */}
      <div className="bc-head">
        <div className="bc-eyebrow">SƠN AN GROUP</div>
        <h1 className="bc-title">BÁO CÁO DÒNG TIỀN {scopeLabel}</h1>
        <div className="bc-meta">
          Đơn vị tính: đ · Nguồn: Firebase Realtime Database · Ngày in: {printDate} · Kỳ: {kyLabel}
        </div>
      </div>

      {renderSection(thu, 'thu', 'I', 'DÒNG TIỀN THU', 'KHOẢN MỤC THU')}
      {renderSection(chi, 'chi', 'II', 'DÒNG TIỀN CHI', 'KHOẢN MỤC CHI')}

      {/* ── III. TÓM TẮT & CÂN ĐỐI KỲ ── */}
      <div className="bc-summary" style={{ maxWidth: 'none' }}>
        <div className="bc-sum-head">III. TÓM TẮT & CÂN ĐỐI KỲ · {scopeLabel}</div>
        <div className="bc-sum-body">
          <SumRow label="Tồn quỹ đầu kỳ" sub={`${kyLabel.split(' – ')[0]} · sổ quỹ`} value={fmt(summary.opening) + ' đ'} />
          <SumRow label="(+) Tổng thu trong kỳ" sub="đã phân loại (Thực tế)" value={fmt(summary.thu) + ' đ'} color="var(--bc-green)" />
          <SumRow label="(−) Tổng chi trong kỳ" sub="đã phân loại (Thực tế)" value={fmt(summary.chi) + ' đ'} color="var(--bc-red)" />

          {/* Thuyết minh khoản chưa phân loại — làm rõ vì sao (đầu kỳ + thu − chi) ≠ sổ quỹ */}
          {(summary.noiBoNet || summary.xlNet || summary.khacNet || summary.residual) ? (
            <div className="bc-sum-note-head">Thuyết minh khoản chưa phân loại (đối chiếu về sổ quỹ)</div>
          ) : null}
          {summary.noiBoNet ? <NoteRow label="Chuyển quỹ nội bộ (net)" sub="dịch chuyển giữa TK, không đổi tổng quỹ" value={summary.noiBoNet} /> : null}
          {summary.xlNet ? <NoteRow label="Thu/chi xử lý – XL (net)" value={summary.xlNet} /> : null}
          {summary.khacNet ? <NoteRow label="Thu/chi chưa gán loại (net)" sub="dòng chưa điền cột Loại" value={summary.khacNet} /> : null}
          {summary.residual ? <NoteRow label="Chênh lệch sổ quỹ chưa đối chiếu" sub="Tồn biến động nhưng thiếu bút toán thu/chi" value={summary.residual} /> : null}

          <SumRow label="(=) Số dư cuối kỳ thực tế" sub="theo sổ quỹ · khớp Dashboard" value={fmtSigned(summary.closing) + ' đ'} color={summary.closing < 0 ? 'var(--bc-red)' : 'var(--bc-navy)'} strong highlight />

          {/* Giải pháp cân đối */}
          {giaiPhap.items.length === 0 ? (
            <div className="bc-sum-row">
              <span className="bc-sum-label" style={{ color: '#9ca3af' }}>Giải pháp cân đối: chưa có (nhập ở tab Giải pháp cân đối)</span>
            </div>
          ) : giaiPhap.items.map((g, i) => (
            <div key={i} className="bc-sum-row">
              <span className="bc-sum-label">
                <span style={{ color: '#9ca3af', marginRight: 6 }}>↳</span>
                {view !== 'month' && (
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--bc-navy)', borderRadius: 4, padding: '1px 6px', marginRight: 7 }}>
                    Th.{parseInt(g.thang.slice(5, 7))}
                  </span>
                )}
                {g.mo_ta}
                <span className="bc-sum-sub"> · {g.trang_thai === 'yes' ? 'đã thực hiện' : g.trang_thai === 'no' ? 'không dùng' : 'dự kiến'}</span>
              </span>
              <span className="bc-sum-val" style={{ color: g.trang_thai === 'no' ? '#9ca3af' : '#15803d', textDecoration: g.trang_thai === 'no' ? 'line-through' : 'none' }}>{fmt(g.kh)} đ</span>
            </div>
          ))}
          <SumRow label="(+) Giải pháp cân đối" value={fmt(giaiPhap.kh) + ' đ'} color="var(--bc-green)" />
          <SumRow label="(=) Dòng tiền sau cân đối" value={fmtSigned(summary.closing + giaiPhap.kh) + ' đ'} color={(summary.closing + giaiPhap.kh) < 0 ? 'var(--bc-red)' : 'var(--bc-navy)'} strong highlight />
        </div>
      </div>
      </div>
    </div>
  )
}

// Dòng thuyết minh (thụt lề, giá trị có dấu, màu hổ phách) cho các khoản chưa phân loại.
function NoteRow({ label, sub, value }: { label: string; sub?: string; value: number }) {
  return (
    <div className="bc-sum-row bc-sum-note">
      <span className="bc-sum-label">
        <span style={{ color: '#9ca3af', marginRight: 6 }}>↳</span>
        {label}{sub && <span className="bc-sum-sub"> · {sub}</span>}
      </span>
      <span className="bc-sum-val" style={{ color: 'var(--bc-amber)', fontWeight: 600 }}>{fmtSigned(value)} đ</span>
    </div>
  )
}

function SumRow({ label, sub, value, color, strong, highlight }: { label: string; sub?: string; value: string; color?: string; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={'bc-sum-row' + (highlight ? ' hl' : '')}>
      <span className="bc-sum-label" style={strong ? { fontWeight: 700 } : undefined}>
        {label}{sub && <span className="bc-sum-sub"> ({sub})</span>}
      </span>
      <span className="bc-sum-val" style={{ color, fontWeight: strong ? 700 : 600 }}>{value}</span>
    </div>
  )
}

const CSS = `
.baocao{
  --bc-navy:#1C3557; --bc-navy-deep:#0D1F33; --bc-ink:#1F2430; --bc-line:#D0DCE8;
  --bc-green:#15803d; --bc-red:#dc2626; --bc-grey:#9ca3af; --bc-muted:#4B6A8A; --bc-amber:#B45309;
  --bc-blue:#EEF3FA; --bc-blue2:#E3EBF6; --bc-head:#F5F8FC;
  --bc-mono:'Roboto Mono',ui-monospace,'Cascadia Code',Consolas,monospace;
  color:var(--bc-ink);font-size:13px;
}
.baocao *{box-sizing:border-box;}

/* Toolbar (ngoài giấy) */
.bc-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
.bc-switch{display:flex;border:1px solid var(--bc-line);border-radius:8px;overflow:hidden;}
.bc-switch button{font-family:inherit;border:none;background:#fff;padding:7px 16px;font-size:12.5px;font-weight:700;color:#6b7280;cursor:pointer;}
.bc-switch button.active{background:var(--bc-navy);color:#fff;}
.bc-select{font-family:inherit;font-size:12.5px;font-weight:600;color:var(--bc-ink);background:#fff;border:1px solid var(--bc-line);border-radius:7px;padding:7px 11px;cursor:pointer;}
.bc-chips{display:flex;gap:6px;flex-wrap:wrap;}
.bc-chip{font-family:inherit;border:1px solid var(--bc-line);background:#fff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;color:var(--bc-navy);cursor:pointer;}
.bc-chip.active{background:var(--bc-navy);border-color:var(--bc-navy);color:#fff;}
.bc-loading{font-size:12px;color:var(--bc-grey);}
.bc-print{font-family:inherit;background:var(--bc-navy);color:#fff;border:1px solid var(--bc-navy);padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;}
.bc-print-ghost{background:#fff;color:var(--bc-navy);}
.bc-print-ghost:hover{background:var(--bc-blue);}

/* Giấy báo cáo */
.bc-paper{background:#fff;border:1px solid #E5E0D8;border-radius:14px;padding:32px 36px;max-width:1080px;margin:0 auto;box-shadow:0 2px 14px rgba(13,31,51,.07);}

.bc-head{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2.5px solid var(--bc-navy);}
.bc-eyebrow{font-size:11px;letter-spacing:.16em;color:var(--bc-grey);font-weight:700;text-transform:uppercase;margin-bottom:5px;}
.bc-title{font-size:21px;font-weight:800;color:var(--bc-navy);margin:0;}
.bc-meta{font-size:11px;color:var(--bc-grey);margin-top:7px;line-height:1.7;}

.bc-section{margin-bottom:24px;}
.bc-sec-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid var(--bc-navy);padding-bottom:7px;margin-bottom:1px;}
.bc-sec-title{font-size:12.5px;font-weight:800;color:var(--bc-navy);text-transform:uppercase;letter-spacing:.06em;}
.bc-sec-total{font-family:var(--bc-mono);font-size:13px;font-weight:800;}
.bc-scroll{overflow-x:auto;}
.bc-table{border-collapse:collapse;width:100%;min-width:560px;}
.bc-table thead th{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--bc-muted);font-weight:700;padding:7px 10px;border-top:1px solid var(--bc-line);border-bottom:1px solid var(--bc-line);background:var(--bc-head);white-space:nowrap;text-align:right;}
.bc-idx{width:30px;text-align:center;color:#C4CACF;font-weight:700;}
.bc-name{text-align:left;}
.bc-num-h,.bc-pct-h{text-align:right;}
.bc-row td{padding:8px 10px;border-bottom:1px solid #F1F3F6;vertical-align:middle;}
.bc-group td{background:var(--bc-blue);border-bottom:1px solid var(--bc-line);}
.bc-row.bc-group{cursor:default;}
.bc-row.bc-group .bc-name{cursor:pointer;}
.bc-group:hover td{background:var(--bc-blue2);}
.bc-caret{display:inline-block;font-size:8px;color:var(--bc-navy);margin-right:7px;transition:transform .15s;transform:rotate(0deg);}
.bc-group.open .bc-caret{transform:rotate(90deg);}
.bc-gname{font-weight:700;color:var(--bc-navy);font-size:12.5px;}
.bc-uname{color:var(--bc-muted);font-size:12px;padding-left:22px;display:inline-block;}
.bc-unit td{background:#fff;}
.bc-num{text-align:right;font-family:var(--bc-mono);font-size:12px;color:#374151;white-space:nowrap;}
.bc-group .bc-num{color:var(--bc-navy);font-weight:700;}
.bc-num.bc-strong{font-weight:800;color:var(--bc-navy);}
.bc-delta.good{color:var(--bc-green);}
.bc-delta.bad{color:var(--bc-red);}
.bc-pct{text-align:right;font-size:11px;color:#6b7280;white-space:nowrap;}
.bc-group .bc-pct{color:#6b7280;}
.bc-empty{text-align:center;color:var(--bc-grey);padding:20px;font-size:12.5px;}
.bc-total-row td{background:var(--bc-navy);color:#fff;font-weight:800;padding:9px 10px;border:none;}
.bc-total-row .bc-name{font-size:12.5px;letter-spacing:.05em;}
.bc-total-row .bc-num,.bc-total-row .bc-pct{color:#fff;}

.bc-summary{border:1.5px solid var(--bc-navy);border-radius:10px;overflow:hidden;max-width:560px;}
.bc-sum-head{background:var(--bc-navy);color:#fff;font-weight:800;font-size:11px;padding:10px 18px;text-transform:uppercase;letter-spacing:.07em;}
.bc-sum-body{padding:0;}
.bc-sum-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--bc-line);font-size:13px;}
.bc-sum-row:last-child{border-bottom:none;}
.bc-sum-row.hl{background:var(--bc-blue);border-top:2px solid var(--bc-navy);}
.bc-sum-note-head{padding:9px 18px 5px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--bc-muted);background:#FAFBFD;border-bottom:1px solid var(--bc-line);}
.bc-sum-note{background:#FAFBFD;padding-top:7px;padding-bottom:7px;}
.bc-sum-note .bc-sum-label{font-size:12px;color:#6b7280;}
.bc-sum-label{color:#374151;}
.bc-sum-sub{color:var(--bc-grey);font-size:11px;}
.bc-sum-val{font-family:var(--bc-mono);font-weight:700;white-space:nowrap;}
@media print{.bc-controls{display:none;}.bc-paper{border:none;box-shadow:none;max-width:100%;padding:0;}}
`
