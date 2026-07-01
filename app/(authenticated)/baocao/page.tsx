'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { useDashUnit } from '@/contexts/dash-unit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function toArr(snap: any): Row[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? (v as Row) : {}))
  return []
}

const CY     = new Date().getFullYear()
const CUR_MM = new Date().getMonth() + 1

const isCPHD = (n: string) => n.toUpperCase().startsWith('CPHĐ') || n.toUpperCase().startsWith('CPHD')

function chiSuperGroupKey(nhom: string): 'cp-hoatdong' | 'goc-lai' | 'tra-ncc' | 'khac' {
  if (isCPHD(nhom)) return 'cp-hoatdong'
  const u = nhom.toUpperCase()
  if (u.includes('GỐC VAY') || u.includes('GOC VAY')) return 'goc-lai'
  if (u.includes('LÃI VAY') || u.includes('LAI VAY')) return 'goc-lai'
  if (u.startsWith('TRẢ NCC') || u.startsWith('TRA NCC')) return 'tra-ncc'
  return 'khac'
}
const CHI_SUPER = [
  { key: 'cp-hoatdong' as const, label: 'CP Hoạt động' },
  { key: 'goc-lai'     as const, label: 'Trả gốc & lãi vay' },
  { key: 'tra-ncc'     as const, label: 'Trả NCC' },
  { key: 'khac'        as const, label: 'Khác' },
]

// Sort order: CPHĐ* → Trả gốc vay → Trả lãi vay → Trả NCC → Khác*
function chiGroupPriority(nhom: string): number {
  if (isCPHD(nhom)) return 0
  const u = nhom.toUpperCase()
  if (u.includes('GỐC VAY') || u.includes('GOC VAY')) return 1
  if (u.includes('LÃI VAY') || u.includes('LAI VAY')) return 2
  if (u.startsWith('TRẢ NCC') || u.startsWith('TRA NCC')) return 3
  return 4
}
function sortGroups<T extends { nhom: string; total: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ap = chiGroupPriority(a.nhom), bp = chiGroupPriority(b.nhom)
    if (ap !== bp) return ap - bp
    return b.total - a.total
  })
}

