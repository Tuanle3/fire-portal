'use client'
import { useEffect, useState, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { ref, get } from 'firebase/database'

type Row = Record<string, unknown>

const fmtD = (v: unknown) => {
  const s = String(v ?? '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || '—'
}
const fmtN = (v: unknown) => {
  const n = Number(v)
  return isNaN(n) ? '—' : n.toLocaleString('vi-VN')
}
const fmtPS = (v: unknown) => {
  const n = Number(v)
  if (isNaN(n) || n === 0) return '—'
  return (n > 0 ? '+' : '') + n.toLocaleString('vi-VN')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArr(snap: any): Row[] {
  if (!snap.exists()) return []
  const val = snap.val()
  if (Array.isArray(val)) return val.filter(Boolean).map((v, i) => ({ ...v, _idx: i }))
  if (typeof val === 'object' && val !== null)
    return Object.entries(val).map(([, v], i) =>
      typeof v === 'object' && v !== null ? { _idx: i, ...(v as Row) } : {}
    )
  return []
}

// Sort giảm dần theo Ngày; cùng ngày thì row có _idx cao hơn (sau trong GG Sheets) lên trước
function sortDesc(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const d = String(b['Ngày'] ?? '').localeCompare(String(a['Ngày'] ?? ''))
    if (d !== 0) return d
    return Number(b['_idx'] ?? 0) - Number(a['_idx'] ?? 0)
  })
}

const PAGE = 100


export default function DataPage() {
  const [dataQuy, setDataQuy] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const today    = new Date().toISOString().slice(0, 10)
  const startOfYear = `${new Date().getFullYear()}-01-01`
  const [dateFrom, setDateFrom] = useState(startOfYear)
  const [dateTo,   setDateTo]   = useState(today)
  const [fBank,    setFBank]    = useState('Tất cả')
  const [fUnit,    setFUnit]    = useState('Tất cả')
  const [fType,    setFType]    = useState('Tất cả')
  const [fStk,       setFStk]       = useState('Tất cả')
  const [search,     setSearch]     = useState('')
  const [searchNhom, setSearchNhom] = useState('')
  const [page,       setPage]       = useState(1)

  useEffect(() => {
    async function load() {
      try {
        const sQ = await get(ref(db, 'data_quy'))
        setDataQuy(sortDesc(toArr(sQ)))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lỗi Firebase')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => { setPage(1) }, [dateFrom, dateTo, fBank, fUnit, fStk, fType, search, searchNhom])

  const raw = dataQuy

  // Options cho mỗi dropdown = data sau khi lọc bởi TẤT CẢ filter khác (trừ chính nó)
  const banks = useMemo(() => {
    const base = raw.filter(r => {
      const ngay = String(r['Ngày'] ?? '')
      if (dateFrom && ngay < dateFrom) return false
      if (dateTo   && ngay > dateTo)   return false
      if (fUnit !== 'Tất cả' && r['Đơn_vị']       !== fUnit)  return false
      if (fStk  !== 'Tất cả' && String(r['Số_tài_khoản'] ?? '') !== fStk)  return false
      if (fType !== 'Tất cả' && r['Ghi_chu']      !== fType)   return false
      if (search.trim()     && !String(r['Nội_dung'] ?? '').toLowerCase().includes(search.toLowerCase()))     return false
      if (searchNhom.trim() && !String(r['Nhóm_CP']  ?? '').toLowerCase().includes(searchNhom.toLowerCase())) return false
      return true
    })
    return ['Tất cả', ...Array.from(new Set(base.map(r => String(r['Ngân_hàng'] ?? '')).filter(Boolean)))]
  }, [raw, dateFrom, dateTo, fUnit, fStk, fType, search, searchNhom])

  const units = useMemo(() => {
    const base = raw.filter(r => {
      const ngay = String(r['Ngày'] ?? '')
      if (dateFrom && ngay < dateFrom) return false
      if (dateTo   && ngay > dateTo)   return false
      if (fBank !== 'Tất cả' && r['Ngân_hàng']    !== fBank) return false
      if (fStk  !== 'Tất cả' && String(r['Số_tài_khoản'] ?? '') !== fStk)  return false
      if (fType !== 'Tất cả' && r['Ghi_chu']      !== fType)  return false
      if (search.trim()     && !String(r['Nội_dung'] ?? '').toLowerCase().includes(search.toLowerCase()))     return false
      if (searchNhom.trim() && !String(r['Nhóm_CP']  ?? '').toLowerCase().includes(searchNhom.toLowerCase())) return false
      return true
    })
    return ['Tất cả', ...Array.from(new Set(base.map(r => String(r['Đơn_vị'] ?? '')).filter(Boolean)))]
  }, [raw, dateFrom, dateTo, fBank, fStk, fType, search, searchNhom])

  const stks = useMemo(() => {
    const base = raw.filter(r => {
      const ngay = String(r['Ngày'] ?? '')
      if (dateFrom && ngay < dateFrom) return false
      if (dateTo   && ngay > dateTo)   return false
      if (fUnit !== 'Tất cả' && r['Đơn_vị']  !== fUnit)  return false
      if (fBank !== 'Tất cả' && r['Ngân_hàng'] !== fBank) return false
      if (fType !== 'Tất cả' && r['Ghi_chu']   !== fType)  return false
      if (search.trim()     && !String(r['Nội_dung'] ?? '').toLowerCase().includes(search.toLowerCase()))     return false
      if (searchNhom.trim() && !String(r['Nhóm_CP']  ?? '').toLowerCase().includes(searchNhom.toLowerCase())) return false
      return true
    })
    return ['Tất cả', ...Array.from(new Set(base.map(r => String(r['Số_tài_khoản'] ?? '')).filter(Boolean)))]
  }, [raw, dateFrom, dateTo, fUnit, fBank, fType, search, searchNhom])

  // Auto-reset nếu giá trị đang chọn không còn trong options (cascading filter)
  useEffect(() => { if (fBank !== 'Tất cả' && !banks.includes(fBank)) setFBank('Tất cả') }, [banks, fBank])
  useEffect(() => { if (fUnit !== 'Tất cả' && !units.includes(fUnit)) setFUnit('Tất cả') }, [units, fUnit])
  useEffect(() => { if (fStk  !== 'Tất cả' && !stks.includes(fStk))  setFStk('Tất cả')  }, [stks,  fStk])

  const filtered = useMemo(() => raw.filter(r => {
    const ngay = String(r['Ngày'] ?? '')
    if (dateFrom && ngay < dateFrom) return false
    if (dateTo   && ngay > dateTo)   return false
    if (fBank !== 'Tất cả' && r['Ngân_hàng']    !== fBank) return false
    if (fUnit !== 'Tất cả' && r['Đơn_vị']       !== fUnit) return false
    if (fStk  !== 'Tất cả' && String(r['Số_tài_khoản'] ?? '') !== fStk) return false
    if (fType !== 'Tất cả' && r['Ghi_chu']       !== fType) return false
    if (search.trim()     && !String(r['Nội_dung'] ?? '').toLowerCase().includes(search.toLowerCase()))     return false
    if (searchNhom.trim() && !String(r['Nhóm_CP'] ?? '').toLowerCase().includes(searchNhom.toLowerCase())) return false
    return true
  }), [raw, dateFrom, dateTo, fBank, fUnit, fStk, fType, search, searchNhom])

  const kpi = useMemo(() => {
    let thu = 0, chi = 0
    filtered.forEach(r => {
      const ps   = Number(r['Số_tiền_PS'] ?? 0)
      const loai = String(r['Ghi_chu'] ?? '')
      if (loai === 'Thu' || ps > 0) thu += Math.abs(ps)
      else if (loai === 'Chi' || ps < 0) chi += Math.abs(ps)
    })
    return { thu, chi, rong: thu - chi }
  }, [filtered])

  // Số dư cuối kỳ = tổng Tồn mới nhất của từng STK tính đến dateTo
  // raw đã sort giảm dần → row đầu tiên của mỗi STK = giao dịch gần nhất
  const cuoiky = useMemo(() => {
    const cutoff = dateTo || new Date().toISOString().slice(0, 10)
    const seen = new Set<string>()
    let total = 0
    for (const r of raw) {
      const ngay = String(r['Ngày'] ?? '')
      if (ngay > cutoff) continue
      const stk = String(r['Số_tài_khoản'] ?? '')
      if (!stk || seen.has(stk)) continue
      seen.add(stk)
      total += Number(r['Tồn'] ?? 0)
    }
    return total
  }, [raw, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const rows       = filtered.slice((page - 1) * PAGE, page * PAGE)

  function reset() {
    setDateFrom(startOfYear); setDateTo(today); setFBank('Tất cả')
    setFUnit('Tất cả'); setFStk('Tất cả'); setFType('Tất cả'); setSearch(''); setSearchNhom('')
  }

  function exportCSV() {
    if (!filtered.length) return
    const hdrs = ['Ngày','Đơn_vị','Ngân_hàng','Số_tài_khoản','Nội_dung','Nhóm','Loại','Số_tiền_PS','Tồn']
    const lines = [
      hdrs.join(','),
      ...filtered.map(r => hdrs.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')),
    ]
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + lines.join('\n'))
    a.download = `nhat-ky_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <>
      <style>{`
        .jp{display:flex;flex-direction:column;flex:1;overflow:hidden;}
        .jp-top{padding:16px 24px 0;flex-shrink:0;}
        .jp-title{font-size:17px;font-weight:700;color:#1F2430;margin-bottom:12px;}

        .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;}
        .kpi-card{background:#fff;border:1px solid #E5E0D8;border-radius:10px;padding:14px 18px;}
        .kpi-label{font-size:10px;font-weight:700;letter-spacing:.08em;color:#6B7280;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:6px;}
        .kpi-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
        .kpi-val{font-size:19px;font-weight:800;font-family:'Roboto Mono',monospace;line-height:1.15;}
        .kpi-sub{font-size:10px;color:#9CA3AF;margin-top:4px;}

        .fil-act{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:6px 0 8px;}
        .th-lbl{font-size:9px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:3px;}
        .hfil{width:100%;height:23px;padding:0 5px;border:1px solid rgba(255,255,255,.22);border-radius:4px;font-size:10px;background:rgba(255,255,255,.1);color:#fff;outline:none;font-family:inherit;box-sizing:border-box;}
        .hfil+.hfil{margin-top:2px;}
        .hfil::placeholder{color:rgba(255,255,255,.35);}
        .hfil option{color:#374151;background:#fff;}
        .hfil:focus{border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.18);}
        .hfil[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:.45;cursor:pointer;}
        .btn-csv{height:34px;padding:0 14px;background:#1C3557;color:#fff;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0;}
        .btn-reset{height:34px;padding:0 12px;background:#fff;color:#374151;border:1px solid #D0CCC4;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0;}
        .btn-reset:hover{border-color:#1C3557;color:#1C3557;}

        .tab-bar{display:flex;gap:0;border-bottom:2px solid #E5E0D8;}
        .tab-btn{padding:7px 18px;font-size:12.5px;font-weight:600;background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;}

        .tbl-wrap{flex:1;overflow:auto;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        thead tr{background:#1C3557;}
        th{padding:7px 8px 6px;text-align:left;font-size:10px;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.06em;text-transform:uppercase;position:sticky;top:0;z-index:2;background:#1C3557;vertical-align:top;}
        th.r{text-align:right;}
        td{padding:8px 10px;border-bottom:1px solid #F3F4F6;white-space:nowrap;color:#374151;vertical-align:middle;}
        td.r{text-align:right;font-family:'Roboto Mono',monospace;font-size:11.5px;}
        td.nd{max-width:320px;overflow:hidden;text-overflow:ellipsis;}
        tr:hover td{background:#F9FAFB;}
        .idx{color:#9CA3AF;font-size:11px;text-align:center;}
        .ps-pos{color:#1F6B3D;font-weight:700;}
        .ps-neg{color:#8C1F1F;font-weight:700;}
        .badge{display:inline-flex;align-items:center;border-radius:20px;padding:2px 9px;font-size:10px;font-weight:700;border:1px solid;}
        .b-thu{background:#EAF6EE;color:#1F6B3D;border-color:#3C9A5F;}
        .b-chi{background:#FDECEC;color:#8C1F1F;border-color:#D64545;}

        .tbl-foot{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-top:1px solid #E5E0D8;font-size:11px;color:#6B7280;flex-shrink:0;background:#fff;flex-wrap:wrap;gap:6px;}
        .pag{display:flex;align-items:center;gap:3px;}
        .pb{height:26px;padding:0 8px;border:1px solid #E5E0D8;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#374151;}
        .pb:hover:not(:disabled){border-color:#1C3557;color:#1C3557;}
        .pb:disabled{opacity:.35;cursor:default;}
        .pc{height:26px;padding:0 10px;background:#1C3557;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;}

        .err{background:#FDECEC;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;color:#8C1F1F;font-size:12px;margin:0 24px 12px;}
        .spin{display:flex;align-items:center;justify-content:center;flex:1;color:#6B7280;font-size:13px;gap:8px;}

        @media(max-width:1024px){.kpi-row{grid-template-columns:repeat(2,1fr)}.kpi-val{font-size:16px}}
        @media(max-width:600px){.jp-top{padding:12px 12px 0}.kpi-row{grid-template-columns:1fr 1fr}}
      `}</style>

      <div className="jp">
        <div className="jp-top">
          <div className="jp-title">Nhật ký dòng tiền</div>

          {/* KPI */}
          <div className="kpi-row">
            {[
              { label:'TỔNG THU',       dot:'#22C55E', val: fmtN(kpi.thu)+'đ',    color:'#1F6B3D', sub: filtered.filter(r=>r['Ghi_chu']==='Thu').length+' giao dịch' },
              { label:'TỔNG CHI',       dot:'#EF4444', val: fmtN(kpi.chi)+'đ',    color:'#8C1F1F', sub: filtered.filter(r=>r['Ghi_chu']==='Chi').length+' giao dịch' },
              { label:'RÒNG',           dot: kpi.rong>=0?'#22C55E':'#EF4444', val: fmtPS(kpi.rong)+'đ', color: kpi.rong>=0?'#1F6B3D':'#8C1F1F', sub: kpi.rong>=0?'▲ Thặng dư':'▼ Thâm hụt' },
              { label:'SỐ DƯ CUỐI KỲ', dot:'#D4A64A', val: fmtN(cuoiky)+'đ', color:'#1C3557', sub: 'Tại '+fmtD(dateTo || new Date().toISOString().slice(0,10)) },
            ].map(k => (
              <div className="kpi-card" key={k.label}>
                <div className="kpi-label"><span className="kpi-dot" style={{background:k.dot}}/>{k.label}</div>
                <div className="kpi-val" style={{color:k.color}}>{k.val}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Actions + date filter */}
          <div className="fil-act">
            <span style={{fontSize:11,color:'#6B7280',whiteSpace:'nowrap'}}>Từ ngày</span>
            <input className="fil-inp" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{height:30,padding:'0 8px',border:'1px solid #D0CCC4',borderRadius:6,fontSize:11,fontFamily:'inherit',outline:'none',color:'#374151'}}/>
            <span style={{fontSize:11,color:'#6B7280',whiteSpace:'nowrap'}}>Đến ngày</span>
            <input className="fil-inp" type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{height:30,padding:'0 8px',border:'1px solid #D0CCC4',borderRadius:6,fontSize:11,fontFamily:'inherit',outline:'none',color:'#374151'}}/>
            <div style={{flex:1}}/>
            <button className="btn-csv" onClick={exportCSV}>↓ Xuất CSV</button>
            <button className="btn-reset" onClick={reset}>↺ Reset</button>
          </div>
        </div>

        {error && <div className="err">⚠ {error}</div>}

        {loading ? (
          <div className="spin">⏳ Đang tải dữ liệu từ Firebase...</div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{width:28,verticalAlign:'middle',textAlign:'center'}}>#</th>
                    <th style={{minWidth:100,verticalAlign:'middle'}}>NGÀY GD</th>
                    <th style={{minWidth:100}}>
                      <div className="th-lbl">ĐƠN VỊ</div>
                      <select className="hfil" value={fUnit} onChange={e=>setFUnit(e.target.value)}>
                        {units.map(u=><option key={u}>{u}</option>)}
                      </select>
                    </th>
                    <th style={{minWidth:88}}>
                      <div className="th-lbl">NGÂN HÀNG</div>
                      <select className="hfil" value={fBank} onChange={e=>setFBank(e.target.value)}>
                        {banks.map(b=><option key={b}>{b}</option>)}
                      </select>
                    </th>
                    <th style={{minWidth:110}}>
                      <div className="th-lbl">SỐ TK</div>
                      <select className="hfil" value={fStk} onChange={e=>setFStk(e.target.value)}>
                        {stks.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </th>
                    <th style={{minWidth:260}}>
                      <div className="th-lbl">NỘI DUNG</div>
                      <input className="hfil" placeholder="Tìm nội dung..." value={search} onChange={e=>setSearch(e.target.value)}/>
                    </th>
                    <th style={{minWidth:130}}>
                      <div className="th-lbl">NHÓM GD</div>
                      <input className="hfil" placeholder="Tìm nhóm..." value={searchNhom} onChange={e=>setSearchNhom(e.target.value)}/>
                    </th>
                    <th style={{minWidth:80}}>
                      <div className="th-lbl">LOẠI</div>
                      <select className="hfil" value={fType} onChange={e=>setFType(e.target.value)}>
                        <option>Tất cả</option><option>Thu</option><option>Chi</option>
                      </select>
                    </th>
                    <th className="r" style={{minWidth:110,verticalAlign:'middle'}}>SỐ TIỀN (đ)</th>
                    <th className="r" style={{minWidth:110,verticalAlign:'middle'}}>SỐ DƯ TK (đ)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={10} style={{textAlign:'center',padding:32,color:'#9CA3AF'}}>Không có dữ liệu phù hợp</td></tr>
                  ) : rows.map((r, i) => {
                    const loai = String(r['Ghi_chu'] ?? '')
                    const ps   = Number(r['Số_tiền_PS'] ?? 0)
                    const pos  = ps > 0 || loai === 'Thu'
                    const neg  = ps < 0 || loai === 'Chi'
                    return (
                      <tr key={i}>
                        <td className="idx">{(page-1)*PAGE + i + 1}</td>
                        <td>{fmtD(r['Ngày'])}</td>
                        <td>{String(r['Đơn_vị'] ?? '—')}</td>
                        <td>{String(r['Ngân_hàng'] ?? '—')}</td>
                        <td style={{fontFamily:'monospace',fontSize:11,color:'#6B7280'}}>{String(r['Số_tài_khoản'] ?? '—')}</td>
                        <td className="nd" title={String(r['Nội_dung'] ?? '')}>{String(r['Nội_dung'] ?? '—')}</td>
                        <td style={{fontSize:11,color:'#6B7280',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}}>{String(r['Nhóm_CP'] ?? '—')}</td>
                        <td>
                          {loai
                            ? <span className={`badge ${loai==='Thu'?'b-thu':loai==='Chi'?'b-chi':''}`}>{String(r['Ghi_chu'] ?? loai)}</span>
                            : <span style={{color:'#D1D5DB'}}>—</span>}
                        </td>
                        <td className={`r ${pos?'ps-pos':neg?'ps-neg':''}`}>{fmtPS(r['Số_tiền_PS'])}</td>
                        <td className="r">{fmtN(r['Tồn'])}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="tbl-foot">
              <span>
                Hiển thị {Math.min(page*PAGE, filtered.length).toLocaleString('vi-VN')} / {filtered.length.toLocaleString('vi-VN')} giao dịch
                {filtered.length < raw.length && ` · lọc từ ${raw.length.toLocaleString('vi-VN')}`}
              </span>
              <div className="pag">
                <button className="pb" disabled={page===1} onClick={()=>setPage(1)}>«</button>
                <button className="pb" disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>
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
