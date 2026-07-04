'use client'
import { useState, useEffect } from 'react'
import { fetchNoxhTable } from '@/lib/noxhData'
import { Project } from '../_lib/types'

export function TabPhapLy({ p, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  const [docs, setDocs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string|null>(null)
  const [phong, setPhong]     = useState('Tất cả phòng ban')

  const load = () => {
    setLoading(true)
    fetchNoxhTable(`${p.prefix}_Phap_Ly`).then(({data,error})=>{ setDocs(data??[]); setError(error?String(error):null); setLoading(false) })
  }
  useEffect(()=>{ load() },[])

  const gv = (r: any, ...keys: string[]) => { for (const k of keys) if (r[k]!=null) return r[k]; return null }
  const getMa    = (r: any) => gv(r,'Mã hồ sơ','ma_ho_so','Mã HS','ma_hs') ?? '–'
  const getLoai  = (r: any) => gv(r,'Loại hồ sơ','loai_ho_so','Loại hồ sơ / Giấy phép','loai') ?? '–'
  const getSoVB  = (r: any) => gv(r,'Số văn bản','so_van_ban') ?? ''
  const getCQ    = (r: any) => gv(r,'Cơ quan cấp phép','co_quan_cap_phep','Cơ quan cấp','co_quan_cap') ?? ''
  const getNgayCap=(r:any)  => gv(r,'Ngày cấp','ngay_cap') ?? ''
  const getNgayHH=(r:any)   => gv(r,'Ngày hết hạn','ngay_het_han') ?? null
  const getTienDo=(r:any)   => { const v=Number(gv(r,'Tiến độ','tien_do','Tiến độ (%)','tien_do_pct') ?? 0); return v<=1&&v>0?Math.round(v*100):v }
  const getTT    = (r: any) => gv(r,'Trạng thái','trang_thai') ?? '–'
  const getGhiChu=(r:any)   => gv(r,'Ghi chú','ghi_chu') ?? ''
  const getNguoi = (r: any) => gv(r,'Người phụ trách','nguoi_phu_trach','Phòng ban','phong_ban') ?? ''
  const getPhong = (r: any) => gv(r,'Phòng ban','phong_ban','Người phụ trách','nguoi_phu_trach') ?? ''

  const daysLeft = (r: any): number|null => {
    const han=getNgayHH(r); if(!han||String(han).toLowerCase().includes('vô')) return null
    const d=Math.ceil((new Date(han).getTime()-Date.now())/86400000); return isNaN(d)?null:d
  }
  const warnInfo = (days: number|null) => {
    if(days===null) return {label:'✓ Còn hạn',color:'var(--green)'}
    if(days<0)      return {label:'✗ Đã hết hạn',color:'#DC2626'}
    if(days<30)     return {label:'⚠ Sắp hết hạn',color:'var(--amber)'}
    return {label:'✓ Còn hạn',color:'var(--green)'}
  }
  const ttBadge = (tt: string) => tt==='Đã hoàn thành'?'badge-done':(tt==='Chờ nộp'||tt==='Chưa nộp')?'badge-upcoming':'badge-active'
  const fmtDate = (s: string|null) => {
    if(!s)return '–'; try{const d=new Date(s);if(isNaN(d.getTime()))return s;return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`}catch{return s}
  }

  const phongList=['Tất cả phòng ban',...Array.from(new Set(docs.map(getPhong).filter(Boolean)))]
  const filtered=phong==='Tất cả phòng ban'?docs:docs.filter(r=>getPhong(r)===phong)
  const hetHan=filtered.filter(r=>{const d=daysLeft(r);return d!==null&&d<0})
  const sapHetHan=filtered.filter(r=>{const d=daysLeft(r);return d!==null&&d>=0&&d<30})
  const dangXD=filtered.filter(r=>!['Đã hoàn thành','Chờ nộp','Chưa nộp'].includes(getTT(r))&&getTT(r)!=='–')
  const hoan=filtered.filter(r=>getTT(r)==='Đã hoàn thành').length
  const loaiGroups=Array.from(new Set(filtered.map(getLoai))).map(loai=>{
    const rows=filtered.filter(r=>getLoai(r)===loai)
    return {loai,pct:rows.length?Math.round(rows.reduce((s,r)=>s+getTienDo(r),0)/rows.length):0}
  })
  const urgent=[...hetHan.map(r=>({r,tag:'ĐÃ HẾT HẠN',color:'#DC2626',bg:'#FDECEC'})),...sapHetHan.map(r=>({r,tag:'SẮP HẾT HẠN',color:'var(--amber)',bg:'#FFF4E0'}))]
  const pending=dangXD.filter(r=>!hetHan.includes(r)&&!sapHetHan.includes(r)).slice(0,6)

  return (
    <div>
      {error && (
        <div style={{background:'#FDECEC',color:'#DC2626',border:'1px solid #DC2626',borderRadius:8,padding:'10px 14px',fontSize:12.5,fontWeight:600,marginBottom:12}}>
          ⚠ Lỗi tải dữ liệu pháp lý: {error}
        </div>
      )}
      {/* Toolbar */}
      <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11.5,color:'var(--muted)'}}>Phòng:</span>
          <select value={phong} onChange={e=>setPhong(e.target.value)} style={{border:'1px solid var(--border2)',borderRadius:8,padding:'5px 10px',fontSize:12,fontFamily:'inherit',color:'var(--txt)',background:'var(--surface)',cursor:'pointer'}}>
            {phongList.map(p=><option key={p}>{p}</option>)}
          </select>
          <span style={{background:'#FEE2E2',color:'#DC2626',fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:20}}> ⚠ {hetHan.length+sapHetHan.length} cảnh báo</span>
          <span style={{background:'#FFF7ED',color:'#EA580C',fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:20}}>🔔 {dangXD.length} việc khẩn</span>
          <button onClick={load} style={{background:'var(--navy)',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>↺ Refresh</button>
        </div>
      </div>

      {/* KPI */}
      <div className="ceo-kpi-row">
        <div className="ceo-kpi ceo-kpi-navy">
          <div className="ceo-kpi-label">📋 TỔNG HỒ SƠ PHÁP LÝ</div>
          <div className="ceo-kpi-val" style={{fontSize:28}}>{filtered.length}</div>
          <div className="ceo-kpi-sub">{hoan} hoàn thành · {filtered.length-hoan} đang xử lý</div>
        </div>
        <div className="ceo-kpi" style={{background:hetHan.length>0?'#FDECEC':'var(--surface)',border:'1px solid var(--border)'}}>
          <div className="ceo-kpi-label" style={{color:'#DC2626'}}>❌ ĐÃ HẾT HẠN</div>
          <div className="ceo-kpi-val" style={{fontSize:28,color:'#DC2626'}}>{hetHan.length}</div>
          <div className="ceo-kpi-sub">{hetHan.length===0?'Không có':'Cần gia hạn ngay'}</div>
        </div>
        <div className="ceo-kpi ceo-kpi-amber">
          <div className="ceo-kpi-label">⚠️ SẮP HẾT HẠN &lt;30 NGÀY</div>
          <div className="ceo-kpi-val" style={{fontSize:28}}>{sapHetHan.length}</div>
          <div className="ceo-kpi-sub">{sapHetHan.length>0?'Cần gia hạn ngay':'Không có'}</div>
        </div>
        <div className="ceo-kpi ceo-kpi-green">
          <div className="ceo-kpi-label">🔄 ĐANG XÉT DUYỆT</div>
          <div className="ceo-kpi-val" style={{fontSize:28}}>{dangXD.length}</div>
          <div className="ceo-kpi-sub">Chờ cơ quan xử lý</div>
        </div>
      </div>

      {/* Two-panel */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">📊 Trạng thái hồ sơ theo loại</span></div>
          <div className="sc-body" style={{maxHeight:320,overflowY:'auto'}}>
            {loading?<div style={{color:'var(--muted)',fontSize:12,textAlign:'center',padding:20}}>Đang tải...</div>
              :loaiGroups.map((g,i)=>{
                const c=g.pct===100?'var(--green)':g.pct===0?'#DC2626':'var(--navy)'
                return(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:12,color:'var(--txt)',fontWeight:500,flex:1,marginRight:8}}>{g.loai}</span>
                      <span style={{fontSize:12,fontWeight:700,color:c}}>{g.pct}%</span>
                    </div>
                    <div style={{height:7,background:'var(--surf2)',borderRadius:4,overflow:'hidden'}}>
                      <div style={{width:`${g.pct}%`,height:'100%',background:c,borderRadius:4}}/>
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">📌 Danh sách cần xử lý</span><span style={{fontSize:11,color:'var(--muted)'}}>{urgent.length+pending.length} việc</span></div>
          <div className="sc-body" style={{padding:0,maxHeight:320,overflowY:'auto'}}>
            {urgent.length===0&&pending.length===0
              ?<div style={{padding:16,color:'var(--green)',fontSize:12,fontWeight:600}}>✅ Không có việc cần xử lý</div>
              :<>
                {urgent.map(({r,tag,color,bg},i)=>(
                  <div key={`u${i}`} style={{padding:'9px 14px',borderBottom:'1px solid var(--border)',background:bg,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:'var(--txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{getLoai(r)}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>{getMa(r)}{getNgayHH(r)?` · Hạn: ${fmtDate(getNgayHH(r))}`:''}{getNguoi(r)?` · ${getNguoi(r)}`:''}</div>
                    </div>
                    <span style={{fontSize:10,fontWeight:700,color,background:color==='#DC2626'?'#FEE2E2':'#FFF7ED',padding:'2px 7px',borderRadius:12,flexShrink:0,marginLeft:8}}>{tag}</span>
                  </div>
                ))}
                {pending.map((r,i)=>{
                  const wi=warnInfo(daysLeft(r))
                  return(
                    <div key={`p${i}`} style={{padding:'9px 14px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{getLoai(r)}</div>
                        <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>{getMa(r)}{getNgayHH(r)?` · Hạn: ${fmtDate(getNgayHH(r))}`:''}{getNguoi(r)?` · ${getNguoi(r)}`:''}</div>
                      </div>
                      <span style={{fontSize:10,fontWeight:600,color:wi.color,flexShrink:0,marginLeft:8}}>{wi.label}</span>
                    </div>
                  )
                })}
                {urgent.length>0&&<button style={{width:'100%',background:'#1C3557',color:'#fff',border:'none',padding:'10px 0',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>📢 Push việc khẩn cho Ban Pháp chế →</button>}
              </>
            }
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="sc">
        <div className="sc-head"><span className="sc-title">📄 Bảng hồ sơ pháp lý chi tiết</span><span style={{fontSize:11,color:'var(--muted)'}}>{filtered.length} hồ sơ</span></div>
        <div className="sc-body" style={{padding:0,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          {loading?<div style={{padding:20,textAlign:'center',color:'var(--muted)',fontSize:12}}>Đang tải...</div>:(
            <table className="legal-table" style={{minWidth:860}}>
              <thead><tr>
                <th style={{position:'sticky',left:0,zIndex:2,background:'#EEF3FA',boxShadow:'2px 0 4px rgba(13,31,51,.10)',width:78,minWidth:78}}>Mã HS</th>
                <th style={{position:'sticky',left:78,zIndex:2,background:'#EEF3FA',boxShadow:'2px 0 4px rgba(13,31,51,.10)',minWidth:160}}>Loại hồ sơ / Giấy phép</th>
                <th>Số văn bản</th><th>Cơ quan cấp</th><th>Ngày cấp</th>
                <th>Ngày hết hạn</th><th style={{textAlign:'right'}}>Còn(ngày)</th>
                <th>Cảnh báo</th><th style={{textAlign:'center',width:80}}>Tiến độ</th>
                <th>Trạng thái</th><th>Ghi chú</th>
              </tr></thead>
              <tbody>
                {filtered.map((r,i)=>{
                  const days=daysLeft(r);const wi=warnInfo(days);const pct=getTienDo(r);const tt=getTT(r)
                  const barC=pct===100?'var(--green)':pct===0?'#CBD5E1':'var(--navy)'
                  const bg=i%2===0?'#fff':'#FAFBFC'
                  return(
                    <tr key={i}>
                      <td style={{position:'sticky',left:0,zIndex:1,background:bg,boxShadow:'2px 0 4px rgba(13,31,51,.06)'}}>
                        <code style={{fontSize:11,background:'var(--surf2)',padding:'2px 5px',borderRadius:4}}>{getMa(r)}</code>
                      </td>
                      <td style={{position:'sticky',left:78,zIndex:1,background:bg,boxShadow:'2px 0 4px rgba(13,31,51,.06)',fontWeight:500,fontSize:12}}>{getLoai(r)}</td>
                      <td style={{fontSize:11.5,color:'var(--muted)'}}>{getSoVB(r)||'–'}</td>
                      <td style={{fontSize:11.5,color:'var(--muted)'}}>{getCQ(r)||'–'}</td>
                      <td style={{fontSize:11.5,color:'var(--muted)'}}>{fmtDate(getNgayCap(r))}</td>
                      <td style={{fontSize:11.5,color:days!==null&&days<0?'#DC2626':days!==null&&days<30?'var(--amber)':'var(--muted)',fontWeight:days!==null&&days<30?700:400}}>
                        {!getNgayHH(r)?'Vô thời hạn':fmtDate(getNgayHH(r))}
                      </td>
                      <td style={{textAlign:'right',fontSize:12,fontWeight:700,color:days===null?'var(--muted)':days<0?'#DC2626':days<30?'var(--amber)':'var(--navy)'}}>
                        {days===null?'∞':Math.abs(days)}
                      </td>
                      <td><span style={{fontSize:11,fontWeight:600,color:wi.color}}>{wi.label}</span></td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <div style={{flex:1,height:5,background:'var(--surf2)',borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:`${pct}%`,height:'100%',background:barC,borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:11,fontWeight:700,color:'var(--navy)',width:28,textAlign:'right'}}>{pct}%</span>
                        </div>
                      </td>
                      <td><span className={`badge ${ttBadge(tt)}`}>{tt}</span></td>
                      <td style={{fontSize:11.5,color:'var(--muted)'}}>{getGhiChu(r)||'–'}</td>
                    </tr>
                  )
                })}
                {filtered.length===0&&<tr><td colSpan={11} style={{textAlign:'center',color:'var(--muted)',padding:20}}>Không có dữ liệu</td></tr>}
              </tbody>
              {filtered.length>0&&<tfoot><tr style={{background:'var(--surf2)'}}>
                <td style={{position:'sticky',left:0,background:'var(--surf2)'}} colSpan={2}><strong>Tổng ({filtered.length} hồ sơ)</strong></td>
                <td colSpan={8}/>
                <td style={{fontWeight:700,color:'var(--green)'}}>{hoan}/{filtered.length} hoàn thành</td>
              </tr></tfoot>}
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
