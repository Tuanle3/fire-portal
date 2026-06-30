'use client'
import { useEffect, useState, useMemo } from 'react'
import { getDb } from '@/lib/firebase'
import { ref, get } from 'firebase/database'
import { useDashUnit } from '@/contexts/dash-unit'

type TSRow = Record<string, unknown>

function n(v: unknown): number { const x = Number(v); return isNaN(x) ? 0 : x }
function fmtN(v: number): string { return v.toLocaleString('vi-VN') }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArr(snap: any): TSRow[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v]) => (typeof v === 'object' && v !== null ? v as TSRow : {}))
  return []
}

// Try field name with spaces AND with underscores (Firebase may store either way)
function f(row: TSRow, name: string): unknown {
  return row[name] ?? row[name.replace(/ /g, '_')]
}

const TT_TABS = [
  { key: 'all',   label: 'Tất cả' },
  { key: 'tc',    label: 'Đã thế chấp' },
  { key: 'chua',  label: 'Chưa thế chấp' },
  { key: 'ngoai', label: 'Vay ngoài' },
]

function matchTT(row: TSRow, key: string): boolean {
  const tt = String(f(row, 'Tình trạng') ?? '').toLowerCase()
  if (key === 'all')   return true
  if (key === 'tc')    return tt === 'đã thế chấp'
  if (key === 'chua')  return tt === 'chưa thế chấp'
  if (key === 'ngoai') return tt.includes('ngoài') || tt.includes('ngoai')
  return true
}

function getBadge(row: TSRow) {
  const tt = String(f(row, 'Tình trạng') ?? '').toLowerCase()
  if (tt === 'đã thế chấp')                       return { label: 'Đã thế chấp', cls: 'bdg-tc' }
  if (tt === 'chưa thế chấp')                     return { label: 'Chưa vay',    cls: 'bdg-chua' }
  if (tt.includes('dài hạn'))                      return { label: 'Dài hạn',     cls: 'bdg-dh' }
  if (tt.includes('ngoài') || tt.includes('ngoai')) return { label: 'Vay ngoài',  cls: 'bdg-ng' }
  const raw = String(f(row, 'Tình trạng') ?? '–')
  return { label: raw, cls: 'bdg-chua' }
}

function ltvCls(ltv: number | null): string {
  if (ltv === null || ltv <= 0) return 'ltv-zero'
  if (ltv <= 0.7)  return 'ltv-ok'
  if (ltv <= 0.9)  return 'ltv-warn'
  return 'ltv-danger'
}

const PAGE = 15

