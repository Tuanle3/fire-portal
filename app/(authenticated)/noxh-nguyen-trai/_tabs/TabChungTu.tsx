'use client'
import { useState, useEffect } from 'react'
import { ChungTuRow, CT_BADGE } from '../_lib/types'
import { ctFmt } from '../_lib/format'

export function TabChungTu({ sheetId }: { sheetId?: string }) {
  const [data, setData]   = useState<{thu:ChungTuRow[];chi:ChungTuRow[]}|null>(null)
  const [view, setView]   = useState<'thu'|'chi'>('thu')
  const [q, setQ]         = useState('')
  const [unitF, setUnitF] = useState('Tất cả')

  useEffect(() => {
    // Chưa cấu hình Google Sheets cho module NOXH Nguyễn Trãi trên fire-portal — hiển thị rỗng thay vì lỗi.
    if (!sheetId) { setData({ thu: [], chi: [] }); return }
    fetch(`/api/chung-tu?sheetId=${encodeURIComponent(sheetId)}`)
      .then(r => r.ok ? r.json() : { thu: [], chi: [] })
      .then(setData)
      .catch(() => setData({ thu: [], chi: [] }))
  }, [sheetId])

  const allRows = data ? (view === 'thu' ? data.thu : data.chi) : []
  const units   = ['Tất cả', ...Array.from(new Set(allRows.map(r => r.donVi).filter(Boolean)))]
  const kw = q.trim().toLowerCase()
  const rows = allRows.filter(r => {
    if (unitF !== 'Tất cả' && r.donVi !== unitF) return false
    if (!kw) return true
    return [r.noiDung, r.maChungTu, r.donVi, r.ngay, r.ghiChu].some(v => String(v ?? '').toLowerCase().includes(kw))
  })
  const total = rows.reduce((s,r) => s + r.soTien, 0)
  const label = view === 'thu' ? 'Tổng hợp thu góp vốn CSH' : 'Tổng hợp chi'

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 168px)',minHeight:340}}>
      <style>{`
        .ct2-card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
        .ct2-hd{padding:12px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .ct2-title{font-size:13px;font-weight:700;color:#374151}
        .ct2-sync{font-size:11px;color:#9CA3AF}
        .ct2-seg{display:flex;gap:4px}
        .ct2-seg button{padding:5px 16px;font-size:12px;font-weight:600;border-radius:20px;border:none;cursor:pointer;font-family:inherit;background:transparent;color:#6B7280}
        .ct2-seg button.active{background:#1C3557;color:#fff}
        .ct2-wrap{flex:1;min-height:0;overflow:auto}
        .ct2-tbl{width:100%;border-collapse:separate;border-spacing:0}
        .ct2-tbl thead th{padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-align:left;background:#F3F4F6;border-bottom:1px solid #E5E7EB;white-space:nowrap;position:sticky;top:0;z-index:3}
        .ct2-tbl thead th.r{text-align:right}
        .ct2-tbl td{padding:11px 16px;font-size:13px;color:#374151;border-bottom:1px solid #F3F4F6;vertical-align:top}
        .ct2-tbl td.r{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
        .ct2-tbl tbody tr:hover td{background:#FAFAFA}
        .ct2-badge{display:inline-block;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:700}
        .ct2-link{color:#D97706;font-size:12px;font-weight:600;text-decoration:none}
        .ct2-link:hover{text-decoration:underline}
        .ct2-tbl tfoot td{padding:13px 16px;font-weight:700;color:#111827;background:#EEF2F7;border-top:2px solid #1C3557;white-space:nowrap;position:sticky;bottom:0;z-index:3}
        .ct2-tbl tfoot td.r{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
        .ct2-empty{padding:48px;text-align:center;color:#9CA3AF;font-size:13px}
        .ct2-filter{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #F3F4F6;flex-shrink:0;flex-wrap:wrap}
        .ct2-search{flex:1;min-width:200px;padding:7px 12px;border:1px solid #D1D9E0;border-radius:8px;font-size:13px;font-family:inherit;color:#374151;background:#fff}
        .ct2-sel{padding:7px 10px;border:1px solid #D1D9E0;border-radius:8px;font-size:12px;font-family:inherit;color:#374151;background:#fff;cursor:pointer}
        .ct2-count{font-size:12px;color:#6B7280;white-space:nowrap}
      `}</style>
      <div className="ct2-card">
        <div className="ct2-hd">
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <span className="ct2-title">{label}</span>
            <div className="ct2-seg">
              <button className={view==='thu'?'active':''} onClick={()=>setView('thu')}>Thu</button>
              <button className={view==='chi'?'active':''} onClick={()=>setView('chi')}>Chi</button>
            </div>
          </div>
          <span className="ct2-sync">{sheetId ? 'Tự cập nhật từ Google Sheets · mỗi 5 phút' : 'Chưa cấu hình Google Sheets'}</span>
        </div>

        <div className="ct2-filter">
          <input className="ct2-search" placeholder="🔍 Tìm nội dung, mã chứng từ, ghi chú, ngày..." value={q} onChange={e=>setQ(e.target.value)} />
          <select className="ct2-sel" value={unitF} onChange={e=>setUnitF(e.target.value)}>
            {units.map(u => <option key={u} value={u}>{u==='Tất cả'?'Tất cả đơn vị':u}</option>)}
          </select>
          {(q || unitF!=='Tất cả') && <button className="ct2-sel" onClick={()=>{setQ('');setUnitF('Tất cả')}}>✕ Xoá lọc</button>}
          <span className="ct2-count">{rows.length}/{allRows.length} chứng từ</span>
        </div>

        {data === null ? (
          <div className="ct2-empty">Đang tải dữ liệu...</div>
        ) : !sheetId ? (
          <div className="ct2-empty">Chưa cấu hình Google Sheets cho dự án này.</div>
        ) : allRows.length === 0 ? (
          <div className="ct2-empty">Chưa có dữ liệu.</div>
        ) : rows.length === 0 ? (
          <div className="ct2-empty">Không tìm thấy chứng từ khớp bộ lọc.</div>
        ) : (
          <div className="ct2-wrap">
            <table className="ct2-tbl">
              <thead><tr>
                <th>Đơn vị</th><th>Ngày</th><th>Nội dung</th><th className="r">Số tiền</th>
                <th>Chứng từ</th><th>Ghi chú</th><th>Đối chiếu</th>
              </tr></thead>
              <tbody>
                {rows.map((r,i)=>{
                  const b = CT_BADGE[r.donVi] ?? {bg:'#F3F4F6',color:'#374151'}
                  return (
                    <tr key={i}>
                      <td><span className="ct2-badge" style={{background:b.bg,color:b.color}}>{r.donVi}</span></td>
                      <td style={{whiteSpace:'nowrap'}}>{r.ngay}</td>
                      <td style={{maxWidth:320}}>{r.noiDung}</td>
                      <td className="r" style={{whiteSpace:'nowrap',fontWeight:600}}>{ctFmt(r.soTien)}</td>
                      <td style={{whiteSpace:'nowrap',color:'#6B7280',fontSize:12}}>{r.maChungTu}</td>
                      <td style={{color:'#6B7280',fontSize:12}}>{r.ghiChu}</td>
                      <td>{r.drive ? <a className="ct2-link" href={r.drive} target="_blank" rel="noopener noreferrer">Xem chứng từ ↗</a> : <span style={{color:'#CBD5E1'}}>—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={3} style={{textAlign:'right'}}>Tổng cộng ({rows.length} chứng từ)</td>
                <td className="r">{ctFmt(total)}</td>
                <td colSpan={3} />
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
