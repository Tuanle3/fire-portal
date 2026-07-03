'use client'
import { useState, useEffect, useRef } from 'react'
import { fetchNoxhTable } from '@/lib/noxhData'
import { Project } from '../_lib/types'

export function TabBanHang({ p, donVi='ty' }: { p: Project; donVi?: 'ty'|'trieu'|'dong' }) {
  const [canHo,   setCanHo]   = useState<any[]>([])
  const [congNo,  setCongNo]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sub,     setSub]     = useState<'ban-hang'|'cong-no'>('ban-hang')
  const [search,  setSearch]  = useState('')
  const [fLoai,   setFLoai]   = useState('Tất cả loại căn')
  const [fTT,     setFTT]     = useState('Tất cả trạng thái')
  const [searchCN,setSearchCN]= useState('')
  const [fCNTT,   setFCNTT]   = useState('Tất cả trạng thái')
  const bhDonut = useRef<HTMLCanvasElement>(null)
  const [bhReady,setBhReady]  = useState(false)

  useEffect(()=>{
    Promise.all([
      fetchNoxhTable(`${p.prefix}_Ban_Hang`),
      fetchNoxhTable(`${p.prefix}_Cong_No_Thu`),
    ]).then(([r1,r2])=>{
      const sortStt=(a:any[])=>[...a].sort((x,y)=>Number(x.stt??0)-Number(y.stt??0))
      setCanHo(sortStt(r1.data??[])); setCongNo(sortStt(r2.data??[])); setLoading(false); setBhReady(true)
    })
  },[])

  const bG=(r:any,...ks:string[])=>{ for(const k of ks){ if(r[k]!==undefined&&r[k]!==null&&r[k]!=='') return r[k] } return null }
  // NOXH_NT_Ban_Hang
  const bhTT   =(c:any)=>bG(c,'tinh_trang_can_ho')||'–'
  const bhMaCan=(c:any)=>bG(c,'ma_can_ho')||'–'
  const bhTang =(c:any)=>bG(c,'tang_block')||'–'
  const bhLoai =(c:any)=>bG(c,'loai_can')||'–'
  const bhDT   =(c:any)=>{const v=bG(c,'dtich_thong_thuy');return v!==null?Number(v):'–'}
  const bhGia  =(c:any)=>{const v=bG(c,'gia_ban_thue');if(!v)return '–';const n=Number(v);return n>=1e9?`${(n/1e9).toFixed(3)} tỷ`:n>=1e6?`${Math.round(n/1e6).toLocaleString()} triệu`:v}
  const bhTenKH=(c:any)=>bG(c,'ten_khach_hang')||'–'
  const bhSoHD =(c:any)=>bG(c,'so_hop_dong_mbb')||'–'
  const bhGTHD =(c:any)=>{const v=bG(c,'gia_tri_hd');if(!v)return 0;const n=Number(v);return n>=1e9?n/1e9:n}
  const bhNgay =(c:any)=>bG(c,'ngay_ky_hd')||'–'
  const bhGhiChu=(c:any)=>bG(c,'ghi_chu')||''
  // NOXH_NT_Cong_No_Thu
  const cnSoHD  =(c:any)=>bG(c,'so_hd_mbb')||'–'
  const cnTenKH =(c:any)=>bG(c,'ten_khach_hang')||'–'
  const cnMaCan =(c:any)=>bG(c,'ma_can_ho')||'–'
  const cnDotTT =(c:any)=>bG(c,'dot_thanh_toan')||'–'
  const cnPThu  =(c:any)=>Number(bG(c,'so_tien_phai_thu')||0)
  const cnNgayHan=(c:any)=>bG(c,'ngay_den_han')||''
  const cnNgayTT=(c:any)=>bG(c,'ngay_tt_thuc_te')||'–'
  const cnThucThu=(c:any)=>Number(bG(c,'so_tien_thuc_thu')||0)
  const cnCL    =(c:any)=>{const cl=bG(c,'chenh_lech');return cl!==null?Number(cl):cnPThu(c)-cnThucThu(c)}
  const cnTrangThai=(c:any)=>bG(c,'trang_thai')||'–'
  const cnNgayQH=(c:any)=>{const v=bG(c,'so_ngay_qua_han');return v!==null?`${v} ngày`:'–'}

  const now = new Date()
  const daKyHD = canHo.filter(c=>bhTT(c)==='Đã ký HĐ').length
  const datCoc  = canHo.filter(c=>bhTT(c)==='Đặt cọc').length
  const conLai  = canHo.filter(c=>!['Đã ký HĐ','Đặt cọc'].includes(bhTT(c))).length
  const tongDT  = canHo.reduce((s,c)=>s+bhGTHD(c),0)
  const cnQH    = congNo.filter(c=>{const h=cnNgayHan(c);return h&&new Date(h)<now&&cnCL(c)>0})
  const cnQHVal = cnQH.reduce((s,c)=>s+cnCL(c),0)
  const cnTier  = (mn:number,mx:number)=>congNo.filter(c=>{
    const h=cnNgayHan(c);if(!h)return false
    const d=(now.getTime()-new Date(h).getTime())/86400000
    return d>=mn&&d<mx&&cnCL(c)>0
  })
  const t1=cnTier(0,30),t2=cnTier(30,90),t3=cnTier(90,9999)
  // fmtV: input là VNĐ tuyệt đối; fmtTy: input là tỷ — đều theo donVi prop
  const fmtTy=(tyVal:number)=>{if(!tyVal)return '–';const f=(n:number,d=0)=>n.toLocaleString('vi-VN',{minimumFractionDigits:d,maximumFractionDigits:d});return donVi==='ty'?`${f(tyVal,3)} tỷ`:donVi==='trieu'?`${f(tyVal*1000)} triệu`:`${f(tyVal*1e9)} đ`}
  const fmtV=(v:number)=>{if(!v)return '–';const ty=v>=1e9?v/1e9:v>=1e6?v/1e6/1000:v/1e9;return fmtTy(v/1e9)}
  const fmtT=(tyVal:number)=>fmtTy(tyVal)

  const bhChartInst = useRef<any>(null)
  useEffect(()=>{
    if(!bhDonut.current||!bhReady||loading) return
    const build=()=>{
      const Chart=(window as any).Chart; if(!Chart||!bhDonut.current) return
      bhChartInst.current?.destroy()
      const ctx=bhDonut.current.getContext('2d')!
      bhChartInst.current=new Chart(ctx,{type:'doughnut',data:{
        labels:['Đã ký HĐ','Đặt cọc','Còn lại'],
        datasets:[{data:[daKyHD,datCoc,conLai],backgroundColor:['#1C3557','#D4A64A','#CBD5E1'],borderWidth:0,hoverOffset:4}]
      },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'68%'}})
    }
    if((window as any).Chart) build()
    else { const s=document.querySelector('script[data-chartjs]') as HTMLScriptElement; if(s) s.addEventListener('load',build,{once:true}) }
    return ()=>{ bhChartInst.current?.destroy() }
  },[bhReady,loading,daKyHD,datCoc,conLai])

  const loaiList=['Tất cả loại căn',...Array.from(new Set(canHo.map(bhLoai).filter(v=>v&&v!=='–')))]
  const ttList  =['Tất cả trạng thái',...Array.from(new Set(canHo.map(bhTT).filter(v=>v&&v!=='–')))]
  const cnTTList=['Tất cả trạng thái',...Array.from(new Set(congNo.map(cnTrangThai).filter(v=>v&&v!=='–')))]
  const filtBH=canHo.filter(c=>{
    const ms=search===''||bhMaCan(c).toLowerCase().includes(search.toLowerCase())||bhTenKH(c).toLowerCase().includes(search.toLowerCase())||bhLoai(c).toLowerCase().includes(search.toLowerCase())
    return ms&&(fLoai==='Tất cả loại căn'||bhLoai(c)===fLoai)&&(fTT==='Tất cả trạng thái'||bhTT(c)===fTT)
  })
  const filtCN=congNo.filter(c=>{
    const ms=searchCN===''||cnSoHD(c).toLowerCase().includes(searchCN.toLowerCase())||cnTenKH(c).toLowerCase().includes(searchCN.toLowerCase())||cnMaCan(c).toLowerCase().includes(searchCN.toLowerCase())
    return ms&&(fCNTT==='Tất cả trạng thái'||cnTrangThai(c)===fCNTT)
  })
  const bhBadge=(tt:string)=>{
    if(tt==='Đã ký HĐ') return {bg:'#EAF6EE',c:'#1F6B3D'}
    if(tt==='Đặt cọc')  return {bg:'#FFF4E0',c:'#8A5A12'}
    return {bg:'#EEF3FA',c:'#1C3557'}
  }
  const cnBadge2=(c:any)=>{
    const h=cnNgayHan(c); const over=h&&new Date(h)<now&&cnCL(c)>0
    if(over||cnTrangThai(c).includes('Quá hạn')) return {bg:'#FDECEC',c:'#DC2626',t:'Quá hạn'}
    if(cnCL(c)<=0||cnTrangThai(c)==='Đã thu') return {bg:'#EAF6EE',c:'#1F6B3D',t:'Đã thu'}
    return {bg:'#EEF3FA',c:'#1C3557',t:cnTrangThai(c)||'Chưa đến hạn'}
  }

  return (
    <div>
      <style>{`
        .bh2-stab{padding:7px 16px;font-size:12.5px;font-weight:600;border-radius:8px;border:1px solid #E0E7F0;background:#fff;cursor:pointer;color:#6B7280;font-family:inherit;display:inline-flex;align-items:center;gap:6px;margin-right:6px;margin-bottom:14px}
        .bh2-stab.act{background:#1C3557;color:#fff;border-color:#1C3557}
        .bh2-kpi4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
        .bh2-card{background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E7F0}
        .bh2-ch{padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid}
        .bh2-cb{padding:10px 14px 12px}
        .bh2-val{font-size:22px;font-weight:800;line-height:1.1}
        .bh2-sub{font-size:11px;color:#6B7280;margin-top:3px}
        .bh2-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
        .bh2-panel{background:#fff;border:1px solid #E0E7F0;border-radius:12px;overflow:hidden}
        .bh2-ph{padding:10px 14px;background:#EEF3FA;border-bottom:.5px solid #D0DCE8;font-size:11px;font-weight:700;letter-spacing:.07em;color:#4B6A8A;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
        .bh2-pb{padding:12px 14px}
        .bh2-badge{display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700}
        .bh2-inp{width:100%;max-width:360px;padding:7px 12px;border:1px solid #E0E7F0;border-radius:8px;font-size:12px;font-family:inherit;outline:none}
        .bh2-sel{padding:6px 10px;border:1px solid #E0E7F0;border-radius:8px;font-size:12px;font-family:inherit;background:#fff;cursor:pointer}
      `}</style>
      {/* Sub-tabs */}
      <div>
        <button className={`bh2-stab${sub==='ban-hang'?' act':''}`} onClick={()=>setSub('ban-hang')}>🏠 Bán hàng</button>
        <button className={`bh2-stab${sub==='cong-no'?' act':''}`} onClick={()=>setSub('cong-no')}>📊 Công nợ</button>
      </div>

      {/* ── BÁN HÀNG ── */}
      {sub==='ban-hang' && <>
        <div className="bh2-kpi4">
          {[
            {lbl:'📝 Căn đã ký HĐ',val:daKyHD,sub:`${canHo.length>0?Math.round(daKyHD/canHo.length*100):0}% tổng ${canHo.length} căn`,hBg:'#EEF3FA',hBd:'#D0DCE8',hC:'#4B6A8A',vC:'#1C3557'},
            {lbl:'🔒 Đặt cọc giữ chỗ',val:datCoc,sub:'Cần chốt HĐ sớm',hBg:'#F0FDF4',hBd:'#BBF7D0',hC:'#1F6B3D',vC:'#16A34A'},
            {lbl:'⚠️ Công nợ quá hạn',val:fmtV(cnQHVal),sub:`${cnQH.length} HĐ quá hạn`,hBg:'#FDECEC',hBd:'#FECACA',hC:'#8C1F1F',vC:'#DC2626'},
            {lbl:'💰 Tổng doanh thu HĐ',val:fmtT(tongDT),sub:'Giá trị ký kết',hBg:'#FFF4E0',hBd:'#FDE68A',hC:'#8A5A12',vC:'#D97706'},
          ].map(it=>(
            <div key={it.lbl} className="bh2-card">
              <div className="bh2-ch" style={{background:it.hBg,borderBottomColor:it.hBd,color:it.hC}}>{it.lbl}</div>
              <div className="bh2-cb"><div className="bh2-val" style={{color:it.vC}}>{it.val}</div><div className="bh2-sub">{it.sub}</div></div>
            </div>
          ))}
        </div>

        <div className="bh2-row2">
          <div className="bh2-panel">
            <div className="bh2-ph">🟡 Tình trạng hấp thụ căn hộ</div>
            <div className="bh2-pb" style={{display:'flex',gap:20,alignItems:'center',minHeight:150}}>
              <div style={{position:'relative',width:130,height:130,flexShrink:0}}>
                <canvas ref={bhDonut}/>
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <span style={{fontSize:20,fontWeight:800,color:'#1C3557'}}>{canHo.length}</span>
                  <span style={{fontSize:9,color:'#9CA3AF',letterSpacing:'.05em'}}>TỔNG CĂN</span>
                </div>
              </div>
              <div style={{flex:1}}>
                {[{l:'Đã ký HĐ',cl:'#1C3557',n:daKyHD},{l:'Đặt cọc',cl:'#D4A64A',n:datCoc},{l:'Còn lại',cl:'#CBD5E1',n:conLai}].map(it=>(
                  <div key={it.l} style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <span style={{width:10,height:10,borderRadius:2,background:it.cl,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:12.5,color:'#374151'}}>{it.l}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#1C3557',width:24,textAlign:'right'}}>{it.n}</span>
                    <span style={{fontSize:11,color:'#9CA3AF',width:36,textAlign:'right'}}>{canHo.length?Math.round(it.n/canHo.length*100):0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bh2-panel">
            <div className="bh2-ph">📊 Phân tầng công nợ khách hàng</div>
            <div className="bh2-pb">
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                {[
                  {lbl:'Quá hạn <30 ngày',items:t1,bg:'#FDECEC',vc:'#DC2626'},
                  {lbl:'30–90 ngày',items:t2,bg:'#FFF4E0',vc:'#D97706'},
                  {lbl:'>90 ngày',items:t3,bg:'#FDECEC',vc:'#8C1F1F'},
                ].map(tier=>{
                  const v=tier.items.reduce((s,c)=>s+cnCL(c),0)
                  return (
                    <div key={tier.lbl} style={{background:tier.items.length>0?tier.bg:'#F8FAFC',border:'1px solid #E0E7F0',borderRadius:10,padding:'10px 14px',flex:1}}>
                      <div style={{fontSize:10,color:'#6B7280',marginBottom:4}}>{tier.lbl}</div>
                      <div style={{fontSize:20,fontWeight:800,color:tier.items.length>0?tier.vc:'#374151'}}>{tier.items.length}</div>
                      <div style={{fontSize:11,color:'#6B7280',marginTop:2}}>{fmtV(v)}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderTop:'1px solid #E0E7F0',marginBottom:10}}>
                <span style={{fontSize:12,fontWeight:700,color:'#374151'}}>Tổng quá hạn</span>
                <span style={{fontSize:13,fontWeight:800,color:cnQHVal>0?'#DC2626':'#16A34A'}}>{fmtV(cnQHVal)}</span>
              </div>
              <button style={{width:'100%',background:'#1C3557',color:'#fff',border:'none',padding:'10px 0',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',borderRadius:8}}>
                📢 Push việc cho Ban Kinh doanh →
              </button>
            </div>
          </div>
        </div>

        {/* Bảng căn hộ */}
        <div className="bh2-panel">
          <div className="bh2-ph">🏠 Danh sách căn hộ chi tiết<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{filtBH.length} căn</span></div>
          <div className="bh2-pb">
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <input className="bh2-inp" placeholder="🔍 Tìm mã căn, tên KH, loại căn..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <select className="bh2-sel" value={fLoai} onChange={e=>setFLoai(e.target.value)}>{loaiList.map(v=><option key={v}>{v}</option>)}</select>
              <select className="bh2-sel" value={fTT}   onChange={e=>setFTT(e.target.value)}>{ttList.map(v=><option key={v}>{v}</option>)}</select>
            </div>
            {loading?<div style={{textAlign:'center',padding:'20px',color:'#9CA3AF',fontSize:12}}>Đang tải…</div>:(
              <div style={{border:'1px solid #E0E7F0',borderRadius:8,overflow:'hidden'}}>
                <div style={{maxHeight:480,overflowY:'auto',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
                  <table className="legal-table" style={{marginBottom:0,minWidth:960}}>
                    <thead>
                      <tr>
                        <th style={{position:'sticky',top:0,left:0,zIndex:3,width:44}}>STT</th>
                        <th style={{position:'sticky',top:0,left:44,zIndex:3,minWidth:110,boxShadow:'2px 0 4px rgba(13,31,51,.10)'}}>Mã căn</th>
                        <th style={{position:'sticky',top:0}}>Tầng/Block</th>
                        <th style={{position:'sticky',top:0}}>Loại căn</th>
                        <th style={{position:'sticky',top:0,textAlign:'right'}}>DT(m²)</th>
                        <th style={{position:'sticky',top:0,textAlign:'right'}}>Giá bán</th>
                        <th style={{position:'sticky',top:0,textAlign:'center'}}>Tình trạng</th>
                        <th style={{position:'sticky',top:0,minWidth:120}}>Tên KH</th>
                        <th style={{position:'sticky',top:0}}>Số HĐ</th>
                        <th style={{position:'sticky',top:0,textAlign:'right'}}>GT HĐ(tỷ)</th>
                        <th style={{position:'sticky',top:0}}>Ngày ký</th>
                        <th style={{position:'sticky',top:0}}>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtBH.length===0
                        ?<tr><td colSpan={12} style={{textAlign:'center',color:'#9CA3AF',padding:20}}>Không có dữ liệu</td></tr>
                        :filtBH.map((c,i)=>{
                          const tt=bhTT(c); const {bg,c:col}=bhBadge(tt); const rb=i%2===0?'#fff':'#FAFBFC'
                          return <tr key={i}>
                            <td style={{position:'sticky',left:0,zIndex:1,background:rb,color:'#9CA3AF'}}>{c.stt??i+1}</td>
                            <td style={{position:'sticky',left:44,zIndex:1,background:rb,boxShadow:'2px 0 4px rgba(13,31,51,.06)'}}>
                              <code style={{fontSize:11,background:'#EEF3FA',padding:'2px 5px',borderRadius:4}}>{bhMaCan(c)}</code>
                            </td>
                            <td style={{color:'#6B7280',fontSize:11.5}}>{bhTang(c)}</td>
                            <td>{bhLoai(c)}</td>
                            <td style={{textAlign:'right',color:'#6B7280'}}>{bhDT(c)}</td>
                            <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{bhGia(c)}</td>
                            <td style={{textAlign:'center'}}><span className="bh2-badge" style={{background:bg,color:col}}>{tt}</span></td>
                            <td style={{fontSize:12}}>{bhTenKH(c)}</td>
                            <td style={{fontSize:11,color:'#6B7280'}}>{bhSoHD(c)}</td>
                            <td style={{textAlign:'right',fontWeight:700,color:'#16A34A'}}>{bhGTHD(c)>0?`${bhGTHD(c).toFixed(3)}`:'–'}</td>
                            <td style={{color:'#6B7280',fontSize:11}}>{bhNgay(c)}</td>
                            <td style={{color:'#6B7280',fontSize:11}}>{bhGhiChu(c)}</td>
                          </tr>
                        })
                      }
                    </tbody>
                    <tfoot style={{position:'sticky',bottom:0,zIndex:2}}>
                      <tr style={{background:'#EEF3FA',fontWeight:800,color:'#1C3557',fontSize:12,borderTop:'2px solid #D0DCE8'}}>
                        <td style={{position:'sticky',left:0,background:'#EEF3FA'}} colSpan={2}>Tổng ({filtBH.length} căn)</td>
                        <td/><td/>
                        <td style={{textAlign:'right'}}>{filtBH.reduce((s,c)=>{const v=bhDT(c);return s+(typeof v==='number'?v:0)},0).toFixed(1)}</td>
                        <td/>
                        <td style={{textAlign:'center',fontSize:11,color:'#374151'}}>
                          {Array.from(new Set(filtBH.map(bhTT))).map(tt=>{const n=filtBH.filter(c=>bhTT(c)===tt).length;return <span key={tt} style={{marginRight:6}}>{tt}: {n}</span>})}
                        </td>
                        <td colSpan={2}/>
                        <td style={{textAlign:'right',color:'#16A34A'}}>{filtBH.reduce((s,c)=>s+bhGTHD(c),0).toFixed(3)} tỷ</td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </>}

      {/* ── CÔNG NỢ ── */}
      {sub==='cong-no' && (
        <div className="bh2-panel">
          <div className="bh2-ph">📊 Danh sách hợp đồng / công nợ<span style={{fontSize:10,color:'#9CA3AF',fontWeight:400,textTransform:'none'}}>{filtCN.length} dòng</span></div>
          <div className="bh2-pb">
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <input className="bh2-inp" style={{maxWidth:480}} placeholder="🔍 Tìm số HĐ, tên KH, mã căn..." value={searchCN} onChange={e=>setSearchCN(e.target.value)}/>
              <select className="bh2-sel" value={fCNTT} onChange={e=>setFCNTT(e.target.value)}>{cnTTList.map(v=><option key={v}>{v}</option>)}</select>
            </div>
            {loading?<div style={{textAlign:'center',padding:'20px',color:'#9CA3AF',fontSize:12}}>Đang tải…</div>:(
              <div style={{overflowX:'auto'}}>
                <table className="legal-table">
                  <thead><tr>
                    <th>STT</th><th>Số HĐ</th><th>Tên KH</th><th>Mã căn</th><th>Đợt TT</th>
                    <th style={{textAlign:'right'}}>Phải thu (VNĐ)</th><th>Ngày đến hạn</th>
                    <th>Ngày TT TT</th><th style={{textAlign:'right'}}>Thực thu</th>
                    <th style={{textAlign:'right'}}>Chênh lệch</th>
                    <th style={{textAlign:'center'}}>Trạng thái</th><th>Ngày quá hạn</th>
                  </tr></thead>
                  <tbody>
                    {filtCN.length===0?<tr><td colSpan={12} style={{textAlign:'center',color:'#9CA3AF',padding:20}}>Không có dữ liệu</td></tr>:filtCN.map((c,i)=>{
                      const bd=cnBadge2(c); const cl=cnCL(c)
                      const h=cnNgayHan(c); const over=h&&new Date(h)<now&&cl>0
                      return <tr key={i} style={over?{background:'#FFF9F9'}:{}}>
                        <td style={{color:'#9CA3AF'}}>{c['STT']??i+1}</td>
                        <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 6px',borderRadius:4}}>{cnSoHD(c)}</code></td>
                        <td style={{fontWeight:500,fontSize:12}}>{cnTenKH(c)}</td>
                        <td><code style={{fontSize:11,background:'#EEF3FA',padding:'2px 6px',borderRadius:4}}>{cnMaCan(c)}</code></td>
                        <td style={{color:'#6B7280',fontSize:11.5}}>{cnDotTT(c)}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:'#1C3557'}}>{fmtV(cnPThu(c))}</td>
                        <td style={{color:over?'#DC2626':'#6B7280',fontWeight:over?700:400}}>{h||'–'}</td>
                        <td style={{color:'#6B7280',fontSize:11.5}}>{cnNgayTT(c)}</td>
                        <td style={{textAlign:'right',color:'#16A34A',fontWeight:700}}>{fmtV(cnThucThu(c))}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:cl>0?'#DC2626':cl<0?'#16A34A':'#9CA3AF'}}>{cl!==0?fmtV(Math.abs(cl)):'–'}</td>
                        <td style={{textAlign:'center'}}><span className="bh2-badge" style={{background:bd.bg,color:bd.c}}>{bd.t}</span></td>
                        <td style={{color:over?'#DC2626':'#9CA3AF',fontSize:11.5}}>{cnNgayQH(c)||'–'}</td>
                      </tr>
                    })}
                  </tbody>
                  {filtCN.length>0&&(
                    <tfoot>
                      <tr style={{background:'#EEF3FA',fontWeight:700}}>
                        <td colSpan={5} style={{padding:'8px 10px',fontSize:12}}>Tổng cộng</td>
                        <td style={{textAlign:'right',padding:'8px 10px',color:'#1C3557'}}>{fmtV(filtCN.reduce((s,c)=>s+cnPThu(c),0))}</td>
                        <td colSpan={2}/>
                        <td style={{textAlign:'right',padding:'8px 10px',color:'#16A34A'}}>{fmtV(filtCN.reduce((s,c)=>s+cnThucThu(c),0))}</td>
                        <td style={{textAlign:'right',padding:'8px 10px',color:'#DC2626'}}>{fmtV(filtCN.reduce((s,c)=>s+Math.max(0,cnCL(c)),0))}</td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