// Auto-scale a table to fit its container width using CSS zoom
function AutoFit({ children, deps }: { children: React.ReactNode; deps: unknown[] }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    inner.style.zoom = '1'
    requestAnimationFrame(() => {
      if (!outer || !inner) return
      const containerW = outer.clientWidth
      const tableW     = inner.scrollWidth
      inner.style.zoom = tableW > containerW ? String(containerW / tableW) : '1'
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return (
    <div ref={outerRef} style={{ width: '100%', overflow: 'hidden' }}>
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

export default function BaocaoPage() {
  const { unit } = useDashUnit()
  const divisor = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs   = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmt  = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })
  const fmtN = (v: number) => fmt(Math.abs(v))
  const fmtP = (v: number) => (v >= 0 ? '+' : '') + fmt(v)
  const clr  = (v: number) => v > 0 ? '#15803d' : v < 0 ? '#dc2626' : '#374151'

  const [data,       setData]       = useState<Row[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [mode,       setMode]       = useState<'monthly' | 'annual'>('monthly')
  const [selYear,    setSelYear]    = useState(CY)
  const [selMonth,   setSelMonth]   = useState(CUR_MM)
  const [thuExp,     setThuExp]     = useState<Set<string>>(new Set())
  const [chiExp,     setChiExp]     = useState<Set<string>>(new Set())
  const [annChiExp,  setAnnChiExp]  = useState<Set<string>>(new Set())
  const [annThuExp,  setAnnThuExp]  = useState<Set<string>>(new Set())
  const [availYears, setAvailYears] = useState<number[]>([CY])

  useEffect(() => {
    get(ref(getDb(), 'data_quy'))
      .then(snap => {
        const rows = toArr(snap).sort((a, b) =>
          String(a['Ngày'] ?? '').localeCompare(String(b['Ngày'] ?? ''))
        )
        setData(rows)
        const yrs = new Set<number>()
        rows.forEach(r => {
          const y = parseInt(String(r['Ngày'] ?? '').slice(0, 4))
          if (y > 2000 && y <= CY + 1) yrs.add(y)
        })
        setAvailYears([...yrs].sort((a, b) => b - a))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  const selPrefix   = `${selYear}-`
  const selMonthStr = `${selYear}-${String(selMonth).padStart(2, '0')}`

  // Opening balance for selected month: last Tồn per account strictly before selMonthStr
  const selOpenBal = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data) {
      if (String(r['Ngày'] ?? '').slice(0, 7) >= selMonthStr) break
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) m.set(s, Number(r['Tồn'] ?? 0))
    }
    let t = 0; m.forEach(v => { t += v }); return t
  }, [data, selMonthStr])

  // Closing balance for selected month
  const selCloseBal = useMemo(() => {
    const nextMM = selMonth === 12
      ? `${selYear + 1}-01`
      : `${selYear}-${String(selMonth + 1).padStart(2, '0')}`
    const m = new Map<string, number>()
    for (const r of data) {
      if (String(r['Ngày'] ?? '').slice(0, 7) >= nextMM) break
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) m.set(s, Number(r['Tồn'] ?? 0))
    }
    let t = 0; m.forEach(v => { t += v }); return t
  }, [data, selMonth, selYear, selMonthStr])

  // ── Monthly report ──────────────────────────────────
  interface GroupAgg {
    nhom:  string
    total: number
    items: Array<{ label: string; amt: number }>
  }

  const monthlyData = useMemo(() => {
    const txns = data.filter(r => String(r['Ngày'] ?? '').slice(0, 7) === selMonthStr)

    const thuMap = new Map<string, { total: number; sub: Map<string, number> }>()
    const chiMap = new Map<string, { total: number; sub: Map<string, number> }>()

    for (const r of txns) {
      const nhom    = (String(r['Nhóm_CP'] ?? '').trim()) || 'Không phân nhóm'
      const chiTiet = (String(r['Chi_tiết_nhóm'] ?? r['Chi tiết nhóm'] ?? '').trim()) || (String(r['Đơn_vị'] ?? '').trim()) || '—'
      const ps      = Number(r['Số_tiền_PS'] ?? 0)
      const loai    = String(r['Ghi_chu']   ?? '')
      const amt     = Math.abs(ps)
      if (!amt) continue

      const isThu = loai === 'Thu' || ps > 0
      const map   = isThu ? thuMap : chiMap
      if (!map.has(nhom)) map.set(nhom, { total: 0, sub: new Map() })
      const g = map.get(nhom)!
      g.total += amt
      g.sub.set(chiTiet, (g.sub.get(chiTiet) ?? 0) + amt)
    }

    const flatten = (m: Map<string, { total: number; sub: Map<string, number> }>): GroupAgg[] =>
      sortGroups(
        [...m.entries()].map(([nhom, { total, sub }]) => ({
          nhom, total,
          items: [...sub.entries()].sort((a, b) => b[1] - a[1]).map(([label, amt]) => ({ label, amt })),
        }))
      )

    const thuGroups = flatten(thuMap)
    const chiGroups = flatten(chiMap)

    return {
      thuGroups,
      chiGroups,
      totalThu: thuGroups.reduce((s, g) => s + g.total, 0),
      totalChi: chiGroups.reduce((s, g) => s + g.total, 0),
    }
  }, [data, selMonthStr])

  // ── Annual report ────────────────────────────────────
  const annualData = useMemo(() => {
    const yearTxns = data.filter(r => String(r['Ngày'] ?? '').startsWith(selPrefix))

    // Opening balance for the year
    const openBal = new Map<string, number>()
    for (const r of data) {
      if (String(r['Ngày'] ?? '') >= selPrefix) break
      const s = String(r['Số_tài_khoản'] ?? '')
      if (s) openBal.set(s, Number(r['Tồn'] ?? 0))
    }
    let yearOpen = 0; openBal.forEach(v => { yearOpen += v })

    // Monthly rows
    const monthRows: Array<{ mm: string; thu: number; chi: number; rong: number; cuoiky: number }> = []
    const ton = new Map<string, number>(openBal)
    let curMm = '', mThu = 0, mChi = 0

    for (const r of yearTxns) {
      const mm   = String(r['Ngày'] ?? '').slice(5, 7)
      const stk  = String(r['Số_tài_khoản'] ?? '')
      const ps   = Number(r['Số_tiền_PS'] ?? 0)
      const loai = String(r['Ghi_chu'] ?? '')
      if (mm !== curMm) {
        if (curMm) { let c = 0; ton.forEach(v => { c += v }); monthRows.push({ mm: curMm, thu: mThu, chi: mChi, rong: mThu - mChi, cuoiky: c }) }
        curMm = mm; mThu = 0; mChi = 0
      }
      if (loai === 'Thu' || ps > 0) mThu += Math.abs(ps)
      else if (loai === 'Chi' || ps < 0) mChi += Math.abs(ps)
      if (stk) ton.set(stk, Number(r['Tồn'] ?? 0))
    }
    if (curMm) { let c = 0; ton.forEach(v => { c += v }); monthRows.push({ mm: curMm, thu: mThu, chi: mChi, rong: mThu - mChi, cuoiky: c }) }

    // Chi tiết nhóm × month matrix — chi grouped by super-group, thu grouped by nhóm
    const chiSGMap        = new Map<string, Map<string, Map<string, number>>>()
    const thuNhomDetailMap = new Map<string, Map<string, Map<string, number>>>()

    for (const r of yearTxns) {
      const mm     = String(r['Ngày'] ?? '').slice(5, 7)
      const nhom   = (String(r['Nhóm_CP'] ?? '').trim()) || 'Không phân nhóm'
      const detail = (String(r['Chi_tiết_nhóm'] ?? r['Chi tiết nhóm'] ?? '').trim()) || nhom
      const ps     = Number(r['Số_tiền_PS'] ?? 0)
      const loai   = String(r['Ghi_chu'] ?? '')
      const amt    = Math.abs(ps)
      if (!amt) continue
      if (loai === 'Chi' || ps < 0) {
        const sgKey = chiSuperGroupKey(nhom)
        if (!chiSGMap.has(sgKey)) chiSGMap.set(sgKey, new Map())
        const sg = chiSGMap.get(sgKey)!
        if (!sg.has(detail)) sg.set(detail, new Map())
        const dm = sg.get(detail)!
        dm.set(mm, (dm.get(mm) ?? 0) + amt)
      }
      if (loai === 'Thu' || ps > 0) {
        if (!thuNhomDetailMap.has(nhom)) thuNhomDetailMap.set(nhom, new Map())
        const ng = thuNhomDetailMap.get(nhom)!
        if (!ng.has(detail)) ng.set(detail, new Map())
        const dm = ng.get(detail)!
        dm.set(mm, (dm.get(mm) ?? 0) + amt)
      }
    }

    const totalThu = monthRows.reduce((s, r) => s + r.thu, 0)
    const totalChi = monthRows.reduce((s, r) => s + r.chi, 0)

    const mkItem = (detail: string, dm: Map<string, number>) => ({
      nhom: detail, mmMap: dm, total: [...dm.values()].reduce((s, v) => s + v, 0),
    })

    const chiSuperGroups = CHI_SUPER.map(sg => {
      const detailMap = chiSGMap.get(sg.key)
      if (!detailMap?.size) return null
      const items = [...detailMap.entries()].map(([d, dm]) => mkItem(d, dm)).sort((a, b) => b.total - a.total)
      const mmMap = new Map<string, number>()
      for (const g of items) for (const [mm, v] of g.mmMap) mmMap.set(mm, (mmMap.get(mm) ?? 0) + v)
      return { ...sg, mmMap, total: items.reduce((s, g) => s + g.total, 0), items }
    }).filter((x): x is NonNullable<typeof x> => x !== null)

    const thuNhomRows = sortGroups(
      [...thuNhomDetailMap.entries()].map(([nhom, detailMap]) => {
        const items = [...detailMap.entries()].map(([d, dm]) => mkItem(d, dm)).sort((a, b) => b.total - a.total)
        const mmMap = new Map<string, number>()
        for (const g of items) for (const [mm, v] of g.mmMap) mmMap.set(mm, (mmMap.get(mm) ?? 0) + v)
        return { nhom, mmMap, total: items.reduce((s, g) => s + g.total, 0), items }
      })
    )

    return {
      monthRows, yearOpen,
      chiSuperGroups, thuNhomRows,
      totalThu, totalChi,
    }
  }, [data, selPrefix])

  // Helpers
  const toggleThu    = (nhom: string) => setThuExp(p => { const s = new Set(p); s.has(nhom) ? s.delete(nhom) : s.add(nhom); return s })
  const toggleChi    = (nhom: string) => setChiExp(p => { const s = new Set(p); s.has(nhom) ? s.delete(nhom) : s.add(nhom); return s })
  const toggleAnnChi = (key: string)  => setAnnChiExp(p => { const s = new Set(p); s.has(key) ? s.delete(key) : s.add(key); return s })
  const toggleAnnThu = (nhom: string) => setAnnThuExp(p => { const s = new Set(p); s.has(nhom) ? s.delete(nhom) : s.add(nhom); return s })
  const expandAll  = () => {
    setThuExp(new Set(monthlyData.thuGroups.map(g => g.nhom)))
    setChiExp(new Set(monthlyData.chiGroups.map(g => g.nhom)))
    setAnnChiExp(new Set(annualData.chiSuperGroups.map(sg => sg.key)))
    setAnnThuExp(new Set(annualData.thuNhomRows.map(g => g.nhom)))
  }
  const collapseAll = () => { setThuExp(new Set()); setChiExp(new Set()); setAnnChiExp(new Set()); setAnnThuExp(new Set()) }

  const doExport = (format: 'pdf' | 'word') => {
    expandAll()
    setTimeout(() => {
      const paper = document.getElementById('bc-report-paper')
      if (!paper) return

      const styles = Array.from(document.querySelectorAll('style'))
        .map(s => s.textContent ?? '').join('\n')

      const periodLabel = mode === 'monthly'
        ? `Tháng ${selMonth}/${selYear}`
        : `Năm ${selYear}`

      const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Báo cáo dòng tiền ${periodLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:11px;background:#fff}
${styles}
.bc-bar{display:none!important}
.bc{padding:0!important;overflow:visible!important;background:#fff!important}
.bc-paper{border:none!important;box-shadow:none!important;border-radius:0!important;
  max-width:100%!important;padding:20px 28px!important}
.bc-grp{cursor:default!important}
.bc-ann,.bc-gtbl,.bc-tbl{font-size:10px!important}
.ann-sg-row{cursor:default!important}
.pagebreak{page-break-before:always;margin-top:0!important}
@page{size:A4 landscape;margin:15mm}
@media print{body{background:#fff}}
</style>
</head>
<body>
${paper.outerHTML}
${format === 'pdf' ? '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr' + 'ipt>' : ''}
</body>
</html>`

      if (format === 'pdf') {
        const win = window.open('', '_blank')
        if (!win) { alert('Trình duyệt đã chặn cửa sổ mới. Vui lòng cho phép pop-up.'); return }
        win.document.write(html)
        win.document.close()
      } else {
        const blob = new Blob(['﻿', html], { type: 'application/msword' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = mode === 'monthly'
          ? `BaoCao_T${String(selMonth).padStart(2,'0')}_${selYear}.doc`
          : `BaoCao_Nam_${selYear}.doc`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    }, 300)
  }

  const mmLbl = (mm: string) => `T${mm}/${String(selYear).slice(2)}`

  // ─────── Render ───────

  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 14 }}>
      ⏳ Đang tải dữ liệu từ Firebase...
    </div>
  )
  if (error) return (
    <div style={{ margin: 24, padding: 16, background: '#FDECEC', borderRadius: 8, color: '#8C1F1F' }}>⚠ {error}</div>
  )

  const monthMaxAvail = selYear === CY ? CUR_MM : 12

  return (
    <>
      <style>{`
        .bc{flex:1;overflow-y:auto;padding:16px 24px 32px;background:#FAF8F3}

        /* Toolbar */
        .bc-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap}
        .bc-mode{display:flex;border:1px solid #E5E0D8;border-radius:8px;overflow:hidden}
        .bc-mode-btn{padding:7px 18px;font-size:12px;font-weight:600;border:none;background:#fff;color:#6b7280;cursor:pointer;font-family:inherit;transition:all .15s}
        .bc-mode-btn.on{background:#1C3557;color:#fff}
        .bc-sel{padding:6px 10px;border:1px solid #E5E0D8;border-radius:7px;font-size:12px;font-weight:600;color:#1F2430;background:#fff;cursor:pointer;font-family:inherit}
        .bc-btn{padding:6px 14px;border-radius:7px;font-size:11px;font-weight:600;border:1px solid #E5E0D8;background:#fff;color:#3D3D3D;cursor:pointer;font-family:inherit;transition:all .15s}
        .bc-btn:hover{border-color:#1C3557;background:#EEF3FA}
        .bc-btn-p{background:#1C3557;color:#fff!important;border-color:#1C3557}
        .bc-btn-p:hover{background:#162C45!important}

        /* Paper */
        .bc-paper{background:#fff;border:1px solid #E5E0D8;border-radius:14px;padding:36px 40px;max-width:960px;margin:0 auto;box-shadow:0 2px 14px rgba(13,31,51,.07)}

        /* Report header */
        .bc-hdr{text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2.5px solid #1C3557}
        .bc-co{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#9ca3af;margin-bottom:5px}
        .bc-title{font-size:22px;font-weight:800;color:#1C3557;margin-bottom:5px}
        .bc-meta{font-size:11px;color:#9ca3af;line-height:1.8}

        /* Section */
        .bc-sec{margin-bottom:26px}
        .bc-stitle{display:flex;justify-content:space-between;align-items:center;padding:8px 0 8px;border-bottom:2px solid #1C3557;margin-bottom:1px}
        .bc-stitle-lbl{font-size:12.5px;font-weight:800;color:#1C3557;text-transform:uppercase;letter-spacing:.06em}
        .bc-stitle-val{font-size:13px;font-weight:800;font-family:'Roboto Mono',monospace}

        /* Monthly table */
        .bc-tbl{width:100%;border-collapse:collapse}
        .bc-th{font-size:9.5px;font-weight:700;letter-spacing:.07em;color:#4B6A8A;padding:7px 10px;background:#F5F8FC;border-top:1px solid #D0DCE8;border-bottom:1px solid #D0DCE8;text-align:right;white-space:nowrap;text-transform:uppercase}
        .bc-th:first-child{text-align:left}
        .bc-grp{cursor:pointer}
        .bc-grp td{padding:9px 10px;font-weight:700;font-size:12px;color:#1C3557;background:#EEF3FA;border-bottom:1px solid #D0DCE8}
        .bc-grp:hover td{background:#E3EBF6}
        .bc-grp td.r{text-align:right;font-family:'Roboto Mono',monospace}
        .bc-sub td{padding:5px 10px 5px 36px;font-size:11.5px;color:#4B6A8A;background:#fff;border-bottom:1px solid #F3F4F6}
        .bc-sub td.r{text-align:right;font-family:'Roboto Mono',monospace}
        .bc-foot td{padding:9px 10px;font-size:12.5px;font-weight:800;background:#1C3557;color:#fff;border:none}
        .bc-foot td.r{text-align:right;font-family:'Roboto Mono',monospace}

        /* Summary box */
        .bc-sbox{border:1.5px solid #1C3557;border-radius:10px;overflow:hidden;margin-top:24px}
        .bc-sbox-hdr{background:#1C3557;color:#fff;padding:10px 18px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
        .bc-srow{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-bottom:1px solid #E5E0D8;font-size:13px}
        .bc-srow:last-child{border-bottom:none}
        .bc-srow-lbl{color:#374151}
        .bc-srow-val{font-family:'Roboto Mono',monospace;font-weight:700}
        .bc-srow.hlite{background:#EEF3FA}
        .bc-srow.pos{background:#F0FDF4}
        .bc-srow.neg-bg{background:#FFF5F5}
        .bc-srow.grand{background:#EEF3FA;border-top:2px solid #1C3557}

        /* Annual table */
        .bc-ann{width:100%;border-collapse:collapse;font-size:11.5px}
        .bc-ann th{padding:8px 9px;background:#1C3557;color:rgba(255,255,255,.85);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-align:right;white-space:nowrap;border-right:1px solid rgba(255,255,255,.1)}
        .bc-ann th:first-child{text-align:left;border-right:1px solid rgba(255,255,255,.1)}
        .bc-ann td{padding:7px 9px;border-bottom:1px solid #F0F4FA;text-align:right;font-family:'Roboto Mono',monospace;color:#374151;white-space:nowrap;border-right:1px solid #F0F4FA}
        .bc-ann td:first-child{text-align:left;font-family:inherit;color:#1F2430;font-weight:500;border-right:1px solid #E0E7F0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .bc-ann .sum-row td{background:#EEF3FA;font-weight:700;font-size:12px;border-top:1px solid #D0DCE8;border-bottom:1px solid #D0DCE8}
        .bc-ann .sum-row td:first-child{color:#1C3557}
        .bc-ann .nhom-row:hover td{background:#FAFBFC}
        .bc-ann .foot-row td{background:#1C3557;color:#fff;font-weight:800;border:none}
        .bc-ann .foot-row td:first-child{color:#fff}
        .bc-ann .gr-row td{background:#F5F8FC;font-size:10px;font-style:italic;color:#9ca3af;border-top:1px solid #E0E7F0}
        .bc-ann .ann-sg-row{cursor:pointer}
        .bc-ann .ann-sg-row td{background:#EEF3FA;font-weight:700;font-size:11.5px;color:#1C3557;border-top:2px solid #C5D3E8;border-bottom:1px solid #C5D3E8}
        .bc-ann .ann-sg-row:hover td{background:#E3EBF6}
        .bc-ann .ann-sg-row td:first-child{color:#1C3557}
        .bc-ann .ann-detail-row td:first-child{padding-left:28px!important;font-weight:400;color:#4B6A8A;font-size:11px}

        /* Growth table */
        .bc-gtbl{width:100%;border-collapse:collapse;font-size:11.5px}
        .bc-gtbl th{padding:8px 9px;background:#374151;color:rgba(255,255,255,.8);font-size:9.5px;font-weight:700;text-align:right;white-space:nowrap}
        .bc-gtbl th:first-child{text-align:left}
        .bc-gtbl td{padding:7px 9px;border-bottom:1px solid #F0F4FA;text-align:right;font-family:'Roboto Mono',monospace;font-weight:700;font-size:12px}
        .bc-gtbl td:first-child{text-align:left;font-family:inherit;font-weight:600;color:#374151;font-size:11.5px}

        /* Signatures */
        .bc-sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:48px;text-align:center}
        .bc-sig-title{font-size:10px;font-weight:800;letter-spacing:.07em;color:#374151;text-transform:uppercase;margin-bottom:56px}
        .bc-sig-line{border-top:1px solid #1C3557;padding-top:6px;font-size:9.5px;color:#9ca3af}

        /* Print */
        @media print {
          .bc-bar{display:none!important}
          .dtbar,.topbar,header,nav{display:none!important}
          .bc{padding:0!important;overflow:visible!important;background:#fff!important}
          .bc-paper{border:none!important;box-shadow:none!important;border-radius:0!important;padding:0!important;max-width:100%!important}
          .bc-grp{cursor:default!important}
          .bc-ann,.bc-gtbl,.bc-tbl{font-size:10px!important}
          .pagebreak{page-break-before:always;margin-top:0!important}
          @page{margin:15mm;size:A4 landscape}
        }
        @media(max-width:768px){
          .bc{padding:12px 12px 24px}
          .bc-paper{padding:20px 16px}
          .bc-sigs{grid-template-columns:1fr}
        }
      `}</style>

      <main className="bc">

        {/* ─── Toolbar ─── */}
        <div className="bc-bar">
          <div className="bc-mode">
            <button className={`bc-mode-btn${mode === 'monthly' ? ' on' : ''}`} onClick={() => setMode('monthly')}>
              📋 Báo cáo tháng
            </button>
            <button className={`bc-mode-btn${mode === 'annual' ? ' on' : ''}`} onClick={() => setMode('annual')}>
              📊 Báo cáo năm
            </button>
          </div>

          <select className="bc-sel" value={selYear} onChange={e => setSelYear(+e.target.value)}>
            {availYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {mode === 'monthly' && (
            <select className="bc-sel" value={selMonth} onChange={e => setSelMonth(+e.target.value)}>
              {Array.from({ length: monthMaxAvail }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          )}

          {mode === 'monthly' && (
            <>
              <button className="bc-btn" onClick={expandAll}>+ Mở rộng tất cả</button>
              <button className="bc-btn" onClick={collapseAll}>− Thu gọn tất cả</button>
            </>
          )}

          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            <button className="bc-btn bc-btn-p" onClick={() => doExport('pdf')}>
              ⬇ Xuất PDF
            </button>
            <button className="bc-btn" onClick={() => doExport('word')}>
              ⬇ Xuất Word
            </button>
          </div>
        </div>

        {/* ─── Paper ─── */}
        <div className="bc-paper" id="bc-report-paper">

          {/* Report header */}
          <div className="bc-hdr">
            <div className="bc-co">Sonan Land</div>
            <div className="bc-title">
              {mode === 'monthly'
                ? `BÁO CÁO DÒNG TIỀN THÁNG ${selMonth}/${selYear}`
                : `BÁO CÁO DÒNG TIỀN NĂM ${selYear}`}
            </div>
            <div className="bc-meta">
              Đơn vị tính: {unitLbl}
              &nbsp;·&nbsp; Nguồn: Firebase Realtime Database
              &nbsp;·&nbsp; Ngày in: {new Date().toLocaleDateString('vi-VN')}
              {mode === 'monthly' && (
                <>&nbsp;·&nbsp; Kỳ: 01/{String(selMonth).padStart(2,'0')}/{selYear} – {new Date(selYear, selMonth, 0).getDate()}/{String(selMonth).padStart(2,'0')}/{selYear}</>
              )}
            </div>
          </div>

          {/* ══════════ MONTHLY MODE ══════════ */}
          {mode === 'monthly' && (() => {
            const { thuGroups, chiGroups, totalThu, totalChi } = monthlyData
            const rong = totalThu - totalChi

            if (totalThu === 0 && totalChi === 0) return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 13 }}>
                Không có giao dịch trong tháng {selMonth}/{selYear}
              </div>
            )

            return (
              <>
                {/* I. Thu */}
                <div className="bc-sec">
                  <div className="bc-stitle">
                    <span className="bc-stitle-lbl">I. DÒNG TIỀN THU</span>
                    <span className="bc-stitle-val" style={{ color: '#15803d' }}>{fmtN(totalThu)} {unitLbl}</span>
                  </div>
                  <table className="bc-tbl">
                    <thead>
                      <tr>
                        <th className="bc-th" style={{ width: 28 }}>#</th>
                        <th className="bc-th" style={{ textAlign: 'left' }}>NHÓM GIAO DỊCH / ĐƠN VỊ</th>
                        <th className="bc-th" style={{ width: 170 }}>SỐ TIỀN ({unitLbl})</th>
                        <th className="bc-th" style={{ width: 72 }}>TỶ TRỌNG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thuGroups.flatMap((g, i) => [
                        <tr key={`tg-${g.nhom}`} className="bc-grp" onClick={() => toggleThu(g.nhom)}>
                          <td style={{ color: '#C4CACF', fontSize: 11, fontWeight: 700 }}>{i + 1}</td>
                          <td>
                            <span style={{ marginRight: 7, fontSize: 9, opacity: .7 }}>{thuExp.has(g.nhom) ? '▼' : '▶'}</span>
                            {g.nhom}
                          </td>
                          <td className="r" style={{ color: '#15803d' }}>{fmtN(g.total)}</td>
                          <td className="r" style={{ color: '#6b7280', fontSize: 11 }}>
                            {totalThu > 0 ? (g.total / totalThu * 100).toFixed(1) + '%' : '—'}
                          </td>
                        </tr>,
                        ...(thuExp.has(g.nhom) ? g.items.map(item => (
                          <tr key={`ts-${g.nhom}-${item.label}`} className="bc-sub">
                            <td />
                            <td style={{ paddingLeft: 36 }}>└ {item.label}</td>
                            <td className="r" style={{ color: '#4B6A8A' }}>{fmtN(item.amt)}</td>
                            <td className="r" style={{ color: '#9ca3af', fontSize: 10 }}>
                              {g.total > 0 ? (item.amt / g.total * 100).toFixed(1) + '%' : '—'}
                            </td>
                          </tr>
                        )) : []),
                      ])}
                      <tr className="bc-foot">
                        <td colSpan={2} style={{ letterSpacing: '.05em' }}>TỔNG THU</td>
                        <td className="r">{fmtN(totalThu)}</td>
                        <td className="r">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* II. Chi */}
                <div className="bc-sec">
                  <div className="bc-stitle">
                    <span className="bc-stitle-lbl">II. DÒNG TIỀN CHI</span>
                    <span className="bc-stitle-val" style={{ color: '#dc2626' }}>{fmtN(totalChi)} {unitLbl}</span>
                  </div>
                  <table className="bc-tbl">
                    <thead>
                      <tr>
                        <th className="bc-th" style={{ width: 28 }}>#</th>
                        <th className="bc-th" style={{ textAlign: 'left' }}>NHÓM CHI PHÍ / ĐƠN VỊ</th>
                        <th className="bc-th" style={{ width: 170 }}>SỐ TIỀN ({unitLbl})</th>
                        <th className="bc-th" style={{ width: 72 }}>TỶ TRỌNG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chiGroups.flatMap((g, i) => [
                        <tr key={`cg-${g.nhom}`} className="bc-grp" onClick={() => toggleChi(g.nhom)}>
                          <td style={{ color: '#C4CACF', fontSize: 11, fontWeight: 700 }}>{i + 1}</td>
                          <td>
                            <span style={{ marginRight: 7, fontSize: 9, opacity: .7 }}>{chiExp.has(g.nhom) ? '▼' : '▶'}</span>
                            {g.nhom}
                          </td>
                          <td className="r" style={{ color: '#dc2626' }}>{fmtN(g.total)}</td>
                          <td className="r" style={{ color: '#6b7280', fontSize: 11 }}>
                            {totalChi > 0 ? (g.total / totalChi * 100).toFixed(1) + '%' : '—'}
                          </td>
                        </tr>,
                        ...(chiExp.has(g.nhom) ? g.items.map(item => (
                          <tr key={`cs-${g.nhom}-${item.label}`} className="bc-sub">
                            <td />
                            <td style={{ paddingLeft: 36 }}>└ {item.label}</td>
                            <td className="r" style={{ color: '#4B6A8A' }}>{fmtN(item.amt)}</td>
                            <td className="r" style={{ color: '#9ca3af', fontSize: 10 }}>
                              {g.total > 0 ? (item.amt / g.total * 100).toFixed(1) + '%' : '—'}
                            </td>
                          </tr>
                        )) : []),
                      ])}
                      <tr className="bc-foot">
                        <td colSpan={2} style={{ letterSpacing: '.05em' }}>TỔNG CHI</td>
                        <td className="r">{fmtN(totalChi)}</td>
                        <td className="r">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* III. Summary */}
                <div className="bc-sbox">
                  <div className="bc-sbox-hdr">III. TÓM TẮT KỲ THÁNG {selMonth}/{selYear}</div>
                  <div className="bc-srow hlite">
                    <span className="bc-srow-lbl">Số dư đầu kỳ &nbsp;(01/{String(selMonth).padStart(2,'0')}/{selYear})</span>
                    <span className="bc-srow-val" style={{ color: '#1C3557' }}>{fmtN(selOpenBal)} {unitLbl}</span>
                  </div>
                  <div className="bc-srow pos">
                    <span className="bc-srow-lbl">(+) Tổng thu trong kỳ</span>
                    <span className="bc-srow-val" style={{ color: '#15803d' }}>{fmtN(totalThu)} {unitLbl}</span>
                  </div>
                  <div className="bc-srow neg-bg">
                    <span className="bc-srow-lbl">(−) Tổng chi trong kỳ</span>
                    <span className="bc-srow-val" style={{ color: '#dc2626' }}>{fmtN(totalChi)} {unitLbl}</span>
                  </div>
                  <div className={`bc-srow${rong >= 0 ? ' pos' : ' neg-bg'}`}>
                    <span className="bc-srow-lbl">(=) Dòng tiền ròng trong kỳ</span>
                    <span className="bc-srow-val" style={{ color: clr(rong) }}>{fmtP(rong)} {unitLbl}</span>
                  </div>
                  <div className="bc-srow grand">
                    <span className="bc-srow-lbl" style={{ fontWeight: 700, fontSize: 14 }}>Số dư cuối kỳ</span>
                    <span className="bc-srow-val" style={{ color: '#1C3557', fontSize: 16 }}>{fmtN(selCloseBal)} {unitLbl}</span>
                  </div>
                </div>

                {/* Signatures */}
                <div className="bc-sigs">
                  {(['KẾ TOÁN TRƯỞNG', 'GIÁM ĐỐC TÀI CHÍNH (CFO)', 'TỔNG GIÁM ĐỐC (CEO)'] as const).map(t => (
                    <div key={t}>
                      <div className="bc-sig-title">{t}</div>
                      <div className="bc-sig-line">Ký tên, đóng dấu</div>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}

          {/* ══════════ ANNUAL MODE ══════════ */}
          {mode === 'annual' && (() => {
            const { monthRows, yearOpen, chiSuperGroups, thuNhomRows, totalThu, totalChi } = annualData
            const rong = totalThu - totalChi

            if (monthRows.length === 0) return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 13 }}>
                Không có dữ liệu năm {selYear}
              </div>
            )

            const thuSectionNum = chiSuperGroups.length > 0 && thuNhomRows.length > 1 ? 'III' : null
            const growthNum     = thuSectionNum ? 'IV' : 'III'

            return (
              <>
                {/* I. Monthly summary */}
                <div className="bc-sec">
                  <div className="bc-stitle">
                    <span className="bc-stitle-lbl">I. TỔNG HỢP DÒNG TIỀN THEO THÁNG</span>
                  </div>
                  <AutoFit deps={[annualData, unit]}>
                    <table className="bc-ann">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', minWidth: 170 }}>CHỈ TIÊU</th>
                          {monthRows.map(m => <th key={m.mm}>{mmLbl(m.mm)}</th>)}
                          <th style={{ background: '#0D1F33' }}>TỔNG / CK</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ color: '#4B6A8A' }}>Số dư đầu kỳ</td>
                          {monthRows.map((m, i) => (
                            <td key={m.mm} style={{ color: '#1C3557' }}>
                              {fmtN(i === 0 ? yearOpen : monthRows[i - 1].cuoiky)}
                            </td>
                          ))}
                          <td style={{ color: '#1C3557' }}>{fmtN(yearOpen)}</td>
                        </tr>
                        <tr className="sum-row">
                          <td style={{ color: '#15803d' }}>↑ Tổng thu</td>
                          {monthRows.map(m => <td key={m.mm} style={{ color: '#15803d' }}>{fmtN(m.thu)}</td>)}
                          <td style={{ color: '#15803d' }}>{fmtN(totalThu)}</td>
                        </tr>
                        <tr className="sum-row">
                          <td style={{ color: '#dc2626' }}>↓ Tổng chi</td>
                          {monthRows.map(m => <td key={m.mm} style={{ color: '#dc2626' }}>{fmtN(m.chi)}</td>)}
                          <td style={{ color: '#dc2626' }}>{fmtN(totalChi)}</td>
                        </tr>
                        <tr className="sum-row">
                          <td style={{ color: clr(rong) }}>↔ Ròng</td>
                          {monthRows.map(m => <td key={m.mm} style={{ color: clr(m.rong), fontWeight: 700 }}>{fmtP(m.rong)}</td>)}
                          <td style={{ color: clr(rong), fontWeight: 800 }}>{fmtP(rong)}</td>
                        </tr>
                        <tr className="sum-row">
                          <td style={{ fontWeight: 700, color: '#1C3557' }}>Số dư cuối kỳ</td>
                          {monthRows.map(m => <td key={m.mm} style={{ color: '#1C3557', fontWeight: 700 }}>{fmtN(m.cuoiky)}</td>)}
                          <td style={{ color: '#1C3557', fontWeight: 800 }}>
                            {fmtN(monthRows[monthRows.length - 1].cuoiky)}
                          </td>
                        </tr>
                        <tr className="gr-row">
                          <td style={{ fontStyle: 'italic' }}>Burn rate (%)</td>
                          {monthRows.map(m => {
                            const br = m.thu > 0 ? m.chi / m.thu * 100 : null
                            return (
                              <td key={m.mm} style={{ color: br === null ? '#9ca3af' : br > 100 ? '#dc2626' : br > 80 ? '#f59e0b' : '#15803d', fontSize: 10 }}>
                                {br === null ? '—' : br.toFixed(0) + '%'}
                              </td>
                            )
                          })}
                          <td style={{ color: totalThu > 0 && totalChi / totalThu > 1 ? '#dc2626' : '#15803d', fontSize: 10 }}>
                            {totalThu > 0 ? (totalChi / totalThu * 100).toFixed(1) + '%' : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </AutoFit>
                </div>

                {/* II. Chi by super-group (expandable) */}
                {chiSuperGroups.length > 0 && (
                  <div className="bc-sec pagebreak">
                    <div className="bc-stitle">
                      <span className="bc-stitle-lbl">II. CƠ CẤU CHI THEO NHÓM</span>
                      <span className="bc-stitle-val" style={{ color: '#dc2626' }}>{fmtN(totalChi)} {unitLbl}</span>
                    </div>
                    <AutoFit deps={[annualData, unit]}>
                      <table className="bc-ann">
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', minWidth: 180 }}>NHÓM CHI PHÍ</th>
                            {monthRows.map(m => <th key={m.mm}>{mmLbl(m.mm)}</th>)}
                            <th>TỔNG</th>
                            <th style={{ minWidth: 52 }}>TỶ LỆ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chiSuperGroups.flatMap(sg => [
                            <tr key={`sg-${sg.key}`} className="ann-sg-row" onClick={() => toggleAnnChi(sg.key)}>
                              <td>{annChiExp.has(sg.key) ? '▾' : '▸'} {sg.label}</td>
                              {monthRows.map(m => {
                                const v = sg.mmMap.get(m.mm) ?? 0
                                return <td key={m.mm} style={{ color: v ? '#dc2626' : '#D1D5DB' }}>{v ? fmtN(v) : '—'}</td>
                              })}
                              <td style={{ color: '#dc2626', fontWeight: 700 }}>{fmtN(sg.total)}</td>
                              <td style={{ color: '#6b7280' }}>
                                {totalChi > 0 ? (sg.total / totalChi * 100).toFixed(1) + '%' : '—'}
                              </td>
                            </tr>,
                            ...(annChiExp.has(sg.key) ? sg.items.map(g => (
                              <tr key={`si-${sg.key}-${g.nhom}`} className="nhom-row ann-detail-row">
                                <td>{g.nhom}</td>
                                {monthRows.map(m => {
                                  const v = g.mmMap.get(m.mm) ?? 0
                                  return <td key={m.mm} style={{ color: v ? '#dc2626' : '#D1D5DB', fontSize: 11 }}>{v ? fmtN(v) : '—'}</td>
                                })}
                                <td style={{ color: '#dc2626' }}>{fmtN(g.total)}</td>
                                <td style={{ color: '#6b7280' }}>
                                  {sg.total > 0 ? (g.total / sg.total * 100).toFixed(1) + '%' : '—'}
                                </td>
                              </tr>
                            )) : []),
                          ])}
                          <tr className="foot-row">
                            <td>TỔNG CHI</td>
                            {monthRows.map(m => {
                              const c = chiSuperGroups.reduce((s, sg) => s + (sg.mmMap.get(m.mm) ?? 0), 0)
                              return <td key={m.mm}>{fmtN(c)}</td>
                            })}
                            <td>{fmtN(totalChi)}</td>
                            <td>100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </AutoFit>
                  </div>
                )}

                {/* III. Thu by nhom (only if multiple groups) */}
                {thuNhomRows.length > 1 && (
                  <div className="bc-sec">
                    <div className="bc-stitle">
                      <span className="bc-stitle-lbl">{thuSectionNum ?? 'II'}. CƠ CẤU THU THEO NHÓM</span>
                      <span className="bc-stitle-val" style={{ color: '#15803d' }}>{fmtN(totalThu)} {unitLbl}</span>
                    </div>
                    <AutoFit deps={[annualData, unit]}>
                      <table className="bc-ann">
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', minWidth: 180 }}>NHÓM THU</th>
                            {monthRows.map(m => <th key={m.mm}>{mmLbl(m.mm)}</th>)}
                            <th>TỔNG</th>
                            <th style={{ minWidth: 52 }}>TỶ LỆ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {thuNhomRows.flatMap(g => [
                            <tr key={`tg-${g.nhom}`} className="ann-sg-row" onClick={() => toggleAnnThu(g.nhom)}>
                              <td>{annThuExp.has(g.nhom) ? '▾' : '▸'} {g.nhom}</td>
                              {monthRows.map(m => {
                                const v = g.mmMap.get(m.mm) ?? 0
                                return <td key={m.mm} style={{ color: v ? '#15803d' : '#D1D5DB' }}>{v ? fmtN(v) : '—'}</td>
                              })}
                              <td style={{ color: '#15803d', fontWeight: 700 }}>{fmtN(g.total)}</td>
                              <td style={{ color: '#6b7280' }}>
                                {totalThu > 0 ? (g.total / totalThu * 100).toFixed(1) + '%' : '—'}
                              </td>
                            </tr>,
                            ...(annThuExp.has(g.nhom) ? g.items.map(item => (
                              <tr key={`ti-${g.nhom}-${item.nhom}`} className="nhom-row ann-detail-row">
                                <td>{item.nhom}</td>
                                {monthRows.map(m => {
                                  const v = item.mmMap.get(m.mm) ?? 0
                                  return <td key={m.mm} style={{ color: v ? '#15803d' : '#D1D5DB', fontSize: 11 }}>{v ? fmtN(v) : '—'}</td>
                                })}
                                <td style={{ color: '#15803d' }}>{fmtN(item.total)}</td>
                                <td style={{ color: '#6b7280' }}>
                                  {g.total > 0 ? (item.total / g.total * 100).toFixed(1) + '%' : '—'}
                                </td>
                              </tr>
                            )) : []),
                          ])}
                          <tr className="foot-row">
                            <td>TỔNG THU</td>
                            {monthRows.map(m => {
                              const c = thuNhomRows.reduce((s, g) => s + (g.mmMap.get(m.mm) ?? 0), 0)
                              return <td key={m.mm}>{fmtN(c)}</td>
                            })}
                            <td>{fmtN(totalThu)}</td>
                            <td>100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </AutoFit>
                  </div>
                )}

                {/* Growth / MoM */}
                {monthRows.length >= 2 && (
                  <div className="bc-sec">
                    <div className="bc-stitle">
                      <span className="bc-stitle-lbl">{growthNum}. CHỈ SỐ BIẾN ĐỘNG THEO THÁNG (so tháng trước)</span>
                    </div>
                    <AutoFit deps={[annualData, unit]}>
                      <table className="bc-gtbl">
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', minWidth: 200 }}>CHỈ SỐ</th>
                            {monthRows.slice(1).map(m => <th key={m.mm}>{mmLbl(m.mm)}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            {
                              label: '▲ Tăng trưởng Thu',
                              vals: monthRows.slice(1).map((m, i) => {
                                const prev = monthRows[i].thu
                                return prev > 0 ? (m.thu - prev) / prev * 100 : null
                              }),
                              posGood: true,
                            },
                            {
                              label: '▼ Tăng trưởng Chi',
                              vals: monthRows.slice(1).map((m, i) => {
                                const prev = monthRows[i].chi
                                return prev > 0 ? (m.chi - prev) / prev * 100 : null
                              }),
                              posGood: false,
                            },
                            {
                              label: '🔥 Burn rate',
                              vals: monthRows.slice(1).map(m => m.thu > 0 ? m.chi / m.thu * 100 : null),
                              isBr: true,
                            },
                            {
                              label: '💰 Số dư cuối kỳ (%)',
                              vals: monthRows.slice(1).map((m, i) => {
                                const prev = monthRows[i].cuoiky
                                return prev > 0 ? (m.cuoiky - prev) / prev * 100 : null
                              }),
                              posGood: true,
                            },
                          ].map(row => (
                            <tr key={row.label}>
                              <td>{row.label}</td>
                              {row.vals.map((v, i) => {
                                const mm = monthRows[i + 1].mm
                                if (v === null) return <td key={mm} style={{ color: '#9ca3af' }}>—</td>
                                const isBr = 'isBr' in row && row.isBr
                                const posGood = 'posGood' in row ? row.posGood : false
                                const good = isBr ? v < 80 : (posGood ? v >= 0 : v <= 0)
                                const warn = isBr ? (v >= 80 && v < 100) : false
                                const bad  = isBr ? v >= 100 : (posGood ? v < 0 : v > 0)
                                const c    = bad ? '#dc2626' : warn ? '#f59e0b' : good ? '#15803d' : '#374151'
                                return (
                                  <td key={mm} style={{ color: c }}>
                                    {isBr ? v.toFixed(1) + '%' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AutoFit>
                  </div>
                )}

                {/* Signatures */}
                <div className="bc-sigs">
                  {(['KẾ TOÁN TRƯỞNG', 'GIÁM ĐỐC TÀI CHÍNH (CFO)', 'TỔNG GIÁM ĐỐC (CEO)'] as const).map(t => (
                    <div key={t}>
                      <div className="bc-sig-title">{t}</div>
                      <div className="bc-sig-line">Ký tên, đóng dấu</div>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}

        </div>
      </main>
    </>
  )
}