export default function AssetsPage() {
  const { unit } = useDashUnit()
  const divisor  = unit === 'tỷ' ? 1_000_000_000 : unit === 'tr' ? 1_000_000 : 1
  const fracs    = unit === 'tỷ' ? 3 : unit === 'tr' ? 1 : 0
  const unitLbl  = unit === 'đ' ? 'đ' : `${unit} đ`
  const fmtU     = (v: number) => (v / divisor).toLocaleString('vi-VN', { maximumFractionDigits: fracs })

  const [data,      setData]      = useState<TSRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [ttTab,     setTtTab]     = useState('all')
  const [search,    setSearch]    = useState('')
  const [filterNH,  setFilterNH]  = useState('all')
  const [filterChu, setFilterChu] = useState('all')
  const [filterHT,  setFilterHT]  = useState('all')
  const [page,      setPage]      = useState(1)

  useEffect(() => {
    get(ref(getDb(), 'data_ts'))
      .then(snap => setData(toArr(snap)))
      .catch(e => setError(e instanceof Error ? e.message : 'Lỗi Firebase'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setPage(1) }, [ttTab, search, filterNH, filterChu, filterHT])

  const nhOpts  = useMemo(() => ['all', ...[...new Set(data.map(r => String(f(r,'Ngân hàng vay') ?? '')).filter(Boolean))].sort()], [data])
  const chuOpts = useMemo(() => ['all', ...[...new Set(data.map(r => String(f(r,'Chủ tài sản')   ?? '')).filter(Boolean))].sort()], [data])
  const htOpts  = useMemo(() => ['all', ...[...new Set(data.map(r => String(f(r,'Hình thức vay') ?? '')).filter(Boolean))].sort()], [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(r => {
      if (!matchTT(r, ttTab)) return false
      if (filterNH  !== 'all' && String(f(r,'Ngân hàng vay') ?? '') !== filterNH)  return false
      if (filterChu !== 'all' && String(f(r,'Chủ tài sản')   ?? '') !== filterChu) return false
      if (filterHT  !== 'all' && String(f(r,'Hình thức vay') ?? '') !== filterHT)  return false
      if (q) {
        const hay = [f(r,'TS thế chấp'), f(r,'Số sổ'), f(r,'Thửa'), f(r,'Chủ tài sản'), f(r,'Ngân hàng vay')].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, ttTab, search, filterNH, filterChu, filterHT])

  const kpi = useMemo(() => {
    const tcRows   = data.filter(r => matchTT(r, 'tc'))
    const chuaRows = data.filter(r => matchTT(r, 'chua'))
    const totalDuNo    = data.reduce((s, r) => s + n(f(r,'Dư nợ phân bổ theo TSĐB')), 0)
    const totalDinhGia = data.reduce((s, r) => s + n(f(r,'Định giá')), 0)
    const hanMucTC     = tcRows.reduce((s, r) => s + n(f(r,'Hạn mức cho vay')), 0)
    const duNoTC       = tcRows.reduce((s, r) => s + n(f(r,'Dư nợ phân bổ theo TSĐB')), 0)
    const chuaDinhGia  = chuaRows.reduce((s, r) => s + n(f(r,'Định giá')), 0)
    const khadung      = chuaRows.reduce((s, r) => s + n(f(r,'Hạn mức cho vay')), 0)
    const ltv = totalDinhGia > 0 ? totalDuNo / totalDinhGia : 0
    return { totalDuNo, totalDinhGia, hanMucTC, duNoTC, chuaCount: chuaRows.length, chuaDinhGia, khadung, ltv }
  }, [data])

  const tabCounts = useMemo(() => ({
    all:   data.length,
    tc:    data.filter(r => matchTT(r,'tc')).length,
    chua:  data.filter(r => matchTT(r,'chua')).length,
    ngoai: data.filter(r => matchTT(r,'ngoai')).length,
  }), [data])

  const totals = useMemo(() => ({
    dinhGia: filtered.reduce((s, r) => s + n(f(r,'Định giá')), 0),
    hanMuc:  filtered.reduce((s, r) => s + n(f(r,'Hạn mức cho vay')), 0),
    duNo:    filtered.reduce((s, r) => s + n(f(r,'Dư nợ phân bổ theo TSĐB')), 0),
    room:    filtered.reduce((s, r) => s + (n(f(r,'Hạn mức cho vay')) - n(f(r,'Dư nợ phân bổ theo TSĐB'))), 0),
  }), [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const pageRows   = filtered.slice((page - 1) * PAGE, page * PAGE)

  return (
    <>
      <style>{`
        .ts-wrap{display:flex;flex-direction:column;flex:1;overflow:hidden;background:#FAF8F3;}
        .ts-top{padding:16px 24px 0;flex-shrink:0;}
        .ts-title{font-size:17px;font-weight:700;color:#1F2430;margin-bottom:14px;}

        /* KPI cards */
        .ts-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}
        .ts-k{background:#fff;border:1px solid #E5E0D8;border-radius:10px;padding:14px 18px;}
        .ts-k-lbl{font-size:9.5px;font-weight:700;letter-spacing:.07em;color:#6B7280;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px;}
        .ts-k-dot{width:7px;height:7px;border-radius:50%;}
        .ts-k-val{font-size:18px;font-weight:800;font-family:'Roboto Mono',monospace;line-height:1.2;}
        .ts-k-sub{font-size:10.5px;color:#6B7280;margin-top:5px;line-height:1.5;}
        .ts-k-tag{display:inline-flex;align-items:center;gap:4px;background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;border-radius:5px;padding:1px 7px;font-size:10px;font-weight:700;margin-top:3px;}

        /* Status tabs + filters */
        .ts-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
        .ts-tabs{display:flex;gap:0;border:1px solid #E5E0D8;border-radius:8px;overflow:hidden;flex-shrink:0;}
        .ts-tab{padding:6px 13px;font-size:11px;font-weight:600;color:#6B7280;background:#fff;border:none;cursor:pointer;white-space:nowrap;transition:all .15s;}
        .ts-tab.on{background:#1C3557;color:#fff;}
        .ts-tab:hover:not(.on){background:#EEF3FA;color:#1C3557;}
        .ts-search{height:32px;padding:0 10px;border:1px solid #D0CCC4;border-radius:7px;font-size:11.5px;font-family:inherit;outline:none;color:#374151;min-width:180px;}
        .ts-sel{height:32px;padding:0 8px;border:1px solid #D0CCC4;border-radius:7px;font-size:11px;font-family:inherit;outline:none;color:#374151;background:#fff;cursor:pointer;}

        /* Table */
        .ts-tbl-wrap{flex:1;overflow:auto;}
        .ts-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 14px 6px;flex-shrink:0;}
        .ts-hdr-lbl{font-size:10px;font-weight:700;letter-spacing:.06em;color:#1C3557;text-transform:uppercase;}
        .ts-hdr-count{font-size:10.5px;color:#9CA3AF;}
        table.tst{width:100%;border-collapse:collapse;font-size:12px;}
        table.tst thead tr{background:#1C3557;}
        table.tst th{padding:8px 10px;text-align:left;font-size:9.5px;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.05em;text-transform:uppercase;position:sticky;top:0;z-index:2;background:#1C3557;white-space:nowrap;}
        table.tst th.r{text-align:right;}
        table.tst td{padding:9px 10px;border-bottom:1px solid #F3F4F6;color:#374151;white-space:nowrap;vertical-align:middle;}
        table.tst td.r{text-align:right;font-family:'Roboto Mono',monospace;font-size:11px;}
        table.tst tr:hover td{background:#F9FAFB;}
        table.tst tr.tot td{background:#F4F7FB;font-weight:700;border-top:2px solid #E5E0D8;color:#1C3557;}
        .ts-name{font-weight:600;color:#1F2430;font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;}
        .ts-idx{color:#9CA3AF;font-size:11px;text-align:center;}

        /* Badges */
        .bdg{display:inline-flex;align-items:center;border-radius:20px;padding:2px 8px;font-size:9.5px;font-weight:700;border:1px solid;white-space:nowrap;margin-top:3px;}
        .bdg-tc{background:#EAF6EE;color:#1F6B3D;border-color:#3C9A5F;}
        .bdg-chua{background:#FEF3CD;color:#92600A;border-color:#F59E0B;}
        .bdg-dh{background:#EEF3FA;color:#1C3557;border-color:#93B4D8;}
        .bdg-ng{background:#FEE2E2;color:#DC2626;border-color:#FCA5A5;}

        /* LTV chips */
        .ltv-chip{display:inline-block;padding:2px 7px;border-radius:5px;font-size:10.5px;font-weight:700;font-family:'Roboto Mono',monospace;}
        .ltv-ok{background:#EAF6EE;color:#15803D;}
        .ltv-warn{background:#FEF9C3;color:#8A5A12;}
        .ltv-danger{background:#FEE2E2;color:#DC2626;}
        .ltv-zero{background:#F3F4F6;color:#9CA3AF;}

        /* Pagination */
        .ts-foot{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-top:1px solid #E5E0D8;font-size:11px;color:#6B7280;flex-shrink:0;background:#fff;}
        .pag{display:flex;align-items:center;gap:3px;}
        .pb{height:26px;padding:0 8px;border:1px solid #E5E0D8;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#374151;}
        .pb:hover:not(:disabled){border-color:#1C3557;color:#1C3557;}
        .pb:disabled{opacity:.35;cursor:default;}
        .pc{height:26px;padding:0 10px;background:#1C3557;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;}

        .spin{display:flex;align-items:center;justify-content:center;flex:1;color:#6B7280;font-size:13px;gap:8px;}
        .err{background:#FDECEC;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;color:#8C1F1F;font-size:12px;margin:0 24px 12px;}
        @media(max-width:1024px){.ts-kpi{grid-template-columns:1fr 1fr}}
        @media(max-width:600px){.ts-top{padding:12px 12px 0}.ts-kpi{grid-template-columns:1fr 1fr}}
      `}</style>

      <div className="ts-wrap">
        <div className="ts-top">
          {/* KPI cards */}
          <div className="ts-kpi">
            {/* Tổng dư nợ */}
            <div className="ts-k" style={{ borderTop:'3px solid #DC2626' }}>
              <div className="ts-k-lbl"><span className="ts-k-dot" style={{ background:'#DC2626' }}/>TỔNG DƯ NỢ HIỆN TẠI</div>
              <div className="ts-k-val" style={{ color:'#8C1F1F' }}>{fmtU(kpi.totalDuNo)}<span style={{ fontSize:12, marginLeft:2 }}>{unitLbl}</span></div>
              <div className="ts-k-sub">{data.length} tài sản đảm bảo</div>
            </div>

            {/* Hạn mức NH ngắn hạn */}
            <div className="ts-k" style={{ borderTop:'3px solid #2563EB' }}>
              <div className="ts-k-lbl"><span className="ts-k-dot" style={{ background:'#2563EB' }}/>HẠN MỨC NH NGẮN HẠN</div>
              <div className="ts-k-val" style={{ color:'#1C3557' }}>{fmtU(kpi.hanMucTC)}<span style={{ fontSize:12, marginLeft:2 }}>{unitLbl}</span></div>
              <div className="ts-k-sub">Đã dùng <span style={{ fontWeight:700, color:'#374151' }}>{fmtU(kpi.duNoTC)}</span> {unitLbl}</div>
            </div>

            {/* Tài sản chưa thế chấp */}
            <div className="ts-k" style={{ borderTop:'3px solid #16A34A' }}>
              <div className="ts-k-lbl"><span className="ts-k-dot" style={{ background:'#16A34A' }}/>TÀI SẢN CHƯA THẾ CHẤP</div>
              <div className="ts-k-val" style={{ color:'#15803D', fontSize:28 }}>{kpi.chuaCount} <span style={{ fontSize:14, fontWeight:600 }}>tài sản</span></div>
              <div className="ts-k-sub">Định giá <span style={{ fontWeight:700 }}>{fmtU(kpi.chuaDinhGia)}</span> {unitLbl}</div>
              <div className="ts-k-tag">Khả dụng: {fmtU(kpi.khadung)} {unitLbl}</div>
            </div>

            {/* LTV bình quân */}
            <div className="ts-k" style={{ borderTop:'3px solid #D4A64A' }}>
              <div className="ts-k-lbl"><span className="ts-k-dot" style={{ background:'#D4A64A' }}/>LTV BÌNH QUÂN</div>
              <div className="ts-k-val" style={{ color: kpi.ltv > 0.9 ? '#DC2626' : kpi.ltv > 0.7 ? '#8A5A12' : '#15803D', fontSize:26 }}>
                {(kpi.ltv * 100).toFixed(1)}%
              </div>
              <div className="ts-k-sub">Dư nợ / định giá</div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="ts-bar">
            <div className="ts-tabs">
              {TT_TABS.map(t => (
                <button key={t.key} className={`ts-tab${ttTab === t.key ? ' on' : ''}`} onClick={() => setTtTab(t.key)}>
                  {t.label} ({tabCounts[t.key as keyof typeof tabCounts]})
                </button>
              ))}
            </div>
            <input className="ts-search" placeholder="Tên TS, số sổ, thửa..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="ts-sel" value={filterNH}  onChange={e => setFilterNH(e.target.value)}>
              {nhOpts.map(v  => <option key={v}  value={v}>{v === 'all' ? 'Tất cả ngân hàng' : v}</option>)}
            </select>
            <select className="ts-sel" value={filterChu} onChange={e => setFilterChu(e.target.value)}>
              {chuOpts.map(v => <option key={v}  value={v}>{v === 'all' ? 'Người đứng tên'   : v}</option>)}
            </select>
            <select className="ts-sel" value={filterHT}  onChange={e => setFilterHT(e.target.value)}>
              {htOpts.map(v  => <option key={v}  value={v}>{v === 'all' ? 'Hình thức'        : v}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="err">⚠ {error}</div>}

        {loading ? <div className="spin">⏳ Đang tải dữ liệu...</div> : (
          <>
            <div className="ts-hdr">
              <span className="ts-hdr-lbl">Danh sách tài sản đảm bảo</span>
              <span className="ts-hdr-count">{((page-1)*PAGE+1).toLocaleString('vi-VN')}–{Math.min(page*PAGE, filtered.length).toLocaleString('vi-VN')} / {filtered.length.toLocaleString('vi-VN')} tài sản</span>
            </div>

            <div className="ts-tbl-wrap">
              <table className="tst">
                <thead>
                  <tr>
                    <th style={{ width:32, textAlign:'center' }}>#</th>
                    <th style={{ minWidth:220 }}>TÊN TÀI SẢN</th>
                    <th style={{ minWidth:130 }}>CHỦ SỞ HỮU</th>
                    <th style={{ minWidth:110 }}>NGÂN HÀNG</th>
                    <th style={{ minWidth:110 }}>ĐẠI DIỆN</th>
                    <th className="r" style={{ minWidth:120 }}>ĐỊNH GIÁ (đ)</th>
                    <th className="r" style={{ minWidth:120 }}>HẠN MỨC (đ)</th>
                    <th className="r" style={{ minWidth:120 }}>DƯ NỢ (đ)</th>
                    <th className="r" style={{ minWidth:72  }}>LTV</th>
                    <th className="r" style={{ minWidth:120 }}>ROOM CÒN (đ)</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign:'center', padding:32, color:'#9CA3AF' }}>Không có dữ liệu phù hợp</td></tr>
                  ) : pageRows.map((r, i) => {
                    const bdg     = getBadge(r)
                    const duNo    = n(f(r,'Dư nợ phân bổ theo TSĐB'))
                    const hanMuc  = n(f(r,'Hạn mức cho vay'))
                    const dinhGia = n(f(r,'Định giá'))
                    const ltv     = dinhGia > 0 ? duNo / dinhGia : null
                    const room    = hanMuc - duNo
                    return (
                      <tr key={i}>
                        <td className="ts-idx">{(page-1)*PAGE + i + 1}</td>
                        <td>
                          <div className="ts-name">{String(f(r,'TS thế chấp') ?? '—')}</div>
                          <span className={`bdg ${bdg.cls}`}>{bdg.label}</span>
                        </td>
                        <td style={{ fontSize:11, color:'#374151' }}>{String(f(r,'Chủ tài sản') ?? '—')}</td>
                        <td style={{ fontSize:11 }}>
                          {String(f(r,'Ngân hàng vay') ?? '') || <span style={{ color:'#9CA3AF' }}>Chưa vay</span>}
                        </td>
                        <td style={{ fontSize:11, color:'#6B7280' }}>{String(f(r,'Đại diện vay') ?? '') || '—'}</td>
                        <td className="r">{dinhGia ? fmtU(dinhGia) : '—'}</td>
                        <td className="r">{hanMuc  ? fmtU(hanMuc)  : '—'}</td>
                        <td className="r" style={{ color: duNo > 0 ? '#8C1F1F' : '#9CA3AF' }}>{duNo ? fmtU(duNo) : '–'}</td>
                        <td className="r">
                          <span className={`ltv-chip ${ltvCls(ltv)}`}>
                            {ltv !== null ? (ltv * 100).toFixed(1) + '%' : '0.0%'}
                          </span>
                        </td>
                        <td className="r" style={{ color: room > 0 ? '#15803D' : '#9CA3AF', fontWeight: room > 0 ? 600 : 400 }}>
                          {fmtU(room)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  <tr className="tot">
                    <td colSpan={5} style={{ textAlign:'right', paddingRight:10, fontSize:11 }}>Tổng ({filtered.length} tài sản)</td>
                    <td className="r">{fmtU(totals.dinhGia)}</td>
                    <td className="r">{fmtU(totals.hanMuc)}</td>
                    <td className="r" style={{ color:'#8C1F1F' }}>{fmtU(totals.duNo)}</td>
                    <td className="r">
                      <span className={`ltv-chip ${ltvCls(totals.dinhGia > 0 ? totals.duNo / totals.dinhGia : null)}`}>
                        {totals.dinhGia > 0 ? (totals.duNo / totals.dinhGia * 100).toFixed(1) + '%' : '—'}
                      </span>
                    </td>
                    <td className="r" style={{ color:'#15803D' }}>{fmtU(totals.room)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="ts-foot">
              <span>Trang {page} / {totalPages} · {filtered.length.toLocaleString('vi-VN')} tài sản</span>
              <div className="pag">
                <button className="pb" disabled={page===1}          onClick={()=>setPage(1)}>«</button>
                <button className="pb" disabled={page===1}          onClick={()=>setPage(p=>p-1)}>‹</button>
                <span className="pc">{page} / {totalPages}</span>
                <button className="pb" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
                <button className="pb" disabled={page===totalPages} onClick={()=>setPage(totalPages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
